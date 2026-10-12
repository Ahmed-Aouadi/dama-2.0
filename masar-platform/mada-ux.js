/* Mada UX layer: keyboard + focus handling for dialogs, aria-current for navigation, skip link. */
(function () {
  "use strict";
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var lastFocus = new WeakMap();
  function openModals() { return Array.prototype.slice.call(document.querySelectorAll(".modal-backdrop.open")); }
  function syncBody() { document.body.classList.toggle("modal-open", openModals().length > 0); }
  function prepare(modal) {
    if (!modal.getAttribute("role")) modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    if (!modal.hasAttribute("aria-label") && !modal.hasAttribute("aria-labelledby")) {
      var h = modal.querySelector("h1,h2,h3[id]");
      if (h) { if (!h.id) h.id = modal.id + "Title"; modal.setAttribute("aria-labelledby", h.id); }
    }
  }
  function watch(modal) {
    prepare(modal);
    var was = modal.classList.contains("open");
    new MutationObserver(function () {
      var now = modal.classList.contains("open");
      if (now === was) return;
      was = now; syncBody();
      if (now) {
        lastFocus.set(modal, document.activeElement);
        setTimeout(function () { var t = modal.querySelector(FOCUSABLE); if (t) t.focus({ preventScroll: true }); }, 30);
      } else {
        var prev = lastFocus.get(modal); if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
      }
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), watch);
    new MutationObserver(function (list) {
      list.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList.contains("modal-backdrop")) watch(n); }); });
    }).observe(document.body, { childList: true });
    document.addEventListener("keydown", function (e) {
      var open = openModals(), top = open[open.length - 1];
      if (!top) return;
      if (e.key === "Escape") { top.classList.remove("open"); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(top.querySelectorAll(FOCUSABLE), function (el) { return el.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    function markNav() {
      Array.prototype.forEach.call(document.querySelectorAll(".nav button,.mobile-nav button"), function (b) {
        if (b.classList.contains("active")) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      });
    }
    var navs = document.querySelectorAll(".nav button,.mobile-nav button");
    var mo = new MutationObserver(function () { markNav(); var pg = document.querySelector(".page.active"); if (pg) { pg.setAttribute("tabindex", "-1"); } });
    Array.prototype.forEach.call(navs, function (b) { mo.observe(b, { attributes: true, attributeFilter: ["class"] }); });
    markNav();
    var skip = document.querySelector("[data-skip]");
    if (skip) skip.addEventListener("click", function (e) { e.preventDefault(); var pg = document.querySelector(".page.active") || document.querySelector("main"); pg.setAttribute("tabindex", "-1"); pg.focus(); });
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
