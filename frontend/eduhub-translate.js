/* =====================================================================
   EDUHUB · Live Translator v2 — navbar edition (replaces old i18n)
   • 🌐 pill in .nav-right where the old language selector sat
   • Styled with .focus-toggle → matches Trash / Focus / Gmail pills
   • Panel drops below the navbar, anchored to the button
   • Google Translate Element lazy-loads on first open
   All pages. Coexists with nothing — it IS the translation system now.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_TRANSLATE__) return;
  window.__EH_TRANSLATE__ = true;

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

  var panel = null, opened = false;

  function buildPanel() {
    panel = document.createElement('div'); panel.id = 'gtPanel';
    panel.innerHTML =
      '<div class="gt-head"><span class="gt-title"><i class="ph ph-translate"></i>Translate page</span>' +
      '<button class="gt-x" id="gtX" aria-label="Close">✕</button></div>' +
      '<div class="gt-body"><div id="gtHost"><div style="padding:.5rem 0;color:var(--muted,#8d9aa9);font-size:12.5px;">Loading translator…</div></div>' +
      '<div class="gt-note">Translates the whole page live via Google — including popups. Set the popup\'s language back to English to restore the original text.</div></div>';
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
    if (opened) positionPanel();
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

  /* inject the pill into .nav-right, in the old selector's slot */
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
    if (inject() || ++tries > 12) return;
    setTimeout(boot, 300);
  })();
})();
