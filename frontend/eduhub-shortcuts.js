/* =====================================================================
   EDUHUB · Shortcut Manager · v1.0
   - Add/edit/remove shortcuts. Edit + Remove are fixed 26px icon
     squares, absolutely positioned → they can never overlap.
   - Icons: auto site favicon, pasted image URL, or uploaded file
     (resized to 160px on a canvas). Any failed image falls back to a
     letter tile automatically — a broken/empty box is impossible.
   - Stored on-device. Optional flags (set BEFORE this script):
       window.EDUHUB_SC_NO_FAB = true;   // don't auto-create the round button
   Open programmatically: EduHubShortcuts.open()
   Attach to your own button:  <button data-ehsc-open>Shortcuts</button>
   ===================================================================== */
(function () {
  'use strict';

  /* helpers */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = (() => {
    const mem = {}; let ok = true;
    try { localStorage.setItem('__esc', '1'); localStorage.removeItem('__esc'); } catch (e) { ok = false; }
    return {
      get(k, d) { try { const v = ok ? localStorage.getItem(k) : mem[k]; return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(k, v) { try { if (ok) localStorage.setItem(k, JSON.stringify(v)); else mem[k] = JSON.stringify(v); return true; } catch (e) { return false; } }
    };
  })();

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* icons */
  const P = {
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    wand: '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>'
  };
  const ic = (n, s) => '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>';

  /* url + icon logic */
  const LS = 'eduhub.shortcuts.v1';
  function normalizeUrl(u) {
    u = (u || '').trim();
    if (!u) return '';
    if (/^\/\//.test(u)) return 'https:' + u;
    if (/^https?:\/\//i.test(u) || /^data:image\//i.test(u)) return u;
    return 'https://' + u;
  }
  function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function faviconFor(u) { return 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(domainOf(u)); }

  const PAL = [['#0c6a43', '#e0f1e8'], ['#0d5f70', '#def0f3'], ['#8a5a12', '#f8eedb'], ['#9c3a2a', '#f8e5e0'], ['#5b4a8a', '#eae6f5']];
  function letterTile(title, cls) {
    const p = PAL[hashStr(title || '?') % PAL.length];
    return '<span class="' + (cls || 'ehsc-letter') + '" style="background:' + p[1] + ';color:' + p[0] + '">' +
      esc((title || '?').trim().charAt(0).toUpperCase() || '?') + '</span>';
  }
  function thumbHTML(s) {
    const src = s.img ? s.img : faviconFor(s.url);
    return '<img class="ehsc-thumb" src="' + esc(src) + '" alt="" data-ehsc-fb="' + esc(s.title) + '" data-ehsc-fbclass="ehsc-letter">';
  }
  function wireFallbacks(root) {
    $$('img[data-ehsc-fb]', root || document).forEach(im => {
      im.addEventListener('error', function h() {
        im.removeEventListener('error', h);
        const t = document.createElement('template');
        t.innerHTML = letterTile(im.dataset.ehscFb, im.dataset.ehscFbclass || 'ehsc-letter');
        im.replaceWith(t.content.firstChild);
      });
    });
  }

  /* state */
  const state = { editId: null, q: '', imgDraft: null, confirmId: null };
  let bodyEl = null, lastFocus = null, toastT = null, confirmT = null;

  function toast(msg) {
    const t = $('#ehsc-toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 240); }, 2200);
  }
  function setHead(eyebrow, title) {
    $('#ehsc-head-eyebrow').textContent = eyebrow;
    $('#ehsc-head-title').textContent = title;
    bodyEl.scrollTop = 0;
  }
  function openModal() {
    const m = $('#ehsc-modal');
    lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('ehsc-in')));
    const x = $('.ehsc-x', m); if (x) x.focus();
  }
  function closeModal() {
    const m = $('#ehsc-modal');
    if (!m || m.hidden) return;
    m.classList.remove('ehsc-in');
    setTimeout(() => { m.hidden = true; }, 240);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- grid ---------- */
  function cardHTML(s) {
    return '<div class="ehsc-card ehsc-rise">' +
      '<a class="ehsc-hit" href="' + esc(s.url) + '" target="_blank" rel="noopener" title="Open ' + esc(domainOf(s.url)) + '">' +
        thumbHTML(s) +
        '<span class="ehsc-t">' + esc(s.title) + '</span>' +
        '<span class="ehsc-d">' + esc(domainOf(s.url)) + '</span>' +
      '</a>' +
      '<div class="ehsc-acts">' +
        '<button class="ehsc-ib" data-act="edit" data-id="' + s.id + '" aria-label="Edit shortcut" title="Edit">' + ic('pencil', 13) + '</button>' +
        '<button class="ehsc-ib danger" data-act="del" data-id="' + s.id + '" aria-label="Remove shortcut" title="Remove">' + ic('trash', 13) + '</button>' +
      '</div></div>';
  }

  function renderGrid(refocus) {
    setHead('Quick access', 'My Shortcuts');
    const list = store.get(LS, []);
    const q = state.q.toLowerCase();
    const items = list.filter(s => !q || (s.title + ' ' + domainOf(s.url)).toLowerCase().indexOf(q) > -1);

    bodyEl.innerHTML =
      '<div class="ehsc-top">' +
        '<div class="ehsc-search">' + ic('search', 16) + '<input id="ehsc-q" placeholder="Search shortcuts…" value="' + esc(state.q) + '"></div>' +
        '<button class="ehsc-btn" id="ehsc-new">' + ic('plus', 15) + ' New</button>' +
      '</div>' +
      (list.length === 0
        ? '<div class="ehsc-empty ehsc-rise"><b>No shortcuts yet.</b><br>Add the sites you open every day — past-paper banks, class portals, YouTube playlists — and they will live one click away.</div>'
        : (items.length === 0
          ? '<div class="ehsc-empty">No shortcut matches “' + esc(state.q) + '”.</div>'
          : '<div class="ehsc-grid">' + items.map(cardHTML).join('') + '</div>')));

    wireFallbacks(bodyEl);
    $('#ehsc-new').addEventListener('click', () => renderForm(null));
    const qi = $('#ehsc-q');
    qi.addEventListener('input', e => { state.q = e.target.value; renderGrid(true); });
    if (refocus) { qi.focus(); const L = qi.value.length; try { qi.setSelectionRange(L, L); } catch (e) {} }
    $$('.ehsc-ib', bodyEl).forEach(b => b.addEventListener('click', onCardAction));
  }

  function onCardAction(e) {
    const b = e.currentTarget, id = b.dataset.id, act = b.dataset.act;
    if (act === 'edit') { renderForm(id); return; }
    if (act !== 'del') return;
    if (state.confirmId === id) {                      /* second tap = confirmed */
      clearTimeout(confirmT); state.confirmId = null;
      const list = store.get(LS, []).filter(s => s.id !== id);
      if (store.set(LS, list)) { toast('Shortcut removed'); renderGrid(false); }
      else toast('Could not save — device storage may be full');
    } else {                                           /* first tap = arm */
      state.confirmId = id;
      b.classList.add('confirm'); b.innerHTML = ic('check', 13); b.title = 'Tap again to confirm';
      clearTimeout(confirmT);
      confirmT = setTimeout(() => {
        if (state.confirmId !== id) return;
        state.confirmId = null;
        const cur = $('.ehsc-ib[data-act="del"][data-id="' + id + '"]', bodyEl);
        if (cur) { cur.classList.remove('confirm'); cur.innerHTML = ic('trash', 13); cur.title = 'Remove'; }
      }, 2600);
    }
  }

  /* ---------- add / edit form ---------- */
  function renderForm(id) {
    state.editId = id || null; state.imgDraft = null;
    const cur = id ? store.get(LS, []).find(s => s.id === id) : null;
    setHead('Shortcuts', cur ? 'Edit shortcut' : 'New shortcut');
    bodyEl.innerHTML =
      '<div class="ehsc-label">Title</div>' +
      '<input id="ehsc-title" class="ehsc-input" maxlength="40" placeholder="e.g. Past papers — Maths" value="' + esc(cur ? cur.title : '') + '">' +
      '<div class="ehsc-label">Link</div>' +
      '<input id="ehsc-url" class="ehsc-input" inputmode="url" placeholder="e.g. savemyexams.com/a-level/maths" value="' + esc(cur ? cur.url.replace(/^https?:\/\//i, '') : '') + '">' +
      '<div class="ehsc-label">Icon <span class="ehsc-opt">optional — the site’s real icon is fetched automatically if empty</span></div>' +
      '<div class="ehsc-imgrow">' +
        '<div class="ehsc-preview" id="ehsc-prev"></div>' +
        '<div style="flex:1;min-width:0">' +
          '<input id="ehsc-imgurl" class="ehsc-input" placeholder="Paste an image URL…" value="' + esc(cur && cur.img && !/^data:/i.test(cur.img) ? cur.img : '') + '">' +
          '<div class="ehsc-imgbtns">' +
            '<button class="ehsc-mini" id="ehsc-upl" type="button">' + ic('upload', 13) + ' Upload image</button>' +
            '<button class="ehsc-mini" id="ehsc-auto" type="button">' + ic('wand', 13) + ' Use site icon</button>' +
            '<button class="ehsc-mini" id="ehsc-clr" type="button">' + ic('x', 13) + ' Clear</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<input type="file" id="ehsc-file" accept="image/*" hidden>' +
      '<div class="ehsc-note">Uploads are resized to 160px and stored on this device. If an image URL is broken or slow, a letter tile takes its place automatically — an empty box can never appear.</div>' +
      '<div class="ehsc-err" id="ehsc-ferr" hidden></div>' +
      '<div class="ehsc-formfoot">' +
        '<button class="ehsc-btn-ghost" id="ehsc-cancel" type="button">Cancel</button>' +
        '<button class="ehsc-btn" id="ehsc-save" type="button">' + ic('check', 15) + ' ' + (cur ? 'Save changes' : 'Add shortcut') + '</button>' +
      '</div>';

    function currentImage() {
      if (state.imgDraft) return state.imgDraft;
      const u = $('#ehsc-imgurl').value.trim();
      if (u) return /^data:image\//i.test(u) ? u : normalizeUrl(u);
      const link = $('#ehsc-url').value.trim();
      return link ? faviconFor(normalizeUrl(link)) : null;
    }
    function drawPreview() {
      const prev = $('#ehsc-prev'); if (!prev) return;
      const t = $('#ehsc-title').value.trim() || 'S';
      const v = currentImage();
      prev.innerHTML = v
        ? '<img src="' + esc(v) + '" alt="" data-ehsc-fb="' + esc(t) + '" data-ehsc-fbclass="ehsc-letter ehsc-letter-fill">'
        : letterTile(t, 'ehsc-letter ehsc-letter-fill');
      wireFallbacks(prev);
    }
    function fail(m) { const e = $('#ehsc-ferr'); e.textContent = m; e.hidden = false; }

    $('#ehsc-title').addEventListener('input', drawPreview);
    $('#ehsc-url').addEventListener('input', drawPreview);
    $('#ehsc-imgurl').addEventListener('input', () => { state.imgDraft = null; drawPreview(); });
    $('#ehsc-upl').addEventListener('click', () => $('#ehsc-file').click());
    $('#ehsc-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) return fail('That file is not an image.');
      if (f.size > 5 * 1024 * 1024) return fail('Image too large — pick one under 5 MB.');
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          try {
            const S = 160, c = document.createElement('canvas');
            c.width = S; c.height = S;
            const ctx = c.getContext('2d');
            const r = Math.max(S / im.width, S / im.height), w = im.width * r, h = im.height * r;
            ctx.drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
            state.imgDraft = c.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
            $('#ehsc-imgurl').value = '';
            $('#ehsc-ferr').hidden = true;
            drawPreview(); toast('Image ready');
          } catch (err) { state.imgDraft = fr.result; drawPreview(); }
        };
        im.onerror = () => fail('Could not read that image.');
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
      e.target.value = '';
    });
    $('#ehsc-auto').addEventListener('click', () => { $('#ehsc-imgurl').value = ''; state.imgDraft = null; drawPreview(); toast('Using the site’s own icon'); });
    $('#ehsc-clr').addEventListener('click', () => { $('#ehsc-imgurl').value = ''; state.imgDraft = null; drawPreview(); });
    $('#ehsc-cancel').addEventListener('click', () => renderGrid(false));
    $('#ehsc-save').addEventListener('click', save);
    ['ehsc-title', 'ehsc-url'].forEach(x => $('#' + x).addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));

    function save() {
      const title = $('#ehsc-title').value.trim();
      const url = normalizeUrl($('#ehsc-url').value);
      if (!title) return fail('Give the shortcut a title.');
      let okUrl = false; try { okUrl = /^https?:\/\//i.test(new URL(url).protocol + '//'); } catch (e) {}
      try { if (!/^https?:\/\//i.test(url)) throw 0; } catch (e) { return fail('Links must start with http(s) — e.g. savemyexams.com'); }
      const img = state.imgDraft || ($('#ehsc-imgurl').value.trim() ? normalizeUrl($('#ehsc-imgurl').value) : null);
      const list = store.get(LS, []);
      if (state.editId) {
        const i = list.findIndex(s => s.id === state.editId);
        if (i > -1) { list[i].title = title; list[i].url = url; list[i].img = img; }
      } else {
        list.unshift({ id: 's' + Date.now(), title: title, url: url, img: img });
      }
      if (!store.set(LS, list)) return fail('Could not save — device storage is full. Try a smaller image.');
      toast(state.editId ? 'Shortcut updated' : 'Shortcut added');
      renderGrid(false);
    }

    drawPreview();
  }

  /* ---------- boot ---------- */
  function init() {
    if ($('#ehsc-fabs')) return;
    bodyEl = null;
    if (!window.EDUHUB_SC_NO_FAB) {
      const wrap = document.createElement('div');
      wrap.id = 'ehsc-fabs';
      wrap.innerHTML = '<button class="ehsc-fab" data-ehsc-open aria-label="Open Shortcuts">' + ic('bookmark', 21) + '<span class="ehsc-fab-tip">Shortcuts</span></button>';
      document.body.appendChild(wrap);
    }
    document.body.insertAdjacentHTML('beforeend',
      '<div id="ehsc-modal" hidden>' +
        '<div class="ehsc-scrim data-ehsc-scrim"></div>'.replace(' class="ehsc-scrim data-ehsc-scrim"', 'class="ehsc-scrim" data-ehsc-close') +
        '<div class="ehsc-panel" role="dialog" aria-modal="true" aria-label="Shortcuts">' +
          '<header class="ehsc-head">' +
            '<div><div class="ehsc-eyebrow" id="ehsc-head-eyebrow"></div><h2 class="ehsc-htitle" id="ehsc-head-title"></h2></div>' +
            '<button class="ehsc-x" data-ehsc-close aria-label="Close">' + ic('x', 16) + '</button>' +
          '</header>' +
          '<div class="ehsc-body" id="ehsc-body"></div>' +
        '</div>' +
      '</div>' +
      '<div id="ehsc-toast" hidden></div>');
    bodyEl = $('#ehsc-body');

    document.addEventListener('click', e => {
      if (e.target.closest('[data-ehsc-open]')) { renderGrid(false); openModal(); return; }
      if (e.target.closest('[data-ehsc-close]')) closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.EduHubShortcuts = { open: () => { renderGrid(false); openModal(); } };
})();
