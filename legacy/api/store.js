const crypto = require("crypto");
const { put } = require("@vercel/blob");
const { getPool, ensureDatabase, withTransaction } = require("./db");

const RESERVATION_TTL = 15 * 60;
const ALLOWED_STATUS = ["جديد", "قيد التجهيز", "جاهز للاستلام", "مكتمل", "ملغي"];

function json(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store");
  return res.json(body);
}

function cleanProduct(p) {
  const images = Array.isArray(p.images) && p.images.length
    ? p.images.map(String).filter(Boolean)
    : [String(p.image || "")].filter(Boolean);
  return {
    id: String(p.id || ""),
    name: String(p.name || ""),
    description: String(p.description || ""),
    unit: String(p.unit || ""),
    price: Number(p.price || 0),
    oldPrice: Number(p.oldPrice || 0),
    minQty: Math.max(1, Number(p.minQty || 1)),
    category: String(p.category || "أخرى"),
    stock: Math.max(0, Number(p.stock || 0)),
    sku: String(p.sku || ""),
    barcode: String(p.barcode || ""),
    active: p.active !== false,
    featured: Boolean(p.featured),
    sortOrder: Number(p.sortOrder || 0),
    lowStockThreshold: Math.max(0, Number(p.lowStockThreshold ?? 5)),
    comingSoon: Boolean(p.comingSoon),
    images,
    image: images[0] || ""
  };
}

function rowToProduct(row) {
  const images = Array.isArray(row.images) ? row.images.map(String).filter(Boolean) : [];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: Number(row.price),
    oldPrice: Number(row.old_price),
    minQty: Number(row.min_qty),
    category: row.category,
    stock: Math.max(0, Number(row.stock)),
    images,
    image: images[0] || "",
    sku: String(row.sku || ""),
    barcode: String(row.barcode || ""),
    active: row.active !== false,
    featured: Boolean(row.featured),
    sortOrder: Number(row.sort_order || 0),
    lowStockThreshold: Math.max(0, Number(row.low_stock_threshold ?? 5)),
    comingSoon: Boolean(row.coming_soon)
  };
}

function sessionSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PIN || "");
}

function signAdminSession(exp) {
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return payload + "." + signature;
}

function verifyAdminSession(token) {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req) {
  return verifyAdminSession(String(req.headers["x-admin-session"] || ""));
}

async function cleanupExpiredReservations() {
  return withTransaction(async client => {
    const { rows } = await client.query(
      "SELECT session_id FROM reservations WHERE expires_at <= NOW() FOR UPDATE"
    );
    for (const reservation of rows) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [reservation.session_id]);
      const items = await client.query(
        "SELECT product_id, qty FROM reservation_items WHERE session_id = $1 FOR UPDATE",
        [reservation.session_id]
      );
      for (const item of items.rows) {
        await client.query(
          "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
          [Number(item.qty), item.product_id]
        );
        await client.query(
          "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
          [item.product_id, Number(item.qty), "انتهاء حجز", reservation.session_id]
        );
      }
      await client.query("DELETE FROM reservations WHERE session_id = $1", [reservation.session_id]);
    }
  });
}

async function getProducts(includeInactive = false) {
  await ensureDatabase();
  await cleanupExpiredReservations();
  const db = getPool();
  const result = await db.query(
    includeInactive
      ? "SELECT * FROM products ORDER BY sort_order ASC, created_at DESC, id DESC"
      : "SELECT * FROM products WHERE active = TRUE ORDER BY featured DESC, sort_order ASC, created_at DESC, id DESC"
  );
  return result.rows.map(rowToProduct);
}

async function trackEvent(req, res) {
  const body = req.body || {};
  const type = String(body.type || "").trim();
  const allowed = new Set(["view", "favorite", "unfavorite", "share", "add_to_cart"]);
  if (!allowed.has(type)) return json(res, 400, { ok: false, message: "نوع إحصائية غير صالح" });
  const productId = String(body.productId || "").trim() || null;
  const sessionId = String(body.session || "").slice(0, 120) || null;
  try {
    await ensureDatabase();
    const db = getPool();
    await db.query(
      "INSERT INTO analytics_events(event_type, product_id, session_id, meta) VALUES($1,$2,$3,$4::jsonb)",
      [type, productId, sessionId, JSON.stringify({ source: String(body.source || "store").slice(0,40) })]
    );
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, message: "تعذر حفظ الإحصائية." });
  }
}

