const { Pool } = require("@neondatabase/serverless");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
let pool;
let schemaReady;

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL غير مضبوط في إعدادات Vercel.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000 });
  return pool;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async function () {
      const statements = [
        "CREATE TABLE IF NOT EXISTS mada_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS mada_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS mada_sessions_user_idx ON mada_sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS mada_sessions_expiry_idx ON mada_sessions(expires_at)",
        "CREATE TABLE IF NOT EXISTS mada_user_data (user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE, data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS mada_login_attempts (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS mada_public_designs (design_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, design JSONB NOT NULL, is_public BOOLEAN NOT NULL DEFAULT FALSE, price_dzd INTEGER NOT NULL DEFAULT 0 CHECK (price_dzd >= 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS mada_public_designs_owner_idx ON mada_public_designs(user_id)",
        "CREATE TABLE IF NOT EXISTS mada_public_portfolios (user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE, username TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, portfolio JSONB NOT NULL DEFAULT '{}'::jsonb, is_public BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS mada_public_portfolios_public_idx ON mada_public_portfolios(is_public, username)",
        "CREATE TABLE IF NOT EXISTS mada_collaboration_requests (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, recipient_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, title TEXT NOT NULL, request_type TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (sender_id <> recipient_id))",
        "CREATE INDEX IF NOT EXISTS mada_collaboration_recipient_idx ON mada_collaboration_requests(recipient_id,status,created_at DESC)",
        "CREATE INDEX IF NOT EXISTS mada_collaboration_sender_idx ON mada_collaboration_requests(sender_id,created_at DESC)",
        "CREATE TABLE IF NOT EXISTS mada_site_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS mada_admin_user_flags (user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE, disabled BOOLEAN NOT NULL DEFAULT FALSE, disabled_until TIMESTAMPTZ, note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "ALTER TABLE mada_admin_user_flags ADD COLUMN IF NOT EXISTS disabled_until TIMESTAMPTZ"
      ];
      for (const statement of statements) await db().query(statement);
      for (const [key, value] of [["registrationsEnabled", true], ["publicGalleryEnabled", true], ["publicDesignsEnabled", true], ["maintenanceMode", false]]) await db().query("INSERT INTO mada_site_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING", [key, JSON.stringify(value)]);
    })().catch(function (error) { schemaReady = null; throw error; });
  }
  return schemaReady;
}

function send(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  if (!item) return "";
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return ""; }
}

function cookieHeader(token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return "mada_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + maxAge + secure;
}

function publicUser(row) {
  return { id: row.id, username: row.username, name: row.display_name, createdAt: row.created_at };
}

function normalizeUsername(value) {
  return String(value || "").normalize("NFC").trim().toLocaleLowerCase("und");
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, 64);
  return { encoded: salt + ":" + Buffer.from(derived).toString("hex"), salt };
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const derived = Buffer.from(await scrypt(password, parts[0], 64));
  const expected = Buffer.from(parts[1], "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function safeOrigin(req) {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers.host || "").split(",")[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host && (process.env.NODE_ENV === "production" ? parsed.protocol === "https:" : ["https:", "http:"].includes(parsed.protocol));
  } catch { return false; }
}

