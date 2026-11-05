(function () {
  "use strict";
  const API = "/api/account";
  let user = null, syncing = false, pending = null, syncTimer = null, retryDelay = 1500, cloudRevision = 0, activeMode = "login", avatarUrl = "";
  // Cloud state restoration must finish before an explicit save can write a snapshot.
  let accountRestorePromise = Promise.resolve();
  const style = document.createElement("style");
  style.textContent = `
    .mada-auth-button{border:1px solid #e9e6f1;background:#fff;color:#5b46e6;border-radius:12px;padding:10px 14px;font:700 13px Arial,sans-serif;cursor:pointer;white-space:nowrap}
    .mada-auth-user{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e9e6f1;padding:5px 7px 5px 11px;border-radius:14px;font-size:12px;font-weight:700}
    .mada-auth-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#eee9ff;color:#5b46e6}
    .mada-auth-logout{border:0;background:#f6f4ff;border-radius:9px;padding:7px;cursor:pointer;color:#6a6882}
    .mada-auth-backdrop{position:fixed;inset:0;background:#16132ac9;z-index:100;display:none;align-items:center;justify-content:center;padding:16px}
    .mada-auth-backdrop.open{display:flex}.mada-auth-card{width:min(430px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;padding:26px;box-shadow:0 30px 100px #0e0b2350;direction:rtl;color:#17152b}
    .mada-auth-brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}.mada-auth-mark{width:43px;height:43px;display:grid;place-items:center;border-radius:15px;background:#5b46e6;color:#fff;font-size:23px;font-weight:700}
    .mada-auth-brand strong{font-size:20px}.mada-auth-brand small{display:block;color:#6a6882;font-size:11px;margin-top:3px}
    .mada-auth-card h2{font-size:23px;margin:0 0 7px}.mada-auth-desc{font-size:12px;line-height:1.9;color:#6a6882;margin:0 0 20px}
    .mada-auth-fields{display:grid;gap:13px}.mada-auth-field{display:grid;gap:7px}.mada-auth-field label{font-size:12px;font-weight:700}
    .mada-auth-field input{width:100%;box-sizing:border-box;border:1px solid #e9e6f1;border-radius:12px;padding:13px;background:#fff;color:#17152b;font:inherit;outline:none}
    .mada-auth-field input:focus{border-color:#8b7bff;box-shadow:0 0 0 3px #6d4aff12}
    .mada-auth-submit{width:100%;border:0;border-radius:12px;padding:13px;background:#5b46e6;color:#fff;font:700 14px Arial,sans-serif;cursor:pointer;margin-top:6px}
    .mada-auth-submit:disabled{opacity:.65;cursor:wait}.mada-auth-switch{width:100%;border:0;background:transparent;color:#5b46e6;padding:13px 5px 3px;font:600 12px Arial,sans-serif;cursor:pointer}
    .mada-auth-close{float:left;border:0;background:#f1eff7;border-radius:10px;width:34px;height:34px;font-size:20px;cursor:pointer}
    .mada-auth-error{display:none;background:#fff0f3;color:#a52d4c;border-radius:11px;padding:10px 12px;font-size:12px;line-height:1.7}.mada-auth-error.show{display:block}
    .mada-auth-note{font-size:10px;color:#9995a9;line-height:1.8;margin-top:13px}
    @media(max-width:600px){.mada-auth-user span.mada-auth-name{max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mada-auth-card{padding:22px}}
  `;
  document.head.appendChild(style);
  const backdrop = document.createElement("div");
  backdrop.className = "mada-auth-backdrop"; backdrop.id = "madaAuthBackdrop";
  backdrop.innerHTML = `
    <section class="mada-auth-card" role="dialog" aria-modal="true" aria-labelledby="madaAuthTitle">
      <button class="mada-auth-close" type="button" id="madaAuthClose" aria-label="إغلاق">×</button>
      <div class="mada-auth-brand"><span class="mada-auth-mark"><svg viewBox="0 0 104 72" aria-hidden="true"><use href="#mada-mark"/></svg></span><div><strong>مَدى</strong><small>مساحة تصنع مستقبلك</small></div></div>
      <h2 id="madaAuthTitle">مرحبًا بعودتك</h2><p class="mada-auth-desc" id="madaAuthDesc">سجّل الدخول للوصول إلى إنجازاتك ومتابعة رحلتك.</p>
      <form class="mada-auth-fields" id="madaAuthForm" autocomplete="on">
        <div class="mada-auth-field" id="madaAuthNameField" hidden><label for="madaAuthName">الاسم الكامل</label><input id="madaAuthName" name="name" maxlength="60" autocomplete="name" /></div>
        <div class="mada-auth-field"><label for="madaAuthUsername">اسم المستخدم</label><input id="madaAuthUsername" name="username" required minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="مثال: ahmed_24" /></div>
        <div class="mada-auth-field"><label for="madaAuthPassword">كلمة المرور</label><input id="madaAuthPassword" name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" placeholder="8 أحرف على الأقل" /></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:11px;color:#6a6882"><input id="madaAuthShowPassword" type="checkbox" style="accent-color:#5b46e6"> إظهار كلمة المرور</label>
        <div class="mada-auth-error" id="madaAuthError" role="alert"></div><button class="mada-auth-submit" id="madaAuthSubmit" type="submit">تسجيل الدخول</button>
      </form>
      <button class="mada-auth-switch" type="button" id="madaAuthSwitch">ليس لديك حساب؟ أنشئ حسابًا جديدًا</button>
      <p class="mada-auth-note">لا نطلب بريدًا إلكترونيًا حاليًا. احفظ كلمة مرورك في مكان آمن؛ استعادة الحساب دون وسيلة تحقق غير متاحة بعد.</p>
    </section>`;
  document.body.appendChild(backdrop);
  const $ = id => document.getElementById(id);
  const authButton = document.createElement("button");
  authButton.type = "button"; authButton.className = "mada-auth-button"; authButton.id = "madaAuthButton"; authButton.textContent = "تسجيل الدخول";
  const actions = document.querySelector(".top-actions");
  if (actions) actions.insertBefore(authButton, actions.firstChild);
  const syncStatus = document.createElement("span");
  syncStatus.className = "mada-sync-status";
  syncStatus.id = "madaSyncStatus";
  syncStatus.setAttribute("role", "status");
  syncStatus.setAttribute("aria-live", "polite");
  syncStatus.textContent = "محفوظ على هذا الجهاز";
  if (actions) actions.insertBefore(syncStatus, authButton.nextSibling);
  const syncStyle = document.createElement("style");
  syncStyle.textContent = '.mada-sync-status{display:inline-flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid #e9e6f1;border-radius:10px;background:#fff;color:#6a6882;font-size:10px;font-weight:700;white-space:nowrap}.mada-sync-status:before{content:"";width:6px;height:6px;border-radius:50%;background:#34a879}.mada-sync-status[data-status="syncing"]:before,.mada-sync-status[data-status="pending"]:before{background:#d99b36}.mada-sync-status[data-status="error"]:before{background:#c54b62}@media(max-width:600px){.mada-sync-status{font-size:9px;padding:6px 7px}.top-actions{gap:6px}}';
  document.head.appendChild(syncStyle);
  function setSyncStatus(status, label) { syncStatus.dataset.status = status; syncStatus.textContent = label; syncStatus.title = label; }
  // The workspace is available in local guest mode; an account only enables cloud sync and publishing.
  function showError(message) { const el = $("madaAuthError"); el.textContent = message || "تعذّر إكمال الطلب. حاول مرة أخرى."; el.classList.add("show"); }
  function hideError() { $("madaAuthError").classList.remove("show"); }
  function open(mode) { activeMode = mode || "login"; renderMode(); hideError(); backdrop.classList.add("open"); setTimeout(() => $(activeMode === "register" ? "madaAuthName" : "madaAuthUsername").focus(), 40); }
  function close() { backdrop.classList.remove("open"); }
  function renderMode() {
    const register = activeMode === "register";
    $("madaAuthNameField").hidden = !register;
    $("madaAuthName").required = register;
    $("madaAuthPassword").autocomplete = register ? "new-password" : "current-password";
    $("madaAuthTitle").textContent = register ? "أنشئ حسابك في مَدى" : "مرحبًا بعودتك";
    $("madaAuthDesc").textContent = register ? "حساب واحد يحفظ مشاريعك وإنجازاتك لتعود إليها من أي جهاز." : "سجّل الدخول للوصول إلى إنجازاتك ومتابعة رحلتك.";
    $("madaAuthSubmit").textContent = register ? "إنشاء الحساب" : "تسجيل الدخول";
    $("madaAuthSwitch").textContent = register ? "لديك حساب بالفعل؟ سجّل الدخول" : "ليس لديك حساب؟ أنشئ حسابًا جديدًا";
  }
  async function request(action, method, body) {
    const response = await fetch(API + "?action=" + encodeURIComponent(action), { method: method || "GET", credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(result.error || "تعذّر إكمال الطلب."); error.status = response.status; error.data = result; throw error; }
    return result;
  }
  function setUser(nextUser) {
    user = nextUser || null;
    
    document.dispatchEvent(new CustomEvent("mada:authchange", { detail: { user: user ? { id: user.id, username: user.username, name: user.name } : null } }));
    if (user) {
      authButton.className = "mada-auth-user";
      authButton.innerHTML = '<span class="mada-auth-avatar">م</span><span class="mada-auth-name"></span><span role="button" tabindex="0" class="mada-auth-logout" id="madaAuthLogout" aria-label="تسجيل الخروج" title="تسجيل الخروج">↪</span>';
      authButton.querySelector(".mada-auth-name").textContent = user.name || user.username;
      setAvatar(avatarUrl);
      authButton.onclick = function (event) { if (event.target.closest("#madaAuthLogout")) { event.stopPropagation(); logout(); } };
      authButton.querySelector("#madaAuthLogout").addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); logout(); } });
    } else { authButton.className = "mada-auth-button"; authButton.textContent = "تسجيل الدخول"; authButton.onclick = () => open("login"); }
  }
  function setAvatar(photo) {
    avatarUrl = photo || "";
    const el = authButton.querySelector(".mada-auth-avatar");
    if (!el) return;
    el.textContent = avatarUrl ? "" : "م";
    el.style.backgroundImage = avatarUrl && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(avatarUrl) ? 'url("' + avatarUrl + '")' : "";
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.color = avatarUrl ? "transparent" : "";
  }
  async function syncProfileName(name) {
    if (!user || !String(name || "").trim()) return;
    const result = await request("profile", "POST", { name: String(name).trim() });
    user = result.user;
    setUser(user);
  }
  async function publishDesign(design, designId, isPublic) {
    if (!user) throw new Error("سجّل الدخول أولًا لنشر القالب.");
    const result = await request("publish-design", "POST", { design, designId, isPublic: !!isPublic });
    return { ...result, url: new URL("share.html?id=" + encodeURIComponent(result.designId), window.location.href).href };
  }
  function sync(data) {
    if (!data) return;
    if (!user) { setSyncStatus("local", "محفوظ على هذا الجهاز"); return; }
    pending = data; setSyncStatus("pending", "بانتظار المزامنة");
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, 650);
  }
