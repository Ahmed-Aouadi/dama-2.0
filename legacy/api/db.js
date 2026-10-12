const fs = require("fs");
const path = require("path");
const { Pool } = require("@neondatabase/serverless");

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL غير مضبوط في Vercel. أضف رابط PostgreSQL الخاص بـ Neon إلى Environment Variables ثم أعد النشر.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000
    });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  old_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'أخرى',
  stock INTEGER NOT NULL DEFAULT 0,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  coming_soon BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_presets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  session_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS reservation_items (
  session_id TEXT NOT NULL REFERENCES reservations(session_id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (session_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  pickup_time TEXT NOT NULL DEFAULT '',
  pickup_method TEXT NOT NULL DEFAULT 'استلام من المتجر',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'جديد',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL CHECK (qty > 0),
  price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  change_qty INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  product_id TEXT,
  session_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_product ON analytics_events(product_id, created_at DESC);

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS coming_soon BOOLEAN NOT NULL DEFAULT FALSE;
INSERT INTO store_settings(key,value) VALUES ('comingSoonEnabled','true'::jsonb) ON CONFLICT (key) DO NOTHING;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref ON orders(client_ref) WHERE client_ref IS NOT NULL;
`;

async function ensureDatabase() {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aminstore_schema_v1'))");
    await client.query(SCHEMA);

    const count = await client.query("SELECT COUNT(*)::int AS count FROM products");
    if (count.rows[0].count === 0) {
      const file = path.join(process.cwd(), "amine_wholesale_store_v2", "assets", "products.json");
      const seed = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const raw of seed) {
        const images = Array.isArray(raw.images) && raw.images.length
          ? raw.images.map(String).filter(Boolean)
          : [String(raw.image || "")].filter(Boolean);
        await client.query(
          `INSERT INTO products
           (id,name,description,unit,price,old_price,min_qty,category,stock,images)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(raw.id || ""),
            String(raw.name || ""),
            String(raw.description || ""),
            String(raw.unit || ""),
            Number(raw.price || 0),
            Number(raw.oldPrice || 0),
            Math.max(1, Number(raw.minQty || 1)),
            String(raw.category || "أخرى"),
            Math.max(0, Number(raw.stock || 0)),
            JSON.stringify(images)
          ]
        );
      }
    }
    await client.query("INSERT INTO product_categories(id,name,sort_order) VALUES('cat-other','أخرى',999) ON CONFLICT(name) DO NOTHING");
    const categoryRows = await client.query("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND TRIM(category) <> '' ORDER BY category");
    for (const row of categoryRows.rows) {
      const name = String(row.category || '').trim();
      if (!name) continue;
      await client.query(
        `INSERT INTO product_categories(id,name,sort_order) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`,
        ['cat-' + Buffer.from(name).toString('hex').slice(0, 24), name, 0]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return db;
}

async function withTransaction(fn) {
  const db = await ensureDatabase();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { getPool, ensureDatabase, withTransaction };
