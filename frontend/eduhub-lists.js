/* =====================================================================
   EDUHUB · List Maker v1 — named task lists (shopping, packing, …)
   • Create · inline rename · dated cards · checkable items · progress
   • Delete whole list → Trash → restore/delete-forever via Trash popup
   Storage: studyHubData.lists (same bucket & backup as notes/habits).
   Requires script.js — load AFTER it. Injects its own UI + styles.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_LISTS__) return;
  window.__EH_LISTS__ = true;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).substr(2,5); }
  function fmtDate(ts){ try{ return new Date(ts).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}); }catch(e){ return ''; } }
  function getData(){ try{ if(typeof loadData==='function') return loadData(); }catch(e){} return {}; }
  function put(d){ try{ if(typeof saveData==='function') saveData(d); }catch(e){} }
  function toast(m){ var t=document.getElementById('eh-toast');
    if(t){ t.textContent=m; t.hidden=false; t.classList.add('show');
      setTimeout(function(){ t.classList.remove('show'); t.hidden=true; },2200); }
    else if(typeof window.showToast==='function') window.showToast(m,'ok'); }
  function lists(d){ if(!Array.isArray(d.lists)) d.lists=[]; return d.lists; }

  /* ---------- CSS ---------- */
  var CSS =
    '#listsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:.9rem}' +
    '.ls-card{background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.14));border-radius:14px;padding:.95rem 1rem;display:flex;flex-direction:column;gap:.65rem;transition:border-color .18s}' +
    '.ls-card:hover{border-color:var(--line-2,rgba(148,163,184,.24))}' +
    '.ls-head{display:flex;align-items:flex-start;gap:.4rem}' +
    '.ls-name{flex:1;min-width:0;font:650 .95rem var(--display,var(--font));color:var(--ink,#edf2f7);word-break:break-word;line-height:1.3}' +
    '.ls-rename{flex:1;min-width:0;background:rgba(0,0,0,.3);border:1px solid var(--accent,#3fd2b0);border-radius:8px;color:var(--ink,#edf2f7);font:600 .9rem var(--font,inherit);padding:.2rem .5rem;outline:none}' +
    '.ls-ic{background:transparent;border:none;color:var(--faint,#7a8a9e);cursor:pointer;font-size:.85rem;padding:3px;border-radius:6px;flex:none}' +
    '.ls-ic:hover{color:var(--accent,#3fd2b0)}' +
    '.ls-ic.del:hover{color:var(--danger,#f0938c)}' +
    '.ls-meta{display:flex;align-items:center;justify-content:space-between;gap:.5rem;font:500 .7rem var(--font,inherit);color:var(--muted,#8d9aa9)}' +
    '.ls-meta b{font-family:var(--mono,monospace);font-weight:600;color:var(--accent,#3fd2b0)}' +
    '.ls-bar{height:5px;border-radius:99px;background:var(--surface-3,rgba(148,163,184,.1));overflow:hidden}' +
    '.ls-bar i{display:block;height:100%;width:0;background:var(--accent,#3fd2b0);border-radius:99px;transition:width .3s}' +
    '.ls-items{display:flex;flex-direction:column;min-height:20px}' +
    '.ls-item{display:flex;align-items:center;gap:.55rem;padding:.32rem .1rem;border-top:1px solid var(--line,rgba(148,163,184,.1));font-size:.85rem;color:var(--ink-2,#cfd9e3)}' +
    '.ls-item:first-child{border-top:none}' +
    '.ls-item input[type=checkbox]{accent-color:var(--accent,#3fd2b0);width:15px;height:15px;cursor:pointer;flex:none}' +
    '.ls-item span{flex:1;min-width:0;word-break:break-word}' +
    '.ls-item.done span{text-decoration:line-through;color:var(--faint,#7a8a9e)}' +
    '.ls-x{background:transparent;border:none;color:var(--ghost,#5a6b7d);cursor:pointer;font-size:.75rem;padding:2px 4px;border-radius:5px;flex:none}' +
    '.ls-x:hover{color:var(--danger,#f0938c)}' +
    '.ls-add{display:flex;gap:.4rem;margin-top:auto;padding-top:.35rem}' +
    '.ls-add input{flex:1;min-width:0;background:rgba(0,0,0,.3);border:1px solid var(--line,#2a3648);border-radius:8px;color:var(--ink,#edf2f7);padding:.4rem .6rem;font:500 .8rem var(--font,inherit);outline:none}' +
    '.ls-add input:focus{border-color:var(--accent,#3fd2b0)}' +
    '.ls-add button{background:var(--surface-2,rgba(148,163,184,.08));border:1px solid var(--line,#2a3648);color:var(--muted,#8d9aa9);border-radius:8px;width:32px;cursor:pointer;font-size:.9rem;flex:none;transition:all .15s}' +
    '.ls-add button:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '.ls-clear{align-self:flex-start;background:transparent;border:none;color:var(--faint,#7a8a9e);font:600 .7rem var(--font,inherit);cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}' +
    '.ls-clear:hover{color:var(--accent,#3fd2b0)}' +
    '.ls-empty-all{border:1px dashed rgba(63,210,176,.3);border-radius:12px;padding:1.6rem;text-align:center;color:var(--muted,#8d9aa9);font-size:.85rem;line-height:1.7;grid-column:1/-1}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  /* ---------- operations ---------- */
  function create(){
    var d = getData(); lists(d);
    d.lists.unshift({ id: uid(), name: 'New list', createdAt: Date.now(), updatedAt: Date.now(), items: [] });
    put(d); render(); startRename(d.lists[0].id, true);
  }
  function rename(id, name){
    name = String(name||'').trim(); if (!name) { render(); return; }
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    l.name = name.slice(0, 60); l.updatedAt = Date.now();
    put(d); render();
  }
  function remove(id){
    if (!confirm('Delete this whole list? It will go to Trash.')) return;
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    if (typeof pushToTrash === 'function') pushToTrash(d, 'list', l);
    d.lists = d.lists.filter(function(x){ return x.id !== id; });
    put(d); render();
    if (typeof updateTrashCount === 'function') updateTrashCount();
    toast('List moved to Trash');
  }
  function addItem(id, text){
    text = String(text||'').trim(); if (!text) return;
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    if (!Array.isArray(l.items)) l.items = [];
    l.items.push({ id: uid(), text: text.slice(0, 120), done: false });
    l.updatedAt = Date.now();
    put(d); render();
    var inp = document.querySelector('.ls-card[data-list="'+id+'"] .ls-addinput');
    if (inp) inp.focus();
  }
  function toggleItem(id, iid, done){
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    var it = (l.items||[]).find(function(x){ return x.id === iid; }); if (!it) return;
    it.done = !!done; l.updatedAt = Date.now();
    put(d); render();
  }
  function delItem(id, iid){
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    l.items = (l.items||[]).filter(function(x){ return x.id !== iid; });
    l.updatedAt = Date.now();
    put(d); render();
  }
  function clearDone(id){
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    l.items = (l.items||[]).filter(function(x){ return !x.done; });
    l.updatedAt = Date.now();
    put(d); render();
  }

  /* ---------- render ---------- */
  function render(){
    var grid = document.getElementById('listsGrid'); if (!grid) return;
    var d = getData(); var all = lists(d);
    if (!all.length) {
      grid.innerHTML = '<div class="ls-empty-all">🗒 No lists yet.<br>Create one for shopping, packing, revision topics — anything with steps.</div>';
      return;
    }
    grid.innerHTML = all.map(function(l){
      var items = Array.isArray(l.items) ? l.items : [];
      var done = items.filter(function(i){ return i.done; }).length;
      var pct = items.length ? Math.round(done/items.length*100) : 0;
      var edited = l.updatedAt && l.updatedAt - l.createdAt > 60000;
      return '<div class="ls-card" data-list="'+l.id+'">' +
        '<div class="ls-head">' +
          '<span class="ls-name" title="Click ✎ to rename">'+esc(l.name)+'</span>' +
          '<button class="ls-ic" data-act="ren" title="Rename list">✎</button>' +
          '<button class="ls-ic del" data-act="dellist" title="Delete list">🗑</button>' +
        '</div>' +
        '<div class="ls-meta"><span>Created '+esc(fmtDate(l.createdAt))+(edited?' · edited':'')+'</span><span><b>'+done+'</b>/'+items.length+'</span></div>' +
        '<div class="ls-bar"><i style="width:'+pct+'%"></i></div>' +
        '<div class="ls-items">' + items.map(function(it){
          return '<label class="ls-item'+(it.done?' done':'')+'">' +
            '<input type="checkbox" data-iid="'+it.id+'"'+(it.done?' checked':'')+'>' +
            '<span>'+esc(it.text)+'</span>' +
            '<button class="ls-x" data-iid="'+it.id+'" title="Remove item">✕</button></label>';
        }).join('') + '</div>' +
        (done ? '<button class="ls-clear" data-act="cleardone">Clear done ('+done+')</button>' : '') +
        '<div class="ls-add"><input class="ls-addinput" maxlength="120" placeholder="Add item…">' +
          '<button data-act="additem" title="Add">+</button></div>' +
      '</div>';
    }).join('');
  }
  window.renderListMaker = render;   /* Trash restore hook (RENDER_CANDIDATES.lists) */

  /* ---------- inline rename ---------- */
  function startRename(id, selectAll){
    var card = document.querySelector('.ls-card[data-list="'+id+'"]'); if (!card) return;
    var nameEl = card.querySelector('.ls-name'); if (!nameEl) return;
    var d = getData();
    var l = lists(d).find(function(x){ return x.id === id; }); if (!l) return;
    var inp = document.createElement('input');
    inp.className = 'ls-rename'; inp.maxLength = 60; inp.value = l.name;
    nameEl.replaceWith(inp); inp.focus();
    if (selectAll && inp.select) inp.select();
    function commit(){ rename(id, inp.value); }
    inp.addEventListener('keydown', function(e){
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); render(); }
    });
    inp.addEventListener('blur', commit);
  }

  /* ---------- events (delegated) ---------- */
  document.addEventListener('click', function(e){
    if (!e.target.closest) return;
    if (e.target.closest('#lsNewBtn')) { create(); return; }
    var card = e.target.closest('.ls-card'); if (!card) return;
    var id = card.dataset.list;
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act;
    if (act === 'dellist') remove(id);
    else if (act === 'ren') startRename(id, false);
    else if (act === 'additem') addItem(id, card.querySelector('.ls-addinput').value);
    else if (act === 'cleardone') clearDone(id);
  });
  document.addEventListener('keydown', function(e){
    if (e.target && e.target.classList && e.target.classList.contains('ls-addinput') && e.key === 'Enter') {
      e.preventDefault();
      var card = e.target.closest('.ls-card');
      if (card) addItem(card.dataset.list, e.target.value);
    }
  });
  document.addEventListener('change', function(e){
    if (e.target && e.target.matches && e.target.matches('.ls-item input[type=checkbox]')) {
      var card = e.target.closest('.ls-card'); if (!card) return;
      toggleItem(card.dataset.list, e.target.dataset.iid, e.target.checked);
    }
  });

  /* ---------- inject section (notes.html) ---------- */
  function inject(){
    if (document.getElementById('listMakerSection')) return true;
    var anchor = document.querySelector('.note-list-section');
    if (!anchor) return false;
    var sec = document.createElement('section');
    sec.className = 'glass-card'; sec.id = 'listMakerSection';
    sec.innerHTML =
      '<h2 class="card-title"><span style="color:var(--accent,#3fd2b0)"><i class="ph ph-list-checks" aria-hidden="true"></i></span> List Maker' +
        '<button id="lsNewBtn" class="btn-primary-sm" style="margin-left:auto;display:inline-flex;align-items:center;gap:.35rem;">' +
        '<i class="ph ph-plus" aria-hidden="true"></i> New list</button></h2>' +
      '<div id="listsGrid"></div>';
    anchor.insertAdjacentElement('afterend', sec);
    render();
    return true;
  }
  var tries = 0;
  (function boot(){
    if (inject() || ++tries > 12) return;
    setTimeout(boot, 350);
  })();
})();
