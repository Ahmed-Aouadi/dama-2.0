(function () {
  "use strict";
  const API = "/api/account";
  let user = null, syncing = false, pending = null, syncTimer = null, activeMode = "login", avatarUrl = "";
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
  // Keep the private workspace inaccessible until a server-verified session exists.
  const accessGate = document.createElement("div");
  accessGate.id = "madaAccessGate";
  accessGate.setAttribute("role", "dialog");
  accessGate.setAttribute("aria-modal", "true");
  accessGate.setAttribute("aria-labelledby", "madaAccessGateTitle");
  accessGate.innerHTML = '<section class="mada-access-card"><span class="mada-access-mark"><svg viewBox="0 0 104 72" aria-hidden="true"><use href="#mada-mark"/></svg></span><p class="mada-access-kicker">مساحة خاصة بحسابك</p><h1 id="madaAccessGateTitle">سجّل الدخول للمتابعة</h1><p>إنشاء المشاريع وتعديلها وحفظها ونشرها وإدارة معرض أعمالك متاح بعد تسجيل الدخول إلى حسابك. أعمالك الخاصة لا تُفتح للزوار.</p><button type="button" id="madaAccessLogin" class="mada-auth-submit">تسجيل الدخول أو إنشاء حساب</button><small>يمكنك تصفح معارض الأعمال العامة عبر روابطها المباشرة.</small></section>';
  document.body.appendChild(accessGate);
  const gateStyle = document.createElement("style");
  gateStyle.textContent = '#madaAccessGate{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(247,246,251,.97);backdrop-filter:blur(12px);direction:rtl}#madaAccessGate.show{display:flex}#madaAccessGate .mada-access-card{width:min(460px,100%);padding:34px 28px;border:1px solid #e9e6f1;border-radius:26px;background:#fff;box-shadow:0 24px 80px #211e3512;text-align:center;color:#17152b}#madaAccessGate .mada-access-mark{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 17px;border-radius:19px;background:#5b46e6;color:#fff;font-size:30px;font-weight:800}#madaAccessGate .mada-access-kicker{font-size:11px;font-weight:800;color:#5b46e6;margin:0 0 9px}#madaAccessGate h1{font-size:25px;line-height:1.5;margin:0 0 10px}#madaAccessGate .mada-access-card>p:not(.mada-access-kicker){font-size:13px;line-height:2;color:#6a6882;margin:0 0 20px}#madaAccessGate .mada-auth-submit{margin:0 0 13px}#madaAccessGate small{display:block;font-size:10px;line-height:1.8;color:#8a879a}';
  document.head.appendChild(gateStyle);
  $("madaAccessLogin").addEventListener("click", () => open("login"));
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
    if (!response.ok) throw new Error(result.error || "تعذّر إكمال الطلب.");
    return result;
  }
  function setUser(nextUser) {
    user = nextUser || null;
    accessGate.classList.toggle("show", !user);
    document.body.classList.toggle("mada-auth-required", !user);
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
  async function publishDesign(design, designId, isPublic, priceDzd) {
    if (!user) throw new Error("سجّل الدخول أولًا لنشر القالب.");
    const result = await request("publish-design", "POST", { design, designId, isPublic: !!isPublic, priceDzd: Number(priceDzd) || 0 });
    return { ...result, url: new URL("share.html?id=" + encodeURIComponent(result.designId), window.location.href).href };
  }
  async function sync(data) {
    if (!user || !data) return;
    pending = data; if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async function flush() {
      if (!user || !pending || syncing) return;
      const snapshot = pending; pending = null; syncing = true;
      try { await request("data", "POST", { data: snapshot }); }
      catch (error) { if (error.message.includes("سجّل الدخول") || error.message.includes("انتهت الجلسة")) { setUser(null); showError("انتهت الجلسة. سجّل الدخول مجددًا لمزامنة بياناتك."); } else if (window.MadaApp && window.MadaApp.toast) { window.MadaApp.toast(error.message && error.message.includes("كبيرة") ? "بياناتك كبيرة جدًا للمزامنة. قلّل حجم الصور أو استخدم روابط مباشرة." : "تعذّرت المزامنة مع حسابك. بياناتك محفوظة على هذا الجهاز وسنحاول مجددًا عند التعديل التالي."); } }
      finally { syncing = false; if (pending) sync(pending); }
    }, 650);
  }
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
  function mergeSavedItems() {
    const groups = Array.from(arguments);
    const itemsById = new Map();
    groups.forEach(function (items) {
      (Array.isArray(items) ? items : []).forEach(function (item) {
        if (!item || item.id == null) return;
        const id = String(item.id);
        const previous = itemsById.get(id);
        if (!previous) { itemsById.set(id, item); return; }
        const previousTime = Date.parse(previous.updated || previous.created || "") || 0;
        const nextTime = Date.parse(item.updated || item.created || "") || 0;
        if (nextTime >= previousTime) itemsById.set(id, item);
      });
    });
    return Array.from(itemsById.values());
  }
  async function restoreAccountData(migrateGuest) {
    if (!user || !window.MadaApp) return;
    const guestState = window.MadaApp.getState();
    window.MadaApp.setKey("mada-platform-v1:" + user.id);
    const result = await request("data", "GET");
    // The account-local cache may change while the cloud request is in flight.
    // Merge guest, current local and cloud records instead of replacing old work.
    const latestState = window.MadaApp.getState();
    const cloudState = result.data && typeof result.data === "object" ? result.data : null;
    const guestHasContent = hasMeaningfulProfile(guestState) ||
      ["projects", "designs", "quizzes"].some(key => Array.isArray(guestState[key]) && guestState[key].length > 0) ||
      hasMeaningfulGrowth(guestState);
    const cloudIsEmpty = !cloudState ||
      (!hasMeaningfulProfile(cloudState) &&
       !["projects", "designs", "quizzes"].some(key => Array.isArray(cloudState[key]) && cloudState[key].length > 0) &&
       !hasMeaningfulGrowth(cloudState));
    const baseState = cloudState && !(migrateGuest && cloudIsEmpty && guestHasContent)
      ? cloudState
      : (migrateGuest && guestHasContent ? guestState : latestState);
    const restoredState = Object.assign({}, baseState, {
      projects: mergeSavedItems(guestState.projects, latestState.projects, cloudState && cloudState.projects),
      designs: mergeSavedItems(guestState.designs, latestState.designs, cloudState && cloudState.designs),
      quizzes: mergeSavedItems(guestState.quizzes, latestState.quizzes, cloudState && cloudState.quizzes)
    });
    const needsName = !restoredState.profile || !restoredState.profile.name;
    const needsCloudMerge = !cloudState ||
      ["projects", "designs", "quizzes"].some(key =>
        JSON.stringify(restoredState[key]) !== JSON.stringify(Array.isArray(cloudState[key]) ? cloudState[key] : [])
      );
    window.MadaApp.applyCloudState(restoredState, user.name);
    if (needsName || needsCloudMerge) {
      await request("data", "POST", { data: window.MadaApp.getState() });
    }
  }
  async function logout() {
    const confirmed = window.confirm("هل تريد تسجيل الخروج من حسابك في مَدى؟\n\nستبقى بيانات ملفك ومشاريعك محفوظة في حسابك، ويمكنك العودة إليها عند تسجيل الدخول مرة أخرى.");
    if (!confirmed) return;
    try { await request("logout", "POST", {}); } catch (_) {}
    user = null; pending = null; if (syncTimer) clearTimeout(syncTimer); setUser(null);
    if (window.MadaApp) { window.MadaApp.setKey("mada-platform-v1"); window.MadaApp.applyCloudState(null); }
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
      setUser(result.user); await restoreAccountData(true); close();
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
    user = null; pending = null;
    if (syncTimer) clearTimeout(syncTimer);
    setUser(null);
    if (window.MadaApp) { window.MadaApp.setKey("mada-platform-v1"); window.MadaApp.applyCloudState(null); }
    return result;
  }
  window.MadaAuth = { sync, getUser: () => user, open, logout, setAvatar, syncProfileName, publishDesign, updateAccount, deleteAccount };
  renderMode();
  request("me", "GET").then(async result => {
    if (!result.user) { setUser(null); return; }
    setUser(result.user);
    try { await restoreAccountData(true); } catch (error) { console.error("Mada cloud restore failed:", error.message); }
  }).catch(error => { setUser(null); console.warn("Mada account service unavailable:", error.message); var note = accessGate.querySelector("small"); if (note) note.textContent = "تعذّر الاتصال بخدمة الحساب الآن. تحقق من اتصالك بالإنترنت ثم أعد تحميل الصفحة."; });
})();
