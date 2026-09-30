/* =====================================================================
   EDUHUB · AutoTrash v1 — capture deletions into data.trash
   Wraps the global saveData() and diffs watched arrays between saves.
   Anything user content that disappears is moved to trash first.
   Deliberately NOT trashed: history, logs, sessions (permanent by design)
   and edits (an edit removes+adds in one save — detected and skipped).
   Load AFTER script.js on every page.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_AUTOTRASH__) return;
  window.__EH_AUTOTRASH__ = true;

  var WATCH = ['notes', 'notices', 'habits', 'files', 'assignments', 'goals', 'readingList'];
  var LABELS = ['name', 'title', 'text', 'label', 'fileName', 'task', 'content', 'url'];
  var MAX_TRASH = 80, QUOTA = 4300000;
  var active = true, prev = null, lastToast = 0;

  function labelOf(it) {
    if (!it || typeof it !== 'object') return String(it == null ? '' : it).slice(0, 60);
    for (var i = 0; i < LABELS.length; i++) {
      var v = it[LABELS[i]];
      if (v != null && v !== '') return String(v).slice(0, 60);
    }
    try { var j = JSON.stringify(it); return j && j.length > 80 ? j.slice(0, 57) + '…' : j; } catch (e) { return '?'; }
  }
  function keyOf(it) {
    if (!it || typeof it !== 'object') return 'p:' + String(it);
    for (var i = 0; i < LABELS.length; i++) {
      var f = LABELS[i];
      if (it[f] != null && it[f] !== '') return f + ':' + it[f];
    }
    try { return 'j:' + JSON.stringify(it); } catch (e) { return 'u:' + Math.random(); }
  }
  function diffArray(oldA, newA) {
    var removed = [], added = [], map = new Map();
    (oldA || []).forEach(function (it) { var k = keyOf(it), e = map.get(k); if (e) e.c++; else map.set(k, { c: 1, it: it }); });
    (newA || []).forEach(function (it) { var k = keyOf(it), e = map.get(k); if (e && e.c > 0) e.c--; else added.push(it); });
    map.forEach(function (e) { if (e.c > 0) removed.push(e.it); });
    return { removed: removed, added: added };
  }
  function snap(d) {
    var s = {};
    WATCH.forEach(function (k) { s[k] = (d[k] || []).slice(); });
    s._decks = (d.flashcards && d.flashcards.decks ? d.flashcards.decks : []).slice();
    s._trashLabels = (d.trash || []).map(labelOf);
    return s;
  }
  function initPrev() {
    if (prev) return;
    try { if (typeof loadData === 'function') prev = snap(loadData()); else prev = {}; }
    catch (e) { prev = {}; }
  }
  function showToast(msg) {
    var t = document.getElementById('eh-toast');
    if (t) { t.textContent = msg; t.hidden = false; t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2200); }
    else console.log('[AutoTrash]', msg);
  }
  function toastOnce(n) {
    var now = Date.now(); if (now - lastToast < 800) return; lastToast = now;
    showToast(n + ' item' + (n > 1 ? 's' : '') + ' moved to Trash');
  }

  function capture(d) {
    if (!prev) return [];
    var captured = [];
    WATCH.forEach(function (k) {
      var r = diffArray(prev[k] || [], d[k] || []);
      if (!r.removed.length || r.added.length) return; /* no deletions, or an edit/replace — skip */
      r.removed.forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        captured.push({ type: k, name: labelOf(it), item: it, ts: Date.now() });
      });
    });
    (function () { /* flashcard decks (nested) */
      var r = diffArray(prev._decks || [], (d.flashcards && d.flashcards.decks) || []);
      if (r.removed.length && !r.added.length) r.removed.forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        captured.push({ type: 'flashcards', name: labelOf(it), item: it, ts: Date.now() });
      });
    })();
    /* don't double-capture if the site's own code already moved it to trash this save */
    if (captured.length && d.trash && d.trash.length) {
      var newly = d.trash.map(labelOf), pl = prev._trashLabels || [];
      pl.forEach(function (l) { var i = newly.indexOf(l); if (i > -1) newly.splice(i, 1); });
      captured = captured.filter(function (c) { return newly.indexOf(c.name) === -1; });
    }
    return captured;
  }

  function tryWrap() {
    if (typeof saveData !== 'function' || saveData.__ehWrapped) return typeof saveData === 'function';
    var orig = saveData;
    var wrapped = function (d) {
      var cap = [];
      try { initPrev(); if (active && d && typeof d === 'object') cap = capture(d); } catch (e) { cap = []; }
      if (cap.length) {
        d.trash = (d.trash && d.trash.push) ? d.trash : [];
        cap.forEach(function (c) { d.trash.push(c); });
        while (d.trash.length > MAX_TRASH) d.trash.shift();
        try { /* quota guard: big files can fill localStorage — evict oldest trash */
          var size = JSON.stringify(d).length, dropped = 0;
          while (size > QUOTA && d.trash.length) { d.trash.shift(); dropped++; size = JSON.stringify(d).length; }
          if (dropped) console.warn('[AutoTrash] quota: dropped', dropped, 'oldest trash entries');
        } catch (e) {}
        toastOnce(cap.length);
      }
      try { prev = snap(d); } catch (e) {}
      try { return orig(d); }
      catch (err) { /* storage full? undo this save's captures and retry the original save once */
        if (cap.length && d.trash && d.trash.length >= cap.length) {
          try { d.trash.splice(d.trash.length - cap.length, cap.length); orig(d); prev = snap(d); return; } catch (e2) { return; }
        }
        throw err;
      }
    };
    wrapped.__ehWrapped = true;
    saveData = wrapped;
    return true;
  }
  var tries = 0;
  (function boot() {
    if (tryWrap() || ++tries > 12) {
      if (!tryWrap()) console.warn('[AutoTrash] saveData() not found — load this file AFTER script.js');
      return;
    }
    setTimeout(boot, 400);
  })();

  /* ---- smarter restore (supports flashcard decks + our wrapper format) ---- */
  var TARGETS = { notes:'notes', note:'notes', notices:'notices', notice:'notices', habits:'habits',
    habit:'habits', files:'files', file:'files', assignments:'assignments', assignment:'assignments',
    goals:'goals', goal:'goals', readinglist:'readingList', reading:'readingList',
    flashcards:'flashcards.decks', deck:'flashcards.decks' };
  function targetArr(d, type) {
    var key = TARGETS[(type || '').toLowerCase()] || type || '';
    var parts = String(key).split('.'), cur = d;
    for (var i = 0; i < parts.length; i++) cur = cur ? cur[parts[i]] : null;
    return (cur && cur.push) ? cur : null;
  }
  if (window.TrashFix) {
    window.TrashFix.restore = function (id) {
      var d; try { d = loadData(); } catch (e) { return; }
      if (!d || !d.trash) return;
      var idx = -1;
      for (var i = 0; i < d.trash.length; i++) {
        var w = d.trash[i];
        var wid = w.id != null ? w.id : w.name != null ? w.name :
                  (w.item ? (w.item.id != null ? w.item.id : (w.item.name || w.item.title || '')) : '');
        if (String(wid) === String(id)) { idx = i; break; }
      }
      if (idx < 0) return;
      var it = d.trash[idx], arr = targetArr(d, it.type);
      if (arr) {
        arr.push(it.item != null ? it.item : it);
        d.trash.splice(idx, 1);
        try { saveData(d); showToast('Restored');
          var names = ['renderTrash','renderTrashList','renderTrashItems','renderFiles','renderNotes','renderAll','initTrash'];
          for (var j = 0; j < names.length; j++) { try { if (typeof window[names[j]] === 'function') { window[names[j]](); break; } } catch (e) {} }
          return;
        } catch (e) {}
      }
      showToast('Restore target unknown — kept in trash');
    };
  }

  window.AutoTrash = {
    pause: function () { active = false; },
    resume: function () { active = true; },
    count: function () { try { return (loadData().trash || []).length; } catch (e) { return -1; } }
  };
})();
