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
import {
  checkKeyShape,
  checkUrlShape,
  clearAiConfig,
  getAiConfig,
  getTaskModels,
  identifyProvider,
  probeProvider,
  saveAiConfig,
  saveTaskModels,
  type AiTask
} from '../lib/ai-config.js';

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

  const collections: Array<{ key: string; label: string; count: number }> = WORKSPACE_COLLECTIONS.map((col) => ({
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

/**
 * Kick a user out: delete every session row for the account, so the cookie they
 * hold stops resolving on their next request. Revokes ACCESS, not data — files,
 * the workspace document and the role are untouched.
 *
 * The acting developer cannot kick themselves: it would sign them out of the
 * request they are making, and signing out is what the panel header is for.
 */
adminRoutes.post('/users/:id/sessions/revoke', async (c) => {
  const actor = currentUser(c);
  const targetId = c.req.param('id');

  if (targetId === actor.id) {
    return fail('You cannot kick out your own session. Use Sign out in the header instead.', 409);
  }

  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ id: string; email: string }>();
  if (!target) return fail('User not found.', 404);

  // Counted before the delete so the response can distinguish "signed out" from
  // "this account had no live session to begin with".
  const unexpired = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?'
  )
    .bind(targetId, new Date().toISOString())
    .first<{ n: number }>();

  const deleted = await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
    .bind(targetId)
    .run();
  const revoked = Number(deleted.meta?.changes ?? 0);
  const signedOut = Number(unexpired?.n ?? 0);

  await writeAudit(c.env, {
    action: 'admin.sessions_revoke',
    actorId: actor.id,
    actorEmail: actor.email,
    target: target.email,
    result: 'ok',
    detail: `${revoked} session row(s) deleted, ${signedOut} was/were live`
  });

  return ok({ id: targetId, revoked, signedOut });
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
 * AI configuration status. Reports the ACTIVE configuration (validated
 * database settings over environment variables), never the key itself —
 * only a masked hint. The setup console (PUT/DELETE below) is the writer.
 */
adminRoutes.get('/ai', async (c) => {
  const cfg = await getAiConfig(c.env);

  return ok({
    provider: cfg.provider || (cfg.source === 'environment' ? 'OpenAI-compatible' : 'OpenAI-compatible'),
    providerId: cfg.provider,
    source: cfg.source,
    status: cfg.apiKey && cfg.baseUrl ? 'configured' : 'not configured',
    model: cfg.model,
    endpoint: cfg.baseUrl,
    hasKey: Boolean(cfg.apiKey),
    keyHint: cfg.keyHint,
    validatedAt: cfg.validatedAt,
    chatEndpoint: '/api/ai/chat/completions',
    configured: Boolean(cfg.apiKey && cfg.baseUrl),
    note:
      cfg.source === 'database'
        ? 'Validated key stored in the database (source of truth for the runtime).'
        : cfg.source === 'environment'
          ? 'Read-only environment configuration. Paste a key below to manage it here.'
          : 'No key configured. Paste one below — it is identified, validated against the live provider, then stored.'
  });
});

/**
 * Validate-and-persist a pasted API key. The key is identified against the
 * provider catalog, shape-checked, then PROBED live (GET {baseUrl}/models
 * with the pasted key). The database is written only after the probe
 * succeeds — an unvalidated key is never stored, so nothing downstream can
 * ever read one.
 */
adminRoutes.put('/ai/config', async (c) => {
  const actor = currentUser(c);

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const customBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const modelInput = typeof body.model === 'string' ? body.model.trim() : '';

  if (!apiKey) return fail('Paste an API key first.');

  const shape = checkKeyShape(apiKey);
  if (!shape.ok) return fail(shape.error ?? 'Invalid key.');

  const spec = identifyProvider(apiKey);
  if (!spec && !customBaseUrl) {
    return fail('Unrecognized key prefix. Choose "Custom provider" and supply the base URL.');
  }

  const baseUrl = spec ? spec.baseUrl : customBaseUrl;
  const urlCheck = checkUrlShape(baseUrl);
  if (!urlCheck.ok) return fail(urlCheck.error ?? 'Invalid base URL.');

  const model = modelInput || null;

  /* The live probe: the gate between pasted and stored. */
  const probe = await probeProvider({ apiKey, baseUrl, model });
  if (!probe.ok) {
    await writeAudit(c.env, {
      action: 'ai.config.validation_failed',
      actorId: actor.id,
      actorEmail: actor.email,
      target: spec?.id ?? 'custom',
      result: 'error',
      detail: probe.error ?? 'probe failed'
    });
    return fail(probe.error ?? 'Validation failed.', 400);
  }

  const validatedAt = new Date().toISOString();
  await saveAiConfig(c.env, {
    apiKey,
    baseUrl,
    model,
    provider: spec?.id ?? 'custom',
    validatedAt
  });

  await writeAudit(c.env, {
    action: 'ai.config.set',
    actorId: actor.id,
    actorEmail: actor.email,
    target: spec?.id ?? 'custom',
    result: 'ok',
    detail: `validated live: ${probe.modelCount ?? 0} models listed${probe.modelVerified ? ', requested model verified' : ''}. Key value never logged.`
  });

  return ok({
    provider: spec?.label ?? 'Custom provider',
    endpoint: baseUrl,
    model,
    keyHint: apiKey.slice(0, 3) + '…' + apiKey.slice(-4),
    modelCount: probe.modelCount ?? null,
    modelVerified: probe.modelVerified ?? false,
    validatedAt
  });
});

/**
 * Remove the database key. The runtime falls back to environment variables
 * (usually none in local dev), so the student AI scaffold reports "not
 * configured" again. The action is audited; the key value is not.
 */
adminRoutes.delete('/ai/config', async (c) => {
  const actor = currentUser(c);
  await clearAiConfig(c.env);
  await writeAudit(c.env, {
    action: 'ai.config.remove',
    actorId: actor.id,
    actorEmail: actor.email,
    target: 'app_settings',
    result: 'ok',
    detail: 'database AI key cleared'
  });
  return ok({ cleared: true });
});

/**
 * Re-probe the ACTIVE stored configuration ("Test connection"). Reads the
 * same resolver the runtime uses, so green here means the app can talk to
 * the provider right now.
 */
adminRoutes.post('/ai/test', async (c) => {
  const actor = currentUser(c);
  const cfg = await getAiConfig(c.env);

  if (!cfg.apiKey || !cfg.baseUrl) {
    return fail('No AI provider is configured to test.');
  }

  const probe = await probeProvider({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
  await writeAudit(c.env, {
    action: 'ai.config.test',
    actorId: actor.id,
    actorEmail: actor.email,
    target: cfg.provider ?? 'custom',
    result: probe.ok ? 'ok' : 'error',
    detail: probe.ok ? `${probe.modelCount ?? 0} models listed` : probe.error ?? 'probe failed'
  });

  if (!probe.ok) return fail(probe.error ?? 'Test failed.', 502);
  return ok({ modelCount: probe.modelCount ?? null, modelVerified: probe.modelVerified ?? false });
});

/**
 * GET /api/admin/ai/task-models — list per-task model overrides.
 */
adminRoutes.get('/ai/task-models', async (c) => {
  const taskModels = await getTaskModels(c.env);
  return ok({ taskModels });
});

/**
 * PUT /api/admin/ai/task-models — save per-task model overrides.
 * Body: { taskModels: { quiz?: string, flashcards?: string, planner?: string, recommend?: string } }
 */
adminRoutes.put('/ai/task-models', async (c) => {
  const actor = currentUser(c);

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const input = body.taskModels;
  if (!input || typeof input !== 'object') {
    return fail('taskModels must be an object.');
  }

  // Validate: only allowed task keys, values must be strings or empty
  const allowed: AiTask[] = ['quiz', 'flashcards', 'planner', 'recommend'];
  const cleaned: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key as AiTask)) continue;
    const val = typeof (input as Record<string, unknown>)[key] === 'string'
      ? ((input as Record<string, unknown>)[key] as string).trim()
      : '';
    if (val) cleaned[key] = val;
  }

  await saveTaskModels(c.env, cleaned);

  await writeAudit(c.env, {
    action: 'ai.task_models.set',
    actorId: actor.id,
    actorEmail: actor.email,
    target: 'app_settings',
    result: 'ok',
    detail: JSON.stringify(cleaned)
  });

  return ok({ taskModels: cleaned });
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

/* ------------------------------------------------------------------ Tools */

/**
 * Admin-managed site tools: the student navigation itself. Builtins map to
 * the real pages (they can be renamed, re-iconed, reordered, hidden — never
 * deleted, because the pages remain). Customs are free links created here.
 *
 * Every mutation is audited. Validation is strict about anything that could
 * become markup or a script URL in the student nav: labels are length-capped,
 * icons must be a Phosphor class or a short glyph, and hrefs must be an
 * http(s) URL or a plain relative path (no schemes like javascript:).
 */

const TOOL_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TOOL_LABEL_MAX = 40;
const TOOL_ICON_RE = /^ph-[a-z0-9-]{2,48}$/;

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Accepts https?:// URLs and plain relative paths ('notes.html', '/guide').
 * Anything that could smuggle a scheme (javascript:, data:, protocol-relative
 * //host) is rejected. Returns the sanitized value or null.
 */
function sanitizeHref(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 500) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.href;
    } catch {
      return null;
    }
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return null; // any scheme
  if (value.startsWith('//')) return null;                  // protocol-relative
  if (value.includes('..')) return null;                    // no traversal games
  return /^[A-Za-z0-9._~/-]+$/.test(value) ? value : null;
}

/** A valid icon is a Phosphor class ('ph-robot') or a short glyph (<= 4 chars). */
function sanitizeIcon(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (value === '') return '';
  if (TOOL_ICON_RE.test(value)) return value;
  if (Array.from(value).length <= 4 && !/[<>&"']/.test(value)) return value;
  return null;
}

function sanitizeLabel(raw: unknown): string | null {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > TOOL_LABEL_MAX) return null;
  return value;
}

interface ToolRow {
  id: string;
  kind: string;
  label: string;
  href: string;
  icon: string;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toolJson(r: ToolRow) {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    href: r.href,
    icon: r.icon,
    sortOrder: r.sort_order,
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

async function getTool(env: Env, id: string): Promise<ToolRow | null> {
  return env.DB.prepare(
    `SELECT id, kind, label, href, icon, sort_order, enabled, created_at, updated_at
       FROM site_tools WHERE id = ?`
  )
    .bind(id)
    .first<ToolRow>();
}

/** Full list, including disabled tools and customs. */
adminRoutes.get('/tools', async (c) => {
  const actor = currentUser(c);
  const rows = await c.env.DB.prepare(
    `SELECT id, kind, label, href, icon, sort_order, enabled, created_at, updated_at
       FROM site_tools ORDER BY sort_order, label`
  ).all<ToolRow>();

  await writeAudit(c.env, {
    action: 'admin.view',
    actorId: actor.id,
    actorEmail: actor.email,
    target: 'tools',
    result: 'ok'
  });

  return ok({ tools: (rows.results || []).map(toolJson) });
});

/** Create a custom tool. It appears in the student nav immediately. */
adminRoutes.post('/tools', async (c) => {
  const actor = currentUser(c);

  let body: { id?: string; label?: string; href?: string; icon?: string };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const label = sanitizeLabel(body.label);
  if (!label) return fail(`label is required (max ${TOOL_LABEL_MAX} characters)`);

  const href = sanitizeHref(body.href);
  if (!href) return fail('href must be an http(s) URL or a plain relative path');

  const icon = sanitizeIcon(body.icon);
  if (icon === null) return fail('icon must be a ph-* Phosphor name or a short glyph');

  const requestedId = slugify(String(body.id || '')) || slugify(label);
  if (!TOOL_ID_RE.test(requestedId)) return fail('id must be a short slug (a-z, 0-9, dashes)');

  const existing = await getTool(c.env, requestedId);
  if (existing) return fail(`a tool with id '${requestedId}' already exists`, 409);

  const maxRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM site_tools'
  ).first<{ m: number }>();
  const sortOrder = (maxRow?.m ?? 0) + 10;

  await c.env.DB.prepare(
    `INSERT INTO site_tools (id, kind, label, href, icon, sort_order, enabled)
     VALUES (?, 'custom', ?, ?, ?, ?, 1)`
  )
    .bind(requestedId, label, href, icon || 'ph-globe', sortOrder)
    .run();

  await writeAudit(c.env, {
    action: 'admin.tool_create',
    actorId: actor.id,
    actorEmail: actor.email,
    target: requestedId,
    result: 'ok',
    detail: `label='${label}' href=${href}`
  });

  const created = await getTool(c.env, requestedId);
  return ok({ tool: created ? toolJson(created) : null });
});

/**
 * Update a tool: label, icon, enabled, sort order (and href for customs).
 * The dashboard can be edited but never disabled: it is the site's fallback
 * page, so hiding it would leave redirected users nowhere to land.
 */
adminRoutes.put('/tools/:id', async (c) => {
  const actor = currentUser(c);
  const id = c.req.param('id');

  let body: { label?: string; icon?: string; enabled?: boolean; sortOrder?: number; href?: string };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const existing = await getTool(c.env, id);
  if (!existing) return fail('Tool not found.', 404);

  const updates: string[] = [];
  const binds: Array<string | number> = [];
  const details: string[] = [];

  if (body.label !== undefined) {
    const label = sanitizeLabel(body.label);
    if (!label) return fail(`label must be 1-${TOOL_LABEL_MAX} characters`);
    if (label !== existing.label) {
      updates.push('label = ?');
      binds.push(label);
      details.push(`label: '${existing.label}' -> '${label}'`);
    }
  }

  if (body.icon !== undefined) {
    const icon = sanitizeIcon(body.icon);
    if (icon === null) return fail('icon must be a ph-* Phosphor name or a short glyph');
    const resolved = icon || (existing.kind === 'builtin' ? '' : 'ph-globe');
    if (resolved !== existing.icon) {
      updates.push('icon = ?');
      binds.push(resolved);
      details.push(`icon -> ${resolved || '(emoji default)'}`);
    }
  }

  if (body.enabled !== undefined) {
    const enabled = body.enabled ? 1 : 0;
    if (enabled !== existing.enabled) {
      if (id === 'dashboard' && !enabled) {
        return fail('The dashboard cannot be disabled: it is the fallback page.', 409);
      }
      updates.push('enabled = ?');
      binds.push(enabled);
      details.push(`enabled -> ${Boolean(enabled)}`);
    }
  }

  if (body.sortOrder !== undefined) {
    const order = Number(body.sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 100000) {
      return fail('sortOrder must be a non-negative integer');
    }
    if (order !== existing.sort_order) {
      updates.push('sort_order = ?');
      binds.push(order);
      details.push(`order ${existing.sort_order} -> ${order}`);
    }
  }

  if (body.href !== undefined) {
    if (existing.kind !== 'custom') {
      return fail('Builtin tools point at their own pages; their href is fixed.');
    }
    const href = sanitizeHref(body.href);
    if (!href) return fail('href must be an http(s) URL or a plain relative path');
    if (href !== existing.href) {
      updates.push('href = ?');
      binds.push(href);
      details.push(`href -> ${href}`);
    }
  }

  if (updates.length === 0) {
    return ok({ tool: toolJson(existing), changed: false });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  await c.env.DB.prepare(`UPDATE site_tools SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run();

  await writeAudit(c.env, {
    action: 'admin.tool_update',
    actorId: actor.id,
    actorEmail: actor.email,
    target: id,
    result: 'ok',
    detail: details.join('; ')
  });

  const updated = await getTool(c.env, id);
  return ok({ tool: updated ? toolJson(updated) : null, changed: true });
});

/** Delete a custom tool. Builtins cannot be deleted: their pages still exist. */
adminRoutes.delete('/tools/:id', async (c) => {
  const actor = currentUser(c);
  const id = c.req.param('id');

  const existing = await getTool(c.env, id);
  if (!existing) return fail('Tool not found.', 404);
  if (existing.kind !== 'custom') {
    return fail('Builtin tools cannot be deleted. Disable them instead.', 400);
  }

  await c.env.DB.prepare('DELETE FROM site_tools WHERE id = ?').bind(id).run();

  await writeAudit(c.env, {
    action: 'admin.tool_delete',
    actorId: actor.id,
    actorEmail: actor.email,
    target: id,
    result: 'ok',
    detail: `label='${existing.label}'`
  });

  return ok({ deleted: id });
});
