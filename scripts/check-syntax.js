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
  "legacy/amine_wholesale_store_v2/assets/app.js"
];

for (const file of javascriptFiles) {
  const code = fs.readFileSync(file, "utf8");
  new vm.Script(code, { filename: file });
  console.log("OK JavaScript syntax:", file);
}

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

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
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
if (!publicPortfolioHtml.includes("grid-template-columns:repeat(3,minmax(0,1fr))") || !publicPortfolioHtml.includes("height:clamp(125px,15vw,175px)")) throw new Error("Published portfolio cards should use compact responsive sizing");
const galleryUi = ["projectGalleryVisible", "projectGalleryFilter", "galleryShowRole", "galleryShowBio", "galleryShowAvatar", "galleryShowSkills", "galleryShowCity", "galleryShowEducation", "galleryFeaturedOnly"];
for (const id of galleryUi) if (!profile.includes(`id="${id}"`)) throw new Error("Missing project/gallery control: " + id);
if (!profile.includes('$("[data-view-project]").forEach') || !profile.includes('$("[data-edit-project]").forEach')) throw new Error("Project card view/edit actions must bind to all matching cards using querySelectorAll");
if (profile.includes('\n  $("[data-view-project]").forEach') || profile.includes('\n  $("[data-edit-project]").forEach')) throw new Error("Single-element querySelector must not be used with forEach for project card actions");
if (!portfolioApi.includes("p.galleryVisible === true") || !profile.includes('galleryVisible:$("#projectGalleryVisible").checked')) throw new Error("Independent public gallery visibility is not connected end-to-end");
if (!profile.includes("state.portfolioSettings") || !profile.includes("settings.featuredOnly")) throw new Error("Public gallery content settings are not persisted/applied");
console.log("OK project editing, downloads, per-project gallery visibility, and gallery content settings");
console.log("OK modal-first work gallery actions and media previews");
console.log("OK public portfolio publishing, media, routing, and copy integration");
if (!auth.includes('id = "madaAccessGate"') || !auth.includes('accessGate.classList.toggle("show", !user)')) throw new Error("Private workspace must remain gated until a verified session exists");
if (!auth.includes('id="madaAccessLogin"') || !auth.includes('open("login")')) throw new Error("Unauthenticated users must have a working login/register entry point");
for (const action of ['publish-design', 'publish-portfolio', 'data']) {
  const routeStart = account.indexOf('action === "' + action + '"');
  if (routeStart < 0) throw new Error("Missing protected action: " + action);
  const route = account.slice(routeStart, routeStart + 1800);
  if (!route.includes('currentUser(req)')) throw new Error("Protected action lacks session verification: " + action);
}
console.log("OK private workspace is gated and write APIs require an authenticated session");
console.log("OK account settings integration and security checks");
