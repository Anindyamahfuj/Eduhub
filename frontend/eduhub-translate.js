/* =====================================================================
   EDUHUB · Live Translator v3 — navbar edition
   • 🌐 pill in .nav-right → panel with Google page-translation
   • NEW: notranslate guard — timers/clock/stats never glitch
   • NEW: "Show original" button — cookie-clear + reload restore
   All pages. Replaces the old built-in language system.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_TRANSLATE__) return;
  window.__EH_TRANSLATE__ = true;

  /* ---------- elements that must NEVER be translated ---------- */
  /* (scripts rewrite these constantly → they glitch if Google touches them) */
  var GUARD_SELECTORS = [
    '#digitalClock', '.digital-clock', '#analogClock', '#clockToggleBtn',
    '#pomoDisplay', '#deepworkDisplay', '#dwToday', '#dwTotal',
    '.stat-number', '.ov-value', '#pomoCount', '#pomoCountStat', '#historyCount',
    '#sci-result', '#sci-expr', '#calcDisplay',
    '#ttCard', '#ttIn', '#ttOut',            /* Text Translator card stays clean */
    '#tc-count', '#ehNewsMeta', '#ehBatchLabel'
  ];
  function guard() {
    GUARD_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          if (!el.classList.contains('notranslate')) el.classList.add('notranslate');
          if (!el.hasAttribute('translate')) el.setAttribute('translate', 'no');
        });
      } catch (e) {}
    });
  }

  /* ---------- CSS ---------- */
  var CSS =
    '.gt-navbtn{display:inline-flex;align-items:center;gap:6px;cursor:pointer}' +
    '.gt-navbtn i{font-size:15px}' +
    '#gtPanel{position:fixed;z-index:10050;width:300px;' +
      'background:var(--surface-raised,rgba(13,22,37,.96));border:1px solid var(--line,rgba(148,163,184,.2));' +
      'border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden;' +
      'opacity:0;transform:translateY(-8px);pointer-events:none;transition:opacity .2s,transform .2s;font-family:var(--font,system-ui,sans-serif)}' +
    '#gtPanel.open{opacity:1;transform:none;pointer-events:auto}' +
    '.gt-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px 10px;border-bottom:1px solid var(--line,rgba(148,163,184,.15))}' +
    '.gt-title{font:700 13.5px var(--font,sans-serif);color:var(--ink,#edf2f7)}' +
    '.gt-title i{color:var(--accent,#3fd2b0);margin-right:6px}' +
    '.gt-x{width:26px;height:26px;border-radius:50%;border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);cursor:pointer;font-size:12px}' +
    '.gt-body{padding:13px 15px 12px}' +
    '.gt-row{display:flex;gap:8px;align-items:stretch}' +
    '.gt-reset{flex:none;background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,#2a3648);color:var(--muted,#8d9aa9);border-radius:10px;padding:0 12px;font:600 12px var(--font,sans-serif);cursor:pointer;transition:all .15s;white-space:nowrap}' +
    '.gt-reset:hover{border-color:var(--danger,#f0938c);color:var(--danger,#f0938c)}' +
    '.gt-note{margin-top:10px;font:500 11px/1.5 var(--font,sans-serif);color:var(--muted,#8d9aa9)}' +
    '#gtHost .goog-te-gadget{font:500 13px var(--font,sans-serif) !important;color:var(--muted,#8d9aa9) !important}' +
    '#gtHost .goog-te-gadget-simple{background:transparent !important;border:none !important}' +
    '#gtHost .goog-te-combo{width:100% !important;margin:0 !important;background:var(--panel-2,#0B0F1A) !important;' +
      'color:var(--ink,#edf2f7) !important;border:1px solid var(--line-2,rgba(148,163,184,.26)) !important;' +
      'border-radius:10px !important;padding:10px 12px !important;font:500 13.5px var(--font,sans-serif) !important;outline:none !important;cursor:pointer}' +
    '#gtHost .goog-te-combo:focus{border-color:var(--accent,#3fd2b0) !important}' +
    '.goog-te-banner-frame.skiptranslate{display:none !important}' +
    'body{top:0 !important}' +
    '.goog-tooltip,.goog-te-balloon-frame{display:none !important;visibility:hidden !important}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  /* ---------- panel + widget ---------- */
  var panel = null, opened = false;

  function hasGoogtrans() {
    return /(?:^|;\s*)googtrans=/.test(document.cookie);
  }
  function showOriginal() {
    if (!hasGoogtrans()) {
      var b = document.getElementById('gtReset');
      if (b) { b.textContent = 'Already original'; setTimeout(function(){ b.textContent = 'Show original'; }, 1500); }
      return;
    }
    /* wipe the translation cookie on every domain/path variation, then reload */
    var domains = ['', location.hostname, '.' + location.hostname];
    var hostParts = location.hostname.split('.');
    if (hostParts.length > 2) domains.push('.' + hostParts.slice(-2).join('.'));
    domains.forEach(function (d) {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;' + (d ? ' domain=' + d + ';' : '');
    });
    location.reload();
  }

  function buildPanel() {
    panel = document.createElement('div'); panel.id = 'gtPanel';
    panel.innerHTML =
      '<div class="gt-head"><span class="gt-title"><i class="ph ph-translate"></i>Translate page</span>' +
      '<button class="gt-x" id="gtX" aria-label="Close">✕</button></div>' +
      '<div class="gt-body">' +
        '<div class="gt-row">' +
          '<div id="gtHost" style="flex:1;min-width:0"><div style="padding:.5rem 0;color:var(--muted,#8d9aa9);font-size:12.5px;">Loading translator…</div></div>' +
          '<button class="gt-reset" id="gtReset" title="Restore the page to its original language">Show original</button>' +
        '</div>' +
        '<div class="gt-note">Translates the whole page live via Google — including popups. Timers &amp; stat numbers are protected and stay untranslated. “Show original” restores the page.</div>' +
      '</div>';
    document.body.appendChild(panel);
    panel.querySelector('#gtX').addEventListener('click', toggle);
    panel.querySelector('#gtReset').addEventListener('click', showOriginal);
    window.googleTranslateElementInit = function () {
      try {
        new google.translate.TranslateElement({
          pageLanguage: 'en',
          autoDisplay: false,
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        }, 'gtHost');
      } catch (e) {
        document.getElementById('gtHost').innerHTML =
          '<div style="padding:.5rem 0;color:var(--danger,#f0938c);font-size:12.5px;">Translator failed to load — check your connection.</div>';
      }
    };
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    document.head.appendChild(s);
  }
  function positionPanel() {
    var btn = document.getElementById('gtNavBtn');
    if (!btn || !panel) return;
    var r = btn.getBoundingClientRect();
    var top = Math.min(r.bottom + 10, innerHeight - 320);
    var left = Math.max(12, Math.min(r.right - 300, innerWidth - 312));
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
  }
  function toggle() {
    if (!panel) buildPanel();
    opened = !opened;
    if (opened) { positionPanel(); guard(); }
    panel.classList.toggle('open', opened);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#gtNavBtn')) { toggle(); return; }
    if (opened && panel && !e.target.closest('#gtPanel')) { opened = false; panel.classList.remove('open'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && opened) { opened = false; if (panel) panel.classList.remove('open'); }
  });
  addEventListener('resize', function () { if (opened) positionPanel(); });

  /* ---------- navbar pill ---------- */
  var tries = 0;
  function inject() {
    if (document.getElementById('gtNavBtn')) return true;
    var nav = document.querySelector('.nav-right') || document.querySelector('.nav-container');
    if (!nav) return false;
    var b = document.createElement('button');
    b.id = 'gtNavBtn'; b.type = 'button';
    b.className = 'focus-toggle gt-navbtn';
    b.title = 'Translate this page';
    b.setAttribute('aria-label', 'Translate page');
    b.innerHTML = '<i class="ph ph-translate" aria-hidden="true"></i> Translate';
    var anchor = nav.querySelector('#trashBtn');
    if (anchor) nav.insertBefore(b, anchor); else nav.insertBefore(b, nav.firstChild);
    return true;
  }
  (function boot() {
    guard();
    if (inject() || ++tries > 12) { guard(); return; }
    setTimeout(boot, 300);
  })();
  /* guard again on load + whenever DOM changes (popups render new nodes) */
  window.addEventListener('load', guard);
  setTimeout(guard, 1500);
  if (window.MutationObserver) {
    var gT = null;
    new MutationObserver(function () {
      clearTimeout(gT); gT = setTimeout(guard, 200);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
