const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const rewrites = {
  "/": "/masar-platform/index.html",
  "/mada-ops-7f3c9a": "/authority-console/index.html",
  "/portfolio.html": "/masar-platform/portfolio.html",
  "/share.html": "/masar-platform/share.html"
};

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  const relativePath = rewrites[requestPath] || requestPath;
  const filePath = path.resolve(root, `.${decodeURIComponent(relativePath)}`);

  if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[mada] development server listening on port ${port}`);
});
