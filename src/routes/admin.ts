/**
 * Developer admin API — /api/admin/*
 *
 * Every route in this module is behind `requireDeveloper`, which fails closed:
 *   - unauthenticated      -> 401
 *   - authenticated student -> 403
 *   - developer            -> allowed
 *
 * Authorization is decided on the server from `users.role`. Nothing here is
 * enforceable — or bypassable — from the browser.
 *
 * The panel reads the real schema: totals for the StudyHub modules come from
 * the actual `workspaces.data` JSON document, and file rows from `files`.
 * Metrics that cannot be derived from real data are not reported at all.
 */
import { Hono } from 'hono';
import type { Env, SessionUser } from '../lib/helpers.js';
import { currentUser, fail, isDeveloper, json, ok, requireDeveloper } from '../lib/helpers.js';
import { auditTableExists, writeAudit } from '../lib/audit.js';
import { fileDriver } from '../lib/files.js';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', requireDeveloper);

/** Server-side gate result, used by the /admin page guard as well. */
adminRoutes.get('/whoami', (c) => {
  const user = currentUser(c);
  return ok({ user: { id: user.id, email: user.email, role: user.role }, developer: true });
});

/* ---------------------------------------------------------------- Overview */

/**
 * The StudyHub modules that live inside the workspace JSON document, as they
 * actually exist in `getDefaultData()` in frontend/script.js. Counted from the
 * stored document, not from assumed tables.
 */
const WORKSPACE_COLLECTIONS = [
  { key: 'notes', label: 'Notes' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'habits', label: 'Habits' },
  { key: 'readingList', label: 'Reading list' },
  { key: 'notices', label: 'Notices' },
  { key: 'sessions', label: 'Study sessions' },
  { key: 'pomodoroLogs', label: 'Pomodoro logs' },
  { key: 'deepWorkLogs', label: 'Deep work logs' },
  { key: 'files', label: 'Files (in document)' },
  { key: 'searches', label: 'Searches' },
  { key: 'history', label: 'Activity history' },
  { key: 'goals', label: 'Goals' }
] as const;

function countCollection(doc: Record<string, unknown>, key: string): number {
  const value = doc?.[key];
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value as object).length;
  return 0;
}

