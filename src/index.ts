/**
 * StudyHub API — Hono application.
 *
 * Mounted under /api/* by the Cloudflare Pages Functions entry point
 * (functions/api/[[route]].ts). Static assets are served straight from the
 * build output directory, so this app only ever handles API traffic.
 *
 * Every data route is authenticated and strictly scoped to one user.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './lib/helpers.js';
import { json } from './lib/helpers.js';
import { authRoutes } from './routes/auth.js';
import { workspaceRoutes } from './routes/workspace.js';
import { fileRoutes } from './routes/files.js';
import { aiRoutes } from './routes/ai.js';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Same-origin in production; reflecting the origin keeps local tooling simple.
app.use('*', cors({ origin: (origin) => origin, credentials: true }));

app.get('/health', (c) =>
  json({
    ok: true,
    service: 'studyhub-api',
    storageDriver: c.env.STORAGE_DRIVER || 'local',
    aiConfigured: Boolean(c.env.OPENAI_API_KEY && c.env.OPENAI_MODEL),
    time: new Date().toISOString()
  })
);

app.route('/auth', authRoutes);
app.route('/workspace', workspaceRoutes);
app.route('/files', fileRoutes);
app.route('/ai', aiRoutes);

app.notFound((c) => json({ ok: false, error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('[studyhub] unhandled error:', err?.message);
  return json({ ok: false, error: 'Internal server error' }, 500);
});

export default app;
