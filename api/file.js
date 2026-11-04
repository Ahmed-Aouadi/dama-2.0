const { get, list } = require("@vercel/blob");
const { Readable } = require("node:stream");

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

module.exports = async function fileHandler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, 405, "Method Not Allowed");
  }

  try {
    const requestUrl = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);
    const pathname = String(requestUrl.searchParams.get("pathname") || "").trim();

    // Public portfolio assets are deliberately readable without an account.
    // Only files uploaded into Mada's dedicated project-files namespace qualify.
    if (!pathname || pathname.includes("..") || pathname.startsWith("/") ||
        !pathname.startsWith("mada-project-files/") ||
        !/^[a-zA-Z0-9._/-]+$/.test(pathname)) {
      return send(response, 400, "Invalid file reference");
    }

    // The Blob SDK's get() expects the full Blob URL, not the pathname.
    // Resolve the private pathname to its canonical URL first.
    let cursor;
    let blob = null;
    do {
      const page = await list({
        prefix: pathname,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      blob = (page.blobs || []).find(item => item.pathname === pathname) || null;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (!blob && cursor);

    if (!blob || !blob.url) return send(response, 404, "File not found");

    const result = await get(blob.url, {
      access: "private",
      ifNoneMatch: request.headers["if-none-match"] || undefined,
    });

    if (!result) return send(response, 404, "File not found");

    if (result.statusCode === 304) {
      response.writeHead(304, {
        etag: result.blob.etag,
        "cache-control": "public, max-age=300, s-maxage=3600",
        "x-content-type-options": "nosniff",
      });
      return response.end();
    }

    const contentType = result.blob.contentType || "application/octet-stream";
    const headers = {
      "content-type": contentType,
      "content-length": String(result.blob.size),
      etag: result.blob.etag,
      "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "access-control-allow-origin": "*",
    };
    response.writeHead(200, headers);

    if (request.method === "HEAD") return response.end();
    Readable.fromWeb(result.stream).pipe(response);
  } catch (error) {
    console.error("[mada] public file delivery error:", error?.message || error);
    return send(response, 500, "Unable to deliver file");
  }
};
