/* ============================================================
   STUDYHUB — INTERACTION LAYER v2 (additive, zero conflicts)
   Progress bar · count-up · tilt · toasts · ripples · shortcuts
   ============================================================ */
(function () {
    'use strict';
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── 1. SCROLL PROGRESS BAR ── */
    var bar = document.createElement('div');
    bar.className = 'fx-progress';
    document.body.appendChild(bar);
    var ticking = false;
    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            var h = document.documentElement;
            var max = h.scrollHeight - h.clientHeight;
            bar.style.transform = 'scaleX(' + (max > 0 ? h.scrollTop / max : 0) + ')';
            ticking = false;
        });
    }, { passive: true });

    /* ── 2. STAT COUNT-UP (works with dynamically rendered stats) ── */
    function countUp(el) {
        if (el.dataset.fxCounted) return;
        var target = parseInt(el.textContent, 10);
        if (isNaN(target) || target === 0) return;
        el.dataset.fxCounted = '1';
        var dur = 800, t0 = performance.now();
        (function tick(t) {
            var p = Math.min((t - t0) / dur, 1);
            el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(tick);
        })(t0);
    }
    function watchStats() {
        var grids = document.querySelectorAll('.stats-grid');
        if (!grids.length) return;
        var scan = function () { grids.forEach(function (g) { g.querySelectorAll('.stat-number').forEach(countUp); }); };
        try {
            var mo = new MutationObserver(function () { requestAnimationFrame(scan); });
            grids.forEach(function (g) { mo.observe(g, { childList: true, subtree: true, characterData: true }); });
        } catch (e) {}
        scan();
    }

    /* ── 3. 3D TILT ON TOOL CARDS (desktop only) ── */
    function initTilt() {
        if (reduced || !window.matchMedia('(pointer:fine)').matches) return;
        document.querySelectorAll('.tool-card').forEach(function (card) {
            card.addEventListener('pointermove', function (e) {
                var r = card.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width - 0.5;
                var y = (e.clientY - r.top) / r.height - 0.5;
                card.style.transform = 'translateY(-6px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg)';
            });
            card.addEventListener('pointerleave', function () { card.style.transform = ''; });
        });
    }

    /* ── 4. TOASTS — call window.showToast('Saved!', 'success') anywhere ── */
    window.showToast = function (msg, type) {
        var wrap = document.querySelector('.fx-toast-wrap');
        if (!wrap) { wrap = document.createElement('div'); wrap.className = 'fx-toast-wrap'; document.body.appendChild(wrap); }
        var t = document.createElement('div');
        t.className = 'fx-toast' + (type ? ' ' + type : '');
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(function () { t.classList.add('hide'); setTimeout(function () { t.remove(); }, 320); }, 3200);
    };

    /* ── 5. BUTTON RIPPLE ── */
    document.addEventListener('pointerdown', function (e) {
        if (reduced) return;
        var btn = e.target.closest('.btn-primary, .btn-primary-sm, .search-box button, .clock-toggle, .planner-chip');
        if (!btn) return;
        btn.classList.add('fx-ripple-host');
        var r = btn.getBoundingClientRect(), d = Math.max(r.width, r.height);
        var s = document.createElement('span');
        s.className = 'fx-ripple';
        s.style.width = s.style.height = d + 'px';
        s.style.left = (e.clientX - r.left - d / 2) + 'px';
        s.style.top = (e.clientY - r.top - d / 2) + 'px';
        btn.appendChild(s);
        setTimeout(function () { s.remove(); }, 600);
    }, { passive: true });

    /* ── 6. SHORTCUTS — "/" focuses search · Esc closes menus/modals ── */
    document.addEventListener('keydown', function (e) {
        var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (e.key === '/' && !typing) {
            var input = document.querySelector('.search-box input');
            if (input) { e.preventDefault(); input.focus(); input.select(); }
        }
        if (e.key === 'Escape') {
            var open = document.querySelector('.nav-links.open');
            if (open) { open.classList.remove('open'); return; }
            var modal = document.querySelector('.calendar-modal, .trash-modal, .command-palette');
            if (modal) {
                var close = modal.querySelector('.cal-close-btn') || modal.querySelector('button');
                if (close) close.click();
            }
        }
    });

    /* ── BOOT ── */
    function boot() { watchStats(); initTilt(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
