/* =====================================================================
   EDUHUB · Dock v1.0
   Merges every EduHub floating button into ONE stack, then measures
   anything else fixed in the bottom-right corner (theme switcher,
   chat widgets, cookie badges…) and lifts the stack above it.
   Re-checks on resize and whenever the page changes.
   Manual override (skips auto-detect — set BEFORE this script):
     window.EDUHUB_DOCK_BOTTOM = 96;
   ===================================================================== */
(function () {
  'use strict';

  var MINE = '#eh-fabs,#ehsc-fabs,#eh-modal,#ehsc-modal,#eh-toast,#ehsc-toast';
  var BASE = 20, GAP = 14, MAX_TRIES = 12;
  var merged = false, tries = 0, raf = 0, last = 0;

  /* 1 · merge the Shortcuts button into the analyzer stack */
  function merge() {
    if (merged) return true;
    var dock = document.getElementById('eh-fabs');
    if (!dock) return false;
    var sc = document.getElementById('ehsc-fabs');
    if (sc) {
      var btn = sc.querySelector('.ehsc-fab');
      if (btn) dock.appendChild(btn);
      if (sc.parentNode) sc.parentNode.removeChild(sc);
    }
    merged = true;
    return true;
  }

  /* 2 · find the highest foreign fixed widget in our corner */
  function foreignEdge(zoneLeft, vh) {
    var max = 0;
    if (!document.body) return 0;
    var all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest && el.closest(MINE)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      var b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      if (b.width > innerWidth * 0.85 && b.height > innerHeight * 0.85) continue; /* page overlays */
      if (b.right < zoneLeft) continue;   /* outside our corner */
      if (b.bottom < vh * 0.4) continue;  /* lives in the top half — irrelevant */
      var edge = vh - b.bottom;
      if (edge > max) max = edge;
    }
    return max;
  }

  function reposition() {
    var dock = document.getElementById('eh-fabs');
    if (!dock) return;
    if (typeof window.EDUHUB_DOCK_BOTTOM === 'number') {
      dock.style.setProperty('--eh-fab-bottom', window.EDUHUB_DOCK_BOTTOM + 'px');
      return;
    }
    var vh = innerHeight;
    var edge = foreignEdge(innerWidth - 110, vh); /* scan the right 110px strip */
    var target = edge > 0 ? Math.min(edge + GAP, Math.round(vh * 0.7)) : BASE;
    dock.style.setProperty('--eh-fab-bottom', Math.round(target) + 'px');
  }

  function schedule() { /* throttled to ~300ms so busy pages stay smooth */
    var now = Date.now();
    if (now - last < 300) {
      if (!raf) raf = setTimeout(function () { raf = 0; last = Date.now(); reposition(); }, 300);
      return;
    }
    last = now;
    reposition();
  }

  function boot() {
    if (!merge()) {
      if (++tries > MAX_TRIES) return;
      setTimeout(boot, 300);
      return;
    }
    reposition();
    setTimeout(reposition, 500);   /* catches widgets injected late */
    setTimeout(reposition, 1500);
    setTimeout(reposition, 3000);
    addEventListener('resize', schedule);
    if (window.MutationObserver) {
      new MutationObserver(schedule).observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden']
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.EduHubDock = { reposition: reposition };
})();
