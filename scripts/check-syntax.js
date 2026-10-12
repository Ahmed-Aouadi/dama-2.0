const fs = require("node:fs");
const vm = require("node:vm");

const javascriptFiles = [
  "api/account.js",
  "api/admin.js",
  "legacy/api/db.js",
  "legacy/api/store.js",
  "legacy/api/requests.js",
  "masar-platform/auth.js",
  "masar-platform/discover-path.js",
  "masar-platform/portfolio-public.js",
  "masar-platform/mada-ux.js",
  "masar-platform/growth-hub.js",
  "masar-platform/growth-templates.js"
];

for (const retiredRoute of ["api/db.js", "api/store.js", "api/requests.js"]) {
  if (fs.existsSync(retiredRoute)) throw new Error("Retired API route must stay outside Vercel /api: " + retiredRoute);
}

for (const file of javascriptFiles) {
  const code = fs.readFileSync(file, "utf8");
  new vm.Script(code, { filename: file });
  console.log("OK JavaScript syntax:", file);
}

for (const htmlFile of ["masar-platform/index.html", "masar-platform/portfolio.html"]) {
  const html = fs.readFileSync(htmlFile, "utf8");
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:[?#][^"']*)?)["'][^>]*>/gi)) {
    const source = match[1];
    if (/^https?:\/\//i.test(source)) continue;
    const file = source.replace(/^\/+/, "").split(/[?#]/)[0];
    if (!javascriptFiles.includes(file)) throw new Error("Externally loaded JavaScript is missing from syntax checks: " + file + " (referenced by " + htmlFile + ")");
  }
}
console.log("OK all externally loaded app scripts are covered by syntax checks");

const htmlFiles = ["authority-console/index.html", "masar-platform/index.html"];
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let inlineCount = 0;

  for (let index = 0; index < scripts.length; index++) {
    const [, attributes, source] = scripts[index];
    if (/\bsrc\s*=/i.test(attributes)) continue;
    if (!source.trim()) continue;
    new vm.Script(source, { filename: file + " inline script #" + (index + 1) });
    inlineCount++;
  }

  if (!inlineCount) throw new Error("No inline script found: " + file);

  const markupOnly = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  const ids = [...markupOnly.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size) throw new Error("Duplicate HTML IDs in " + file + ": " + [...duplicates].join(", "));
  console.log("OK inline scripts and unique IDs:", file);
}

const account = fs.readFileSync("api/account.js", "utf8");
const auth = fs.readFileSync("masar-platform/auth.js", "utf8");
const profile = fs.readFileSync("masar-platform/index.html", "utf8");
const adminApi = fs.readFileSync("api/admin.js", "utf8");
const adminConsole = fs.readFileSync("authority-console/index.html", "utf8");
const securityHeaders = fs.readFileSync("vercel.json", "utf8");

const profileContentDetector = auth.match(/function hasMeaningfulProfile\(data\) \{[\s\S]*?\n  \}/);
if (!profileContentDetector) throw new Error("Account restoration must detect all saved profile fields");
const hasMeaningfulProfile = vm.runInNewContext("(" + profileContentDetector[0] + ")");
if (!hasMeaningfulProfile({ profile: { city: "Algiers", name: "", role: "", bio: "" } })) throw new Error("City-only profile data must not be treated as empty");
if (!hasMeaningfulProfile({ profile: { link: "https://example.com", name: "", role: "", bio: "" } })) throw new Error("Link-only profile data must not be treated as empty");
if (hasMeaningfulProfile({ profile: { name: "", role: "", bio: "", skills: "", link: "", photo: "", city: "" } })) throw new Error("An empty profile must remain empty");
const growthContentDetector = auth.match(/function hasMeaningfulGrowth\(data\) \{[\s\S]*?\n  \}/);
if (!growthContentDetector) throw new Error("Account restoration must detect saved Growth Hub content");
const hasMeaningfulGrowth = vm.runInNewContext("(" + growthContentDetector[0] + ")");
if (!hasMeaningfulGrowth({ growth: { customTemplates: [{ id: "custom-1" }] } })) throw new Error("Custom templates must prevent an account from being treated as empty");
if (!hasMeaningfulGrowth({ growth: { cv: { name: "Test User" } } })) throw new Error("CV data must prevent an account from being treated as empty");
if (!hasMeaningfulGrowth({ growth: { skills: [{ name: "HTML" }] } })) throw new Error("Growth skills must prevent an account from being treated as empty");
if (hasMeaningfulGrowth({ growth: { cv: { name: "", headline: "", languages: "العربية، الفرنسية" }, skills: [], paths: {}, history: [], requests: [], customTemplates: [], locale: "ar" } })) throw new Error("Default Growth Hub data must not be mistaken for user content");
console.log("OK account restoration preserves custom templates, CV, skills, paths and history");
if (!account.includes('if (!origin || !host) return false') || !account.includes('req.headers.host || ""')) throw new Error("Account API must reject missing origins and compare against the request host");
if (!account.includes("4 * 1024 * 1024") || !account.includes("encoded.length > 3500000") || !account.includes("Retry-After") || !account.includes("allowedActions") || !account.includes("methodsByAction") || !account.includes("SameSite=Strict") || !account.includes("parsed.protocol === \"https:\"")) throw new Error("Account API request size, method/action allowlists, strict cookies/origin, and write-rate protections are required");
if (!adminApi.includes('req.headers.host||""') || !adminApi.includes("INTERVAL '5 minutes'") || !adminApi.includes("Retry-After") || !adminApi.includes("public-config") || !adminApi.includes("methodsByAction") || !adminApi.includes('u.protocol==="https:"')) throw new Error("Admin API origin, method/action allowlist, and write-rate protections are required");
if (!securityHeaders.includes("Strict-Transport-Security") || !securityHeaders.includes("default-src 'self'") || !securityHeaders.includes("object-src 'none'") || !securityHeaders.includes("frame-ancestors 'none'") || !securityHeaders.includes('"value": "DENY"') || !securityHeaders.includes("X-XSS-Protection") || securityHeaders.includes("unsafe-eval")) throw new Error("Required browser security headers/CSP are missing or weakened");

if (!account.includes('action === "account-settings"')) throw new Error("Missing account settings API route");
if (!account.includes("verifyPassword(currentPassword, check.rows[0].password_hash)")) throw new Error("Account changes must verify the current password");
if (/\\\\p\{L\}/.test(account)) throw new Error("Over-escaped Unicode username validation detected");
if (!auth.includes('request("account-settings", "POST", settings || {})')) throw new Error("Account settings UI is not connected to the API");
if (!auth.includes('new CustomEvent("mada:authchange"')) throw new Error("Authentication state changes are not announced");
if (!profile.includes('id="accountSettingsForm"')) throw new Error("Missing account settings form");
if (!profile.includes('document.addEventListener("mada:authchange",syncAccountSettings)')) throw new Error("Account settings do not refresh after login/logout");

const portfolioApi = account;
const portfolioPage = profile;
const portfolioViewer = fs.readFileSync("masar-platform/portfolio-public.js", "utf8");
const publicPortfolioHtml = fs.readFileSync("masar-platform/portfolio.html", "utf8");
const portfolioRoute = fs.readFileSync("vercel.json", "utf8");
for (const action of ['publish-portfolio', 'public-portfolio']) {
  if (!portfolioApi.includes('action === "' + action + '"')) throw new Error("Missing portfolio API action: " + action);
}
for (const field of ['projectImages', 'projectVideoUrl', 'projectFileUrl', 'publishPortfolioBtn', 'copyPortfolioLinkBtn']) {
  if (!portfolioPage.includes('id="' + field + '"')) throw new Error("Missing portfolio UI field: " + field);
}
if (!portfolioRoute.includes('"source": "/portfolio.html"')) throw new Error("Missing public portfolio rewrite");
if (portfolioViewer.includes('copy-public-portfolio') || portfolioApi.includes('action === "copy-public-portfolio"')) throw new Error("Retired public portfolio copy action must stay removed");
for (const id of ["projectMediaPreviewModal", "portfolioPublicPreviewModal", "previewPortfolioBtn", "projectDetailsDuplicate"]) {
  if (!portfolioPage.includes(`id="${id}"`)) throw new Error("Missing modal-first gallery control: " + id);
}
if (!portfolioPage.includes("openProjectMediaPreview")) throw new Error("Project media is not previewed in a modal");
if (publicPortfolioHtml.includes('id="portfolioOptionsModal"') || !publicPortfolioHtml.includes('id="publicMediaModal"')) throw new Error("Public gallery must keep media previews in a dialog without the retired options modal");
if (!portfolioViewer.includes("#portfolioView a[target=")) throw new Error("Public gallery links are not intercepted for in-page previews");
if (!portfolioApi.includes("const safeImage = value =>") || !portfolioApi.includes(".map(safeImage).filter(Boolean)")) throw new Error("Uploaded base64 project images must survive portfolio publishing");
if (!portfolioViewer.includes(".map(v=>safeUrl(v,true))")) throw new Error("Public gallery must display uploaded image data URLs");
if (!portfolioPage.includes('$("[data-work-fields]")')) throw new Error("Work-type selection must toggle every relevant field");
if (!portfolioViewer.includes("Array.isArray(p.uploadedImages)&&safeUrl(p.uploadedImages[0],true)")) throw new Error("Uploaded project images must be eligible as the public cover");
for (const field of ["workType", "uploadedImages", "uploadedVideo", "uploadedFile"]) { if (!portfolioApi.includes(field)) throw new Error("Portfolio API must preserve " + field); }
if (!publicPortfolioHtml.includes("grid-template-columns:repeat(3,minmax(0,1fr))") || !(publicPortfolioHtml.includes("height:clamp(125px,15vw,175px)") || publicPortfolioHtml.includes("height:var(--gallery-cover-height,clamp(125px,15vw,175px))"))) throw new Error("Published portfolio cards should use compact responsive sizing");
const galleryUi = ["projectGalleryVisible", "projectGalleryFilter", "galleryShowRole", "galleryShowBio", "galleryShowAvatar", "galleryShowSkills", "galleryShowCity", "galleryShowEducation", "galleryFeaturedOnly"];
for (const id of galleryUi) if (!profile.includes(`id="${id}"`)) throw new Error("Missing project/gallery control: " + id);
if (!profile.includes('$("[data-view-project]").forEach') || !profile.includes('$("[data-edit-project]").forEach')) throw new Error("Project card view/edit actions must bind to all matching cards using querySelectorAll");
if (profile.includes('\n  $("[data-view-project]").forEach') || profile.includes('\n  $("[data-edit-project]").forEach')) throw new Error("Single-element querySelector must not be used with forEach for project card actions");
if (!portfolioApi.includes("p.galleryVisible === true") || !profile.includes('galleryVisible:$("#projectGalleryVisible").checked')) throw new Error("Independent public gallery visibility is not connected end-to-end");
if (!profile.includes("state.portfolioSettings") || !profile.includes("settings.featuredOnly")) throw new Error("Public gallery content settings are not persisted/applied");
console.log("OK project editing, downloads, per-project gallery visibility, and gallery content settings");
console.log("OK modal-first work gallery actions and media previews");
console.log("OK public portfolio publishing, media, routing, and copy integration");
if (!portfolioPage.includes('id="publishPortfolioBtn"') || !/const portfolioPublishButton=\$\("#publishPortfolioBtn"\);if\(portfolioPublishButton\)portfolioPublishButton\.addEventListener\("click",function\(event\)\{event\.preventDefault\(\);publishPortfolio\(\)\}\)/.test(portfolioPage)) throw new Error("Gallery publish button must be bound to the publish workflow");
if (!portfolioPage.includes('typeof result.shareUrl!=="string"') || !portfolioPage.includes('Mada portfolio publish failed:')) throw new Error("Gallery publishing must validate the returned share URL and report runtime failures");
if (!portfolioPage.includes("new TextEncoder().encode(requestBody).length>3900000") || !portfolioPage.includes("aria-busy") || !portfolioApi.includes('module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } }')) throw new Error("Portfolio publishing must support bounded media payloads and expose a clear size error");
if (!portfolioViewer.includes("const normalizeWhatsAppNumber=function(value)") || !portfolioViewer.includes("https://wa.me/") || !portfolioViewer.includes("?text=") || !portfolioViewer.includes("راسلني على واتساب") || !portfolioPage.includes("يفتح زر المعرض محادثة واتساب مباشرة")) throw new Error("WhatsApp contact must open a direct chat using a normalized international number");

if (!auth.includes('id = "madaAccessGate"') || !auth.includes('accessGate.classList.toggle("show", !user)')) throw new Error("Private workspace must remain gated until a verified session exists");
if (!auth.includes('id="madaAccessLogin"') || !auth.includes('open("login")')) throw new Error("Unauthenticated users must have a working login/register entry point");
for (const action of ['publish-design', 'publish-portfolio', 'data']) {
  const routeStart = account.indexOf('action === "' + action + '"');
  if (routeStart < 0) throw new Error("Missing protected action: " + action);
  const route = account.slice(routeStart, routeStart + 1800);
  if (!route.includes('currentUser(req)')) throw new Error("Protected action lacks session verification: " + action);
}
if (!account.includes("disabled_until>NOW()") || !account.includes("disabled_until IS NULL OR f.disabled_until>NOW()")) throw new Error("Expired suspensions must automatically restore account access and public content");
if (!adminApi.includes("disabled_until TIMESTAMPTZ") || !adminApi.includes('"delete-user":["POST"]') || !adminApi.includes("account_suspended_permanently") || !adminApi.includes("account_suspended_temporarily") || !adminApi.includes('"account_deleted"')) throw new Error("Admin API must support permanent/temporary suspension and audited account deletion");
if (!adminConsole.includes("data-suspension-duration") || !adminConsole.includes("data-delete-user") || !adminConsole.includes('confirmation:typed')) throw new Error("Admin console must expose timed suspensions and guarded account deletion");
console.log("OK timed account suspension, expiry restoration, and audited deletion");
console.log("OK private workspace is gated and write APIs require an authenticated session");
console.log("OK account settings integration and security checks");


const growthPage = fs.readFileSync("masar-platform/index.html", "utf8");
const growthScript = fs.readFileSync("masar-platform/growth-hub.js", "utf8");
const growthCss = fs.readFileSync("masar-platform/growth-hub.css", "utf8");
for (const id of ["page-growth", "growthCvForm", "growthCVPreview", "growthSkillForm", "growthPathList", "growthTemplates", "growthHistory", "growthRequestForm", "growthExportCaseStudy", "growthSnapshotBtn"]) {
  if (!growthPage.includes('id="' + id + '"')) throw new Error("Missing Growth Hub control: " + id);
}
if (!growthPage.includes('src="/masar-platform/growth-hub.js"') || !growthPage.includes('href="/masar-platform/growth-hub.css"')) throw new Error("Growth Hub assets are not connected to the main app");
if (!growthPage.includes('growth:Object.assign({},initial.growth,d.growth||{}')) throw new Error("Growth Hub state must survive account cloud-state restoration");
for (const feature of ["function exportCaseStudy()", "function printSkills()", "function snapshot()", "function downloadTemplate(id)", "function renderStats()"]) {
  if (!growthScript.includes(feature)) throw new Error("Missing Growth Hub feature: " + feature);
}
if (!growthCss.includes("@media(max-width:760px)") || !growthCss.includes("@media print")) throw new Error("Growth Hub must support mobile and print layouts");
console.log("OK Growth Hub wiring, CV, skills, learning paths, templates, analytics, snapshots and mobile/print styles");
const growthTemplateEditor = fs.readFileSync("masar-platform/growth-templates.js", "utf8");
if (!adminApi.includes('"growth-templates":["GET","POST"]') || !adminApi.includes("growthTemplates:normalizeGrowthTemplates") || !adminConsole.includes('data-view="growthTemplates"') || !adminConsole.includes("function growthTemplates()") || !adminConsole.includes("data-template-field-remove") || !adminConsole.includes('api("growth-templates"') || !growthScript.includes('fetch("/api/admin?action=public-config"') || !growthTemplateEditor.includes("managedTemplates.find")) throw new Error("Admin-managed Growth Center templates must support secure CRUD and public display");
if (growthPage.includes('<div class="home-showcase-panel">') || growthPage.includes('<div class="home-project-showcase">') || !growthPage.includes('class="home-path-grid"')) throw new Error("Homepage cleanup must remove repeated showcase panels and preserve the three primary paths");
console.log("OK admin-managed Growth Center template CRUD, public library integration, and homepage cleanup");

const collabApi = fs.readFileSync("api/account.js", "utf8");
for (const action of ["collaboration-create", "collaboration-list", "collaboration-update"]) {
  if (!collabApi.includes('action === "' + action + '"')) throw new Error("Missing collaboration API action: " + action);
}
if (!collabApi.includes("CREATE TABLE IF NOT EXISTS mada_collaboration_requests") || !collabApi.includes("currentUser(req)")) throw new Error("Collaboration requests must be stored in Neon and require an authenticated user");
if (!collabApi.includes("recipient_id=$2 AND status='pending'") || !collabApi.includes("sender_id=$2 AND status='pending'")) throw new Error("Collaboration decisions must be restricted to the request recipient or sender");
if (!growthScript.includes('collaboration-create') || !growthScript.includes('collaboration-list') || !growthScript.includes('collaboration-update')) throw new Error("Growth Hub collaboration UI must use the authenticated API");
console.log("OK authenticated collaboration requests, inbox and recipient-only decisions");

if (!growthScript.includes("function refreshGrowthState()") || !growthScript.includes('refreshGrowthState();refreshCollaboration()')) throw new Error("Growth Hub must restore saved account features after authentication/cloud sync");
console.log("OK Growth Hub account-state restoration after sign-in");

const studioPage = fs.readFileSync("masar-platform/index.html", "utf8");
const studioCss = fs.readFileSync("masar-platform/mada-studio.css", "utf8");
if (!studioPage.includes('href="/masar-platform/mada-studio.css"')) throw new Error("Dama 2.0 Creative Studio stylesheet is not linked");
for (const id of ["exportCustomImages", "exportCustomPdfTop", "exportCustomArchive", "customSmartLayout", "addTableElement", "customBackgroundImageBtn", "customReferenceBtn", "customApplyWatermark", "customBrushToggle", "customAddPage", "customLayers", "customAllowTemplateUse", "customFullscreen"]) {
  if (!studioPage.includes('id="' + id + '"')) throw new Error("Mada Creative Studio addition was lost: " + id);
}
if (!studioCss.includes("#customEditorModal .custom-editor-header") || !studioCss.includes("#customEditorModal .custom-tools") || !studioCss.includes("@media (max-width:980px)")) throw new Error("Dama 2.0 Studio styling or responsive layout is missing");
if (!studioCss.includes("#customEditorModal .custom-header-actions #customFullscreen{display:inline-flex!important")) throw new Error("Fullscreen control must remain visible after the style migration");
console.log("OK Dama 2.0 Creative Studio styles with Mada export, layout, page, reference, watermark and fullscreen features preserved");
