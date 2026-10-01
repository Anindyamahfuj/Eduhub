/* =====================================================================
   EDUHUB · Daily Briefing v1 — Microsoft-Start-style news widget
   • International RSS: World · Tech · Science · Business
   • Daily cache: loads instantly from localStorage, refetches once/day
   • Manual refresh · skeletons · graceful offline fallback
   • Injects itself into the dashboard (index.html only). No HTML edits.
   Console: EduNews.refresh()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_NEWS__) return;
  window.__EH_NEWS__ = true;

  var CACHE_KEY = 'studyHubNews.v1', TAB_KEY = 'studyHubNewsTab';
  var PER_CAT = 8;

  var FEEDS = {
    world:    { label: 'World',    icon: '🌍', feeds: [
                  { u: 'https://feeds.bbci.co.uk/news/world/rss.xml', s: 'BBC News' },
                  { u: 'https://www.aljazeera.com/xml/rss/all.xml',   s: 'Al Jazeera' } ] },
    tech:     { label: 'Tech',     icon: '💡', feeds: [
                  { u: 'https://www.theverge.com/rss/index.xml',      s: 'The Verge' },
                  { u: 'https://techcrunch.com/feed/',                s: 'TechCrunch' } ] },
    science:  { label: 'Science',  icon: '🔬', feeds: [
                  { u: 'https://phys.org/rss-feed/',                  s: 'Phys.org' },
                  { u: 'https://www.sciencedaily.com/rss/all.xml',    s: 'ScienceDaily' } ] },
    business: { label: 'Business', icon: '📈', feeds: [
                  { u: 'https://feeds.bbci.co.uk/news/business/rss.xml', s: 'BBC News' },
                  { u: 'https://fortune.com/feed/',                   s: 'Fortune' } ] }
  };
  var CATS = Object.keys(FEEDS);
  var HUE = { world: 'var(--accent,#3fd2b0)', tech: 'var(--info,#7fb3d9)',
              science: 'var(--brand,#7fe3c8)', business: 'var(--warn,#f0b46a)' };

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function loadCache(){ try{ var o=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}'); return (o&&typeof o==='object')?o:{}; }catch(e){ return {}; } }
  function saveCache(c){ try{ localStorage.setItem(CACHE_KEY,JSON.stringify(c)); }catch(e){} }
  function timeAgo(ms){
    if(!ms) return '';
    var s=(Date.now()-ms)/1000;
    if(s<90) return 'just now';
    if(s<3600) return Math.round(s/60)+'m ago';
    if(s<86400) return Math.round(s/3600)+'h ago';
    return Math.round(s/86400)+'d ago';
  }

  /* ---------- CSS ---------- */
  var CSS =
    '#ehNewsCard .eh-nw-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:-.35rem 0 1rem}' +
    '.eh-nw-tab{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.32rem .9rem;font:600 .76rem var(--font,inherit);cursor:pointer;transition:all .18s}' +
    '.eh-nw-tab:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '.eh-nw-tab.on{background:var(--accent-soft,rgba(63,210,176,.12));border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '#ehNewsMeta{display:flex;align-items:center;gap:.6rem;font:600 .72rem var(--mono,monospace);color:var(--faint,#7a8a9e)}' +
    '#ehNewsRefresh{background:transparent;border:1px solid var(--line,rgba(148,163,184,.2));color:var(--muted,#8d9aa9);width:28px;height:28px;border-radius:8px;cursor:pointer;display:grid;place-items:center;font-size:.85rem;transition:all .15s}' +
    '#ehNewsRefresh:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '#ehNewsRefresh.spin i{animation:ehNwSpin .8s linear infinite}' +
    '@keyframes ehNwSpin{to{transform:rotate(360deg)}}' +
    '#ehNewsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.85rem}' +
    '.eh-nw-card{display:flex;flex-direction:column;background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.13));border-radius:14px;overflow:hidden;text-decoration:none;transition:border-color .18s,transform .18s}' +
    '.eh-nw-card:hover{border-color:var(--accent,#3fd2b0);transform:translateY(-2px)}' +
    '.eh-nw-thumb{position:relative;display:block;aspect-ratio:16/9;background:var(--surface-3,rgba(148,163,184,.09));overflow:hidden}' +
    '.eh-nw-thumb img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.eh-nw-fb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 1.5rem var(--display,serif);color:var(--muted,#8d9aa9);background:radial-gradient(circle at 30% 25%,var(--surface-3),transparent 70%)}' +
    '.eh-nw-body{display:flex;flex-direction:column;gap:.4rem;padding:.7rem .8rem .8rem;flex:1}' +
    '.eh-nw-src{display:flex;align-items:center;gap:.4rem;font:600 .66rem var(--font,inherit);text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#8d9aa9)}' +
    '.eh-nw-src i{width:6px;height:6px;border-radius:50%;flex:none}' +
    '.eh-nw-src em{font-style:normal;margin-left:auto;font:500 .66rem var(--mono,monospace);text-transform:none;letter-spacing:0;color:var(--faint,#7a8a9e)}' +
    '.eh-nw-t{font:600 .84rem/1.4 var(--font,inherit);color:var(--ink,#edf2f7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    '.eh-nw-skel{border-radius:14px;border:1px solid var(--line,rgba(148,163,184,.1));overflow:hidden}' +
    '.eh-nw-skel i{display:block;aspect-ratio:16/9;background:linear-gradient(100deg,rgba(148,163,184,.06) 40%,rgba(148,163,184,.14) 50%,rgba(148,163,184,.06) 60%);background-size:200% 100%;animation:ehNwSh 1.1s linear infinite}' +
    '.eh-nw-skel b{display:block;height:.7rem;margin:.7rem .8rem;border-radius:6px;background:linear-gradient(100deg,rgba(148,163,184,.07) 40%,rgba(148,163,184,.15) 50%,rgba(148,163,184,.07) 60%);background-size:200% 100%;animation:ehNwSh 1.1s linear infinite}' +
    '.eh-nw-skel b+i{aspect-ratio:auto;height:.7rem;margin:0 .8rem .9rem;width:55%}' +
    '@keyframes ehNwSh{to{background-position:-200% 0}}' +
    '.eh-nw-msg{grid-column:1/-1;border:1px dashed var(--line-2,rgba(148,163,184,.25));border-radius:12px;padding:1.4rem;text-align:center;color:var(--muted,#8d9aa9);font-size:.85rem;line-height:1.6}' +
    '.eh-nw-msg button{margin-left:.5rem;background:transparent;border:1px solid var(--accent,#3fd2b0);color:var(--accent,#3fd2b0);border-radius:8px;padding:.3rem .8rem;font:600 .78rem var(--font,inherit);cursor:pointer}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  /* ---------- fetching ---------- */
  function fetchText(url, ms) {
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, ms || 9000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.text(); })
      .finally(function(){ if (timer) clearTimeout(timer); });
  }
  function parseFeed(xml, sourceName) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
    var nodes = doc.getElementsByTagName('item');
    if (!nodes.length) nodes = doc.getElementsByTagName('entry');
    var out = [];
    for (var i = 0; i < nodes.length && out.length < 20; i++) {
      var n = nodes[i];
      (function (n) {
        function g(t){ var e=n.getElementsByTagName(t); return e.length ? e[0].textContent.trim() : ''; }
        var title = g('title'); if (!title) return;
        var link = '', ls = n.getElementsByTagName('link');
        for (var j = 0; j < ls.length; j++) {
          var href = ls[j].getAttribute('href'), rel = ls[j].getAttribute('rel');
          if (href && (!rel || rel === 'alternate')) { link = href; break; }
          if (!link && ls[j].textContent.trim()) link = ls[j].textContent.trim();
        }
        if (!link) return;
        var ds = g('pubDate') || g('published') || g('updated') || g('date');
        var ms = ds ? Date.parse(ds) : 0; if (isNaN(ms)) ms = 0;
        var img = '';
        var enc = n.getElementsByTagName('enclosure');
        if (enc.length && enc[0].getAttribute('url')) img = enc[0].getAttribute('url');
        if (!img) { var mc = n.getElementsByTagName('media:content'); if (mc.length) img = mc[0].getAttribute('url') || ''; }
        if (!img) { var mt = n.getElementsByTagName('media:thumbnail'); if (mt.length) img = mt[0].getAttribute('url') || ''; }
        if (!img) {
          var html = (g('description') || g('content') || g('summary')).slice(0, 20000);
          var m = html.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) img = m[1];
        }
        out.push({ t: title.slice(0, 200), l: link, s: sourceName, d: ms, img: img });
      })(n);
    }
    return out;
  }
  function fetchFeed(url, source) {
    /* relay 1 → relay 2 → give up (caller falls back to cache) */
    return fetchText('https://api.allorigins.win/raw?url=' + encodeURIComponent(url))
      .catch(function(){ return fetchText('https://corsproxy.io/?url=' + encodeURIComponent(url)); })
      .then(function(x){ return parseFeed(x, source); });
  }
  function loadCategory(cat, force) {
    var conf = FEEDS[cat], c = loadCache();
    if (!force && c[cat] && c[cat].date === today() && c[cat].items && c[cat].items.length)
      return Promise.resolve({ items: c[cat].items, ts: c[cat].ts, cached: false });
    return Promise.all(conf.feeds.map(function (f) {
      return fetchFeed(f.u, f.s).catch(function () { return []; });
    })).then(function (arrs) {
      var seen = {}, merged = [];
      arrs.forEach(function (a) { a.forEach(function (it) {
        var k = it.t.toLowerCase(); if (seen[k]) return; seen[k] = 1; merged.push(it); }); });
      merged.sort(function (a, b) { return (b.d || 0) - (a.d || 0); });
      merged = merged.slice(0, PER_CAT);
      if (merged.length) { c[cat] = { date: today(), ts: Date.now(), items: merged }; saveCache(c); }
      return { items: merged, ts: Date.now(), cached: !merged.length && !!(c[cat] && c[cat].items) };
    });
  }

  /* ---------- UI ---------- */
  var curTab = null, busy = false;
  function skeleton() {
    var h = '';
    for (var i = 0; i < 6; i++) h += '<div class="eh-nw-skel"><i></i><b></b><i></i></div>';
    return h;
  }
  function render(cat, res) {
    var grid = document.getElementById('ehNewsGrid'); if (!grid) return;
    var meta = document.getElementById('ehNewsMeta');
    if (meta && res.ts) meta.innerHTML = stampHTML(res);
    if (!res.items || !res.items.length) {
      grid.innerHTML = '<div class="eh-nw-msg">📡 Couldn\'t load the briefing right now' +
        (res.cached ? ' — showing the last saved edition below.' : '.') +
        ' <button data-ehnw-retry>Retry</button></div>' +
        (res.cached ? cardsHTML(loadCache()[cat].items, cat) : '');
      return;
    }
    grid.innerHTML = cardsHTML(res.items, cat);
  }
  function stampHTML(res) {
    var t = new Date(res.ts || Date.now());
    return 'Updated ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) +
           (res.cached ? ' · cached' : '');
  }
  function cardsHTML(items, cat) {
    return items.map(function (it) {
      var hue = HUE[cat] || 'var(--accent,#3fd2b0)';
      return '<a class="eh-nw-card" href="' + esc(it.l) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="eh-nw-thumb">' +
          (it.img ? '<img loading="lazy" src="' + esc(it.img) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : '') +
          '<span class="eh-nw-fb" style="display:' + (it.img ? 'none' : 'flex') + ';color:' + hue + '">' + esc((it.s || '•').charAt(0)) + '</span>' +
        '</span>' +
        '<span class="eh-nw-body">' +
          '<span class="eh-nw-src"><i style="background:' + hue + '"></i>' + esc(it.s) +
            (it.d ? '<em>' + timeAgo(it.d) + '</em>' : '') + '</span>' +
          '<span class="eh-nw-t">' + esc(it.t) + '</span>' +
        '</span></a>';
    }).join('');
  }
  function setTab(cat, force) {
    if (busy) return;
    curTab = cat;
    try { localStorage.setItem(TAB_KEY, cat); } catch (e) {}
    document.querySelectorAll('.eh-nw-tab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.cat === cat);
    });
    var grid = document.getElementById('ehNewsGrid');
    var c = loadCache();
    if (!force && c[cat] && c[cat].date === today()) {
      render(cat, { items: c[cat].items, ts: c[cat].ts, cached: false });
      return;
    }
    grid.innerHTML = skeleton();
    busy = true; spin(true);
    loadCategory(cat, force).then(function (res) { render(cat, res); })
      .catch(function () { render(cat, { items: [], cached: !!c[cat] }); })
      .finally ? null : null;
    loadCategory; /* noop guard for minifiers */
    function done(){ busy = false; spin(false); }
    setTimeout(done, 0);
  }
  function spin(on) {
    var b = document.getElementById('ehNewsRefresh');
    if (b) b.classList.toggle('spin', !!on);
  }

  /* honest loading wrapper: render only after fetch settles */
  function goto(cat, force) {
    if (busy) return;
    curTab = cat;
    try { localStorage.setItem(TAB_KEY, cat); } catch (e) {}
    document.querySelectorAll('.eh-nw-tab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.cat === cat);
    });
    var c = loadCache();
    if (!force && c[cat] && c[cat].date === today() && c[cat].items && c[cat].items.length) {
      render(cat, { items: c[cat].items, ts: c[cat].ts, cached: false });
      return;
    }
    var grid = document.getElementById('ehNewsGrid');
    if (grid) grid.innerHTML = skeleton();
    busy = true; spin(true);
    loadCategory(cat, force)
      .then(function (res) { render(cat, res); })
      .catch(function () { render(cat, { items: (c[cat] && c[cat].items) || [], ts: c[cat] && c[cat].ts, cached: true }); })
      .then(function () { busy = false; spin(false); });
  }

  function build() {
    if (document.getElementById('ehNewsCard')) return true;
    var strip = document.querySelector('.overview-strip');
    var layout = document.querySelector('.dashboard-layout');
    if (!strip || !layout) return false;                 /* dashboard only */

    var sec = document.createElement('section');
    sec.className = 'glass-card'; sec.id = 'ehNewsCard';
    sec.innerHTML =
      '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;">' +
        '<span style="display:flex;align-items:center;gap:.55rem;"><span class="hl-cyan" style="color:var(--accent,#3fd2b0)"><i class="ph ph-newspaper" aria-hidden="true"></i></span> Daily Briefing</span>' +
        '<span id="ehNewsMeta"></span>' +
        '<button id="ehNewsRefresh" title="Refresh briefing" aria-label="Refresh"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="eh-nw-tabs" id="ehNewsTabs"></div>' +
      '<div id="ehNewsGrid"></div>';
    strip.insertAdjacentElement('afterend', sec);

    var tabs = sec.querySelector('#ehNewsTabs');
    CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'eh-nw-tab'; b.type = 'button'; b.dataset.cat = c;
      b.textContent = FEEDS[c].icon + ' ' + FEEDS[c].label;
      b.addEventListener('click', function () { goto(c, false); });
      tabs.appendChild(b);
    });
    sec.querySelector('#ehNewsRefresh').addEventListener('click', function () {
      if (curTab) goto(curTab, true);
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-ehnw-retry]') && curTab) goto(curTab, true);
    });

    var saved = 'world';
    try { saved = localStorage.getItem(TAB_KEY) || 'world'; } catch (e) {}
    goto(FEEDS[saved] ? saved : 'world', false);
    return true;
  }

  (function boot() {
    if (build()) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else setTimeout(build, 500);
  })();

  window.EduNews = {
    refresh: function () { if (curTab) goto(curTab, true); },
    goto: goto
  };
})();
