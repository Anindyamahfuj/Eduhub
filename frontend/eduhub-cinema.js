/* =====================================================================
   EDUHUB · CINEMA LAYER v1 — ambient depth + interactivity
   • Aurora canvas: drifting accent/brand light behind all content
   • Cursor spotlight (screen-blend, Linear-style)
   • 3D tilt + cursor sheen on glass/stat/tool cards (desktop only)
   • Count-up stat numbers on first view
   • Accent ripples on every button/chip
   • Top scroll-progress bar + page entrance choreography
   Theme-reactive: reads live --accent/--brand. GPU-cheap (transform,
   opacity, one canvas at half-res). Fully disabled under
   prefers-reduced-motion. Console: EduCinema.level(0..3) / .off()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__EH_CINEMA__) return;
  window.__EH_CINEMA__ = true;

  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var level = REDUCED ? 0 : 2;          /* 0 off · 1 subtle · 2 full · 3 extra */
  var accent = [63, 210, 176], brand = [167, 139, 250];

  /* ---------- theme tracking ---------- */
  function parseCol(v, fb) {
    v = String(v || '').trim();
    var m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
    m = v.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (m) return [+m[1], +m[2], +m[3]];
    return fb;
  }
  function retheme() {
    try {
      var cs = getComputedStyle(document.body);
      accent = parseCol(cs.getPropertyValue('--accent'), accent);
      brand  = parseCol(cs.getPropertyValue('--brand') || cs.getPropertyValue('--accent-2'), brand);
    } catch (e) {}
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  retheme(); setInterval(retheme, 900);

  /* ---------- styles ---------- */
  var CSS =
    '#eh-cinema-bg{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}' +
    '#eh-spotlight{position:fixed;top:0;left:0;width:640px;height:640px;border-radius:50%;' +
      'pointer-events:none;z-index:2;mix-blend-mode:screen;opacity:0;transition:opacity .4s;' +
      'will-change:transform}' +
    '#eh-progress{position:fixed;top:0;left:0;height:2px;width:0;z-index:9990;pointer-events:none;' +
      'background:linear-gradient(90deg,' + rgba(accent,.9) + ',' + rgba(brand,.9) + ');' +
      'box-shadow:0 0 8px ' + rgba(accent,.45) + '}' +
    '.eh-tilt{will-change:transform}' +
    '.eh-sheen{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;' +
      'transition:opacity .3s;background:radial-gradient(560px circle at var(--mx,50%) var(--my,50%),' +
      'rgba(255,255,255,.07),transparent 42%)}' +
    '.eh-tilt:hover .eh-sheen{opacity:1}' +
    '.eh-rp{position:relative;overflow:hidden}' +
    '.eh-ripple{position:absolute;border-radius:50%;transform:scale(0);opacity:.4;pointer-events:none;' +
      'background:radial-gradient(circle,' + rgba(accent,.9) + ' 0%,transparent 62%)' +
      ';animation:ehRip .55s ease-out forwards}' +
    '@keyframes ehRip{to{transform:scale(2.6);opacity:0}}';
  if (!REDUCED) CSS +=
    'main.container{animation:ehCineIn .5s ease-out both}' +
    '@keyframes ehCineIn{from{opacity:0}to{opacity:1}}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  /* ---------- 1 · aurora canvas ---------- */
  var cv, cx, orbs = [], W = 0, H = 0;
  function initCanvas() {
    if (REDUCED || level < 1) return;
    cv = document.createElement('canvas'); cv.id = 'eh-cinema-bg';
    document.body.insertBefore(cv, document.body.firstChild);
    cx = cv.getContext('2d');
    function size() {
      W = cv.width = Math.ceil(innerWidth / 2);   /* half-res: cheap, soft */
      H = cv.height = Math.ceil(innerHeight / 2);
    }
    size(); addEventListener('resize', size);
    orbs = [0, 1, 2].map(function (i) {
      return { x: Math.random(), y: Math.random(), r: .34 + Math.random() * .18,
               vx: (Math.random() - .5) * .0009, vy: (Math.random() - .5) * .0009, i: i };
    });
    draw();
  }
  function draw() {
    if (!cx) return;
    if (!document.hidden) {
      cx.clearRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < orbs.length; i++) {
        var o = orbs[i];
        o.x += o.vx * level; o.y += o.vy * level;
        if (o.x < -o.r * .3 || o.x > 1 + o.r * .3) o.vx *= -1;
        if (o.y < -o.r * .3 || o.y > 1 + o.r * .3) o.vy *= -1;
        var x = o.x * W, y = o.y * H, r = o.r * Math.min(W, H) * 2.2;
        var g = cx.createRadialGradient(x, y, 0, x, y, r);
        var c = (o.i === 1) ? brand : accent;
        g.addColorStop(0, rgba(c, level >= 3 ? .10 : .065));
        g.addColorStop(1, rgba(c, 0));
        cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 6.2832); cx.fill();
      }
      cx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(draw);
  }

  /* ---------- 2 · cursor spotlight ---------- */
  var sp, sx = innerWidth / 2, sy = innerHeight / 2, tx = sx, ty = sy;
  function initSpotlight() {
    if (REDUCED || level < 2) return;
    if (!matchMedia('(pointer: fine)').matches) return;
    sp = document.createElement('div'); sp.id = 'eh-spotlight';
    document.body.appendChild(sp);
    addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; sp.style.opacity = 1; }, { passive: true });
    document.addEventListener('mouseleave', function () { sp.style.opacity = 0; });
    (function tick() {
      sx += (tx - sx) * .12; sy += (ty - sy) * .12;
      if (sp) sp.style.transform = 'translate3d(' + (sx - 320) + 'px,' + (sy - 320) + 'px,0)';
      requestAnimationFrame(tick);
    })();
    (function paint() {
      if (sp) sp.style.background = 'radial-gradient(circle,' + rgba(accent, level >= 3 ? .10 : .06) + ',transparent 62%)';
      setTimeout(paint, 900);
    })();
  }

  /* ---------- 3 · card tilt + sheen ---------- */
  function initTilt() {
    if (REDUCED || level < 2) return;
    if (!matchMedia('(pointer: fine)').matches) return;
    var cards = document.querySelectorAll('.glass-card, .stat-card, .tool-card');
    cards.forEach(function (card) {
      if (card.__ehTilt) return; card.__ehTilt = true;
      card.classList.add('eh-tilt');
      var sheen = document.createElement('div'); sheen.className = 'eh-sheen';
      card.appendChild(sheen);
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
        var rx = (.5 - py) * 5, ry = (px - .5) * 6;
        card.style.transition = 'transform .08s ease-out';
        card.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-2px)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
        card.style.transform = '';
      });
    });
  }

  /* ---------- 4 · count-up stats ---------- */
  function initCountUp() {
    var els = document.querySelectorAll('.stat-number');
    if (!els.length || !('IntersectionObserver' in window) || REDUCED) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || en.target.__done) return;
        en.target.__done = true; io.unobserve(en.target);
        var el = en.target, raw = el.textContent.trim();
        var m = raw.match(/^(\d+(?:\.\d+)?)(.*)$/);
        if (!m) return;
        var end = parseFloat(m[1]), suf = m[2], dec = (m[1].indexOf('.') > -1) ? 1 : 0, t0 = null;
        function step(ts) {
          if (!t0) t0 = ts;
          var p = Math.min(1, (ts - t0) / 800);
          var v = (end * (1 - Math.pow(1 - p, 3))).toFixed(dec);
          el.textContent = v + suf;
          if (p < 1) requestAnimationFrame(step);
        }
        el.textContent = (0).toFixed(dec) + suf;
        requestAnimationFrame(step);
      });
    }, { threshold: .4 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 5 · ripples ---------- */
  var RIP_SEL = '.btn-primary,.btn-danger,.btn-danger-sm,.btn-primary-sm,.focus-toggle,' +
                '.clock-toggle,.calc-tab,.sci-btn,.calc-btn,.chip,.tc-btn,.eh-fab';
  function initRipple() {
    if (REDUCED || level < 1) return;
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest(RIP_SEL);
      if (!b) return;
      b.classList.add('eh-rp');
      var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
      var sp2 = document.createElement('span');
      sp2.className = 'eh-ripple';
      sp2.style.width = sp2.style.height = s + 'px';
      sp2.style.left = (e.clientX - r.left - s / 2) + 'px';
      sp2.style.top = (e.clientY - r.top - s / 2) + 'px';
      b.appendChild(sp2);
      setTimeout(function () { sp2.remove(); }, 600);
    }, { passive: true });
  }

  /* ---------- 6 · scroll progress ---------- */
  function initProgress() {
    var bar = document.createElement('div'); bar.id = 'eh-progress';
    document.body.appendChild(bar);
    addEventListener('scroll', function () {
      var h = document.documentElement;
      var p = h.scrollHeight - h.clientHeight;
      bar.style.width = (p > 0 ? (h.scrollTop / p) * 100 : 0) + '%';
    }, { passive: true });
  }

  /* ---------- boot ---------- */
  function boot() {
        initCanvas(); initCountUp(); initRipple(); initProgress();
    setTimeout(initTilt, 1200); setTimeout(initTilt, 3000);   /* late-rendered cards */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ---------- public knobs ---------- */
  window.EduCinema = {
    level: function (n) { level = Math.max(0, Math.min(3, +n || 0)); },
    off: function () { level = 0; if (cv) cv.style.display = 'none'; if (sp) sp.style.display = 'none'; },
    on: function () { level = 2; if (cv) cv.style.display = ''; if (sp) sp.style.display = ''; }
  };
})();
