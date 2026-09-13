/* ================================================================
   STUDYHUB — BACKEND STORAGE LAYER (synced to Cloudflare D1)
   ================================================================
   APPENDED to the original script.js at build time. The original
   bytes are preserved as an unmodified prefix — only this block is
   added. Nothing else in script.js is edited, and no HTML, CSS, DOM
   id/class, markup or interaction is changed.

   HOW THE OVERRIDE WORKS
   ----------------------
   script.js is a classic (non-module) script, so its top-level
   `function loadData()` / `function saveData()` declarations become
   properties of the global object. Assigning `window.loadData` /
   `window.saveData` here therefore redirects every one of the ~112
   existing call sites, because those call sites resolve the name at
   call time. (A nested `function loadData(){}` inside this IIFE would
   NOT shadow the global and would silently do nothing.)

   BEHAVIOUR
   ---------
   * The server (D1) is authoritative.
   * localStorage remains a cache, so the app still opens and works
     when the network is unavailable.
   * Data is per-account: switching users on the same browser clears
     the cached document instead of leaking it between accounts.
   ================================================================ */
(function () {
    'use strict';

    var CACHE_KEY = 'studyHubData';
    var USER_KEY = 'studyHubUser';

    var cache = null;      // in-memory workspace document
    var booted = false;    // true once the server document has loaded
    var pending = null;    // debounce timer
    var inflight = false;  // a PUT is currently in progress
    var dirty = false;     // changed while a PUT was in flight
    var filesMirrored = {}; // file ids already mirrored via /api/files

    /* ---------- API helper ---------- */
    function api(path, options) {
        options = options || {};
        options.credentials = 'same-origin';
        options.headers = options.headers || {};
        if (options.body && typeof options.body !== 'string') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        return fetch('/api' + path, options).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                return { status: res.status, ok: res.ok, data: data };
            });
        });
    }

    /* ---------- cache helpers ---------- */
    function readCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return null;
    }

    function writeCache(data) {
        cache = data;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* quota */ }
    }

    function defaultData() {
        try {
            if (typeof getDefaultData === 'function') return getDefaultData();
        } catch (e) { /* ignore */ }
        return {};
    }

    function mergeDefaults(data, def) {
        for (var key in def) {
            if (!(key in data) || data[key] === null || data[key] === undefined) {
                data[key] = JSON.parse(JSON.stringify(def[key]));
            }
        }
        return data;
    }

    /* Hydrate synchronously so the very first render already has data,
       instead of flashing empty modules while the request is in flight. */
    function hydrateFromCache() {
        var local = readCache();
        cache = local ? mergeDefaults(local, defaultData()) : defaultData();
        return cache;
    }
    hydrateFromCache();

    /* ---------- push to server (debounced) ---------- */
    function schedulePush() {
        dirty = true;
        if (pending) clearTimeout(pending);
        pending = setTimeout(flush, 700);
    }

    function flush() {
        pending = null;
        if (!booted) return;
        if (inflight) { dirty = true; return; }
        var snapshot = cache || readCache();
        if (!snapshot) return;
        dirty = false;
        inflight = true;
        api('/workspace', { method: 'PUT', body: { data: snapshot } })
            .then(function (res) {
                inflight = false;
                if (res.status === 401) { location.href = '/login.html'; return; }
                if (dirty) schedulePush();
            })
            .catch(function () {
                inflight = false;
                if (dirty) schedulePush();
            });
    }

    /* ---------- mirror uploaded files to the server ---------- */
    var MAX_FILE_BYTES = 4 * 1024 * 1024;

    function mirrorFile(file) {
        if (!file || typeof file.id !== 'string' || filesMirrored[file.id]) return;
        if (typeof file.data !== 'string' || !file.data) return;
        if (file.data.length > MAX_FILE_BYTES) return;
        filesMirrored[file.id] = true;
        api('/files', {
            method: 'POST',
            body: { files: [{ id: file.id, name: file.name, size: file.size, data: file.data }] }
        }).catch(function () { filesMirrored[file.id] = false; });
    }

    function mirrorAllFiles(data) {
        var files = (data && data.files) || [];
        for (var i = 0; i < files.length; i++) mirrorFile(files[i]);
    }

    /* ================================================================
       OVERRIDES — the only behaviour replaced.
       ================================================================ */
    window.loadData = function loadData() {
        if (!cache) hydrateFromCache();
        return cache;
    };

    window.saveData = function saveData(data) {
        writeCache(data);
        mirrorAllFiles(data);
        schedulePush();
    };

    /* Expose the storage layer for debugging / manual logout wiring. */
    window.studyhubApi = api;
    window.studyhubLogout = function () {
        api('/auth/logout', { method: 'POST' }).then(function () {
            try {
                localStorage.removeItem(CACHE_KEY);
                localStorage.removeItem(USER_KEY);
            } catch (e) { /* ignore */ }
            location.href = '/login.html';
        });
    };

    /* ---------- auth gate + authoritative load ---------- */
    function gate() {
        var isLogin = /\/login\.html$/.test(location.pathname);

        api('/auth/me').then(function (res) {
            if (!res.ok) {
                if (!isLogin) location.href = '/login.html';
                return;
            }
            if (isLogin) { location.href = '/index.html'; return; }

            var userId = (res.data && res.data.user && res.data.user.id) || '';
            var known = null;
            try { known = localStorage.getItem(USER_KEY); } catch (e) { /* ignore */ }

            // Different account on this browser: never reuse the other
            // account's cached document.
            if (known && userId && known !== userId) {
                try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
                cache = null;
                hydrateFromCache();
            }

            loadWorkspace().then(function () {
                booted = true;
                try { localStorage.setItem(USER_KEY, userId); } catch (e) { /* ignore */ }
                mirrorAllFiles(cache);
                flush();
                repaint();
            });
        }).catch(function () {
            // Offline: keep working from the cached document.
            booted = false;
        });
    }

    function loadWorkspace() {
        return api('/workspace').then(function (res) {
            if (res.status === 401) { location.href = '/login.html'; return; }
            if (!res.ok) return;

            var serverData = res.data && res.data.data ? res.data.data : null;
            var empty = !serverData || Object.keys(serverData).length === 0;

            if (!empty) {
                writeCache(mergeDefaults(serverData, defaultData()));
                return;
            }

            // First sign-in for this account: adopt any pre-existing local
            // document once, then the server owns it.
            var local = readCache();
            writeCache(local ? mergeDefaults(local, defaultData()) : defaultData());
            return api('/workspace', { method: 'PUT', body: { data: cache } });
        });
    }

    /* Re-render whatever this page shows, now that real data has arrived. */
    function repaint() {
        try {
            var path = window.location.pathname.split('/').pop() || 'index.html';
            if (path === '' || path === 'index.html') {
                if (typeof renderDashboard === 'function') renderDashboard();
            } else if (path === 'files.html') {
                if (typeof renderFileList === 'function') renderFileList();
            } else if (path === 'notes.html') {
                if (typeof setupNotes === 'function') setupNotes();
            } else if (path === 'notice.html') {
                if (typeof setupNotice === 'function') setupNotice();
            } else if (path === 'habits.html') {
                if (typeof setupHabits === 'function') setupHabits();
            }
            if (typeof updateTrashCount === 'function') updateTrashCount();
            window.dispatchEvent(new CustomEvent('studyhub:ready'));
        } catch (e) { /* page may not define these */ }
    }

    window.addEventListener('beforeunload', function () {
        if (pending) { clearTimeout(pending); flush(); }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', gate);
    } else {
        gate();
    }
})();
