/**
 * Shared backend helpers: JSON responses, session tokens, and auth guards.
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
}

/** Resolve the current user from the session cookie, or null. */
export async function getCurrentUser(c: Context): Promise<SessionUser | null> {
  const env = c.env as Env;
  const token = readCookie(c.req.header('Cookie'), SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.email AS email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionUser>();
  return row ?? null;
}

/** Middleware: reject unauthenticated API calls, scoped to a single user. */
export async function requireUser(c: Context, next: Next): Promise<Response | void> {
  const user = await getCurrentUser(c);
  if (!user) return fail('Not authenticated', 401);
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
