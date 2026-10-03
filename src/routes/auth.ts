/**
 * Email + Google authentication backed by D1.
 *
 * Passwords: PBKDF2-HMAC-SHA256 (src/lib/password.ts).
 * Sessions: random 256-bit tokens; only SHA-256 hashes stored.
 * Google: GIS ID tokens verified with Web Crypto + Google JWKS
 *         (Workers-native — no Node libraries).
 * Every response is scoped to the authenticated user.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import {
  SESSION_COOKIE,
  clearCookie,
  fail,
  isSecureRequest,
  issueSession,
  json,
  ok,
  readCookie,
  sessionCookie,
  sha256Hex,
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

/* ================================================================
   Google Identity Services — POST /api/auth/google { credential }
   Web Crypto verification of Google's RS256 ID token (JWKS),
   email-upsert into D1, then the exact same session as login.
   ================================================================ */

interface GPayload {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
}
let gJwks: { keys: JsonWebKey[]; at: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + (b.length % 4 ? '='.repeat(4 - (b.length % 4)) : ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function jsonB64<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T;
}

async function verifyGoogleIdToken(
  token: string,
  clientId: string
): Promise<GPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header: { alg?: string; kid?: string };
  let payload: GPayload;
  try {
    header = jsonB64(parts[0]);
    payload = jsonB64(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    return null;
  }
  if (payload.aud !== clientId) return null; // token must be minted for THIS app
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60_000) return null; // fresh

  // Google's public keys — cached in the isolate for 12h
  if (!gJwks || Date.now() - gJwks.at > 12 * 3600_000) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) return null;
    gJwks = { keys: (await r.json<{ keys: JsonWebKey[] }>()).keys, at: Date.now() };
  }
  const jwk = gJwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    signed
  );
  return valid ? payload : null;
}

/** POST /api/auth/google  { credential } */
authRoutes.post('/google', async (c) => {
  const clientId = (c.env as Env).GOOGLE_CLIENT_ID;
  if (!clientId) return fail('Google sign-in is not configured on the server.', 501);

  let body: { credential?: string };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }
  const credential = body.credential ?? '';
  if (!credential) return fail('Missing Google credential.');

  const payload = await verifyGoogleIdToken(credential, clientId);
  if (!payload?.email) return fail('Invalid Google credential.', 401);
  if (payload.email_verified === false) return fail('Google email is not verified.', 401);

  const email = payload.email.trim().toLowerCase();

  let user = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string }>();

  if (!user) {
    // First Google sign-in: create the account. Sentinel password_hash that
    // no password can ever verify — Google accounts stay Google-only.
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(id, email, '!google-oauth')
      .run();
    await c.env.DB.prepare('INSERT INTO workspaces (user_id, data) VALUES (?, ?)')
      .bind(id, '{}')
      .run();
    user = { id, email };
  }

  const token = await issueSession(c.env, user.id);
  c.header('Set-Cookie', sessionCookie(token, isSecureRequest(c)));
  c.executionCtx.waitUntil(
    writeAudit(c.env, {
      action: 'auth.google',
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
  if (user) {
    const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE);
    if (token) {
      const tokenHash = await sha256Hex(token);
      await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(tokenHash).run().catch(() => {});
    }
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
  c.header('Set-Cookie', clearCookie(isSecureRequest(c)));
  return ok();
});

/** GET /api/auth/me */
authRoutes.get('/me', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return fail('Not authenticated', 401);
  return ok({ user: { id: user.id, email: user.email } });
});
