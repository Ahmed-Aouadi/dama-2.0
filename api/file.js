const { get } = require("@vercel/blob");

module.exports = async function fileHandler(request, response, url) {
  if (request.method !== "GET") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }
  const pathname = url.searchParams.get("pathname");
  if (!pathname) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing pathname");
    return;
  }
  try {
    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers["if-none-match"] || undefined,
    });
    if (!result) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    if (result.statusCode === 304) {
      response.writeHead(304, { etag: result.blob.etag, "cache-control": "private, no-cache" });
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": result.blob.contentType || "application/octet-stream",
      etag: result.blob.etag,
      "cache-control": "private, no-cache",
    });
    result.stream.pipe(response);
  } catch (error) {
    console.error("[mada] file delivery error:", error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Failed to serve file");
  }
};
