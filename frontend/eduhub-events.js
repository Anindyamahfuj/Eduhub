/* =====================================================================
   EDUHUB · Calendar Events v1 — Samsung-style day events
   Hooks into the existing #calendarModal: day dots, day sheet
   (add/edit/delete), Today jump, upcoming strip, daily reminder.
   Storage: localStorage 'studyHubCalEvents'. Load AFTER script.js.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_EVENTS__) return;
  window.__EH_EVENTS__ = true;

  var KEY = 'studyHubCalEvents';
  var CATS = {
    study:    { label: 'Study',      color: 'var(--accent,#3fd2b0)' },
    exam:     { label: 'Exam',       color: 'var(--danger,#f0938c)' },
    assign:   { label: 'Assignment', color: 'var(--warn,#f0b46a)' },
    personal: { label: 'Personal',   color: 'var(--info,#7fb3d9)' },
    other:    { label: 'Other',      color: 'var(--muted,#8d9aa9)' }
  };
  var curDate = null, editingId = null;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function load(){ try{ var r=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(r)?r:[]; }catch(e){ return []; } }
  function save(l){ try{ if(l.length>500) l=l.slice(-500); localStorage.setItem(KEY,JSON.stringify(l)); }catch(e){} }
  function pad(n){ return String(n).padStart(2,'0'); }
  function ymd(y,m,d){ return y+'-'+pad(m+1)+'-'+pad(d); }
  function todayYmd(){ var t=new Date(); return ymd(t.getFullYear(),t.getMonth(),t.getDate()); }
  function viewYM(){ var v=window.calView||{}; var n=new Date();
    return { y:(typeof v.year==='number')?v.year:n.getFullYear(), m:(typeof v.month==='number')?v.month:n.getMonth() }; }
  function byTime(a,b){
    if(!a.time&&b.time) return -1; if(a.time&&!b.time) return 1;
    if(a.time===b.time) return (a.title||'').localeCompare(b.title||'');
    return (a.time||'').localeCompare(b.time||''); }
  function forDate(ds){ return load().filter(function(e){ return e.date===ds; }).sort(byTime); }
  function toast(m){ var t=document.getElementById('eh-toast');
    if(t){ t.textContent=m; t.hidden=false; t.classList.add('show');
      setTimeout(function(){ t.classList.remove('show'); t.hidden=true; },2200); }
    else if(typeof window.showToast==='function') window.showToast(m,'ok'); }

  /* ---------- CSS ---------- */
  var CSS =
    '#calendarGrid .cal-cell{position:relative}' +
    '.eh-ev-dots{position:absolute;left:0;right:0;bottom:3px;display:flex;gap:3px;justify-content:center;pointer-events:none}' +
    '.eh-ev-dots i{width:5px;height:5px;border-radius:50%;display:block}' +
    '.eh-ev-dots b{font-size:8px;line-height:1;color:var(--muted,#8d9aa9);font-weight:700}' +
    '.eh-ev-today{background:var(--surface-2);border:1px solid var(--line);color:var(--ink);border-radius:var(--r-pill,999px);padding:.25rem .8rem;font:600 .75rem var(--font,inherit);cursor:pointer;transition:border-color .15s,color .15s}' +
    '.eh-ev-today:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '#ehEvDay{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;padding:18px;font-family:var(--font,system-ui,sans-serif)}' +
    '#ehEvDay[hidden]{display:none!important}' +
    '.ehEv-scrim{position:absolute;inset:0;background:rgba(2,5,10,.62);opacity:0;transition:opacity .2s}' +
    '.ehEv-panel{position:relative;width:min(460px,100%);max-height:min(84vh,780px);display:flex;flex-direction:column;background:var(--surface-raised,rgba(13,22,37,.96));border:1px solid var(--line,rgba(148,163,184,.2));border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.5);opacity:0;transform:translateY(12px) scale(.98);transition:opacity .22s,transform .22s;overflow:hidden}' +
    '#ehEvDay.open .ehEv-scrim{opacity:1}#ehEvDay.open .ehEv-panel{opacity:1;transform:none}' +
    '.ehEv-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--line,rgba(148,163,184,.15))}' +
    '.ehEv-date{font-family:var(--display,var(--font));font-weight:700;font-size:16px;color:var(--ink,#edf2f7)}' +
    '.ehEv-count{font:600 11px var(--mono,monospace);color:var(--muted,#8d9aa9);margin-left:8px}' +
    '.ehEv-x{width:30px;height:30px;border-radius:50%;border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);cursor:pointer;font-size:13px;flex:none}' +
    '.ehEv-body{padding:14px 18px 18px;overflow-y:auto}' +
    '.ehEv-form{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}' +
    '.ehEv-form input,.ehEv-form select{background:rgba(0,0,0,.3);border:1px solid var(--line,#2a3648);border-radius:9px;color:var(--ink,#edf2f7);padding:.5rem .65rem;font:500 .84rem var(--font,inherit);outline:none}' +
    '.ehEv-form input:focus,.ehEv-form select:focus{border-color:var(--accent,#3fd2b0)}' +
    '.ehEv-t{flex:1 1 150px;min-width:0}' +
    '.ehEv-time{width:104px;color-scheme:dark}' +
    '.ehEv-cat{width:108px}' +
    '.ehEv-add{background:var(--accent,#3fd2b0);color:var(--accent-ink,#04241c);border:none;border-radius:9px;padding:.5rem .95rem;font:700 .84rem var(--font,inherit);cursor:pointer}' +
    '.ehEv-cancel{background:transparent;border:1px solid var(--line,#2a3648);color:var(--muted,#8d9aa9);border-radius:9px;padding:.5rem .8rem;font:600 .8rem var(--font,inherit);cursor:pointer}' +
    '.ehEv-item{display:flex;align-items:center;gap:10px;padding:.6rem .1rem;border-top:1px solid var(--line,rgba(148,163,184,.12))}' +
    '.ehEv-item:first-child{border-top:none}' +
    '.ehEv-bar{width:4px;align-self:stretch;border-radius:99px;flex:none}' +
    '.ehEv-main{min-width:0;flex:1}' +
    '.ehEv-main b{display:block;font-size:.88rem;color:var(--ink,#edf2f7);word-break:break-word}' +
    '.ehEv-main i{font-style:normal;font-size:.72rem;color:var(--muted,#8d9aa9)}' +
    '.ehEv-timechip{font:600 .72rem var(--mono,monospace);color:var(--accent,#3fd2b0);background:color-mix(in srgb,var(--accent,#3fd2b0) 12%,transparent);border-radius:999px;padding:.2rem .55rem;flex:none}' +
    '.ehEv-act{background:transparent;border:none;color:var(--faint,#7a8a9e);cursor:pointer;font-size:.85rem;padding:4px;border-radius:6px;flex:none}' +
    '.ehEv-act:hover{color:var(--accent,#3fd2b0)}' +
    '.ehEv-act.del:hover{color:var(--danger,#f0938c)}' +
    '.ehEv-empty{border:1px dashed rgba(63,210,176,.3);border-radius:12px;padding:22px;text-align:center;color:var(--muted,#8d9aa9);font-size:.84rem;line-height:1.6}' +
    '#ehEvUpcoming{margin-top:.9rem;border-top:1px solid var(--line,rgba(148,163,184,.15));padding:.85rem .2rem .2rem}' +
    '#ehEvUpcoming .ehUp-t{display:flex;align-items:center;gap:.45rem;font:700 .68rem var(--font,inherit);text-transform:uppercase;letter-spacing:.14em;color:var(--muted,#8d9aa9);margin-bottom:.55rem}' +
    '#ehEvUpcoming .ehUp-t em{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none;color:var(--accent,#3fd2b0);margin-left:auto}' +
    '.ehUp-row{display:flex;align-items:center;gap:9px;padding:.42rem .2rem;border-radius:8px;cursor:pointer;transition:background .15s}' +
    '.ehUp-row:hover{background:var(--surface-2,rgba(148,163,184,.07))}' +
    '.ehUp-d{font:600 .68rem var(--mono,monospace);color:var(--muted,#8d9aa9);background:var(--surface-2,rgba(148,163,184,.08));border-radius:6px;padding:.2rem .45rem;flex:none}' +
    '.ehUp-dot{width:6px;height:6px;border-radius:50%;flex:none}' +
    '.ehUp-n{font-size:.8rem;color:var(--ink,#edf2f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  var st = document.createElement('style'); st.textContent = CSS;
  document.head.appendChild(st);

  /* ---------- dots on calendar days ---------- */
  function paintMonth() {
    var grid = document.getElementById('calendarGrid'); if (!grid) return;
    var v = viewYM();
    grid.querySelectorAll('.cal-cell').forEach(function (cell) {
      if (cell.classList.contains('empty')) return;
      var d = parseInt(cell.textContent, 10); if (!d || isNaN(d)) return;
      cell.dataset.day = d;
      var old = cell.querySelector('.eh-ev-dots'); if (old) old.remove();
      var evs = forDate(ymd(v.y, v.m, d));
      if (!evs.length) return;
      var wrap = document.createElement('span'); wrap.className = 'eh-ev-dots';
      evs.slice(0, 3).forEach(function (e) {
        var i = document.createElement('i');
        i.style.background = (CATS[e.cat] || CATS.other).color;
        wrap.appendChild(i);
      });
      if (evs.length > 3) { var b = document.createElement('b'); b.textContent = '+' + (evs.length - 3); wrap.appendChild(b); }
      cell.appendChild(wrap);
    });
    paintUpcoming(v);
    var ex = document.getElementById('calendarExpandBtn');
    if (ex) { var n = forDate(todayYmd()).length; ex.title = n ? n + ' event(s) today · Open calendar' : 'Open calendar'; }
  }

  /* ---------- upcoming strip inside the calendar modal ---------- */
  function paintUpcoming(v) {
    var content = document.querySelector('#calendarModal .calendar-modal-content'); if (!content) return;
    var box = document.getElementById('ehEvUpcoming'); if (!box) {
      box = document.createElement('div'); box.id = 'ehEvUpcoming'; content.appendChild(box);
    }
    var t0 = todayYmd();
    var up = load().filter(function (e) { return e.date >= t0; })
      .sort(function (a, b) { return a.date === b.date ? byTime(a, b) : (a.date < b.date ? -1 : 1); })
      .slice(0, 5);
    var monthCount = load().filter(function (e) { return e.date.indexOf(v.y + '-' + pad(v.m + 1)) === 0; }).length;
    var h = '<div class="ehUp-t">📅 Upcoming <em>' + monthCount + ' this month</em></div>';
    h += up.length ? up.map(function (e) {
      var c = (CATS[e.cat] || CATS.other).color;
      return '<div class="ehUp-row" data-evdate="' + e.date + '">' +
        '<span class="ehUp-d">' + e.date.slice(5) + '</span>' +
        '<span class="ehUp-dot" style="background:' + c + '"></span>' +
        '<span class="ehUp-n">' + esc((e.time ? e.time + ' · ' : '') + e.title) + '</span></div>';
    }).join('') : '<div style="font-size:.78rem;color:var(--faint,#7a8a9e);padding:.2rem 0 .3rem;">No upcoming events.</div>';
    box.innerHTML = h;
  }

  /* ---------- day sheet ---------- */
  function build() {
    var old = document.getElementById('ehEvDay'); if (old) old.remove();
    var o = document.createElement('div'); o.id = 'ehEvDay'; o.hidden = true;
    o.innerHTML = '<div class="ehEv-scrim" data-evclose></div><div class="ehEv-panel" role="dialog" aria-modal="true">' +
      '<div class="ehEv-head"><div><span class="ehEv-date" id="ehEvDate"></span><span class="ehEv-count" id="ehEvCount"></span></div>' +
      '<button class="ehEv-x" data-evclose aria-label="Close">✕</button></div>' +
      '<div class="ehEv-body"><div class="ehEv-form">' +
      '<input class="ehEv-t" id="ehEvTitle" maxlength="80" placeholder="Event title…">' +
      '<input class="ehEv-time" id="ehEvTime" type="time">' +
      '<select class="ehEv-cat" id="ehEvCat"></select>' +
      '<button class="ehEv-add" id="ehEvSave">Add</button>' +
      '</div><div id="ehEvList"></div></div></div>';
    document.body.appendChild(o);
    var sel = o.querySelector('#ehEvCat');
    Object.keys(CATS).forEach(function (k) {
      var op = document.createElement('option'); op.value = k; op.textContent = CATS[k].label; sel.appendChild(op);
    });
    o.addEventListener('click', function (e) {
      if (e.target.closest('[data-evclose]')) { closeDay(); return; }
      var ed = e.target.closest('[data-evedit]');
      if (ed) { startEdit(ed.dataset.evedit); return; }
      var dl = e.target.closest('[data-evdel]');
      if (dl) { removeEvent(dl.dataset.evdel); return; }
    });
    o.querySelector('#ehEvSave').addEventListener('click', submitEvent);
    ['ehEvTitle'].forEach(function (id) {
      o.querySelector('#' + id).addEventListener('keydown', function (e) { if (e.key === 'Enter') submitEvent(); });
    });
    return o;
  }
  function openDay(ds) {
    curDate = ds; editingId = null;
    var o = build();
    o.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { o.classList.add('open'); }); });
    renderDay();
    setTimeout(function () { var t = o.querySelector('#ehEvTitle'); if (t) t.focus(); }, 80);
  }
  function closeDay() {
    var o = document.getElementById('ehEvDay'); if (!o) return;
    o.classList.remove('open'); setTimeout(function () { o.hidden = true; }, 220);
  }
  function renderDay() {
    var o = document.getElementById('ehEvDay'); if (!o || o.hidden) return;
    var p = curDate.split('-');
    var dObj = new Date(+p[0], +p[1] - 1, +p[2]);
    var label = dObj.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    o.querySelector('#ehEvDate').textContent = '📅 ' + label;
    var evs = forDate(curDate);
    o.querySelector('#ehEvCount').textContent = evs.length + (evs.length === 1 ? ' event' : ' events');
    var saveBtn = o.querySelector('#ehEvSave');
    saveBtn.textContent = editingId ? 'Save' : 'Add';
    var cancelBtn = o.querySelector('.ehEv-cancel');
    if (editingId && !cancelBtn) {
      var c = document.createElement('button'); c.className = 'ehEv-cancel'; c.textContent = 'Cancel';
      c.addEventListener('click', function () { editingId = null; clearForm(); renderDay(); });
      saveBtn.parentNode.insertBefore(c, saveBtn.nextSibling);
    } else if (!editingId && cancelBtn) cancelBtn.remove();
    var list = o.querySelector('#ehEvList');
    list.innerHTML = evs.length ? evs.map(function (e) {
      var c = (CATS[e.cat] || CATS.other).color;
      return '<div class="ehEv-item"><span class="ehEv-bar" style="background:' + c + '"></span>' +
        '<span class="ehEv-main"><b>' + esc(e.title) + '</b><i>' + esc((CATS[e.cat] || CATS.other).label) +
        (e.note ? ' · ' + esc(e.note) : '') + '</i></span>' +
        (e.time ? '<span class="ehEv-timechip">' + esc(e.time) + '</span>' : '<span class="ehEv-timechip" style="color:var(--muted,#8d9aa9);background:transparent;">All-day</span>') +
        '<button class="ehEv-act" data-evedit="' + e.id + '" title="Edit">✎</button>' +
        '<button class="ehEv-act del" data-evdel="' + e.id + '" title="Delete">🗑</button></div>';
    }).join('') : '<div class="ehEv-empty">No events yet.<br>Add one above — title is enough, time is optional.</div>';
  }
  function clearForm() {
    var o = document.getElementById('ehEvDay'); if (!o) return;
    o.querySelector('#ehEvTitle').value = '';
    o.querySelector('#ehEvTime').value = '';
    o.querySelector('#ehEvCat').value = 'study';
  }
  function startEdit(id) {
    var e = load().find(function (x) { return x.id === id; }); if (!e) return;
    editingId = id;
    var o = document.getElementById('ehEvDay');
    o.querySelector('#ehEvTitle').value = e.title;
    o.querySelector('#ehEvTime').value = e.time || '';
    o.querySelector('#ehEvCat').value = e.cat || 'other';
    renderDay();
    o.querySelector('#ehEvTitle').focus();
  }
  function submitEvent() {
    var o = document.getElementById('ehEvDay'); if (!o || !curDate) return;
    var title = o.querySelector('#ehEvTitle').value.trim();
    if (!title) { o.querySelector('#ehEvTitle').focus(); return; }
    var all = load();
    if (editingId) {
      var e = all.find(function (x) { return x.id === editingId; });
      if (e) { e.title = title; e.time = o.querySelector('#ehEvTime').value; e.cat = o.querySelector('#ehEvCat').value; }
      editingId = null; toast('Event updated');
    } else {
      all.push({ id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        date: curDate, title: title, time: o.querySelector('#ehEvTime').value,
        cat: o.querySelector('#ehEvCat').value, ts: Date.now() });
      toast('Event added');
    }
    save(all); clearForm(); renderDay(); paintMonth();
  }
  function removeEvent(id) {
    if (!confirm('Delete this event?')) return;
    save(load().filter(function (x) { return x.id !== id; }));
    if (editingId === id) editingId = null;
    toast('Event deleted'); renderDay(); paintMonth();
  }

  /* ---------- wiring into the existing calendar ---------- */
  document.addEventListener('click', function (e) {
    var cell = e.target.closest && e.target.closest('#calendarGrid .cal-cell');
    if (cell && !cell.classList.contains('empty')) {
      var d = parseInt(cell.dataset.day || cell.textContent, 10);
      if (d) { var v = viewYM(); openDay(ymd(v.y, v.m, d)); return; }
    }
    var up = e.target.closest && e.target.closest('.ehUp-row');
    if (up && up.dataset.evdate) { openDay(up.dataset.evdate); return; }
    if (e.target.closest && e.target.closest('#ehEvToday')) {
      var n = new Date();
      if (window.calView) { window.calView.month = n.getMonth(); window.calView.year = n.getFullYear(); }
      var nx = document.getElementById('calNextMonth'), pv = document.getElementById('calPrevMonth');
      if (nx && pv) { nx.click(); pv.click(); }   /* forces the closed-over renderer to repaint */
      paintMonth();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var o = document.getElementById('ehEvDay'); if (o && !o.hidden) closeDay(); }
  });

  /* ---------- boot ---------- */
  function injectChrome() {
    var head = document.querySelector('#calendarModal .calendar-modal-header');
    if (head && !document.getElementById('ehEvToday')) {
      var b = document.createElement('button');
      b.id = 'ehEvToday'; b.className = 'eh-ev-today'; b.type = 'button'; b.textContent = 'Today';
      head.insertBefore(b, head.firstChild);
    }
  }
  function boot() {
    injectChrome();
    var grid = document.getElementById('calendarGrid');
    if (grid) {
      if (!grid.__ehEvObs) { grid.__ehEvObs = true;
        new MutationObserver(function () { paintMonth(); }).observe(grid, { childList: true });
      }
      paintMonth();
    } else { setTimeout(boot, 400); return; }
    dailyNotify();
  }
  function dailyNotify() {
    var evs = forDate(todayYmd()); if (!evs.length) return;
    try { if (localStorage.getItem('ehEvNotified') === todayYmd()) return; localStorage.setItem('ehEvNotified', todayYmd()); } catch (e) {}
    var body = evs.slice(0, 3).map(function (e) { return (e.time ? e.time + ' ' : '') + e.title; }).join(' · ');
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('📅 ' + evs.length + ' event(s) today', { body: body }); } catch (e) {}
    toast('📅 ' + evs.length + ' event(s) today: ' + body);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.EduEvents = { open: openDay, forDate: forDate, count: function () { return load().length; } };
})();
