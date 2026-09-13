/**
 * Minimal audit logging.
 *
 * No logging/activity system existed before the admin panel, so this is the
 * minimum required to satisfy the admin "Logs" section. It records only the
 * events the plan calls for, using fields that actually exist.
 *
 * Logging is deliberately non-fatal: a failure to write a log entry must never
 * break the request that produced it.
 */
import type { Env } from './helpers.js';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'authz.denied'
  | 'admin.view'
  | 'admin.role_change'
  | 'file.upload_failed'
  | 'api.error';

export interface AuditEntry {
  action: AuditAction | string;
  actorId?: string | null;
  actorEmail?: string | null;
  target?: string | null;
  result?: 'ok' | 'denied' | 'error' | string;
  detail?: string | null;
}

/** Append one audit entry. Never throws. */
export async function writeAudit(env: Env, entry: AuditEntry): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (actor_id, actor_email, action, target, result, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.actorId ?? null,
        entry.actorEmail ?? null,
        entry.action,
        entry.target ?? null,
        entry.result ?? 'ok',
        entry.detail ? String(entry.detail).slice(0, 500) : null
      )
      .run();
  } catch {
    // Logging must never surface as a request failure (e.g. if the migration
    // has not been applied yet on a fresh checkout).
  }
}

/** Test whether the audit table is present, so the UI can say so honestly. */
export async function auditTableExists(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'`
    ).first<{ name: string }>();
    return Boolean(row);
  } catch {
    return false;
  }
}