async function analytics(req, res) {
  if (!requireAdmin(req)) return json(res, 401, { ok: false, message: "غير مصرح" });
  try {
    await ensureDatabase();
    const db = getPool();
    const [summary, popular, favorites, movements, orderStats, stockStats] = await Promise.all([
      db.query("SELECT event_type, COUNT(*)::int AS count FROM analytics_events WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY event_type ORDER BY count DESC"),
      db.query("SELECT p.id,p.name,COUNT(*)::int AS views FROM analytics_events e JOIN products p ON p.id=e.product_id WHERE e.event_type='view' AND e.created_at >= NOW()-INTERVAL '30 days' GROUP BY p.id,p.name ORDER BY views DESC LIMIT 10"),
      db.query("SELECT p.id,p.name,COUNT(*)::int AS favorites FROM analytics_events e JOIN products p ON p.id=e.product_id WHERE e.event_type='favorite' AND e.created_at >= NOW()-INTERVAL '30 days' GROUP BY p.id,p.name ORDER BY favorites DESC LIMIT 10"),
      db.query("SELECT product_id,SUM(change_qty)::int AS net_change FROM inventory_movements WHERE created_at >= NOW()-INTERVAL '30 days' GROUP BY product_id ORDER BY ABS(SUM(change_qty)) DESC LIMIT 10"),
      db.query("SELECT COUNT(*)::int AS orders,COALESCE(SUM(total),0)::numeric AS revenue,COALESCE(SUM(CASE WHEN status='مكتمل' THEN total ELSE 0 END),0)::numeric AS completed_revenue,COALESCE(AVG(total),0)::numeric AS average_order,COUNT(*) FILTER (WHERE status='جديد')::int AS new_orders,COUNT(*) FILTER (WHERE status='قيد التجهيز')::int AS processing_orders,COUNT(*) FILTER (WHERE status='جاهز للاستلام')::int AS ready_orders FROM orders WHERE created_at >= NOW()-INTERVAL '30 days'"),
      db.query("SELECT COUNT(*)::int AS products,COALESCE(SUM(stock),0)::int AS units,COALESCE(SUM(stock*price),0)::numeric AS stock_value,COUNT(*) FILTER (WHERE stock<=low_stock_threshold)::int AS low_stock,COUNT(*) FILTER (WHERE stock=0)::int AS out_of_stock FROM products WHERE active=TRUE")
    ]);
    const rows = q => Array.isArray(q?.rows) ? q.rows : (Array.isArray(q) ? q : []);
    const summaryRows=rows(summary), popularRows=rows(popular), favoriteRows=rows(favorites), movementRows=rows(movements);
    const orderRow=rows(orderStats)[0] || {};
    const stockRow=rows(stockStats)[0] || {};
    return json(res, 200, {
      ok:true,
      periodDays:30,
      events:Object.fromEntries(summaryRows.map(x=>[x.event_type,Number(x.count||0)])),
      popular:popularRows.map(x=>({id:x.id,name:x.name,views:Number(x.views||0)})),
      favorites:favoriteRows.map(x=>({id:x.id,name:x.name,favorites:Number(x.favorites||0)})),
      inventoryMovements:movementRows.map(x=>({productId:x.product_id,netChange:Number(x.net_change||0)})),
      orders:{
        count:Number(orderRow.orders||0),
        revenue:Number(orderRow.revenue||0),
        completedRevenue:Number(orderRow.completed_revenue||0),
        averageOrder:Number(orderRow.average_order||0),
        newOrders:Number(orderRow.new_orders||0),
        processingOrders:Number(orderRow.processing_orders||0),
        readyOrders:Number(orderRow.ready_orders||0)
      },
      stock:{
        products:Number(stockRow.products||0),
        units:Number(stockRow.units||0),
        value:Number(stockRow.stock_value||0),
        lowStock:Number(stockRow.low_stock||0),
        outOfStock:Number(stockRow.out_of_stock||0)
      }
    });
  } catch(e) {
    return json(res, 500, { ok:false, message:e.message || "تعذر تحميل الإحصائيات." });
  }
}

async function uploadImage(req, res) {
  if (!requireAdmin(req)) return json(res, 401, { ok: false, message: "غير مصرح" });
  const body = req.body || {};
  const data = String(body.data || "");
  const contentType = String(body.contentType || "");
  const originalName = String(body.name || "product-image").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);

  if (!data || !contentType.startsWith("image/")) {
    return json(res, 400, { ok: false, message: "ملف صورة غير صالح" });
  }
  if (data.length > 3_000_000) {
    return json(res, 413, { ok: false, message: "الصورة كبيرة جدًا. اختر صورة أصغر." });
  }

  const buffer = Buffer.from(data, "base64");
  if (buffer.length > 2_200_000) {
    return json(res, 413, { ok: false, message: "حجم الصورة بعد الضغط كبير. أعد اختيارها." });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(res, 503, { ok: false, message: "تخزين الصور غير مفعّل. أضف BLOB_READ_WRITE_TOKEN في Vercel." });
  }

  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const pathname = "products/" + Date.now() + "-" + crypto.randomBytes(5).toString("hex") + "-" +
    originalName.replace(/\.[^.]+$/, "") + "." + ext;
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false
  });
  return json(res, 200, { ok: true, url: blob.url });
}

function adminLogin(req, res) {
  const pin = String(req.body?.pin || "");
  if (!process.env.ADMIN_PIN || pin !== String(process.env.ADMIN_PIN)) {
    return json(res, 401, { ok: false, message: "رمز الإدارة غير صحيح" });
  }
  const token = signAdminSession(Date.now() + 12 * 60 * 60 * 1000);
  return json(res, 200, { ok: true, token });
}

