/* =====================================================================
   EDUHUB · Live Translator v1 — Google Translate widget (index.html)
   • Floating 🌐 button (bottom-left) → dark themed panel
   • Official Google Translate Element — live page translation
   • Lazy-loads Google's script on first open (zero page-load cost)
   • Hides Google's top banner; styles the combo for the dark theme
   NOTE: coexists with the site's built-in 15-language selector.
   Use one system at a time — they translate different ways.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_TRANSLATE__) return;
  window.__EH_TRANSLATE__ = true;

  /* dashboard only, like the news card */
  if (!document.querySelector('.overview-strip') && !/index\.html?$/i.test(location.pathname)) return;

  var CSS =
    '#gtFab{position:fixed;left:20px;bottom:20px;z-index:9998;width:52px;height:52px;border-radius:50%;' +
      'background:var(--surface-raised,#0d1625);border:1px solid var(--line,#2a3648);color:var(--ink,#edf2f7);' +
      'display:grid;place-items:center;cursor:pointer;font-size:22px;' +
      'box-shadow:0 10px 26px -10px rgba(0,0,0,.5);transition:transform .18s,border-color .18s,color .18s}' +
    '#gtFab:hover{transform:translateY(-2px);border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '#gtPanel{position:fixed;left:20px;bottom:84px;z-index:9999;width:300px;' +
      'background:var(--surface-raised,rgba(13,22,37,.96));border:1px solid var(--line,rgba(148,163,184,.2));' +
      'border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;' +
      'opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .2s,transform .2s;font-family:var(--font,system-ui,sans-serif)}' +
    '#gtPanel.open{opacity:1;transform:none;pointer-events:auto}' +
    '.gt-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px 10px;border-bottom:1px solid var(--line,rgba(148,163,184,.15))}' +
    '.gt-title{font:700 13.5px var(--font,sans-serif);color:var(--ink,#edf2f7)}' +
    '.gt-title i{color:var(--accent,#3fd2b0);margin-right:6px}' +
    '.gt-x{width:26px;height:26px;border-radius:50%;border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);cursor:pointer;font-size:12px}' +
    '.gt-body{padding:13px 15px 12px}' +
    '.gt-note{margin-top:10px;font:500 11px/1.5 var(--font,sans-serif);color:var(--muted,#8d9aa9)}' +
    /* Google widget, restyled dark */
    '#gtHost .goog-te-gadget{font:500 13px var(--font,sans-serif) !important;color:var(--muted,#8d9aa9) !important}' +
    '#gtHost .goog-te-gadget-simple{background:transparent !important;border:none !important}' +
    '#gtHost .goog-te-combo{width:100% !important;margin:0 !important;background:var(--panel-2,#0B0F1A) !important;' +
      'color:var(--ink,#edf2f7) !important;border:1px solid var(--line-2,rgba(148,163,184,.26)) !important;' +
      'border-radius:10px !important;padding:10px 12px !important;font:500 13.5px var(--font,sans-serif) !important;outline:none !important;cursor:pointer}' +
    '#gtHost .goog-te-combo:focus{border-color:var(--accent,#3fd2b0) !important}' +
    /* kill Google's top banner + body shift */
    '.goog-te-banner-frame.skiptranslate{display:none !important}' +
    'body{top:0 !important}' +
    '.goog-tooltip,.goog-te-balloon-frame{display:none !important;visibility:hidden !important}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  var panel = null, opened = false;

  function buildPanel() {
    panel = document.createElement('div'); panel.id = 'gtPanel';
    panel.innerHTML =
      '<div class="gt-head"><span class="gt-title"><i class="ph ph-translate"></i>Translate page</span>' +
      '<button class="gt-x" id="gtX" aria-label="Close">✕</button></div>' +
      '<div class="gt-body"><div id="gtHost"><div style="padding:.5rem 0;color:var(--muted,#8d9aa9);font-size:12.5px;">Loading translator…</div></div>' +
      '<div class="gt-note">Translates the whole page live via Google. Tip: set the site’s own language selector to English first, so the two systems don’t fight over the text.</div></div>';
    document.body.appendChild(panel);
    panel.querySelector('#gtX').addEventListener('click', toggle);
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
  function toggle() {
    if (!panel) buildPanel();
    opened = !opened;
    panel.classList.toggle('open', opened);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#gtFab')) { toggle(); return; }
    if (opened && panel && !e.target.closest('#gtPanel')) { opened = false; panel.classList.remove('open'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && opened) { opened = false; if (panel) panel.classList.remove('open'); }
  });

  /* --- FAB placement: sit ABOVE whatever already lives bottom-left
         (theme picker FAB, chat widgets, ...) — measured, not guessed. --- */
  function bottomOf(selector) {
    var el = document.querySelector(selector);
    if (!el) return null;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return r.bottom;   /* viewport coordinate */
  }
  function place() {
    var fab = document.getElementById('gtFab');
    if (!fab) return;
    /* check the usual bottom-left suspects + any fixed element in the left strip */
    var cands = [ bottomOf('.theme-picker-fab'), bottomOf('#gtFab') ];
    try {
      var all = document.body.getElementsByTagName('*');
      for (var i = 0; i < all.length && i < 800; i++) {
        var el = all[i];
        if (el.closest && el.closest('#gtFab, #gtPanel')) continue;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none') continue;
        var r = el.getBoundingClientRect();
        if (r.width < 30 || r.height < 30) continue;          /* FAB-sized only */
        if (r.left > 90) continue;                            /* must live in the left strip */
        if (r.top < innerHeight * 0.55) continue;             /* must be in the lower area */
        cands.push(r.bottom);
      }
    } catch (e) {}
    var lowest = 0;
    cands.forEach(function (b) { if (b != null && b > lowest) lowest = b; });
    var gap = 14;
    var bottom = lowest ? Math.round(innerHeight - lowest + gap) : 20;
    fab.style.left = '20px';
    fab.style.bottom = Math.max(20, Math.min(bottom, Math.round(innerHeight * 0.6))) + 'px';
  }
  function makeFab() {
    if (document.getElementById('gtFab')) { place(); return; }
    var fab = document.createElement('button');
    fab.id = 'gtFab'; fab.type = 'button';
    fab.title = 'Translate this page'; fab.setAttribute('aria-label', 'Translate page');
    fab.innerHTML = '<i class="ph ph-translate" aria-hidden="true"></i>';
    document.body.appendChild(fab);
    fab.addEventListener('click', toggle);
    place();
    setTimeout(place, 600);    /* theme FAB often renders late — re-measure */
    setTimeout(place, 1800);
    addEventListener('resize', place);
  }
  makeFab();

  /* re-check if the theme FAB appears/moves later (it's JS-injected too) */
  if (window.MutationObserver) {
    new MutationObserver(function () { place(); }).observe(document.body, { childList: true, subtree: false });
  }
})();
