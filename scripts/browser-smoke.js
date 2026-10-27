const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (pathname.startsWith("/api/")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Browser smoke tests use a clean, unauthenticated context." }));
    return;
  }

  const requested = pathname === "/" ? "/masar-platform/index.html" : decodeURIComponent(pathname);
  const file = path.resolve(root, "." + requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": mime[path.extname(file)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  fs.createReadStream(file).pipe(res);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  let browser;
  const errors = [];
  const failedScripts = [];
  let lastPublishedPayload = null;
  let sessionRefreshRequested = false;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(4173, "127.0.0.1", resolve);
    });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    await page.route("**/api/account**", async route => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get("action");
      const user = { id: "browser-smoke-user", username: "browser_smoke", name: "Browser Smoke" };
      const data = {
        profile: { name: "Browser Smoke", role: "مهندس تجريبي", bio: "نبذة تجريبية لاختبار التحكم في الظهور", skills: "AutoCAD, Revit", link: "", city: "", education: "هندسة تجريبية", experience: "خبرة اختبارية", goal: "", interests: "", photo: "https://example.com/profile-photo.jpg" },
        projects: [], designs: [], quizzes: [],
        growth: { cv: { name: "", headline: "", languages: "العربية، الفرنسية" }, skills: [], paths: {}, history: [], requests: [], customTemplates: [], locale: "ar" }
      };
      let body = { ok: true };
      if (action === "me") { sessionRefreshRequested = true; body = { user }; }
      else if (action === "data" && route.request().method() === "GET") body = { data };
      else if (action === "publish-portfolio") { lastPublishedPayload = route.request().postDataJSON(); body = { shareUrl: "/portfolio.html?id=browserSmokeTest123" }; }
      else if (action === "data") body = { ok: true };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.addInitScript(() => {
      window.__madaBrowserErrors = [];
      window.addEventListener("error", event => window.__madaBrowserErrors.push({message:event.message,source:event.filename,line:event.lineno,column:event.colno,stack:event.error && event.error.stack}), true);
    });
    page.on("pageerror", error => errors.push(error.message + " [stack: " + String(error.stack || "unavailable") + "]"));
    page.on("response", response => {
      if (response.status() >= 400 && /\.js(?:[?#]|$)/i.test(response.url())) {
        failedScripts.push(response.url() + " (" + response.status() + ")");
      }
    });

    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#page-home.active", { timeout: 10000 });
    await page.waitForTimeout(1200);
    assert(!failedScripts.length, "JavaScript assets failed to load: " + failedScripts.join(", "));
    const startupErrors = await page.evaluate(() => window.__madaBrowserErrors || []);
    assert(!errors.length && !startupErrors.length, "Uncaught browser exceptions on startup: " + errors.join(" | ") + " | details: " + JSON.stringify(startupErrors));

    for (const name of ["portfolio", "studio", "careers", "growth", "profile", "settings", "home"]) {
      const nav = page.locator('[data-page="' + name + '"]').first();
      await nav.click();
      await page.waitForFunction(n => {
        const active = document.querySelector(".page.active");
        return active && active.id === "page-" + n;
      }, name, { timeout: 5000 });
      const layout = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      assert(layout.scroll <= layout.client + 2, "Horizontal layout overflow while opening " + name + ": " + JSON.stringify(layout));
    }
    console.log("PASS main navigation: all seven sections switch correctly without horizontal overflow");

    await page.evaluate(() => window.applyMadaSectionVisibility({studioSectionEnabled:false,careersSectionEnabled:false,growthSectionEnabled:false,profileSectionEnabled:false,settingsSectionEnabled:false}));
    assert(await page.locator('[data-page="studio"]').first().evaluate(el => el.hidden), "Studio navigation was not hidden by site settings");
    assert(await page.locator('[data-page="careers"]').first().evaluate(el => el.hidden), "Careers navigation was not hidden by site settings");
    assert(await page.locator("#page-growth").evaluate(el => el.classList.contains("section-disabled")), "Growth page was not disabled by site settings");
    assert(await page.locator("#page-profile").evaluate(el => el.classList.contains("section-disabled")), "Profile page was not disabled by site settings");
    await page.evaluate(() => document.querySelector('[data-page="careers"]').click());
    assert(await page.locator("#page-home").evaluate(el => el.classList.contains("active")), "Navigation to a disabled section was not redirected home");
    await page.evaluate(() => window.applyMadaSectionVisibility({studioSectionEnabled:true,careersSectionEnabled:true,growthSectionEnabled:true,profileSectionEnabled:true,settingsSectionEnabled:true}));
    assert(!(await page.locator('[data-page="studio"]').first().evaluate(el => el.hidden)), "Re-enabled Studio navigation stayed hidden");
    console.log("PASS admin section visibility: hides, blocks, and restores optional sections");

    await page.locator("#helpBtn").click();
    assert(await page.locator("#helpModal").evaluate(el => el.classList.contains("open")), "Help button did not open its dialog");
    await page.locator('#helpModal [data-close="helpModal"]').click();
    console.log("PASS help button opens and closes its dialog");

    await page.locator('[data-page="portfolio"]').first().click();
    await page.locator("#addProjectBtn").click();
    assert(await page.locator("#projectModal").evaluate(el => el.classList.contains("open")), "Add project button did not open the project dialog");
    await page.locator('#projectModal [data-close="projectModal"]').click();
    console.log("PASS add-project button opens and closes its dialog");

    await page.evaluate(() => {
      if (!window.MadaAuth || typeof window.MadaAuth.getUser !== "function") throw new Error("MadaAuth.getUser is unavailable for the stale-session regression test");
      window.MadaAuth.getUser = () => null;
    });
    await page.locator("#publishPortfolioBtn").click();
    await page.waitForFunction(() => /تم نشر المعرض بنجاح/.test(document.querySelector("#portfolioShareStatus")?.textContent || ""), undefined, { timeout: 5000 });
    assert(sessionRefreshRequested, "Publishing did not refresh the server session when client auth state was empty");
    assert(!errors.length, "Uncaught browser exceptions after portfolio publishing click: " + errors.join(" | "));
    console.log("PASS publish button publishes and exposes a validated share URL");

    await page.locator("#openPortfolioDesignerBtn").click();
    assert(await page.locator("#portfolioDesignerModal").evaluate(el => el.classList.contains("open")), "Gallery customization dialog did not open");
    assert(await page.locator("#portfolioDesigner .designer-live").count() === 0, "Obsolete customization badge is still visible");
    assert(await page.locator("#portfolioSettingsIntro").count() === 0, "Redundant public-gallery introduction is still visible");
    assert(await page.locator("#portfolioDesigner [data-designer-tab]").count() === 7, "Gallery designer tabs are missing");
    assert(await page.locator("#portfolioDesigner [data-portfolio-template]").count() === 7, "Gallery designer must offer exactly seven templates");
    for (const template of ["classic","cv","engineering","marketing","rose","resume-sidebar","resume-creative"]) {
      await page.locator('#portfolioDesigner [data-portfolio-template="' + template + '"]').click();
      assert(await page.evaluate(t => window.MadaApp.getState().portfolioSettings.template === t, template), "Selecting portfolio template did not save: " + template);
      assert(await page.locator('#portfolioDesigner [data-portfolio-template="' + template + '"]').evaluate(el => el.classList.contains("is-selected") && el.getAttribute("aria-pressed") === "true"), "Selected portfolio template was not visually highlighted: " + template);
      await page.waitForFunction(t => { const frame = document.querySelector("#portfolioLivePreview iframe"); try { return !!frame && frame.contentDocument.querySelector("#portfolioView")?.classList.contains("portfolio-template-" + t); } catch (_) { return false; } }, template, { timeout: 5000 }).catch(() => {});
      assert(await page.frameLocator("#portfolioLivePreview iframe").locator("#portfolioView").evaluate((el, t) => el.classList.contains("portfolio-template-" + t), template), "Live preview did not apply selected template layout: " + template);
      const compositionClass = { classic: "", cv: "cv-layout", engineering: "engineering-layout", marketing: "marketing-layout", rose: "rose-layout", "resume-sidebar": "resume-sidebar-layout", "resume-creative": "resume-creative-layout" }[template];
      if (compositionClass) assert(await page.frameLocator("#portfolioLivePreview iframe").locator("#portfolioView ." + compositionClass).count() === 1, template + " must render its own page composition");
      const avatarSelector = template === "cv" ? ".cv-avatar" : ".profile-avatar img";
      assert(await page.frameLocator("#portfolioLivePreview iframe").locator("#portfolioView " + avatarSelector).count() === 1, template + " must display the profile photo");

    }
    for (const key of ["style", "colors", "fonts", "layout", "profile", "content", "sharing"]) {
      await page.locator(`#portfolioDesigner [data-designer-tab="${key}"]`).click();
      assert(await page.locator(`#portfolioDesigner [data-designer-pane="${key}"]`).isVisible(), `Gallery designer tab ${key} did not show its panel`);
      assert(await page.locator("#portfolioDesigner [data-designer-pane]:visible").count() === 1, "Gallery designer shows multiple panels at once");
    }
    await page.locator('#portfolioDesigner [data-designer-tab="profile"]').click();
    const experienceToggle = page.locator("#galleryShowExperience");
    await experienceToggle.check();
    const bioToggle = page.locator("#galleryShowBio");
    await bioToggle.uncheck();
    await page.locator("#galleryProfileNameColor").fill("#123456");
    await page.locator('#portfolioDesigner [data-designer-tab="sharing"]').click();
    assert(await page.locator("#galleryContactSettings #galleryContactButtonColor").count() === 1, "Contact appearance controls are not in the sharing section");
    await page.locator("#galleryContactButtonColor").fill("#123456");
    await page.locator("#galleryContactButtonTextColor").fill("#ffffff");
    await page.locator("#galleryContactButtonSize").selectOption("large");
    await page.locator("#galleryContactButtonPosition").selectOption("center");
    const gallerySettings = await page.evaluate(() => window.MadaApp.getState().portfolioSettings);
    assert(gallerySettings.showExperience === true, "Gallery profile information toggle did not save");
    assert(gallerySettings.showBio === false, "Gallery bio visibility toggle did not save");
    assert(gallerySettings.profileNameColor === "#123456", "Profile card name color did not save");
    assert(gallerySettings.contactButtonColor === "#123456" && gallerySettings.contactButtonSize === "large" && gallerySettings.contactButtonPosition === "center", "Contact button customization did not save");
    await page.locator('#portfolioDesignerModal [data-close="portfolioDesignerModal"]').click();
    await page.locator("#publishPortfolioBtn").click();
    await page.waitForFunction(() => /تم نشر المعرض بنجاح/.test(document.querySelector("#portfolioShareStatus")?.textContent || ""), undefined, { timeout: 5000 });
    assert(lastPublishedPayload && lastPublishedPayload.portfolio.display.showBio === false, "Bio visibility setting was not included in the published gallery payload");
    assert(lastPublishedPayload.portfolio.display.profileNameColor === "#123456", "Profile card style was not included in the published gallery payload");
    await page.locator("#previewPortfolioBtn").click();
    await page.waitForFunction(() => document.querySelector("#portfolioPublicPreviewModal")?.classList.contains("open"), undefined, { timeout: 5000 });
    const previewFrame = page.locator("#portfolioPublicPreviewFrame");
    await previewFrame.waitFor({ state: "attached", timeout: 3000 });
    assert((await previewFrame.getAttribute("src") || "").includes("/masar-platform/portfolio.html?preview=1"), "Gallery preview did not load the in-page public preview frame");
    await page.locator("#portfolioPublicPreviewModal .project-details-actions [data-close=\"portfolioPublicPreviewModal\"]").click();
    assert(!(await page.locator("#portfolioPublicPreviewModal").evaluate(el => el.classList.contains("open"))), "Gallery preview dialog did not close");
    console.log("PASS gallery content toggles, contact button appearance controls, and in-page public preview");

    await page.locator('[data-page="studio"]').first().click();
    await page.waitForFunction(() => document.querySelector("#page-studio")?.classList.contains("active"), undefined, { timeout: 5000 });
    await page.locator("#newBlankDesign").click();
    try {
      await page.waitForFunction(() => document.querySelector("#customEditorModal")?.classList.contains("open"), undefined, { timeout: 5000 });
    } catch (_) {
      const debug = await page.evaluate(() => ({
        activePage: document.querySelector(".page.active")?.id,
        editorClass: document.querySelector("#customEditorModal")?.className,
        gateClass: document.querySelector("#madaAccessGate")?.className,
        runtimeErrors: window.__madaBrowserErrors || []
      }));
      throw new Error("New design button did not open the editor: " + JSON.stringify({ debug, errors }));
    }
    const customPage = page.locator("#customPage");
    const initialElements = await customPage.locator(".custom-page-element").count();
    await page.locator("#addTextElement").click();
    await page.waitForFunction(n => document.querySelectorAll("#customPage .custom-page-element").length === n + 1, initialElements, { timeout: 3000 });
    await page.locator("#customUndo").click();
    await page.waitForFunction(n => document.querySelectorAll("#customPage .custom-page-element").length === n, initialElements, { timeout: 3000 });
    await page.locator("#customRedo").click();
    await page.waitForFunction(n => document.querySelectorAll("#customPage .custom-page-element").length === n + 1, initialElements, { timeout: 3000 });
    const zoomBefore = await page.locator("#customZoomValue").textContent();
    await page.locator("#customZoomIn").click();
    assert(await page.locator("#customZoomValue").textContent() !== zoomBefore, "Custom editor zoom button did not respond");
    await page.locator(".custom-shapes-menu > summary").click();
    await page.locator("#addCircleElement").click();
    await page.waitForFunction(n => document.querySelectorAll("#customPage .custom-page-element").length === n + 2, initialElements, { timeout: 3000 });
    await page.locator("#saveCustomDesignTop").click();
    assert(!errors.length, "Uncaught browser exceptions in custom editor: " + errors.join(" | "));
    console.log("PASS custom editor add, undo, redo, zoom, shape, and save buttons");
    await page.locator('#customEditorModal [data-close="customEditorModal"]').click();
    console.log("PASS new-design button opens and closes the editor");

    const deleteButton = page.locator("[data-delete-design]").first();
    assert(await deleteButton.count() === 1, "Newly created design did not appear in the saved designs list");
    page.once("dialog", dialog => dialog.accept());
    await deleteButton.click();
    await page.waitForFunction(() => document.querySelectorAll("[data-delete-design]").length === 0, undefined, { timeout: 5000 });
    assert(!errors.length, "Uncaught browser exceptions after deleting a design: " + errors.join(" | "));
    console.log("PASS delete-design button removes a saved design after confirmation");

    await page.locator('[data-page="growth"]').first().click();
    await page.waitForSelector("#growthLocaleToggle", { timeout: 5000 });
    const locale = page.locator("#growthLocaleToggle");
    const before = await locale.textContent();
    await locale.click();
    await page.waitForFunction(old => document.querySelector("#growthLocaleToggle")?.textContent !== old, before, { timeout: 5000 });
    assert(!errors.length, "Uncaught browser exceptions after interaction tests: " + errors.join(" | "));
    console.log("PASS Growth Hub language toggle responds");

    console.log("PASS browser smoke suite: no uncaught JavaScript exceptions");
    await context.close();
  } catch (error) {
    console.error("FAIL browser smoke suite:", error.stack || error.message || error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})();
