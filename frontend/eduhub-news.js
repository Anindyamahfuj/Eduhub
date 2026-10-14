/* =====================================================================
   EDUHUB · Daily Briefing v6.2 — corner popup widget
   ---------------------------------------------------------------------
   • CHANGE (layout): no longer an in-flow section after .overview-strip.
     Now a compact popup pinned to the TOP-LEFT corner:
       – Launcher button (fixed, top-left) with live pulse badge
       – Popup panel (~420px) with tabs, batch nav, hero + cards
       – Closes via ✕ button, Esc key, or clicking outside
   • Tweak position/size via POP_* constants in §1.
   • Data engine unchanged: 5 ESPN endpoints + relays + GDELT,
     triple dedup, cache studyHubNews.v4. EduNews.debug()/state() OK.
   ===================================================================== */
(() => {
  'use strict';
  if (window.__EH_NEWS__) return;
  window.__EH_NEWS__ = true;

  /* ================================================================
     1 · CONFIG
     ================================================================ */
  const CACHE_KEY   = 'studyHubNews.v4';
  const TAB_KEY     = 'studyHubNewsTab';
  const PER_CAT     = 10;
  const MAX_BATCHES = 6;
  const POOL_MAX    = 90;
  const WATCHDOG_MS = 22000;
  const RELAY_MS    = 7000;
  const NATIVE_MS   = 8000;

  /* ---- POPUP GEOMETRY (tweak these to reposition/resize) ---- */
  const POP_TOP     = 12;                                   // px from top
  const POP_LEFT    = 12;                                   // px from left
  const POP_WIDTH   = 420;                                  // panel width (px)
  const POP_MAXH    = 620;                                  // panel max height (px)

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
      { u: 'https://feeds.bbci.co.uk/sport/rss.xml', s: 'BBC Sport' },
      { u: 'https://www.skysports.com/rss/12040',    s: 'Sky Sports' },
      { u: 'https://www.espn.com/espn/rss/news',     s: 'ESPN' },
      { u: 'https://www.theguardian.com/sport/rss',  s: 'The Guardian' },
      { u: 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en', s: 'Google News' },
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

  const utcDay = (i) => {
    const d = new Date(Date.now() - i * 86400000);
    return d.getUTCFullYear() + '/' + pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate());
  };

  const hostOf = (url) => { try { return new URL(url).hostname; } catch (e) { return ''; } };

  const loadCache = () => {
    try { const o = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
    catch (e) { return {}; }
  };
  const saveCache = (c) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {} };

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
    .replace(/\s*-\s*(bbc|cnn|reuters|ap|al jazeera|espn|sky sports|the guardian|the verge|techcrunch|engadget|ars technica|phys\.org|sciencedaily|google news|espn (fc|nba|nfl|cricket)).*$/i, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const titleSig = (t) =>
    normTitle(t).split(' ').filter((w) => w.length > 3).sort().slice(0, 6).join('|');

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

  const recencyTrim = (items) => {
    const now = Date.now();
    return items.filter((it, i) => i < 12 || (it.d && now - it.d < 48 * 3600 * 1000));
  };

  /* ================================================================
     3 · STYLES  (popup widget — scoped, nothing leaks)
     ================================================================ */
  const CSS = `
    /* ---- launcher button (always visible, top-left) ---- */
    #ehNewsLauncher{position:fixed;top:${POP_TOP}px;left:${POP_LEFT}px;z-index:100000;
      width:46px;height:46px;border-radius:14px;cursor:pointer;padding:0;
      display:grid;place-items:center;font-size:1.25rem;color:var(--accent,#3fd2b0);
      background:var(--surface-2,rgba(20,28,38,.85));border:1px solid var(--line,rgba(148,163,184,.22));
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      box-shadow:0 8px 24px -8px rgba(0,0,0,.5);transition:transform .18s,border-color .18s,box-shadow .18s}
    #ehNewsLauncher:hover{transform:translateY(-2px);border-color:var(--accent,#3fd2b0);box-shadow:0 12px 28px -8px rgba(0,0,0,.6)}
    #ehNewsLauncher:focus-visible{outline:2px solid var(--accent,#3fd2b0);outline-offset:2px}
    #ehNewsLauncher .eh-nw-pulse{position:absolute;top:-2px;right:-2px;width:11px;height:11px;border-radius:50%;
      background:var(--accent,#3fd2b0);border:2px solid var(--bg,#0d1420);opacity:0;pointer-events:none}
    #ehNewsLauncher .eh-nw-pulse.on{opacity:1;animation:ehNwPulse 2s ease-out infinite}
    @keyframes ehNwPulse{0%{box-shadow:0 0 0 0 rgba(63,210,176,.55)}70%{box-shadow:0 0 0 9px rgba(63,210,176,0)}100%{box-shadow:0 0 0 0 rgba(63,210,176,0)}}

    /* ---- popup panel ---- */
    #ehNewsCard{position:fixed;top:${POP_TOP + 54}px;left:${POP_LEFT}px;z-index:99999;
      width:min(${POP_WIDTH}px,calc(100vw - 24px));max-height:min(${POP_MAXH}px,calc(100vh - ${POP_TOP + 66}px));
      display:none;flex-direction:column;overflow:hidden;
      border-radius:18px;border:1px solid var(--line,rgba(148,163,184,.2));
      background:var(--bg-2,#111823);color:var(--ink,#edf2f7);
      box-shadow:0 24px 64px -16px rgba(0,0,0,.65);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
    #ehNewsCard.open{display:flex;animation:ehNwPop .22s cubic-bezier(.22,.61,.36,1)}
    @keyframes ehNwPop{from{opacity:0;transform:translateY(-8px) scale(.98)}}
    #ehNewsCard::before{content:'';position:absolute;top:-7px;left:16px;width:14px;height:14px;
      transform:rotate(45deg);background:inherit;border-left:1px solid var(--line,rgba(148,163,184,.2));
      border-top:1px solid var(--line,rgba(148,163,184,.2));border-radius:3px 0 0 0}

    /* ---- panel header (fixed inside panel) ---- */
    #ehNewsCard .eh-nw-head{flex:none;display:flex;align-items:center;gap:.55rem;
      padding:.7rem .8rem .7rem .95rem;border-bottom:1px solid var(--line,rgba(148,163,184,.14))}
    #ehNewsCard .eh-nw-title{display:flex;align-items:center;gap:.45rem;font:700 .88rem/1 var(--font,inherit);color:var(--ink,#edf2f7)}
    #ehNewsCard .eh-nw-title i{color:var(--accent,#3fd2b0)}
    #ehNewsCard #ehNewsMeta{margin-left:auto;font:600 .66rem var(--mono,monospace);color:var(--faint,#7a8a9e);white-space:nowrap}
    #ehNewsCard .eh-nw-iconbtn{flex:none;background:transparent;border:1px solid var(--line,rgba(148,163,184,.2));
      color:var(--muted,#8d9aa9);width:28px;height:28px;border-radius:8px;cursor:pointer;
      display:grid;place-items:center;font-size:.8rem;transition:color .15s,border-color .15s}
    #ehNewsCard .eh-nw-iconbtn:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}
    #ehNewsCard .eh-nw-iconbtn:focus-visible{outline:2px solid var(--accent,#3fd2b0);outline-offset:2px}
    #ehNewsCard #ehNewsRefresh.spin i{animation:ehNwSpin .8s linear infinite}
    @keyframes ehNwSpin{to{transform:rotate(360deg)}}

    /* ---- scrollable body ---- */
    #ehNewsCard .eh-nw-scroll{overflow-y:auto;overscroll-behavior:contain;padding:.75rem .8rem .9rem}
    #ehNewsCard .eh-nw-scroll::-webkit-scrollbar{width:8px}
    #ehNewsCard .eh-nw-scroll::-webkit-scrollbar-thumb{background:var(--line,rgba(148,163,184,.25));border-radius:8px}

    /* ---- tabs ---- */
    #ehNewsCard .eh-nw-tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.75rem}
    #ehNewsCard .eh-nw-tab{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));
      color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.28rem .8rem;
      font:600 .72rem var(--font,inherit);cursor:pointer;
      transition:color .18s,border-color .18s,background .18s}
    #ehNewsCard .eh-nw-tab:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}
    #ehNewsCard .eh-nw-tab.on{background:var(--accent-soft,rgba(63,210,176,.12));border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}
    #ehNewsCard .eh-nw-tab:focus-visible{outline:2px solid var(--accent,#3fd2b0);outline-offset:2px}

    /* ---- batch nav ---- */
    #ehNewsCard .eh-nw-batches{display:flex;align-items:center;gap:.4rem;margin-bottom:.75rem}
    #ehNewsCard .eh-nw-nav{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,rgba(148,163,184,.14));
      color:var(--muted,#8d9aa9);border-radius:var(--r-pill,999px);padding:.28rem .8rem;
      font:600 .7rem var(--font,inherit);cursor:pointer;transition:color .18s,border-color .18s}
    #ehNewsCard .eh-nw-nav:hover:not(:disabled){border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}
    #ehNewsCard .eh-nw-nav:disabled{opacity:.35;cursor:not-allowed}
    #ehNewsCard .eh-nw-blabel{flex:1;text-align:center;font:700 .66rem var(--font,inherit);
      text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#8d9aa9);
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    /* ---- grid: 2 compact columns inside the popup ---- */
    #ehNewsCard #ehNewsGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem}
    @media (max-width:420px){#ehNewsCard #ehNewsGrid{grid-template-columns:1fr}}

    /* ---- cards ---- */
    #ehNewsCard .eh-nw-card{position:relative;display:flex;flex-direction:column;
      background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.13));
      border-radius:13px;overflow:hidden;text-decoration:none;
      transition:border-color .18s,transform .18s;animation:ehNwIn .4s cubic-bezier(.22,.61,.36,1) backwards}
    #ehNewsCard .eh-nw-card:hover{border-color:var(--accent,#3fd2b0);transform:translateY(-2px)}
    @keyframes ehNwIn{from{opacity:0;transform:translateY(8px)}}
    #ehNewsCard .eh-nw-thumb{position:relative;display:block;aspect-ratio:16/9;
      background:var(--surface-3,rgba(148,163,184,.09));overflow:hidden}
    #ehNewsCard .eh-nw-thumb img{width:100%;height:100%;object-fit:cover;display:block;
      opacity:0;transform:scale(1.04);transition:opacity .4s ease,transform .5s ease}
    #ehNewsCard .eh-nw-thumb img.eh-loaded{opacity:1;transform:scale(1)}
    #ehNewsCard .eh-nw-fb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font:700 1.3rem var(--display,serif);color:var(--muted,#8d9aa9);
      background:radial-gradient(circle at 30% 25%,var(--surface-3,rgba(148,163,184,.14)),transparent 72%)}

    /* ---- hero card ---- */
    #ehNewsCard .eh-nw-card.eh-hero{grid-column:1/-1;background:var(--surface-3,rgba(148,163,184,.08))}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-thumb{aspect-ratio:16/8}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-thumb::after{content:'';position:absolute;inset:0;
      background:linear-gradient(180deg,rgba(5,10,18,0) 35%,rgba(5,10,18,.85) 100%)}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-body{position:absolute;left:0;right:0;bottom:0;z-index:2;
      padding:.7rem .85rem .8rem;gap:.25rem}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-t{font-size:.9rem;line-height:1.35;color:#fff;-webkit-line-clamp:2}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-src{color:rgba(255,255,255,.85)}
    #ehNewsCard .eh-nw-card.eh-hero .eh-nw-src em{color:rgba(255,255,255,.6)}
    #ehNewsCard .eh-nw-chip{position:absolute;top:.55rem;left:.55rem;z-index:2;display:inline-flex;align-items:center;gap:.25rem;
      background:rgba(5,10,18,.55);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(6px);
      color:#fff;border-radius:var(--r-pill,999px);padding:.2rem .55rem;
      font:700 .56rem/1 var(--font,inherit);text-transform:uppercase;letter-spacing:.08em}
    #ehNewsCard .eh-nw-chip i{font-size:.65rem;color:var(--accent,#3fd2b0)}

    /* ---- card body ---- */
    #ehNewsCard .eh-nw-body{display:flex;flex-direction:column;gap:.4rem;padding:.6rem .7rem .7rem;flex:1}
    #ehNewsCard .eh-nw-src{display:flex;align-items:center;gap:.35rem;min-width:0;
      font:700 .6rem/1.2 var(--font,inherit);text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#8d9aa9)}
    #ehNewsCard .eh-nw-fav{width:14px;height:14px;border-radius:4px;flex:none;object-fit:cover;
      background:var(--surface-3,rgba(148,163,184,.14))}
    #ehNewsCard .eh-nw-dot{width:6px;height:6px;border-radius:50%;flex:none}
    #ehNewsCard .eh-nw-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ehNewsCard .eh-nw-src em{font-style:normal;flex:none;font:600 .6rem var(--mono,monospace);
      text-transform:none;letter-spacing:0;color:var(--faint,#7a8a9e)}
    #ehNewsCard .eh-nw-t{font:600 .78rem/1.4 var(--font,inherit);color:var(--ink,#edf2f7);
      display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

    /* ---- skeleton ---- */
    #ehNewsCard .eh-nw-skel{border-radius:13px;border:1px solid var(--line,rgba(148,163,184,.1));overflow:hidden}
    #ehNewsCard .eh-nw-skel i{display:block;aspect-ratio:16/9;
      background:linear-gradient(100deg,rgba(148,163,184,.06) 40%,rgba(148,163,184,.14) 50%,rgba(148,163,184,.06) 60%);
      background-size:200% 100%;animation:ehNwSh 1.1s linear infinite}
    #ehNewsCard .eh-nw-skel b{display:block;height:.6rem;margin:.55rem .65rem;border-radius:5px;
      background:linear-gradient(100deg,rgba(148,163,184,.07) 40%,rgba(148,163,184,.15) 50%,rgba(148,163,184,.07) 60%);
      background-size:200% 100%;animation:ehNwSh 1.1s linear infinite}
    #ehNewsCard .eh-nw-skel b+i{height:.6rem;margin:0 .65rem .7rem;width:55%}
    @keyframes ehNwSh{to{background-position:-200% 0}}

    /* ---- messages ---- */
    #ehNewsCard .eh-nw-msg{grid-column:1/-1;border:1px dashed var(--line-2,rgba(148,163,184,.25));
      border-radius:12px;padding:1.1rem;text-align:center;color:var(--muted,#8d9aa9);font-size:.78rem;line-height:1.6}
    #ehNewsCard .eh-nw-msg button{margin-left:.4rem;background:transparent;border:1px solid var(--accent,#3fd2b0);
      color:var(--accent,#3fd2b0);border-radius:8px;padding:.25rem .7rem;
      font:600 .72rem var(--font,inherit);cursor:pointer}
    #ehNewsCard .eh-nw-msg button:hover{background:var(--accent-soft,rgba(63,210,176,.12))}
  `;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ================================================================
     4 · FETCH LAYER  (unchanged)
     ================================================================ */
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
     5 · NATIVE SOURCES  (unchanged, incl. sports ESPN chain)
     ================================================================ */
  function wikiITN() {
    const tryDay = (i) => {
      if (i > 5) return Promise.resolve([]);
      return fetchT('https://api.wikimedia.org/feed/v1/wikipedia/en/featured/' + utcDay(i), NATIVE_MS)
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

  function gdeltUrl(query) {
    return 'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
      encodeURIComponent(query + ' sourcelang:english') +
      '&mode=artlist&maxrecords=30&format=json&sort=datedesc';
  }

  function gdelt(query) {
    return fetchT(gdeltUrl(query), 9000).then((x) => {
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

  const ESPN_FEEDS = [
    ['news',                'ESPN'],
    ['soccer/eng.1/news',   'ESPN FC'],
    ['basketball/nba/news', 'ESPN NBA'],
    ['football/nfl/news',   'ESPN NFL'],
    ['cricket/news',        'ESPN Cricket'],
  ];

  function espnNews(path, label) {
    return fetchT('https://site.api.espn.com/apis/site/v2/sports/' + path, NATIVE_MS)
      .then((x) => {
        const j = JSON.parse(x), out = [];
        ((j && j.articles) || []).forEach((a) => {
          const link = a && a.links && a.links.web && a.links.web.href;
          if (!a || !a.headline || !link || out.length >= 15) return;
          const img = (a.images && a.images.length && a.images[0] && a.images[0].url) || '';
          out.push({
            t: String(a.headline).slice(0, 200), l: link, s: label || 'ESPN',
            d: Date.parse(a.published || a.lastModified) || 0, img: img,
          });
        });
        return out;
      });
  }

  function espnChain() {
    return Promise.all(ESPN_FEEDS.map(([p, lbl]) => espnNews(p, lbl).catch(() => [])))
      .then((res) => mix.apply(null, res));
  }

  const mix = function () {
    const out = [];
    for (let i = 0; i < arguments.length; i++)
      ((arguments[i] && Array.isArray(arguments[i])) ? arguments[i] : []).forEach((it) => {
        if (out.length < 40) out.push(it);
      });
    return out;
  };

  const NATIVE_PINGS = {
    world:   [['wikipedia', 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/' + utcDay(0)]],
    tech:    [['hn', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20'],
              ['dev.to', 'https://dev.to/api/articles?per_page=20&top=7']],
    science: [['spaceflight', 'https://api.spaceflightnewsapi.net/v4/articles/?limit=20']],
    sports:  ESPN_FEEDS.map(([p, l]) => ['espn ' + l, 'https://site.api.espn.com/apis/site/v2/sports/' + p])
              .concat([['gdelt', gdeltUrl('(football OR soccer OR cricket OR tennis)')]]),
  };

  /* ================================================================
     6 · PER-CATEGORY DEEP BUILDS  (unchanged)
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
        espnChain().catch(() => []),
        gdelt('(football OR soccer OR cricket OR tennis)').catch(() => []),
      ]).then((r) => mix(r[0], r[1])),
  };

  function buildPool(cat) {
    const conf = FEEDS[cat];
    const jobs = conf.feeds.map((f) =>
      fetchFeed(f.u, f.s).catch((e) => { console.warn('[News]', f.s, e && e.message); return []; }));
    const extra = (EXTRA[cat] ? EXTRA[cat]() : Promise.resolve([])).catch(() => []);
    return Promise.all(jobs.concat([extra])).then((arrs) => {
      const merged = recencyTrim(dedupeAll(arrs).sort(byDate));
      if (merged.length >= 15) return merged;
      return Promise.all([
        gdelt(FALLBACK_QUERIES[cat]).catch(() => []),
        (cat === 'sports' ? espnChain() : Promise.resolve([])).catch(() => []),
      ]).then((r) => recencyTrim(dedupeAll([merged, r[0], r[1]]).sort(byDate)));
    });
  }

  /* ================================================================
     7 · CACHE MODEL  (unchanged)
     ================================================================ */
  function staleEntry(cat) {
    const c = loadCache();
    return (c[cat] && c[cat].batches && c[cat].batches.length) ? c[cat] : null;
  }

  const inFlight = {};
  function ensureEntry(cat, force) {
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
     8 · UI RENDERING  (same logic, popup-aware)
     ================================================================ */
  let curTab = null, busy = false, isOpen = false, seenTs = 0;

  const skeleton = () => {
    let h = '';
    for (let i = 0; i < 6; i++) h += '<div class="eh-nw-skel"><i></i><b></b><i></i></div>';
    return h;
  };

  function cardsHTML(items, cat) {
    const hue = HUE[cat] || 'var(--accent,#3fd2b0)';
    return items.map((it, i) => {
      const hero = i === 0 && !!it.img;
      const delay = Math.min(i, 8) * 35;
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

  /* ---- popup open/close ---- */
  function setOpen(open) {
    isOpen = open;
    const card = el('ehNewsCard'), pulse = el('ehNewsPulse');
    if (card) {
      card.classList.toggle('open', open);
      card.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (pulse) pulse.classList.toggle('on', !open && !!freshBadge());
    if (open) {
      seenTs = Date.now();
      try { localStorage.setItem('studyHubNewsSeen', String(seenTs)); } catch (e) {}
      if (curTab) goto(curTab, false);
      const closeBtn = el('ehNewsClose');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    }
  }

  const freshBadge = () => {
    const c = loadCache();
    let newest = 0;
    Object.keys(c).forEach((k) => { if (c[k] && c[k].ts > newest) newest = c[k].ts; });
    return newest > seenTs ? newest : 0;
  };

  /* ================================================================
     9 · NAVIGATION  (unchanged)
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
    if (curTab === cat && isOpen) render(cat, e);
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
    Promise.all([
      gdelt(FALLBACK_QUERIES[cat]).catch(() => []),
      (cat === 'sports' ? espnChain() : Promise.resolve([])).catch(() => []),
    ]).then((res) => {
      clearTimeout(wd);
      c = loadCache(); e = c[cat] || e;
      const more = (res[0] || []).concat(res[1] || []);
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
        if (curTab === cat && isOpen) { render(cat, e); setMeta('Encore — fresh ' + cat + ' stories exhausted'); }
      }
    }).catch(() => { clearTimeout(wd); busy = false; spin(false); });
  }

  function goto(cat, force) {
    curTab = cat;
    try { localStorage.setItem(TAB_KEY, cat); } catch (e) {}
    document.querySelectorAll('.eh-nw-tab').forEach((b) => {
      const on = b.dataset.cat === cat;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (!isOpen) return;               /* popup closed → data still warms via ensureEntry below */

    const c = loadCache();
    const e = (c[cat] && c[cat].date === today() && c[cat].batches && c[cat].batches.length) ? c[cat] : null;
    if (e && !force) { busy = false; spin(false); render(cat, e); return; }

    const grid = el('ehNewsGrid');
    if (e) render(cat, e);
    else if (grid) grid.innerHTML = skeleton();

    busy = true; spin(true);
    const wd = setTimeout(() => {
      if (curTab !== cat || !isOpen) return;
      busy = false; spin(false);
      const cur = loadCache()[cat];
      if (cur && cur.batches && cur.batches.length) render(cat, cur);
      else if (!e) renderMsg();
    }, WATCHDOG_MS);

    ensureEntry(cat, force).then((ne) => {
      clearTimeout(wd);
      if (curTab !== cat || !isOpen) return;
      busy = false; spin(false);
      if (ne) render(cat, ne);
      else if (!e) renderMsg();
    }).catch((err) => {
      console.warn('[News] build failed:', cat, err && err.message);
      clearTimeout(wd);
      if (curTab !== cat || !isOpen) return;
      busy = false; spin(false);
      if (!e) renderMsg();
    });
  }

  /* ================================================================
     10 · BUILD + BOOT  — popup widget appended to <body>
     ================================================================ */
  function build() {
    if (el('ehNewsCard')) return true;

    /* launcher */
    const launch = document.createElement('button');
    launch.id = 'ehNewsLauncher';
    launch.type = 'button';
    launch.title = 'Daily Briefing';
    launch.setAttribute('aria-label', 'Open Daily Briefing');
    launch.setAttribute('aria-expanded', 'false');
    launch.innerHTML = '<i class="ph ph-newspaper" aria-hidden="true"></i>' +
                       '<span class="eh-nw-pulse" id="ehNewsPulse"></span>';

    /* popup panel */
    const sec = document.createElement('section');
    sec.id = 'ehNewsCard';
    sec.setAttribute('role', 'dialog');
    sec.setAttribute('aria-label', 'Daily Briefing');
    sec.setAttribute('aria-hidden', 'true');
    sec.innerHTML =
      '<div class="eh-nw-head">' +
        '<span class="eh-nw-title"><i class="ph ph-newspaper" aria-hidden="true"></i>Daily Briefing</span>' +
        '<span id="ehNewsMeta"></span>' +
        '<button class="eh-nw-iconbtn" id="ehNewsRefresh" title="Refresh" aria-label="Refresh briefing"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i></button>' +
        '<button class="eh-nw-iconbtn" id="ehNewsClose" title="Close" aria-label="Close briefing"><i class="ph ph-x" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="eh-nw-scroll">' +
        '<div class="eh-nw-tabs" id="ehNewsTabs" role="tablist"></div>' +
        '<div class="eh-nw-batches">' +
          '<button class="eh-nw-nav" id="ehPrevBtn" type="button">‹ Prev</button>' +
          '<span class="eh-nw-blabel" id="ehBatchLabel">Top stories</span>' +
          '<button class="eh-nw-nav" id="ehNextBtn" type="button">Next ›</button>' +
        '</div>' +
        '<div id="ehNewsGrid" aria-live="polite"></div>' +
      '</div>';

    document.body.appendChild(launch);
    document.body.appendChild(sec);

    /* tabs */
    const tabs = sec.querySelector('#ehNewsTabs');
    Object.keys(FEEDS).forEach((c) => {
      const b = document.createElement('button');
      b.className = 'eh-nw-tab'; b.type = 'button'; b.dataset.cat = c;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', 'false');
      b.textContent = FEEDS[c].icon + ' ' + FEEDS[c].label;
      b.addEventListener('click', () => goto(c, false));
      tabs.appendChild(b);
    });

    /* wiring */
    launch.addEventListener('click', () => {
      setOpen(!isOpen);
      launch.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    el('ehNewsClose').addEventListener('click', () => setOpen(false));
    el('ehNewsRefresh').addEventListener('click', () => { if (curTab) goto(curTab, true); });
    el('ehPrevBtn').addEventListener('click', () => { if (curTab) prevBatch(curTab); });
    el('ehNextBtn').addEventListener('click', () => { if (curTab) nextBatch(curTab); });

    /* close on Esc + outside click */
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && isOpen) setOpen(false);
    });
    document.addEventListener('click', (ev) => {
      if (!isOpen) return;
      if (ev.target.closest && (ev.target.closest('#ehNewsCard') || ev.target.closest('#ehNewsLauncher'))) return;
      setOpen(false);
    });
    document.addEventListener('click', (ev) => {
      if (ev.target.closest && ev.target.closest('[data-ehnw-retry]') && curTab) goto(curTab, true);
    });

    /* restore seen-timestamp for the badge */
    try { seenTs = parseInt(localStorage.getItem('studyHubNewsSeen') || '0', 10) || 0; } catch (e) {}

    /* warm last-used tab in background (popup starts closed) */
    let saved = 'world';
    try { saved = localStorage.getItem(TAB_KEY) || 'world'; } catch (e) {}
    curTab = FEEDS[saved] ? saved : 'world';
    ensureEntry(curTab, false);
    if (freshBadge()) {
      const p = el('ehNewsPulse');
      if (p) p.classList.add('on');
    }
    return true;
  }

  (function boot() {
    try { localStorage.removeItem('studyHubNews.v2'); } catch (e) {}
    try { localStorage.removeItem('studyHubNews.v3'); } catch (e) {}
    if (build()) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else setTimeout(build, 500);
  })();

  /* ================================================================
     11 · PUBLIC API  (+ open/close helpers)
     ================================================================ */
  console.log('[News] engine v6.2 — corner popup widget, ESPN×5 chain, triple dedup');
  window.EduNews = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    refresh: () => { if (curTab) goto(curTab, true); },
    goto: goto,
    next: () => { if (curTab) nextBatch(curTab); },
    prev: () => { if (curTab) prevBatch(curTab); },
    debug: (cat) => {
      cat = cat || curTab || 'world';
      console.group('EduNews debug · ' + cat);
      FEEDS[cat].feeds.forEach((f) => {
        RELAY_GROUPS.forEach((g) => g.forEach((r) => {
          fetchT(r.url(f.u), 8000)
            .then((x) => console.log('✅', r.name, '→', f.s, x.length + ' bytes'))
            .catch((e) => console.log('❌', r.name, '→', f.s, String(e && e.message || e)));
        }));
      });
      (NATIVE_PINGS[cat] || []).forEach(([name, url]) => {
        fetchT(url, 8000)
          .then((x) => console.log('✅', name, '→ native', x.length + ' bytes'))
          .catch((e) => console.log('❌', name, '→ native', String(e && e.message || e)));
      });
      console.groupEnd();
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
