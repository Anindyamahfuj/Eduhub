/* EDUHUB · Trash Fix v2 — wider detection + auto refresh + debug() */
(function () {
  'use strict';
  function getData() { try { if (typeof loadData === 'function') return loadData(); } catch (e) {} return null; }
  function persist(d) { try { if (typeof saveData === 'function') { saveData(d); return true; } } catch (e) {} return false; }
  function toast(msg) {
    var t = document.getElementById('eh-toast');
    if (t) { t.textContent = msg; t.hidden = false; t.classList.add('show');
      setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2200); return; }
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
    for (var i = 0; i < tr.length; i++)
      if (String(idOf(tr[i])) === String(id) || String(innerId(tr[i])) === String(id)) return i;
    return -1;
  }
  function argFromClick(btn, row) {
    var els = [btn, row];
    for (var i = 0; i < els.length; i++) {
      if (!els[i] || !els[i].getAttribute) continue;
      var oc = els[i].getAttribute('onclick') || els[i].getAttribute('onmouseover');
      if (oc) { var m = oc.match(/['"]([^'"]+)['"]/); if (m) return m[1]; }
    }
    return null;
  }
  function rowOf(el) {
    return el.closest ? el.closest('[data-id],[data-name],[data-index],.trash-item,.file-item,.deleted-item,li,tr,div[class*="item"]') : null;
  }
  function inTrash(el) {
    if (/trash|recycle|deleted|\bbin\b/i.test(location.pathname + location.hash)) return true;
    var n = el, hops = 0;
    while (n && n !== document.body && hops < 12) {
      var s = ((n.id || '') + ' ' + (n.className || '')).toLowerCase();
      if (/trash|recycle|deleted|\bbin\b/.test(s)) return true;
      if (n.getAttribute && /trash/i.test(n.getAttribute('onclick') || '')) return true;
      n = n.parentElement; hops++;
    }
    var b = ((el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('onclick') || '')).toLowerCase();
    return /trash|deleted|restore/.test(b);
  }
  function rerender() {
    var names = ['renderTrash','renderTrashList','renderTrashItems','renderDeleted','renderFiles','renderAll','initTrash'];
    for (var i = 0; i < names.length; i++) {
      try { if (typeof window[names[i]] === 'function') { window[names[i]](); return true; } } catch (e) {}
    }
    return false;
  }
  function refresh() { if (!rerender()) setTimeout(function () { location.reload(); }, 500); }
  function del(id) {
    var d = getData(); if (!d || !d.trash) { toast('No trash data found'); return; }
    var i = matchIndex(d.trash, id);
    if (i < 0) { toast('Item not found in trash'); return; }
    d.trash.splice(i, 1);
    if (persist(d)) { toast('Deleted forever'); refresh(); } else toast('Could not save');
  }
  function restore(id) {
    var d = getData(); if (!d || !d.trash) return;
    var i = matchIndex(d.trash, id); if (i < 0) return;
    var it = d.trash[i];
    var map = { file:'files', files:'files', note:'notes', notes:'notes', notice:'notices',
                habit:'habits', assignment:'assignments', goal:'goals', reading:'readingList' };
    var key = map[(it.type || '').toLowerCase()] || it.target || it.origin;
    if (key && Object.prototype.toString.call(d[key]) === '[object Array]') {
      d[key].push(it.item || it);
      d.trash.splice(i, 1);
      if (persist(d)) { toast('Restored'); refresh(); return; }
    }
    toast('Restore target unknown — kept in trash');
  }
  function empty() {
    var d = getData(); if (!d) { toast('No data'); return; }
    if (!d.trash || !d.trash.length) { toast('Trash is already empty'); return; }
    var n = d.trash.length; d.trash.length = 0;
    if (persist(d)) { toast(n + ' item(s) deleted forever'); refresh(); } else toast('Could not save');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button,[role="button"],a,i,.btn,svg') : null;
    if (!btn) btn = e.target;
    if (!btn || !inTrash(btn)) return;
    var sig = ((btn.id || '') + ' ' + (btn.className || '') + ' ' + (btn.getAttribute('data-action') || '') +
               ' ' + (btn.getAttribute('aria-label') || '') + ' ' + (btn.title || '') + ' ' + (btn.textContent || '')).toLowerCase();
    var row = rowOf(btn);
    var rowCtx = (row ? ((row.id || '') + ' ' + (row.className || '') + ' ' + (row.getAttribute('onclick') || '')) : '').toLowerCase();
    var wantEmpty = (/empty[-_]trash/i.test(btn.id + ' ' + (btn.className || ''))) ||
                    (/empty|clear|wipe/.test(sig) && /trash|bin|recycle|deleted/.test(sig + ' ' + rowCtx));
    if (wantEmpty) { e.preventDefault(); e.stopPropagation(); empty(); return; }
    var isRestore = /restore|recover|undo|↩|♻/.test(sig);
    var isDelete  = /delete|remove|forever|discard|🗑|✕|×|trash/.test(sig);
    if (!isRestore && !isDelete) return;
    var id = btn.getAttribute('data-id') ||
             (row && (row.getAttribute('data-id') || row.getAttribute('data-name'))) ||
             argFromClick(btn, row);
    if (id == null && row && row.getAttribute('data-index') != null) {
      var d = getData(), it = d && d.trash && d.trash[+row.getAttribute('data-index')];
      if (it) id = idOf(it) || innerId(it);
    }
    if (id == null || id === '') { console.warn('[TrashFix] click seen but no id found on:', btn, row); return; }
    e.preventDefault(); e.stopPropagation();
    if (isRestore && !isDelete) restore(id); else del(id);
  }, true);
  /* Paste this in the console on the trash page: TrashFix.debug() */
  window.TrashFix = {
    del: del, restore: restore, empty: empty,
    debug: function () {
      var d = getData();
      console.log('trash items:', d && d.trash ? d.trash.length : 'NO DATA', d && d.trash);
      console.log('buttons in trash context:',
        Array.prototype.slice.call(document.querySelectorAll('button,[role="button"],a'))
          .filter(inTrash).map(function (b) {
            return { text: (b.textContent || '').trim().slice(0, 30), id: b.id, cls: b.className,
                     onclick: b.getAttribute('onclick'), row: (rowOf(b) || {}).id };
          }));
      console.log('rerender fn found:', rerender.toString().length > 0 ? rerender() : false);
    }
  };
})();
