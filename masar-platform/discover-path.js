/* "اكتشف مسارك" experience upgrade. No Creative Studio DOM, styles, or logic are touched. */
(function () {
  "use strict";
  async function initDiscoverPath() {
    var page = document.getElementById("page-careers");
    if (!page || page.dataset.pathRedesigned === "true") return;
    page.dataset.pathRedesigned = "true";

    var historyPanel = page.querySelector("#quizHistory") && page.querySelector("#quizHistory").closest(".panel");
    var paths = [
      { key: "logic", category: "تقني", title: "حلّ المشكلات", name: "التفكير البرمجي", icon: "⌘", symbol: "{ }", color: "#eee9ff", ink: "#6244eb", description: "تتبّع الأسباب، رتّب الخطوات، وابحث عن حل واضح بدل التخمين.", outcome: "تتدرّب على التفكير المنطقي واكتشاف الأخطاء.", task: "حل 5 مواقف قصيرة", interest: ["problem", "explore"], search: "برمجة تقنية منطق حل المشكلات" },
      { key: "design", category: "إبداعي", title: "اصنع فكرة مرئية", name: "التصميم والإبداع", icon: "✳", symbol: "◌", color: "#fff0f5", ink: "#d64f83", description: "وازن بين الشكل والرسالة، واختر ما يجعل الفكرة مفهومة للناس.", outcome: "تلاحظ كيف تؤثر الألوان والوضوح وتجربة الجمهور.", task: "5 قرارات تصميمية", interest: ["visual", "explore"], search: "تصميم إبداع رسم ألوان واجهات" },
      { key: "business", category: "أعمال", title: "اختبر فكرة مشروع", name: "ريادة الأعمال", icon: "↗", symbol: "◉", color: "#eff9e7", ink: "#48853b", description: "ابدأ من حاجة حقيقية، واختبر فكرة صغيرة قبل أن تصرف وقتًا ومالًا.", outcome: "تتعرف على اختبار الفكرة وفهم العميل واختيار الأولويات.", task: "5 مواقف عملية", interest: ["people", "build", "explore"], search: "أعمال تجارة مشروع قيادة عملاء" },
      { key: "data", category: "تحليل", title: "اكتشف ما تقوله الأرقام", name: "تحليل البيانات", icon: "⌗", symbol: "▤", color: "#edf7ff", ink: "#347fc2", description: "قارن معلومات بسيطة، تحقّق من الافتراضات، واستنتج ما تدعمه الأدلة.", outcome: "تتدرّب على المقارنة وتفسير البيانات دون مبالغة.", task: "5 تحديات تحليل", interest: ["numbers", "problem", "explore"], search: "بيانات إحصاء أرقام تحليل تقارير" }
    ];

    var careerStats = {};
    try {
      var careerResponse = await fetch("/api/admin?action=public-config", { credentials: "same-origin", cache: "no-store" });
      if (careerResponse.ok) {
        var careerConfig = await careerResponse.json();
        if (Array.isArray(careerConfig.careerPaths) && careerConfig.careerPaths.length) paths = careerConfig.careerPaths;
        careerStats = careerConfig.careerStats && typeof careerConfig.careerStats === "object" ? careerConfig.careerStats : {};
      }
    } catch (_) {}
    window.MadaCareerCatalog = paths;

    page.innerHTML = `
      <header class="path-head">
        <div><span class="path-kicker">اكتشف مسارك · بالتجربة لا بالتخمين</span><h1>أي نوع من المشكلات تحب حلّه؟</h1><p>لا نضع لك لقبًا مهنيًا من اختبار واحد. اختر ما يثير فضولك، جرّب نشاطًا قصيرًا، ثم استخدم النتيجة لتحديد خطوتك التالية.</p></div>
        <div class="path-count"><strong id="pathCompletedCount">0</strong>تجاربي المكتملة</div><div class="path-count"><strong id="pathGlobalCompletedCount">0</strong>إكمالات المسارات</div>
      </header>
      <section class="path-hero">
        <div><span class="path-kicker">ابدأ من فضولك</span><h2>المسار المناسب يبدأ بتجربة صغيرة.</h2><p>اختر اهتمامًا أوليًا أو استكشف كل المسارات. ستجد في كل تجربة مواقف قصيرة وتفسيرًا للإجابات، ثم يمكنك مقارنة تجاربك السابقة.</p></div>
        <div class="path-hero-art" aria-hidden="true"><div class="path-orbit">✦</div><div class="path-art-note one">جرّب أولًا<small>لا تحتاج خبرة سابقة</small></div><div class="path-art-note two">تعلّم من النتيجة<small>ليست حكمًا نهائيًا</small></div></div>
      </section>
      <section class="path-choice" aria-labelledby="pathChoiceTitle">
        <div class="path-section-title"><div><h2 id="pathChoiceTitle">ما الذي يجذبك أكثر؟</h2><p>اختيارك يرشّح تجربة للبدء فقط، ويمكنك تغييره في أي وقت.</p></div><span class="path-step-label">خطوة 01</span></div>
        <div class="path-interest-options" role="group" aria-label="اختر اهتمامك">
          <button class="path-interest" type="button" data-interest="problem" aria-pressed="false">حل الألغاز والمشكلات</button>
          <button class="path-interest" type="button" data-interest="visual" aria-pressed="false">ابتكار أشكال وأفكار</button>
          <button class="path-interest" type="button" data-interest="people" aria-pressed="false">فهم الناس واحتياجاتهم</button>
          <button class="path-interest" type="button" data-interest="numbers" aria-pressed="false">الأرقام والأنماط</button>
          <button class="path-interest" type="button" data-interest="build" aria-pressed="false">بناء مشروع خاص</button>
          <button class="path-interest" type="button" data-interest="explore" aria-pressed="true">لست متأكدًا بعد</button>
        </div>
        <div class="path-recommendation" aria-live="polite">
          <div class="path-recommend-icon" id="pathRecommendIcon">✦</div>
          <div><small>اقتراح للبدء · قابل للتغيير</small><strong id="pathRecommendTitle">ابدأ بتجربة متنوعة</strong><p id="pathRecommendText">جرّب أكثر من مجال، ولاحظ أي نوع من الأسئلة يجعلك ترغب في المتابعة.</p></div>
          <button class="primary" type="button" id="pathRecommendStart">ابدأ التجربة ↗</button>
        </div>
      </section>
      <section class="path-catalog" aria-labelledby="pathCatalogTitle">
        <div class="path-catalog-head"><div><h2 id="pathCatalogTitle">مسارات يمكنك تجربتها</h2><p>مجالات متنوعة وتجارب عملية؛ لا تتطلب خبرة مسبقة ولا تحدد مستقبلك نيابة عنك.</p></div><span class="pill" id="pathVisibleCount">4 مسارات</span></div>
        <div class="path-tools"><label class="path-search"><input id="pathSearch" type="search" placeholder="ابحث عن مجال أو مهارة…" aria-label="ابحث عن مجال أو مهارة"></label><select class="path-filter" id="pathCategory" aria-label="تصفية المسارات"><option value="all">كل المسارات</option><option value="logic">تقني وحل المشكلات</option><option value="design">إبداع وتصميم</option><option value="business">أعمال ومشاريع</option><option value="data">أرقام وتحليل</option></select><select class="path-filter" id="pathSort" aria-label="ترتيب المسارات"><option value="recommended">الترتيب المقترح</option><option value="least">الأقل تجربة أولًا</option><option value="az">الاسم: أ إلى ي</option></select><button class="path-saved-toggle" type="button" id="pathSavedToggle" aria-pressed="false">♡ المحفوظة <span id="pathSavedCount">0</span></button><button class="path-surprise" type="button" id="pathSurprise">✦ فاجئني بمسار</button></div>
        <div class="path-card-grid" id="pathCardGrid"></div>
        <div class="path-empty" id="pathEmpty">لم نعثر على مسار يطابق بحثك. جرّب كلمات أخرى أو أظهر كل المسارات.</div>
      </section>
      <div id="pathHistoryMount"></div>
    `;

    var categorySelect = page.querySelector("#pathCategory");
    var categoryNames = Array.from(new Set(paths.map(function (path) { return path.category || "عام"; }))).sort(function (a, b) { return a.localeCompare(b, "ar"); });
    categorySelect.innerHTML = '<option value="all">كل التصنيفات (' + paths.length + ')</option>' + categoryNames.map(function (category) {
      return '<option value="' + escapeHTML(category) + '">' + escapeHTML(category) + ' · ' + paths.filter(function (path) { return (path.category || "عام") === category; }).length + '</option>';
    }).join("");
    var grid = page.querySelector("#pathCardGrid");
    var interest = "explore";
    var chosenPath = "logic";
    var savedPaths = [];
    var savedOnly = false;
    var savedStorageKey = "mada.discoverPath.saved.v1";
    try {
      var storedSaved = JSON.parse(window.localStorage.getItem(savedStorageKey) || "[]");
      if (Array.isArray(storedSaved)) savedPaths = storedSaved.filter(function (key) { return paths.some(function (path) { return path.key === key; }); });
    } catch (_) { savedPaths = []; }
    function persistSavedPaths() {
      try { window.localStorage.setItem(savedStorageKey, JSON.stringify(savedPaths)); } catch (_) {}
      page.querySelector("#pathSavedCount").textContent = String(savedPaths.length);
      page.querySelector("#pathSavedToggle").setAttribute("aria-pressed", savedOnly ? "true" : "false");
      page.querySelector("#pathSavedToggle").innerHTML = (savedOnly ? "♥ عرض الكل" : "♡ المحفوظة") + ' <span id="pathSavedCount">' + savedPaths.length + '</span>';
    }
    function escapeHTML(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
      });
    }
    function cardMarkup(path) {
      var safeColor = /^#[0-9a-f]{6}$/i.test(path.color || "") ? path.color : "#eee9ff";
      var safeInk = /^#[0-9a-f]{6}$/i.test(path.ink || "") ? path.ink : "#5140a8";
      var key = escapeHTML(path.key);
      var saved = savedPaths.indexOf(path.key) !== -1;
      return '<article class="path-card" data-path-key="' + key + '" data-path-search="' + escapeHTML([path.title, path.name, path.category, path.search].join(" ").toLocaleLowerCase()) + '">' +
        '<div class="path-card-top"><div class="path-card-icon" style="background:' + safeColor + ';color:' + safeInk + '">' + escapeHTML(path.icon || "✦") + '</div><div class="path-card-tags"><span class="path-card-tag" style="background:' + safeColor + ';color:' + safeInk + '">' + escapeHTML(path.category || "عام") + '</span><span class="path-completion-count" data-completion-count="' + key + '"><strong>' + Number(careerStats[path.key] || 0).toLocaleString("ar-DZ") + '</strong> أكملوه</span></div></div>' +
        '<h3>' + escapeHTML(path.title || path.name) + '</h3><p>' + escapeHTML(path.description || "") + '</p>' +
        '<div class="path-card-outcome"><strong>ماذا ستكتشف؟</strong><span>' + escapeHTML(path.outcome || "تجربة قصيرة لاكتشاف المجال.") + '</span></div>' +
        '<div class="path-card-bottom"><small>' + escapeHTML(path.task || ((path.questions || []).length + " أسئلة")) + '</small><div class="path-card-actions"><button class="path-save' + (saved ? ' is-saved' : '') + '" type="button" data-save-path="' + key + '" aria-pressed="' + (saved ? 'true' : 'false') + '" aria-label="' + (saved ? 'إزالة من المسارات المحفوظة' : 'حفظ المسار') + '">' + (saved ? '♥' : '♡') + '</button><button class="primary" type="button" data-quiz="' + key + '">جرّب المسار ↗</button></div></div></article>';
    }
    grid.innerHTML = paths.map(cardMarkup).join("");
    if (historyPanel) {
      historyPanel.classList.add("path-history");
      historyPanel.querySelector(".panel-title h3").textContent = "سجل تجاربك";
      historyPanel.querySelector(".panel-title small").textContent = "ارجع إلى نتائجك ولاحظ المجالات التي ترغب في استكشافها أكثر.";
      var disclaimer = historyPanel.querySelector(".tiny-note");
      if (disclaimer) disclaimer.classList.add("path-disclaimer");
      page.querySelector("#pathHistoryMount").appendChild(historyPanel);
    }

    function updateRecommendation() {
      var candidates = paths.filter(function (path) { return path.interest.indexOf(interest) !== -1; });
      var selected = candidates.length ? candidates[0] : paths[0];
      if (interest === "explore") {
        var completed = window.MadaApp && typeof window.MadaApp.getState === "function" ? window.MadaApp.getState().quizzes : [];
        var counts = paths.map(function (path) {
          return { path: path, count: completed.filter(function (item) { return item.key === path.key; }).length };
        });
        counts.sort(function (a, b) { return a.count - b.count || paths.indexOf(a.path) - paths.indexOf(b.path); });
        selected = counts[0].path;
      }
      chosenPath = selected.key;
      page.querySelector("#pathRecommendIcon").textContent = selected.icon;
      page.querySelector("#pathRecommendIcon").style.background = selected.color;
      page.querySelector("#pathRecommendIcon").style.color = selected.ink;
      page.querySelector("#pathRecommendTitle").textContent = interest === "explore" ? "ابدأ من هنا: " + selected.name : "جرّب أولًا: " + selected.name;
      page.querySelector("#pathRecommendText").textContent = interest === "explore" ? "هذه بداية واحدة فقط. جرّب مسارًا آخر لاحقًا، وقارن ما استمتعت به وما ترغب في تعلّمه." : selected.outcome + " هذا اقتراح استكشافي وليس تقييمًا لقدراتك.";
    }
    function filterPaths() {
      var query = page.querySelector("#pathSearch").value.trim().toLocaleLowerCase();
      var category = page.querySelector("#pathCategory").value;
      var visible = 0;
      Array.prototype.forEach.call(grid.querySelectorAll(".path-card"), function (card) {
        var cardKey = card.getAttribute("data-path-key");
        var matches = (!query || card.getAttribute("data-path-search").indexOf(query) !== -1) && (category === "all" || category === (paths.find(function (path) { return path.key === cardKey; }) || {}).category) && (!savedOnly || savedPaths.indexOf(cardKey) !== -1);
        card.hidden = !matches;
        if (matches) visible++;
      });
      if (page.querySelector("#pathSort").value === "az") {
        Array.prototype.slice.call(grid.children).sort(function (a, b) {
          return a.querySelector("h3").textContent.localeCompare(b.querySelector("h3").textContent, "ar");
        }).forEach(function (card) { grid.appendChild(card); });
      } else if (page.querySelector("#pathSort").value === "least") {
        var completedForSort = window.MadaApp && typeof window.MadaApp.getState === "function" ? window.MadaApp.getState().quizzes : [];
        paths.slice().sort(function (a, b) {
          var countA = completedForSort.filter(function (item) { return item.key === a.key; }).length;
          var countB = completedForSort.filter(function (item) { return item.key === b.key; }).length;
          return countA - countB || paths.indexOf(a) - paths.indexOf(b);
        }).forEach(function (path) {
          var card = grid.querySelector('[data-path-key="' + path.key + '"]');
          if (card) grid.appendChild(card);
        });
      } else {
        paths.forEach(function (path) {
          var card = grid.querySelector('[data-path-key="' + path.key + '"]');
          if (card) grid.appendChild(card);
        });
      }
      page.querySelector("#pathVisibleCount").textContent = visible + (visible === 1 ? " مسار" : " مسارًا");
      page.querySelector("#pathEmpty").classList.toggle("visible", visible === 0);
    }
    page.querySelectorAll("[data-interest]").forEach(function (button) {
      button.addEventListener("click", function () {
        interest = button.getAttribute("data-interest");
        page.querySelectorAll("[data-interest]").forEach(function (item) { item.setAttribute("aria-pressed", item === button ? "true" : "false"); });
        updateRecommendation();
      });
    });
    page.querySelector("#pathRecommendStart").addEventListener("click", function () {
      if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast("ابدأ التجربة ولاحظ ما تستمتع به؛ النتيجة ليست حكمًا نهائيًا.");
      if (typeof window.MadaStartQuiz === "function") window.MadaStartQuiz(chosenPath);
      else {
        var button = page.querySelector('[data-path-key="' + chosenPath + '"] [data-quiz]');
        if (button) button.click();
      }
    });
    grid.addEventListener("click", function (event) {
      var saveButton = event.target.closest("[data-save-path]");
      if (!saveButton) return;
      var key = saveButton.getAttribute("data-save-path");
      if (savedPaths.indexOf(key) !== -1) savedPaths = savedPaths.filter(function (item) { return item !== key; });
      else savedPaths.push(key);
      var card = grid.querySelector('[data-path-key="' + key + '"]');
      if (card) {
        var currentButton = card.querySelector("[data-save-path]");
        var isSaved = savedPaths.indexOf(key) !== -1;
        currentButton.classList.toggle("is-saved", isSaved);
        currentButton.setAttribute("aria-pressed", isSaved ? "true" : "false");
        currentButton.setAttribute("aria-label", isSaved ? "إزالة من المسارات المحفوظة" : "حفظ المسار");
        currentButton.textContent = isSaved ? "♥" : "♡";
      }
      persistSavedPaths();
      filterPaths();
      if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast(savedPaths.indexOf(key) !== -1 ? "تم حفظ المسار للعودة إليه لاحقًا." : "تمت إزالة المسار من المحفوظات.");
    });
    page.querySelector("#pathSurprise").addEventListener("click", function () {
      var pool = paths.filter(function (path) { return !savedOnly || savedPaths.indexOf(path.key) !== -1; });
      if (!pool.length) { savedOnly = false; persistSavedPaths(); filterPaths(); pool = paths.slice(); }
      var picked = pool[Math.floor(Math.random() * pool.length)];
      if (!picked) return;
      page.querySelector("#pathSearch").value = "";
      page.querySelector("#pathCategory").value = "all";
      savedOnly = false;
      persistSavedPaths();
      filterPaths();
      chosenPath = picked.key;
      if (window.MadaApp && window.MadaApp.toast) window.MadaApp.toast("مسار عشوائي لك: " + picked.name);
      var card = grid.querySelector('[data-path-key="' + picked.key + '"]');
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("path-card-surprise"); window.setTimeout(function () { card.classList.remove("path-card-surprise"); }, 1500); }
    });
    page.querySelector("#pathSavedToggle").addEventListener("click", function () {
      savedOnly = !savedOnly;
      persistSavedPaths();
      filterPaths();
    });
    page.querySelector("#pathSearch").addEventListener("input", filterPaths);
    page.querySelector("#pathCategory").addEventListener("change", filterPaths);
    page.querySelector("#pathSort").addEventListener("change", filterPaths);
    persistSavedPaths();
    updateRecommendation();
    filterPaths();
    function refreshGlobalCounts() {
      fetch("/api/admin?action=public-config", { credentials: "same-origin", cache: "no-store" }).then(function (response) { if (!response.ok) throw new Error("stats unavailable"); return response.json(); }).then(function (config) {
        careerStats = config.careerStats && typeof config.careerStats === "object" ? config.careerStats : {};
        var total = Object.keys(careerStats).reduce(function (sum, key) { return sum + (Number(careerStats[key]) || 0); }, 0);
        var globalCount = page.querySelector("#pathGlobalCompletedCount"); if (globalCount) globalCount.textContent = total.toLocaleString("ar-DZ");
        page.querySelectorAll("[data-completion-count]").forEach(function (el) { var key = el.getAttribute("data-completion-count"); el.innerHTML = "<strong>" + (Number(careerStats[key] || 0)).toLocaleString("ar-DZ") + "</strong> أكملوه"; });
      }).catch(function () {});
    }
    function refreshCompletedCount() {
      try {
        var count = window.MadaApp && window.MadaApp.getState ? window.MadaApp.getState().quizzes.length : 0;
        page.querySelector("#pathCompletedCount").textContent = String(count);
      } catch (_) { page.querySelector("#pathCompletedCount").textContent = "0"; }
      updateRecommendation();
    }
    refreshCompletedCount();
    refreshGlobalCounts();
    window.addEventListener("mada:careerprogress", refreshGlobalCounts);
    document.addEventListener("click", function (event) {
      if (event.target.closest("#closeQuizResult")) window.setTimeout(refreshCompletedCount, 0);
    });
    document.addEventListener("mada:authchange", refreshCompletedCount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDiscoverPath);
  else initDiscoverPath();
})();