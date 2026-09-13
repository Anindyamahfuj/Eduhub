/* ==========================================================================
   StudyHub — Developer Admin Panel client.

   Loaded ONLY by /admin/*. It never runs inside the student app and does not
   touch any student file, DOM id or class.

   Authorization is NOT decided here. Every request goes to /api/admin/*, which
   is guarded server-side by `requireDeveloper` against `users.role`. This file
   merely *presents* what the server chose to return:
     - 401 -> the server rejected an unauthenticated request
     - 403 -> the server rejected an authenticated non-developer
   If either happens we show the server's message; we never fall back to a
   client-side "logged in as admin" assumption.
   ========================================================================== */
(function () {
    'use strict';

    var SECTIONS = {
        overview: { title: 'Overview', subtitle: 'Developer-only statistics from the live database.' },
        users: { title: 'Users', subtitle: 'Registered accounts. No passwords, hashes or tokens are read.' },
        data: { title: 'Data', subtitle: 'Read-only inspection of the real stored data. No destructive tools.' },
        files: { title: 'Files', subtitle: 'File metadata only. Contents are never exposed here.' },
        logs: { title: 'Logs', subtitle: 'Audit events recorded by the backend.' },
        system: { title: 'System', subtitle: 'Live checks. No hard-coded status values.' },
        ai: { title: 'AI', subtitle: 'Configuration preparation only — no model is called.' }
    };

    var bodyEl = document.getElementById('admin-body');
    var titleEl = document.getElementById('admin-title');
    var subtitleEl = document.getElementById('admin-subtitle');
    var navEl = document.getElementById('admin-nav');
    var whoEl = document.getElementById('admin-who');
    var logoutEl = document.getElementById('admin-logout');

    /* Determine the section from the URL: /admin, /admin/users, ... */
    function currentSection() {
        var parts = location.pathname.split('/').filter(Boolean); // ['admin','users']
        var last = parts.length > 1 ? parts[parts.length - 1] : 'overview';
        return SECTIONS[last] ? last : 'overview';
    }

    function api(path) {
        return fetch('/api/admin' + path, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        }).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                return { status: res.status, ok: res.ok, data: data };
            });
        });
    }

    /* ------------------------------------------------------------ helpers */
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        attrs = attrs || {};
        Object.keys(attrs).forEach(function (k) {
            if (k === 'class') node.className = attrs[k];
            else if (k === 'text') node.textContent = attrs[k];
            else if (k === 'html') node.innerHTML = attrs[k];
            else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (child) {
            if (child == null) return;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
    }

    function bytes(n) {
        if (n == null || isNaN(n)) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    function fmtDate(value) {
        if (!value) return '—';
        var iso = String(value).indexOf('T') === -1 ? String(value).replace(' ', 'T') + 'Z' : value;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleString();
    }

    function badge(text, kind) {
        return el('span', { class: 'badge badge-' + (kind || 'muted'), text: text });
    }

    function clear() { bodyEl.innerHTML = ''; }

    function loading() { clear(); bodyEl.appendChild(el('div', { class: 'admin-loading', text: 'Loading…' })); }

    function showError(res, section) {
        clear();
        var msg = (res && res.data && res.data.error) || 'Request failed.';
        if (res && res.status === 401) {
            bodyEl.appendChild(el('div', { class: 'admin-callout', html:
                '<strong>Not authenticated.</strong> The server rejected this request. ' +
                '<a href="/login.html">Sign in</a> and try again.' }));
        } else if (res && res.status === 403) {
            bodyEl.appendChild(el('div', { class: 'admin-callout', html:
                '<strong>Developer authorization required.</strong> ' +
                'This account is not a developer, so the server denied access to <code>/api/admin/' +
                section + '</code>.' }));
        } else {
            bodyEl.appendChild(el('div', { class: 'admin-callout admin-error', text: msg }));
        }
    }

    /* ------------------------------------------------------------- tables */
    function table(columns, rows) {
        var thead = el('thead', {}, [el('tr', {}, columns.map(function (c) {
            return el('th', { text: c.label, class: c.num ? 'num' : null });
        }))]);
        var tbody = el('tbody', {}, rows.map(function (row) {
            return el('tr', {}, columns.map(function (c) {
                var value = c.render ? c.render(row) : row[c.key];
                var classes = [];
                if (c.num) classes.push('num');
                if (c.wrap) classes.push('wrap');
                if (c.mono) classes.push('admin-mono');
                var td = el('td', { class: classes.join(' ') || null });
                if (value == null) td.textContent = '—';
                else if (typeof value === 'string') td.textContent = value;
                else td.appendChild(value);
                return td;
            }));
        }));
        return el('div', { class: 'admin-table-wrap' }, [el('table', { class: 'admin-table' }, [thead, tbody])]);
    }

    function section(title, note, node) {
        var wrap = el('section', { class: 'admin-section' }, [el('h2', { text: title })]);
        if (note) wrap.appendChild(el('p', { class: 'admin-note', text: note }));
        if (node) wrap.appendChild(node);
        return wrap;
    }

    function cards(items) {
        return el('div', { class: 'admin-cards' }, items.map(function (i) {
            return el('div', { class: 'admin-card' }, [
                el('div', { class: 'k', text: i.label }),
                el('div', { class: 'v', text: String(i.value) }),
                i.note ? el('div', { class: 'n', text: i.note }) : null
            ]);
        }));
    }

    /* ---------------------------------------------------------- overview */
    function renderOverview(data) {
        clear();
        var c = data.counts || {};
        bodyEl.appendChild(cards([
            { label: 'Total users', value: c.users, note: 'rows in users' },
            { label: 'Developers', value: c.developers, note: "role = 'developer'" },
            { label: 'Unexpired sessions (users)', value: c.usersWithUnexpiredSession, note: 'distinct users with a live session' },
            { label: 'Unexpired sessions (total)', value: c.activeSessions, note: 'all live session rows' },
            { label: 'Workspaces', value: c.workspaces, note: 'stored documents' },
            { label: 'Files', value: c.files, note: bytes(c.fileBytes) + ' total' }
        ]));

        var rows = (data.collections || []).map(function (col) {
            return { label: col.label, count: col.count };
        });
        bodyEl.appendChild(section(
            'Stored module totals',
            'Counted from the real workspace documents (users with no document count as zero).',
            table([
                { label: 'Collection', key: 'label' },
                { label: 'Items', key: 'count', num: true }
            ], rows)
        ));

        if (data.logAvailable) {
            bodyEl.appendChild(section(
                'Recent activity',
                'Latest 10 audit entries recorded by the backend.',
                table([
                    { label: 'Time', render: function (r) { return fmtDate(r.created_at); } },
                    { label: 'Actor', render: function (r) { return r.actor_email || '—'; } },
                    { label: 'Action', key: 'action', mono: true },
                    { label: 'Target', key: 'target' },
                    { label: 'Result', render: function (r) {
                        var k = r.result === 'ok' ? 'ok' : r.result === 'denied' ? 'err' : 'warn';
                        return badge(r.result || '—', k);
                    } }
                ], data.recent || [])
            ));
        } else {
            bodyEl.appendChild(el('div', { class: 'admin-callout', text:
                'No audit log table is present, so recent activity cannot be shown.' }));
        }
    }

    /* ------------------------------------------------------------- users */
    function renderUsers(data) {
        clear();
        var toolbar = el('div', { class: 'admin-toolbar' });
        var input = el('input', { class: 'admin-input', type: 'search', placeholder: 'Search by email…', value: data.query || '' });
        var btn = el('button', { class: 'admin-btn', type: 'button', text: 'Search' });
        btn.addEventListener('click', function () { loadUsers(input.value); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadUsers(input.value); });
        toolbar.appendChild(input);
        toolbar.appendChild(btn);
        bodyEl.appendChild(toolbar);

        bodyEl.appendChild(section(
            'Accounts',
            'Role changes take effect immediately and are recorded in the audit log. Passwords, hashes, tokens and session secrets are never selected.',
            table([
                { label: 'Email', key: 'email', wrap: true },
                { label: 'Role', render: function (r) {
                    return r.developer ? badge('developer', 'dev') : badge('student', 'muted');
                } },
                { label: 'Created', render: function (r) { return fmtDate(r.createdAt); } },
                { label: 'Files', key: 'fileCount', num: true },
                { label: 'File bytes', render: function (r) { return bytes(r.fileBytes); }, num: true },
                { label: 'Workspace bytes', render: function (r) { return r.workspaceBytes ? bytes(r.workspaceBytes) : '—'; }, num: true },
                { label: 'Sessions', key: 'sessionCount', num: true },
                { label: 'Latest session expiry', render: function (r) { return fmtDate(r.latestSessionExpiry); } },
                { label: 'Authorization', render: function (r) {
                    var next = r.developer ? 'student' : 'developer';
                    var b = el('button', {
                        class: 'admin-btn-ghost',
                        type: 'button',
                        text: r.developer ? 'Revoke developer' : 'Grant developer'
                    });
                    b.addEventListener('click', function () { changeRole(r, next, b); });
                    return b;
                } }
            ], data.users || [])
        ));
    }

    function changeRole(user, role, btn) {
        btn.disabled = true;
        fetch('/api/admin/users/' + encodeURIComponent(user.id) + '/role', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: role })
        }).then(function (res) {
            return res.text().then(function (t) {
                var data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
                if (!res.ok) {
                    alert((data && data.error) || 'Could not change role.');
                    btn.disabled = false;
                    return;
                }
                loadUsers('');
            });
        }).catch(function () { alert('Could not reach the server.'); btn.disabled = false; });
    }

    function loadUsers(q) {
        loading();
        var suffix = q ? '?q=' + encodeURIComponent(q) : '';
        api('/users' + suffix).then(function (res) {
            if (!res.ok) return showError(res, 'users');
            renderUsers(res.data);
        }).catch(function () { showError(null, 'users'); });
    }

    /* -------------------------------------------------------------- data */
    function renderData(data, tables) {
        clear();
        bodyEl.appendChild(el('div', { class: 'admin-callout', html:
            'Read-only inspection. Workspace documents are listed with <strong>sizes and key shapes only</strong> — ' +
            'no bulk content export, and no destructive controls.' }));

        bodyEl.appendChild(section(
            'Database tables (actual schema)',
            'Read from sqlite_master. Column names and types only — no row values.',
            table([
                { label: 'Table', key: 'name', mono: true },
                { label: 'Rows', render: function (r) { return r.rows == null ? '—' : r.rows; }, num: true },
                { label: 'Columns', render: function (r) {
                    return (r.columns || []).map(function (c) { return c.name + ':' + (c.type || '?'); }).join(', ');
                }, wrap: true, mono: true }
            ], (tables && tables.tables) || [])
        ));

        bodyEl.appendChild(section(
            'Workspace documents',
            'Newest first. Bytes = stored JSON size.',
            table([
                { label: 'Owner', render: function (r) { return r.email || r.userId; }, wrap: true },
                { label: 'Bytes', render: function (r) { return bytes(r.bytes); }, num: true },
                { label: 'Updated', render: function (r) { return fmtDate(r.updatedAt); } }
            ], data.workspaces || [])
        ));

        if (data.sample) {
            bodyEl.appendChild(section(
                'Document shape — ' + (data.sample.email || data.sample.userId),
                'Key names, value types and item counts for one document.',
                table([
                    { label: 'Key', key: 'key', mono: true },
                    { label: 'Type', key: 'type' },
                    { label: 'Items', render: function (r) { return r.count == null ? '—' : r.count; }, num: true }
                ], data.shape || [])
            ));
        }
    }

    function loadData() {
        loading();
        Promise.all([api('/data'), api('/data/tables')]).then(function (results) {
            var d = results[0], t = results[1];
            if (!d.ok) return showError(d, 'data');
            renderData(d.data, t.ok ? t.data : null);
        }).catch(function () { showError(null, 'data'); });
    }

    /* ------------------------------------------------------------- files */
    function renderFiles(data) {
        clear();
        bodyEl.appendChild(cards([
            { label: 'Files', value: data.total, note: bytes(data.totalBytes) + ' total' },
            { label: 'Storage driver', value: data.driver, note: 'from configuration' },
            { label: 'Contents exposed', value: 'No', note: 'metadata only' }
        ]));

        bodyEl.appendChild(section(
            'Stored files',
            'Filename, owner, size, upload date and storage reference. The file payload itself is never selected or served here.',
            table([
                { label: 'Filename', key: 'name', wrap: true },
                { label: 'Owner', render: function (r) { return r.ownerEmail || r.ownerId; }, wrap: true },
                { label: 'Size', render: function (r) { return bytes(r.size); }, num: true },
                { label: 'Type', key: 'mime' },
                { label: 'Uploaded', render: function (r) { return fmtDate(r.uploadedAt); } },
                { label: 'Status', render: function (r) {
                    var kind = r.status.indexOf('missing') === 0 ? 'err'
                        : r.status.indexOf('external') === 0 ? 'ok' : 'muted';
                    return badge(r.status, kind);
                } },
                { label: 'Storage reference', render: function (r) { return r.storageKey || 'inline'; }, mono: true }
            ], data.files || [])
        ));
    }

    function loadFiles() {
        loading();
        api('/files').then(function (res) {
            if (!res.ok) return showError(res, 'files');
            renderFiles(res.data);
        }).catch(function () { showError(null, 'files'); });
    }

    /* -------------------------------------------------------------- logs */
    function renderLogs(data) {
        clear();
        if (!data.available) {
            bodyEl.appendChild(el('div', { class: 'admin-callout', text:
                'No audit log table is present in this database.' }));
            return;
        }

        bodyEl.appendChild(cards([
            { label: 'Entries', value: data.total, note: 'rows in audit_logs' },
            { label: 'Action types', value: (data.actions || []).length, note: 'distinct actions' }
        ]));

        var toolbar = el('div', { class: 'admin-toolbar' });
        var select = el('select', { class: 'admin-select' });
        select.appendChild(el('option', { value: '', text: 'All actions' }));
        (data.actions || []).forEach(function (a) {
            var opt = el('option', { value: a.action, text: a.action + ' (' + a.n + ')' });
            select.appendChild(opt);
        });
        select.addEventListener('change', function () { loadLogs(select.value); });
        toolbar.appendChild(select);
        bodyEl.appendChild(toolbar);

        bodyEl.appendChild(section(
            'Audit events',
            'Timestamp · actor · action · target · result — the fields that actually exist.',
            table([
                { label: 'Timestamp', render: function (r) { return fmtDate(r.created_at); } },
                { label: 'Actor', render: function (r) { return r.actor_email || '—'; } },
                { label: 'Action', key: 'action', mono: true },
                { label: 'Target', key: 'target', wrap: true },
                { label: 'Result', render: function (r) {
                    var k = r.result === 'ok' ? 'ok' : r.result === 'denied' ? 'err' : 'warn';
                    return badge(r.result || '—', k);
                } },
                { label: 'Detail', key: 'detail', wrap: true }
            ], data.logs || [])
        ));
    }

    function loadLogs(action) {
        loading();
        var suffix = action ? '?action=' + encodeURIComponent(action) : '';
        api('/logs' + suffix).then(function (res) {
            if (!res.ok) return showError(res, 'logs');
            renderLogs(res.data);
        }).catch(function () { showError(null, 'logs'); });
    }

    /* ------------------------------------------------------------ system */
    function renderSystem(data) {
        clear();
        var rows = (data.checks || []).map(function (chk) {
            return chk;
        });
        bodyEl.appendChild(section(
            'Service checks',
            'Each status comes from a real query or the actual running handler — nothing is hard-coded.',
            table([
                { label: 'Check', key: 'name' },
                { label: 'Status', render: function (r) {
                    var k = r.status === 'ok' ? 'ok' : r.status === 'degraded' ? 'warn' : 'err';
                    return badge(r.status, k);
                } },
                { label: 'Detail', key: 'detail', wrap: true, mono: true }
            ], rows)
        ));

        var rt = data.runtime || {};
        bodyEl.appendChild(section('Runtime', null, table([
            { label: 'Storage driver', key: 'storageDriver' },
            { label: 'AI configured', render: function (r) { return r.aiConfigured ? 'yes' : 'no (expected)'; } },
            { label: 'Server time', render: function (r) { return fmtDate(r.time); } }
        ], [rt])));
    }

    function loadSystem() {
        loading();
        api('/system').then(function (res) {
            if (!res.ok) return showError(res, 'system');
            renderSystem(res.data);
        }).catch(function () { showError(null, 'system'); });
    }

    /* ---------------------------------------------------------------- ai */
    function renderAi(data) {
        clear();
        bodyEl.appendChild(el('div', { class: 'admin-callout', html:
            '<strong>Preparation only.</strong> No provider is contacted, no model is assumed and no API key is required. ' +
            'This page reports the existing configuration.' }));

        bodyEl.appendChild(cards([
            { label: 'Provider', value: data.provider, note: 'target interface' },
            { label: 'Status', value: data.status, note: data.configured ? 'ready' : 'key + model required' },
            { label: 'Model', value: data.model || 'Not configured', note: 'from configuration' },
            { label: 'Endpoint', value: data.endpoint || 'Not configured', note: 'from configuration' }
        ]));

        bodyEl.appendChild(section('Configuration', null, table([
            { label: 'Setting', key: 'k' },
            { label: 'Value', render: function (r) { return r.v; }, wrap: true, mono: true }
        ], [
            { k: 'OPENAI_BASE_URL', v: data.endpoint || 'Not configured' },
            { k: 'OPENAI_MODEL', v: data.model || 'Not configured' },
            { k: 'OPENAI_API_KEY', v: data.hasKey ? 'present (value never exposed)' : 'not set' },
            { k: 'Chat endpoint', v: data.chatEndpoint },
            { k: 'Provider call', v: 'not implemented — returns 501 until configured' }
        ])));
    }

    function loadAi() {
        loading();
        api('/ai').then(function (res) {
            if (!res.ok) return showError(res, 'ai');
            renderAi(res.data);
        }).catch(function () { showError(null, 'ai'); });
    }

    /* ------------------------------------------------------------ router */
    var LOADERS = {
        overview: function () { api('/overview').then(function (r) { r.ok ? renderOverview(r.data) : showError(r, 'overview'); }).catch(function () { showError(null, 'overview'); }); },
        users: loadUsers,
        data: loadData,
        files: loadFiles,
        logs: loadLogs,
        system: loadSystem,
        ai: loadAi
    };

    function activateNav(section) {
        var links = navEl.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].classList.toggle('is-active', links[i].getAttribute('data-section') === section);
        }
    }

    function boot() {
        var section = currentSection();
        titleEl.textContent = SECTIONS[section].title;
        subtitleEl.textContent = SECTIONS[section].subtitle;
        document.title = 'StudyHub Admin — ' + SECTIONS[section].title;
        activateNav(section);

        logoutEl.addEventListener('click', function () {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                .then(function () { location.href = '/login.html'; })
                .catch(function () { location.href = '/login.html'; });
        });

        // Confirm the server accepts this session as a developer, then load.
        api('/whoami').then(function (res) {
            if (!res.ok) return showError(res, section);
            var u = res.data.user || {};
            whoEl.textContent = u.email + ' · ' + u.role;
            LOADERS[section]();
        }).catch(function () { showError(null, section); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