adminRoutes.get('/overview', async (c) => {
  const user = currentUser(c);

  const totalUsers = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users')
    .first<{ n: number }>();
  const developers = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'developer'`
  ).first<{ n: number }>();

  // Factual session facts only. No period is invented to define "active".
  const nowIso = new Date().toISOString();
  const withUnexpiredSession = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE expires_at > ?`
  )
    .bind(nowIso)
    .first<{ n: number }>();
  const activeSessions = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?`
  )
    .bind(nowIso)
    .first<{ n: number }>();

  const totalFiles = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM files')
    .first<{ n: number }>();
  const totalFileBytes = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(size), 0) AS n FROM files'
  ).first<{ n: number }>();
  const totalWorkspaces = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM workspaces')
    .first<{ n: number }>();

  // Module totals, aggregated from the real workspace documents.
  const rows = await c.env.DB.prepare('SELECT data FROM workspaces').all<{ data: string }>();
  const totals: Record<string, number> = {};
  for (const col of WORKSPACE_COLLECTIONS) totals[col.key] = 0;
  totals.flashcardDecks = 0;
  totals.flashcards = 0;
  totals.plannerEntries = 0;

  let parsedDocs = 0;
  for (const row of rows.results || []) {
    let doc: Record<string, unknown> = {};
    try {
      doc = JSON.parse(row.data || '{}');
      parsedDocs++;
    } catch {
      continue;
    }
    for (const col of WORKSPACE_COLLECTIONS) {
      totals[col.key] += countCollection(doc, col.key);
    }
    const fc = doc.flashcards as { decks?: Array<{ cards?: unknown[] }> } | undefined;
    if (fc && Array.isArray(fc.decks)) {
      totals.flashcardDecks += fc.decks.length;
      for (const deck of fc.decks) {
        if (Array.isArray(deck?.cards)) totals.flashcards += deck.cards.length;
      }
    }
    const planner = doc.planner as Record<string, unknown> | undefined;
    if (planner && typeof planner === 'object') {
      totals.plannerEntries += Object.keys(planner).length;
    }
  }

  const collections = WORKSPACE_COLLECTIONS.map((col) => ({
    key: col.key,
    label: col.label,
    count: totals[col.key]
  }));
  collections.push({ key: 'flashcardDecks', label: 'Flashcard decks', count: totals.flashcardDecks });
  collections.push({ key: 'flashcards', label: 'Flashcards', count: totals.flashcards });
  collections.push({ key: 'plannerEntries', label: 'Planner entries', count: totals.plannerEntries });

  const hasAudit = await auditTableExists(c.env);
  let recent: unknown[] = [];
  if (hasAudit) {
    const logs = await c.env.DB.prepare(
      `SELECT created_at, actor_email, action, target, result
         FROM audit_logs ORDER BY id DESC LIMIT 10`
    ).all();
    recent = logs.results || [];
  }

  await writeAudit(c.env, {
    action: 'admin.view',
    actorId: user.id,
    actorEmail: user.email,
    target: 'overview',
    result: 'ok'
  });

  return ok({
    counts: {
      users: totalUsers?.n ?? 0,
      developers: developers?.n ?? 0,
      usersWithUnexpiredSession: withUnexpiredSession?.n ?? 0,
      activeSessions: activeSessions?.n ?? 0,
      files: totalFiles?.n ?? 0,
      fileBytes: totalFileBytes?.n ?? 0,
      workspaces: totalWorkspaces?.n ?? 0,
      workspacesParsed: parsedDocs
    },
    collections,
    recent,
    logAvailable: hasAudit
  });
});

/* ------------------------------------------------------------------- Users */

adminRoutes.get('/users', async (c) => {
  const user = currentUser(c);
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);

  // Only non-sensitive columns are selected. password_hash is never read here.
  const base = `SELECT u.id, u.email, COALESCE(u.role,'student') AS role, u.created_at
                  FROM users u`;
  const stmt = q
    ? c.env.DB.prepare(`${base} WHERE u.email LIKE ? ORDER BY datetime(u.created_at) DESC LIMIT ?`)
        .bind(`%${q}%`, limit)
    : c.env.DB.prepare(`${base} ORDER BY datetime(u.created_at) DESC LIMIT ?`).bind(limit);

  const rows = await stmt.all<{
    id: string;
    email: string;
    role: string;
    created_at: string;
  }>();

  // Derived per-user statistics from real rows.
  const fileCounts = await c.env.DB.prepare(
    `SELECT user_id, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM files GROUP BY user_id`
  ).all<{ user_id: string; n: number; bytes: number }>();
  const wsSizes = await c.env.DB.prepare(
    `SELECT user_id, LENGTH(data) AS len, updated_at FROM workspaces`
  ).all<{ user_id: string; len: number; updated_at: string }>();
  const sessionCounts = await c.env.DB.prepare(
    `SELECT user_id, COUNT(*) AS n, MAX(expires_at) AS last_expiry FROM sessions GROUP BY user_id`
  ).all<{ user_id: string; n: number; last_expiry: string }>();

  const fileMap = new Map((fileCounts.results || []).map((r) => [r.user_id, r]));
  const wsMap = new Map((wsSizes.results || []).map((r) => [r.user_id, r]));
  const sessMap = new Map((sessionCounts.results || []).map((r) => [r.user_id, r]));

  const users = (rows.results || []).map((r) => {
    const ws = wsMap.get(r.id);
    return {
      id: r.id,
      email: r.email,
      role: r.role,
      developer: r.role === 'developer',
      createdAt: r.created_at,
      fileCount: fileMap.get(r.id)?.n ?? 0,
      fileBytes: fileMap.get(r.id)?.bytes ?? 0,
      workspaceBytes: ws?.len ?? 0,
      workspaceUpdatedAt: ws?.updated_at ?? null,
      sessionCount: sessMap.get(r.id)?.n ?? 0,
      latestSessionExpiry: sessMap.get(r.id)?.last_expiry ?? null
    };
  });

  await writeAudit(c.env, {
    action: 'admin.view',
    actorId: user.id,
    actorEmail: user.email,
    target: 'users',
    result: 'ok',
    detail: q ? `search=${q}` : null
  });

  return ok({ users, query: q, limit });
});

/**
 * Change a user's authorization level. This is the only account mutation the
 * basic panel performs. The acting developer cannot demote themselves, which
 * would otherwise be possible to do by accident and is not required.
 */
adminRoutes.post('/users/:id/role', async (c) => {
  const actor = currentUser(c);
  const targetId = c.req.param('id');

  let body: { role?: string };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const role = String(body.role || '').toLowerCase();
  if (role !== 'student' && role !== 'developer') {
    return fail("role must be 'student' or 'developer'");
  }

  if (targetId === actor.id && role !== 'developer') {
    return fail('You cannot remove your own developer authorization.', 409);
  }

  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ id: string; email: string }>();
  if (!target) return fail('User not found.', 404);

  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, targetId).run();

  await writeAudit(c.env, {
    action: 'admin.role_change',
    actorId: actor.id,
    actorEmail: actor.email,
    target: target.email,
    result: 'ok',
    detail: `role -> ${role}`
  });

  return ok({ id: targetId, role });
});

/* -------------------------------------------------------------------- Data */

/** Read-only inspection of real workspaces. Contents are not bulk-exported. */
adminRoutes.get('/data', async (c) => {
  const actor = currentUser(c);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200);

  const rows = await c.env.DB.prepare(
    `SELECT w.user_id, u.email, LENGTH(w.data) AS bytes, w.updated_at
       FROM workspaces w LEFT JOIN users u ON u.id = w.user_id
      ORDER BY datetime(w.updated_at) DESC LIMIT ?`
  )
    .bind(limit)
    .all<{ user_id: string; email: string | null; bytes: number; updated_at: string }>();

  const docs = (rows.results || []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    bytes: r.bytes,
    updatedAt: r.updated_at
  }));

  // Column-level shape of a single workspace document (keys and counts only).
  const sampleUserId = c.req.query('user');
  let shape: Array<{ key: string; type: string; count: number | null }> = [];
  let sample: { userId: string; email: string | null; updatedAt: string } | null = null;

  const targetUser =
    sampleUserId || docs[0]?.userId || null;
  if (targetUser) {
    const row = await c.env.DB.prepare(
      `SELECT w.data, w.updated_at, u.email FROM workspaces w LEFT JOIN users u ON u.id = w.user_id
        WHERE w.user_id = ?`
    )
      .bind(targetUser)
      .first<{ data: string; updated_at: string; email: string | null }>();

    if (row) {
      sample = { userId: targetUser, email: row.email, updatedAt: row.updated_at };
      let doc: Record<string, unknown> = {};
      try {
        doc = JSON.parse(row.data || '{}');
      } catch {
        doc = {};
      }
      shape = Object.keys(doc)
        .sort()
        .map((key) => {
          const value = doc[key];
          const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
          const count = Array.isArray(value)
            ? value.length
            : value && typeof value === 'object'
              ? Object.keys(value as object).length
              : null;
          return { key, type, count };
        });
    }
  }

  const dayKeys = c.req.query('day');
  let dayValue: { key: string; value: unknown } | null = null;
  if (dayKeys) {
    const row = await c.env.DB.prepare('SELECT data FROM workspaces WHERE user_id = ?')
      .bind(targetUser)
      .first<{ data: string }>();
    if (row) {
      try {
        const doc = JSON.parse(row.data || '{}') as Record<string, unknown>;
        if (dayKeys in doc) dayValue = { key: dayKeys, value: doc[dayKeys] };
      } catch {
        /* ignore */
      }
    }
  }

  await writeAudit(c.env, {
    action: 'admin.view',
    actorId: actor.id,
    actorEmail: actor.email,
    target: 'data',
    result: 'ok'
  });

  return ok({ workspaces: docs, sample, shape, key: dayValue });
});

/** Table inventory — the real tables that exist, straight from SQLite. */
adminRoutes.get('/data/tables', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`
  ).all<{ name: string }>();

  const tables = [];
  for (const r of rows.results || []) {
    const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM "${r.name}"`)
      .first<{ n: number }>()
      .catch(() => ({ n: null as number | null }));
    const cols = await c.env.DB.prepare(`PRAGMA table_info("${r.name}")`)
      .all<{ name: string; type: string; notnull: number; pk: number }>()
      .catch(() => ({ results: [] as Array<{ name: string; type: string }> }));
    tables.push({
      name: r.name,
      rows: count?.n ?? null,
      // Column names/types only. No row values are exposed.
      columns: (cols.results || []).map((col) => ({ name: col.name, type: col.type }))
    });
  }
  return ok({ tables });
});

/* ------------------------------------------------------------------- Files */

adminRoutes.get('/files', async (c) => {
  const actor = currentUser(c);
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);

  // Metadata only — `data` (the blob) is never selected, so file contents are
  // not exposed merely because metadata is visible.
  const rows = await c.env.DB.prepare(
    `SELECT f.id, f.name, f.size, f.mime, f.storage_key, f.created_at,
            f.user_id, u.email AS owner_email,
            CASE WHEN f.data IS NULL THEN 0 ELSE 1 END AS has_inline_data
       FROM files f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY datetime(f.created_at) DESC LIMIT ?`
  )
    .bind(limit)
    .all<{
      id: string;
      name: string;
      size: number;
      mime: string;
      storage_key: string | null;
      created_at: string;
      user_id: string;
      owner_email: string | null;
      has_inline_data: number;
    }>();

  const driver = fileDriver(c.env);

  const files = (rows.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    size: r.size,
    mime: r.mime,
    ownerId: r.user_id,
    ownerEmail: r.owner_email,
    uploadedAt: r.created_at,
    storageKey: r.storage_key,
    // Where the bytes actually live for this row, using the real driver.
    status: r.storage_key
      ? 'external (object storage)'
      : r.has_inline_data
        ? 'inline (database blob)'
        : 'missing payload'
  }));

  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

  await writeAudit(c.env, {
    action: 'admin.view',
    actorId: actor.id,
    actorEmail: actor.email,
    target: 'files',
    result: 'ok'
  });

  return ok({
    files,
    driver,
    total: files.length,
    totalBytes,
    contentsExposed: false
  });
});

/* -------------------------------------------------------------------- Logs */

adminRoutes.get('/logs', async (c) => {
  if (!(await auditTableExists(c.env))) {
    return ok({ available: false, logs: [], total: 0 });
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);
  const action = (c.req.query('action') || '').trim();

  const stmt = action
    ? c.env.DB.prepare(
        `SELECT id, created_at, actor_email, action, target, result, detail
           FROM audit_logs WHERE action = ? ORDER BY id DESC LIMIT ?`
      ).bind(action, limit)
    : c.env.DB.prepare(
        `SELECT id, created_at, actor_email, action, target, result, detail
           FROM audit_logs ORDER BY id DESC LIMIT ?`
      ).bind(limit);

  const rows = await stmt.all<{
    id: number;
    created_at: string;
    actor_email: string | null;
    action: string;
    target: string | null;
    result: string;
    detail: string | null;
  }>();

  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM audit_logs')
    .first<{ n: number }>()
    .catch(() => ({ n: 0 }));

  const actions = await c.env.DB.prepare(
    `SELECT action, COUNT(*) AS n FROM audit_logs GROUP BY action ORDER BY n DESC`
  )
    .all<{ action: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ action: string; n: number }> }));

  return ok({
    available: true,
    logs: rows.results || [],
    total: total?.n ?? 0,
    actions: actions.results || []
  });
});

/* ------------------------------------------------------------------ System */

adminRoutes.get('/system', async (c) => {
  const checks: Array<{
    name: string;
    status: 'ok' | 'degraded' | 'error';
    detail: string;
  }> = [];

  // Backend/API — this handler is executing, so the check is real.
  checks.push({ name: 'Backend / API', status: 'ok', detail: 'Hono application responding' });

  // Database — a real query, not a hard-coded string.
  const started = Date.now();
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    checks.push({
      name: 'Database (D1)',
      status: 'ok',
      detail: `SELECT succeeded in ${Date.now() - started}ms · ${row?.n ?? 0} user rows`
    });
  } catch (e) {
    checks.push({
      name: 'Database (D1)',
      status: 'error',
      detail: `Query failed: ${(e as Error).message}`
    });
  }

  // Authentication — verify the real tables the auth flow depends on.
  try {
    const sessions = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions')
      .first<{ n: number }>();
    const nowIso = new Date().toISOString();
    const live = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?'
    )
      .bind(nowIso)
      .first<{ n: number }>();
    checks.push({
      name: 'Authentication',
      status: 'ok',
      detail: `sessions table readable · ${live?.n ?? 0} unexpired of ${sessions?.n ?? 0}`
    });
  } catch (e) {
    checks.push({
      name: 'Authentication',
      status: 'error',
      detail: `Session store unreadable: ${(e as Error).message}`
    });
  }

  // File storage — real configuration plus a real table probe.
  const driver = fileDriver(c.env);
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM files').first<{ n: number }>();
    const r2Bound = Boolean(c.env.FILES);
    checks.push({
      name: 'File storage',
      status: 'ok',
      detail: `driver=${driver} · r2 binding=${r2Bound ? 'present' : 'absent'} · ${row?.n ?? 0} files`
    });
  } catch (e) {
    checks.push({
      name: 'File storage',
      status: 'error',
      detail: `files table unreadable: ${(e as Error).message}`
    });
  }

  // Audit log — honest about whether the admin logging table exists.
  const hasAudit = await auditTableExists(c.env);
  checks.push({
    name: 'Audit log',
    status: hasAudit ? 'ok' : 'degraded',
    detail: hasAudit ? 'audit_logs table present' : 'audit_logs table not found'
  });

  // AI provider — configuration only; no call is made.
  const aiConfigured = Boolean(c.env.OPENAI_API_KEY && c.env.OPENAI_MODEL);
  checks.push({
    name: 'AI provider',
    status: aiConfigured ? 'ok' : 'degraded',
    detail: aiConfigured ? 'configured' : 'not configured (expected)'
  });

  return ok({
    checks,
    runtime: {
      storageDriver: driver,
      aiConfigured,
      compatibilityDate: String((c.env as { CF_PAGES?: string })?.CF_PAGES || 'n/a'),
      time: new Date().toISOString()
    }
  });
});

/* ---------------------------------------------------------------------- AI */

/**
 * Preparation only. No LLM call is made, no key is required, and no model or
 * endpoint is assumed. Values are reported from the existing configuration.
 */
adminRoutes.get('/ai', async (c) => {
  const baseUrl = c.env.OPENAI_BASE_URL || null;
  const model = c.env.OPENAI_MODEL && String(c.env.OPENAI_MODEL).trim() !== ''
    ? String(c.env.OPENAI_MODEL)
    : null;
  const hasKey = Boolean(c.env.OPENAI_API_KEY);

  return ok({
    provider: 'OpenAI-compatible',
    status: hasKey && model ? 'configured' : 'not configured',
    model,
    endpoint: baseUrl,
    hasKey,
    chatEndpoint: '/api/ai/chat/completions',
    configured: hasKey && model,
    note: 'Placeholder only — no LLM integration is enabled and no request is sent.'
  });
});

/* Developer-only view of the existing AI config route (already authenticated). */
adminRoutes.get('/ai/status', (c) => {
  const user: SessionUser = currentUser(c);
  return json({
    ok: true,
    scope: { userId: user.id, role: user.role },
    developer: isDeveloper(user)
  });
});
