/**
 * Shared backend helpers: JSON responses, session tokens, and auth guards.
 *
 * Authorization is enforced HERE, server-side. The `role` column on `users` is
 * the single source of truth; nothing about authorization is decided on the
 * client.
 */
import type { Context, Next } from 'hono';

export interface Env {
  DB: D1Database;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  /** 'local' (D1-backed blobs, default) or 'r2' (Cloudflare R2). */
  STORAGE_DRIVER?: string;
  /** R2 bucket binding — only present once configured at deploy time. */
  FILES?: R2Bucket;
}

export const SESSION_COOKIE = 'studyhub_session';
const SESSION_DAYS = 30;

/** JSON helper with no-store caching (API responses must never be cached). */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export function ok(data: Record<string, unknown> = {}): Response {
  return json({ ok: true, ...data });
}

export function fail(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

/** Cryptographically random hex string. */
export function randomHex(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Only the hash of a session token is persisted. */
export async function issueSession(env: Env, userId: string): Promise<string> {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expires)
    .run();
  return token;
}

export function sessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86400}`
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export interface SessionUser {
  id: string;
  email: string;
  /** 'student' | 'developer' — the server-side authorization source of truth. */
  role: string;
}

export const DEVELOPER_ROLE = 'developer';

/**
 * Resolve the current user from a raw Cookie header, or null.
 *
 * Exported separately from getCurrentUser so the Pages Functions page guard
 * (which has a Functions context, not a Hono context) can reuse it.
 */
export async function resolveUser(
  env: Env,
  cookieHeader: string | undefined
): Promise<SessionUser | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.email AS email, COALESCE(u.role, 'student') AS role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

/** Resolve the current user from a Hono context, or null. */
export async function getCurrentUser(c: Context): Promise<SessionUser | null> {
  return resolveUser(c.env as Env, c.req.header('Cookie'));
}

export function isDeveloper(user: SessionUser | null): boolean {
  return Boolean(user && user.role === DEVELOPER_ROLE);
}

/** Middleware: reject unauthenticated API calls, scoped to a single user. */
export async function requireUser(c: Context, next: Next): Promise<Response | void> {
  const user = await getCurrentUser(c);
  if (!user) return fail('Not authenticated', 401);
  c.set('user', user);
  await next();
}

/**
 * Middleware: developer-only. Fails closed.
 *   - unauthenticated -> 401
 *   - authenticated but not a developer -> 403
 * Both outcomes are recorded in the audit log.
 */
export async function requireDeveloper(c: Context, next: Next): Promise<Response | void> {
  const user = await getCurrentUser(c);
  if (!user) {
    const { writeAudit } = await import('./audit.js');
    await writeAudit(c.env as Env, {
      action: 'authz.denied',
      target: new URL(c.req.url).pathname,
      result: 'denied',
      detail: 'unauthenticated'
    });
    return fail('Not authenticated', 401);
  }
  if (!isDeveloper(user)) {
    const { writeAudit } = await import('./audit.js');
    await writeAudit(c.env as Env, {
      action: 'authz.denied',
      actorId: user.id,
      actorEmail: user.email,
      target: new URL(c.req.url).pathname,
      result: 'denied',
      detail: 'not a developer'
    });
    return fail('Developer authorization required', 403);
  }
  c.set('user', user);
  await next();
}

export function currentUser(c: Context): SessionUser {
  return c.get('user') as SessionUser;
}

export function isSecureRequest(c: Context): boolean {
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}
