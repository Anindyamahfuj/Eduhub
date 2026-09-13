/**
 * Workspace sync.
 *
 * The frontend already keeps its entire state in one object (`studyHubData`).
 * Rather than reshape it, D1 stores that same document as JSON per user, which
 * is what keeps the frontend byte-identical while making the backend
 * authoritative.
 *
 * File blobs are the one exception: they are large, so they are kept out of the
 * JSON document and held by the storage driver instead. On write the `data`
 * field of each file entry is stripped; on read it is re-hydrated, so the
 * frontend always sees the shape it already expects.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import { currentUser, fail, ok, requireUser } from '../lib/helpers.js';
import { listFiles } from '../lib/files.js';

export const workspaceRoutes = new Hono<{ Bindings: Env }>();

workspaceRoutes.use('*', requireUser);

type FileEntry = { id?: string; data?: string | null; [key: string]: unknown };
type Workspace = { files?: FileEntry[]; [key: string]: unknown };

/** Remove base64 payloads before persisting the document. */
function stripFileData(doc: Workspace): Workspace {
  if (!Array.isArray(doc?.files)) return doc;
  for (const entry of doc.files) {
    if (entry && typeof entry === 'object') {
      if ('data' in entry) delete entry.data;
    }
  }
  return doc;
}

/** Re-attach blob data URLs so the frontend's openFile() keeps working. */
async function hydrateFileData(env: Env, userId: string, doc: Workspace): Promise<Workspace> {
  if (!Array.isArray(doc?.files)) return doc;
  const stored = await listFiles(env, userId);
  const byId = new Map(stored.map((f) => [f.id, f]));
  for (const entry of doc.files) {
    const match = entry?.id ? byId.get(entry.id) : undefined;
    if (match) {
      if (match.data) entry.data = match.data;
    }
  }
  return doc;
}

/** GET /api/workspace — return this user's workspace document. */
workspaceRoutes.get('/', async (c) => {
  const user = currentUser(c);
  const row = await c.env.DB.prepare('SELECT data, updated_at FROM workspaces WHERE user_id = ?')
    .bind(user.id)
    .first<{ data: string; updated_at: string }>();

  if (!row) return ok({ data: {}, updatedAt: null });

  let doc: Workspace = {};
  try {
    doc = JSON.parse(row.data) as Workspace;
  } catch {
    doc = {};
  }

  doc = await hydrateFileData(c.env, user.id, doc);
  return ok({ data: doc, updatedAt: row.updated_at });
});

/** PUT /api/workspace — persist the whole workspace document. */
workspaceRoutes.put('/', async (c) => {
  const user = currentUser(c);

  let body: { data?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  if (body.data === undefined || body.data === null || typeof body.data !== 'object') {
    return fail('Expected { data: object }');
  }

  const doc = stripFileData(body.data as Workspace);
  const serialized = JSON.stringify(doc);
  if (serialized.length > 8_000_000) {
    return fail('Workspace document too large.', 413);
  }

  await c.env.DB.prepare(
    `INSERT INTO workspaces (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(user.id, serialized)
    .run();

  return ok();
});

/**
 * POST /api/workspace/reset — clear this user's workspace back to defaults.
 * Only ever triggered by a deliberate user action.
 */
workspaceRoutes.post('/reset', async (c) => {
  const user = currentUser(c);
  await c.env.DB.prepare(
    'UPDATE workspaces SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  )
    .bind('{}', user.id)
    .run();
  return ok();
});

/** Health probe for the sync layer. */
workspaceRoutes.get('/health', (c) => ok({ scope: 'workspace' }));
