/**
 * The developer admin shell, served by the /admin Pages Function.
 *
 * WHY THIS IS A MODULE AND NOT public/admin/index.html:
 * Cloudflare Pages normalizes a directory index: fetching `/admin/index.html`
 * 308-redirects to `/admin/`, which re-entered the guard in a loop. Serving the
 * shell as a string sidesteps Pages' HTML/URL normalization entirely — and,
 * more importantly, it means there is NO static /admin/index.html that could
 * ever be served directly, bypassing the server-side guard.
 *
 * The shell contains no data and no authorization logic. It only provides the
 * layout; the client reads /api/admin/*, which is guarded server-side.
 */
export const ADMIN_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>StudyHub — Developer Admin</title>
    <link rel="icon" href="/logoedu.png">
    <link rel="stylesheet" href="/admin/admin.css">
</head>
<body>
    <div class="admin-shell">
        <aside class="admin-sidebar" id="admin-sidebar">
            <div class="admin-brand">
                <img src="/logoedu.png" alt="" width="28" height="28">
                <div>
                    <strong>StudyHub</strong>
                    <span>Developer Admin</span>
                </div>
            </div>
            <nav class="admin-nav" id="admin-nav" aria-label="Admin sections">
                <a href="/admin" data-section="overview"><span>Overview</span></a>
                <a href="/admin/users" data-section="users"><span>Users</span></a>
                <a href="/admin/data" data-section="data"><span>Data</span></a>
                <a href="/admin/files" data-section="files"><span>Files</span></a>
                <a href="/admin/logs" data-section="logs"><span>Logs</span></a>
                <a href="/admin/system" data-section="system"><span>System</span></a>
                <a href="/admin/ai" data-section="ai"><span>AI</span></a>
            </nav>
            <div class="admin-identity" id="admin-identity">
                <span class="admin-who" id="admin-who">…</span>
                <button type="button" class="admin-logout" id="admin-logout">Sign out</button>
            </div>
        </aside>

        <main class="admin-main">
            <header class="admin-header">
                <h1 id="admin-title">Overview</h1>
                <p class="admin-subtitle" id="admin-subtitle">Developer-only statistics from the live database.</p>
            </header>
            <div class="admin-body" id="admin-body" aria-live="polite">
                <div class="admin-loading">Loading…</div>
            </div>
        </main>
    </div>
    <script src="/admin/admin.js"></script>
</body>
</html>
`;
