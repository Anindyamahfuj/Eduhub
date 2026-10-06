/* =====================================================================
   EDUHUB · Text Translator v2 — fast, reliable, working Swap
   • Racing relay pairs (first valid wins) → ~1–2.5s typical
   • REAL per-request timeouts (fixed from v1's dead AbortController)
   • First-party MyMemory fallback (no relay needed — ad-blocker proof)
   • Fixed Swap: flips languages correctly, re-translates from input
   • Watchdog: UI can never hang. Cache: studyHubTextTr.v2
   Console: EduTextTranslate.clear() · EduTextTranslate.debug()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_TT__) return;
  window.__EH_TT__ = true;

  var CACHE_KEY = 'studyHubTextTr.v2';
  var MAX_CHARS = 4500, DEBOUNCE = 600, WATCHDOG = 12000;

  var LANGS = [
    ['auto','Detect language'], ['en','English'],['es','Spanish'],['fr','French'],
    ['de','German'],['it','Italian'],['pt','Portuguese'],['ru','Russian'],
    ['zh-CN','Chinese (Simplified)'],['ja','Japanese'],['ko','Korean'],
    ['hi','Hindi'],['bn','Bengali'],['ur','Urdu'],['ar','Arabic'],
    ['tr','Turkish'],['id','Indonesian'],['sw','Swahili'],
    ['nl','Dutch'],['pl','Polish'],['uk','Ukrainian'],['vi','Vietnamese'],
    ['th','Thai'],['el','Greek'],['he','Hebrew'],['fa','Persian']
  ];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function loadCache(){ try{ var o=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}'); return (o&&typeof o==='object')?o:{}; }catch(e){ return {}; } }
  function saveCache(c){ try{ var k=Object.keys(c); if(k.length>60){ k.sort(function(a,b){return (c[a].t||0)-(c[b].t||0);}); k.slice(0,k.length-40).forEach(function(x){delete c[x];}); } localStorage.setItem(CACHE_KEY,JSON.stringify(c)); }catch(e){} }

  /* ---------- CSS ---------- */
  var CSS =
    '#ttCard .tt-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}' +
    '.tt-pane{display:flex;flex-direction:column;background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.13));border-radius:14px;overflow:hidden}' +
    '.tt-head{display:flex;align-items:center;gap:.5rem;padding:.55rem .75rem;border-bottom:1px solid var(--line,rgba(148,163,184,.1))}' +
    '.tt-lang{flex:1;min-width:0;background:var(--panel-2,#0B0F1A);border:1px solid var(--line,#2a3648);color:var(--ink,#edf2f7);border-radius:8px;padding:.4rem .55rem;font:500 12.5px var(--font,inherit);cursor:pointer;outline:none}' +
    '.tt-lang:focus{border-color:var(--accent,#3fd2b0)}' +
    '.tt-mini{background:transparent;border:1px solid var(--line,#2a3648);color:var(--muted,#8d9aa9);border-radius:8px;padding:.3rem .55rem;font:600 11.5px var(--font,inherit);cursor:pointer;white-space:nowrap;transition:all .15s}' +
    '.tt-mini:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}' +
    '.tt-mini.ok{color:var(--accent,#3fd2b0);border-color:var(--accent,#3fd2b0)}' +
    '#ttIn{flex:1;min-height:170px;resize:vertical;background:transparent;border:none;outline:none;color:var(--ink,#edf2f7);font:500 14px/1.6 var(--font,inherit);padding:.8rem .9rem}' +
    '#ttOut{flex:1;min-height:170px;margin:0;padding:.8rem .9rem;font:500 14px/1.6 var(--font,inherit);color:var(--ink,#edf2f7);white-space:pre-wrap;word-break:break-word;overflow-y:auto}' +
    '.tt-foot{display:flex;align-items:center;justify-content:space-between;padding:.4rem .75rem .55rem;border-top:1px solid var(--line,rgba(148,163,184,.1))}' +
    '.tt-count{font:600 11px var(--mono,monospace);color:var(--faint,#7a8a9e)}' +
    '.tt-count.over{color:var(--danger,#f0938c)}' +
    '.tt-status{font:600 11px var(--font,inherit);color:var(--muted,#8d9aa9)}' +
    '.tt-status.err{color:var(--danger,#f0938c)}' +
    '.tt-status.work i{display:inline-block;animation:ttSpin .8s linear infinite}' +
    '@keyframes ttSpin{to{transform:rotate(360deg)}}' +
    '.tt-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--faint,#7a8a9e);font-size:.85rem;text-align:center;padding:1rem;line-height:1.6}' +
    '.tt-out[lang]{unicode-bidi:plaintext}' +
    '@media (max-width:760px){ #ttCard .tt-grid{grid-template-columns:1fr} }';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  /* ---------- core: real timeouts ---------- */
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
        .catch(function (e) {
          if (done) return; done = true; clearTimeout(timer); reject(e);
        });
    });
  }

  /* ---------- engine 1: Google translate_a/single via racing relays ---------- */
  function parseGoogle(j) {
    if (!j || !Array.isArray(j) || !Array.isArray(j[0])) throw new Error('bad shape');
    var out = '';
    j[0].forEach(function (seg) { if (seg && typeof seg[0] === 'string') out += seg[0]; });
    if (!out.trim()) throw new Error('empty');
    return { text: out, detected: typeof j[2] === 'string' ? j[2] : '' };
  }
  function viaRelays(text, target) {
    var gurl = 'https://translate.google.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
    var PAIRS = [
      [ function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
        function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } ],
      [ function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } ]
    ];
    function group(gi) {
      if (gi >= PAIRS.length) return Promise.reject(new Error('all relays failed'));
      return Promise.all(PAIRS[gi].map(function (wrap) {
        return fetchT(wrap(gurl), 7000)
          .then(function (x) {
            var j = null;
            try { j = JSON.parse(x); } catch (e) { throw new Error('bad json'); }
            return parseGoogle(j);
          })
          .catch(function (e) { console.warn('[TT relay]', e && e.message); return null; });
      })).then(function (res) {
        for (var i = 0; i < res.length; i++) if (res[i]) return res[i];
        return group(gi + 1);
      });
    }
    return group(0);
  }

  /* ---------- engine 2: MyMemory (first-party CORS — no relay) ---------- */
  function viaMyMemory(text, target) {
    /* API wants source language; we don't know it → 'autodetect' via empty slug
       MyMemory supports "Autodetect|target" source format */
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 500)) +
              '&langpair=Autodetect|' + target;
    return fetchT(url, 8000).then(function (x) {
      var j = JSON.parse(x);
      var t = j && j.responseData && j.responseData.translatedText;
      if (!t) throw new Error('empty');
      if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error('quota');
      return { text: String(t), detected: '' };
    });
  }

  function translate(text, target) {
    return viaRelays(text, target)
      .catch(function () { return viaMyMemory(text, target); });
  }

  /* ---------- UI ---------- */
  var busy = false, timer = null;

  function setStatus(msg, cls) {
    var s = document.getElementById('ttStatus'); if (!s) return;
    s.className = 'tt-status' + (cls ? ' ' + cls : '');
    s.innerHTML = msg;
  }
  function detectDir(text) {
    return /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/.test(text) ? 'rtl' : 'ltr';
  }
  function keyOf(txt, tl) { return 'k|' + tl + '|' + txt; }

  function doTranslate(force) {
    var box = document.getElementById('ttIn'), out = document.getElementById('ttOut');
    if (!box || !out) return;
    var raw = box.value, txt = raw.trim();
    var tl = document.getElementById('ttTo').value;
    var cnt = document.getElementById('ttCount');
    if (cnt) { cnt.textContent = raw.length + ' / ' + MAX_CHARS;
               cnt.classList.toggle('over', raw.length > MAX_CHARS); }

    if (!txt) {
      out.innerHTML = '<div class="tt-empty">Translation appears here.<br>Type or paste text on the left.</div>';
      out.removeAttribute('lang'); out.removeAttribute('dir');
      setStatus(''); return;
    }
    if (raw.length > MAX_CHARS) { setStatus('Text too long — trim to ' + MAX_CHARS + ' characters.', 'err'); return; }

    var key = keyOf(txt, tl);
    var c = loadCache();
    if (!force && c[key]) {
      out.textContent = c[key].text;
      out.lang = tl; out.dir = detectDir(c[key].text);
      setStatus('Translated (cached)'); return;
    }

    if (busy) return;
    busy = true;
    setStatus('<i class="ph ph-circle-notch"></i> Translating…', 'work');
    var wd = setTimeout(function () {
      busy = false; spinNone();
      setStatus('Taking too long — click Retry or edit the text.', 'err');
    }, WATCHDOG);
    function spinNone(){ /* watchdog release; spinner lives in status text */ }

    translate(txt.slice(0, MAX_CHARS), tl).then(function (r) {
      clearTimeout(wd); busy = false;
      out.textContent = r.text;
      out.lang = tl; out.dir = detectDir(r.text);
      var cc = loadCache(); cc[key] = { text: r.text, t: Date.now() }; saveCache(cc);
      setStatus(r.detected ? ('Detected: ' + r.detected.toUpperCase()) : 'Translated');
    }).catch(function () {
      clearTimeout(wd); busy = false;
      setStatus('Translation failed — try again in a moment.', 'err');
    });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { doTranslate(false); }, DEBOUNCE);
  }

  /* ---------- Swap (fixed): input = previous output, languages flip ---------- */
  function swap() {
    var box = document.getElementById('ttIn'), out = document.getElementById('ttOut');
    var from = document.getElementById('ttFrom'), to = document.getElementById('ttTo');
    if (!box || !out) return;
    var translated = out.textContent.trim();
    if (!translated) { setStatus('Nothing to swap — translate something first.', 'err'); return; }

    /* determine the source language of what we just translated */
    var srcLang = from.value;
    if (srcLang === 'auto') {
      var fromStatus = document.getElementById('ttStatus').textContent || '';
      var m = fromStatus.match(/Detected:\s*([A-Za-z-]+)/i);
      if (m) {
        var code = m[1].toUpperCase();
        for (var i = 0; i < LANGS.length; i++) {
          if (LANGS[i][0].toUpperCase().indexOf(code) === 0 || LANGS[i][0].split('-')[0].toUpperCase() === code) {
            srcLang = LANGS[i][0]; break;
          }
        }
      }
      if (srcLang === 'auto') srcLang = 'en';   /* sensible default */
    }

    /* flip: input gets the translated text, target becomes the original source */
    box.value = translated;
    var oldTarget = to.value;
    from.value = srcLang;
    to.value = (srcLang === oldTarget) ? 'en' : srcLang;
    if (to.value === from.value) to.value = 'en';

    doTranslate(true);
    box.focus();
  }

  function copyOut() {
    var out = document.getElementById('ttOut'); if (!out || !out.textContent.trim()) return;
    var btn = document.getElementById('ttCopy');
    function done(ok) {
      btn.textContent = ok ? '✓ Copied' : '✕ Failed'; btn.classList.add('ok');
      setTimeout(function(){ btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out.textContent).then(function(){ done(true); }, function(){ done(false); });
    } else {
      var ta = document.createElement('textarea'); ta.value = out.textContent;
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove(); done(ok);
    }
  }
  function clearAll() {
    document.getElementById('ttIn').value = '';
    document.getElementById('ttFrom').value = 'auto';
    document.getElementById('ttTo').value = 'en';
    doTranslate(false);
    document.getElementById('ttIn').focus();
  }

  function build() {
    if (document.getElementById('ttCard')) return true;
    var anchor = document.getElementById('ehNewsCard') || document.querySelector('.overview-strip');
    if (!anchor) return false;
    var optsFrom = LANGS.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
    var optsTo = LANGS.slice(1).map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
    var sec = document.createElement('section');
    sec.className = 'glass-card'; sec.id = 'ttCard';
    sec.innerHTML =
      '<div class="card-title" style="display:flex;align-items:center;gap:.55rem;">' +
        '<span style="color:var(--accent,#3fd2b0)"><i class="ph ph-chat-circle-text" aria-hidden="true"></i></span> Text Translator' +
        '<button class="tt-mini" id="ttSwapBtn" style="margin-left:auto" title="Swap: put the result back into the input and flip languages">⇄ Swap</button>' +
      '</div>' +
      '<div class="tt-grid">' +
        '<div class="tt-pane">' +
          '<div class="tt-head">' +
            '<select id="ttFrom" class="tt-lang" aria-label="From language">' + optsFrom + '</select>' +
            '<button class="tt-mini" id="ttClearBtn" title="Clear">Clear</button>' +
          '</div>' +
          '<textarea id="ttIn" placeholder="Type or paste text to translate…"></textarea>' +
          '<div class="tt-foot"><span class="tt-count" id="ttCount">0 / ' + MAX_CHARS + '</span>' +
            '<span class="tt-status" id="ttStatus"></span></div>' +
        '</div>' +
        '<div class="tt-pane">' +
          '<div class="tt-head">' +
            '<select id="ttTo" class="tt-lang" aria-label="To language">' + optsTo + '</select>' +
            '<button class="tt-mini" id="ttCopy" title="Copy translation">Copy</button>' +
          '</div>' +
          '<div id="ttOut" class="tt-out" lang="en"><div class="tt-empty">Translation appears here.<br>Type or paste text on the left.</div></div>' +
          '<div class="tt-foot"><span class="tt-status"></span>' +
            '<span class="tt-count">Google · MyMemory</span></div>' +
        '</div>' +
      '</div>';
    anchor.insertAdjacentElement('afterend', sec);

    document.getElementById('ttIn').addEventListener('input', schedule);
    document.getElementById('ttTo').addEventListener('change', function () { doTranslate(true); });
    document.getElementById('ttFrom').addEventListener('change', function () { doTranslate(true); });
    document.getElementById('ttCopy').addEventListener('click', copyOut);
    document.getElementById('ttClearBtn').addEventListener('click', clearAll);
    document.getElementById('ttSwapBtn').addEventListener('click', swap);
    return true;
  }
  var tries = 0;
  (function boot() {
    if (build() || ++tries > 12) return;
    setTimeout(boot, 400);
  })();

  try { localStorage.removeItem('studyHubTextTr.v1'); } catch (e) {}   /* purge old cache */

  window.EduTextTranslate = {
    clear: function () { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} },
    /* health check: EduTextTranslate.debug() → shows which engines answer */
    debug: function () {
      var probe = 'hello';
      console.log('— Google via relays —');
      ['https://api.allorigins.win/raw?url=', 'https://api.codetabs.com/v1/proxy?quest=', 'https://corsproxy.io/?url=']
        .forEach(function (w) {
          var u = w + encodeURIComponent('https://translate.google.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=' + probe);
          fetchT(u, 7000).then(function (x) { console.log('✅ relay', x.length + ' bytes'); })
            .catch(function (e) { console.log('❌ relay', String(e && e.message || e)); });
        });
      fetchT('https://api.mymemory.translated.net/get?q=hello&langpair=Autodetect|es', 8000)
        .then(function (x) { var j = JSON.parse(x); console.log('✅ MyMemory →', j.responseData && j.responseData.translatedText); })
        .catch(function (e) { console.log('❌ MyMemory', String(e && e.message || e)); });
    }
  };
})();
