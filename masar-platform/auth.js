(function () {
  "use strict";
  const API = "/api/account";
  let user = null, syncing = false, pending = null, syncTimer = null, activeMode = "login", avatarUrl = "", restoring = true, syncRetryDelay = 1200;
  const style = document.createElement("style");
  style.textContent = `
    .mada-auth-button{border:1px solid #e9e6f1;background:#fff;color:#6d4aff;border-radius:12px;padding:10px 14px;font:700 13px Arial,sans-serif;cursor:pointer;white-space:nowrap}
    .mada-auth-user{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e9e6f1;padding:5px 7px 5px 11px;border-radius:14px;font-size:12px;font-weight:700}
    .mada-auth-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#eee9ff;color:#6d4aff}
    .mada-auth-logout{border:0;background:#f7f6fb;border-radius:9px;padding:7px;cursor:pointer;color:#77758b}
    .mada-auth-backdrop{position:fixed;inset:0;background:linear-gradient(#16132ac9,#16132ac9),url("/madaicon/background%20icon.png") center/ min(75vw,650px) no-repeat #16132ac9;z-index:100;display:none;align-items:center;justify-content:center;padding:16px}
    .mada-auth-backdrop.open{display:flex}.mada-auth-card{width:min(430px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;padding:26px;box-shadow:0 30px 100px #0e0b2350;direction:rtl;color:#211e35}
    .mada-auth-brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}.mada-auth-mark{width:43px;height:43px;display:grid;place-items:center;border-radius:15px;background:#6d4aff;color:#fff;font-size:23px;font-weight:700;overflow:hidden;padding:3px;flex-shrink:0}.mada-auth-mark img{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit}
    .mada-auth-brand strong{font-size:20px}.mada-auth-brand small{display:block;color:#77758b;font-size:11px;margin-top:3px}
    .mada-auth-card h2{font-size:23px;margin:0 0 7px}.mada-auth-desc{font-size:12px;line-height:1.9;color:#77758b;margin:0 0 20px}
    .mada-auth-fields{display:grid;gap:13px}.mada-auth-field{display:grid;gap:7px}.mada-auth-field label{font-size:12px;font-weight:700}
    .mada-auth-field input{width:100%;box-sizing:border-box;border:1px solid #e9e6f1;border-radius:12px;padding:13px;background:#fff;color:#211e35;font:inherit;outline:none}
    .mada-auth-field input:focus{border-color:#8d75ff;box-shadow:0 0 0 3px #6d4aff12}
    .mada-auth-submit{width:100%;border:0;border-radius:12px;padding:13px;background:#6d4aff;color:#fff;font:700 14px Arial,sans-serif;cursor:pointer;margin-top:6px}
    .mada-auth-submit:disabled{opacity:.65;cursor:wait}.mada-auth-switch{width:100%;border:0;background:transparent;color:#6d4aff;padding:13px 5px 3px;font:600 12px Arial,sans-serif;cursor:pointer}
    .mada-auth-close{float:left;border:0;background:#f1eff7;border-radius:10px;width:34px;height:34px;font-size:20px;cursor:pointer}
    .mada-auth-error{display:none;background:#fff0f3;color:#a52d4c;border-radius:11px;padding:10px 12px;font-size:12px;line-height:1.7}.mada-auth-error.show{display:block}
    .mada-auth-note{font-size:10px;color:#9995a9;line-height:1.8;margin-top:13px}
    @media(max-width:600px){.mada-auth-user span.mada-auth-name{max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mada-auth-card{padding:22px}}
  `;
  style.textContent += `
    .mada-auth-card{width:min(450px,100%);background:linear-gradient(155deg,#fff,#fbfaff);border:1px solid #ffffffd9}
    .mada-auth-field input{padding:14px;border-color:#e5e1f0;border-radius:13px;transition:border-color .18s,box-shadow .18s}
    .mada-auth-field input::placeholder{color:#aaa6ba;font-size:12px}
    .mada-auth-submit{padding:14px;border-radius:13px;background:linear-gradient(110deg,#6d4aff,#846bff);box-shadow:0 8px 18px #6d4aff26;transition:transform .18s,box-shadow .18s}
    .mada-auth-submit:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 11px 22px #6d4aff38}
    .mada-auth-show-password{display:flex;gap:8px;align-items:center;font-size:11px;color:#77758b;cursor:pointer}
    .mada-auth-show-password input{accent-color:#6d4aff}
    .mada-auth-backdrop [hidden],#madaAccessGate [hidden]{display:none!important}
    .mada-access-loading{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 16px;padding:12px;border-radius:12px;background:#f5f2ff;color:#6550bc;font-size:12px;line-height:1.8}
    .mada-access-spinner{width:18px;height:18px;flex:0 0 18px;border:2px solid #dcd4ff;border-top-color:#6d4aff;border-radius:50%;animation:madaAuthSpin .75s linear infinite}
    @keyframes madaAuthSpin{to{transform:rotate(360deg)}}
    @media(max-width:480px){.mada-auth-card{padding:20px;border-radius:21px}}
  `;
  document.head.appendChild(style);
  const backdrop = document.createElement("div");
  backdrop.className = "mada-auth-backdrop"; backdrop.id = "madaAuthBackdrop";
  backdrop.innerHTML = `
    <section class="mada-auth-card" role="dialog" aria-modal="true" aria-labelledby="madaAuthTitle">
      <button class="mada-auth-close" type="button" id="madaAuthClose" aria-label="إغلاق">×</button>
      <div class="mada-auth-brand"><span class="mada-auth-mark"><img src="/madaicon/mainicon.png" alt="شعار مَدى"></span><div><strong>مَدى</strong><small>مساحة تصنع مستقبلك</small></div></div>
      <h2 id="madaAuthTitle">مرحبًا بعودتك</h2><p class="mada-auth-desc" id="madaAuthDesc">سجّل الدخول للوصول إلى إنجازاتك ومتابعة رحلتك.</p>
      <form class="mada-auth-fields" id="madaAuthForm" autocomplete="on">
        <div class="mada-auth-field" id="madaAuthNameField" hidden><label for="madaAuthName">الاسم الكامل</label><input id="madaAuthName" name="name" maxlength="60" autocomplete="name" /></div>
        <div class="mada-auth-field"><label for="madaAuthUsername">اسم المستخدم</label><input id="madaAuthUsername" name="username" required minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="مثال: ahmed_24" /></div>
        <div class="mada-auth-field"><label for="madaAuthPassword">كلمة المرور</label><input id="madaAuthPassword" name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" placeholder="8 أحرف على الأقل" /></div>
        <label class="mada-auth-show-password"><input id="madaAuthShowPassword" type="checkbox"> إظهار كلمة المرور</label>
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
  accessGate.innerHTML = '<section class="mada-access-card"><span class="mada-access-mark"><img src="/madaicon/mainicon.png" alt="شعار مَدى"></span><p class="mada-access-kicker" id="madaAccessGateKicker">مساحة خاصة بحسابك</p><h1 id="madaAccessGateTitle">سجّل الدخول للمتابعة</h1><p id="madaAccessGateMessage">إنشاء المشاريع وتعديلها وحفظها ونشرها وإدارة معرض أعمالك متاح بعد تسجيل الدخول إلى حسابك. أعمالك الخاصة لا تُفتح للزوار.</p><div class="mada-access-loading" id="madaAccessLoading" hidden><span class="mada-access-spinner" aria-hidden="true"></span><span>نجهّز مساحتك ونستعيد بياناتك بأمان…</span></div><button type="button" id="madaAccessLogin" class="mada-auth-submit">تسجيل الدخول أو إنشاء حساب</button><small id="madaAccessGateHint">يمكنك تصفح معارض الأعمال العامة عبر روابطها المباشرة.</small></section>';
  document.body.appendChild(accessGate);
  const gateStyle = document.createElement("style");
  gateStyle.textContent = '#madaAccessGate{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;padding:22px;background:linear-gradient(rgba(247,246,251,.91),rgba(247,246,251,.91)),url("/madaicon/background%20icon.png") center/ min(75vw,650px) no-repeat;background-color:#f7f6fb;backdrop-filter:blur(12px);direction:rtl}#madaAccessGate.show{display:flex}#madaAccessGate .mada-access-card{width:min(460px,100%);padding:clamp(24px,5vw,38px) clamp(20px,5vw,30px);border:1px solid #e9e6f1;border-radius:26px;background:linear-gradient(155deg,#fff,#fbfaff);box-shadow:0 24px 80px #211e3512;text-align:center;color:#211e35}#madaAccessGate .mada-access-mark{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 17px;border-radius:19px;background:#6d4aff;color:#fff;font-size:30px;font-weight:800;overflow:hidden;padding:3px;box-sizing:border-box}#madaAccessGate .mada-access-mark img{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit}#madaAccessGate .mada-access-kicker{font-size:11px;font-weight:800;color:#6d4aff;margin:0 0 9px}#madaAccessGate h1{font-size:clamp(22px,5vw,27px);line-height:1.5;margin:0 0 10px}#madaAccessGate .mada-access-card>p:not(.mada-access-kicker){font-size:13px;line-height:2;color:#77758b;margin:0 0 20px}#madaAccessGate .mada-auth-submit{margin:0 0 13px}#madaAccessGate small{display:block;font-size:10px;line-height:1.8;color:#8a879a}@media(max-width:480px){#madaAccessGate{padding:14px}#madaAccessGate .mada-access-card{border-radius:22px}}';
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
    if (!response.ok) {
      const error = new Error(result.error || "تعذّر إكمال الطلب.");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function setUser(nextUser) {
    user = nextUser || null;
    accessGate.classList.toggle("show", !user || restoring);
    document.body.classList.toggle("mada-auth-required", !user || restoring);
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
  function setRestoring(value) {
    restoring = !!value;
    accessGate.classList.toggle("is-loading", restoring);
    accessGate.classList.toggle("show", !user || restoring);
    document.body.classList.toggle("mada-auth-required", !user || restoring);
    $("madaAccessLoading").hidden = !restoring;
    $("madaAccessLogin").hidden = restoring;
    $("madaAccessGateHint").hidden = restoring;
    $("madaAccessGateKicker").textContent = restoring ? "لحظة واحدة فقط" : "مساحة خاصة بحسابك";
    $("madaAccessGateTitle").textContent = restoring ? "نجهّز مساحتك" : "سجّل الدخول للمتابعة";
    $("madaAccessGateMessage").textContent = restoring
      ? "نتحقق من جلستك ونحمّل آخر نسخة محفوظة من ملفك ومشاريعك قبل فتح المساحة."
      : "إنشاء المشاريع وتعديلها وحفظها ونشرها وإدارة معرض أعمالك متاح بعد تسجيل الدخول إلى حسابك. أعمالك الخاصة لا تُفتح للزوار.";
  }
  function setAvatar(photo) {
    avatarUrl = photo || "";
    const el = authButton.querySelector(".mada-auth-avatar");
    if (!el) return;
    el.textContent = avatarUrl ? "" : "م";
    el.style.backgroundImage = avatarUrl ? 'url("' + avatarUrl + '")' : "";
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
    pending = data;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, 650);
  }
  async function flushSync() {
    syncTimer = null;
    if (!user || !pending || syncing) return;
    const snapshot = pending;
    pending = null;
    syncing = true;
    try {
      await request("data", "POST", { data: snapshot });
      syncRetryDelay = 1200;
    } catch (error) {
      if (error.status === 401 || error.message.includes("سجّل الدخول") || error.message.includes("انتهت الجلسة")) {
        pending = null;
        setUser(null);
        if (backdrop.classList.contains("open")) showError("انتهت الجلسة. سجّل الدخول مجددًا لمزامنة بياناتك.");
      } else if (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
        // A rejected payload will not succeed on retry; keep the local copy and ask the user to reduce it.
        pending = null;
        if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast("حُفظت بياناتك على هذا الجهاز، لكن تعذّرت مزامنتها. قلّل حجم الملفات أو الصور ثم أعد الحفظ.");
        console.warn("Mada cloud sync rejected:", error.status, error.message);
      } else {
        // Keep the newest snapshot queued and retry transient network/server failures.
        pending = pending || snapshot;
        syncRetryDelay = Math.min(syncRetryDelay * 2, 15000);
      }
    } finally {
      syncing = false;
      if (pending && user && !syncTimer) syncTimer = setTimeout(flushSync, syncRetryDelay);
    }
  }
  function compressRestoredPhoto(photo) {
    return new Promise(function (resolve, reject) {
      if (typeof photo !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo) || photo.length <= 65000) {
        resolve(photo || "");
        return;
      }
      const image = new Image();
      image.onload = function () {
        try {
          const width = image.naturalWidth || image.width;
          const height = image.naturalHeight || image.height;
          if (!width || !height) throw new Error("Invalid profile image dimensions");
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas is unavailable");
          let encoded = "";
          for (const side of [192, 144, 112, 88, 64]) {
            const scale = Math.min(1, side / Math.max(width, height));
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            for (const quality of [0.72, 0.56, 0.42, 0.3]) {
              encoded = canvas.toDataURL("image/jpeg", quality);
              if (encoded.length <= 65000) break;
            }
            if (encoded.length <= 65000) break;
          }
          if (!encoded || encoded.length > 65000) throw new Error("Could not compress profile image");
          resolve(encoded);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = function () { reject(new Error("Could not decode profile image")); };
      image.src = photo;
    });
  }
  async function restoreAccountData(migrateGuest) {
    if (!user || !window.MadaApp) return;
    const guestState = window.MadaApp.getState();
    window.MadaApp.setKey("mada-platform-v1:" + user.id);
    const result = await request("data", "GET");
    // Preserve projects created while the account's cloud data was loading.
    const latestState = window.MadaApp.getState();
    const originalProjectIds = new Set((guestState.projects || []).map(project => String(project.id)));
    const cloudProjects = result.data && Array.isArray(result.data.projects) ? result.data.projects : [];
    const cloudProjectIds = new Set(cloudProjects.map(project => String(project.id)));
    const projectsAddedDuringRestore = (latestState.projects || []).filter(project =>
      !originalProjectIds.has(String(project.id)) && !cloudProjectIds.has(String(project.id))
    );
    const guestHasContent = !!(guestState.profile && (guestState.profile.name || guestState.profile.role || guestState.profile.bio || guestState.profile.skills || guestState.profile.photo)) ||
      ["projects", "designs", "quizzes"].some(key => Array.isArray(guestState[key]) && guestState[key].length > 0);
    const cloudIsEmpty = !result.data ||
      (!(result.data.profile && (result.data.profile.name || result.data.profile.role || result.data.profile.bio || result.data.profile.skills || result.data.profile.photo)) &&
       !["projects", "designs", "quizzes"].some(key => Array.isArray(result.data[key]) && result.data[key].length > 0));
    if (result.data && !(migrateGuest && cloudIsEmpty && guestHasContent)) {
      const needsName = !result.data.profile || !result.data.profile.name;
      const restoredData = Object.assign({}, result.data);
      restoredData.profile = Object.assign({}, result.data.profile || {});
      let photoWasCompressed = false;
      if (typeof restoredData.profile.photo === "string" && restoredData.profile.photo.length > 65000) {
        try {
          restoredData.profile.photo = await compressRestoredPhoto(restoredData.profile.photo);
          photoWasCompressed = true;
        } catch (photoError) {
          // Keep the original cloud photo if it cannot be decoded; never block login or overwrite it with a blank value.
          console.warn("Mada profile photo compression skipped:", photoError && photoError.message);
        }
      }
      const restoredState = Object.assign({}, restoredData, {
        projects: projectsAddedDuringRestore.concat(cloudProjects)
      });
      window.MadaApp.applyCloudState(restoredState, user.name);
      // A missing display name alone must not trigger a full multi-megabyte account rewrite.
      // Save only when state actually changed or a legacy oversized avatar was successfully reduced.
      if (projectsAddedDuringRestore.length || photoWasCompressed) {
        await request("data", "POST", { data: window.MadaApp.getState() });
      }
    } else {
      const initialState = migrateGuest && guestHasContent ? Object.assign({}, guestState, {
        projects: projectsAddedDuringRestore.concat(guestState.projects || [])
      }) : Object.assign({}, latestState, {
        projects: projectsAddedDuringRestore.concat(latestState.projects || [])
      });
      window.MadaApp.applyCloudState(initialState, user.name);
      await request("data", "POST", { data: window.MadaApp.getState() });
    }
  }
  async function restoreSafely(migrateGuest) {
    const fallbackState = window.MadaApp ? window.MadaApp.getState() : null;
    try {
      await restoreAccountData(migrateGuest);
    } catch (error) {
      if (window.MadaApp && fallbackState) {
        window.MadaApp.setKey("mada-platform-v1");
        window.MadaApp.applyCloudState(fallbackState);
      }
      throw error;
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
      setRestoring(true);
      setUser(result.user);
      try { await restoreSafely(true); }
      catch (restoreError) { console.error("Mada account restore failed:", { status: restoreError && restoreError.status, message: restoreError && restoreError.message }); setUser(null); setRestoring(false); const status = restoreError && restoreError.status; const message = status === 413 ? "بيانات الحساب كبيرة جدًا للمزامنة. لم نفتح المساحة ولم نحذف بياناتك؛ قلّل حجم الصور أو الملفات ثم أعد المحاولة." : status === 401 ? "انتهت جلسة الحساب أثناء استعادة البيانات. أعد تسجيل الدخول ثم حاول مجددًا." : status >= 500 ? "تم التحقق من الحساب، لكن خادم مَدى أو قاعدة البيانات تعذّر عليهما تحميل بياناتك. لم نفتح المساحة ببيانات غير مكتملة؛ حاول مجددًا لاحقًا." : status ? (restoreError.message || "تعذّرت استعادة بيانات الحساب. لم نفتح المساحة ببيانات غير مكتملة.") : "تعذّر الاتصال بخادم مَدى أثناء استعادة البيانات. تحقّق من الاتصال ثم أعد المحاولة؛ لم نفتح المساحة ببيانات غير مكتملة."; showError(message); return; }
      setRestoring(false); close();
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
  window.MadaAuth = { sync, getUser: () => user, open, logout, setAvatar, syncProfileName, publishDesign, updateAccount };
  renderMode();
  setRestoring(true);
  request("me", "GET").then(async result => {
    if (!result.user) { setUser(null); setRestoring(false); return; }
    setUser(result.user);
    try { await restoreSafely(true); setRestoring(false); }
    catch (error) {
      console.error("Mada cloud restore failed:", error.message);
      setUser(null); setRestoring(false);
      $("madaAccessGateMessage").textContent = "تعذّر تحميل بيانات الحساب بسبب مشكلة اتصال. أعد تسجيل الدخول بعد التأكد من اتصالك بالإنترنت.";
    }
  }).catch(error => {
    setUser(null); setRestoring(false);
    $("madaAccessGateMessage").textContent = "تعذّر الاتصال بخدمة الحساب. تحقّق من اتصالك ثم أعد المحاولة.";
    console.warn("Mada account service unavailable:", error.message);
  });
})();
