const { put } = require("@vercel/blob");

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
  "application/pdf", "application/zip", "application/octet-stream",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function parseMultipart(body, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
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
    if (name === "file") return { buffer: content, type: headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || "application/octet-stream", name: headers.match(/filename="([^"]*)"/i)?.[1] || "portfolio-file" };
    start = next;
  }
  return null;
}

module.exports = async function uploadHandler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "الطريقة غير مدعومة" });
  try {
    const contentType = String(request.headers["content-type"] || "").toLowerCase();
    const body = await readBody(request);
    let file;
    if (contentType.startsWith("multipart/form-data")) file = parseMultipart(body, contentType);
    else {
      const payload = JSON.parse(body.toString("utf8"));
      const data = String(payload.data || "");
      const match = data.match(/^data:([^;]+);base64,(.+)$/s);
      file = match ? { buffer: Buffer.from(match[2], "base64"), type: match[1].toLowerCase(), name: payload.name || "portfolio-file" } : null;
    }
    if (!file || !ALLOWED_TYPES.has(file.type)) return json(response, 400, { error: "صيغة الملف غير مدعومة" });
    if (!file.buffer.length || file.buffer.length > MAX_BYTES) return json(response, 413, { error: "حجم الملف أكبر من 50 ميغابايت" });
    const safeName = String(file.name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 90) || "portfolio-file";
    const blob = await put(`portfolio/${Date.now()}-${safeName}`, file.buffer, { access: "private", contentType: file.type, addRandomSuffix: true });
    return json(response, 200, { url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}`, pathname: blob.pathname });
  } catch (error) {
    console.error("[mada] upload error:", error);
    return json(response, 500, { error: "تعذّر رفع الملف. حاول مرة أخرى." });
  }
};
