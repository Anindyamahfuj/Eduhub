/* =====================================================================
   EDUHUB · Trash UI v1 — complete recycle-bin popup, zero guessing.
   Reads/writes data.trash via loadData/saveData (localStorage fallback).
   Self-contained: injects its own styles + markup. Replaces trash-fix.
   ===================================================================== */
(function () {
  'use strict';
  var LSKEY = 'studyHubData';
  function getData() {
    try { if (typeof loadData === 'function') return loadData(); } catch (e) {}
    try { return JSON.parse(localStorage.getItem(LSKEY) || '{}'); } catch (e) { return {}; }
  }
  function persist(d) {
    try { if (typeof saveData === 'function') { saveData(d); return true; } } catch (e) {}
    try { localStorage.setItem(LSKEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  }
  function toast(m) {
    var t = document.getElementById('eh-toast');
    if (t) { t.textContent = m; t.hidden = false; t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2200); }
    else console.log('[Trash]', m);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var TYPES = { notes:['Note','📝'], notice:['Notice','📌'], notices:['Notice','📌'],
    habit:['Habit','🔁'], habits:['Habit','🔁'], file:['File','📎'], files:['File','📎'],
    assignment:['Assignment','📚'], assignments:['Assignment','📚'], goal:['Goal','🎯'],
    goals:['Goal','🎯'], reading:['Reading','🔖'], readinglist:['Reading','🔖'],
    flashcards:['Deck','🃏'], deck:['Deck','🃏'] };
  function meta(w) { var m = TYPES[(w.type || '').toLowerCase()]; return m ? m : ['Item','🗑']; }
  function label(w) { return w.name || (w.item && (w.item.name || w.item.title || w.item.text ||
    w.item.fileName || w.item.task || w.item.label)) || 'Untitled item'; }
  function when(w) { try { if (!w.ts) return '—';
    var d = new Date(w.ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; } }

  var TARGETS = { notes:'notes', note:'notes', notices:'notices', notice:'notices',
    habits:'habits', habit:'habits', files:'files', file:'files',
    assignments:'assignments', assignment:'assignments', goals:'goals', goal:'goals',
    readinglist:'readingList', reading:'readingList',
    flashcards:'flashcards.decks', deck:'flashcards.decks' };
  function arrFor(d, type) {
    var c = d; String(TARGETS[(type || '').toLowerCase()] || '').split('.').forEach(function (k) { c = c ? c[k] : null; });
    return (c && c.push) ? c : null;
  }

  var state = { q: '' }, armed = -1, armedEmpty = false, armedEmptyT = null;

  function render() {
    var d = getData(), tr = d.trash || [];
    var cnt = document.getElementById('ehtr-count'), listEl = document.getElementById('ehtr-list');
    if (!cnt || !listEl) return;
    cnt.textContent = tr.length + (tr.length === 1 ? ' item' : ' items');
    var q = state.q.toLowerCase();
    var shown = tr.map(function (w, i) { return { w: w, i: i }; })
      .filter(function (x) { return !q || (label(x.w) + ' ' + (x.w.type || '')).toLowerCase().indexOf(q) > -1; });
    listEl.innerHTML = tr.length === 0
      ? '<div class="ehtr-empty">Trash is empty.<br>Deleted notes, files, habits, decks and more will appear here — recoverable until you empty it.</div>'
      : (shown.length ? shown.map(function (x) {
          var m = meta(x.w);
          return '<div class="ehtr-row"><span class="ehtr-ic">' + m[1] + '</span>' +
            '<span class="ehtr-main"><b>' + esc(label(x.w)) + '</b><i>' + esc(m[0]) + ' · ' + when(x.w) + '</i></span>' +
            (armed === x.i
              ? '<span class="ehtr-acts"><button class="ehtr-btn danger" data-confirm="' + x.i + '">Sure?</button>' +
                '<button class="ehtr-btn" data-cancel="1">Keep</button></span>'
              : '<span class="ehtr-acts"><button class="ehtr-btn" data-restore="' + x.i + '">Restore</button>' +
                '<button class="ehtr-btn danger" data-arm="' + x.i + '">Delete</button></span>') + '</div>';
        }).join('') : '<div class="ehtr-empty">Nothing matches “' + esc(state.q) + '”.</div>');
    var ea = document.getElementById('ehtr-emptyall');
    if (ea) { ea.textContent = armedEmpty ? 'Really empty all?' : 'Empty trash';
      ea.style.color = armedEmpty ? 'var(--danger,#f0938c)' : ''; }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-restore],[data-arm],[data-confirm],[data-cancel],#ehtr-emptyall,#ehtr-restoreall,[data-ehtr-open],[data-ehtr-close]') : null;
    if (!b) return;
    if (b.hasAttribute('data-ehtr-open')) { e.preventDefault(); armed = -1; armedEmpty = false; open(); return; }
    if (b.hasAttribute('data-ehtr-close')) { e.preventDefault(); close(); return; }
    if (b.id === 'ehtr-emptyall') { e.preventDefault();
      if (!armedEmpty) { armedEmpty = true; render();
        clearTimeout(armedEmptyT); armedEmptyT = setTimeout(function () { armedEmpty = false; render(); }, 3000); }
      else { var d0 = getData(), n = (d0.trash || []).length; d0.trash = []; persist(d0);
        armedEmpty = false; toast(n + ' item(s) deleted forever'); render(); }
      return; }
    if (b.id === 'ehtr-restoreall') { e.preventDefault();
      var d1 = getData(), n1 = (d1.trash || []).length;
      if (!n1) { toast('Trash is empty'); return; }
      var ok = 0;
      for (var i = d1.trash.length - 1; i >= 0; i--) {
        var arr = arrFor(d1, d1.trash[i].type);
        if (arr) { arr.push(d1.trash[i].item != null ? d1.trash[i].item : d1.trash[i]); d1.trash.splice(i, 1); ok++; }
      }
      persist(d1); toast(ok + ' of ' + n1 + ' restored' + (ok < n1 ? ' (unknown types left)' : '')); render(); return; }
    if (b.dataset.restore != null) { e.preventDefault();
      var d2 = getData(), i2 = +b.dataset.restore, w = d2.trash && d2.trash[i2];
      var arr2 = w ? arrFor(d2, w.type) : null;
      if (arr2) { arr2.push(w.item != null ? w.item : w); d2.trash.splice(i2, 1); persist(d2);
        toast('Restored'); armed = -1; render(); }
      else toast('Unknown item type — use Delete forever');
      return; }
    if (b.dataset.arm != null) { e.preventDefault(); armed = +b.dataset.arm; armedEmpty = false; render(); return; }
    if (b.dataset.confirm != null) { e.preventDefault();
      var d3 = getData(); if (d3.trash && d3.trash[+b.dataset.confirm]) { d3.trash.splice(+b.dataset.confirm, 1); persist(d3); toast('Deleted forever'); }
      armed = -1; render(); return; }
    if (b.dataset.cancel != null) { e.preventDefault(); armed = -1; render(); return; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  function open()  { var m = document.getElementById('ehtr-modal'); if (!m) return;
    m.hidden = false; render();
    requestAnimationFrame(function () { requestAnimationFrame(function () { m.classList.add('ehtr-in'); }); }); }
  function close() { var m = document.getElementById('ehtr-modal'); if (!m || m.hidden) return;
    m.classList.remove('ehtr-in'); setTimeout(function () { m.hidden = true; }, 220); }

  var CSS = '#ehtr-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;font-family:var(--font,system-ui,sans-serif)}' +
    '#ehtr-modal[hidden]{display:none!important}' +
    '.ehtr-scrim{position:absolute;inset:0;background:rgba(2,5,10,.6);opacity:0;transition:opacity .22s}' +
    '.ehtr-panel{position:relative;width:min(600px,100%);max-height:min(80vh,760px);display:flex;flex-direction:column;background:var(--surface-raised,rgba(13,22,37,.96));border:1px solid var(--line,rgba(148,163,184,.2));border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.5);opacity:0;transform:translateY(12px) scale(.98);transition:opacity .24s cubic-bezier(.16,1,.3,1),transform .24s cubic-bezier(.16,1,.3,1);overflow:hidden}' +
    '#ehtr-modal.ehtr-in .ehtr-scrim{opacity:1}#ehtr-modal.ehtr-in .ehtr-panel{opacity:1;transform:none}' +
    '.ehtr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:1px solid var(--line,rgba(148,163,184,.15))}' +
    '.ehtr-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent,#3fd2b0);font-weight:700;margin-bottom:4px}' +
    '.ehtr-title{font-family:var(--display,var(--font,sans-serif));font-weight:700;font-size:20px;color:var(--ink,#edf2f7)}' +
    '.ehtr-x{width:32px;height:32px;border-radius:50%;border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);cursor:pointer;font-size:14px}' +
    '.ehtr-body{padding:16px 20px 22px;overflow-y:auto}' +
    '.ehtr-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}' +
    '.ehtr-search{flex:1;min-width:170px;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.3);border:1px solid var(--line,#2a3648);border-radius:999px;padding:0 14px;color:var(--muted,#8d9aa9)}' +
    '.ehtr-search input{flex:1;background:none;border:none;outline:none;color:var(--ink,#edf2f7);height:40px;font:inherit;font-size:14px;min-width:0}' +
    '.ehtr-count{font-size:12px;font-weight:700;color:var(--muted,#8d9aa9);white-space:nowrap}' +
    '.ehtr-actions{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}' +
    '.ehtr-btn{border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);border-radius:8px;padding:6px 12px;font:600 12.5px var(--font,sans-serif);cursor:pointer;transition:border-color .15s,color .15s,background .15s}' +
    '.ehtr-btn:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '.ehtr-btn.danger:hover{border-color:var(--danger,#f0938c);color:var(--danger,#f0938c);background:var(--danger-soft,rgba(240,147,140,.12))}' +
    '.ehtr-list{display:flex;flex-direction:column}' +
    '.ehtr-row{display:flex;align-items:center;gap:11px;padding:10px 2px;border-top:1px solid var(--line,rgba(148,163,184,.12))}' +
    '.ehtr-row:first-child{border-top:none}' +
    '.ehtr-ic{font-size:17px;flex:none;width:26px;text-align:center}' +
    '.ehtr-main{min-width:0;flex:1}.ehtr-main b{display:block;font-size:13.5px;color:var(--ink,#edf2f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ehtr-main i{font-style:normal;font-size:11px;color:var(--muted,#8d9aa9)}' +
    '.ehtr-acts{display:flex;gap:6px;flex:none}' +
    '.ehtr-empty{border:1px dashed rgba(63,210,176,.3);border-radius:12px;padding:28px 18px;text-align:center;color:var(--muted,#8d9aa9);font-size:13.5px;line-height:1.6}' +
    '#ehtr-fabs{position:fixed;right:20px;bottom:20px;z-index:9998}' +
    '#ehtr-fabs .eh-fab{width:52px;height:52px;border-radius:50%;background:var(--surface-raised,#0d1625);border:1px solid var(--line,#2a3648);color:var(--ink,#edf2f7);display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 26px -10px rgba(0,0,0,.5)}' +
    '#ehtr-fabs .eh-fab-tip{display:none}';

  var TRASH_SVG = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function inject() {
    if (document.getElementById('ehtr-modal')) return true;
    if (!document.body) return false;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    document.body.insertAdjacentHTML('beforeend',
      '<div id="ehtr-modal" hidden><div class="ehtr-scrim" data-ehtr-close></div>' +
      '<div class="ehtr-panel" role="dialog" aria-modal="true" aria-label="Trash">' +
      '<div class="ehtr-head"><div><div class="ehtr-eyebrow">Recycle bin</div><div class="ehtr-title">Trash</div></div>' +
      '<button class="ehtr-x" data-ehtr-close aria-label="Close">✕</button></div>' +
      '<div class="ehtr-body"><div class="ehtr-toolbar">' +
      '<div class="ehtr-search">🔍<input id="ehtr-q" placeholder="Search trash…"></div>' +
      '<span class="ehtr-count" id="ehtr-count"></span></div>' +
      '<div class="ehtr-actions"><button class="ehtr-btn" id="ehtr-restoreall">♻ Restore all</button>' +
      '<button class="ehtr-btn danger" id="ehtr-emptyall">Empty trash</button></div>' +
      '<div class="ehtr-list" id="ehtr-list"></div></div></div></div>');
    document.getElementById('ehtr-q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    return true;
  }

  var tries = 0;
  function mountFab() {
    var host = document.getElementById('eh-fabs');
    if (host) {
      if (!document.getElementById('ehtr-fab')) {
        host.insertAdjacentHTML('beforeend',
          '<button class="eh-fab" id="ehtr-fab" data-ehtr-open aria-label="Open Trash">' + TRASH_SVG +
          '<span class="eh-fab-tip">Trash</span></button>');
      }
      return true;
    }
    if (document.getElementById('ehtr-fab')) return true;
    if (!document.getElementById('ehtr-fabs')) {
      var w = document.createElement('div'); w.id = 'ehtr-fabs';
      w.innerHTML = '<button class="eh-fab" id="ehtr-fab" data-ehtr-open aria-label="Open Trash">' + TRASH_SVG + '</button>';
      document.body.appendChild(w);
    }
    return true;
  }
  function boot() {
    if (!inject()) { setTimeout(boot, 300); return; }
    if (mountFab() || ++tries > 15) return;      /* retries while ai.js creates #eh-fabs */
    setTimeout(boot, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
