const { Pool } = require("@neondatabase/serverless");
const fs = require("node:fs");
const path = require("node:path");

let pool;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
  return pool;
}
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(value, allowDataImage) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (allowDataImage && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(raw) && raw.length < 250000) return raw;

  // Portfolio uploads are served through the same-origin public file proxy.
  // Preserve safe root-relative URLs such as /api/file?pathname=... instead
  // of dropping them (which made uploaded gallery covers disappear in SSR).
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\\\")) {
    try {
      const url = new URL(raw, "https://mada.invalid");
      if (url.origin !== "https://mada.invalid") return "";
      if (url.pathname === "/api/file") {
        const pathname = url.searchParams.get("pathname") || "";
        const allowedNamespace = pathname.startsWith("mada-project-files/") || pathname.startsWith("portfolio/");
        if (!allowedNamespace || pathname.includes("..")) return "";
      }
      return url.pathname + url.search + url.hash;
    } catch (_) { return ""; }
  }

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (_) { return ""; }
}
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function sendHtml(res, status, html, cacheControl) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", status === 200 ? "index, follow" : "noindex, nofollow");
  res.setHeader("Cache-Control", cacheControl || "no-store");
  res.end(html);
}
function publicError(status, title, message) {
  return "<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>" + esc(title) + " | مَدى</title><style>body{margin:0;background:#f6f4ff;color:#17152b;font-family:Tahoma,Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:520px;margin:24px;padding:34px;border:1px solid #e6e2f4;border-radius:24px;background:#fff;text-align:center;line-height:2}.card a{color:#5b46e6;font-weight:700}</style></head><body><main class=\"card\"><h1>" + esc(title) + "</h1><p>" + esc(message) + "</p><a href=\"/\">العودة إلى مَدى</a></main></body></html>";
}
function renderSsr(portfolio, authorName, username) {
  const profile = portfolio.profile || {};
  const display = portfolio.display || {};
  const projects = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  const visibleProjects = projects.filter(project => {
    const sections = Array.isArray(display.gallerySections) ? display.gallerySections : [];
    const section = sections.find(item => String(item.id) === String(project.gallerySection || "general"));
    return (String(project.gallerySection || "general") === "general" || !section || section.visible !== false) && (!display.featuredOnly || project.featured);
  });
  const name = String(profile.name || authorName || username).trim();
  const avatar = safeUrl(profile.avatar, true);
  const skills = String(profile.skills || "").split(/[,،]/).map(item => item.trim()).filter(Boolean).slice(0, 24);
  const hero = '<header class="profile-hero"><div class="profile-copy"><span class="kicker">' + esc(display.brandText || "معرض أعمال شخصي · مَدى") + '</span><h1>' + esc(name) + '</h1>' +
    (display.showRole !== false && profile.role ? '<p class="role">' + esc(profile.role) + '</p>' : "") +
    (display.showBio !== false && profile.bio ? '<p class="bio">' + esc(profile.bio) + '</p>' : "") +
    '<div class="profile-meta">' + (display.showCity !== false && profile.city ? '<span class="meta-chip">' + esc(profile.city) + '</span>' : "") + '<span class="meta-chip">' + visibleProjects.length + ' أعمال معروضة</span></div>' +
    (skills.length ? '<div class="skills">' + skills.map(skill => '<span class="skill">' + esc(skill) + '</span>').join("") + '</div>' : "") +
    '</div>' + (avatar ? '<div class="profile-avatar"><img src="' + esc(avatar) + '" alt="الصورة الشخصية"></div>' : "") + '</header>';
  const records = Array.isArray(portfolio.records) ? portfolio.records.slice(0, 100) : [];
  const cards = visibleProjects.map(project => {
    const cover =
      safeUrl(project.cover, true) ||
      safeUrl(Array.isArray(project.uploadedImages) ? project.uploadedImages[0] : "", true) ||
      safeUrl(Array.isArray(project.mediaImages) ? project.mediaImages[0] : "", true);
    const link = safeUrl(project.link, false);
    return '<article class="work"><div class="work-cover">' + (cover ? '<img src="' + esc(cover) + '" alt="' + esc(project.title || "صورة العمل") + '" loading="lazy">' : '<span class="cover-mark" aria-hidden="true">مَدى</span>') + '</div><div class="work-body"><span class="work-category">' + esc(project.category || "عمل") + '</span><h3>' + esc(project.title || "عمل بدون عنوان") + '</h3>' + (project.description ? '<p>' + esc(String(project.description).slice(0, 300)) + '</p>' : "") + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">فتح العمل ↗</a>' : "") + '</div></article>';
  }).join("");
  return hero + '<main class="portfolio-ssr-content"><div class="section-head"><div><h2>' + esc(display.title || "الأعمال المختارة") + '</h2>' + (display.subtitle ? '<p>' + esc(display.subtitle) + '</p>' : "") + '</div><span class="count">' + visibleProjects.length + ' أعمال</span></div>' +
    (cards ? '<div class="works-grid">' + cards + '</div>' : '<div class="empty"><strong>لا توجد أعمال منشورة بعد</strong>سيضيف صاحب المعرض أعماله هنا لاحقًا.</div>') +
    (records.length ? '<section class="portfolio-records"><div class="portfolio-records-heading"><h2>الشهادات والخبرات والإنجازات</h2><span class="count">' + records.length + ' عناصر</span></div><div class="portfolio-records-grid">' + records.map(record => {
      const type = ({education:"تعليم ومؤهل",experience:"خبرة",certificate:"شهادة",participation:"مشاركة",document:"وثيقة",link:"رابط"})[record.type] || "إنجاز";
      const url = safeUrl(record.url, false);
      return '<article class="portfolio-record-card"><span class="portfolio-record-type">' + esc(type) + '</span><h3>' + esc(record.title || "عنصر في ملف الإنجاز") + '</h3>' + (record.organization ? '<p class="portfolio-record-meta">' + esc(record.organization) + '</p>' : '') + (record.date ? '<p class="portfolio-record-meta">' + esc(record.date) + '</p>' : '') + (record.description ? '<p>' + esc(String(record.description).slice(0, 500)) + '</p>' : '') + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">عرض الإثبات أو الرابط ↗</a>' : '') + '</article>';
    }).join("") + '</div></section>' : '') + '</main>';
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendHtml(res, 405, publicError(405, "طريقة الطلب غير مدعومة", "استخدم رابط المعرض العام."), "no-store");
  }
  try {
    const username = String(req.query?.username || "").normalize("NFC").trim().toLocaleLowerCase("und");
    const slug = String(req.query?.id || "").trim();
    if (username && !/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) return sendHtml(res, 404, publicError(404, "المعرض غير موجود", "تحقق من اسم المستخدم أو اطلب رابطًا صحيحًا من صاحب المعرض."), "no-store");
    if (!username && !/^[A-Za-z0-9_-]{12,80}$/.test(slug)) return sendHtml(res, 404, publicError(404, "المعرض غير موجود", "تحقق من اسم المستخدم أو اطلب رابطًا صحيحًا من صاحب المعرض."), "no-store");
    const flags = await db().query("SELECT key,value FROM mada_site_settings WHERE key=$1 OR key=$2", ["publicGalleryEnabled", "maintenanceMode"]);
    const flagMap = Object.fromEntries(flags.rows.map(row => [row.key, row.value]));
    if (flagMap.publicGalleryEnabled === false || flagMap.maintenanceMode === true) return sendHtml(res, 404, publicError(404, "المعارض متوقفة مؤقتًا", "لا يمكن عرض المعارض العامة في الوقت الحالي."), "no-store");
    const result = username ? await db().query(
      "SELECT u.username,u.display_name,p.slug,p.portfolio,p.updated_at FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE LOWER(u.username)=LOWER($1) AND p.is_public=TRUE AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
      [username]
    ) : await db().query(
      "SELECT u.username,u.display_name,p.slug,p.portfolio,p.updated_at FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE p.slug=$1 AND p.is_public=TRUE AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",
      [slug]
    );
    if (!result.rows[0]) return sendHtml(res, 404, publicError(404, "هذا المعرض غير متاح", "قد يكون المعرض خاصًا أو لم ينشر صاحبه ملفه بعد."), "no-store");
    const row = result.rows[0];
    const portfolio = row.portfolio && typeof row.portfolio === "object" ? row.portfolio : {};
    const profile = portfolio.profile || {};
    const name = String(profile.name || row.display_name || row.username).trim();
    const description = String(profile.bio || ("معرض أعمال " + name + " على منصة مَدى.")).replace(/\s+/g, " ").slice(0, 300);
    const projects = Array.isArray(portfolio.projects) ? portfolio.projects : [];
    const firstCover = projects.map(project =>
      safeUrl(project.cover, true) ||
      safeUrl(Array.isArray(project.uploadedImages) ? project.uploadedImages[0] : "", true) ||
      safeUrl(Array.isArray(project.mediaImages) ? project.mediaImages[0] : "", true)
    ).find(Boolean);
    const rawHost = String(req.headers.host || "dama-20.vercel.app").split(",")[0].trim();
    const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(rawHost) ? rawHost : "dama-20.vercel.app";
    const origin = (host.startsWith("localhost") ? "http://" : "https://") + host;
    const image = firstCover ? new URL(firstCover, origin).href : origin + "/icons/og-image.png";
    const canonical = origin + "/@" + encodeURIComponent(row.username);
    if (!username) {
      res.statusCode = 308;
      res.setHeader("Location", canonical);
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      return res.end();
    }
    const title = name + " | معرض أعمال مَدى";
    const jsonLd = { "@context": "https://schema.org", "@type": "Person", name, url: canonical, description, image, sameAs: safeUrl(profile.link, false) ? [safeUrl(profile.link, false)] : undefined };
    const data = { ok: true, username: row.username, slug: row.slug, authorName: row.display_name, portfolio };
    let html = fs.readFileSync(path.join(__dirname, "../masar-platform/portfolio.html"), "utf8");
    const meta = '<meta name="robots" content="index,follow">' +
      '<link rel="canonical" href="' + esc(canonical) + '">' +
      '<meta property="og:type" content="profile"><meta property="og:title" content="' + esc(title) + '">' +
      '<meta property="og:description" content="' + esc(description) + '"><meta property="og:url" content="' + esc(canonical) + '">' +
      '<meta property="og:image" content="' + esc(image) + '"><meta property="og:image:alt" content="' + esc(title) + '"><meta property="og:site_name" content="مَدى"><meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + esc(title) + '"><meta name="twitter:description" content="' + esc(description) + '">' +
      '<script type="application/ld+json">' + safeJson(jsonLd) + '</script>';
    html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + esc(title) + "</title>");
    html = html.replace(/<meta name="description" content="[^"]*">/i, '<meta name="description" content="' + esc(description) + '">');
    html = html.replace("</head>", meta + "</head>");
    html = html.replace(/<div class="status" id="loadStatus" role="status">[\s\S]*?<\/div>/, '<div class="status" id="loadStatus" role="status" hidden></div>');
    const template = ["classic", "cv", "engineering", "marketing", "rose", "resume-sidebar", "resume-creative", "resume-minimal", "split", "bold", "studio", "gallery", "aurora"].includes(portfolio.display?.template) ? portfolio.display.template : "classic";
    html = html.replace('<section id="portfolioView" hidden></section>', '<section id="portfolioView" class="portfolio-theme portfolio-template-' + template + '">' + renderSsr(portfolio, row.display_name, row.username) + '</section>');
    html = html.replace('<script src="/masar-platform/portfolio-public.js?v=20261103a" defer></script>', '<script>window.__MADA_PUBLIC_DATA__=' + safeJson(data) + ';</script><script src="/masar-platform/portfolio-public.js?v=20261103a" defer></script>');
    return sendHtml(res, 200, html, "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  } catch (error) {
    console.error("Mada public portfolio SSR error:", error?.message || error);
    return sendHtml(res, 500, publicError(500, "تعذّر تحميل المعرض", "حدث خطأ مؤقت. حاول فتح الرابط بعد قليل."), "no-store");
  }
};
