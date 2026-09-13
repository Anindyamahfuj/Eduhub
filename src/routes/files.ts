/**
 * Files API.
 *
 * Blobs are stored by the driver in src/lib/files.ts (D1 during local
 * development, R2-ready after deployment). The workspace document stays the
 * authoritative list of files; this route handles the bytes.
 *
 * The response shape matches the frontend's existing file object exactly
 * ({ id, name, size, data, date }), so `renderFileList()` and `openFile()`
 * continue to work untouched.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import { currentUser, fail, ok, requireUser } from '../lib/helpers.js';
import { deleteAllFiles, deleteFile, listFiles, putFile } from '../lib/files.js';

export const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.use('*', requireUser);

/** GET /api/files — stored files, re-hydrated as data URLs. */
fileRoutes.get('/', async (c) => {
  const user = currentUser(c);
  const files = await listFiles(c.env, user.id);
  return ok({ files });
});

/** POST /api/files — { files: [{ id, name, size, data }] } (idempotent upsert) */
fileRoutes.post('/', async (c) => {
  const user = currentUser(c);

  let body: { files?: Array<{ id?: string; name?: string; size?: number; data?: string }> };
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  const incoming = Array.isArray(body.files) ? body.files : [];
  if (incoming.length === 0) return fail('No files provided.');

  const saved = [];
  for (const item of incoming) {
    if (!item || typeof item.data !== 'string' || item.data.length === 0) continue;
    const id = item.id || crypto.randomUUID();
    await putFile(c.env, user.id, {
      id,
      name: item.name,
      size: item.size,
      data: item.data
    });
    saved.push(id);
  }

  return ok({ saved });
});

/** DELETE /api/files/:id */
fileRoutes.delete('/:id', async (c) => {
  const user = currentUser(c);
  await deleteFile(c.env, user.id, c.req.param('id'));
  return ok();
});

/** DELETE /api/files — clear every stored blob for this user. */
fileRoutes.delete('/', async (c) => {
  const user = currentUser(c);
  await deleteAllFiles(c.env, user.id);
  return ok();
});
