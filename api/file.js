const { Pool } = require("@neondatabase/serverless");
const { get } = require("@vercel/blob");
const { Readable } = require("node:stream");
const crypto = require("node:crypto");
const { collectPublicBlobPaths, collectBlobPathsDeep } = require("./_public-portfolio");

let pool;
let privateFilesSchemaReady;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
  return pool;
}

async function ensurePrivateFilesSchema() {
  if (!privateFilesSchemaReady) {
    privateFilesSchemaReady = db().query(
      "CREATE TABLE IF NOT EXISTS mada_private_files (pathname TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    ).then(() => db().query("CREATE INDEX IF NOT EXISTS mada_private_files_owner_idx ON mada_private_files(user_id)")).catch(error => {
      privateFilesSchemaReady = null;
      throw error;
    });
  }
  return privateFilesSchemaReady;
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
  });
  response.end(body);
}

function sessionCookie(request) {
  const item = String(request.headers.cookie || "").split(";").map(value => value.trim()).find(value => value.startsWith("mada_session="));
  try { return item ? decodeURIComponent(item.slice("mada_session=".length)) : ""; } catch (_) { return ""; }
}

async function isOwnedBySession(request, pathname) {
  const token = sessionCookie(request);
  if (token.length < 40) return false;
  await ensurePrivateFilesSchema();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = await db().query(
    "SELECT u.id,d.data FROM mada_sessions s JOIN mada_users u ON u.id=s.user_id LEFT JOIN mada_user_data d ON d.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND NOT EXISTS (SELECT 1 FROM mada_admin_user_flags f WHERE f.user_id=u.id AND f.disabled=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
    [tokenHash]
  );
  if (!session.rows[0]) return false;
  const owner = await db().query("SELECT 1 FROM mada_private_files WHERE pathname=$1 AND user_id=$2 LIMIT 1", [pathname, session.rows[0].id]);
  if (owner.rows[0]) return true;
  return collectBlobPathsDeep(session.rows[0].data).has(pathname);
}

async function isPubliclyReferenced(pathname) {
  const result = await db().query(
    "SELECT p.portfolio FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE p.is_public=TRUE AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW()))"
  );
  return result.rows.some(row => collectPublicBlobPaths(row.portfolio).has(pathname));
}

module.exports = async function fileHandler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, 405, "Method Not Allowed");
  }

  try {
    const requestUrl = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);
    const pathname = String(requestUrl.searchParams.get("pathname") || "").trim();
    const allowedNamespace =
      pathname.startsWith("mada-project-files/") ||
      pathname.startsWith("portfolio/");

    if (
      !pathname ||
      pathname.includes("..") ||
      pathname.includes("//") ||
      pathname.includes("\\") ||
      pathname.startsWith("/") ||
      !allowedNamespace ||
      !/^[a-zA-Z0-9._/-]+$/.test(pathname)
    ) {
      return send(response, 400, "Invalid file reference");
    }

    // A private Blob object is served only when its exact path is referenced
    // by content in an active, publicly published gallery.
    if (!(await isPubliclyReferenced(pathname)) && !(await isOwnedBySession(request, pathname))) {
      return send(response, 404, "File not found");
    }

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers["if-none-match"] || undefined
    });

    if (!result) return send(response, 404, "File not found");

    if (result.statusCode === 304) {
      response.writeHead(304, {
        etag: result.blob.etag,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer"
      });
      return response.end();
    }

    if (result.statusCode !== 200 || !result.stream) {
      return send(response, 404, "File not found");
    }

    const originalType = String(result.blob.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
    const inlineTypes = new Set([
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
      "video/mp4", "video/webm",
      "audio/mpeg", "audio/ogg", "audio/wav",
      "application/pdf"
    ]);
    const inline = inlineTypes.has(originalType);
    const headers = {
      "content-type": inline ? originalType : "application/octet-stream",
      etag: result.blob.etag,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-disposition": inline ? "inline" : "attachment; filename=\"portfolio-file\"",
      "accept-ranges": "none"
    };
    if (Number.isFinite(result.blob.size)) headers["content-length"] = String(result.blob.size);

    response.writeHead(200, headers);
    if (request.method === "HEAD") return response.end();

    Readable.fromWeb(result.stream).on("error", error => {
      console.error("[mada] public file stream error:", error?.message || error);
      if (!response.headersSent) send(response, 500, "Unable to deliver file");
      else response.destroy(error);
    }).pipe(response);
  } catch (error) {
    console.error("[mada] public file delivery error:", error?.message || error);
    return send(response, 500, "Unable to deliver file");
  }
};
