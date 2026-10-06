/* =====================================================================
   EDUHUB · Daily Briefing v4 — 5-source, deeply deduped, 10-per-batch
   • 5 sources per category (RSS + native APIs + Wikipedia + GDELT)
   • Triple-layer dedup: URL → normalized title → fuzzy title match
   • Batches of 10 · batches never repeat across the whole day
   • Racing relays + watchdog (UI can never lock)
   Cache: studyHubNews.v3 (v2 purged). Console: EduNews.debug()/state()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_NEWS__) return;
  window.__EH_NEWS__ = true;

  var CACHE_KEY = 'studyHubNews.v3', TAB_KEY = 'studyHubNewsTab';
  var PER_CAT = 10, MAX_BATCHES = 6, POOL_MAX = 90, WATCHDOG_MS = 16000;

  var GN = function (q) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') + '&hl=en-US&gl=US&ceid=US:en'; };

  var FEEDS = {
    world:   { label: 'World',   icon: '🌍', feeds: [
                 { u: 'https://feeds.bbci.co.uk/news/world/rss.xml', s: 'BBC News' },
                 { u: 'https://www.aljazeera.com/xml/rss/all.xml',   s: 'Al Jazeera' },
                 { u: GN('world news OR conflict OR summit'),        s: 'Google News' },
                 { u: 'https://feeds.bbci.co.uk/news/rss.xml',       s: 'BBC News' } ] },
    tech:    { label: 'Tech',    icon: '💡', feeds: [
                 { u: 'https://www.theverge.com/rss/index.xml',      s: 'The Verge' },
                 { u: 'https://techcrunch.com/feed/',                s: 'TechCrunch' },
                 { u: 'https://arstechnica.com/feed/',               s: 'Ars Technica' },
                 { u: 'https://www.engadget.com/rss.xml',            s: 'Engadget' } ] },
    science: { label: 'Science', icon: '🔬', feeds: [
                 { u: 'https://phys.org/rss-feed/',                  s: 'Phys.org' },
                 { u: 'https://www.sciencedaily.com/rss/all.xml',    s: 'ScienceDaily' },
                 { u: GN('science research discovery'),              s: 'Google News' },
                 { u: 'https://rss.app/feeds/tmre0VtNNvyPuJLhn.xml', s: 'Nature Briefing' } ] },
    sports:  { label: 'Sports',  icon: '⚽', feeds: [
                 { u: 'https://feeds.bbci.co.uk/sport/rss.xml',      s: 'BBC Sport' },
                 { u: 'https://www.skysports.com/rss/12040',         s: 'Sky Sports' },
                 { u: 'https://www.espn.com/espn/rss/news',          s: 'ESPN' },
                 { u: GN('football OR cricket OR tennis'),           s: 'Google News' } ] }
  };
  var HUE = { world: 'var(--accent,#3fd2b0)', tech: 'var(--info,#7fb3d9)', science: 'var(--brand,#7fe3c8)', sports: 'var(--ok,#5fd6a4)' };

  /* ---------- helpers ---------- */
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
  function stripTags(h){ var d=document.createElement('div'); d.innerHTML=h||''; return (d.textContent||'').replace(/\s+/g,' ').trim(); }
  function titleFrom(text){
    text = String(text||'').trim();
    var cut = text.slice(0,150);
    var dot = cut.search(/[.!?] /);
    if (dot > 40) cut = cut.slice(0, dot + 1);
    else if (text.length > 150) cut = cut.slice(0, cut.lastIndexOf(' ')) + '…';
    return cut;
  }
  /* title normalization for dedup: lowercase, strip source suffixes & punctuation */
  function normTitle(t) {
    return String(t||'').toLowerCase()
      .replace(/\s*-\s*(bbc|cnn|reuters|ap|al jazeera|espn|sky sports|the verge|techcrunch|engadget|ars technica|phys\.org|sciencedaily|google news).*$/i, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* token-based fuzzy signature: 5+ shared significant words = same story */
  function titleSig(t) {
    var words = normTitle(t).split(' ').filter(function (w) { return w.length > 3; });
    return words.sort().slice(0, 6).join('|');
  }
  function dedupeAll(arrs) {
    var seenUrl = {}, seenNorm = {}, seenSig = {}, out = [];
    arrs.forEach(function (a) {
      (a || []).forEach(function (it) {
        if (!it.t || !it.l) return;
        var u = String(it.l).split('?')[0].toLowerCase();
        var n = normTitle(it.t);
        var sig = titleSig(it.t);
        if (seenUrl[u]) return;
        if (n.length > 12 && seenNorm[n]) return;
        if (sig && seenSig[sig]) return;
        seenUrl[u] = 1; seenNorm[n] = 1; seenSig[sig] = 1;
        out.push(it);
      });
    });
    return out;
  }
  function byDate(a,b){ return (b.d||0)-(a.d||0); }
  function recencyTrim(items){
    var now = Date.now(), out = [];
    for (var i=0;i<items.length;i++){
      if (i < 12) { out.push(items[i]); continue; }
      if (items[i].d && (now - items[i].d) < 48*3600*1000) out.push(items[i]);
    }
    return out;
  }

  /* ---------- CSS ---------- */
  var CSS =
    '#ehNewsCard .eh-nw-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:-.35rem 0 .9rem}' +
    '.eh-nw-tab{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.32rem .9rem;font:600 .76rem var(--font,inherit);cursor:pointer;transition:all .18s}' +
    '.eh-nw-tab:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '.eh-nw-tab.on{background:var(--accent-soft,rgba(63,210,176,.12));border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '#ehNewsMeta{display:flex;align-items:center;gap:.6rem;font:600 .72rem var(--mono,monospace);color:var(--faint,#7a8a9e)}' +
    '#ehNewsRefresh{background:transparent;border:1px solid var(--line,rgba(148,163,184,.2));color:var(--muted,#8d9aa9);width:28px;height:28px;border-radius:8px;cursor:pointer;display:grid;place-items:center;font-size:.85rem;transition:all .15s}' +
    '#ehNewsRefresh:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '#ehNewsRefresh.spin i{animation:ehNwSpin .8s linear infinite}' +
    '@keyframes ehNwSpin{to{transform:rotate(360deg)}}' +
    '.eh-nw-batches{display:flex;align-items:center;gap:.5rem;margin:-.2rem 0 .95rem;flex-wrap:wrap}' +
    '.eh-nw-nav{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.32rem .95rem;font:600 .76rem var(--font,inherit);cursor:pointer;transition:all .18s}' +
    '.eh-nw-nav:hover:not(:disabled){border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '.eh-nw-nav:disabled{opacity:.35;cursor:not-allowed}' +
    '.eh-nw-blabel{flex:1;min-width:120px;text-align:center;font:700 .72rem var(--font,inherit);text-transform:uppercase;letter-spacing:.12em;color:var(--muted,#8d9aa9)}' +
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

  /* ---------- fetch + parse ---------- */
  function fetchT(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        reject(new Error('timeout'));
      }, ms || 7000);
      fetch(url, ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) {
          if (done) return;
          if (!r.ok) { done = true; clearTimeout(timer); reject(new Error('http ' + r.status)); return; }
          return r.text().then(function (x) {
            if (done) return; done = true; clearTimeout(timer); resolve(x);
          });
        })
        .catch(function (e) { if (done) return; done = true; clearTimeout(timer); reject(e); });
    });
  }
  function parseFeed(xml, sourceName) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
    var nodes = doc.getElementsByTagName('item');
    if (!nodes.length) nodes = doc.getElementsByTagName('entry');
    var out = [];
    for (var i = 0; i < nodes.length && out.length < 25; i++) {
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
        var ds = g('pubDate') || g('published') || g('updated');
        var ms = ds ? Date.parse(ds) : 0; if (isNaN(ms)) ms = 0;
        var img = '';
        var enc = n.getElementsByTagName('enclosure');
        if (enc.length && enc[0].getAttribute('url')) img = enc[0].getAttribute('url');
        if (!img) { var mc = n.getElementsByTagName('media:content'); if (mc.length) img = mc[0].getAttribute('url') || ''; }
        if (!img) { var mt = n.getElementsByTagName('media:thumbnail'); if (mt.length) img = mt[0].getAttribute('url') || ''; }
        if (!img) {
          var m = (g('description') || g('content') || g('summary')).match(/<img[^>]+src=["']([^"']+)["']/i);
          if (m) img = m[1];
        }
        out.push({ t: title.slice(0, 200), l: link, s: sourceName, d: ms, img: img });
      })(nodes[i]);
    }
    return out;
  }
  function parseRss2Json(j, sourceName) {
    if (!j || j.status !== 'ok' || !Array.isArray(j.items) || !j.items.length) throw new Error('bad json');
    var out = [];
    j.items.forEach(function (it) {
      if (!it.title || !it.link || out.length >= 25) return;
      var ms = it.pubDate ? Date.parse(it.pubDate) : 0; if (isNaN(ms)) ms = 0;
      var img = it.thumbnail || (it.enclosure && it.enclosure.link) || '';
      if (!img) {
        var m = String(it.description || it.content || '').match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) img = m[1];
      }
      out.push({ t: String(it.title).slice(0, 200), l: it.link, s: sourceName, d: ms, img: img });
    });
    if (!out.length) throw new Error('empty');
    return out;
  }

  /* ---------- racing relays ---------- */
  var RELAY_GROUPS = [
    [ { name:'rss2json', kind:'json', url:function(u){ return 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u) + '&count=25'; } },
      { name:'codetabs', kind:'xml',  url:function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } } ],
    [ { name:'allorigins', kind:'xml', url:function(u){ return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
      { name:'corsproxy',  kind:'xml', url:function(u){ return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } } ]
  ];
  function fetchFeed(url, source) {
    function group(gi) {
      if (gi >= RELAY_GROUPS.length) return Promise.reject(new Error('all relays failed'));
      return Promise.all(RELAY_GROUPS[gi].map(function (r) {
        return fetchT(r.url(url), 7000).then(function (x) {
          if (r.kind === 'json') {
            var j = null;
            try { j = JSON.parse(x); } catch (e) { throw new Error('bad json'); }
            return parseRss2Json(j, source);
          }
          return parseFeed(x, source);
        }).catch(function (e) { console.warn('[News relay]', r.name, e && e.message); return null; });
      })).then(function (res) {
        for (var i = 0; i < res.length; i++) if (res[i] && res[i].length) return res[i];
        return group(gi + 1);
      });
    }
    return group(0);
  }

  /* ---------- native sources ---------- */
  function wikiITN() {
    function day(i) {
      var d = new Date(Date.now() - i * 86400000);
      return d.getUTCFullYear() + '/' + pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate());
    }
    function tryDay(i) {
      if (i > 5) return Promise.resolve([]);
      return fetchT('https://api.wikimedia.org/feed/v1/wikipedia/en/featured/' + day(i), 8000)
        .then(function (x) {
          var j = JSON.parse(x);
          var out = [];
          ((j && j.news) || []).forEach(function (n) {
            var text = stripTags(n.story);
            var link = null, thumb = '', title = '';
            var links = n.links || [];
            if (links.length) {
              var L = links[0];
              title = (L.titles && L.titles.normalized) || L.title || '';
              thumb = (L.thumbnail && L.thumbnail.source) || '';
              link = (L.content_urls && L.content_urls.desktop && L.content_urls.desktop.page) || null;
            }
            if (!link && title) link = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
            out.push({ t: titleFrom(text), l: link || 'https://en.wikipedia.org/wiki/Portal:Current_events',
                       s: 'Wikipedia ITN', d: Date.now() - i * 86400000, img: thumb });
          });
          if (out.length) return out;
          return tryDay(i + 1);
        })
        .catch(function () { return tryDay(i + 1); });
    }
    return tryDay(0);
  }
  function hnFront() {
    return fetchT('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20', 8000)
      .then(function (x) {
        var j = JSON.parse(x), out = [];
        ((j && j.hits) || []).forEach(function (h) {
          if (!h.title || out.length >= 20) return;
          out.push({ t: String(h.title).slice(0, 200),
                     l: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
                     s: 'Hacker News', d: Date.parse(h.created_at) || 0, img: '' });
        });
        return out;
      });
  }
  function spaceNews() {
    return fetchT('https://api.spaceflightnewsapi.net/v4/articles/?limit=20', 8000)
      .then(function (x) {
        var j = JSON.parse(x), out = [];
        ((j && j.results) || []).forEach(function (a) {
          if (!a.title || !a.url || out.length >= 20) return;
          out.push({ t: String(a.title).slice(0, 200), l: a.url,
                     s: a.news_site || 'Spaceflight News',
                     d: Date.parse(a.published_at) || 0, img: a.image_url || '' });
        });
        return out;
      });
  }
  function gdelt(query) {
    var url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent(query + ' sourcelang:english') +
      '&mode=artlist&maxrecords=30&format=json&sort=datedesc';
    return fetchT(url, 9000).then(function (x) {
      var j = JSON.parse(x), out = [];
      ((j && j.articles) || []).forEach(function (a) {
        if (!a.title || !a.url || out.length >= 25) return;
        var ms = 0, m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(a.seendate || '');
        if (m) ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        out.push({ t: String(a.title).replace(/\s+/g, ' ').slice(0, 200), l: a.url,
                   s: a.domain || 'GDELT', d: ms, img: a.socialimage || '' });
      });
      return out;
    });
  }
  function devto() {
    return fetchT('https://dev.to/api/articles?per_page=20&top=7', 8000).then(function (x) {
      var arr = JSON.parse(x), out = [];
      (Array.isArray(arr) ? arr : []).forEach(function (a) {
        if (!a.title || !a.url || out.length >= 20) return;
        out.push({ t: String(a.title).slice(0, 200), l: a.url, s: 'DEV Community',
                   d: Date.parse(a.published_at) || 0,
                   img: a.social_image || a.cover_image || '' });
      });
      return out;
    });
  }
  function mix() {
    var out = [];
    for (var i = 0; i < arguments.length; i++)
      (arguments[i] || []).forEach(function (it) { if (out.length < 30) out.push(it); });
    return out;
  }

  /* ---------- per-category deep builds ---------- */
  var EXTRA = {
    world: function () {
      return Promise.all([ wikiITN(), gdelt('(conflict OR election OR summit OR diplomacy OR international)').catch(function(){return[];}) ])
        .then(function (r) { return mix(r[0], r[1]); });
    },
    tech: function () {
      return Promise.all([ devto(), hnFront(), gdelt('(AI OR technology OR smartphone OR cybersecurity)').catch(function(){return[];}) ])
        .then(function (r) { return mix(r[0], r[1], r[2]); });
    },
    science: function () {
      return Promise.all([ spaceNews(), gdelt('(NASA OR research OR climate OR discovery OR telescope)').catch(function(){return[];}) ])
        .then(function (r) { return mix(r[0], r[1]); });
    },
    sports: function () {
      return Promise.all([ gdelt('(football OR cricket OR "champions league" OR olympics OR tennis OR "world cup" OR NBA)').catch(function(){return[];}) ])
        .then(function (r) { return mix(r[0]); });
    }
  };

  /* ---------- pool builder: 4+ sources, triple dedup ---------- */
  function buildPool(cat) {
    var conf = FEEDS[cat];
    var jobs = conf.feeds.map(function (f) {
      return fetchFeed(f.u, f.s).catch(function (e) { console.warn('[News]', f.s, e && e.message); return []; });
    });
    var extra = EXTRA[cat] ? EXTRA[cat]().catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all(jobs.concat([extra])).then(function (arrs) {
      var merged = recencyTrim(dedupeAll(arrs).sort(byDate));
      if (merged.length >= 15) return merged;
      /* still thin — GDELT top-up by category */
      var q = { world:'international news', tech:'technology news', science:'science news', sports:'sports news' }[cat];
      return gdelt(q).catch(function(){return [];}).then(function (more) {
        return recencyTrim(dedupeAll([merged, more]).sort(byDate));
      });
    });
  }

  /* ---------- cache model ---------- */
  function staleEntry(cat) {
    var c = loadCache();
    return (c[cat] && c[cat].batches && c[cat].batches.length) ? c[cat] : null;
  }
  var inFlight = {};
  function ensureEntry(cat, force) {
    var c = loadCache();
    if (!force && c[cat] && c[cat].date === today() && c[cat].batches && c[cat].batches.length)
      return Promise.resolve(c[cat]);
    if (!force && inFlight[cat]) return inFlight[cat];
    var p = buildPool(cat).then(function (pool) {
      if (!pool.length) return staleEntry(cat);
      c = loadCache();
      c[cat] = { date: today(), ts: Date.now(),
                 pool: pool.slice(0, POOL_MAX),
                 batches: [{ items: pool.slice(0, PER_CAT), label: 'Top stories' }],
                 batchIdx: 0, facet: 0, page: 1 };
      saveCache(c);
      return c[cat];
    });
    inFlight[cat] = p;
    function clear(){ delete inFlight[cat]; }
    p.then(clear, clear);
    return p;
  }

  /* ---------- UI ---------- */
  var curTab = null, busy = false;
  function skeleton() {
    var h = '';
    for (var i = 0; i < 8; i++) h += '<div class="eh-nw-skel"><i></i><b></b><i></i></div>';
    return h;
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
  function setMeta(txt) { var m = document.getElementById('ehNewsMeta'); if (m) m.textContent = txt; }
  function renderMsg() {
    var g = document.getElementById('ehNewsGrid');
    if (g) g.innerHTML = '<div class="eh-nw-msg">📡 Couldn\'t load the briefing right now.' +
      ' <button data-ehnw-retry>Retry</button></div>';
  }
  function spin(on) {
    var b = document.getElementById('ehNewsRefresh');
    if (b) b.classList.toggle('spin', !!on);
  }
  function render(cat, e) {
    var grid = document.getElementById('ehNewsGrid'); if (!grid || !e) return;
    var idx = Math.max(0, Math.min(e.batchIdx || 0, e.batches.length - 1));
    var b = e.batches[idx];
    var t = new Date(e.ts || Date.now());
    setMeta('Updated ' + pad(t.getHours()) + ':' + pad(t.getMinutes()));
    var lbl = document.getElementById('ehBatchLabel');
    if (lbl) {
      var name = (idx === 0) ? 'Top stories' :
        'Batch ' + (idx + 1) + (b.label && b.label !== 'Top stories' && b.label !== 'More stories' ? ' · ' + b.label : '');
      lbl.textContent = name;
    }
    var pv = document.getElementById('ehPrevBtn');
    if (pv) { pv.disabled = (idx === 0); pv.style.opacity = (idx === 0) ? '.4' : ''; }
    var items = (b && b.items) ? b.items : [];
    grid.innerHTML = items.length ? cardsHTML(items, cat)
      : '<div class="eh-nw-msg">📡 Nothing here yet.</div>';
  }

  /* ---------- navigation ---------- */
  function showIdx(cat, idx) {
    var c = loadCache(), e = c[cat];
    if (!e || !e.batches || !e.batches.length) return;
    idx = Math.max(0, Math.min(idx, e.batches.length - 1));
    if (idx === e.batchIdx) { render(cat, e); return; }
    e.batchIdx = idx; saveCache(c); render(cat, e);
  }
  function prevBatch(cat) { var c = loadCache(), e = c[cat]; if (e) showIdx(cat, (e.batchIdx || 0) - 1); }
  function pushBatch(cat, items, label) {
    var c = loadCache(), e = c[cat]; if (!e) return;
    e.batches.push({ items: items, label: label || 'More stories' });
    if (e.batches.length > MAX_BATCHES) e.batches.shift();
    e.batchIdx = e.batches.length - 1;
    saveCache(c);
    busy = false; spin(false);
    render(cat, e);
  }
  function nextBatch(cat) {
    if (busy) return;
    var c = loadCache(), e = c[cat];
    if (!e || !e.batches || !e.batches.length) { goto(cat, false); return; }
    if (e.batchIdx < e.batches.length - 1) { showIdx(cat, e.batchIdx + 1); return; }
    var used = {};
    e.batches.forEach(function (b) { b.items.forEach(function (it) { used[it.t.toLowerCase()] = 1; }); });
    var unseen = (e.pool || []).filter(function (it) { return !used[it.t.toLowerCase()]; });
    if (unseen.length >= PER_CAT) { pushBatch(cat, unseen.slice(0, PER_CAT), 'More stories'); return; }

    busy = true; spin(true);
    var wd = setTimeout(function () { busy = false; spin(false); }, WATCHDOG_MS);
    var q = { world:'international news', tech:'technology news', science:'science news', sports:'sports news' }[cat];
    gdelt(q).then(function (more) {
      clearTimeout(wd);
      c = loadCache(); e = c[cat] || e;
      var fresh = dedupeAll([(e.pool || []), more]).filter(function (it) {
        return !used[it.t.toLowerCase()];
      });
      var inPool = {};
      (e.pool || []).forEach(function (p) { inPool[p.t.toLowerCase()] = 1; });
      fresh.forEach(function (it) { if (!inPool[it.t.toLowerCase()]) e.pool.push(it); });
      e.pool = e.pool.slice(0, POOL_MAX);
      saveCache(c);
      var batch = fresh.slice(0, PER_CAT);
      if (batch.length >= 4) pushBatch(cat, batch, 'More stories');
      else {
        busy = false; spin(false); saveCache(c); render(cat, e);
        setMeta('Encore edition — fresh ' + cat + ' stories exhausted today');
      }
    }).catch(function () { clearTimeout(wd); busy = false; spin(false); });
  }

  /* ---------- goto: cache-first, SWR, watchdog ---------- */
  function goto(cat, force) {
    if (busy) return;
    curTab = cat;
    try { localStorage.setItem(TAB_KEY, cat); } catch (e) {}
    document.querySelectorAll('.eh-nw-tab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.cat === cat);
    });
    var c = loadCache();
    var e = (c[cat] && c[cat].date === today() && c[cat].batches && c[cat].batches.length) ? c[cat] : null;
    if (e && !force) { render(cat, e); return; }
    var grid = document.getElementById('ehNewsGrid');
    if (e) render(cat, e);
    else if (grid) grid.innerHTML = skeleton();
    busy = true; spin(true);
    var wd = setTimeout(function () {
      busy = false; spin(false);
      var cur = loadCache()[cat];
      if (cur && cur.batches && cur.batches.length) render(cat, cur);
      else if (!e) renderMsg();
    }, WATCHDOG_MS);
    ensureEntry(cat, force).then(function (ne) {
      clearTimeout(wd);
      busy = false; spin(false);
      if (ne) render(cat, ne);
      else if (!e) renderMsg();
    });
  }

  /* ---------- build + boot ---------- */
  function build() {
    if (document.getElementById('ehNewsCard')) return true;
    var strip = document.querySelector('.overview-strip');
    if (!strip) return false;
    var sec = document.createElement('section');
    sec.className = 'glass-card'; sec.id = 'ehNewsCard';
    sec.innerHTML =
      '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;">' +
        '<span style="display:flex;align-items:center;gap:.55rem;"><span style="color:var(--accent,#3fd2b0)"><i class="ph ph-newspaper" aria-hidden="true"></i></span> Daily Briefing</span>' +
        '<span id="ehNewsMeta"></span>' +
        '<button id="ehNewsRefresh" title="Refresh briefing" aria-label="Refresh"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="eh-nw-tabs" id="ehNewsTabs"></div>' +
      '<div class="eh-nw-batches">' +
        '<button class="eh-nw-nav" id="ehPrevBtn" type="button">‹ Prev</button>' +
        '<span class="eh-nw-blabel" id="ehBatchLabel">Top stories</span>' +
        '<button class="eh-nw-nav" id="ehNextBtn" type="button">✦ Next batch ›</button>' +
      '</div>' +
      '<div id="ehNewsGrid"></div>';
    strip.insertAdjacentElement('afterend', sec);
    var tabs = sec.querySelector('#ehNewsTabs');
    Object.keys(FEEDS).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'eh-nw-tab'; b.type = 'button'; b.dataset.cat = c;
      b.textContent = FEEDS[c].icon + ' ' + FEEDS[c].label;
      b.addEventListener('click', function () { goto(c, false); });
      tabs.appendChild(b);
    });
    sec.querySelector('#ehNewsRefresh').addEventListener('click', function () {
      if (curTab) goto(curTab, true);
    });
    sec.querySelector('#ehPrevBtn').addEventListener('click', function () {
      if (curTab) prevBatch(curTab);
    });
    sec.querySelector('#ehNextBtn').addEventListener('click', function () {
      if (curTab) nextBatch(curTab);
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
    try { localStorage.removeItem('studyHubNews.v2'); } catch (e) {}
    if (build()) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else setTimeout(build, 500);
  })();
  (function prefetch(){
    function warm(){ try { var s = localStorage.getItem(TAB_KEY) || 'world'; ensureEntry(FEEDS[s] ? s : 'world', false); } catch (e) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', warm);
    else warm();
  })();

  console.log('[News] engine v4 — 5 sources, triple dedup, 10-per-batch');
  window.EduNews = {
    refresh: function () { if (curTab) goto(curTab, true); },
    goto: goto, next: function () { if (curTab) nextBatch(curTab); },
    prev: function () { if (curTab) prevBatch(curTab); },
    debug: function (cat) {
      cat = cat || curTab || 'world';
      FEEDS[cat].feeds.forEach(function (f) {
        RELAY_GROUPS.forEach(function (g) { g.forEach(function (r) {
          fetchT(r.url(f.u), 8000)
            .then(function (x) { console.log('✅', r.name, '→', f.s, x.length + ' bytes'); })
            .catch(function (e) { console.log('❌', r.name, '→', f.s, String(e && e.message || e)); });
        }); });
      });
    },
    state: function () {
      var c = loadCache();
      Object.keys(c).forEach(function (k) {
        var e = c[k];
        console.log(k, '| batches:', e.batches && e.batches.length, '| idx:', e.batchIdx,
                    '| pool:', e.pool && e.pool.length, '| date:', e.date);
      });
    }
  };
})();
