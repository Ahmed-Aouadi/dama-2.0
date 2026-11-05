const { put } = require("@vercel/blob");
const { Pool } = require("@neondatabase/serverless");
const crypto = require("node:crypto");

const MAX_BYTES = 50 * 1024 * 1024;
let pool;

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL غير مضبوط.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}
function json(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}
function sessionCookie(request) {
  const item = String(request.headers.cookie || "").split(";").map(value => value.trim()).find(value => value.startsWith("mada_session="));
  try { return item ? decodeURIComponent(item.slice("mada_session=".length)) : ""; } catch (_) { return ""; }
}
function allowedOrigin(request) {
  const origin = String(request.headers.origin || "");
  const host = String(request.headers.host || "").split(",")[0].trim().toLowerCase();
  try {
    const url = new URL(origin);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    return Boolean(origin && url.host.toLowerCase() === host && (local ? ["http:", "https:"].includes(url.protocol) : url.protocol === "https:"));
  } catch (_) { return false; }
}
async function hasActiveSession(request) {
  const token = sessionCookie(request);
  if (token.length < 40) return false;
  const result = await db().query(
    "SELECT u.id FROM mada_sessions s JOIN mada_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND NOT EXISTS (SELECT 1 FROM mada_admin_user_flags f WHERE f.user_id=u.id AND f.disabled=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
    [crypto.createHash("sha256").update(token).digest("hex")]
  );
  return result.rows[0]?.id || "";
}
function isAllowedType(type) {
  const normalized = String(type || "application/octet-stream").toLowerCase().split(";")[0].trim();
  const allowed = new Set([
    "application/octet-stream", "application/pdf", "application/zip", "application/rtf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
    "video/mp4", "video/webm", "audio/mpeg", "audio/ogg", "audio/wav",
    "text/plain", "text/csv", "text/markdown", "font/woff", "font/woff2"
  ]);
  return allowed.has(normalized) || /^application\/vnd\.[a-z0-9.+-]+$/.test(normalized);
}
async function readBody(request) {
  const maxBody = MAX_BYTES + 256 * 1024;
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > maxBody) {
    const error = new Error("حجم الملف أكبر من 50 ميغابايت");
    error.statusCode = 413;
    throw error;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBody) {
      const error = new Error("حجم الملف أكبر من 50 ميغابايت");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}
function parseMultipart(body, contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] || match?.[2];
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary}`);
  let start = body.indexOf(marker);
  while (start !== -1) {
    const headerStart = start + marker.length + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;
    const headers = body.subarray(headerStart, headerEnd).toString("utf8");
    const next = body.indexOf(marker, headerEnd + 4);
    if (next === -1) break;
    const content = body.subarray(headerEnd + 4, Math.max(headerEnd + 4, next - 2));
    const name = headers.match(/name="([^"]+)"/i)?.[1];
    if (name === "file") {
      return {
        buffer: content,
        type: headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || "application/octet-stream",
        name: headers.match(/filename="([^"]*)"/i)?.[1] || "portfolio-file"
      };
    }
    start = next;
  }
  return null;
}

module.exports = async function uploadHandler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "الطريقة غير مدعومة" });
  try {
    if (!allowedOrigin(request)) return json(response, 403, { error: "مصدر الطلب غير مسموح." });
    const ownerId = await hasActiveSession(request);\n    if (!ownerId) return json(response, 401, { error: "سجّل الدخول أولًا." });

    const contentType = String(request.headers["content-type"] || "");
    const body = await readBody(request);
    let file;
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      file = parseMultipart(body, contentType);
    } else {
      const payload = JSON.parse(body.toString("utf8"));
      const data = String(payload.data || "");
      const match = data.match(/^data:([^;]+);base64,(.+)$/s);
      file = match ? { buffer: Buffer.from(match[2], "base64"), type: match[1].toLowerCase(), name: payload.name || "portfolio-file" } : null;
    }
    file = file && {
      ...file,
      type: String(file.type || "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream"
    };
    if (!file || !isAllowedType(file.type)) return json(response, 400, { error: "صيغة الملف غير مدعومة" });
    if (!file.buffer.length || file.buffer.length > MAX_BYTES) return json(response, 413, { error: "حجم الملف أكبر من 50 ميغابايت" });
    const safeName = String(file.name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 90) || "portfolio-file";
    const blob = await put(`portfolio/${Date.now()}-${safeName}`, file.buffer, {
      access: "private",
      contentType: file.type,
      addRandomSuffix: true
    });
    await db().query("CREATE TABLE IF NOT EXISTS mada_private_files (pathname TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");\n    await db().query("INSERT INTO mada_private_files(pathname,user_id) VALUES($1,$2) ON CONFLICT(pathname) DO UPDATE SET user_id=EXCLUDED.user_id", [blob.pathname, ownerId]);\n    return json(response, 200, { url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}`, pathname: blob.pathname });
  } catch (error) {
    console.error("[mada] upload error:", error?.message || error);
    return json(response, error.statusCode || 500, {
      error: error.statusCode === 413 ? error.message : "تعذّر رفع الملف. حاول مرة أخرى."
    });
  }
};
