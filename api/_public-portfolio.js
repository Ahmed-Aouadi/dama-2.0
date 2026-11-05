function sanitizePublicPortfolio(input) {
  let source = input && typeof input === "object" ? input : {};
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch (_) { source = {}; }
  }
  const display = source.display && typeof source.display === "object" ? source.display : {};
  const sections = Array.isArray(display.gallerySections) ? display.gallerySections : [];
  const projects = (Array.isArray(source.projects) ? source.projects : []).filter(project => {
    if (!project || typeof project !== "object") return false;
    if (project.visibility === "private" || project.galleryVisible === false) return false;
    const id = String(project.gallerySection || "general");
    const section = sections.find(item => item && String(item.id) === id);
    if (section && section.visible === false) return false;
    if (display.featuredOnly === true && !project.featured) return false;
    return true;
  });
  const records = (Array.isArray(source.records) ? source.records : []).filter(record =>
    record && typeof record === "object" && record.public === true
  );
  return { ...source, projects, records };
}

function publicBlobPath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const raw = value.trim();
  if (/^data:/i.test(raw)) return "";
  let pathname = "";
  try {
    const url = new URL(raw, "https://mada.invalid");
    if (url.origin === "https://mada.invalid" && url.pathname === "/api/file") {
      pathname = url.searchParams.get("pathname") || "";
    } else {
      const candidate = url.pathname.replace(/^\/+/, "");
      const trustedHost = url.origin === "https://mada.invalid" ||
        /(?:^|\.)blob\.vercel-storage\.com$/i.test(url.hostname) ||
        /(?:^|\.)vusercontent\.net$/i.test(url.hostname);
      if (trustedHost) pathname = candidate;
    }
  } catch (_) {
    if (/^(?:mada-project-files|portfolio)\//.test(raw)) pathname = raw;
  }
  if (!/^(?:mada-project-files|portfolio)\/[a-zA-Z0-9._/-]+$/.test(pathname)) return "";
  if (pathname.includes("..") || pathname.includes("//") || pathname.includes("\\")) return "";
  if (pathname.split("/").some(part => !part || part === "." || part === "..")) return "";
  return pathname;
}

function collectPublicBlobPaths(input) {
  const portfolio = sanitizePublicPortfolio(input);
  const paths = new Set();
  const add = value => {
    const pathname = publicBlobPath(value);
    if (pathname) paths.add(pathname);
  };
  const profile = portfolio.profile && typeof portfolio.profile === "object" ? portfolio.profile : {};
  const display = portfolio.display && typeof portfolio.display === "object" ? portfolio.display : {};
  add(profile.avatar);
  add(display.backgroundImage);
  for (const project of portfolio.projects) {
    for (const key of ["cover", "uploadedFile", "fileUrl", "uploadedVideo", "videoUrl"]) add(project[key]);
    if (project.allowTemplateUse === true) add(project.templateUrl);
    for (const key of ["uploadedImages", "mediaImages"]) {
      if (Array.isArray(project[key])) project[key].forEach(add);
    }
  }
  for (const record of portfolio.records) add(record.url);
  return paths;
}

module.exports = { sanitizePublicPortfolio, publicBlobPath, collectPublicBlobPaths };
