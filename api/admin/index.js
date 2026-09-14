/**
 * Vercel serverless entry for /api/admin/*.
 *
 * The developer-only admin API is guarded by `requireDeveloper` in
 * src/routes/admin.ts, which reads `users.role` from the DB. On Vercel the DB
 * binding is the node:sqlite shim (src/lib/db-vercel.js), so this function
 * wires it up exactly like api/[...route].js does.
 *
 * Splitting /admin into its own function lets the admin pages be served as
 * static HTML (public/admin/index.html) while the API stays serverless -- the
 * authorization decision is made server-side, never client-side.
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

export default (request) => app.fetch(request, env);
