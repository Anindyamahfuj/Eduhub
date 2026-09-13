/**
 * Server-side guard for the /admin pages.
 *
 * This is the ONLY place a request for an /admin page is allowed through. It is
 * a Cloudflare Pages Function (functions/admin/[[route]].ts), so it runs on the
 * server *before* any admin asset is served — it cannot be bypassed by editing
 * JavaScript, hiding a link, or setting a client-side variable.
 *
 * Decision matrix (also enforced independently by `requireDeveloper` for
 * /api/admin/*):
 *
 *   unauthenticated -> 302 to /login.html
 *   student         -> 403 (HTML), audited as authz.denied
 *   developer       -> allowed
 *
 * The role is read from `users.role` via the same session resolution the API
 * uses, so there is exactly one source of truth.
 */
import type { Env } from './helpers.js';
import { resolveUser } from './helpers.js';
import { writeAudit } from './audit.js';

/** Static assets that contain no data and must load for the panel to render. */
const ASSET_RE = /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|map|txt|woff2?)$/i;

export function isAdminAsset(pathname: string): boolean {
  return ASSET_RE.test(pathname);
}

/** Minimal 403 page. Deliberately reveals nothing about the account beyond a refusal. */
export function deniedHtml(email: string | null): string {
  const who = email ? ` for <strong>${escapeHtml(email)}</strong>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Access denied — StudyHub</title>
<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{max-width:440px;padding:32px;text-align:center}
h1{font-size:20px;margin:0 0 10px}p{color:#94a3b8;line-height:1.6;font-size:14px}
a{color:#c7d2fe}</style></head>
<body><div class="box">
<h1>403 — Access denied</h1>
<p>The developer admin area is restricted${who}. This request was refused on the server.</p>
<p><a href="/index.html">Return to StudyHub</a> · <a href="/login.html">Sign in with another account</a></p>
</div></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/**
 * Returns a Response to short-circuit the request (denied), or null to allow.
 * Called only for page routes, never for static assets.
 */
export async function guardAdminPage(
  env: Env,
  request: Request,
  pathname: string
): Promise<Response | null> {
  const user = await resolveUser(env, request.headers.get('Cookie'));

  if (!user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login.html', 'Cache-Control': 'no-store' }
    });
  }

  if (user.role !== 'developer') {
    await writeAudit(env, {
      action: 'authz.denied',
      actorId: user.id,
      actorEmail: user.email,
      target: pathname,
      result: 'denied',
      detail: 'page: not a developer'
    });
    return new Response(deniedHtml(user.email), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  return null;
}
