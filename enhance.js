// UX enhancements layered on top of app.js — no dependency on its internals
// beyond the existing element IDs/classes already in index.html.
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();

  function init() {
    setupSearchClearAndShortcuts();
    setupBackToTop();
    setupKeyboardActivation();
  }

  /* ---------- Search: clear button, "/" focus shortcut, Esc to clear ---------- */
  function setupSearchClearAndShortcuts() {
    var input = document.getElementById("searchInput");
    var box = input ? input.closest(".search-box") : null;
    var clearBtn = document.getElementById("searchClear");
    if (!input || !box || !clearBtn) return;

    function sync() {
      box.classList.toggle("has-value", input.value.length > 0);
      clearBtn.tabIndex = input.value.length > 0 ? 0 : -1;
    }
    input.addEventListener("input", sync);
    sync();

    clearBtn.addEventListener("click", function () {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      sync();
      input.focus();
    });

    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.focus();
      }
      if (e.key === "Escape" && document.activeElement === input) {
        if (input.value) {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          sync();
        } else {
          input.blur();
        }
      }
    });
  }

  /* ---------- Back to top ---------- */
  function setupBackToTop() {
    var btn = document.getElementById("backToTop");
    if (!btn) return;
    var ticking = false;

    function update() {
      btn.classList.toggle("visible", window.scrollY > 700);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    });
    update();

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Keyboard activation for div-based toggles (chips, spotlight, rows) ---------- */
  function setupKeyboardActivation() {
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var target = e.target.closest(".chip, .spotlight-card");
      if (!target) return;
      // row-head handles its own Enter/Space in app.js — don't double-toggle it here
      if (e.target.closest(".row-head")) return;
      // Don't hijack real buttons/links/inputs inside a chip or spotlight card
      if (e.target.closest("button, a, input, select, textarea")) return;
      e.preventDefault();
      target.click();
    });
  }

})();