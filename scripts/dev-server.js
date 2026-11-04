const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.development.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^([\"'])(.*)\1$/, "$2");
  }
}
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

const accountHandler = require(path.join(root, "api", "account.js"));
const uploadHandler = require(path.join(root, "api", "upload.js"));
const fileHandler = require(path.join(root, "api", "file.js"));

function handleJsonApi(request, response, handler) {
  const chunks = [];
  request.on("data", chunk => chunks.push(chunk));
  request.on("end", async () => {
    try {
      request.body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      await handler(request, response);
    } catch (error) {
      console.error("[mada] JSON API error:", error);
      if (!response.headersSent) {
        response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "بيانات الرفع غير صالحة." }));
      }
    }
  });
}

function handleAccountApi(request, response, url) {
  const chunks = [];
  request.on("data", chunk => chunks.push(chunk));
  request.on("end", async () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const contentType = String(request.headers["content-type"] || "").toLowerCase();
    let body = {};
    if (rawBody && contentType.includes("application/json")) {
      try { body = JSON.parse(rawBody); } catch { body = null; }
    }
    request.query = Object.fromEntries(url.searchParams.entries());
    request.body = body;
    try {
      await accountHandler(request, response);
    } catch (error) {
      console.error("[mada] account API error:", error);
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "تعذّر الاتصال بخدمة الحساب. تحقق من إعدادات قاعدة البيانات." }));
      }
    }
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const requestPath = url.pathname;
  if (requestPath === "/api/account") {
    handleAccountApi(request, response, url);
    return;
  }
  if (requestPath === "/api/upload") {
    uploadHandler(request, response);
    return;
  }
  if (requestPath === "/api/file") {
    fileHandler(request, response, parsedUrl);
    return;
  }

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
