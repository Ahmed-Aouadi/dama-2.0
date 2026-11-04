const { put } = require("@vercel/blob");

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/ogg",
  "application/pdf", "application/zip", "application/octet-stream"
]);

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

module.exports = async function uploadHandler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "الطريقة غير مدعومة" });
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const type = String(body.type || "").toLowerCase();
    const data = String(body.data || "");
    const match = data.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match || !ALLOWED_TYPES.has(type) || match[1].toLowerCase() !== type) return json(response, 400, { error: "صيغة الملف غير مدعومة" });
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > MAX_BYTES) return json(response, 413, { error: "حجم الملف أكبر من الحد المسموح" });
    const safeName = String(body.name || "portfolio-file").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 90) || "portfolio-file";
    const blob = await put(`portfolio/${Date.now()}-${safeName}`, buffer, { access: "private", contentType: type, addRandomSuffix: true });
    return json(response, 200, { url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}`, pathname: blob.pathname });
  } catch (error) {
    console.error("[mada] upload error:", error);
    return json(response, 500, { error: "تعذّر رفع الملف. حاول مرة أخرى." });
  }
};
