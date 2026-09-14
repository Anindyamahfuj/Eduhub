/* ================================================================
   STUDYHUB — SITE TOOLS CONTROLLER (admin-managed navigation)
   ================================================================
   APPENDED to public/script.js by scripts/build.mjs, AFTER the
   storage shim. The original script.js bytes remain an unmodified
   prefix; nothing in the student source files is edited.

   WHAT IT DOES
   ------------
   Fetches the admin-curated tool list from GET /api/tools and
   applies it to every .nav-links list on the page:

     * hides tools the developer disabled
     * reorders items to the configured sort order
     * swaps the decorative emoji for Phosphor icons (per-tool,
       editable in the admin panel)
     * applies developer-set custom labels (custom labels drop the
       data-i18n attribute so language switching keeps the override)
     * appends custom tools created in the admin panel
     * redirects to the dashboard if the current page belongs to a
       disabled tool

   FAIL-SAFE
   ---------
   If /api/tools is unreachable or returns nothing usable, the nav is
   left EXACTLY as shipped: default items, default emoji. The student
   site never breaks because the tools service is down. A short
   sessionStorage cache keeps the extra request off most page loads.
   ================================================================ */
(function () {
    'use strict';

    var CACHE_KEY = 'studyHubToolsCache';
    var CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    var applied = false;

    /* ---------- tiny helpers ---------- */

    function fetchTools() {
        // Serve from the session cache when fresh.
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (raw) {
                var cached = JSON.parse(raw);
                if (cached && cached.t && Date.now() - cached.t < CACHE_TTL && cached.data) {
                    return Promise.resolve(cached.data);
                }
            }
        } catch (e) { /* storage unavailable: just fetch */ }

        return fetch('/api/tools', { credentials: 'same-origin' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (data && data.ok && data.available && Array.isArray(data.tools)) {
                    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) { /* ignore */ }
                    return data;
                }
                return null;
            })
            .catch(function () { return null; });
    }

    /* Match a tool href ("notes.html", "/guide", "https://…") to the current page. */
    function currentPageMatches(href) {
        if (/^https?:\/\//i.test(href)) return false;
        var target = String(href).split('/').filter(Boolean).pop() || '';
        var here = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
        return target.toLowerCase() === here.toLowerCase();
    }

    function sameHref(aHref, toolHref) {
        var a = String(aHref || '').replace(/^\.\//, '').toLowerCase();
        var b = String(toolHref || '').replace(/^\.\//, '').toLowerCase();
        return a === b;
    }

    /* Synchronously hide disabled tools so they never paint. Runs before
       first paint because script.js executes during the initial parse.
       NOTE: /api/tools only ever returns ENABLED tools, so this is a safety
       net for future payload changes, not the primary mechanism. Only an
       explicit `enabled === false` counts as hidden — a missing field means
       enabled, or one absent field could blank the whole nav. */
    function preHideDisabled(tools) {
        var css = '';
        for (var i = 0; i < tools.length; i++) {
            var t = tools[i];
            if (t.enabled === false && !/^https?:\/\//i.test(t.href)) {
                css += '.nav-links a[href="' + t.href.replace(/"/g, '') + '"],';
            }
        }
        if (!css) return null;
        var style = document.createElement('style');
        style.setAttribute('data-studyhub-tools', 'prehide');
        style.textContent = css.slice(0, -1) + '{display:none !important;}';
        document.head.appendChild(style);
        return style;
    }

    /* Replace the anchor's decorative content: drop the colored diamond and
       the trailing emoji, insert the Phosphor icon, keep the data-i18n span. */
    function rebuildAnchor(anchor, tool) {
        var i18nSpan = anchor.querySelector('span[data-i18n]');
        var defaultLabel = i18nSpan ? i18nSpan.textContent : '';

        // Clear everything out, then rebuild in the canonical shape:
        //   <i class="ph …"></i> <span data-i18n="…">Label</span>
        while (anchor.firstChild) anchor.removeChild(anchor.firstChild);

        var iconClass = 'ph ' + (tool.icon || 'ph-circle');
        var icon = document.createElement('i');
        icon.className = iconClass;
        icon.setAttribute('aria-hidden', 'true');
        anchor.appendChild(icon);
        anchor.appendChild(document.createTextNode(' '));

        if (i18nSpan && tool.label === defaultLabel) {
            // Unrenamed builtin: keep the translation hook exactly as shipped.
            anchor.appendChild(i18nSpan);
        } else {
            // Renamed tool or custom tool: fixed label, no i18n override.
            var span = document.createElement('span');
            span.textContent = tool.label;
            anchor.appendChild(span);
        }
    }

    function buildCustomItem(tool) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.setAttribute('href', tool.href);
        if (/^https?:\/\//i.test(tool.href)) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        }
        var icon = document.createElement('i');
        icon.className = 'ph ' + (tool.icon || 'ph-globe');
        icon.setAttribute('aria-hidden', 'true');
        a.appendChild(icon);
        a.appendChild(document.createTextNode(' '));
        var span = document.createElement('span');
        span.textContent = tool.label;
        a.appendChild(span);
        li.appendChild(a);
        return li;
    }

    /* Apply the curated tool list to one .nav-links element. */
    function applyToList(list, tools) {
        var index = 0; // running position so re-appending also reorders
        var claimed = []; // hrefs of shipped <li>s matched to an enabled tool
        for (var i = 0; i < tools.length; i++) {
            var tool = tools[i];
            var existingLi = null;

            // Find the shipped <li> for a builtin by its href.
            if (tool.kind === 'builtin') {
                var anchors = list.querySelectorAll('a[href]');
                for (var j = 0; j < anchors.length; j++) {
                    if (sameHref(anchors[j].getAttribute('href'), tool.href)) {
                        existingLi = anchors[j].closest('li');
                        claimed.push(String(anchors[j].getAttribute('href') || '').toLowerCase());
                        break;
                    }
                }
            }

            if (tool.enabled === false) {           // strict: missing field = enabled
                if (existingLi) existingLi.style.display = 'none';
                continue;
            }

            var li;
            if (existingLi) {
                li = existingLi;
                li.style.display = '';
                rebuildAnchor(existingLi.querySelector('a'), tool);
            } else {
                li = buildCustomItem(tool);
                li.setAttribute('data-studyhub-custom', '1');
            }

            // appendChild MOVES the node: this is the reorder.
            list.appendChild(li);
            li.style.order = String(index);
            index++;
        }

        /* The public API lists only ENABLED tools, so a disabled builtin is
           never iterated above. Hide every shipped <li> that no enabled tool
           claimed: those are exactly the disabled ones (custom <li>s are
           marked and exempt). */
        var children = list.children;
        for (var k = 0; k < children.length; k++) {
            var candidate = children[k];
            if (candidate.getAttribute('data-studyhub-custom')) continue;
            var a = candidate.querySelector('a[href]');
            if (!a) continue;
            var href = String(a.getAttribute('href') || '').toLowerCase();
            if (claimed.indexOf(href) === -1) candidate.style.display = 'none';
        }
    }

    function applyTools(data) {
        if (applied) return;
        applied = true;

        var tools = (data && Array.isArray(data.tools)) ? data.tools : null;
        if (!tools || !tools.length) return; // fail open: nav untouched

        preHideDisabled(tools);

        // Redirect guard: a disabled tool's page must not stay open.
        // Strict comparison for the same reason as in preHideDisabled().
        for (var i = 0; i < tools.length; i++) {
            var t = tools[i];
            if (t.enabled === false && t.kind === 'builtin' && currentPageMatches(t.href)) {
                location.replace('index.html');
                return;
            }
        }

        var lists = document.querySelectorAll('.nav-links');
        for (var n = 0; n < lists.length; n++) {
            applyToList(lists[n], tools);
        }
        document.body.setAttribute('data-tools-applied', '1');
    }

    /* The student pages ship without the Phosphor web font (the admin shell
       has it via <link>). Inject the stylesheet once; if the CDN is blocked
       the icons simply render as blank and the text labels carry the nav. */
    function ensureIconFont() {
        if (document.querySelector('link[data-studyhub-icons]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css';
        link.setAttribute('data-studyhub-icons', 'phosphor');
        document.head.appendChild(link);
    }

    function boot() {
        fetchTools().then(function (data) {
            if (data) { ensureIconFont(); applyTools(data); }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
