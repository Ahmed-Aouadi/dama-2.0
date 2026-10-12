const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const javascriptFiles = [
  "api/account.js",
  "api/admin.js",
  "masar-platform/auth.js",
  "masar-platform/discover-path.js",
  "masar-platform/portfolio-public.js",
];

for (const file of javascriptFiles) {
  const code = fs.readFileSync(file, "utf8");
  new vm.Script(code, { filename: file });
  console.log("OK JavaScript syntax:", file);
}

const htmlFiles = ["index.html", "authority-console/index.html", "masar-platform/index.html", "masar-platform/portfolio.html", "masar-platform/share.html"];
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let inlineCount = 0;

  for (let index = 0; index < scripts.length; index++) {
    const [, attributes, source] = scripts[index];
    if (/\bsrc\s*=/i.test(attributes)) continue;
    if (!source.trim()) continue;
    // This page embeds literal <script> markup inside its HTML-export template; the lightweight HTML regex cannot tokenize that nested string reliably.
    if (file === "masar-platform/index.html" && source.includes("function customDesignHtml(")) continue;
    new vm.Script(source, { filename: file + " inline script #" + (index + 1) });
    inlineCount++;
  }

  if (!scripts.length) throw new Error("No script tag found: " + file);

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size) throw new Error("Duplicate HTML IDs in " + file + ": " + [...duplicates].join(", "));

  const refs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]);
  for (const ref of refs) {
    if (!ref || /^(?:https?:|data:|mailto:|tel:|#|javascript:|\/\/)/i.test(ref)) continue;
    const cleanRef = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!cleanRef) continue;
    const absolute = cleanRef.startsWith("/");
    const localPath = absolute ? cleanRef.replace(/^\/+/, "") : path.posix.join(path.posix.dirname(file), cleanRef);
    if (!localPath) continue;
    if (absolute && (localPath.startsWith("api/") || ["portfolio.html", "share.html", "mada-ops-7f3c9a"].includes(localPath))) continue;
    if (!fs.existsSync(localPath)) throw new Error("Broken local HTML reference in " + file + ": " + ref);
  }
  console.log("OK inline scripts and unique IDs:", file);
}

const account = fs.readFileSync("api/account.js", "utf8");
const auth = fs.readFileSync("masar-platform/auth.js", "utf8");
const profile = fs.readFileSync("masar-platform/index.html", "utf8");
const store = fs.readFileSync("api/admin.js", "utf8");