async function reserve(req, res) {
  const session = String(req.body?.session || "");
  const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!session) return json(res, 400, { ok: false, message: "جلسة السلة غير صالحة" });
  if (!incoming.length) return json(res, 400, { ok: false, message: "الطلبية فارغة" });

  try {
    const result = await withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [session]);

      const productsResult = await client.query("SELECT * FROM products WHERE active = TRUE ORDER BY id");
      const products = productsResult.rows.map(rowToProduct);
      const byId = new Map(products.map(p => [p.id, p]));

      const requestedMap = new Map();
      for (const item of incoming) {
        const p = byId.get(String(item.productId));
        const qty = Number(item.qty);
        if (!p || !Number.isInteger(qty) || qty < p.minQty || qty % p.minQty !== 0) {
          const error = new Error("كمية غير صالحة");
          error.status = 400;
          throw error;
        }
        requestedMap.set(p.id, (requestedMap.get(p.id) || 0) + qty);
      }

      const oldResult = await client.query(
        "SELECT product_id, qty FROM reservation_items WHERE session_id = $1",
        [session]
      );
      const oldMap = new Map(oldResult.rows.map(x => [x.product_id, Number(x.qty)]));
      const allIds = [...new Set([...requestedMap.keys(), ...oldMap.keys()])].sort();

      if (allIds.length) {
        await client.query("SELECT id FROM products WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE", [allIds]);
      }

      for (const id of allIds) {
        const desired = requestedMap.get(id) || 0;
        const oldQty = oldMap.get(id) || 0;
        const delta = desired - oldQty;
        if (delta > 0) {
          const updated = await client.query(
            "UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING stock",
            [delta, id]
          );
          if (!updated.rowCount) {
            const row = await client.query("SELECT stock FROM products WHERE id = $1", [id]);
            const available = row.rows[0] ? Number(row.rows[0].stock) : 0;
            const error = new Error("المخزون غير كافٍ. المتاح الآن: " + available);
            error.status = 409;
            throw error;
          }
          await client.query(
            "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
            [id, -delta, "حجز سلة", session]
          );
        } else if (delta < 0) {
          await client.query(
            "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
            [-delta, id]
          );
          await client.query(
            "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
            [id, -delta, "تخفيض حجز", session]
          );
        }
      }

      await client.query(
        "INSERT INTO reservations(session_id, expires_at) VALUES($1, NOW() + ($2 * INTERVAL '1 second')) ON CONFLICT(session_id) DO UPDATE SET expires_at = EXCLUDED.expires_at",
        [session, RESERVATION_TTL]
      );
      await client.query("DELETE FROM reservation_items WHERE session_id = $1", [session]);

      for (const [productId, qty] of requestedMap) {
        await client.query(
          "INSERT INTO reservation_items(session_id, product_id, qty) VALUES($1,$2,$3)",
          [session, productId, qty]
        );
      }

      return {
        items: [...requestedMap.entries()].map(([productId, qty]) => ({ productId, qty })),
        expiresAt: Date.now() + RESERVATION_TTL * 1000
      };
    });

    return json(res, 200, {
      ok: true,
      products: await getProducts(),
      reservation: { session, items: result.items, createdAt: Date.now(), expiresAt: result.expiresAt }
    });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, message: e.status ? e.message : "حدث خطأ في قاعدة البيانات." });
  }
}

async function reservation(req, res) {
  const session = String(req.query?.session || "");
  if (!session) return json(res, 400, { ok: false, message: "جلسة السلة غير صالحة" });
  try {
    await ensureDatabase();
    await cleanupExpiredReservations();
    const db = getPool();
    const result = await db.query(
      `SELECT r.session_id, r.created_at, r.expires_at,
              COALESCE(json_agg(json_build_object('productId', ri.product_id, 'qty', ri.qty)
                ORDER BY ri.product_id) FILTER (WHERE ri.product_id IS NOT NULL), '[]'::json) AS items
       FROM reservations r
       LEFT JOIN reservation_items ri ON ri.session_id = r.session_id
       WHERE r.session_id = $1 AND r.expires_at > NOW()
       GROUP BY r.session_id`,
      [session]
    );
    if (!result.rowCount) return json(res, 200, { ok: true, reservation: null });
    const row = result.rows[0];
    return json(res, 200, {
      ok: true,
      reservation: {
        session: row.session_id,
        createdAt: new Date(row.created_at).getTime(),
        expiresAt: new Date(row.expires_at).getTime(),
        items: (row.items || []).map(x => ({ productId: x.productId, qty: Number(x.qty) }))
      }
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, message: e.message || "تعذر استرجاع حجز الطلبية." });
  }
}

async function release(req, res) {
  const session = String(req.body?.session || "");
  if (!session) return json(res, 400, { ok: false, message: "جلسة السلة غير صالحة" });

  try {
    await withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [session]);
      const items = await client.query(
        "SELECT product_id, qty FROM reservation_items WHERE session_id = $1",
        [session]
      );
      for (const item of items.rows) {
        await client.query(
          "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
          [Number(item.qty), item.product_id]
        );
        await client.query(
          "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
          [item.product_id, Number(item.qty), "إلغاء الحجز", session]
        );
      }
      await client.query("DELETE FROM reservations WHERE session_id = $1", [session]);
    });
    return json(res, 200, { ok: true, products: await getProducts() });
  } catch {
    return json(res, 500, { ok: false, message: "تعذر تحرير الحجز." });
  }
}

