/**
 * D1-compatible database wrapper backed by Node's built-in `node:sqlite`.
 *
 * The StudyHub app talks to its database exclusively through the D1 interface:
 *   env.DB.prepare(sql).bind(...).all<T>()   -> { results: T[] }
 *   env.DB.prepare(sql).bind(...).first<T>() -> T | null
 *   env.DB.prepare(sql).bind(...).run()      -> { success, meta }
 *   env.DB.batch([stmt, ...])               -> per-stmt results
 *
 * On Cloudflare Pages `env.DB` IS a D1Database. On Vercel there is no D1, so
 * this module provides a drop-in shim backed by `node:sqlite` (Node 22+). The
 * shim is loaded only on Vercel; on Cloudflare it is never imported.
 *
 * The schema is applied from migrations/*.sql on first boot (idempotent --
 * `CREATE TABLE IF NOT EXISTS`), so a fresh Vercel deployment is usable
 * immediately with no manual step.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Locate the migrations/ directory.
 *
 * db-vercel.js is bundled by Next.js webpack for pages/api, which rewrites
 * import.meta.url to the build output -- so the module-relative `root` above
 * no longer points at the project. The server's working directory IS the
 * project root both for local `next start` and on Vercel, so prefer that and
 * only fall back to the module-relative path. (When neither resolves, the
 * previous code silently skipped migrations, leaving an empty DB where every
 * table access threw -- all /api/* writes 500ed while reads like /api/health
 * kept working, which made the failure look like an auth bug.)
 */
function findMigrationsDir() {
  const candidates = [join(process.cwd(), 'migrations'), join(root, 'migrations')];
  for (const dir of candidates) {
    try {
      if (existsSync(dir)) return dir;
    } catch {
      /* ignore and try the next candidate */
    }
  }
  return null;
}

function defaultDir() {
  // Vercel serverless functions have a read-only filesystem except /tmp.
  // Opening the DB under the project dir works locally but crashes on Vercel
  // (every /api/* call 500s), so use /tmp there.
  // NOTE: /tmp is per-instance and ephemeral -- sessions/data do not survive
  // Eviction or scale-out. A persistent DB (e.g. Vercel Postgres) is the
  // follow-up if accounts must survive reliably.
  if (process.env.VERCEL === '1') return '/tmp/studyhub-data';
  return join(root, '.data');
}

function openDb() {
  const path = process.env.DATABASE_URL || process.env.DB_PATH || join(defaultDir(), 'studyhub.db');
  const dir = dirname(path);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new DatabaseSync(path, { open: true });
}

/** A single prepared statement bound to concrete values. */
class Stmt {
  constructor(db, sql, values) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  all() {
    const rows = this.db.prepare(this.sql).all(...this.values);
    return { results: Array.isArray(rows) ? rows : [] };
  }
  first() {
    const row = this.db.prepare(this.sql).get(...this.values);
    return row ?? null;
  }
  run() {
    const info = this.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        lastRowid: info.lastInsertRowid ?? null
      }
    };
  }
}

export class D1Shim {
  constructor() {
    this.db = openDb();
    this.migrated = false;
  }

  prepare(sql) {
    // D1 allows calling .all()/.first()/.run() directly on prepare() for
    // parameterless queries, as well as via .bind(...). Support both.
    const bound = (...values) => new Stmt(this.db, sql, values);
    const stmt = new Stmt(this.db, sql, []);
    return Object.assign(stmt, { bind: bound });
  }

  async batch(stmts) {
    const out = [];
    for (const s of stmts) {
      s.run();
      out.push({ success: true });
    }
    return out;
  }

  /** Apply migrations/*.sql once, idempotently. */
  ensureMigrated() {
    if (this.migrated) return;
    const migDir = findMigrationsDir();
    if (!migDir) {
      console.error('[db-vercel] FATAL: migrations/ directory not found; API DB calls will fail.');
      return;
    }
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    // node:sqlite's DatabaseSync has no transaction() API. Most statements are
    // CREATE TABLE IF NOT EXISTS, but some migrations use ALTER TABLE ...
    // ADD COLUMN (no IF NOT EXISTS form) or seed INSERTs with fixed ids --
    // both fail on re-run. The migrations themselves must stay untouched, so
    // idempotency is enforced here: re-run artefacts ("already exists",
    // "duplicate column", UNIQUE seed conflicts) are skipped, anything else
    // is rethrown.
    for (const f of files) {
      const sql = readFileSync(join(migDir, f), 'utf8');
      for (const stmt of splitSql(sql)) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        try {
          this.db.prepare(trimmed).run();
        } catch (err) {
          const msg = err && err.message ? String(err.message) : '';
          if (/already exists|duplicate column|UNIQUE constraint failed/i.test(msg)) continue;
          throw err;
        }
      }
    }
    this.migrated = true;
  }
}

/** Split a migration file into individual SQL statements. */
function splitSql(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === "'") {
      cur += ch; i++;
      while (i < sql.length) {
        cur += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { cur += "'"; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    if (ch === ';') { cur += ch; out.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

let singleton = null;
export function getD1() {
  if (!singleton) singleton = new D1Shim();
  return singleton;
}
