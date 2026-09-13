/**
 * Email + password authentication backed by D1.
 *
 * Passwords are hashed with PBKDF2-HMAC-SHA256 (see src/lib/password.ts).
 * Session tokens are random 256-bit values; only their SHA-256 hash is stored.
 * Every response is scoped to the authenticated user — no cross-user access.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import {
  clearCookie,
  fail,
  isSecureRequest,
  issueSession,
  json,
  ok,
  sessionCookie,
  getCurrentUser
} from '../lib/helpers.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { writeAudit } from '../lib/audit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export const authRoutes = new Hono<{ Bindings: Env }>();

/** POST /api/auth/register  { email, password } */
authRoutes.post('/register', async (c) => {
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.');
  if (password.length < MIN_PASSWORD) {
    return fail(`Password must be at least ${MIN_PASSWORD} characters.`);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>();
  if (existing) return fail('An account with that email already exists.', 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .bind(id, email, passwordHash)
    .run();

  // Every user gets an isolated, empty workspace matching the frontend defaults.
  await c.env.DB.prepare('INSERT INTO workspaces (user_id, data) VALUES (?, ?)')
    .bind(id, '{}')
    .run();

  const token = await issueSession(c.env, id);
  c.header('Set-Cookie', sessionCookie(token, isSecureRequest(c)));
  c.executionCtx.waitUntil(
    writeAudit(c.env, {
      action: 'auth.register',
      actorId: id,
      actorEmail: email,
      target: 'account',
      result: 'ok'
    })
  );
  return json({ ok: true, user: { id, email } }, 201);
});

/** POST /api/auth/login  { email, password } */
authRoutes.post('/login', async (c) => {
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash FROM users WHERE email = ?'
  )
    .bind(email)
    .first<{ id: string; email: string; password_hash: string }>();

  // Same generic message whether the user is missing or the password is wrong.
  if (!user) {
    c.executionCtx.waitUntil(
      writeAudit(c.env, {
        action: 'auth.login_failed',
        actorEmail: email || null,
        target: 'account',
        result: 'denied',
        detail: 'unknown account'
      })
    );
    return fail('Incorrect email or password.', 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    c.executionCtx.waitUntil(
      writeAudit(c.env, {
        action: 'auth.login_failed',
        actorId: user.id,
        actorEmail: user.email,
        target: 'account',
        result: 'denied',
        detail: 'bad password'
      })
    );
    return fail('Incorrect email or password.', 401);
  }

  const token = await issueSession(c.env, user.id);
  c.header('Set-Cookie', sessionCookie(token, isSecureRequest(c)));
  c.executionCtx.waitUntil(
    writeAudit(c.env, {
      action: 'auth.login',
      actorId: user.id,
      actorEmail: user.email,
      target: 'account',
      result: 'ok'
    })
  );
  return ok({ user: { id: user.id, email: user.email } });
});

/** POST /api/auth/logout */
authRoutes.post('/logout', async (c) => {
  const user = await getCurrentUser(c);
  c.header('Set-Cookie', clearCookie(isSecureRequest(c)));
  if (user) {
    c.executionCtx.waitUntil(
      writeAudit(c.env, {
        action: 'auth.logout',
        actorId: user.id,
        actorEmail: user.email,
        target: 'account',
        result: 'ok'
      })
    );
  }
  return ok();
});

/** GET /api/auth/me */
authRoutes.get('/me', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return fail('Not authenticated', 401);
  return ok({ user: { id: user.id, email: user.email } });
});
