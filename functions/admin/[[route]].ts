/**
 * Cloudflare Pages Functions entry for the developer admin area.
 *
 * Route: functions/admin/[[route]].ts -> matches /admin and /admin/*
 *
 * This runs on the SERVER for every /admin request, before anything is served.
 * It is the page-level half of the authorization requirement; the other half is
 * `requireDeveloper` on /api/admin/*.
 *
 *   - /admin/<asset>.{css,js,png,...}  -> served as a static asset (no data)
 *   - /admin, /admin/users, ...        -> guardAdminPage()
 *        unauthenticated -> 302 /login.html
 *        student         -> 403
 *        developer       -> the admin shell (rendered from source)
 *
 * The shell is returned from src/client/admin-shell.js rather than a static
 * public/admin/index.html. Two reasons:
 *   1. Pages normalizes a directory index (/admin/index.html -> 308 /admin/),
 *      which would loop back into this handler.
 *   2. A static admin HTML file could be requested directly, bypassing the
 *      guard. Serving it only from this module means the guard cannot be
 *      skipped.
 */
import type { Env } from '../../src/lib/helpers.js';
import { guardAdminPage, isAdminAsset } from '../../src/lib/adminGuard.js';
// @ts-expect-error - JS module without type declarations; runtime contract is the exported ADMIN_SHELL string.
import { ADMIN_SHELL } from '../../src/client/admin-shell.js';

export const onRequest = async (context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const url = new URL(context.request.url);

  // Static assets are presentation-only (no data) and carry no authorization
  // decision, so they are served directly by Pages.
  if (isAdminAsset(url.pathname)) return context.next();

  // Server-side gate: unauthenticated -> 302, student -> 403, developer -> null.
  const denied = await guardAdminPage(context.env, context.request, url.pathname);
  if (denied) return denied;

  // Authorized developer. Every /admin page route gets the same shell; the
  // client reads the path and renders the matching section. No dir-index
  // redirect, no static file, no way around the guard above.
  return new Response(ADMIN_SHELL, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
};