if (!account.includes('action === "account-settings"')) throw new Error("Missing account settings API route");
if (!account.includes("verifyPassword(currentPassword, check.rows[0].password_hash)")) throw new Error("Account changes must verify the current password");
if (/\\\\p\{L\}/.test(account)) throw new Error("Over-escaped Unicode username validation detected");
if (!auth.includes('request("account-settings", "POST", settings || {})')) throw new Error("Account settings UI is not connected to the API");
if (!auth.includes('new CustomEvent("mada:authchange"')) throw new Error("Authentication state changes are not announced");
if (!profile.includes('id="accountSettingsForm"')) throw new Error("Missing account settings form");
if (!profile.includes("function updateProfilePreview(profileOverride)") || !profile.includes("updateProfilePreview(draft)")) throw new Error("Profile preview should update while the user edits fields, before saving");
if (!profile.includes('<button data-page="settings"><span>⚙</span>إعدادات</button>') || !profile.includes("grid-template-columns:repeat(6,minmax(0,1fr))")) throw new Error("Mobile navigation must provide direct access to settings");
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
for (const binding of ['#portfolioDesigner [data-portfolio-template]', '[data-home-edit-design]', '[data-home-publish-design]']) { if (profile.includes('\n $("' + binding + '").forEach')) throw new Error("Single-element querySelector used with forEach: " + binding); if (!profile.includes('$$("' + binding + '").forEach')) throw new Error("Missing querySelectorAll binding: " + binding); }
if (profile.includes('\n  $("[data-view-project]").forEach') || profile.includes('\n  $("[data-edit-project]").forEach')) throw new Error("Single-element querySelector must not be used with forEach for project card actions");
if (!portfolioApi.includes("p.galleryVisible === true") || !profile.includes('galleryVisible:$("#projectGalleryVisible").checked')) throw new Error("Independent public gallery visibility is not connected end-to-end");
if (!portfolioApi.includes('sourceProjects.filter(p => p && typeof p === "object" && p.galleryVisible !== false && p.visibility !== "private")')) throw new Error("Cloud project sync must enforce private-project visibility on the server");
if (!profile.includes("state.portfolioSettings") || !profile.includes("settings.featuredOnly")) throw new Error("Public gallery content settings are not persisted/applied");
for (const key of ["showExperience","showGoal","showInterests","showProfileLink","showWorkDescription","showWorkType","showWorkCategory","showWorkStatus","showWorkRole","showWorkTools","showWorkTags","showWorkOutcome"]) if (!profile.includes('"'+key+'"') || !profile.includes('savePortfolioSetting(key,el.checked)')) throw new Error("Public portfolio visibility toggle is not connected: " + key);
console.log("OK project editing, downloads, per-project gallery visibility, and gallery content settings");
console.log("OK modal-first work gallery actions and media previews");
console.log("OK public portfolio publishing, media, routing, and copy integration");
if (!auth.includes('id = "madaAccessGate"') || !auth.includes('accessGate.classList.toggle("show", !user || restoring)')) throw new Error("Private workspace must remain gated until session verification and data restoration complete");
if (!auth.includes("function setRestoring(value)") || !auth.includes("async function restoreSafely(migrateGuest)")) throw new Error("Account loading must keep the workspace locked until cloud data restoration finishes");
if (!auth.includes("syncRetryDelay = Math.min(syncRetryDelay * 2, 15000)") || !auth.includes("pending = pending || snapshot")) throw new Error("Transient cloud sync failures must retry without dropping the latest data snapshot");
if (!auth.includes("error.status = response.status") || !auth.includes("error.status !== 429")) throw new Error("Permanent client-side sync errors must stop retrying and report a useful message");
if (!account.includes("if (encoded.length > 3500000)")) throw new Error("Cloud account storage must support the allowed uploaded media payload size");
if (!auth.includes('id="madaAccessLogin"') || !auth.includes('open("login")')) throw new Error("Unauthenticated users must have a working login/register entry point");
for (const action of ['publish-design', 'publish-portfolio', 'data']) {
  const routeStart = account.indexOf('action === "' + action + '"');
  if (routeStart < 0) throw new Error("Missing protected action: " + action);
  const route = account.slice(routeStart, routeStart + 1800);
  if (!route.includes('currentUser(req)')) throw new Error("Protected action lacks session verification: " + action);
}
console.log("OK private workspace is gated and write APIs require an authenticated session");
console.log("OK account settings integration and security checks");
if (!account.includes("schemaReady = null; throw error;")) throw new Error("Account schema initialization must recover after transient database failures");
const adminApi = fs.readFileSync("api/admin.js", "utf8");
const adminConsole = fs.readFileSync("authority-console/index.html", "utf8");
if (!adminApi.includes("disabled_until TIMESTAMPTZ") || !adminApi.includes("ADD COLUMN IF NOT EXISTS disabled_until")) throw new Error("Temporary account suspension schema migration is missing");
if (!adminApi.includes("account_suspended_permanent") || !adminApi.includes("account_suspended_temporary") || !adminApi.includes("account_reactivated")) throw new Error("Account suspension audit events are incomplete");
if (!adminApi.includes('action==="account-delete"') || !adminApi.includes("confirmUsername") || !adminApi.includes('DELETE FROM mada_users WHERE id=$1')) throw new Error("Permanent account deletion endpoint or username confirmation is missing");
if (!account.includes("f.disabled=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())")) throw new Error("Expired temporary suspensions must allow login again");
if (!adminConsole.includes("data-account-delete") || !adminConsole.includes('value="permanent"') || !adminConsole.includes('value="720"')) throw new Error("Admin account controls must offer permanent deletion and suspension durations");
console.log("OK account deletion, timed/permanent suspension, auto-expiry, and admin audit checks");
if (!account.includes("try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return \"\"; }")) throw new Error("Malformed session cookies must not crash account requests");
if (!store.includes("MADA_ADMIN_SESSION_SECRET") || !store.includes("secret.length>=32") || !store.includes("p.every(x=>x.value.length>=16") || !store.includes("new Set(p.map(x=>x.value)).size===4")) throw new Error("Admin login must require a dedicated strong session secret and four distinct strong passwords");
console.log("OK transient database recovery, malformed-cookie handling, and admin-session secret hardening");
for (const query of [
  "SELECT d.design,d.price_dzd,u.display_name FROM mada_public_designs",
  "SELECT u.username,p.slug,p.portfolio,u.display_name FROM mada_public_portfolios"
]) {
  const start = account.indexOf(query);
  if (start < 0) throw new Error("Missing public content query: " + query);
  const sql = account.slice(start, start + 1200);
  if (!sql.includes("f.disabled_until IS NOT NULL AND f.disabled_until<=NOW()")) throw new Error("Expired suspensions must restore public content visibility: " + query);
}
console.log("OK public portfolio and design visibility recovers after timed suspensions expire");

