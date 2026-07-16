/* code-browser.js — sidebar toggle + code panel tabs + panel toggle */
(function () {
  "use strict";

  var layout = document.querySelector(".docs-layout");
  if (!layout) return;

  /* ============================================================
     Sidebar toggle
     ============================================================ */
  var sidebarToggle = document.getElementById("sidebar-toggle");

  function sidebarCollapse() {
    layout.classList.add("sidebar-collapsed");
    if (sidebarToggle) sidebarToggle.innerHTML = "&#x276F;";
    try { localStorage.setItem("tau-sidebar", "collapsed"); } catch (_) {}
  }

  function sidebarExpand() {
    layout.classList.remove("sidebar-collapsed");
    if (sidebarToggle) sidebarToggle.innerHTML = "&#x276E;";
    try { localStorage.setItem("tau-sidebar", "expanded"); } catch (_) {}
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", function () {
      layout.classList.contains("sidebar-collapsed") ? sidebarExpand() : sidebarCollapse();
    });
  }

  try {
    if (localStorage.getItem("tau-sidebar") === "collapsed") sidebarCollapse();
  } catch (_) {}

  /* ============================================================
     Code panel: tabs + toggle
     ============================================================ */
  var panel = document.getElementById("code-panel");
  if (!panel) return;

  var tabs = panel.querySelectorAll(".code-panel-tab");
  var files = panel.querySelectorAll(".code-panel-file");
  var toggleBtn = document.getElementById("code-panel-toggle");
  var expandBtn = document.getElementById("code-panel-expand");

  function activateTab(index) {
    tabs.forEach(function (tab, i) {
      tab.classList.toggle("active", i === index);
      tab.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    files.forEach(function (file, i) {
      file.classList.toggle("is-active", i === index);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      activateTab(parseInt(tab.getAttribute("data-file-index"), 10));
    });
  });

  /* keyboard nav */
  panel.querySelector(".code-panel-tabs").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var cur = panel.querySelector(".code-panel-tab.active");
    if (!cur) return;
    var idx = parseInt(cur.getAttribute("data-file-index"), 10);
    if (e.key === "ArrowRight" && idx < tabs.length - 1) { activateTab(idx + 1); tabs[idx + 1].focus(); }
    else if (e.key === "ArrowLeft" && idx > 0) { activateTab(idx - 1); tabs[idx - 1].focus(); }
    e.preventDefault();
  });

  function panelCollapse() {
    panel.classList.add("is-collapsed");
    layout.classList.add("panel-collapsed");
    try { localStorage.setItem("tau-code-panel", "collapsed"); } catch (_) {}
  }

  function panelExpand() {
    panel.classList.remove("is-collapsed");
    layout.classList.remove("panel-collapsed");
    try { localStorage.setItem("tau-code-panel", "expanded"); } catch (_) {}
  }

  if (toggleBtn) toggleBtn.addEventListener("click", panelCollapse);
  if (expandBtn) expandBtn.addEventListener("click", panelExpand);

  try {
    if (localStorage.getItem("tau-code-panel") === "collapsed") panelCollapse();
  } catch (_) {}
})();
