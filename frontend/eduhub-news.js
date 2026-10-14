/* =====================================================================
   EDUHUB · Daily Briefing v6 — professional UI refresh
   ---------------------------------------------------------------------
   • MSN-style editorial cards: featured hero story, source favicons,
     compact timestamps, staggered entrance, polished skeletons
   • DOM contract unchanged: injected after .overview-strip as a
     .glass-card, same IDs (#ehNewsGrid, #ehNewsTabs, #ehNewsMeta,
     #ehNewsRefresh, #ehPrevBtn, #ehNextBtn, #ehBatchLabel)
   • Data engine unchanged: 5-source relays + native APIs (Wikipedia
     ITN, HN, Spaceflight, DEV, ESPN) + GDELT fallback, triple dedup
   Cache: studyHubNews.v4. Console: EduNews.debug() / EduNews.state()
   ===================================================================== */
(() => {
  'use strict';
  if (window.__EH_NEWS__) return;
  window.__EH_NEWS__ = true;

  /* ================================================================
     1 · CONFIG
     ================================================================ */
  const CACHE_KEY   = 'studyHubNews.v4';   // unchanged → warm cache survives
  const TAB_KEY     = 'studyHubNewsTab';
  const PER_CAT     = 10;                  // stories per batch
  const MAX_BATCHES = 6;                   // batches kept per category
  const POOL_MAX    = 90;                  // reserve pool size
  const WATCHDOG_MS = 16000;               // hard ceiling for a full build
  const RELAY_MS    = 7000;                // per-relay fetch timeout
  const NATIVE_MS   = 8000;                // per-native-API timeout

  const GN = (q) =>
    'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') +
    '&hl=en-US&gl=US&ceid=US:en';

  const FAVICON = (host) => 'https://www.google.com/s2/favicons?domain=' + host + '&sz=64';

  const FEEDS = {
    world:   { label: 'World',   icon: '🌍', feeds: [
      { u: 'https://feeds.bbci.co.uk/news/world/rss.xml', s: 'BBC News' },
      { u: 'https://www.aljazeera.com/xml/rss/all.xml',   s: 'Al Jazeera' },
      { u: GN('world news OR conflict OR summit'),        s: 'Google News' },
      { u: 'https://feeds.bbci.co.uk/news/rss.xml',       s: 'BBC News' },
    ]},
    tech:    { label: 'Tech',    icon: '💡', feeds: [
      { u: 'https://www.theverge.com/rss/index.xml', s: 'The Verge' },
      { u: 'https://techcrunch.com/feed/',           s: 'TechCrunch' },
      { u: 'https://arstechnica.com/feed/',          s: 'Ars Technica' },
      { u: 'https://www.engadget.com/rss.xml',       s: 'Engadget' },
    ]},
    science: { label: 'Science', icon: '🔬', feeds: [
      { u: 'https://phys.org/rss-feed/',                  s: 'Phys.org' },
      { u: 'https://www.sciencedaily.com/rss/all.xml',    s: 'ScienceDaily' },
      { u: GN('science research discovery'),              s: 'Google News' },
      { u: 'https://rss.app/feeds/tmre0VtNNvyPuJLhn.xml', s: 'Nature Briefing' },
    ]},
    sports:  { label: 'Sports',  icon: '⚽', feeds: [
      { u: 'https://feeds.bbci.co.uk/sport/rss.xml',   s: 'BBC Sport' },
      { u: 'https://www.skysports.com/rss/12040',      s: 'Sky Sports' },
      { u: 'https://www.espn.com/espn/rss/news',       s: 'ESPN' },
      { u: 'https://www.theguardian.com/sport/rss',    s: 'The Guardian' },
      { u: GN('football OR cricket OR tennis OR NBA'), s: 'Google News' },
    ]},
  };

  const HUE = {
    world:   'var(--accent,#3fd2b0)',
    tech:    'var(--info,#7fb3d9)',
    science: 'var(--brand,#7fe3c8)',
    sports:  'var(--ok,#5fd6a4)',
  };

  const FALLBACK_QUERIES = {
    world: 'international news',
    tech: 'technology news',
    science: 'science news',
    sports: 'sports news',
  };

  /* ================================================================
     2 · UTILITIES
     ================================================================ */
  const el = (id) => document.getElementById(id);

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad = (n) => String(n).padStart(2, '0');

  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  const hostOf = (url) => { try { return new URL(url).hostname; } catch (e) { return ''; } };

  const loadCache = () => {
    try { const o = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
    catch (e) { return {}; }
  };
  const saveCache = (c) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* quota */ } };

  /** Compact relative time: "now", "12m", "3h", "2d". */
  const timeAgo = (ms) => {
    if (!ms) return '';
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  };

  const stripTags = (h) => {
    const d = document.createElement('div');
    d.innerHTML = h || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const titleFrom = (text) => {
    text = String(text || '').trim();
    let cut = text.slice(0, 150);
    const dot = cut.search(/[.!?] /);
    if (dot > 40) cut = cut.slice(0, dot + 1);
    else if (text.length > 150) cut = cut.slice(0, cut.lastIndexOf(' ')) + '…';
    return cut;
  };

  const normTitle = (t) => String(t || '').toLowerCase()
    .replace(/\s*-\s*(bbc|cnn|reuters|ap|al jazeera|espn|sky sports|the guardian|the verge|techcrunch|engadget|ars technica|phys\.org|sciencedaily|google news).*$/i, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const titleSig = (t) =>
    normTitle(t).split(' ').filter((w) => w.length > 3).sort().slice(0, 6).join('|');

  /** Triple-pass dedup: exact URL, normalised title, 6-word signature. */
  function dedupeAll(arrs) {
    const seenUrl = new Set(), seenNorm = new Set(), seenSig = new Set();
    const out = [];
    arrs.forEach((a) => (a || []).forEach((it) => {
      if (!it.t || !it.l) return;
      const u = String(it.l).split('?')[0].toLowerCase();
      const n = normTitle(it.t);
      const sig = titleSig(it.t);
      if (seenUrl.has(u)) return;
      if (n.length > 12 && seenNorm.has(n)) return;
      if (sig && seenSig.has(sig)) return;
      seenUrl.add(u); seenNorm.add(n); if (sig) seenSig.add(sig);
      out.push(it);
    }));
    return out;
  }

  const byDate = (a, b) => (b.d || 0) - (a.d || 0);

  /** Keep the newest 12 outright; beyond that, only items < 48h old. */
  const recencyTrim = (items) => {
    const now = Date.now();
    return items.filter((it, i) => i < 12 || (it.d && now - it.d < 48 * 3600 * 1000));
  };

  /* ================================================================
     3 · STYLES  (scoped under #ehNewsCard — nothing leaks out)
     ================================================================ */
  const CSS = `
    /* ---- header ---- */
    #ehNewsCard .eh-nw-head{display:flex;align-items:center;justify-content:space-between;gap:.8rem}
    #ehNewsCard .eh-nw-title{display:flex;align-items:center;gap:.55rem;font:700 .95rem/1 var(--font,inherit);color:var(--ink,#edf2f7)}
    #ehNewsCard .eh-nw-title i{color:var(--accent,#3fd2b0);font-size:1.05rem}
    #ehNewsCard #ehNewsMeta{font:600 .72rem var(--mono,monospace);color:var(--faint,#7a8a9e)}
    #ehNewsCard #ehNewsRefresh{background:transparent;border:1px solid var(--line,rgba(148,163,184,.2));color:var(--muted,#8d9aa9);width:30px;height:30px;border-radius:9px;cursor:pointer;display:grid;place-items:center;font-size:.9rem;transition:color .15s,border-color .15s,transform .25s}
    #ehNewsCard #ehNewsRefresh:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0);transform:rotate(40deg)}
    #ehNewsCard #ehNewsRefresh.spin i{animation:ehNwSpin .8s linear infinite}
    @keyframes ehNwSpin{to{transform:rotate(360deg)}}

    /* ---- tabs ---- */
    #ehNewsCard .eh-nw-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:-.25rem 0 1rem}
    #ehNewsCard .eh-nw-tab{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.36rem .95rem;font:600 .76rem var(--font,inherit);cursor:pointer;transition:color .18s,border-color .18s,background .18s,transform .18s}
    #ehNewsCard .eh-nw-tab:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0);transform:translateY(-1px)}
    #ehNewsCard .eh-nw-tab.on{background:var(--accent-soft,rgba(63,210,176,.12));border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}

    /* ---- batch nav ---- */
    #ehNewsCard .eh-nw-batches{display:flex;align-items:center;gap:.5rem;margin:-.15rem 0 1rem;flex-wrap:wrap}
    #ehNewsCard .eh-nw-nav{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.36rem 1rem;font:600 .76rem var(--font,inherit);cursor:pointer;transition:color .18s,border-color .18s}
    #ehNewsCard .eh-nw-nav:hover:not(:disabled){border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}
    #ehNewsCard .eh-nw-nav:disabled{opacity:.35;cursor:not-allowed}
    #ehNewsCard .eh-nw-blabel{flex:1;min-width:120px;text-align:center;font:700 .72rem var(--font,inherit);text-transform:uppercase;letter-spacing:.12em;color:var(--muted,#8d9aa9)}

    /* ---- focus rings (a11y) ---- */
    #ehNewsCard .eh-nw-tab:focus-visible,#ehNewsCard .eh-nw-nav:focus-visible,#ehNewsCard #ehNewsRefresh:focus-visible{outline:2px solid var(--accent,#3fd2b0);outline-offset:2px}

    /* ---- grid ---- */
    #ehNewsCard #ehNewsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.9rem}

    /* ---- cards ---- */
    #ehNewsCard .eh-nw-card{position:relative;display:flex;flex-direction:column;background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.13));border-radius:16px;overflow:hidden;text-decoration:none;transition:border-color .18s,transform .18s,box-shadow .18s;animation:ehNwIn .45s cubic-bezier(.22,.61,.36,1) backwards}
    #ehNewsCard .eh-nw-card:hover{border-color:var(--accent,#3fd2b0);transform:translateY(-3px);box-shadow:0 14px 30px -16px rgba(0,0,0,.6)}
    @keyframes ehNwIn{from{opacity:0;transform:translateY(10px)}}

    #ehNewsCard .eh-nw-thumb{position:relative;display:block;aspect-ratio:16/9;background:var(--surface-3,rgba(148,163,184,.09));overflow:hidden}
    #ehNewsCard .eh-nw-thumb img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transform:scale(1.04);transition:opacity .45s ease,transform .6s ease}
    #ehNewsCard .eh-nw-thumb img.eh-loaded{opacity:1;transform:scale(1)}
    #ehNewsCard .eh-nw-card:hover .eh-nw-thumb img.eh-loaded{transform:scale(1.06)}
    #ehNewsCard .eh-nw-fb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 1.6rem var(--display,serif);color:var(--muted,#8d9aa9);background:radial-gradient(circle at 30% 25%,var(--surface-3,rgba(148,163,184,.14)),transparent 72%)}

    /* ---- featured hero (first story, MSN-style) ---- */
    #ehNewsCard .eh-nw-card.eh-hero{grid-column:1/-1;background:var(--surface-3,rgba(148,163,184,.08))}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-thumb{aspect-ratio:16/7}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-thumb::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,10,18,0) 38%,rgba(5,10,18,.82) 100%)}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-body{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:1rem 1.15rem 1.05rem;gap:.35rem}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-t{font-size:1.04rem;line-height:1.35;color:#fff;-webkit-line-clamp:2}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-src{color:rgba(255,255,255,.85)}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-src em{color:rgba(255,255,255,.6)}
    #ehNewsCard .eh-nw-chip{position:absolute;top:.75rem;left:.75rem;z-index:2;display:inline-flex;align-items:center;gap:.3rem;background:rgba(5,10,18,.55);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(6px);color:#fff;border-radius:var(--r-pill,999px);padding:.26rem .65rem;font:700 .6rem/1 var(--font,inherit);text-transform:uppercase;letter-spacing:.09em}
    #ehNewsCard .eh-nw-chip i{font-size:.72rem;color:var(--accent,#3fd2b0)}

    /* ---- card body ---- */
    #ehNewsCard .eh-nw-body{display:flex;flex-direction:column;gap:.5rem;padding:.8rem .9rem .9rem;flex:1}
    #ehNewsCard .eh-nw-src{display:flex;align-items:center;gap:.4rem;min-width:0;font:700 .66rem/1.2 var(--font,inherit);text-transform:uppercase;letter-spacing:.08em;color:var(--muted,#8d9aa9)}
    #ehNewsCard .eh-nw-fav{width:15px;height:15px;border-radius:4px;flex:none;object-fit:cover;background:var(--surface-3,rgba(148,163,184,.14))}
    #ehNewsCard .eh-nw-dot{width:6px;height:6px;border-radius:50%;flex:none}
    #ehNewsCard .eh-nw-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ehNewsCard .eh-nw-src em{font-style:normal;flex:none;font:600 .66rem var(--mono,monospace);text-transform:none;letter-spacing:0;color:var(--faint,#7a8a9e)}
    #ehNewsCard .eh-nw-t{font:600 .85rem/1.45 var(--font,inherit);color:var(--ink,#edf2f7);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

    /* ---- skeleton ---- */
    #ehNewsCard .eh-nw-skel{border-radius:16px;border:1px solid var(--line,rgba(148,163,184,.1));overflow:hidden}
    #ehNewsCard .eh-nw-skel i{display:block;aspect-ratio:16/9;background:linear-gradient(100deg,rgba(148,163,184,.06) 40%,rgba(148,163,184,.14) 50%,rgba(148,163,184,.06) 60%);background-size:200% 100%;animation:ehNwSh 1.1s linear infinite}
    #ehNewsCard .eh-nw-skel b{display:block;height:.7rem;margin:.7rem .8rem;border-radius:6px;background:linear-gradient(100deg,rgba(148,163,184,.07) 40%,rgba(148,163,184,.15) 50%,rgba(148,163,184,.07) 60%);background-size:200% 100%;animation:ehNwSh 1.1s linear infinite}
    #ehNewsCard .eh-nw-skel b+i{aspect-ratio:auto;height:.7rem;margin:0 .8rem .9rem;width:55%}
    @keyframes ehNwSh{to{background-position:-200% 0}}

    /* ---- empty / error message ---- */
    #ehNewsCard .eh-nw-msg{grid-column:1/-1;border:1px dashed var(--line-2,rgba(148,163,184,.25));border-radius:14px;padding:1.5rem;text-align:center;color:var(--muted,#8d9aa9);font-size:.85rem;line-height:1.6}
    #ehNewsCard .eh-nw-msg button{margin-left:.5rem;background:transparent;border:1px solid var(--accent,#3fd2b0);color:var(--accent,#3fd2b0);border-radius:8px;padding:.32rem .85rem;font:600 .78rem var(--font,inherit);cursor:pointer;transition:background .15s}
    #ehNewsCard .eh-nw-msg button:hover{background:var(--accent-soft,rgba(63,210,176,.12))}
  `;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ================================================================
     4 · FETCH LAYER
     ================================================================ */
  /** fetch() with an abort-based timeout. */
  function fetchT(url, ms) {
    return new Promise((resolve, reject) => {
      const ctrl = ('AbortController' in window) ? new AbortController() : null;
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        reject(new Error('timeout'));
      }, ms || RELAY_MS);
      fetch(url, ctrl ? { signal: ctrl.signal } : {})
        .then((r) => {
          if (done) return;
          if (!r.ok) { done = true; clearTimeout(timer); reject(new Error('http ' + r.status)); return; }
          r.text().then((x) => { if (done) return; done = true; clearTimeout(timer); resolve(x); });
        })
        .catch((e) => { if (done) return; done = true; clearTimeout(timer); reject(e); });
    });
  }

  function parseFeed(xml, sourceName) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
    let nodes = doc.getElementsByTagName('item');
    if (!nodes.length) nodes = doc.getElementsByTagName('entry');
    const out = [];
    for (let i = 0; i < nodes.length && out.length < 25; i++) {
      const n = nodes[i];
      const g = (t) => { const e = n.getElementsByTagName(t); return e.length ? e[0].textContent.trim() : ''; };
      const title = g('title');
      if (!title) continue;
      let link = '';
      const ls = n.getElementsByTagName('link');
      for (let j = 0; j < ls.length; j++) {
        const href = ls[j].getAttribute('href'), rel = ls[j].getAttribute('rel');
        if (href && (!rel || rel === 'alternate')) { link = href; break; }
        if (!link && ls[j].textContent.trim()) link = ls[j].textContent.trim();
      }
      if (!link) continue;
      const ds = g('pubDate') || g('published') || g('updated');
      let ms = ds ? Date.parse(ds) : 0;
      if (isNaN(ms)) ms = 0;
      let img = '';
      const enc = n.getElementsByTagName('enclosure');
      if (enc.length && enc[0].getAttribute('url')) img = enc[0].getAttribute('url');
      if (!img) { const mc = n.getElementsByTagName('media:content'); if (mc.length) img = mc[0].getAttribute('url') || ''; }
      if (!img) { const mt = n.getElementsByTagName('media:thumbnail'); if (mt.length) img = mt[0].getAttribute('url') || ''; }
      if (!img) {
        const m = (g('description') || g('content') || g('summary')).match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) img = m[1];
      }
      out.push({ t: title.slice(0, 200), l: link, s: sourceName, d: ms, img: img });
    }
    return out;
  }

  function parseRss2Json(j, sourceName) {
    if (!j || j.status !== 'ok' || !Array.isArray(j.items) || !j.items.length) throw new Error('bad json');
    const out = [];
    j.items.forEach((it) => {
      if (!it.title || !it.link || out.length >= 25) return;
      let ms = it.pubDate ? Date.parse(it.pubDate) : 0;
      if (isNaN(ms)) ms = 0;
      let img = it.thumbnail || (it.enclosure && it.enclosure.link) || '';
      if (!img) {
        const m = String(it.description || it.content || '').match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) img = m[1];
      }
      out.push({ t: String(it.title).slice(0, 200), l: it.link, s: sourceName, d: ms, img: img });
    });
    if (!out.length) throw new Error('empty');
    return out;
  }

  /* ---- CORS relay groups: race both, then fall through to next group ---- */
  const RELAY_GROUPS = [
    [
      { name: 'rss2json',  kind: 'json', url: (u) => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u) + '&count=25' },
      { name: 'codetabs',  kind: 'xml',  url: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) },
    ],
    [
      { name: 'allorigins', kind: 'xml', url: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
      { name: 'corsproxy',  kind: 'xml', url: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u) },
    ],
  ];

  function fetchFeed(url, source) {
    const attempt = (gi) => {
      if (gi >= RELAY_GROUPS.length) return Promise.reject(new Error('all relays failed'));
      return Promise.all(RELAY_GROUPS[gi].map((relay) =>
        fetchT(relay.url(url), RELAY_MS).then((x) => {
          if (relay.kind === 'json') {
            let j = null;
            try { j = JSON.parse(x); } catch (e) { throw new Error('bad json'); }
            return parseRss2Json(j, source);
          }
          return parseFeed(x, source);
        }).catch((e) => { console.warn('[News relay]', relay.name, e && e.message); return null; })
      )).then((res) => {
        const good = res.find((r) => r && r.length);
        return good || attempt(gi + 1);
      });
    };
    return attempt(0);
  }

  /* ================================================================
     5 · NATIVE SOURCES (direct APIs — no proxy needed)
     ================================================================ */
  function wikiITN() {
    const day = (i) => {
      const d = new Date(Date.now() - i * 86400000);
      return d.getUTCFullYear() + '/' + pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate());
    };
    const tryDay = (i) => {
      if (i > 5) return Promise.resolve([]);
      return fetchT('https://api.wikimedia.org/feed/v1/wikipedia/en/featured/' + day(i), NATIVE_MS)
        .then((x) => {
          const j = JSON.parse(x);
          const out = [];
          ((j && j.news) || []).forEach((nw) => {
            const text = stripTags(nw.story);
            let link = null, thumb = '', title = '';
            const links = nw.links || [];
            if (links.length) {
              const L = links[0];
              title = (L.titles && L.titles.normalized) || L.title || '';
              thumb = (L.thumbnail && L.thumbnail.source) || '';
              link = (L.content_urls && L.content_urls.desktop && L.content_urls.desktop.page) || null;
            }
            if (!link && title) link = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
            out.push({
              t: titleFrom(text),
              l: link || 'https://en.wikipedia.org/wiki/Portal:Current_events',
              s: 'Wikipedia ITN',
              d: Date.now() - i * 86400000,
              img: thumb,
            });
          });
          return out.length ? out : tryDay(i + 1);
        })
        .catch(() => tryDay(i + 1));
    };
    return tryDay(0);
  }

  function hnFront() {
    return fetchT('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20', NATIVE_MS)
      .then((x) => {
        const j = JSON.parse(x), out = [];
        ((j && j.hits) || []).forEach((h) => {
          if (!h.title || out.length >= 20) return;
          out.push({
            t: String(h.title).slice(0, 200),
            l: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
            s: 'Hacker News',
            d: Date.parse(h.created_at) || 0,
            img: '',
          });
        });
        return out;
      });
  }

  function spaceNews() {
    return fetchT('https://api.spaceflightnewsapi.net/v4/articles/?limit=20', NATIVE_MS)
      .then((x) => {
        const j = JSON.parse(x), out = [];
        ((j && j.results) || []).forEach((a) => {
          if (!a.title || !a.url || out.length >= 20) return;
          out.push({
            t: String(a.title).slice(0, 200), l: a.url,
            s: a.news_site || 'Spaceflight News',
            d: Date.parse(a.published_at) || 0, img: a.image_url || '',
          });
        });
        return out;
      });
  }

  function gdelt(query) {
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent(query + ' sourcelang:english') +
      '&mode=artlist&maxrecords=30&format=json&sort=datedesc';
    return fetchT(url, 9000).then((x) => {
      const j = JSON.parse(x), out = [];
      ((j && j.articles) || []).forEach((a) => {
        if (!a.title || !a.url || out.length >= 25) return;
        let ms = 0;
        const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(a.seendate || '');
        if (m) ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
        out.push({
          t: String(a.title).replace(/\s+/g, ' ').slice(0, 200), l: a.url,
          s: a.domain || 'GDELT', d: ms, img: a.socialimage || '',
        });
      });
      return out;
    });
  }

  function devto() {
    return fetchT('https://dev.to/api/articles?per_page=20&top=7', NATIVE_MS).then((x) => {
      const arr = JSON.parse(x), out = [];
      (Array.isArray(arr) ? arr : []).forEach((a) => {
        if (!a.title || !a.url || out.length >= 20) return;
        out.push({
          t: String(a.title).slice(0, 200), l: a.url, s: 'DEV Community',
          d: Date.parse(a.published_at) || 0,
          img: a.social_image || a.cover_image || '',
        });
      });
      return out;
    });
  }

  /** ESPN public JSON API — the sports equivalent of HN/Spaceflight. */
  function espnNews() {
    return fetchT('https://site.api.espn.com/apis/site/v2/sports/news', NATIVE_MS).then((x) => {
      const j = JSON.parse(x), out = [];
      ((j && j.articles) || []).forEach((a) => {
        const link = a && a.links && a.links.web && a.links.web.href;
        if (!a || !a.headline || !link || out.length >= 20) return;
        const img = (a.images && a.images.length && a.images[0] && a.images[0].url) || '';
        out.push({
          t: String(a.headline).slice(0, 200), l: link, s: 'ESPN',
          d: Date.parse(a.published || a.lastModified) || 0, img: img,
        });
      });
      if (!out.length) throw new Error('empty');
      return out;
    });
  }

  const mix = (...arrs) => {
    const out = [];
    arrs.forEach((a) => (a || []).forEach((it) => { if (out.length < 30) out.push(it); }));
    return out;
  };

  /* ================================================================
     6 · PER-CATEGORY DEEP BUILDS
     ================================================================ */
  const EXTRA = {
    world: () =>
      Promise.all([wikiITN(), gdelt('(conflict OR election OR summit OR diplomacy OR international)').catch(() => [])])
        .then((r) => mix(r[0], r[1])),
    tech: () =>
      Promise.all([devto(), hnFront(), gdelt('(AI OR technology OR smartphone OR cybersecurity)').catch(() => [])])
        .then((r) => mix(r[0], r[1], r[2])),
    science: () =>
      Promise.all([spaceNews(), gdelt('(NASA OR research OR climate OR discovery OR telescope)').catch(() => [])])
        .then((r) => mix(r[0], r[1])),
    sports: () =>
      Promise.all([
        espnNews().catch(() => []),
        gdelt('(football OR soccer OR cricket OR tennis OR NBA OR Olympics OR championship)').catch(() => []),
      ]).then((r) => mix(r[0], r[1])),
  };

  /** Pool builder: all RSS feeds + native extras, triple dedup, recency trim. */
  function buildPool(cat) {
    const conf = FEEDS[cat];
    const jobs = conf.feeds.map((f) =>
      fetchFeed(f.u, f.s).catch((e) => { console.warn('[News]', f.s, e && e.message); return []; }));
    const extra = EXTRA[cat] ? EXTRA[cat]().catch(() => []) : Promise.resolve([]);
    return Promise.all(jobs.concat([extra])).then((arrs) => {
      const merged = recencyTrim(dedupeAll(arrs).sort(byDate));
      if (merged.length >= 15) return merged;
      return gdelt(FALLBACK_QUERIES[cat]).catch(() => [])
        .then((more) => recencyTrim(dedupeAll([merged, more]).sort(byDate)));
    });
  }

  /* ================================================================
     7 · CACHE MODEL (stale-while-revalidate, shared in-flight builds)
     ================================================================ */
  function staleEntry(cat) {
    const c = loadCache();
    return (c[cat] && c[cat].batches && c[cat].batches.length) ? c[cat] : null;
  }

  const inFlight = {};
  function ensureEntry(cat, force) {
    // Join an in-flight build even on force — no duplicate fetch storms.
    if (inFlight[cat]) return inFlight[cat];
    const c = loadCache();
    if (!force && c[cat] && c[cat].date === today() && c[cat].batches && c[cat].batches.length)
      return Promise.resolve(c[cat]);
    const p = buildPool(cat).then((pool) => {
      if (!pool.length) return staleEntry(cat);
      const fresh = loadCache();
      fresh[cat] = {
        date: today(), ts: Date.now(),
        pool: pool.slice(0, POOL_MAX),
        batches: [{ items: pool.slice(0, PER_CAT), label: 'Top stories' }],
        batchIdx: 0, facet: 0, page: 1,
      };
      saveCache(fresh);
      return fresh[cat];
    });
    inFlight[cat] = p;
    const clear = () => { delete inFlight[cat]; };
    p.then(clear, clear);
    return p;
  }

  /* ================================================================
     8 · UI RENDERING
     ================================================================ */
  let curTab = null, busy = false;

  const skeleton = () => {
    let h = '';
    for (let i = 0; i < 8; i++) h += '<div class="eh-nw-skel"><i></i><b></b><i></i></div>';
    return h;
  };

  function cardsHTML(items, cat) {
    const hue = HUE[cat] || 'var(--accent,#3fd2b0)';
    return items.map((it, i) => {
      const hero = i === 0 && !!it.img;                 // featured first story
      const delay = Math.min(i, 8) * 40;                // staggered entrance
      const host = hostOf(it.l);
      const favSrc = host ? FAVICON(host) : '';
      const fav = favSrc
        ? '<img class="eh-nw-fav" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="' + esc(favSrc) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">'
        : '';
      const dot = '<span class="eh-nw-dot" style="background:' + hue + ';display:' + (favSrc ? 'none' : 'block') + '"></span>';
      const time = it.d ? '<em>· ' + timeAgo(it.d) + '</em>' : '';
      const img = it.img
        ? '<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="' + esc(it.img) + '" alt="" onload="this.classList.add(\'eh-loaded\')" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
        : '';
      const chip = hero ? '<span class="eh-nw-chip"><i class="ph ph-trend-up" aria-hidden="true"></i>Trending</span>' : '';
      return '<a class="eh-nw-card' + (hero ? ' eh-hero' : '') + '" href="' + esc(it.l) + '" target="_blank" rel="noopener noreferrer" style="animation-delay:' + delay + 'ms">' +
        '<span class="eh-nw-thumb">' + chip + img +
          '<span class="eh-nw-fb" style="display:' + (it.img ? 'none' : 'flex') + ';color:' + hue + '">' + esc((it.s || '•').charAt(0)) + '</span>' +
        '</span>' +
        '<span class="eh-nw-body">' +
          '<span class="eh-nw-src">' + fav + dot + '<span class="eh-nw-name">' + esc(it.s) + '</span>' + time + '</span>' +
          '<span class="eh-nw-t">' + esc(it.t) + '</span>' +
        '</span></a>';
    }).join('');
  }

  const setMeta = (txt) => { const m = el('ehNewsMeta'); if (m) m.textContent = txt; };
  const spin = (on) => { const b = el('ehNewsRefresh'); if (b) b.classList.toggle('spin', !!on); };

  const renderMsg = () => {
    const g = el('ehNewsGrid');
    if (g) g.innerHTML = '<div class="eh-nw-msg">📡 Couldn\'t load the briefing right now. <button data-ehnw-retry>Retry</button></div>';
  };

  function render(cat, e) {
    const grid = el('ehNewsGrid');
    if (!grid || !e) return;
    const idx = Math.max(0, Math.min(e.batchIdx || 0, e.batches.length - 1));
    const b = e.batches[idx];
    const t = new Date(e.ts || Date.now());
    setMeta('Updated ' + pad(t.getHours()) + ':' + pad(t.getMinutes()));

    const lbl = el('ehBatchLabel');
    if (lbl) {
      lbl.textContent = (idx === 0) ? 'Top stories'
        : 'Batch ' + (idx + 1) + (b.label && b.label !== 'Top stories' && b.label !== 'More stories' ? ' · ' + b.label : '');
    }
    const pv = el('ehPrevBtn');
    if (pv) { pv.disabled = (idx === 0); pv.style.opacity = (idx === 0) ? '.4' : ''; }

    const items = (b && b.items) ? b.items : [];
    grid.innerHTML = items.length ? cardsHTML(items, cat) : '<div class="eh-nw-msg">📡 Nothing here yet.</div>';
  }

  /* ================================================================
     9 · NAVIGATION (batch paging + GDELT encore)
     ================================================================ */
  function showIdx(cat, idx) {
    const c = loadCache(), e = c[cat];
    if (!e || !e.batches || !e.batches.length) return;
    idx = Math.max(0, Math.min(idx, e.batches.length - 1));
    if (idx === e.batchIdx) { render(cat, e); return; }
    e.batchIdx = idx; saveCache(c); render(cat, e);
  }

  const prevBatch = (cat) => { const c = loadCache(), e = c[cat]; if (e) showIdx(cat, (e.batchIdx || 0) - 1); };

  function pushBatch(cat, items, label) {
    const c = loadCache(), e = c[cat];
    if (!e) return;
    e.batches.push({ items: items, label: label || 'More stories' });
    if (e.batches.length > MAX_BATCHES) e.batches.shift();
    e.batchIdx = e.batches.length - 1;
    saveCache(c);
    busy = false; spin(false);
    if (curTab === cat) render(cat, e);   // only render the active tab
  }

  function nextBatch(cat) {
    if (busy) return;
    let c = loadCache(), e = c[cat];
    if (!e || !e.batches || !e.batches.length) { goto(cat, false); return; }
    if (e.batchIdx < e.batches.length - 1) { showIdx(cat, e.batchIdx + 1); return; }

    const used = {};
    e.batches.forEach((b) => b.items.forEach((it) => { used[it.t.toLowerCase()] = 1; }));
    const unseen = (e.pool || []).filter((it) => !used[it.t.toLowerCase()]);
    if (unseen.length >= PER_CAT) { pushBatch(cat, unseen.slice(0, PER_CAT), 'More stories'); return; }

    busy = true; spin(true);
    const wd = setTimeout(() => { busy = false; spin(false); }, WATCHDOG_MS);
    gdelt(FALLBACK_QUERIES[cat]).then((more) => {
      clearTimeout(wd);
      c = loadCache(); e = c[cat] || e;
      const fresh = dedupeAll([(e.pool || []), more]).filter((it) => !used[it.t.toLowerCase()]);
      const inPool = {};
      (e.pool || []).forEach((p) => { inPool[p.t.toLowerCase()] = 1; });
      fresh.forEach((it) => { if (!inPool[it.t.toLowerCase()]) e.pool.push(it); });
      e.pool = e.pool.slice(0, POOL_MAX);
      saveCache(c);
      const batch = fresh.slice(0, PER_CAT);
      if (batch.length >= 4) pushBatch(cat, batch, 'More stories');
      else {
        busy = false; spin(false); saveCache(c);
        if (curTab === cat) { render(cat, e); setMeta('Encore edition — fresh ' + cat + ' stories exhausted today'); }
      }
    }).catch(() => { clearTimeout(wd); busy = false; spin(false); });
  }

  /* ---- goto: cache-first, SWR, watchdog. Late responses only render
         if their tab is still active — a click is never swallowed. ---- */
  function goto(cat, force) {
    curTab = cat;
    try { localStorage.setItem(TAB_KEY, cat); } catch (e) {}
    document.querySelectorAll('.eh-nw-tab').forEach((b) => {
      const on = b.dataset.cat === cat;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    const c = loadCache();
    const e = (c[cat] && c[cat].date === today() && c[cat].batches && c[cat].batches.length) ? c[cat] : null;
    if (e && !force) { busy = false; spin(false); render(cat, e); return; }

    const grid = el('ehNewsGrid');
    if (e) render(cat, e);
    else if (grid) grid.innerHTML = skeleton();

    busy = true; spin(true);
    const wd = setTimeout(() => {
      if (curTab !== cat) return;
      busy = false; spin(false);
      const cur = loadCache()[cat];
      if (cur && cur.batches && cur.batches.length) render(cat, cur);
      else if (!e) renderMsg();
    }, WATCHDOG_MS);

    ensureEntry(cat, force).then((ne) => {
      clearTimeout(wd);
      if (curTab !== cat) return;
      busy = false; spin(false);
      if (ne) render(cat, ne);
      else if (!e) renderMsg();
    }).catch((err) => {
      console.warn('[News] build failed:', cat, err && err.message);
      clearTimeout(wd);
      if (curTab !== cat) return;
      busy = false; spin(false);
      if (!e) renderMsg();
    });
  }

  /* ================================================================
     10 · BUILD + BOOT  (position on page unchanged)
     ================================================================ */
  function build() {
    if (el('ehNewsCard')) return true;
    const strip = document.querySelector('.overview-strip');
    if (!strip) return false;

    const sec = document.createElement('section');
    sec.className = 'glass-card';
    sec.id = 'ehNewsCard';
    sec.innerHTML =
      '<div class="card-title eh-nw-head">' +
        '<span class="eh-nw-title"><i class="ph ph-newspaper" aria-hidden="true"></i>Daily Briefing</span>' +
        '<span id="ehNewsMeta"></span>' +
        '<button id="ehNewsRefresh" title="Refresh briefing" aria-label="Refresh briefing"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="eh-nw-tabs" id="ehNewsTabs" role="tablist"></div>' +
      '<div class="eh-nw-batches">' +
        '<button class="eh-nw-nav" id="ehPrevBtn" type="button">‹ Prev</button>' +
        '<span class="eh-nw-blabel" id="ehBatchLabel">Top stories</span>' +
        '<button class="eh-nw-nav" id="ehNextBtn" type="button">Next batch ›</button>' +
      '</div>' +
      '<div id="ehNewsGrid" aria-live="polite"></div>';
    strip.insertAdjacentElement('afterend', sec);   // ← same anchor as before

    const tabs = sec.querySelector('#ehNewsTabs');
    Object.keys(FEEDS).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'eh-nw-tab'; b.type = 'button'; b.dataset.cat = c;
      b.setAttribute('aria-pressed', 'false');
      b.textContent = FEEDS[c].icon + ' ' + FEEDS[c].label;
      b.addEventListener('click', () => goto(c, false));
      tabs.appendChild(b);
    });

    el('ehNewsRefresh').addEventListener('click', () => { if (curTab) goto(curTab, true); });
    el('ehPrevBtn').addEventListener('click', () => { if (curTab) prevBatch(curTab); });
    el('ehNextBtn').addEventListener('click', () => { if (curTab) nextBatch(curTab); });
    document.addEventListener('click', (ev) => {
      if (ev.target.closest && ev.target.closest('[data-ehnw-retry]') && curTab) goto(curTab, true);
    });

    let saved = 'world';
    try { saved = localStorage.getItem(TAB_KEY) || 'world'; } catch (e) {}
    goto(FEEDS[saved] ? saved : 'world', false);
    return true;
  }

  (function boot() {
    try { localStorage.removeItem('studyHubNews.v2'); } catch (e) {}
    try { localStorage.removeItem('studyHubNews.v3'); } catch (e) {}
    if (build()) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else setTimeout(build, 500);
  })();

  (function prefetch() {
    const warm = () => {
      try { const s = localStorage.getItem(TAB_KEY) || 'world'; ensureEntry(FEEDS[s] ? s : 'world', false); } catch (e) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', warm);
    else warm();
  })();

  /* ================================================================
     11 · PUBLIC API
     ================================================================ */
  console.log('[News] engine v6 — professional UI, hero cards, favicons, triple dedup, 10-per-batch');
  window.EduNews = {
    refresh: () => { if (curTab) goto(curTab, true); },
    goto: goto,
    next: () => { if (curTab) nextBatch(curTab); },
    prev: () => { if (curTab) prevBatch(curTab); },
    debug: (cat) => {
      cat = cat || curTab || 'world';
      FEEDS[cat].feeds.forEach((f) => {
        RELAY_GROUPS.forEach((g) => g.forEach((r) => {
          fetchT(r.url(f.u), 8000)
            .then((x) => console.log('✅', r.name, '→', f.s, x.length + ' bytes'))
            .catch((e) => console.log('❌', r.name, '→', f.s, String(e && e.message || e)));
        }));
      });
    },
    state: () => {
      const c = loadCache();
      Object.keys(c).forEach((k) => {
        const e = c[k];
        console.log(k, '| batches:', e.batches && e.batches.length, '| idx:', e.batchIdx,
                    '| pool:', e.pool && e.pool.length, '| date:', e.date);
      });
    },
  };
})();