async function syncAndWait(data) {
    if (!data) throw new Error("لا توجد بيانات لحفظها.");
    // Login can expose the user before the account snapshot has finished loading.
    // Wait here so an early section save cannot race with restoreAccountData().
    await accountRestorePromise;
    if (!user) throw new Error("سجّل الدخول أولًا لحفظ المشروع في حسابك.");
    // Wait for an in-flight background sync instead of rejecting an explicit save.
    // Otherwise a quick section save can be left only in local storage.
    let waitCount = 0;
    while (syncing && waitCount < 200) {
      await new Promise(resolve => setTimeout(resolve, 50));
      waitCount++;
    }
    if (syncing) throw new Error("استغرقت المزامنة السابقة وقتًا طويلًا. أعد الحفظ بعد لحظات.");
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    pending = null;
    syncing = true; setSyncStatus("syncing", "جارٍ تثبيت المشروع في حسابك…");
    try {
      let snapshot = data;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const saved = await request("data", "POST", { data: snapshot, expectedRevision: cloudRevision });
          cloudRevision = Number(saved.revision || cloudRevision); pending = null; retryDelay = 1500;
          setSyncStatus("synced", "تم حفظ المشروع في حسابك"); return saved;
        } catch (error) {
          if (error.status !== 409 || !error.data || attempt === 2) throw error;
          const remote = error.data.data && typeof error.data.data === "object" ? error.data.data : {};
          try { localStorage.setItem("mada-sync-conflict-backup:" + user.id, JSON.stringify({version:1,savedAt:new Date().toISOString(),local:snapshot,remote})); } catch (_) {}
          cloudRevision = Number(error.data.revision || 0); snapshot = mergeAccountState(remote, snapshot);
          if (window.MadaApp) window.MadaApp.applyCloudState(snapshot, user.name);
        }
      }
    } catch (error) {
      pending = data; setSyncStatus("error", "تعذّر تثبيت المشروع سحابيًا");
      if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast("لم يتم تأكيد الحفظ السحابي. مشروعك باقٍ محليًا؛ أعد المحاولة.");
      throw error;
    } finally {
      syncing = false;
      if (pending && user) { if (syncTimer) clearTimeout(syncTimer); syncTimer = setTimeout(flushSync, retryDelay); }
    }
  }
    async function flushSync() {
    if (!user || !pending || syncing) return;
    const snapshot = pending; pending = null; syncing = true;
    setSyncStatus("syncing", "جارٍ الحفظ في حسابك…");
    try {
      const saved = await request("data", "POST", { data: snapshot, expectedRevision: cloudRevision });
      cloudRevision = Number(saved.revision || cloudRevision);
      retryDelay = 1500; setSyncStatus("synced", "تمت المزامنة");
    } catch (error) {
      if (error.status === 409 && error.data && user) {
        const remoteState = error.data.data && typeof error.data.data === "object" ? error.data.data : {};
        try { localStorage.setItem("mada-sync-conflict-backup:" + user.id, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), local: snapshot, remote: remoteState })); } catch (_) {}
        cloudRevision = Number(error.data.revision || 0);
        pending = mergeAccountState(remoteState, snapshot);
        if (window.MadaApp) window.MadaApp.applyCloudState(pending, user.name);
        retryDelay = 500;
        setSyncStatus("pending", "دمج تغييرات جهاز آخر…");
        if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast("اكتشفنا تعديلات من جهاز آخر. احتفظنا بنسخة محلية ودمجنا العناصر المختلفة قبل إعادة المزامنة.");
      } else {
      pending = snapshot;
      if (error.message.includes("سجّل الدخول") || error.message.includes("انتهت الجلسة")) {
        setUser(null); setSyncStatus("error", "انتهت الجلسة — بياناتك محفوظة محليًا");
      } else {
        setSyncStatus("error", "تعذّرت المزامنة — محفوظ محليًا");
        if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast(error.message && error.message.includes("كبيرة") ? "بياناتك كبيرة جدًا للمزامنة. قلّل حجم الصور أو استخدم روابط مباشرة." : "تعذّرت المزامنة الآن. بياناتك محفوظة على هذا الجهاز وستتم إعادة المحاولة تلقائيًا.");
      }
      }
    } finally {
      syncing = false;
      if (pending && user) { if (syncTimer) clearTimeout(syncTimer); syncTimer = setTimeout(flushSync, retryDelay); retryDelay = Math.min(retryDelay * 2, 60000); }
    }
  }
  window.addEventListener("online", function () { if (pending && user && !syncing) { if (syncTimer) clearTimeout(syncTimer); syncTimer = setTimeout(flushSync, 100); } });
  function hasMeaningfulProfile(data) {
    const profile = data && data.profile && typeof data.profile === "object" ? data.profile : {};
    return Object.values(profile).some(value => typeof value === "string" ? value.trim().length > 0 : !!value);
  }
  function hasMeaningfulGrowth(data) {
    const growth = data && data.growth && typeof data.growth === "object" ? data.growth : {};
    for (const key of ["skills", "history", "requests", "customTemplates"]) {
      if (Array.isArray(growth[key]) && growth[key].length) return true;
    }
    if (growth.paths && typeof growth.paths === "object" && Object.keys(growth.paths).length) return true;
    if (growth.locale && growth.locale !== "ar") return true;
    const cv = growth.cv && typeof growth.cv === "object" ? growth.cv : {};
    return ["name", "headline", "email", "phone", "city", "summary", "education", "experience", "projects", "skills"]
      .some(key => String(cv[key] || "").trim().length > 0);
  }
  function mergeAccountState(cloudValue, guestValue) {
    if (Array.isArray(cloudValue) || Array.isArray(guestValue)) {
      const cloud = Array.isArray(cloudValue) ? cloudValue : [];
      const guest = Array.isArray(guestValue) ? guestValue : [];
      const merged = [];
      const positions = new Map();
      function identity(item) {
        if (item && typeof item === "object" && !Array.isArray(item) && item.id != null) return "id:" + String(item.id);
        if (item && typeof item === "object" && !Array.isArray(item) && item.name) return "name:" + String(item.name).trim().toLocaleLowerCase();
        try { return "value:" + JSON.stringify(item); } catch (_) { return "value:" + String(item); }
      }
      cloud.concat(guest).forEach(item => {
        const key = identity(item);
        if (positions.has(key)) {
          const index = positions.get(key);
          if (item && typeof item === "object" && !Array.isArray(item)) merged[index] = mergeAccountState(merged[index], item);
          return;
        }
        positions.set(key, merged.length);
        merged.push(item);
      });
      return merged;
    }
    if (cloudValue && typeof cloudValue === "object" && !Array.isArray(cloudValue) ||
        guestValue && typeof guestValue === "object" && !Array.isArray(guestValue)) {
      const cloud = cloudValue && typeof cloudValue === "object" && !Array.isArray(cloudValue) ? cloudValue : {};
      const guest = guestValue && typeof guestValue === "object" && !Array.isArray(guestValue) ? guestValue : {};
      const result = {};
      new Set(Object.keys(guest).concat(Object.keys(cloud))).forEach(key => {
        if (key === "gallerySections" && Array.isArray(guest[key])) {
          // Legacy shape support: section lists are authoritative snapshots.
          result[key] = guest[key];
          return;
        }
        if (key === "portfolioSettings") {
          const c = cloud[key] && typeof cloud[key] === "object" ? cloud[key] : {};
          const g = guest[key] && typeof guest[key] === "object" ? guest[key] : {};
          const settings = mergeAccountState(c, g);
          // A guest browser often contains only the initial "general" section.
          // Do not let that empty/stale snapshot overwrite the account's saved sections.
          // A guest snapshot is authoritative only when it contains custom sections or
          // explicit deletion tombstones created by the section manager.
          const guestHasCustomSections = Array.isArray(g.gallerySections) &&
            g.gallerySections.some(section => section && String(section.id) !== "general");
          const guestHasSectionTombstones = Array.isArray(g.deletedGallerySectionIds) &&
            g.deletedGallerySectionIds.length > 0;
          const guestSectionsAreAuthoritative = guestHasCustomSections || guestHasSectionTombstones;
          if (guestSectionsAreAuthoritative && Array.isArray(g.gallerySections)) {
            settings.gallerySections = g.gallerySections;
          } else if (Array.isArray(c.gallerySections)) {
            settings.gallerySections = c.gallerySections;
          } else if (Array.isArray(g.gallerySections)) {
            settings.gallerySections = g.gallerySections;
          }
          const deletedSectionIds = Array.from(new Set([
            ...(Array.isArray(c.deletedGallerySectionIds) ? c.deletedGallerySectionIds : []),
            ...(Array.isArray(g.deletedGallerySectionIds) ? g.deletedGallerySectionIds : [])
          ].map(String)));
          if (deletedSectionIds.length) {
            settings.deletedGallerySectionIds = deletedSectionIds;
            if (Array.isArray(settings.gallerySections)) {
              settings.gallerySections = settings.gallerySections.filter(section =>
                section && (section.id === "general" || !deletedSectionIds.includes(String(section.id)))
              );
            }
          }
          if (guestSectionsAreAuthoritative && Object.prototype.hasOwnProperty.call(g, "defaultGallerySection")) {
            settings.defaultGallerySection = g.defaultGallerySection;
          } else if (Object.prototype.hasOwnProperty.call(c, "defaultGallerySection")) {
            settings.defaultGallerySection = c.defaultGallerySection;
          }
          result[key] = settings;
          return;
        }
        result[key] = key in cloud ? mergeAccountState(cloud[key], guest[key]) : guest[key];
      });
      return result;
    }
    const cloudIsEmpty = cloudValue == null || cloudValue === "";
    return cloudIsEmpty && guestValue != null ? guestValue : cloudValue;
  }
  async function restoreAccountData(migrateGuest) {
    if (!user || !window.MadaApp) return;
    // Capture the guest workspace before switching to the account-scoped key.
    const guestState = window.MadaApp.getState();
    const accountLocalState = window.MadaApp.getStoredState ? window.MadaApp.getStoredState("mada-platform-v1:" + user.id) : null;
    window.MadaApp.setKey("mada-platform-v1:" + user.id);
    let result;
    try { result = await request("data", "GET"); cloudRevision = Number(result.revision || 0); }
    catch (error) { window.MadaApp.setKey("mada-platform-v1"); window.MadaApp.applyCloudState(guestState); setSyncStatus("error", "تعذّر تحميل السحابة — تعمل الآن محليًا"); throw error; }
    const latestState = accountLocalState || {};
    const guestHasContent = hasMeaningfulProfile(guestState) ||
      ["projects", "records", "designs", "quizzes"].some(key => Array.isArray(guestState[key]) && guestState[key].length > 0) ||
      hasMeaningfulGrowth(guestState) ||
      Boolean(guestState.portfolioSettings && Array.isArray(guestState.portfolioSettings.gallerySections) && guestState.portfolioSettings.gallerySections.some(section => section && section.id !== "general"));
    const accountLocalHasContent = hasMeaningfulProfile(latestState) ||
      ["projects", "records", "designs", "quizzes"].some(key => Array.isArray(latestState[key]) && latestState[key].length > 0) ||
      hasMeaningfulGrowth(latestState) ||
      Boolean(latestState.portfolioSettings && Array.isArray(latestState.portfolioSettings.gallerySections) && latestState.portfolioSettings.gallerySections.some(section => section && section.id !== "general"));
    const cloudHasContent = result.data && (
      hasMeaningfulProfile(result.data) ||
      ["projects", "records", "designs", "quizzes"].some(key => Array.isArray(result.data[key]) && result.data[key].length > 0) ||
      hasMeaningfulGrowth(result.data) ||
      Boolean(result.data.portfolioSettings && Array.isArray(result.data.portfolioSettings.gallerySections) && result.data.portfolioSettings.gallerySections.some(section => section && section.id !== "general"))
    );
    let restoredState;
    if (migrateGuest && (guestHasContent || accountLocalHasContent)) {
      // Keep cloud records first, then retain unique guest and account-local records.
      // Non-empty cloud fields win; local snapshots fill missing values and preserve offline-only work.
      restoredState = mergeAccountState(result.data || {}, latestState);
      restoredState = mergeAccountState(restoredState, guestState);
    } else {
      restoredState = result.data && cloudHasContent ? result.data : (result.data || latestState);
    }
    // Once the account already has custom gallery sections, its cloud snapshot is
    // authoritative during login. A stale guest browser snapshot must not roll them
    // back or resurrect sections that were removed from the account.
    const cloudPortfolioSettings = result.data && result.data.portfolioSettings;
    const cloudHasCustomGallerySections = Boolean(
      cloudPortfolioSettings &&
      Array.isArray(cloudPortfolioSettings.gallerySections) &&
      cloudPortfolioSettings.gallerySections.some(section => section && String(section.id) !== "general")
    );
    if (cloudHasCustomGallerySections) {
      restoredState.portfolioSettings = Object.assign(
        {},
        restoredState.portfolioSettings || {},
        {
          gallerySections: cloudPortfolioSettings.gallerySections,
          defaultGallerySection: cloudPortfolioSettings.defaultGallerySection || "general",
          deletedGallerySectionIds: Array.isArray(cloudPortfolioSettings.deletedGallerySectionIds)
            ? cloudPortfolioSettings.deletedGallerySectionIds
            : []
        }
      );
    }
    window.MadaApp.applyCloudState(restoredState, user.name);
    // Persist the merged result so both the device and the account have the same snapshot.
    try {
      const saved = await request("data", "POST", { data: window.MadaApp.getState(), expectedRevision: cloudRevision });
      cloudRevision = Number(saved.revision || cloudRevision);
      setSyncStatus("synced", "تمت مزامنة بيانات الحساب");
    } catch (error) {
      if (error.status === 409 && error.data) {
        cloudRevision = Number(error.data.revision || 0);
        const merged = mergeAccountState(error.data.data || {}, window.MadaApp.getState());
        try { localStorage.setItem("mada-sync-conflict-backup:" + user.id, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), local: window.MadaApp.getState(), remote: error.data.data || {} })); } catch (_) {}
        window.MadaApp.applyCloudState(merged, user.name);
        sync(merged);
      } else {
        sync(window.MadaApp.getState());
        setSyncStatus("error", "تم الحفظ محليًا — بانتظار المزامنة");
      }
    }
  }
  async function logout() {
    const confirmed = window.confirm("هل تريد تسجيل الخروج من حسابك في مَدى؟\n\nستبقى بيانات ملفك ومشاريعك محفوظة في حسابك، ويمكنك العودة إليها عند تسجيل الدخول مرة أخرى.");
    if (!confirmed) return;
    try { await request("logout", "POST", {}); } catch (_) {}
    const guestState = window.MadaApp && window.MadaApp.getStoredState ? window.MadaApp.getStoredState("mada-platform-v1") : null;
    user = null; pending = null; cloudRevision = 0; if (syncTimer) clearTimeout(syncTimer); setUser(null);
    if (window.MadaApp) { window.MadaApp.setKey("mada-platform-v1"); window.MadaApp.applyCloudState(guestState); }
    setSyncStatus("local", "وضع الزائر — حفظ محلي");
  }
  $("madaAuthClose").addEventListener("click", close);
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  $("madaAuthSwitch").addEventListener("click", () => { activeMode = activeMode === "login" ? "register" : "login"; renderMode(); hideError(); });
  $("madaAuthShowPassword").addEventListener("change", event => { $("madaAuthPassword").type = event.target.checked ? "text" : "password"; });
  $("madaAuthForm").addEventListener("submit", async event => {
    event.preventDefault(); hideError();
    const register = activeMode === "register", username = $("madaAuthUsername").value.trim(), password = $("madaAuthPassword").value, name = $("madaAuthName").value.trim();
    const submit = $("madaAuthSubmit"); submit.disabled = true; submit.textContent = register ? "جارٍ إنشاء الحساب…" : "جارٍ تسجيل الدخول…";
    try {
      const result = await request(register ? "register" : "login", "POST", { username, password, name });
      setUser(result.user); accountRestorePromise = restoreAccountData(true); await accountRestorePromise; close();
      if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast(register ? "تم إنشاء حسابك وحفظ بياناتك" : "تم تسجيل الدخول ومزامنة بياناتك");
    } catch (error) { showError(error.message); }
    finally { submit.disabled = false; renderMode(); }
  });
  async function updateAccount(settings) {
    const result = await request("account-settings", "POST", settings || {});
    user = result.user;
    setUser(user);
    return result;
  }
  async function deleteAccount(password) {
    const result = await request("delete-account", "POST", { password: String(password || "") });
    const guestState = window.MadaApp && window.MadaApp.getStoredState ? window.MadaApp.getStoredState("mada-platform-v1") : null;
    user = null; pending = null; cloudRevision = 0;
    if (syncTimer) clearTimeout(syncTimer);
    setUser(null);
    if (window.MadaApp) { window.MadaApp.setKey("mada-platform-v1"); window.MadaApp.applyCloudState(guestState); }
    setSyncStatus("local", "وضع الزائر — حفظ محلي");
    return result;
  }
  window.MadaAuth = { sync, syncAndWait, waitForRestore: async () => { await accountRestorePromise; return !!user; }, getUser: () => user, open, logout, setAvatar, syncProfileName, publishDesign, updateAccount, deleteAccount, getSyncStatus: () => syncStatus.dataset.status || "local" };
  renderMode();
  accountRestorePromise = request("me", "GET").then(async result => {
    if (!result.user) { setUser(null); setSyncStatus("local", "وضع الزائر — حفظ محلي"); return; }
    setUser(result.user);
    try { await restoreAccountData(true); } catch (error) { console.error("Mada cloud restore failed:", error.message); }
  }).catch(error => { setUser(null); console.warn("Mada account service unavailable:", error.message); setSyncStatus("local", "وضع محلي — خدمة الحساب غير متاحة الآن"); });
})();
