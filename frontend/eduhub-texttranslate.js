/* =====================================================================
   EDUHUB · Text Translator v1 — paste text → translate (dashboard)
   • Textarea + language picker + live translate (debounced)
   • Copy result · swap languages · char counter · per-pair cache
   • Uses Google's translate_a/single endpoint via relay (keyless)
   Injects itself into the dashboard. Console: EduTextTranslate.clear()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_TT__) return;
  window.__EH_TT__ = true;

  var CACHE_KEY = 'studyHubTextTr.v1';
  var MAX_CHARS = 4500, DEBOUNCE = 700;

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
  function saveCache(c){ try{ var k=Object.keys(c); if(k.length>60){ k.sort(function(a,b){return c[a].t-c[b].t;}); k.slice(0,k.length-40).forEach(function(x){delete c[x];}); } localStorage.setItem(CACHE_KEY,JSON.stringify(c)); }catch(e){} }

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

  /* ---------- translate via Google public endpoint ---------- */
  function googleTranslate(text, target) {
    var url = 'https://translate.google.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
    /* relay chain — same proven pattern as the news widget */
    var relays = [
      function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
      function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
      function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); }
    ];
    var i = 0;
    function attempt() {
      if (i >= relays.length) return Promise.reject(new Error('all relays failed'));
      var wrap = relays[i++];
      return fetch(wrap(url), { signal: ('AbortController' in window) ? new AbortController().signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) {
          /* response shape: [[ [translated, original, ...], ... ], ...] */
          if (!j || !Array.isArray(j) || !Array.isArray(j[0])) throw new Error('bad shape');
          var out = '';
          j[0].forEach(function (seg) { if (seg && typeof seg[0] === 'string') out += seg[0]; });
          var detected = (j[2] || '');
          if (!out.trim()) throw new Error('empty');
          return { text: out, detected: detected };
        })
        .catch(function (e) { return attempt(); });
    }
    return attempt();
  }

  /* ---------- UI ---------- */
  var busy = false, timer = null, lastKey = '';

  function setStatus(msg, cls) {
    var s = document.getElementById('ttStatus'); if (!s) return;
    s.className = 'tt-status' + (cls ? ' ' + cls : '');
    s.innerHTML = msg;
  }
  function currentKey() {
    var txt = document.getElementById('ttIn').value;
    var tl = document.getElementById('ttTo').value;
    return txt ? 'k|' + tl + '|' + txt : '';
  }
  function detectDir(text) {
    return /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F]/.test(text) ? 'rtl' : 'ltr';
  }
  function doTranslate(force) {
    var box = document.getElementById('ttIn'), out = document.getElementById('ttOut');
    if (!box || !out) return;
    var txt = box.value.trim();
    var tl = document.getElementById('ttTo').value;
    var cnt = document.getElementById('ttCount');
    if (cnt) { cnt.textContent = box.value.length + ' / ' + MAX_CHARS;
               cnt.classList.toggle('over', box.value.length > MAX_CHARS); }
    if (!txt) { out.innerHTML = '<div class="tt-empty">Translation appears here.<br>Type or paste text on the left.</div>';
                out.removeAttribute('lang'); out.removeAttribute('dir'); setStatus(''); lastKey=''; return; }
    if (box.value.length > MAX_CHARS) { setStatus('Text too long — trim to ' + MAX_CHARS + ' characters.', 'err'); return; }
    var key = currentKey();
    var c = loadCache();
    if (!force && c[key]) {
      out.textContent = c[key].text;
      out.lang = tl === 'auto' ? (c[key].detected || 'en') : tl;
      out.dir = detectDir(out.textContent);
      setStatus('Translated (cached)'); lastKey = key; return;
    }
    if (busy && !force) return;
    busy = true;
    setStatus('<i class="ph ph-circle-notch"></i> Translating…', 'work');
    googleTranslate(txt.slice(0, MAX_CHARS), tl === 'auto' ? 'en' : tl).then(function (r) {
      out.textContent = r.text;
      out.lang = tl === 'auto' ? (r.detected || 'en') : tl;
      out.dir = detectDir(out.textContent);
      var cc = loadCache(); cc[key] = { text: r.text, detected: r.detected, t: Date.now() }; saveCache(cc);
      setStatus(r.detected ? ('Detected: ' + r.detected.toUpperCase()) : 'Translated');
      lastKey = key;
    }).catch(function () {
      setStatus('Translation failed — try again in a moment.', 'err');
    }).then(function () { busy = false; });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { doTranslate(false); }, DEBOUNCE);
  }
  function swap() {
    var from = document.getElementById('ttFrom'), to = document.getElementById('ttTo');
    var out = document.getElementById('ttOut'), box = document.getElementById('ttIn');
    var t = out.textContent;
    if (!t) return;
    /* put the translated text into the input, flip the languages */
    var detected = (out.getAttribute('lang') || 'en').slice(0,2);
    var hasFrom = false;
    for (var i = 0; i < from.options.length; i++) if (from.options[i].value === detected) { hasFrom = true; break; }
    from.value = hasFrom ? detected : 'auto';
    var oldTo = to.value;
    to.value = (from.value === oldTo) ? from.value : oldTo;
    if (to.value === 'auto') to.value = 'en';
    box.value = t;
    doTranslate(true);
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
    var opts = LANGS.map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
    var optsTo = LANGS.slice(1).map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('');
    var sec = document.createElement('section');
    sec.className = 'glass-card'; sec.id = 'ttCard';
    sec.innerHTML =
      '<div class="card-title" style="display:flex;align-items:center;gap:.55rem;">' +
        '<span style="color:var(--accent,#3fd2b0)"><i class="ph ph-chat-circle-text" aria-hidden="true"></i></span> Text Translator' +
        '<span class="tt-mini" id="ttSwapBtn" style="margin-left:auto" title="Swap: put the result back into the input">⇄ Swap</span>' +
      '</div>' +
      '<div class="tt-grid">' +
        '<div class="tt-pane">' +
          '<div class="tt-head">' +
            '<select id="ttFrom" class="tt-lang" aria-label="From language">' +
              '<option value="auto" selected>Detect language</option>' +
              LANGS.slice(1).map(function (l) { return '<option value="' + l[0] + '">' + esc(l[1]) + '</option>'; }).join('') +
            '</select>' +
            '<button class="tt-mini" id="ttClearBtn" title="Clear">Clear</button>' +
          '</div>' +
          '<textarea id="ttIn" maxlength="' + (MAX_CHARS + 200) + '" placeholder="Type or paste text to translate…"></textarea>' +
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
            '<span class="tt-count">Google Translate</span></div>' +
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

  window.EduTextTranslate = { clear: function () { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} } };
})();
