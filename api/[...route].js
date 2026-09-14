/**
 * Vercel serverless entry for /api/*.
 *
 * Cloudflare Pages runs the Hono app through functions/api/[[route]].ts using
 * the cloudflare-pages adapter, which injects the CF env (D1 binding, etc.)
 * into c.env automatically. On Vercel there is no D1 binding, so this
 * function:
 *
 *   1. Builds a D1-compatible `DB` binding from node:sqlite (src/lib/db-vercel.js).
 *   2. Applies migrations/*.sql on first boot (idempotent).
 *   3. Runs the bundled Hono app from dist/server.mjs, passing the env as
 *      bindings.
 *
 * The app code is unchanged -- it still calls env.DB.prepare(...).all() /
 * .first() / .batch() and reads env.OPENAI_* / env.STORAGE_DRIVER, all of which
 * this function satisfies.
 *
 * AI is opt-in: set OPENAI_API_KEY + OPENAI_MODEL (or OPENAI_BASE_URL) in the
 * Vercel project env to enable it; otherwise the scaffold stays inert.
 */
import { getD1 } from '../src/lib/db-vercel.js';

const db = getD1();
db.ensureMigrated();

const { app } = await import('../dist/server.mjs');

const env = {
  DB: db,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local'
};

export const config = { runtime: 'nodejs' };

// hono/vercel's handle() calls app.fetch(req) with no bindings; pass env
// explicitly so c.env.DB / c.env.OPENAI_* resolve to the shim above.
export default (request) => app.fetch(request, env);