async function createOrder(req, res) {
  await cleanupExpiredReservations();
  const session = String(req.body?.session || "");
  const c = req.body?.customer || {};
  const name = String(c.name || "").trim();
  const phone = String(c.phone || "").trim();
  const clientRef = String(req.body?.clientRef || "").trim().slice(0,120);
  if (!session) return json(res, 400, { ok: false, message: "جلسة السلة غير صالحة" });
  if (!name || !phone) return json(res, 400, { ok: false, message: "اسم المحل ورقم الهاتف مطلوبان" });

  try {
    const order = await withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [session]);
      if (clientRef) {
        const existing = await client.query(
          "SELECT id FROM orders WHERE client_ref = $1 LIMIT 1",
          [clientRef]
        );
        if (existing.rowCount) {
          const existingOrder = await client.query(
            `SELECT o.*, COALESCE(json_agg(json_build_object('productId',oi.product_id,'name',oi.name,'unit',oi.unit,'image',oi.image,'qty',oi.qty,'price',oi.price) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
             FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 GROUP BY o.id`,
            [existing.rows[0].id]
          );
          const o=existingOrder.rows[0];
          return {id:o.id,customer:o.customer,phone:o.phone,time:o.pickup_time,method:o.pickup_method,note:o.note,status:o.status,created:o.created_at,items:(o.items||[]).map(x=>({...x,qty:Number(x.qty),price:Number(x.price)})),total:Number(o.total)};
        }
      }
      const reservation = await client.query(
        "SELECT * FROM reservations WHERE session_id = $1 AND expires_at > NOW() FOR UPDATE",
        [session]
      );
      if (!reservation.rowCount) {
        const error = new Error("انتهت مدة حجز السلة، أعد إضافة المنتجات.");
        error.status = 409;
        throw error;
      }

      const itemResult = await client.query(
        `SELECT ri.product_id, ri.qty, p.name, p.unit, p.images, p.price
         FROM reservation_items ri
         JOIN products p ON p.id = ri.product_id
         WHERE ri.session_id = $1
         ORDER BY p.name`,
        [session]
      );
      if (!itemResult.rowCount) {
        const error = new Error("السلة فارغة.");
        error.status = 409;
        throw error;
      }

      const items = itemResult.rows.map(x => {
        const images = Array.isArray(x.images) ? x.images : [];
        return {
          productId: x.product_id,
          name: x.name,
          unit: x.unit,
          image: images[0] || "",
          qty: Number(x.qty),
          price: Number(x.price)
        };
      });
      const total = items.reduce((sum, x) => sum + x.price * x.qty, 0);
      const id = "AM-" + Date.now().toString(36).toUpperCase().slice(-7) + crypto.randomBytes(2).toString("hex").toUpperCase();

      await client.query(
        `INSERT INTO orders(id, customer, phone, pickup_time, pickup_method, note, status, total, client_ref)
         VALUES($1,$2,$3,$4,$5,$6,'جديد',$7,$8)`,
        [id, name, phone, String(c.time || ""), String(c.method || "استلام من المتجر"), String(c.note || ""), total, clientRef || null]
      );

      for (const item of items) {
        await client.query(
          "INSERT INTO order_items(order_id, product_id, name, unit, image, qty, price) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [id, item.productId, item.name, item.unit, item.image, item.qty, item.price]
        );
      }

      await client.query("DELETE FROM reservations WHERE session_id = $1", [session]);

      return {
        id, customer: name, phone,
        time: String(c.time || ""),
        method: String(c.method || "استلام من المتجر"),
        note: String(c.note || ""),
        status: "جديد",
        created: new Date().toISOString(),
        items, total
      };
    });

    return json(res, 200, { ok: true, order });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, message: e.status ? e.message : "تعذر إنشاء الطلب." });
  }
}

async function orderStatus(req, res) {
  const id = String(req.query?.id || "").trim();
  const phone = String(req.query?.phone || "").trim();
  if (!id || !phone) return json(res, 400, { ok:false, message:"رقم الطلب ورقم الهاتف مطلوبان." });
  try {
    await ensureDatabase();
    const db=getPool();
    const result=await db.query(
      `SELECT o.*, COALESCE(json_agg(json_build_object('productId',oi.product_id,'name',oi.name,'unit',oi.unit,'image',oi.image,'qty',oi.qty,'price',oi.price) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       WHERE o.id=$1 AND o.phone=$2 GROUP BY o.id`,
      [id,phone]
    );
    if(!result.rowCount)return json(res,404,{ok:false,message:"لم نجد طلبًا مطابقًا للبيانات."});
    const o=result.rows[0];
    return json(res,200,{ok:true,order:{id:o.id,customer:o.customer,phone:o.phone,time:o.pickup_time,method:o.pickup_method,note:o.note,status:o.status,created:o.created_at,total:Number(o.total),items:(o.items||[]).map(x=>({...x,qty:Number(x.qty),price:Number(x.price)}))}});
  } catch(e){return json(res,500,{ok:false,message:"تعذر البحث عن الطلب."})}
}

