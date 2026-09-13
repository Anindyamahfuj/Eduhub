/**
 * File-storage driver.
 *
 * Why D1 and not the filesystem: the app runs inside the Workers runtime
 * (workerd), which has no `node:fs` access. During `wrangler pages dev` the D1
 * binding is a local SQLite file under `.wrangler/state`, so storing bytes
 * there keeps EVERYTHING local while development and testing happen — no R2
 * bucket or account is required.
 *
 * Drivers:
 *   STORAGE_DRIVER=local (default) -> bytes in the `files` D1 table (base64).
 *   STORAGE_DRIVER=r2              -> bytes in R2; metadata in D1.
 * Both expose the same data-URL contract, so the route layer and the
 * frontend stay unchanged when R2 is introduced after deployment.
 */
import type { Env } from './helpers.js';

const DATA_URL_RE = /^data:([^;,]*)(;base64)?,([\s\S]*)$/;

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  data: string | null;
  mime: string | null;
}

/** Split a data URL into its mime type and base64 payload. */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) return { mime, base64: m[3] || '' };
  // Not base64-encoded — re-encode so storage is uniform.
  try {
    return { mime, base64: btoa(unescape(encodeURIComponent(m[3] || ''))) };
  } catch {
    return { mime, base64: '' };
  }
}

export function buildDataUrl(mime: string | null, base64: string | null): string | null {
  if (base64 == null) return null;
  return `data:${mime || 'application/octet-stream'};base64,${base64}`;
}

export function fileDriver(env: Env): 'local' | 'r2' {
  return (env.STORAGE_DRIVER || 'local').toLowerCase() === 'r2' ? 'r2' : 'local';
}

/** Persist one file for a user. `file.data` is a base64 data URL. */
export async function putFile(
  env: Env,
  userId: string,
  file: { id: string; name?: string; size?: number; data?: string | null }
): Promise<void> {
  const parsed = file.data ? parseDataUrl(file.data) : null;
  const name = (file.name || '').slice(0, 300) || 'untitled';
  const size = typeof file.size === 'number' ? file.size : parsed ? null : 0;

  if (fileDriver(env) === 'r2') {
    const bucket = env.FILES;
    if (bucket && parsed) {
      const objectKey = `r2:u${userId}/${file.id}`;
      const bytes = Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
      await bucket.put(objectKey.slice(3), bytes, { httpMetadata: { contentType: parsed.mime } });
      await env.DB.prepare(
        `INSERT INTO files (id, user_id, name, size, mime, data, storage_key)
         VALUES (?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, size = excluded.size, mime = excluded.mime,
           storage_key = excluded.storage_key`
      )
        .bind(file.id, userId, name, size ?? bytes.length, parsed.mime, objectKey)
        .run();
      return;
    }
  }

  await env.DB.prepare(
    `INSERT INTO files (id, user_id, name, size, mime, data, storage_key)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, size = excluded.size, mime = excluded.mime, data = excluded.data`
  )
    .bind(
      file.id,
      userId,
      name,
      size ?? 0,
      parsed ? parsed.mime : 'application/octet-stream',
      parsed ? buildDataUrl(parsed.mime, parsed.base64) : null
    )
    .run();
}

/** Load every stored file for a user, re-hydrated as data URLs. */
export async function listFiles(env: Env, userId: string): Promise<StoredFile[]> {
  const rows = await env.DB.prepare(
    `SELECT id, name, size, mime, data, storage_key
       FROM files WHERE user_id = ? ORDER BY datetime(created_at) DESC`
  )
    .bind(userId)
    .all<{
      id: string;
      name: string;
      size: number;
      mime: string | null;
      data: string | null;
      storage_key: string | null;
    }>();

  const out: StoredFile[] = [];
  for (const row of rows.results || []) {
    let data = row.data;
    if (!data && row.storage_key && row.storage_key.startsWith('r2:')) {
      const bucket = env.FILES;
      if (bucket) {
        const obj = await bucket.get(row.storage_key.slice(3));
        if (obj) {
          const buf = new Uint8Array(await obj.arrayBuffer());
          let bin = '';
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          data = buildDataUrl(row.mime, btoa(bin));
        }
      }
    }
    out.push({ id: row.id, name: row.name, size: row.size, data, mime: row.mime });
  }
  return out;
}

/** Delete one stored file for a user. */
export async function deleteFile(env: Env, userId: string, fileId: string): Promise<void> {
  const meta = await env.DB.prepare('SELECT storage_key FROM files WHERE user_id = ? AND id = ?')
    .bind(userId, fileId)
    .first<{ storage_key: string | null }>();
  if (meta?.storage_key?.startsWith('r2:')) {
    try {
      if (env.FILES) await env.FILES.delete(meta.storage_key.slice(3));
    } catch {
      /* non-fatal */
    }
  }
  await env.DB.prepare('DELETE FROM files WHERE user_id = ? AND id = ?').bind(userId, fileId).run();
}

/** Delete every stored file for a user. */
export async function deleteAllFiles(env: Env, userId: string): Promise<void> {
  const rows = await env.DB.prepare('SELECT id FROM files WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string }>();
  for (const row of rows.results || []) await deleteFile(env, userId, row.id);
}

/** Remove stored blobs no longer referenced by the workspace. */
export async function pruneFiles(env: Env, userId: string, keepIds: string[]): Promise<void> {
  const keep = new Set(keepIds);
  const rows = await env.DB.prepare('SELECT id FROM files WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string }>();
  for (const row of rows.results || []) if (!keep.has(row.id)) await deleteFile(env, userId, row.id);
}
