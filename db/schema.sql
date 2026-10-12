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
  low_stock_threshold INTEGER NOT NULL DEFAULT 5
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_ref TEXT
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

ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref ON orders(client_ref) WHERE client_ref IS NOT NULL;