async function inventoryMovements(req,res){
  if(!requireAdmin(req))return json(res,401,{ok:false,message:"غير مصرح"});
  try{
    await ensureDatabase(); const db=getPool();
    const result=await db.query(`SELECT im.*,p.name FROM inventory_movements im LEFT JOIN products p ON p.id=im.product_id ORDER BY im.created_at DESC LIMIT 300`);
    return json(res,200,{ok:true,movements:result.rows.map(x=>({id:x.id,productId:x.product_id,name:x.name||x.product_id,changeQty:Number(x.change_qty),reason:x.reason,referenceId:x.reference_id,created:x.created_at}))});
  }catch(e){return json(res,500,{ok:false,message:"تعذر تحميل حركات المخزون."})}
}
async function getCategories() {
  await ensureDatabase();
  const db = getPool();
  const result = await db.query("SELECT id,name,sort_order,active,created_at FROM product_categories WHERE active=TRUE ORDER BY sort_order ASC,name ASC");
  return result.rows.map(x => ({id:String(x.id),name:String(x.name),sortOrder:Number(x.sort_order||0),active:Boolean(x.active)}));
}

async function adminCategories(req, res) {
  if (!requireAdmin(req)) return json(res, 401, { ok:false, message:"غير مصرح" });
  try {
    await ensureDatabase();
    const db=getPool();
    if(req.method==="GET") return json(res,200,{ok:true,categories:await getCategories()});
    const b=req.body||{}, action=String(b.action||"");
    if(action==="save"){
      const id=String(b.id||"").trim() || "cat-"+Date.now().toString(36);
      const name=String(b.name||"").trim().slice(0,80);
      const sortOrder=Number(b.sortOrder||0);
      if(!name)return json(res,400,{ok:false,message:"اسم التصنيف مطلوب"});
      const duplicate=await db.query("SELECT id FROM product_categories WHERE lower(name)=lower($1) AND id<>$2",[name,id]);
      if(duplicate.rowCount)return json(res,409,{ok:false,message:"هذا التصنيف موجود مسبقًا"});
      await db.query(`INSERT INTO product_categories(id,name,sort_order,active) VALUES($1,$2,$3,TRUE)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,active=TRUE`,[id,name,sortOrder]);
      return json(res,200,{ok:true,categories:await getCategories()});
    }
    if(action==="duplicate"){
      const id=String(b.id||"").trim(), source=await db.query("SELECT name,sort_order FROM product_categories WHERE id=$1",[id]);
      if(!source.rowCount)return json(res,404,{ok:false,message:"التصنيف غير موجود"});
      const base=String(source.rows[0].name||"نسخة"), name=String(b.name||"").trim() || (base+" — نسخة");
      const duplicate=await db.query("SELECT 1 FROM product_categories WHERE lower(name)=lower($1)",[name]);
      if(duplicate.rowCount)return json(res,409,{ok:false,message:"اسم النسخة موجود مسبقًا"});
      await db.query("INSERT INTO product_categories(id,name,sort_order,active) VALUES($1,$2,$3,TRUE)",["cat-"+Date.now().toString(36)+"-"+crypto.randomBytes(3).toString("hex"),name,Number(source.rows[0].sort_order||0)+1]);
      return json(res,200,{ok:true,categories:await getCategories()});
    }
    if(action==="delete"){
      const id=String(b.id||"").trim();
      const row=await db.query("SELECT name FROM product_categories WHERE id=$1",[id]);
      if(!row.rowCount)return json(res,404,{ok:false,message:"التصنيف غير موجود"});
      const used=await db.query("SELECT COUNT(*)::int AS count FROM products WHERE category=$1",[row.rows[0].name]);
      if(Number(used.rows[0].count)>0)return json(res,409,{ok:false,message:"لا يمكن حذف تصنيف مستخدم. غيّر تصنيف المنتجات أولًا."});
      await db.query("DELETE FROM product_categories WHERE id=$1",[id]);
      return json(res,200,{ok:true,categories:await getCategories()});
    }
    return json(res,400,{ok:false,message:"إجراء غير معروف"});
  } catch(e) { return json(res,e.status||500,{ok:false,message:e.message||"تعذر إدارة التصنيفات."}); }
}

