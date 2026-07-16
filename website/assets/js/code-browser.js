/* code-browser.js — tab switching and panel toggle for the source code browser */
(function () {
  "use strict";

  var panel = document.getElementById("code-panel");
  if (!panel) return;

  var tabs = panel.querySelectorAll(".code-panel-tab");
  var files = panel.querySelectorAll(".code-panel-file");
  var toggleBtn = document.getElementById("code-panel-toggle");
  var expandBtn = document.getElementById("code-panel-expand");
  var layout = panel.closest(".docs-layout");

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
  function collapse() {
    panel.classList.add("is-collapsed");
    if (layout) layout.classList.add("panel-collapsed");
    try { localStorage.setItem("tau-code-panel", "collapsed"); } catch (_) {}
  }

  function expand() {
    panel.classList.remove("is-collapsed");
    if (layout) layout.classList.remove("panel-collapsed");
    try { localStorage.setItem("tau-code-panel", "expanded"); } catch (_) {}
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", collapse);
  }
  if (expandBtn) {
    expandBtn.addEventListener("click", expand);
  }

  /* restore saved state */
  try {
    if (localStorage.getItem("tau-code-panel") === "collapsed") {
      collapse();
    }
  } catch (_) {}
})();
