/* "اكتشف مسارك" experience upgrade. No Creative Studio DOM, styles, or logic are touched. */
(function () {
  "use strict";
  function initDiscoverPath() {
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

    page.innerHTML = `
      <header class="path-head">
        <div><span class="path-kicker">اكتشف مسارك · بالتجربة لا بالتخمين</span><h1>أي نوع من المشكلات تحب حلّه؟</h1><p>لا نضع لك لقبًا مهنيًا من اختبار واحد. اختر ما يثير فضولك، جرّب نشاطًا قصيرًا، ثم استخدم النتيجة لتحديد خطوتك التالية.</p></div>
        <div class="path-count"><strong id="pathCompletedCount">0</strong>تجارب مكتملة</div>
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
        <div class="path-catalog-head"><div><h2 id="pathCatalogTitle">مسارات يمكنك تجربتها</h2><p>أربع بدايات عملية؛ لا تتطلب خبرة مسبقة ولا تحدد مستقبلك نيابة عنك.</p></div><span class="pill" id="pathVisibleCount">4 مسارات</span></div>
        <div class="path-tools"><label class="path-search"><input id="pathSearch" type="search" placeholder="ابحث عن مجال أو مهارة…" aria-label="ابحث عن مجال أو مهارة"></label><select class="path-filter" id="pathCategory" aria-label="تصفية المسارات"><option value="all">كل المسارات</option><option value="logic">تقني وحل المشكلات</option><option value="design">إبداع وتصميم</option><option value="business">أعمال ومشاريع</option><option value="data">أرقام وتحليل</option></select><select class="path-filter" id="pathSort" aria-label="ترتيب المسارات"><option value="recommended">الترتيب المقترح</option><option value="az">الاسم: أ إلى ي</option></select></div>
        <div class="path-card-grid" id="pathCardGrid"></div>
        <div class="path-empty" id="pathEmpty">لم نعثر على مسار يطابق بحثك. جرّب كلمات أخرى أو أظهر كل المسارات.</div>
      </section>
      <div id="pathHistoryMount"></div>
    `;

    var grid = page.querySelector("#pathCardGrid");
    var interest = "explore";
    var chosenPath = "logic";
    function escapeHTML(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
      });
    }
    function cardMarkup(path) {
      return '<article class="path-card" data-path-key="' + path.key + '" data-path-search="' + escapeHTML((path.title + " " + path.name + " " + path.category + " " + path.search).toLowerCase()) + '">' +
        '<div class="path-card-top"><div class="path-card-icon" style="background:' + path.color + ';color:' + path.ink + '">' + path.icon + '</div><span class="path-card-tag" style="background:' + path.color + ';color:' + path.ink + '">' + path.category + '</span></div>' +
        '<h3>' + path.title + '</h3><p>' + path.description + '</p>' +
        '<div class="path-card-outcome"><strong>ماذا ستكتشف؟</strong><span>' + path.outcome + '</span></div>' +
        '<div class="path-card-bottom"><small>' + path.task + '</small><button class="primary" type="button" data-quiz="' + path.key + '">جرّب المسار ↗</button></div></article>';
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
        var matches = (!query || card.getAttribute("data-path-search").indexOf(query) !== -1) && (category === "all" || category === card.getAttribute("data-path-key"));
        card.hidden = !matches;
        if (matches) visible++;
      });
      if (page.querySelector("#pathSort").value === "az") {
        Array.prototype.slice.call(grid.children).sort(function (a, b) {
          return a.querySelector("h3").textContent.localeCompare(b.querySelector("h3").textContent, "ar");
        }).forEach(function (card) { grid.appendChild(card); });
      } else {
        paths.forEach(function (path) {
          var card = grid.querySelector('[data-path-key="' + path.key + '"]');
          if (card) grid.appendChild(card);
        });
      }
      page.querySelector("#pathVisibleCount").textContent = visible + (visible === 1 ? " مسار" : " مسارات");
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
    page.querySelector("#pathSearch").addEventListener("input", filterPaths);
    page.querySelector("#pathCategory").addEventListener("change", filterPaths);
    page.querySelector("#pathSort").addEventListener("change", filterPaths);
    updateRecommendation();
    filterPaths();
    function refreshCompletedCount() {
      try {
        var count = window.MadaApp && window.MadaApp.getState ? window.MadaApp.getState().quizzes.length : 0;
        page.querySelector("#pathCompletedCount").textContent = String(count);
      } catch (_) { page.querySelector("#pathCompletedCount").textContent = "0"; }
      updateRecommendation();
    }
    refreshCompletedCount();
    document.addEventListener("click", function (event) {
      if (event.target.closest("#closeQuizResult")) window.setTimeout(refreshCompletedCount, 0);
    });
    document.addEventListener("mada:authchange", refreshCompletedCount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDiscoverPath);
  else initDiscoverPath();
})();