async function adminPricePresets(req,res){
  if(!requireAdmin(req))return json(res,401,{ok:false,message:"غير مصرح"});
  try{
    await ensureDatabase(); const db=getPool();
    if(req.method==="GET"){
      const r=await db.query("SELECT id,label,amount,sort_order,active FROM price_presets WHERE active=TRUE ORDER BY sort_order ASC,amount ASC");
      return json(res,200,{ok:true,prices:r.rows.map(x=>({id:String(x.id),label:String(x.label),amount:Number(x.amount||0),sortOrder:Number(x.sort_order||0),active:Boolean(x.active)}))});
    }
    const b=req.body||{},action=String(b.action||"");
    if(action==="save"){
      const id=String(b.id||"").trim()||"price-"+Date.now().toString(36);
      const amount=Number(b.amount),label=String(b.label||"").trim()||String(amount);
      if(!Number.isFinite(amount)||amount<0)return json(res,400,{ok:false,message:"السعر غير صالح"});
      const dup=await db.query("SELECT id FROM price_presets WHERE lower(label)=lower($1) AND id<>$2",[label,id]);
      if(dup.rowCount)return json(res,409,{ok:false,message:"هذا السعر موجود مسبقًا"});
      await db.query(`INSERT INTO price_presets(id,label,amount,sort_order,active) VALUES($1,$2,$3,$4,TRUE)
        ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,amount=EXCLUDED.amount,sort_order=EXCLUDED.sort_order,active=TRUE`,[id,label,amount,Number(b.sortOrder||0)]);
      return json(res,200,{ok:true});
    }
    if(action==="delete"){
      await db.query("DELETE FROM price_presets WHERE id=$1",[String(b.id||"").trim()]);
      return json(res,200,{ok:true});
    }
    if(action==="duplicate"){
      const source=await db.query("SELECT label,amount,sort_order FROM price_presets WHERE id=$1",[String(b.id||"").trim()]);
      if(!source.rowCount)return json(res,404,{ok:false,message:"السعر غير موجود"});
      const label=String(b.label||"").trim()||source.rows[0].label+" — نسخة";
      await db.query("INSERT INTO price_presets(id,label,amount,sort_order,active) VALUES($1,$2,$3,$4,TRUE)",["price-"+Date.now().toString(36)+"-"+crypto.randomBytes(3).toString("hex"),label,Number(source.rows[0].amount),Number(source.rows[0].sort_order||0)+1]);
      return json(res,200,{ok:true});
    }
    return json(res,400,{ok:false,message:"إجراء غير معروف"});
  }catch(e){return json(res,e.status||500,{ok:false,message:e.message||"تعذر إدارة الأسعار."});}
}

