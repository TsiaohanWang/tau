/* code-browser.js — sidebar toggle + code panel tab switching and toggle */
(function () {
  "use strict";

  var layout = document.querySelector(".docs-layout");
  if (!layout) return;

  /* ============================================================
     Sidebar toggle
     ============================================================ */
  var sidebarToggle = document.getElementById("sidebar-toggle");
  var sidebarWrap = document.getElementById("sidebar-wrap");

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
      if (layout.classList.contains("sidebar-collapsed")) {
        sidebarExpand();
      } else {
        sidebarCollapse();
      }
    });
  }

  /* restore sidebar state */
  try {
    if (localStorage.getItem("tau-sidebar") === "collapsed") {
      sidebarCollapse();
    }
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

  /* tab switching */
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
      var idx = parseInt(tab.getAttribute("data-file-index"), 10);
      activateTab(idx);
    });
  });

  /* keyboard nav: left/right arrows within tab bar */
  panel.querySelector(".code-panel-tabs").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var current = panel.querySelector(".code-panel-tab.active");
    if (!current) return;
    var idx = parseInt(current.getAttribute("data-file-index"), 10);
    if (e.key === "ArrowRight" && idx < tabs.length - 1) {
      activateTab(idx + 1);
      tabs[idx + 1].focus();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      activateTab(idx - 1);
      tabs[idx - 1].focus();
    }
    e.preventDefault();
  });

  /* panel collapse/expand */
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

  if (toggleBtn) {
    toggleBtn.addEventListener("click", panelCollapse);
  }
  if (expandBtn) {
    expandBtn.addEventListener("click", panelExpand);
  }

  /* restore code panel state */
  try {
    if (localStorage.getItem("tau-code-panel") === "collapsed") {
      panelCollapse();
    }
  } catch (_) {}

  /* ============================================================
     Highlight.js — syntax highlight + line numbers
     ============================================================ */
  if (typeof hljs !== "undefined") {
    function addLineNumbers(codeEl) {
      /* split highlighted HTML by newlines, prepend line number to each */
      var html = codeEl.innerHTML;
      var lines = html.split("\n");
      /* remove trailing empty line if present */
      if (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }
      var out = "";
      for (var n = 0; n < lines.length; n++) {
        out += '<span class="code-ln">' + (n + 1) + "</span>" + lines[n] + "\n";
      }
      codeEl.innerHTML = out;
    }

    function highlightActive() {
      var active = panel.querySelector(".code-panel-file.is-active code");
      if (active && !active.dataset.highlighted) {
        hljs.highlightElement(active);
        addLineNumbers(active);
      }
    }
    /* highlight on first load */
    highlightActive();
    /* re-highlight on tab switch */
    tabs.forEach(function (tab) {
      tab.addEventListener("click", highlightActive);
    });
  }
})();