for (const asset of ["madaicon/appicon.png", "madaicon/mainicon.png", "madaicon/background icon.png"]) {
  if (!fs.existsSync(asset)) throw new Error("Missing referenced brand asset: " + asset);
}
for (const file of ["index.html", "authority-console/index.html", "masar-platform/index.html", "masar-platform/auth.js", "manifest.webmanifest", "sw.js"]) {
  const source = fs.readFileSync(file, "utf8");
  if (/madaicon\/(?:appicon|mainicon)\.jpg/.test(source)) throw new Error("Stale JPG icon reference in " + file);
  if (/madaicon\/background%20icon\.jpg/.test(source)) throw new Error("Stale background JPG reference in " + file);
}
const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
for (const icon of manifest.icons || []) {
  const localPath = String(icon.src || "").replace(/^\/+/, "");
  if (!localPath || !fs.existsSync(localPath)) throw new Error("Manifest icon does not exist: " + icon.src);
}
if (!profile.includes("x.galleryVisible===true||((x.galleryVisible!==false)&&(x.visibility!==\"private\"))") || !profile.includes("state.portfolioSettings||initial.portfolioSettings).featuredOnly")) throw new Error("Standalone portfolio export must honor gallery visibility and featured-only settings");
console.log("OK standalone export respects project visibility and featured-only settings");
const studio = profile;
for (const id of ["customAutosaveStatus", "customDuplicatePage", "customDeletePage", "customUndo", "customRedo", "customZoomFit", "customPageTabs"]) {
  if (!studio.includes('id="' + id + '"')) throw new Error("Missing Creative Studio control: " + id);
}
for (const behavior of ["function scheduleCustomAutosave()", "localStorage.setItem(KEY,JSON.stringify(state))", "function setCustomAutosaveStatus", "Ctrl+Z", "customDoc.pages.splice(customPageIndex+1,0,copy)"]) {
  if (!studio.includes(behavior)) throw new Error("Missing Creative Studio reliability feature: " + behavior);
}
const htmlExportHandler = studio.match(/\$\("#exportCustomHtml"\)\.addEventListener\("click"/g) || [];
if (htmlExportHandler.length !== 1) throw new Error("Creative Studio HTML export must have exactly one click handler");
console.log("OK Creative Studio autosave, page management, history, keyboard shortcuts, and single export binding");
console.log("OK brand assets, manifest icons, and service-worker references");


const designLibrary = profile;
if (/(^|[^$])\$(?!\$)\(["\'][^"\']+["\']\)\.forEach/.test(profile)) throw new Error("Single-element querySelector ($) must not be used with forEach; use querySelectorAll ($) instead");
for (const token of ["designLibraryItems", "DESIGN_LIBRARY_PRESETS", "data-library-category", "function addDesignPreset", "tableCell:true", "designLibrarySearch"]) {
  if (!designLibrary.includes(token)) throw new Error("Missing Creative Studio design-library feature: " + token);
}
const designPresetBlock = designLibrary.match(/const DESIGN_LIBRARY_PRESETS=\[([\s\S]*?)\n\];/);
if (!designPresetBlock || (designPresetBlock[1].match(/\{key:/g) || []).length < 60) throw new Error("Creative Studio must expose at least 60 design presets");
console.log("OK Creative Studio has 60+ design presets, category filters, search, and table builder");


const authRestore = fs.readFileSync("masar-platform/auth.js", "utf8");
if (!authRestore.includes("function compressRestoredPhoto(photo)")) throw new Error("Legacy profile avatars must be compressed before cloud persistence");
if (!authRestore.includes("restoredData.profile.photo.length > 65000")) throw new Error("Oversized legacy profile avatars must be detected during restore");
if (!authRestore.includes("if (projectsAddedDuringRestore.length || photoWasCompressed)")) throw new Error("Restoring a missing display name alone must not rewrite the entire account payload");
if (authRestore.includes("if (needsName || projectsAddedDuringRestore.length) await request(\"data\", \"POST\"")) throw new Error("Missing profile name must not trigger an unconditional full-account rewrite");
console.log("OK oversized legacy avatar restore regression checks");
