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
        ai: { title: 'AI', subtitle: 'Provider setup: paste, validate against the live provider, then activate.' }
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

    function api(path, options) {
        options = options || {};
        options.credentials = 'same-origin';
        options.headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
        return fetch('/api/admin' + path, options).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                return { status: res.status, ok: res.ok, data: data };
            });
        });
    }

    /** JSON request helper for the admin mutations (role change, tools editor). */
    function apiSend(method, path, body) {
        return api(path, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
    }

    /* ------------------------------------------------------------ helpers */
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        attrs = attrs || {};
        Object.keys(attrs).forEach(function (k) {
            var v = attrs[k];
            if (v == null) return; // never write the string "null" into the DOM
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else if (k === 'html') node.innerHTML = v;
            else node.setAttribute(k, v);
        });
        (children || []).forEach(function (child) {
            if (child == null) return;
            // Accept real element nodes; coerce strings/numbers to text nodes.
            if (typeof child === 'object' && child.nodeType === 1) node.appendChild(child);
            else node.appendChild(document.createTextNode(String(child)));
        });
        return node;
    }

    function bytes(n) {
        if (n == null || isNaN(n)) return '-';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    function fmtDate(value) {
        if (!value) return '-';
        var iso = String(value).indexOf('T') === -1 ? String(value).replace(' ', 'T') + 'Z' : value;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleString();
    }

    function badge(text, kind) {
        return el('span', { class: 'badge badge-' + (kind || 'muted'), text: text });
    }

    /** Phosphor icon element (web font, same set the shell uses). */
    function ph(name, extraClass) {
        return el('i', { class: 'ph ph-' + name + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true' });
    }

    /** Primary button with optional leading icon. */
    function btnPrimary(label, iconName) {
        var b = el('button', { class: 'admin-btn', type: 'button' });
        if (iconName) b.appendChild(ph(iconName));
        b.appendChild(document.createTextNode(' ' + label));
        return b;
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
                // A cell value may be a count/size (number) or a badge (element).
                // Only real element nodes may be appended to the DOM — anything
                // else is coerced to text, otherwise appendChild() throws and the
                // whole section fails to render.
                if (value == null) td.textContent = '-';
                else if (typeof value === 'object' && value.nodeType === 1) td.appendChild(value);
                else td.textContent = String(value);
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
            return el('div', { class: 'admin-card' + (i.stat ? ' is-stat' : '') }, [
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
        var statCards = cards([
            { label: 'Total users', value: c.users, note: 'rows in users', stat: true },
            { label: 'Developers', value: c.developers, note: "role = 'developer'" },
            { label: 'Unexpired sessions (users)', value: c.usersWithUnexpiredSession, note: 'distinct users with a live session' },
            { label: 'Unexpired sessions (total)', value: c.activeSessions, note: 'all live session rows' },
            { label: 'Workspaces', value: c.workspaces, note: 'stored documents' },
            { label: 'Files', value: c.files, note: bytes(c.fileBytes) + ' total' }
        ]);
        bodyEl.appendChild(statCards);

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
                    { label: 'Actor', render: function (r) { return r.actor_email || '-'; } },
                    { label: 'Action', key: 'action', mono: true },
                    { label: 'Target', key: 'target' },
                    { label: 'Result', render: function (r) {
                        var k = r.result === 'ok' ? 'ok' : r.result === 'denied' ? 'err' : 'warn';
                        return badge(r.result || 'unknown', k);
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
        var btn = btnPrimary('Search', 'magnifying-glass');
        btn.addEventListener('click', function () { loadUsers(input.value); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadUsers(input.value); });
        toolbar.appendChild(input);
        toolbar.appendChild(btn);
        bodyEl.appendChild(toolbar);

        bodyEl.appendChild(section(
            'Accounts',
            'Role changes and session revocations take effect immediately and are both recorded in the audit log. Passwords, hashes, tokens and session secrets are never selected.',
            table([
                { label: 'Email', key: 'email', wrap: true },
                { label: 'Role', render: function (r) {
                    return r.developer ? badge('developer', 'dev') : badge('student', 'muted');
                } },
                { label: 'Created', render: function (r) { return fmtDate(r.createdAt); } },
                { label: 'Files', key: 'fileCount', num: true },
                { label: 'File bytes', render: function (r) { return bytes(r.fileBytes); }, num: true },
                { label: 'Workspace bytes', render: function (r) { return r.workspaceBytes ? bytes(r.workspaceBytes) : '-'; }, num: true },
                { label: 'Sessions', key: 'sessionCount', num: true },
                { label: 'Latest session expiry', render: function (r) { return fmtDate(r.latestSessionExpiry); } },
                { label: 'Session control', render: function (r) {
                    var b = el('button', { class: 'admin-btn-ghost', type: 'button' });
                    b.appendChild(ph('sign-out'));
                    b.appendChild(document.createTextNode(' Kick out'));
                    if (!r.sessionCount) {
                        b.disabled = true;
                        b.title = 'No session rows for this account — nothing to revoke.';
                    } else {
                        b.title = 'Delete every session row for this account: they are signed out on their next request.';
                        b.addEventListener('click', function () { kickOut(r, b, data.query); });
                    }
                    return b;
                } },
                { label: 'Authorization', render: function (r) {
                    var next = r.developer ? 'student' : 'developer';
                    var b = el('button', { class: 'admin-btn-ghost', type: 'button' });
                    b.appendChild(ph(r.developer ? 'prohibit' : 'shield-check'));
                    b.appendChild(document.createTextNode(' ' + (r.developer ? 'Revoke developer' : 'Grant developer')));
                    b.addEventListener('click', function () { changeRole(r, next, b, data.query); });
                    return b;
                } }
            ], data.users || [])
        ));
    }

    function changeRole(user, role, btn, query) {
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
                loadUsers(query || '');
            });
        }).catch(function () { alert('Could not reach the server.'); btn.disabled = false; });
    }

    /**
     * KICK OUT a user: DELETE every session row for the account, so the cookie
     * they hold stops resolving and their next API request answers 401 — the
     * student app then sends them to the login page.
     *
     * Access only, never data: files, the workspace document and the role are
     * left exactly as they are, which is what the confirm text promises.
     */
    function kickOut(user, btn, query) {
        var devNote = user.developer
            ? ' This account is a developer, so it loses access to this panel until it signs in again.'
            : '';
        if (!window.confirm(
            'Kick out ' + user.email + '?\n\n' +
            'Every session row for this account is deleted, signing out every browser ' +
            'and device it is logged in on.' + devNote +
            '\n\nNo files, notes, settings or account data are deleted.'
        )) return;

        btn.disabled = true;
        apiSend('POST', '/users/' + encodeURIComponent(user.id) + '/sessions/revoke', {}).then(function (res) {
            if (!res.ok) {
                alert((res.data && res.data.error) || 'Could not kick out this session.');
                btn.disabled = false;
                return;
            }
            // Nothing else to say: the reloaded row shows Sessions 0 and the
            // button disables itself, which is the visible proof it took effect.
            loadUsers(query || '');
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
            'Read-only inspection. Workspace documents are listed with <strong>sizes and key shapes only</strong>. ' +
            'No bulk content export, and no destructive controls.' }));

        bodyEl.appendChild(section(
            'Database tables (actual schema)',
            'Read from sqlite_master. Column names and types only. No row values.',
            table([
                { label: 'Table', key: 'name', mono: true },
                { label: 'Rows', render: function (r) { return r.rows == null ? '-' : r.rows; }, num: true },
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
                'Document shape: ' + (data.sample.email || data.sample.userId),
                'Key names, value types and item counts for one document.',
                table([
                    { label: 'Key', key: 'key', mono: true },
                    { label: 'Type', key: 'type' },
                    { label: 'Items', render: function (r) { return r.count == null ? '-' : r.count; }, num: true }
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
        var fileCards = el('div', { class: 'admin-cards' }, [
            el('div', { class: 'admin-card is-stat' }, [
                el('div', { class: 'k', text: 'Files' }),
                el('div', { class: 'v', text: String(data.total) }),
                el('div', { class: 'n', text: bytes(data.totalBytes) + ' total' })
            ]),
            el('div', { class: 'admin-card' }, [
                el('div', { class: 'k', text: 'Storage driver' }),
                el('div', { class: 'v', text: String(data.driver) }),
                el('div', { class: 'n', text: 'from configuration' })
            ]),
            el('div', { class: 'admin-card' }, [
                el('div', { class: 'k', text: 'Contents exposed' }),
                el('div', { class: 'v', text: 'No' }),
                el('div', { class: 'n', text: 'metadata only' })
            ])
        ]);
        bodyEl.appendChild(fileCards);

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
            'Timestamp, actor, action, target, result. The fields that actually exist.',
            table([
                { label: 'Timestamp', render: function (r) { return fmtDate(r.created_at); } },                    { label: 'Actor', render: function (r) { return r.actor_email || '-'; } },
                    { label: 'Action', key: 'action', mono: true },
                    { label: 'Target', key: 'target', wrap: true },
                { label: 'Result', render: function (r) {
                    var k = r.result === 'ok' ? 'ok' : r.result === 'denied' ? 'err' : 'warn';
                    return badge(r.result || 'unknown', k);
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
            'Each status comes from a real query or the actual running handler. Nothing is hard-coded.',
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
    /*
     * The AI console: paste a provider API key, watch it get IDENTIFIED
     * (prefix -> provider catalog) and VALIDATED (a live /models probe with
     * the pasted key), and only then stored. Until the probe succeeds nothing
     * is persisted, so the runtime can trust what it reads. The key value is
     * never shown again after saving — only a masked hint.
     */
    var AI_PROVIDERS = [
        { id: 'openai', label: 'OpenAI', prefixes: ['sk-'], baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        { id: 'openrouter', label: 'OpenRouter', prefixes: ['sk-or-'], baseUrl: 'https://openrouter.ai/api/v1', model: '' },
        { id: 'groq', label: 'Groq', prefixes: ['gsk_'], baseUrl: 'https://api.groq.com/openai/v1', model: '' },
        { id: 'gemini', label: 'Gemini (OpenAI-compatible)', prefixes: ['AIza'], baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '' }
    ];

    function detectAiProvider(key) {
        var best = null;
        for (var i = 0; i < AI_PROVIDERS.length; i++) {
            var p = AI_PROVIDERS[i];
            for (var j = 0; j < p.prefixes.length; j++) {
                if (key.indexOf(p.prefixes[j]) === 0 && (!best || p.prefixes[j].length > best.prefixes[0].length)) {
                    best = p;
                }
            }
        }
        return best;
    }

    function renderAi(data) {
        clear();

        bodyEl.appendChild(el('div', { class: 'admin-callout', html:
            '<strong>Provider setup.</strong> Paste an OpenAI-compatible API key. It is identified from its prefix and ' +
            '<strong>validated with a live request to the provider</strong> before anything is stored. ' +
            'The key value is never displayed again, only a masked hint.' }));

        bodyEl.appendChild(buildAiSetup(data));

        bodyEl.appendChild(el('div', { class: 'admin-cards' }, [
            el('div', { class: 'admin-card is-stat' }, [
                el('div', { class: 'k', text: 'Provider' }),
                el('div', { class: 'v', text: String(data.provider) }),
                el('div', { class: 'n', text: data.source === 'database' ? 'validated, stored in database' : 'target interface' })
            ]),
            el('div', { class: 'admin-card' }, [
                el('div', { class: 'k', text: 'Status' }),
                el('div', { class: 'v', text: String(data.status) }),
                el('div', { class: 'n', text: data.configured ? 'ready' : 'no validated key yet' })
            ]),
            el('div', { class: 'admin-card' }, [
                el('div', { class: 'k', text: 'Key' }),
                el('div', { class: 'v is-mono', text: data.keyHint || 'none' }),
                el('div', { class: 'n', text: data.validatedAt ? 'validated ' + fmtDate(data.validatedAt) : (data.hasKey ? 'from environment (unmanaged)' : 'not set') })
            ]),
            el('div', { class: 'admin-card' }, [
                el('div', { class: 'k', text: 'Model' }),
                el('div', { class: 'v', text: data.model || 'Not set' }),
                el('div', { class: 'n', text: data.endpoint ? String(data.endpoint) : 'from configuration' })
            ])
        ]));

        /* ---- active-config actions ---- */
        if (data.hasKey) {
            var actionRow = el('div', { class: 'admin-actions', style: 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px;' });
            var testBtn = btnPrimary('Test connection', 'plug-zap');
            testBtn.addEventListener('click', function () {
                testBtn.disabled = true;
                api('/ai/test', { method: 'POST' }).then(function (res) {
                    testBtn.disabled = false;
                    var note = el('div', { class: res.ok ? 'admin-callout' : 'admin-callout is-error', style: 'margin-top:10px;' });
                    note.innerHTML = res.ok
                        ? ph('check-circle').outerHTML + ' Connection OK: ' + (res.data && res.data.modelCount ? res.data.modelCount + ' models listed.' : 'provider reachable.')
                        : ph('x-circle').outerHTML + ' ' + escapeText((res.data && res.data.error) || 'Test failed.');
                    var old = bodyEl.querySelector('.ai-action-result');
                    if (old) old.remove();
                    note.classList.add('ai-action-result');
                    bodyEl.insertBefore(note, actionRow.nextSibling);
                }).catch(function () { testBtn.disabled = false; });
            });
            actionRow.appendChild(testBtn);

            if (data.source === 'database') {
                var removeBtn = btnPrimary('Remove key', 'trash');
                removeBtn.addEventListener('click', function () {
                    if (!window.confirm('Remove the stored AI key? The student AI features fall back to environment configuration (usually none).')) return;
                    api('/ai/config', { method: 'DELETE' }).then(function (res) {
                        if (res.ok) { loadAi(); } else { alert((res.data && res.data.error) || 'Remove failed.'); }
                    });
                });
                actionRow.appendChild(removeBtn);
            } else {
                actionRow.appendChild(el('span', { class: 'admin-note', text: 'Environment key: managed outside the app (Cloudflare secrets). Nothing to remove here.' }));
            }
            bodyEl.appendChild(actionRow);
        }

        bodyEl.appendChild(section('Configuration', null, table([
            { label: 'Setting', key: 'k' },
            { label: 'Value', render: function (r) { return r.v; }, wrap: true, mono: true }
        ], [
            { k: 'Config source', v: data.source === 'database' ? 'database (validated)' : data.source === 'environment' ? 'environment variables (read-only here)' : 'none yet' },
            { k: 'Base URL', v: data.endpoint || 'Not set' },
            { k: 'Model', v: data.model || 'Not set' },
            { k: 'OPENAI_API_KEY', v: data.hasKey ? 'present (value never exposed: ' + (data.keyHint || 'masked') + ')' : 'not set' },
            { k: 'Chat endpoint', v: data.chatEndpoint }
        ])));
    }

    /** The paste -> identify -> validate form. Server does the real work. */
    function buildAiSetup(data) {
        var wrap = el('div', { class: 'admin-card', style: 'margin-bottom:14px;' });
        wrap.appendChild(el('div', { class: 'k', text: 'Add a provider key' }));

        var keyInput = el('input', {
            class: 'admin-inline-input', type: 'password', autocomplete: 'off', spellcheck: 'false',
            placeholder: 'Paste API key (sk-… / gsk_… / AIza…)',
            'aria-label': 'API key'
        });
        keyInput.style.cssText = 'width:100%;margin:10px 0 6px;font-family:var(--mono,monospace);';

        var detectChip = el('span', { class: 'badge', text: 'waiting for key…' });
        detectChip.style.marginLeft = '6px';

        var baseUrlInput = el('input', {
            class: 'admin-inline-input is-mono', type: 'text', spellcheck: 'false',
            placeholder: 'https://provider.example/v1',
            'aria-label': 'Custom base URL'
        });
        baseUrlInput.style.cssText = 'width:100%;margin:6px 0;';

        var modelInput = el('input', {
            class: 'admin-inline-input is-mono', type: 'text', spellcheck: 'false',
            placeholder: 'model id (optional: suggested automatically)',
            'aria-label': 'Model id'
        });
        modelInput.style.cssText = 'width:100%;margin:6px 0;';

        var customRow = el('div', { style: 'display:none;' }, [baseUrlInput]);
        var detected = null;

        function refreshDetect() {
            var v = keyInput.value.trim();
            detected = v ? detectAiProvider(v) : null;
            if (v && detected) {
                detectChip.textContent = detected.label + ': detected';
                detectChip.className = 'badge badge-ok';
                customRow.style.display = 'none';
                if (detected.model) modelInput.placeholder = 'model id (suggested: ' + detected.model + ')';
            } else if (v) {
                detectChip.textContent = 'custom provider: base URL required';
                detectChip.className = 'badge badge-warn';
                customRow.style.display = '';
                modelInput.placeholder = 'model id (required for most custom providers)';
            } else {
                detectChip.textContent = 'waiting for key…';
                detectChip.className = 'badge';
                customRow.style.display = 'none';
            }
        }
        keyInput.addEventListener('input', refreshDetect);

        var saveBtn = btnPrimary('Validate & Save', 'shield-check');
        saveBtn.style.marginTop = '6px';
        var resultBox = el('div', { style: 'margin-top:10px;' });

        saveBtn.addEventListener('click', function () {
            var key = keyInput.value.trim();
            if (!key) { resultBox.innerHTML = calloutHtml('warn', 'Paste a key first.'); return; }
            if (!detected && !baseUrlInput.value.trim()) {
                resultBox.innerHTML = calloutHtml('warn', 'Unrecognized key prefix: fill in the custom base URL.');
                return;
            }
            saveBtn.disabled = true;
            detectChip.textContent = 'validating with the provider…';
            detectChip.className = 'badge';
            api('/ai/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key, baseUrl: baseUrlInput.value.trim(), model: modelInput.value.trim() })
            }).then(function (res) {
                saveBtn.disabled = false;
                if (res.ok) {
                    var d = res.data || {};
                    resultBox.innerHTML = calloutHtml('ok',
                        '<strong>Validated.</strong> ' + escapeText(String(d.provider || 'Provider')) + ' accepted the key' +
                        (d.modelCount ? ' (' + d.modelCount + ' models listed)' : '') +
                        (d.modelVerified ? ' and the requested model was verified.' : '.') +
                        ' Stored as ' + escapeText(String(d.keyHint || '')) + '. The AI features are live.');
                    setTimeout(loadAi, 1600);
                } else {
                    detectChip.textContent = 'validation failed';
                    detectChip.className = 'badge badge-err';
                    resultBox.innerHTML = calloutHtml('error', escapeText((res.data && res.data.error) || 'Validation failed. Nothing was stored.'));
                }
            }).catch(function () {
                saveBtn.disabled = false;
                resultBox.innerHTML = calloutHtml('error', 'Network error while validating. Nothing was stored.');
            });
        });

        wrap.appendChild(keyInput);
        var detectRow = el('div', { style: 'display:flex;align-items:center;margin:4px 0;' }, [el('span', { class: 'n', text: 'Detected:' }), detectChip]);
        wrap.appendChild(detectRow);
        wrap.appendChild(customRow);
        wrap.appendChild(modelInput);
        wrap.appendChild(saveBtn);
        wrap.appendChild(resultBox);
        return wrap;
    }

    function calloutHtml(kind, html) {
        var cls = kind === 'ok' ? '' : kind === 'warn' ? ' is-warn' : ' is-error';
        var icon = kind === 'ok' ? 'check-circle' : kind === 'warn' ? 'warning-circle' : 'x-circle';
        return '<div class="admin-callout' + cls + '">' + ph(icon).outerHTML + ' ' + html + '</div>';
    }

    function escapeText(s) {
        return String(s).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function loadAi() {
        loading();
        api('/ai').then(function (res) {
            if (!res.ok) return showError(res, 'ai');
            renderAi(res.data);
        }).catch(function () { showError(null, 'ai'); });
    }

    /* ------------------------------------------------------------ tools */
    /*
     * The tools editor: the admin surface for the student navigation.
     * One row per tool: visibility toggle, inline label/icon edit, reorder,
     * and add/delete. Builtins are badged and keep their page; customs can
     * point anywhere http(s) or same-origin. Every change hits the API and
     * then reloads the list, so what you see is what students get.
     */
    function toolRows(tools) {
        return tools.map(function (tool, index) {
            var isCustom = tool.kind === 'custom';
            var isDash = tool.id === 'dashboard';

            /* ---- visibility toggle (dashboard locked on) ---- */
            var toggleWrap = el('label', { class: 'admin-switch', title: isDash ? 'The dashboard is the fallback page and cannot be disabled' : (tool.enabled ? 'Visible' : 'Hidden') });
            var checkbox = el('input', { type: 'checkbox', 'aria-label': 'Show ' + tool.label });
            checkbox.checked = !!tool.enabled;
            if (isDash) { checkbox.disabled = true; checkbox.checked = true; }
            checkbox.addEventListener('change', function () {
                setToolEnabled(tool, checkbox.checked, checkbox);
            });
            toggleWrap.appendChild(checkbox);
            toggleWrap.appendChild(el('span', { class: 'track' }));

            /* ---- inline label edit ---- */
            var labelInput = el('input', {
                class: 'admin-inline-input',
                type: 'text',
                value: tool.label,
                maxlength: '40',
                'aria-label': 'Label for ' + tool.label
            });
            labelInput.addEventListener('change', function () {
                updateTool(tool, { label: labelInput.value }, labelInput);
            });

            /* ---- inline icon edit (Phosphor name or short glyph) ----
               The text input sits next to a live preview chip. */
            var iconInput = el('input', {
                class: 'admin-inline-input is-mono',
                type: 'text',
                value: tool.icon || '',
                placeholder: 'ph-icon',
                maxlength: '48',
                'aria-label': 'Icon for ' + tool.label
            });
            var iconChip = el('span', { class: 'tool-icon-chip' });
            function refreshIconChip() {
                iconChip.innerHTML = '';
                var cls = (iconInput.value || '').trim();
                iconChip.appendChild(el('i', { class: cls.indexOf('ph-') === 0 ? 'ph ' + cls : 'ph ph-globe', 'aria-hidden': 'true' }));
            }
            iconInput.addEventListener('input', refreshIconChip);
            iconInput.addEventListener('change', function () {
                updateTool(tool, { icon: iconInput.value }, iconInput);
            });
            refreshIconChip();
            var iconCell = el('div', { style: 'display:flex;align-items:center;gap:8px;' }, [iconChip, iconInput]);

            /* ---- reorder (immediate, optimistic; server is the arbiter) ---- */
            var upBtn = el('button', { class: 'admin-icon-btn', type: 'button', title: 'Move up', 'aria-label': 'Move ' + tool.label + ' up' }, [ph('arrow-up')]);
            var downBtn = el('button', { class: 'admin-icon-btn', type: 'button', title: 'Move down', 'aria-label': 'Move ' + tool.label + ' down' }, [ph('arrow-down')]);
            upBtn.disabled = index === 0;
            downBtn.disabled = index === tools.length - 1;
            upBtn.addEventListener('click', function () { swapOrder(tools[index - 1], tool); });
            downBtn.addEventListener('click', function () { swapOrder(tool, tools[index + 1]); });

            /* ---- delete (customs only) ---- */
            var actions = el('div', { style: 'display:flex;gap:6px;align-items:center;' }, [upBtn, downBtn]);
            if (isCustom) {
                var delBtn = el('button', { class: 'admin-icon-btn is-danger', type: 'button', title: 'Delete tool', 'aria-label': 'Delete ' + tool.label }, [ph('trash')]);
                delBtn.addEventListener('click', function () {
                    if (window.confirm('Delete the custom tool "' + tool.label + '"? It disappears from the student nav immediately.')) {
                        deleteTool(tool, delBtn);
                    }
                });
                actions.appendChild(delBtn);
            }

            return {
                id: tool.id,
                kind: tool.kind,
                label: tool.label,
                labelInput: labelInput,
                icon: tool.icon,
                iconCell: iconCell,
                href: tool.href,
                sortOrder: tool.sortOrder,
                enabled: tool.enabled,
                toggle: toggleWrap,
                actions: actions,
                _isCustom: isCustom,
                _isDash: isDash
            };
        });
    }

    function renderTools(data) {
        clear();
        var tools = data.tools || [];
        var enabledCount = tools.filter(function (t) { return t.enabled; }).length;

        bodyEl.appendChild(cards([
            { label: 'Tools', value: tools.length, note: 'rows in site_tools', stat: true },
            { label: 'Visible to students', value: enabledCount, note: 'enabled = true' },
            { label: 'Custom tools', value: tools.filter(function (t) { return t.kind === 'custom'; }).length, note: 'created in this panel' }
        ]));

        var addForm = el('div', { class: 'admin-toolbar admin-form' });
        var labelIn = el('input', { class: 'admin-input', type: 'text', placeholder: 'Label (e.g. Pomodoro)', maxlength: '40', 'aria-label': 'New tool label' });
        var hrefIn = el('input', { class: 'admin-input', type: 'text', placeholder: 'https://… or page.html', 'aria-label': 'New tool link' });
        var iconIn = el('input', { class: 'admin-input admin-input-icon is-mono', type: 'text', placeholder: 'ph-timer (icon)', maxlength: '48', 'aria-label': 'New tool icon' });
        var addBtn = btnPrimary('Add tool', 'plus');
        addBtn.addEventListener('click', function () {
            createTool({ label: labelIn.value, href: hrefIn.value, icon: iconIn.value }, addBtn, function (errText) {
                if (errText) showToolError(errText);
                else { labelIn.value = ''; hrefIn.value = ''; iconIn.value = ''; }
            });
        });
        [hrefIn, iconIn].forEach(function (inp) {
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addBtn.click(); });
        });
        addForm.appendChild(labelIn);
        addForm.appendChild(hrefIn);
        addForm.appendChild(iconIn);
        addForm.appendChild(addBtn);
        bodyEl.appendChild(addForm);

        var errorSlot = el('div', { id: 'tools-error-slot' });
        bodyEl.appendChild(errorSlot);

        bodyEl.appendChild(section(
            'Navigation tools',
            'Toggle visibility, edit labels and icons inline, reorder with the arrows. Changes apply to the student site on its next page load (a 5 minute cache may delay it). The dashboard cannot be disabled: it is where redirected users land.',
            table([
                { label: 'Show', render: function (r) { return r.toggle; } },
                { label: 'Tool', render: function (r) { return r.labelInput; } },
                { label: 'Icon', render: function (r) { return r.iconCell; } },
                { label: 'Kind', render: function (r) { return badge(r.kind, r._isCustom ? 'custom' : 'builtin'); } },
                { label: 'Links to', render: function (r) {
                    if (!r._isCustom) return el('code', { class: 'admin-mono', text: r.href });
                    var link = el('a', { href: r.href, target: '_blank', rel: 'noopener noreferrer' });
                    link.textContent = r.href;
                    return link;
                }, wrap: true },
                { label: 'Order', render: function (r) { return r.sortOrder; }, num: true },
                { label: 'Actions', render: function (r) { return r.actions; } }
            ], toolRows(tools))
        ));
    }

    function showToolError(message) {
        var slot = document.getElementById('tools-error-slot');
        if (!slot) return;
        slot.innerHTML = '';
        slot.appendChild(el('div', { class: 'admin-callout admin-error', text: message }));
        window.setTimeout(function () {
            if (slot.firstChild && slot.firstChild.textContent === message) slot.innerHTML = '';
        }, 6000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function loadTools() {
        loading();
        api('/tools').then(function (res) {
            if (!res.ok) return showError(res, 'tools');
            renderTools(res.data);
        }).catch(function () { showError(null, 'tools'); });
    }

    function setToolEnabled(tool, enabled, checkbox) {
        checkbox.disabled = true;
        apiSend('PUT', '/tools/' + encodeURIComponent(tool.id), { enabled: enabled }).then(function (res) {
            if (!res.ok) {
                checkbox.checked = !enabled; // snap back to the server truth
                showToolError((res.data && res.data.error) || 'Could not update the tool.');
                checkbox.disabled = false;
                return;
            }
            loadTools();
        }).catch(function () {
            checkbox.checked = !enabled;
            checkbox.disabled = false;
            showToolError('Could not reach the server.');
        });
    }

    function updateTool(tool, patch, input) {
        apiSend('PUT', '/tools/' + encodeURIComponent(tool.id), patch).then(function (res) {
            if (!res.ok) {
                showToolError((res.data && res.data.error) || 'Could not update the tool.');
                loadTools(); // restore server truth into the inputs
            }
            // Success: no reload needed, the input already shows the new value.
        }).catch(function () {
            showToolError('Could not reach the server.');
            loadTools();
        });
    }

    function swapOrder(upper, lower) {
        if (!upper || !lower) return;
        Promise.all([
            apiSend('PUT', '/tools/' + encodeURIComponent(upper.id), { sortOrder: lower.sortOrder }),
            apiSend('PUT', '/tools/' + encodeURIComponent(lower.id), { sortOrder: upper.sortOrder })
        ]).then(function (results) {
            var failed = results.filter(function (r) { return !r.ok; });
            if (failed.length) {
                showToolError((failed[0].data && failed[0].data.error) || 'Could not reorder.');
            }
            loadTools();
        }).catch(function () {
            showToolError('Could not reach the server.');
            loadTools();
        });
    }

    function createTool(payload, btn, done) {
        btn.disabled = true;
        apiSend('POST', '/tools', payload).then(function (res) {
            btn.disabled = false;
            if (!res.ok) { done((res.data && res.data.error) || 'Could not create the tool.'); return; }
            loadTools();
        }).catch(function () { btn.disabled = false; done('Could not reach the server.'); });
    }

    function deleteTool(tool, btn) {
        btn.disabled = true;
        apiSend('DELETE', '/tools/' + encodeURIComponent(tool.id)).then(function (res) {
            if (!res.ok) {
                btn.disabled = false;
                showToolError((res.data && res.data.error) || 'Could not delete the tool.');
                return;
            }
            loadTools();
        }).catch(function () { btn.disabled = false; showToolError('Could not reach the server.'); });
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
        document.title = 'StudyHub Admin: ' + SECTIONS[section].title;
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
