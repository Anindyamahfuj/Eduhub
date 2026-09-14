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
import { adminRoutes } from './routes/admin.js';
import { toolRoutes } from './routes/tools.js';
import { writeAudit } from './lib/audit.js';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

// CORS: validate origin against allowlist to prevent CSRF attacks.
const ALLOWED_ORIGINS = [
  'https://studyhub-b3t.pages.dev',
  'https://studyhub.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use('*', cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return origin;
    // Allow same-origin requests
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    // Allow localhost variants for development
    if (origin.match(/^https?:\/\/localhost(:\d+)?$/) || origin.match(/^https?:\/\/127\.0\.0\.1(:\d+)?$/)) {
      return origin;
    }
    return '';
  },
  credentials: true
}));

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
// Public, unauthenticated: the enabled site tools for the student nav.
app.route('/tools', toolRoutes);
// Developer-only. Every route inside is behind `requireDeveloper`, which is
// enforced server-side against `users.role` (see src/lib/helpers.ts).
app.route('/admin', adminRoutes);

app.notFound((c) => json({ ok: false, error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('[studyhub] unhandled error:', err?.message);
  // Record the API error in the audit log (non-fatal; never throws).
  c.executionCtx.waitUntil(
    writeAudit(c.env as Env, {
      action: 'api.error',
      target: new URL(c.req.url).pathname,
      result: 'error',
      detail: err?.message
    })
  );
  return json({ ok: false, error: 'Internal server error' }, 500);
});

export default app;
