/* =====================================================================
   EDUHUB · Daily Briefing v2 — resilient news engine
   Strategy: RSS via 4-relay chain → native-CORS fallback APIs
   (Wikipedia In-the-News · Hacker News · Spaceflight News).
   Fallbacks are ad-blocker/ISP-proof. Daily cache. EduNews.debug().
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
  var HUE = { world: 'var(--accent,#3fd2b0)', tech: 'var(--info,#7fb3d9)',
              science: 'var(--brand,#7fe3c8)', business: 'var(--warn,#f0b46a)' };

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
  function dedupe(arrs){
    var seen={}, out=[];
    arrs.forEach(function(a){ (a||[]).forEach(function(it){
      var k=(it.t||'').toLowerCase(); if(!k||seen[k]) return; seen[k]=1; out.push(it); }); });
    return out;
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

  /* ---------- fetch + parse ---------- */
  function fetchText(url, ms) {
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, ms || 9000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.text(); })
      .then(function(x){ if (timer) clearTimeout(timer); return x; },
            function(e){ if (timer) clearTimeout(timer); throw e; });
  }
  function parseFeed(xml, sourceName) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
    var nodes = doc.getElementsByTagName('item');
    if (!nodes.length) nodes = doc.getElementsByTagName('entry');
    var out = [];
    for (var i = 0; i < nodes.length && out.length < 20; i++) {
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
      if (!it.title || !it.link || out.length >= 20) return;
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

  /* ---------- relay chain ---------- */
  var RELAYS = [
    { name: 'rss2json',  kind: 'json', url: function (u) { return 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u) + '&count=20'; } },
    { name: 'codetabs',  kind: 'xml',  url: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } },
    { name: 'allorigins',kind: 'xml',  url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
    { name: 'corsproxy', kind: 'xml',  url: function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } }
  ];
  function fetchFeed(url, source) {
    var i = 0, lastErr = '';
    function attempt() {
      if (i >= RELAYS.length) throw new Error('all relays failed (' + lastErr + ')');
      var r = RELAYS[i++];
      return fetchText(r.url(url), 9000).then(function (x) {
        if (r.kind === 'json') {
          var j = null;
          try { j = JSON.parse(x); } catch (e) { throw new Error('bad json'); }
          return parseRss2Json(j, source);
        }
        return parseFeed(x, source);
      }).catch(function (e) { lastErr = r.name + ':' + (e && e.message || e); return attempt(); });
    }
    return Promise.resolve().then(attempt);
  }

  /* ---------- native-CORS fallbacks (ad-blocker / ISP proof) ---------- */
  /* World + Business: Wikipedia "In the news" — official Wikimedia feed API */
  function wikiITN(filterRe) {
    function day(i) {
      var d = new Date(Date.now() - i * 86400000);
      return d.getUTCFullYear() + '/' + pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate());
    }
    function tryDay(i) {
      if (i > 5) return Promise.resolve([]);
      return fetchText('https://api.wikimedia.org/feed/v1/wikipedia/en/featured/' + day(i), 8000)
        .then(function (x) {
          var j = JSON.parse(x);
          var news = (j && j.news) || [];
          var out = [];
          news.forEach(function (n) {
            var text = stripTags(n.story);
            if (filterRe && !filterRe.test(text)) return;
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
  /* Tech: Hacker News front page (Algolia, native CORS) */
  function hnFront() {
    return fetchText('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=14', 8000)
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
  /* Science: Spaceflight News API (native CORS) */
  function spaceNews() {
    return fetchText('https://api.spaceflightnewsapi.net/v4/articles/?limit=14', 8000)
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
    /* ---------- more native sources ---------- */
  /* GDELT DOC 2.0 — global news index, native CORS, sometimes carries an image */
  function gdelt(query) {
    var url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent(query + ' sourcelang:english') +
      '&mode=artlist&maxrecords=25&format=json&sort=datedesc';
    return fetchText(url, 9000).then(function (x) {
      var j = JSON.parse(x), out = [];
      ((j && j.articles) || []).forEach(function (a) {
        if (!a.title || !a.url || out.length >= 20) return;
        var ms = 0, m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(a.seendate || '');
        if (m) ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        out.push({ t: String(a.title).replace(/\s+/g, ' ').slice(0, 200), l: a.url,
                   s: a.domain || 'GDELT', d: ms, img: a.socialimage || '' });
      });
      return out;
    });
  }
  /* DEV.to — tech articles, native CORS, almost always has a cover image */
  function devto() {
    return fetchText('https://dev.to/api/articles?per_page=20&top=7', 8000).then(function (x) {
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
    for (var i = 0; i < arguments.length; i++) {
      (arguments[i] || []).forEach(function (it) {
        if (out.length < 24) out.push(it);
      });
    }
    return out;
  }

  var FALLBACKS = {
    world: function () {
      return Promise.all([
        wikiITN(null),
        gdelt('(conflict OR election OR summit OR ceasefire OR diplomacy OR "united nations")').catch(function () { return []; })
      ]).then(function (r) { return mix(r[0], r[1]); });
    },
    business: function () {
      return Promise.all([
        wikiITN(/econom|market|bank|trade|inflation|stock|oil|OPEC|IMF|tariff|currency|GDP|merger|billion|investment/i),
        gdelt('(economy OR markets OR inflation OR trade OR stocks OR "central bank" OR tariffs OR recession)').catch(function () { return []; })
      ]).then(function (r) {
        var merged = mix(r[0], r[1]);
        if (merged.length >= 3) return merged;
        return wikiITN(null);   /* rare last resort — GDELT usually fills it first */
      });
    },
    tech: function () {
      return Promise.all([
        devto(),
        hnFront(),
        gdelt('(AI OR technology OR smartphone OR software OR cybersecurity)').catch(function () { return []; })
      ]).then(function (r) { return mix(r[0], r[1], r[2]); });
    },
    science: function () {
      return Promise.all([
        spaceNews(),
        wikiITN(/scientist|research|study|space|NASA|climate|species|discovered|telescope/i),
        gdelt('(NASA OR research OR climate OR telescope OR physics OR "scientific study")').catch(function () { return []; })
      ]).then(function (r) { return mix(r[0], r[1], r[2]); });
    }
  };

  /* ---------- category loader + prefetch ---------- */
  function store(cat, items) {
    var c = loadCache();
    c[cat] = { date: today(), ts: Date.now(), items: items };
    saveCache(c);
    return { items: items, ts: Date.now(), cached: false };
  }
  function stale(cat) {
    var c = loadCache();
    return { items: (c[cat] && c[cat].items) || [], ts: c[cat] && c[cat].ts, cached: true };
  }

  var inFlight = {};   /* category → Promise, shared across tabs */

  function loadCategory(cat, force) {
    var c = loadCache();
    if (!force && c[cat] && c[cat].date === today() && c[cat].items && c[cat].items.length)
      return Promise.resolve({ items: c[cat].items, ts: c[cat].ts, cached: false });

    if (!force && inFlight[cat]) return inFlight[cat];   /* join an already-running fetch */

    var conf = FEEDS[cat];
    var p = Promise.all(conf.feeds.map(function (f) {
      return fetchFeed(f.u, f.s).catch(function (e) { console.warn('[News]', f.s, e && e.message); return []; });
    })).then(function (arrs) {
      var merged = dedupe(arrs).sort(function (a, b) { return (b.d || 0) - (a.d || 0); });
      if (merged.length < 4) {   /* thin → blend in the native fallbacks */
        return FALLBACKS[cat]().then(function (fb) {
          var all = dedupe([merged, fb]).sort(function (a, b) { return (b.d || 0) - (a.d || 0); });
          return store(cat, all.slice(0, PER_CAT));
        }).catch(function () {
          return merged.length ? store(cat, merged.slice(0, PER_CAT)) : stale(cat);
        });
      }
      return store(cat, merged.slice(0, PER_CAT));
    }).catch(function () { return stale(cat); });

    inFlight[cat] = p;
    p.then(function () { delete inFlight[cat]; });
    return p;
  }

  /* cross-tab instant switching: filter the freshest big pool by keywords */
  var LENS = {
    world:    /conflict|war|ceasefire|election|summit|president|minister|attack|protest|border|united nations|diplomac|government/i,
    tech:     /\bAI\b|technolog|software|smartphone|startup|cyber|chip|app\b|internet|computer|robot|data|coding/i,
    science:  /scientist|research|study|space|NASA|climate|telescope|species|discovered|physics|quantum|genome| fossil/i,
    business: /econom|market|bank|trade|inflation|stock|oil|tariff|currency|GDP|merger|billion|investment|recession/i
  };
  function fromAnyPool(cat) {
    var c = loadCache(), best = null;
    Object.keys(c).forEach(function (k) {
      if (k === cat || !c[k] || !Array.isArray(c[k].items)) return;
      if (c[k].date !== today() || c[k].items.length < 5) return;
      if (!best || (c[k].ts || 0) > (best.ts || 0)) best = c[k];
    });
    if (!best) return [];
    var hits = best.items.filter(function (it) { return LENS[cat].test(it.t); });
    if (hits.length < 3) hits = hits.concat(best.items.filter(function (it) { return !LENS[cat].test(it.t); }));
    return hits.slice(0, PER_CAT).map(function (it) {
      return { t: it.t, l: it.l, s: it.s, d: it.d, img: it.img, _x: 1 };   /* _x = borrowed */
    });
  }

  /* warm the default tab the moment the page opens — before the user looks */
  var PREFETCHED = false;
  function prefetch() {
    if (PREFETCHED) return; PREFETCHED = true;
    try {
      var saved = localStorage.getItem(TAB_KEY) || 'world';
      loadCategory(FEEDS[saved] ? saved : 'world', false);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefetch);
  else prefetch();
  /* ---------- UI ---------- */
  var curTab = null, busy = false;
  function skeleton() {
    var h = '';
    for (var i = 0; i < 6; i++) h += '<div class="eh-nw-skel"><i></i><b></b><i></i></div>';
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
  function render(cat, res) {
    var grid = document.getElementById('ehNewsGrid'); if (!grid) return;
    var meta = document.getElementById('ehNewsMeta');
    if (meta && res.ts) {
      var t = new Date(res.ts);
      meta.textContent = 'Updated ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + (res.cached ? ' · cached' : '');
    }
    if (!res.items || !res.items.length) {
      grid.innerHTML = '<div class="eh-nw-msg">📡 Couldn\'t load the briefing right now.' +
        ' <button data-ehnw-retry>Retry</button></div>';
      return;
    }
    grid.innerHTML = cardsHTML(res.items, cat);
  }
  function spin(on) {
    var b = document.getElementById('ehNewsRefresh');
    if (b) b.classList.toggle('spin', !!on);
  }
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
      .then(function () { busy = false; spin(false); });
  }

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

  console.log('[News] engine v2 ready — relays + native fallbacks');
  window.EduNews = {
    refresh: function () { if (curTab) goto(curTab, true); },
    goto: goto,
    /* run EduNews.debug() in console — prints each relay's exact result */
    debug: function (cat) {
      cat = cat || curTab || 'world';
      FEEDS[cat].feeds.forEach(function (f) {
        RELAYS.forEach(function (r) {
          fetchText(r.url(f.u), 8000)
            .then(function (x) { console.log('✅', r.name, '→', f.s, x.length + ' bytes'); })
            .catch(function (e) { console.log('❌', r.name, '→', f.s, String(e && e.message || e)); });
        });
      });
      console.log('fallback:', FALLBACKS[cat] ? 'available for ' + cat : 'none');
    }
  };
})();