function ipHash(req) {
  const ip = String(req.headers["x-real-ip"] || req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  return crypto.createHash("sha256").update(ip + (process.env.SESSION_SECRET || process.env.DATABASE_URL || "mada")).digest("hex");
}

async function currentUser(req) {
  const token = cookieValue(req, "mada_session");
  if (!token || token.length < 40) return null;
  const result = await db().query(
    "SELECT u.id,u.username,u.display_name,u.created_at FROM mada_sessions s JOIN mada_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND NOT EXISTS (SELECT 1 FROM mada_admin_user_flags f WHERE f.user_id=u.id AND f.disabled=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
    [crypto.createHash("sha256").update(token).digest("hex")]
  );
  return result.rows[0] || null;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const maxAge = 60 * 60 * 24 * 30;
  await db().query("INSERT INTO mada_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+($3 * INTERVAL '1 second'))", [hash, userId, maxAge]);
  return { token, maxAge };
}

module.exports = async function handler(req, res) {
  try {
    const action = String(req.query?.action || req.body?.action || "");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.end();
    }
    if (!["GET", "POST"].includes(req.method)) return send(res, 405, { error: "طريقة الطلب غير مدعومة." }, { Allow: "GET, POST, OPTIONS" });
    if (req.method === "POST" && !safeOrigin(req)) return send(res, 403, { error: "مصدر الطلب غير مسموح." });
    if (req.method === "POST" && !(req.headers["content-type"] || "").toLowerCase().includes("application/json")) return send(res, 415, { error: "أرسل البيانات بصيغة JSON." });
    if (req.method === "POST") {
      const declaredLength = Number(req.headers["content-length"] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > 4 * 1024 * 1024) return send(res, 413, { error: "حجم الطلب أكبر من الحد المسموح (4 ميغابايت)." });
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return send(res, 400, { error: "جسم الطلب يجب أن يكون كائن JSON صالحًا." });
      let bodySize = 0;
      try { bodySize = Buffer.byteLength(JSON.stringify(req.body || {}), "utf8"); } catch { return send(res, 400, { error: "بيانات الطلب غير صالحة." }); }
      if (bodySize > 4 * 1024 * 1024) return send(res, 413, { error: "حجم الطلب أكبر من الحد المسموح (4 ميغابايت)." });
    }
    const allowedActions = new Set(["register", "login", "profile", "account-settings", "delete-account", "logout", "me", "publish-design", "public-design", "sync-portfolio-projects", "publish-portfolio", "public-portfolio", "collaboration-create", "collaboration-list", "collaboration-update", "data"]);
    if (!allowedActions.has(action)) return send(res, 400, { error: "طلب غير معروف." });
    const methodsByAction = { register: ["POST"], login: ["POST"], profile: ["POST"], "account-settings": ["POST"], "delete-account": ["POST"], logout: ["POST"], me: ["GET"], "publish-design": ["POST"], "public-design": ["GET"], "sync-portfolio-projects": ["POST"], "publish-portfolio": ["POST"], "public-portfolio": ["GET"], "collaboration-create": ["POST"], "collaboration-list": ["GET"], "collaboration-update": ["POST"], data: ["GET", "POST"] };
    if (!methodsByAction[action].includes(req.method)) return send(res, 405, { error: "طريقة الطلب غير مسموحة لهذا الإجراء." }, { Allow: methodsByAction[action].join(", ") });
    await ensureSchema();
    if (req.method === "POST" && !["register", "login"].includes(action)) {
      const rateKey = "api:" + action + ":" + ipHash(req);
      const rate = await db().query("INSERT INTO mada_login_attempts(ip_hash,attempts,window_started_at) VALUES($1,1,NOW()) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN mada_login_attempts.window_started_at < NOW()-INTERVAL '5 minutes' THEN 1 ELSE mada_login_attempts.attempts+1 END, window_started_at=CASE WHEN mada_login_attempts.window_started_at < NOW()-INTERVAL '5 minutes' THEN NOW() ELSE mada_login_attempts.window_started_at END RETURNING attempts", [rateKey]);
      if (Number(rate.rows[0]?.attempts || 0) > 240) return send(res, 429, { error: "طلبات كثيرة خلال وقت قصير. انتظر بضع دقائق ثم حاول مجددًا." }, { "Retry-After": "300" });
    }

    if (action === "register" && req.method === "POST") {
      const registrationSetting = await db().query("SELECT value FROM mada_site_settings WHERE key=$1", ["registrationsEnabled"]);
      if (registrationSetting.rows[0] && registrationSetting.rows[0].value === false) return send(res, 403, { error: "التسجيلات الجديدة متوقفة مؤقتًا. يمكنك تسجيل الدخول إلى حساب موجود." });
      const regIp = "reg:" + ipHash(req);
      const regGate = await db().query("INSERT INTO mada_login_attempts(ip_hash,attempts,window_started_at) VALUES($1,1,NOW()) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN mada_login_attempts.window_started_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE mada_login_attempts.attempts+1 END, window_started_at=CASE WHEN mada_login_attempts.window_started_at < NOW()-INTERVAL '1 hour' THEN NOW() ELSE mada_login_attempts.window_started_at END RETURNING attempts", [regIp]);
      if (regGate.rows[0].attempts > 8) return send(res, 429, { error: "تم إنشاء عدد كبير من الحسابات من هذا الاتصال. حاول لاحقًا." });
      const username = normalizeUsername(req.body?.username);
      const name = String(req.body?.name || "").normalize("NFC").trim();
      const password = String(req.body?.password || "");
      if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) return send(res, 400, { error: "اسم المستخدم يجب أن يكون من 3 إلى 24 حرفًا أو رقمًا، ويمكن استخدام _ . -" });
      if (name.length < 2 || name.length > 60) return send(res, 400, { error: "اكتب اسمًا من حرفين إلى 60 حرفًا." });
      if (password.length < 8 || password.length > 128) return send(res, 400, { error: "كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا." });
      const hashed = await hashPassword(password);
      const id = crypto.randomUUID();
      try {
        const result = await db().query("INSERT INTO mada_users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4) RETURNING id,username,display_name,created_at", [id, username, name, hashed.encoded]);
        const session = await createSession(id);
        return send(res, 201, { ok: true, user: publicUser(result.rows[0]) }, { "Set-Cookie": cookieHeader(session.token, session.maxAge) });
      } catch (error) {
        if (error.code === "23505") return send(res, 409, { error: "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر." });
        throw error;
      }
    }

    if (action === "login" && req.method === "POST") {
      const ip = ipHash(req);
      const gate = await db().query(
        "INSERT INTO mada_login_attempts(ip_hash,attempts,window_started_at) VALUES($1,1,NOW()) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN mada_login_attempts.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE mada_login_attempts.attempts+1 END, window_started_at=CASE WHEN mada_login_attempts.window_started_at < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE mada_login_attempts.window_started_at END RETURNING attempts",
        [ip]
      );
      if (gate.rows[0].attempts > 10) return send(res, 429, { error: "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا." });
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || "");
      if (password.length > 128) return send(res, 400, { error: "كلمة المرور لا يمكن أن تتجاوز 128 حرفًا." });
      const result = await db().query("SELECT id,username,display_name,password_hash,created_at FROM mada_users WHERE username=$1 LIMIT 1", [username]);
      const user = result.rows[0];
      const valid = user ? await verifyPassword(password, user.password_hash) : false;
      if (!valid) return send(res, 401, { error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
      await db().query("DELETE FROM mada_login_attempts WHERE ip_hash=$1", [ip]);
      const adminFlag = await db().query("SELECT disabled,disabled_until FROM mada_admin_user_flags WHERE user_id=$1", [user.id]);
      const flag = adminFlag.rows[0];
      if (flag?.disabled && (!flag.disabled_until || new Date(flag.disabled_until).getTime() > Date.now())) return send(res, 403, { error: "تم إيقاف هذا الحساب مؤقتًا أو إداريًا. تواصل مع إدارة مَدى." });
      const session = await createSession(user.id);
      return send(res, 200, { ok: true, user: publicUser(user) }, { "Set-Cookie": cookieHeader(session.token, session.maxAge) });
    }

    if (action === "profile" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول أولًا." });
      const name = String(req.body?.name || "").normalize("NFC").trim();
      if (name.length < 2 || name.length > 70) return send(res, 400, { error: "اسم العرض يجب أن يكون من حرفين إلى 70 حرفًا." });
      const result = await db().query("UPDATE mada_users SET display_name=$1 WHERE id=$2 RETURNING id,username,display_name,created_at", [name, user.id]);
      return send(res, 200, { ok: true, user: publicUser(result.rows[0]) });
    }

    if (action === "account-settings" && req.method === "POST") {
      const sessionToken = cookieValue(req, "mada_session");
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "انتهت الجلسة. سجّل الدخول مجددًا." });
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      const username = normalizeUsername(req.body?.username || user.username);
      const name = String(req.body?.name || user.display_name).normalize("NFC").trim();
      if (!currentPassword || currentPassword.length > 128) return send(res, 400, { error: "أدخل كلمة المرور الحالية لتأكيد التغييرات." });
      if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) return send(res, 400, { error: "اسم المستخدم يجب أن يكون من 3 إلى 24 حرفًا أو رقمًا، ويمكن استخدام _ . -" });
      if (name.length < 2 || name.length > 70) return send(res, 400, { error: "اسم العرض يجب أن يكون من حرفين إلى 70 حرفًا." });
      if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) return send(res, 400, { error: "كلمة المرور الجديدة يجب أن تكون من 8 إلى 128 حرفًا." });
      const check = await db().query("SELECT password_hash FROM mada_users WHERE id=$1 LIMIT 1", [user.id]);
      if (!check.rows[0] || !(await verifyPassword(currentPassword, check.rows[0].password_hash))) return send(res, 401, { error: "كلمة المرور الحالية غير صحيحة." });
      const values = [username, name, user.id];
      try {
        let result;
        if (newPassword) {
          const hashed = await hashPassword(newPassword);
          result = await db().query("UPDATE mada_users SET username=$1,display_name=$2,password_hash=$4 WHERE id=$3 RETURNING id,username,display_name,created_at", [username, name, user.id, hashed.encoded]);
        } else {
          result = await db().query("UPDATE mada_users SET username=$1,display_name=$2 WHERE id=$3 RETURNING id,username,display_name,created_at", values);
        }
        if (newPassword) {
          await db().query("DELETE FROM mada_sessions WHERE user_id=$1 AND token_hash<>$2", [user.id, crypto.createHash("sha256").update(sessionToken).digest("hex")]);
        }
        await db().query("UPDATE mada_public_portfolios SET username=$2 WHERE user_id=$1", [user.id, username]);
        return send(res, 200, { ok: true, passwordChanged: !!newPassword, user: publicUser(result.rows[0]) });
      } catch (error) {
        if (error.code === "23505") return send(res, 409, { error: "اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر." });
        throw error;
      }
    }

    if (action === "delete-account" && req.method === "POST") {
      const token = cookieValue(req, "mada_session");
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "انتهت الجلسة. سجّل الدخول مجددًا." });
      const password = String(req.body?.password || "");
      if (!password || password.length > 128) return send(res, 400, { error: "أدخل كلمة المرور لتأكيد حذف الحساب." });
      const result = await db().query("SELECT password_hash FROM mada_users WHERE id=$1 LIMIT 1", [user.id]);
      if (!result.rows[0] || !(await verifyPassword(password, result.rows[0].password_hash))) return send(res, 401, { error: "كلمة المرور غير صحيحة؛ لم يتم حذف الحساب." });
      await db().query("DELETE FROM mada_users WHERE id=$1", [user.id]);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
    }

    if (action === "logout" && req.method === "POST") {
      const token = cookieValue(req, "mada_session");
      if (token) await db().query("DELETE FROM mada_sessions WHERE token_hash=$1", [crypto.createHash("sha256").update(token).digest("hex")]);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
    }

    if (action === "me" && req.method === "GET") {
      const user = await currentUser(req);
      if (!user) return send(res, 200, { user: null });
      return send(res, 200, { user: publicUser(user) });
    }

    if (action === "publish-design" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول لنشر القالب." });
      const design = req.body?.design;
      const designId = String(req.body?.designId || "").trim();
      const isPublic = req.body?.isPublic === true;
      const priceDzd = Math.max(0, Math.min(1000000, Math.floor(Number(req.body?.priceDzd) || 0)));
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(designId)) return send(res, 400, { error: "معرّف المشاركة غير صالح." });
      if (!design || typeof design !== "object" || Array.isArray(design)) return send(res, 400, { error: "بيانات القالب غير صالحة." });
      const encoded = JSON.stringify(design);
      if (encoded.length > 120000) return send(res, 413, { error: "القالب كبير جدًا للنشر." });
      const result = await db().query(
        "INSERT INTO mada_public_designs(design_id,user_id,design,is_public,price_dzd,updated_at) VALUES($1,$2,$3::jsonb,$4,$5,NOW()) ON CONFLICT(design_id) DO UPDATE SET design=EXCLUDED.design,is_public=EXCLUDED.is_public,price_dzd=EXCLUDED.price_dzd,updated_at=NOW() WHERE mada_public_designs.user_id=EXCLUDED.user_id RETURNING design_id,is_public,price_dzd",
        [designId, user.id, encoded, isPublic, priceDzd]
      );
      if (!result.rows[0]) return send(res, 403, { error: "لا يمكنك تعديل رابط مشاركة لا تملكه." });
      return send(res, 200, { ok: true, designId: result.rows[0].design_id, isPublic: result.rows[0].is_public, priceDzd: result.rows[0].price_dzd });
    }

    if (action === "public-design" && req.method === "GET") {
      const siteFlags = await db().query("SELECT key,value FROM mada_site_settings WHERE key=$1 OR key=$2", ["publicDesignsEnabled", "maintenanceMode"]);
      const siteFlagMap = Object.fromEntries(siteFlags.rows.map(row => [row.key, row.value]));
      if (siteFlagMap.publicDesignsEnabled === false || siteFlagMap.maintenanceMode === true) return send(res, 404, { error: "روابط التصميمات العامة متوقفة مؤقتًا." });
      const designId = String(req.query?.id || "").trim();
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(designId)) return send(res, 400, { error: "رابط القالب غير صالح." });
      const result = await db().query(
        "SELECT d.design,d.price_dzd,u.display_name FROM mada_public_designs d JOIN mada_users u ON u.id=d.user_id LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE d.design_id=$1 AND d.is_public=TRUE AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
        [designId]
      );
      if (!result.rows[0]) return send(res, 404, { error: "هذا القالب غير منشور أو تم جعله خاصًا." });
      const row = result.rows[0];
      const design = row.design && typeof row.design === "object" ? row.design : {};
      const paid = Number(row.price_dzd) > 0;
      return send(res, 200, { ok: true, paid, priceDzd: Number(row.price_dzd), authorName: row.display_name, design: paid ? { name: design.name, title: design.title, subtitle: design.subtitle, author: design.author, color: design.color, kind: design.kind } : design });
    }


    if (action === "sync-portfolio-projects" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "انتهت الجلسة. سجّل الدخول مجددًا." });
      const result = await db().query("SELECT portfolio FROM mada_public_portfolios WHERE user_id=$1 LIMIT 1", [user.id]);
      if (!result.rows[0]) return send(res, 200, { ok: true, published: false });
      const sourceProjects = Array.isArray(req.body?.projects) ? req.body.projects : [];
      const safeUrl = value => { const raw = String(value || "").trim(); if (!raw) return ""; try { const parsed = new URL(raw); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href.slice(0, 2000) : ""; } catch { return ""; } }; const safeTemplateUrl = value => { const raw = String(value || "").trim(); if (!raw || raw.length > 400000) return ""; try { const parsed = new URL(raw); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : ""; } catch { return ""; } };
      const safeImage = value => { const raw = String(value || "").trim(); if (!raw) return ""; if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(raw) && raw.length < 240000) return raw; return safeUrl(raw); }; const safeMedia = (value, kind) => { const raw = String(value || "").trim(); if (!raw) return ""; const rules = { video: /^data:video\/(?:mp4|webm|ogg);base64,/i, file: /^data:(?:application\/(?:pdf|zip|octet-stream|vnd\.[a-z0-9.+-]+)|text\/plain|image\/(?:png|jpeg|webp));base64,/i }; return rules[kind] && rules[kind].test(raw) && raw.length < 1000000 ? raw : safeUrl(raw); };
      const projects = sourceProjects.filter(p => p && typeof p === "object").slice(0, 80).map(p => ({
        id: String(p.id || crypto.randomUUID()).slice(0, 100), title: String(p.title || "عمل بدون عنوان").slice(0, 90),
        category: String(p.category || "other").slice(0, 30), status: String(p.status || "done").slice(0, 30),
        description: String(p.description || "").slice(0, 1600), role: String(p.role || "").slice(0, 140),
        tools: String(p.tools || "").slice(0, 300), tags: String(p.tags || "").slice(0, 350), outcome: String(p.outcome || "").slice(0, 800),
        workType: String(p.workType || "general").slice(0, 30), link: safeUrl(p.link), cover: safeImage(p.cover), mediaImages: Array.isArray(p.mediaImages) ? p.mediaImages.slice(0, 12).map(safeImage).filter(Boolean) : [], uploadedImages: Array.isArray(p.uploadedImages) ? p.uploadedImages.slice(0, 8).map(safeImage).filter(Boolean) : [],
        videoUrl: safeUrl(p.videoUrl), uploadedVideo: safeMedia(p.uploadedVideo, "video"), fileUrl: safeUrl(p.fileUrl), uploadedFile: safeMedia(p.uploadedFile, "file"), showFileDownload: p.showFileDownload === true, downloadableItems: Array.isArray(p.downloadableItems) ? p.downloadableItems.filter(key => typeof key === "string" && /^(cover|uploaded-image-\d+|linked-image-\d+|file|video|link)$/.test(key)).slice(0, 40) : null, allowTemplateUse: p.allowTemplateUse === true, templateUrl: p.allowTemplateUse === true ? safeTemplateUrl(p.templateUrl) : "", created: String(p.created || "").slice(0, 40), featured: Boolean(p.featured), visibility: "profile"
      }));
      const existing = result.rows[0].portfolio && typeof result.rows[0].portfolio === "object" ? result.rows[0].portfolio : {};
      const portfolio = { ...existing, projects, publishedAt: new Date().toISOString() };
      const encoded = JSON.stringify(portfolio);
      if (encoded.length > 3500000) return send(res, 413, { error: "المعرض كبير جدًا للتحديث. قلّل حجم الوسائط أو استخدم روابط مباشرة للملفات والصور." });
      await db().query("UPDATE mada_public_portfolios SET portfolio=$2::jsonb,updated_at=NOW() WHERE user_id=$1", [user.id, encoded]);
      return send(res, 200, { ok: true, published: true });
    }
    if (action === "publish-portfolio" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول أولًا لنشر معرض أعمالك." });
      const source = req.body?.portfolio;
      const isPublic = req.body?.isPublic === true;
      if (!source || typeof source !== "object" || Array.isArray(source)) return send(res, 400, { error: "بيانات المعرض غير صالحة." });
      const safeUrl = value => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try { const parsed = new URL(raw); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href.slice(0, 2000) : ""; } catch { return ""; }
      };
      const safeTemplateUrl = value => { const raw = String(value || "").trim(); if (!raw || raw.length > 400000) return ""; try { const parsed = new URL(raw); return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : ""; } catch { return ""; } };
      const safeImage = value => {
        const raw = String(value || "").trim();
        if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(raw) && raw.length < 240000) return raw;
        return safeUrl(raw);
      }; const safeMedia = (value, kind) => { const raw = String(value || "").trim(); if (!raw) return ""; const rules = { video: /^data:video\/(?:mp4|webm|ogg);base64,/i, file: /^data:(?:application\/(?:pdf|zip|octet-stream|vnd\.[a-z0-9.+-]+)|text\/plain|image\/(?:png|jpeg|webp));base64,/i }; return rules[kind] && rules[kind].test(raw) && raw.length < 1000000 ? raw : safeUrl(raw); };
      const profileSource = source.profile && typeof source.profile === "object" ? source.profile : {};
      const profile = {
        name: String(profileSource.name || user.display_name).slice(0, 70),
        role: String(profileSource.role || "").slice(0, 90),
        bio: String(profileSource.bio || "").slice(0, 800),
        skills: String(profileSource.skills || "").slice(0, 400),
        city: String(profileSource.city || "").slice(0, 100),
        education: String(profileSource.education || "").slice(0, 140),
        experience: String(profileSource.experience || "").slice(0, 180),
        goal: String(profileSource.goal || "").slice(0, 240),
        interests: String(profileSource.interests || "").slice(0, 400),
        link: safeUrl(profileSource.link),
        avatar: /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(String(profileSource.avatar || profileSource.photo || "")) && String(profileSource.avatar || profileSource.photo).length < 180000 ? String(profileSource.avatar || profileSource.photo) : ""
      };
      const projectSource = Array.isArray(source.projects) ? source.projects : [];
      const projects = projectSource.filter(p => p && typeof p === "object" && (p.galleryVisible === true || (p.galleryVisible !== false && p.visibility !== "private"))).slice(0, 80).map(p => ({
        id: String(p.id || crypto.randomUUID()).slice(0, 100),
        title: String(p.title || "عمل بدون عنوان").slice(0, 90),
        category: String(p.category || "other").slice(0, 30), gallerySection: String(p.gallerySection || "").normalize("NFC").trim().slice(0, 50), workType: String(p.workType || "general").slice(0, 30),
        status: String(p.status || "done").slice(0, 30),
        description: String(p.description || "").slice(0, 1600),
        role: String(p.role || "").slice(0, 140),
        tools: String(p.tools || "").slice(0, 300),
        tags: String(p.tags || "").slice(0, 350),
        outcome: String(p.outcome || "").slice(0, 800),
        link: safeUrl(p.link),
        cover: /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(String(p.cover || "")) && String(p.cover).length < 240000 ? String(p.cover) : safeUrl(p.cover),
        mediaImages: Array.isArray(p.mediaImages) ? p.mediaImages.slice(0, 12).map(safeImage).filter(Boolean) : [], uploadedImages: Array.isArray(p.uploadedImages) ? p.uploadedImages.slice(0, 8).map(safeImage).filter(Boolean) : [],
        videoUrl: safeUrl(p.videoUrl), uploadedVideo: safeMedia(p.uploadedVideo, "video"),
        fileUrl: safeUrl(p.fileUrl), uploadedFile: safeMedia(p.uploadedFile, "file"), showFileDownload: p.showFileDownload === true, downloadableItems: Array.isArray(p.downloadableItems) ? p.downloadableItems.filter(key => typeof key === "string" && /^(cover|uploaded-image-\d+|linked-image-\d+|file|video|link)$/.test(key)).slice(0, 40) : null, allowTemplateUse: p.allowTemplateUse === true, templateUrl: p.allowTemplateUse === true ? safeTemplateUrl(p.templateUrl) : "",
        created: String(p.created || "").slice(0, 40),
        featured: Boolean(p.featured),
        visibility: "profile"
      }));
      const displaySource = source.display && typeof source.display === "object" ? source.display : {};
      const validHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
      const display = {
        template: ["classic", "editorial", "minimal", "mosaic"].includes(displaySource.template) ? displaySource.template : "classic",
        accent: validHex(displaySource.accent, "#5b46e6"),
        background: validHex(displaySource.background, "#f6f4ff"),
        profileBackground: validHex(displaySource.profileBackground, "#17152b"),
        profileNameColor: validHex(displaySource.profileNameColor, "#ffffff"),
        profileKickerColor: validHex(displaySource.profileKickerColor, "#a79bff"),
        profileRoleColor: validHex(displaySource.profileRoleColor, "#d4d0e5"),
        profileBioColor: validHex(displaySource.profileBioColor, "#c8c4db"),
        profileMetaColor: validHex(displaySource.profileMetaColor, "#eeebfa"),
        profileFontFamily: ["system", "cairo", "tajawal", "almarai", "amiri", "reemkufi", "elmessiri", "serif", "mono"].includes(displaySource.profileFontFamily) ? displaySource.profileFontFamily : "tajawal",
        profileNameSize: Math.max(22, Math.min(64, Number(displaySource.profileNameSize) || 38)),
        profileBodySize: Math.max(11, Math.min(24, Number(displaySource.profileBodySize) || 16)),
        profileAvatarSize: Math.max(56, Math.min(200, Number(displaySource.profileAvatarSize) || 112)),
        profileCardRadius: Math.max(0, Math.min(48, Number.isFinite(Number(displaySource.profileCardRadius)) ? Number(displaySource.profileCardRadius) : 28)),
        profileCardPadding: Math.max(12, Math.min(64, Number(displaySource.profileCardPadding) || 36)),
        profileCardGap: Math.max(0, Math.min(56, Number.isFinite(Number(displaySource.profileCardGap)) ? Number(displaySource.profileCardGap) : 25)),
        profileCardBorderColor: validHex(displaySource.profileCardBorderColor, "#ffffff"),
        profileCardBorderWidth: Math.max(0, Math.min(6, Number(displaySource.profileCardBorderWidth) || 0)),
        profileCardShadow: ["none", "soft", "strong"].includes(displaySource.profileCardShadow) ? displaySource.profileCardShadow : "soft",
        profileTextAlign: ["right", "center", "left"].includes(displaySource.profileTextAlign) ? displaySource.profileTextAlign : "right",
        profileNameWeight: ["600", "700", "800", "900"].includes(String(displaySource.profileNameWeight)) ? String(displaySource.profileNameWeight) : "700",
        profileShowDecoration: displaySource.profileShowDecoration !== false,
        profileShowKicker: displaySource.profileShowKicker !== false,
        textColor: validHex(displaySource.textColor, "#17152b"),
        headingColor: validHex(displaySource.headingColor, "#5b46e6"),
        cardStyle: ["rounded", "square", "shadow"].includes(displaySource.cardStyle) ? displaySource.cardStyle : "rounded",
        columns: Math.max(2, Math.min(4, Number(displaySource.columns) || 3)),
        title: String(displaySource.title || "الأعمال المختارة").slice(0, 90),
        subtitle: String(displaySource.subtitle || "").slice(0, 220),
        sectionOrder: displaySource.sectionOrder === "works-first" ? "works-first" : "profile-first",
        showRole: displaySource.showRole !== false, showBio: displaySource.showBio !== false,
        showAvatar: displaySource.showAvatar !== false, showSkills: displaySource.showSkills !== false,
        showCity: displaySource.showCity !== false, showEducation: displaySource.showEducation !== false,
        showExperience: displaySource.showExperience === true, showGoal: displaySource.showGoal === true,
        showInterests: displaySource.showInterests === true, showProfileLink: displaySource.showProfileLink === true,
        featuredOnly: displaySource.featuredOnly === true, showSectionTitle: displaySource.showSectionTitle !== false,
        showWorkCount: displaySource.showWorkCount !== false, showWorkType: displaySource.showWorkType !== false,
        gallerySections: (() => {
          const sourceSections = Array.isArray(displaySource.gallerySections) ? displaySource.gallerySections : [];
          const sections = sourceSections.filter(section => section && typeof section === "object" && !Array.isArray(section)).slice(0, 40).map(section => {
            const id = String(section.id || "").normalize("NFC").trim().slice(0, 50);
            return {
              id,
              name: String(section.name || "قسم").normalize("NFC").trim().slice(0, 60) || "قسم",
              description: String(section.description || "").normalize("NFC").trim().slice(0, 180),
              visible: id === "general" ? true : section.visible !== false,
              locked: id === "general" ? true : section.locked === true
            };
          }).filter(section => section.id);
          let general = sections.find(section => section.id === "general");
          if (!general) {
            general = { id: "general", name: "أعمال عامة", description: "أعمال لم تُسند إلى قسم محدد", visible: true, locked: true };
            sections.unshift(general);
          } else {
            general.visible = true;
            general.locked = true;
            sections.splice(sections.indexOf(general), 1);
            sections.unshift(general);
          }
          return sections;
        })(),
        defaultGallerySection: (() => {
          const wanted = String(displaySource.defaultGallerySection || "general").slice(0, 50);
          const sections = Array.isArray(displaySource.gallerySections) ? displaySource.gallerySections : [];
          return wanted === "general" || sections.some(section => section && String(section.id) === wanted) ? wanted : "general";
        })(),
        showWorkCategory: displaySource.showWorkCategory !== false, showWorkStatus: displaySource.showWorkStatus !== false,
        showWorkRole: displaySource.showWorkRole !== false, showWorkTools: displaySource.showWorkTools !== false,
        showWorkTags: displaySource.showWorkTags !== false, showWorkOutcome: displaySource.showWorkOutcome !== false,
        showWorkDescription: displaySource.showWorkDescription !== false,
        contactPhone: String(displaySource.contactPhone || "").replace(/[^+0-9().\-\s]/g, "").trim().slice(0, 40),
        contactWhatsapp: String(displaySource.contactWhatsapp || "").replace(/\D/g, "").slice(0, 20),
        contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(displaySource.contactEmail || "").trim()) ? String(displaySource.contactEmail).trim().slice(0, 254) : "",
        showContactPhone: displaySource.showContactPhone === true,
        showContactWhatsapp: displaySource.showContactWhatsapp === true,
        showContactEmail: displaySource.showContactEmail === true,
        contactOrder: Array.isArray(displaySource.contactOrder) ? ["phone", "whatsapp", "email"].filter(key => displaySource.contactOrder.includes(key)) : ["phone", "whatsapp", "email"],
        contactButtonColor: validHex(displaySource.contactButtonColor, "#5b46e6"),
        contactButtonTextColor: validHex(displaySource.contactButtonTextColor, "#ffffff"),
        contactButtonSize: ["compact", "normal", "large"].includes(displaySource.contactButtonSize) ? displaySource.contactButtonSize : "normal",
        contactButtonPosition: ["right", "center", "left"].includes(displaySource.contactButtonPosition) ? displaySource.contactButtonPosition : "right",
        cardBackground: validHex(displaySource.cardBackground, "#ffffff"),
        cardRadius: Math.max(0, Math.min(32, Number(displaySource.cardRadius) || 20)),
        density: ["compact", "comfortable", "spacious"].includes(displaySource.density) ? displaySource.density : "comfortable",
        heroStyle: ["dark", "light", "accent"].includes(displaySource.heroStyle) ? displaySource.heroStyle : "dark",
        pattern: ["none", "dots", "grid"].includes(displaySource.pattern) ? displaySource.pattern : "none",
        brandText: String(displaySource.brandText || "معرض أعمال شخصي · مَدى").slice(0, 90),
        cardImageRatio: ["landscape", "classic", "square"].includes(displaySource.cardImageRatio) ? displaySource.cardImageRatio : "landscape",
        cardHover: displaySource.cardHover !== false,
        contentWidth: ["narrow", "standard", "wide"].includes(displaySource.contentWidth) ? displaySource.contentWidth : "wide",
        cardShadow: ["none", "soft", "strong"].includes(displaySource.cardShadow) ? displaySource.cardShadow : "soft",
        borderStyle: ["none", "subtle", "contrast"].includes(displaySource.borderStyle) ? displaySource.borderStyle : "subtle",
        avatarShape: ["circle", "rounded", "square"].includes(displaySource.avatarShape) ? displaySource.avatarShape : "rounded",
        heroAlign: ["right", "center", "left"].includes(displaySource.heroAlign) ? displaySource.heroAlign : "right",
        sectionSpacing: Math.max(16, Math.min(80, Number(displaySource.sectionSpacing) || 32)),
        fontFamily: ["system", "cairo", "tajawal", "almarai", "amiri", "reemkufi", "elmessiri", "serif", "mono"].includes(displaySource.fontFamily) ? displaySource.fontFamily : "tajawal",
        nameSize: Math.max(22, Math.min(64, Number(displaySource.nameSize) || 38)),
        bodySize: Math.max(12, Math.min(24, Number(displaySource.bodySize) || 16)),
        sectionTitleSize: Math.max(18, Math.min(48, Number(displaySource.sectionTitleSize) || 30)),
        textAlign: ["right", "center", "left"].includes(displaySource.textAlign) ? displaySource.textAlign : "right",
        profileLayout: ["side", "stacked", "centered"].includes(displaySource.profileLayout) ? displaySource.profileLayout : "side",
        backgroundImage: safeUrl(displaySource.backgroundImage)
      };
      const portfolio = { profile, projects, display, publishedAt: new Date().toISOString() };
      const encoded = JSON.stringify(portfolio);
      if (encoded.length > 3500000) return send(res, 413, { error: "المعرض كبير جدًا للنشر. قلّل حجم الوسائط أو استخدم روابط مباشرة للملفات والصور." });
      const slug = crypto.randomBytes(12).toString("base64url");
      const result = await db().query(
        "INSERT INTO mada_public_portfolios(user_id,username,slug,portfolio,is_public,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username,portfolio=EXCLUDED.portfolio,is_public=EXCLUDED.is_public,updated_at=NOW() RETURNING username,slug,is_public,updated_at",
        [user.id, user.username, slug, encoded, isPublic]
      );
      return send(res, 200, { ok: true, username: result.rows[0].username, slug: result.rows[0].slug, isPublic: result.rows[0].is_public, updatedAt: result.rows[0].updated_at, shareUrl: "/portfolio.html?id=" + encodeURIComponent(result.rows[0].slug) });
    }

    if (action === "public-portfolio" && req.method === "GET") {
      const siteFlags = await db().query("SELECT key,value FROM mada_site_settings WHERE key=$1 OR key=$2", ["publicGalleryEnabled", "maintenanceMode"]);
      const siteFlagMap = Object.fromEntries(siteFlags.rows.map(row => [row.key, row.value]));
      if (siteFlagMap.publicGalleryEnabled === false || siteFlagMap.maintenanceMode === true) return send(res, 404, { error: "المعارض العامة متوقفة مؤقتًا." });
      const slug = String(req.query?.id || "").trim();
      if (!/^[A-Za-z0-9_-]{12,80}$/.test(slug)) return send(res, 400, { error: "رابط المعرض غير صالح." });
      const result = await db().query(
        "SELECT u.username,p.slug,p.portfolio,u.display_name FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE p.slug=$1 AND p.is_public=TRUE AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
        [slug]
      );
      if (!result.rows[0]) return send(res, 404, { error: "هذا المعرض غير منشور أو أصبح خاصًا." });
      return send(res, 200, { ok: true, username: result.rows[0].username, slug: result.rows[0].slug, authorName: result.rows[0].display_name, portfolio: result.rows[0].portfolio });
    }


    if (action === "collaboration-create" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول لإرسال طلب تعاون فعلي. يمكنك حفظ مسودة محلية دون تسجيل الدخول." });
      const recipientUsername = String(req.body?.recipientUsername || "").trim().toLowerCase();
      const title = String(req.body?.title || "").normalize("NFC").trim();
      const requestType = String(req.body?.requestType || "تعاون على مشروع").normalize("NFC").trim();
      const message = String(req.body?.message || "").normalize("NFC").trim();
      if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(recipientUsername)) return send(res, 400, { error: "أدخل اسم مستخدم صحيحًا في مَدى (3 إلى 24 حرفًا)." });
      if (title.length < 3 || title.length > 120) return send(res, 400, { error: "عنوان الطلب يجب أن يكون بين 3 و120 حرفًا." });
      if (!requestType || requestType.length > 60) return send(res, 400, { error: "نوع الطلب غير صالح." });
      if (message.length < 10 || message.length > 1500) return send(res, 400, { error: "تفاصيل الطلب يجب أن تكون بين 10 و1500 حرف." });
      const recipient = await db().query("SELECT u.id,u.username FROM mada_users u LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE LOWER(u.username)=LOWER($1) AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1", [recipientUsername]);
      if (!recipient.rows[0]) return send(res, 404, { error: "لم نعثر على حساب نشط بهذا الاسم." });
      if (recipient.rows[0].id === user.id) return send(res, 400, { error: "لا يمكنك إرسال طلب تعاون إلى حسابك نفسه." });
      const duplicate = await db().query("SELECT id FROM mada_collaboration_requests WHERE sender_id=$1 AND recipient_id=$2 AND status='pending' AND created_at>NOW()-INTERVAL '30 days' LIMIT 1", [user.id, recipient.rows[0].id]);
      if (duplicate.rows[0]) return send(res, 409, { error: "لديك طلب تعاون معلّق لهذا الحساب بالفعل." });
      const id = crypto.randomBytes(18).toString("base64url");
      const created = await db().query("INSERT INTO mada_collaboration_requests(id,sender_id,recipient_id,title,request_type,message) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,title,request_type,message,status,created_at", [id,user.id,recipient.rows[0].id,title,requestType,message]);
      return send(res, 201, { ok: true, request: Object.assign({}, created.rows[0], { recipientUsername: recipient.rows[0].username, direction: "outgoing" }) });
    }

    if (action === "collaboration-list" && req.method === "GET") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول لعرض طلبات التعاون." });
      const result = await db().query(
        "SELECT r.id,r.title,r.request_type,r.message,r.status,r.created_at,r.updated_at,s.username AS sender_username,s.display_name AS sender_name,t.username AS recipient_username,t.display_name AS recipient_name,CASE WHEN r.recipient_id=$1 THEN 'incoming' ELSE 'outgoing' END AS direction FROM mada_collaboration_requests r JOIN mada_users s ON s.id=r.sender_id JOIN mada_users t ON t.id=r.recipient_id WHERE r.sender_id=$1 OR r.recipient_id=$1 ORDER BY r.created_at DESC LIMIT 100",
        [user.id]
      );
      return send(res, 200, { ok: true, requests: result.rows });
    }

    if (action === "collaboration-update" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول لإدارة طلبات التعاون." });
      const id = String(req.body?.id || "").trim();
      const status = String(req.body?.status || "").trim();
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(id) || !["accepted", "declined", "cancelled"].includes(status)) return send(res, 400, { error: "بيانات تحديث الطلب غير صالحة." });
      let result;
      if (status === "cancelled") {
        result = await db().query("UPDATE mada_collaboration_requests SET status='cancelled',updated_at=NOW() WHERE id=$1 AND sender_id=$2 AND status='pending' RETURNING id,status", [id,user.id]);
      } else {
        result = await db().query("UPDATE mada_collaboration_requests SET status=$3,updated_at=NOW() WHERE id=$1 AND recipient_id=$2 AND status='pending' RETURNING id,status", [id,user.id,status]);
      }
      if (!result.rows[0]) return send(res, 404, { error: "الطلب غير موجود أو لا تملك صلاحية تحديثه أو أنه لم يعد معلّقًا." });
      return send(res, 200, { ok: true, request: result.rows[0] });
    }

    if (action === "data" && req.method === "GET") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "سجّل الدخول أولًا." });
      const result = await db().query("SELECT data FROM mada_user_data WHERE user_id=$1", [user.id]);
      return send(res, 200, { data: result.rows[0]?.data ?? null });
    }

    if (action === "data" && req.method === "POST") {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "انتهت الجلسة. سجّل الدخول مجددًا." });
      const data = req.body?.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return send(res, 400, { error: "بيانات الحساب غير صالحة." });
      const encoded = JSON.stringify(data);
      if (encoded.length > 3000000) return send(res, 413, { error: "البيانات كبيرة جدًا للحفظ." });
      await db().query("INSERT INTO mada_user_data(user_id,data,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()", [user.id, encoded]);
      return send(res, 200, { ok: true, savedAt: new Date().toISOString() });
    }

    return send(res, 400, { error: "طلب غير معروف." });
  } catch (error) {
    console.error("Mada account API error:", error?.message || error);
    return send(res, 500, { error: "حدث خطأ في الخادم. تحقق من إعدادات قاعدة البيانات ثم أعد المحاولة." });
  }
};

// Allow portfolio JSON with uploaded media while staying within Vercel's function payload limits.
module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
