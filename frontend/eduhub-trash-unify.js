/* =====================================================================
   EDUHUB · Trash Unify v2 — the navbar "Trash (N)" button opens the
   Trash popup instead of navigating to the trash page.
   Intercepts clicks at document-capture (runs before any site handler),
   matches by href/onclick/text so it survives language switching.
   Load after eduhub-trash-ui.js.
   ===================================================================== */
(function () {
  'use strict';
  function isEntry(el) {
    /* never intercept our own popup or dock button */
    if (el.closest && el.closest('#ehtr-modal, #ehtr-fab, #ehtr-fabs')) return false;
    var href = el.getAttribute('href') || '';
    var oc = el.getAttribute('onclick') || '';
    if (/trash/i.test(href) || /trash/i.test(oc)) return true;   /* e.g. trash.html */
    var strip = function (s) { return String(s).replace(/^[^\p{L}\p{N}]+/u, ''); };
    var txt = strip(el.textContent || '');
    var lbl = strip(el.getAttribute('aria-label') || '');
    return /^trash/i.test(txt) || /^trash/i.test(lbl);
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('a, button, [role="button"]') : null;
    if (!el || !isEntry(el)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var fab = document.getElementById('ehtr-fab') || document.querySelector('[data-ehtr-open]');
    if (fab) fab.click();
  }, true);
})();
