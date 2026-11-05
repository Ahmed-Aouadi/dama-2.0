const { get } = require("@vercel/blob");
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
    const allowedNamespace =
      pathname.startsWith("mada-project-files/") ||
      pathname.startsWith("portfolio/");

    if (
      !pathname ||
      pathname.includes("..") ||
      pathname.startsWith("/") ||
      !allowedNamespace ||
      !/^[a-zA-Z0-9._/-]+$/.test(pathname)
    ) {
      return send(response, 400, "Invalid file reference");
    }

    // Private Blob SDK get() accepts the pathname directly. Avoid listing the
    // store first: list() is unnecessary and can fail independently of reads.
    const result = await get(pathname, {
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

    if (result.statusCode !== 200 || !result.stream) {
      return send(response, 404, "File not found");
    }

    const headers = {
      "content-type": result.blob.contentType || "application/octet-stream",
      etag: result.blob.etag,
      "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "access-control-allow-origin": "*",
      "accept-ranges": "none",
    };
    if (Number.isFinite(result.blob.size)) {
      headers["content-length"] = String(result.blob.size);
    }

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