async function adminSettings(req,res){
  if(!requireAdmin(req))return json(res,401,{ok:false,message:"غير مصرح"});
  try{
    await ensureDatabase(); const db=getPool();
    if(req.method==="GET"){
      const r=await db.query("SELECT key,value FROM store_settings");
      const settings=Object.fromEntries(r.rows.map(x=>[x.key,x.value]));
      return json(res,200,{ok:true,settings});
    }
    const b=req.body||{},key=String(b.key||"").trim();
    if(!key)return json(res,400,{ok:false,message:"الإعداد مفقود"});
    const value=Boolean(b.value);
    await db.query(`INSERT INTO store_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW())
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[key,JSON.stringify(value)]);
    return json(res,200,{ok:true,settings:{[key]:value}});
  }catch(e){return json(res,e.status||500,{ok:false,message:e.message||"تعذر حفظ الإعداد."});}
}

async function adminProducts(req, res) {
  if (!requireAdmin(req)) return json(res, 401, { ok: false, message: "غير مصرح" });
  try {
    await ensureDatabase();
    if (req.method === "GET") return json(res, 200, { ok: true, products: await getProducts(true) });

    const b = req.body || {};
    if (b.action === "saveProduct") {
      const p = cleanProduct(b.product || {});
      if (!p.id || !p.name || p.price <= 0) return json(res, 400, { ok: false, message: "بيانات المنتج ناقصة" });

      const result = await withTransaction(async client => {
        const previous = await client.query("SELECT stock FROM products WHERE id = $1 FOR UPDATE", [p.id]);
        const reservedResult = previous.rowCount
          ? await client.query(
              "SELECT COALESCE(SUM(qty),0)::int AS qty FROM reservation_items WHERE product_id = $1",
              [p.id]
            )
          : { rows: [{ qty: 0 }] };
        const reservedQty = Number(reservedResult.rows[0]?.qty || 0);
        if (previous.rowCount && p.stock < reservedQty) {
          const error = new Error("لا يمكن ضبط المخزون إلى أقل من الكمية المحجوزة حاليًا (" + reservedQty + "). حرر الحجوزات أولًا.");
          error.status = 409;
          throw error;
        }
        await client.query(
          `INSERT INTO products(id,name,description,unit,price,old_price,min_qty,category,stock,images,sku,barcode,active,featured,sort_order,low_stock_threshold,coming_soon)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT(id) DO UPDATE SET
             name=EXCLUDED.name, description=EXCLUDED.description, unit=EXCLUDED.unit,
             price=EXCLUDED.price, old_price=EXCLUDED.old_price, min_qty=EXCLUDED.min_qty,
             category=EXCLUDED.category, stock=EXCLUDED.stock, images=EXCLUDED.images,
             sku=EXCLUDED.sku, barcode=EXCLUDED.barcode, active=EXCLUDED.active,
             featured=EXCLUDED.featured, sort_order=EXCLUDED.sort_order, low_stock_threshold=EXCLUDED.low_stock_threshold, coming_soon=EXCLUDED.coming_soon, updated_at=NOW()`,
          [p.id,p.name,p.description,p.unit,p.price,p.oldPrice,p.minQty,p.category,p.stock,JSON.stringify(p.images),p.sku,p.barcode,p.active,p.featured,p.sortOrder,p.lowStockThreshold,p.comingSoon]
        );
        const oldStock = previous.rowCount ? Number(previous.rows[0].stock) : 0;
        const delta = p.stock - oldStock;
        if (delta !== 0) {
          await client.query(
            "INSERT INTO inventory_movements(product_id, change_qty, reason) VALUES($1,$2,$3)",
            [p.id, delta, previous.rowCount ? "تعديل مخزون من الإدارة" : "إضافة منتج"]
          );
        }
        return { previousStock: oldStock };
      });

      return json(res, 200, { ok: true, products: await getProducts(), previousStock: result.previousStock });
    }

    if (b.action === "bulkPrice") {
      const ids = Array.isArray(b.ids) ? b.ids.map(x=>String(x||"").trim()).filter(Boolean).slice(0,200) : [];
      const mode = String(b.mode||"direct");
      const value = Number(b.value);
      const saveOld = Boolean(b.saveOldPrice);
      if(!ids.length || !Number.isFinite(value) || value<0)return json(res,400,{ok:false,message:"بيانات التسعير غير صالحة"});
      if(!["direct","add","subtract","percentAdd","percentSubtract"].includes(mode))return json(res,400,{ok:false,message:"طريقة تسعير غير صالحة"});
      let updated=0;
      await withTransaction(async client=>{
        for(const id of ids){
          const row=await client.query("SELECT price,old_price FROM products WHERE id=$1 FOR UPDATE",[id]);
          if(!row.rowCount)continue;
          const old=Number(row.rows[0].price||0);
          let next=mode==="direct"?value:mode==="add"?old+value:mode==="subtract"?old-value:mode==="percentAdd"?old*(1+value/100):old*(1-value/100);
          next=Math.max(0,Math.round(next*100)/100);
          await client.query("UPDATE products SET price=$1,old_price=$2,updated_at=NOW() WHERE id=$3",[next,saveOld?old:Number(row.rows[0].old_price||0),id]);
          updated++;
        }
      });
      return json(res,200,{ok:true,updated,products:await getProducts(true)});
    }

    if (b.action === "deleteProduct") {
      const id = String(b.id || "");
      if (!id) return json(res, 400, { ok: false, message: "معرف المنتج مفقود" });

      await withTransaction(async client => {
        const reserved = await client.query(
          "SELECT COALESCE(SUM(qty),0)::int AS qty FROM reservation_items WHERE product_id = $1",
          [id]
        );
        if (Number(reserved.rows[0].qty) > 0) {
          const error = new Error("لا يمكن حذف منتج محجوز حاليًا. حرر الحجوزات أولًا.");
          error.status = 409;
          throw error;
        }
        await client.query("DELETE FROM products WHERE id = $1", [id]);
      });

      return json(res, 200, { ok: true, products: await getProducts() });
    }

    return json(res, 400, { ok: false, message: "إجراء غير معروف" });
  } catch (e) {
    console.error(e);
    return json(res, e.status || 500, { ok: false, message: e.status ? e.message : (e.message || "حدث خطأ في قاعدة البيانات.") });
  }
}

async function adminOrders(req, res) {
  if (!requireAdmin(req)) return json(res, 401, { ok: false, message: "غير مصرح" });
  try {
    await ensureDatabase();

    if (req.method === "GET") {
      const db = getPool();
      const result = await db.query(
        `SELECT o.*,
          COALESCE(json_agg(
            json_build_object(
              'productId', oi.product_id, 'name', oi.name, 'unit', oi.unit,
              'image', oi.image, 'qty', oi.qty, 'price', oi.price
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT 200`
      );
      const orders = result.rows.map(o => ({
        id: o.id, customer: o.customer, phone: o.phone,
        time: o.pickup_time, method: o.pickup_method, note: o.note,
        status: o.status, created: o.created_at, total: Number(o.total),
        items: (o.items || []).map(x => ({ ...x, qty: Number(x.qty), price: Number(x.price) }))
      }));
      return json(res, 200, { ok: true, orders });
    }

    const b = req.body || {};
    if (b.action === "bulkStatus") {
      const ids = Array.isArray(b.ids) ? b.ids.map(x => String(x || "").trim()).filter(Boolean).slice(0, 100) : [];
      const status = String(b.status || "");
      if (!ids.length) return json(res, 400, { ok: false, message: "اختر طلبًا واحدًا على الأقل." });
      if (!ALLOWED_STATUS.includes(status)) return json(res, 400, { ok: false, message: "حالة غير صالحة" });
      let updated = 0;
      await withTransaction(async client => {
        for (const id of ids) {
          const current = await client.query("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [id]);
          if (!current.rowCount) continue;
          const oldStatus = current.rows[0].status;
          if (oldStatus !== "ملغي" && status === "ملغي") {
            const items = await client.query("SELECT product_id, qty FROM order_items WHERE order_id = $1", [id]);
            for (const item of items.rows) {
              await client.query("UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2", [Number(item.qty), item.product_id]);
              await client.query("INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)", [item.product_id, Number(item.qty), "إلغاء طلب", id]);
            }
          } else if (oldStatus === "ملغي" && status !== "ملغي") {
            const items = await client.query("SELECT product_id, qty FROM order_items WHERE order_id = $1", [id]);
            for (const item of items.rows) {
              const updatedRow = await client.query("UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING id", [Number(item.qty), item.product_id]);
              if (!updatedRow.rowCount) {
                const error = new Error("لا يوجد مخزون كافٍ لإعادة تفعيل الطلب " + id);
                error.status = 409;
                throw error;
              }
              await client.query("INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)", [item.product_id, -Number(item.qty), "إعادة تفعيل طلب ملغي", id]);
            }
          }
          await client.query("UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
          updated++;
        }
      });
      return json(res, 200, { ok: true, updated });
    }
    if (b.action === "deleteOrder") {
      const id = String(b.id || "").trim();
      if (!id) return json(res, 400, { ok: false, message: "معرف الطلب مفقود" });

      await withTransaction(async client => {
        const current = await client.query(
          "SELECT status FROM orders WHERE id = $1 FOR UPDATE",
          [id]
        );
        if (!current.rowCount) {
          const error = new Error("الطلب غير موجود");
          error.status = 404;
          throw error;
        }

        const status = String(current.rows[0].status || "");
        // Cancelled orders already returned their stock.
        // Completed orders are finalized sales and must not restore stock.
        if (!["ملغي", "مكتمل"].includes(status)) {
          const items = await client.query(
            "SELECT product_id, qty FROM order_items WHERE order_id = $1",
            [id]
          );
          for (const item of items.rows) {
            await client.query(
              "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
              [Number(item.qty), item.product_id]
            );
            await client.query(
              "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
              [item.product_id, Number(item.qty), "حذف طلب", id]
            );
          }
        }

        await client.query("DELETE FROM order_items WHERE order_id = $1", [id]);
        await client.query("DELETE FROM orders WHERE id = $1", [id]);
      });

      return json(res, 200, { ok: true, deleted: id });
    }

    if (b.action !== "status") return json(res, 400, { ok: false, message: "إجراء غير معروف" });
    const id = String(b.id || "");
    const status = String(b.status || "");
    if (!ALLOWED_STATUS.includes(status)) return json(res, 400, { ok: false, message: "حالة غير صالحة" });

    await withTransaction(async client => {
      const current = await client.query("SELECT status FROM orders WHERE id = $1 FOR UPDATE", [id]);
      if (!current.rowCount) {
        const error = new Error("الطلب غير موجود");
        error.status = 404;
        throw error;
      }

      const oldStatus = current.rows[0].status;
      if (oldStatus !== "ملغي" && status === "ملغي") {
        const items = await client.query("SELECT product_id, qty FROM order_items WHERE order_id = $1", [id]);
        for (const item of items.rows) {
          await client.query(
            "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
            [Number(item.qty), item.product_id]
          );
          await client.query(
            "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
            [item.product_id, Number(item.qty), "إلغاء طلب", id]
          );
        }
      } else if (oldStatus === "ملغي" && status !== "ملغي") {
        const items = await client.query("SELECT product_id, qty FROM order_items WHERE order_id = $1", [id]);
        for (const item of items.rows) {
          const updated = await client.query(
            "UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING id",
            [Number(item.qty), item.product_id]
          );
          if (!updated.rowCount) {
            const error = new Error("لا يوجد مخزون كافٍ لإعادة تفعيل الطلب.");
            error.status = 409;
            throw error;
          }
          await client.query(
            "INSERT INTO inventory_movements(product_id, change_qty, reason, reference_id) VALUES($1,$2,$3,$4)",
            [item.product_id, -Number(item.qty), "إعادة تفعيل طلب ملغي", id]
          );
        }
      }

      await client.query("UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
    });

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, e.status || 500, { ok: false, message: e.status ? e.message : "حدث خطأ في قاعدة البيانات." });
  }
}

module.exports = async function handler(req, res) {
  try {
    const a = String(req.query?.action || "");
    if (a === "admin-login" && req.method === "POST") return adminLogin(req, res);
    if (a === "upload-image" && req.method === "POST") return uploadImage(req, res);
    if (a === "products" && req.method === "GET") { const products = await getProducts(); const db=getPool(); const s=await db.query("SELECT key,value FROM store_settings"); return json(res,200,{ok:true,products,settings:Object.fromEntries(s.rows.map(x=>[x.key,x.value]))}); }
    if (a === "reserve" && req.method === "POST") return reserve(req, res);
    if (a === "release" && req.method === "POST") return release(req, res);
    if (a === "reservation" && req.method === "GET") return reservation(req, res);
    if (a === "order" && req.method === "POST") return createOrder(req, res);
    if (a === "order-status" && req.method === "GET") return orderStatus(req, res);
    if (a === "admin-products") return adminProducts(req, res);
    if (a === "admin-categories") return adminCategories(req,res);
    if (a === "admin-settings") return adminSettings(req,res);
    if (a === "admin-price-presets") return adminPricePresets(req,res);
    if (a === "admin-orders") return adminOrders(req, res);
    if (a === "inventory-movements" && req.method === "GET") return inventoryMovements(req, res);
    if (a === "track" && req.method === "POST") return trackEvent(req, res);
    if (a === "analytics" && req.method === "GET") return analytics(req, res);
    if (a === "health" && req.method === "GET") {
      const started = Date.now();
      const db = getPool();
      await ensureDatabase();
      await db.query("SELECT 1 AS ok");
      return json(res, 200, {
        ok: true,
        database: "postgresql",
        databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
        blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        adminConfigured: Boolean(process.env.ADMIN_PIN),
        latencyMs: Date.now() - started
      });
    }
    return json(res, 404, { ok: false, message: "المسار غير موجود" });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, message: e.message || "حدث خطأ في الخادم." });
  }
};
