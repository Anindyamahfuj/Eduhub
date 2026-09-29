/* =====================================================================
   EDUHUB · Trash Fix v1 — repairs per-item delete/restore + empty trash
   Works against StudyHub's storage contract (global loadData/saveData
   and data.trash). Quote-proof: reads IDs from data-attributes or
   recovers them from broken inline onclick arguments.
   Manual API: TrashFix.del(id) · TrashFix.restore(id) · TrashFix.empty()
   ===================================================================== */
(function () {
  'use strict';
  function getData() { try { if (typeof loadData === 'function') return loadData(); } catch (e) {} return null; }
  function persist(d) { try { if (typeof saveData === 'function') { saveData(d); return true; } } catch (e) {} return false; }
  function toast(msg) {
    var t = document.getElementById('eh-toast');
    if (t) { t.textContent = msg; t.hidden = false; t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2000); return; }
    console.log('[TrashFix]', msg);
  }
  function idOf(it) {
    if (!it) return '';
    if (it.id != null) return it.id;
    if (it.fileId != null) return it.fileId;
    if (it.key != null) return it.key;
    if (it.name != null) return it.name;
    if (it.title != null) return it.title;
    return '';
  }
  function innerId(it) { return it && it.item ? idOf(it.item) : null; }
  function matchIndex(tr, id) {
    for (var i = 0; i < tr.length; i++) {
      if (String(idOf(tr[i])) === String(id) || String(innerId(tr[i])) === String(id)) return i;
    }
    return -1;
  }
  function argFromClick(btn, row) {
    var els = [btn, row];
    for (var i = 0; i < els.length; i++) {
      if (!els[i] || !els[i].getAttribute) continue;
      var oc = els[i].getAttribute('onclick');
      if (oc) { var m = oc.match(/['"]([^'"]+)['"]/); if (m) return m[1]; }
    }
    return null;
  }
  function rowOf(el) {
    return el.closest ? el.closest('[data-id],[data-name],[data-index],.trash-item,.file-item,li,tr') : null;
  }
  function inTrash(el) {
    var n = el, hops = 0;
    while (n && n !== document.body && hops < 8) {
      var s = ((n.id || '') + ' ' + (n.className || '')).toLowerCase();
      if (/trash|recycle|bin/.test(s)) return true;
      n = n.parentElement; hops++;
    }
    return false;
  }
  function rerender() {
    var names = ['renderTrash', 'renderTrashList', 'renderTrashItems', 'renderFiles', 'renderAll'];
    for (var i = 0; i < names.length; i++) {
      try { if (typeof window[names[i]] === 'function') { window[names[i]](); return; } } catch (e) {}
    }
  }
  function del(id) {
    var d = getData(); if (!d || !d.trash) { toast('Trash not found'); return; }
    var i = matchIndex(d.trash, id);
    if (i < 0) { toast('Item not found in trash'); return; }
    d.trash.splice(i, 1);
    if (persist(d)) { toast('Deleted forever'); rerender(); }
    else toast('Could not save');
  }
  function restore(id) {
    var d = getData(); if (!d || !d.trash) return;
    var i = matchIndex(d.trash, id); if (i < 0) return;
    var it = d.trash[i];
    var map = { file: 'files', files: 'files', note: 'notes', notes: 'notes', notice: 'notices',
                habit: 'habits', assignment: 'assignments', goal: 'goals', reading: 'readingList' };
    var key = map[(it.type || '').toLowerCase()] || it.target || it.origin;
    if (key && Object.prototype.toString.call(d[key]) === '[object Array]') {
      d[key].push(it.item || it);
      d.trash.splice(i, 1);
      if (persist(d)) { toast('Restored'); rerender(); return; }
    }
    toast('Restore target unknown — item kept in trash');
  }
  function empty() {
    var d = getData(); if (!d) return;
    if (!d.trash || !d.trash.length) { toast('Trash is already empty'); return; }
    var n = d.trash.length;
    d.trash.length = 0;
    if (persist(d)) { toast(n + ' item(s) deleted forever'); rerender(); }
    else toast('Could not save');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button,[role="button"],a,.btn') : null;
    if (!btn || !inTrash(btn)) return;
    var sig = ((btn.id || '') + ' ' + (btn.className || '') + ' ' + (btn.getAttribute('data-action') || '') +
               ' ' + (btn.getAttribute('aria-label') || '') + ' ' + (btn.textContent || '')).toLowerCase();
    var row = rowOf(btn);
    var rowCtx = (row ? ((row.id || '') + ' ' + (row.className || '')) : '').toLowerCase();
    var bigEmpty = (btn.id && /empty.*trash|trash.*empty/i.test(btn.id)) ||
                   (/empty[-_]trash/i.test(btn.className || ''));
    var wantEmpty = bigEmpty || (/empty|clear|vaciar|vider|leeren/.test(sig) && /trash|bin|recycle/.test(sig + ' ' + rowCtx));
    if (wantEmpty) { e.preventDefault(); e.stopPropagation(); empty(); return; }
    var isRestore = /restore|recover|undo|↩|♻/.test(sig);
    var isDelete = /delete|remove|forever|trash|discard|🗑|✕|×/.test(sig);
    if (!isRestore && !isDelete) return;
    var id = btn.getAttribute('data-id') ||
             (row && (row.getAttribute('data-id') || row.getAttribute('data-name'))) ||
             argFromClick(btn, row);
    if (id == null && row && row.getAttribute('data-index') != null) {
      var d = getData();
      if (d && d.trash && d.trash[+row.getAttribute('data-index')]) {
        var it = d.trash[+row.getAttribute('data-index')];
        id = idOf(it) || innerId(it);
      }
    }
    if (id == null || id === '') return;
    e.preventDefault(); e.stopPropagation();
    if (isRestore && !isDelete) restore(id); else del(id);
  }, true);
  window.TrashFix = { del: del, restore: restore, empty: empty };
})();
