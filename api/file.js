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
    return send(response, 405, "Method Not Allowed");
  }

  try {
    // Vercel Node functions pass (request, response); they do not pass a
    // third URL argument. Parse request.url so this works on Vercel and locally.
    const requestUrl = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);
    const pathname = requestUrl.searchParams.get("pathname");

    if (!pathname || pathname.includes("..") || pathname.startsWith("/") || !/^[a-zA-Z0-9._/-]+$/.test(pathname)) {
      return send(response, 400, "Invalid pathname");
    }

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers["if-none-match"] || undefined,
    });

    if (!result) return send(response, 404, "Not found");

    if (result.statusCode === 304) {
      response.writeHead(304, {
        etag: result.blob.etag,
        "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff",
      });
      return response.end();
    }

    const headers = {
      "content-type": result.blob.contentType || "application/octet-stream",
      "content-length": String(result.blob.size),
      etag: result.blob.etag,
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    };
    response.writeHead(200, headers);

    if (request.method === "HEAD") return response.end();

    // Blob SDK returns a Web ReadableStream. Vercel Node responses need a
    // Node.js stream, so convert it before piping.
    Readable.fromWeb(result.stream).pipe(response);
  } catch (error) {
    console.error("[mada] file delivery error:", error);
    return send(response, 500, "Unable to deliver file");
  }
};
