/**
 * Next.js API catch-all: runs the Hono app (dist/server.mjs) for /api/*.
 *
 * Why this exists instead of root-level `api/*.js` functions:
 *   1. With `framework: nextjs`, Vercel only matched single-segment paths
 *      (e.g. /api/health) to `api/[...route].js`. Every nested route --
 *      /api/auth/me, /api/admin/*, /api/workspace/*, ... -- fell through to
 *      pages/[...slug].js, which returned the 404 HTML page with status 200.
 *      The admin panel (and login) then failed to parse it as JSON, so every
 *      admin section showed "Request failed."
 *   2. `pages/api/[...route].js` is claimed by Next's API router before any
 *      page route, so ALL /api/* depths reach the Hono app.
 *
 * The app code is unchanged -- it still calls env.DB.prepare(...).all() /
 * .first() / .batch() and reads env.OPENAI_* / env.STORAGE_DRIVER:
 *   - DB comes from the node:sqlite shim (src/lib/db-vercel.js).
 *   - Hono expects a Cloudflare-style executionCtx (auth/audit call
 *     c.executionCtx.waitUntil), so a Node no-op ctx is passed explicitly.
 *   - Next's body parser is disabled; the raw body is forwarded so Hono
 *     sees the exact bytes (logins, file uploads, etc.).
 *   - Developer bootstrap via DEVELOPER_EMAILS (comma-separated): right after
 *     a successful POST /api/auth/login or /api/auth/register, the account's
 *     email is compared (lowercased) and granted role='developer' on match.
 *     Original auth code stays untouched; without this a fresh DB has zero
 *     developers and the admin panel can never be entered.
 */
import { getD1 } from '../../src/lib/db-vercel.js';

let cachedApp = null;
async function loadApp() {
  if (!cachedApp) {
    const mod = await import('../../dist/server.mjs');
    cachedApp = mod.app;
  }
  return cachedApp;
}

// Let Hono own the request body; Next must not parse it first.
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    const db = await getD1();
    if (typeof db.ensureMigrated === 'function') db.ensureMigrated();
    const app = await loadApp();

    const env = {
      DB: db,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local'
    };

    // Cloudflare provides this; on Node it must be supplied or every
    // c.executionCtx.waitUntil() call (auth, audit, files) throws.
    const executionCtx = {
      waitUntil: (promise) => {
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      },
      passThroughOnException: () => {}
    };

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const pathname = String(req.url || '/').split('?')[0];

    let rawBody;
    if (req.method !== 'GET' && req.method !== 'HEAD') rawBody = await readRawBody(req);
    const request = new Request(`${protocol}://${host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      duplex: 'half',
      body: rawBody && rawBody.length ? rawBody : undefined
    });

    const response = await app.fetch(request, env, executionCtx);

    // Developer bootstrap: see header comment. Must never break auth.
    if (
      response.ok &&
      (pathname === '/api/auth/login' || pathname === '/api/auth/register')
    ) {
      try {
        const allow = String(process.env.DEVELOPER_EMAILS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (allow.length && rawBody && rawBody.length) {
          const parsed = JSON.parse(rawBody.toString('utf8'));
          const email =
            parsed && typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
          if (email && allow.includes(email)) {
            db.prepare("UPDATE users SET role = 'developer' WHERE email = ?").bind(email).run();
          }
        }
      } catch {
        /* bootstrap must never break auth */
      }
    }

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return; // handled below (multi-cookie safe)
      res.setHeader(key, value);
    });
    if (typeof response.headers.getSetCookie === 'function') {
      const cookies = response.headers.getSetCookie();
      if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
    } else {
      const single = response.headers.get('set-cookie');
      if (single) res.setHeader('Set-Cookie', single);
    }

    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error('[pages/api] unhandled bridge error:', err && err.message ? err.message : err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Internal server error' });
    else res.end();
  }
}
