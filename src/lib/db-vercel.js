/**
 * D1-compatible database wrapper for Vercel.
 *
 * The StudyHub app talks to its database exclusively through the D1 interface:
 *   env.DB.prepare(sql).bind(...).all<T>()   -> { results: T[] }
 *   env.DB.prepare(sql).bind(...).first<T>() -> T | null
 *   env.DB.prepare(sql).bind(...).run()      -> { success, meta }
 *   env.DB.batch([stmt, ...])               -> per-stmt results
 *
 * Backends (selected by env vars, checked in order):
 *   1. TURSO_DATABASE_URL + TURSO_AUTH_TOKEN  -> Turso/libSQL (persistent, recommended)
 *   2. node:sqlite (Node 22+)                 -> local file, /tmp on Vercel (ephemeral)
 *
 * The schema is applied from migrations/*.sql on first boot (idempotent --
 * `CREATE TABLE IF NOT EXISTS`). Re-run artefacts from earlier migrations
 * (ALTER TABLE ADD COLUMN, seed INSERTs) are silently skipped.
 */
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function findMigrationsDir() {
  const candidates = [join(process.cwd(), 'migrations'), join(root, 'migrations')];
  for (const dir of candidates) {
    try { if (existsSync(dir)) return dir; } catch { /* next */ }
  }
  return null;
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

// ─────────────────────────────────────────────────────────────
//  Backend 1: Turso (libSQL) — persistent, recommended
// ─────────────────────────────────────────────────────────────

async function createTursoShim() {
  const { createClient } = await import('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  class TursoStmt {
    constructor(sql, values) {
      this.sql = sql;
      this.values = values || [];
    }
    async all() {
      const r = await client.execute({ sql: this.sql, args: this.values });
      return { results: r.rows };
    }
    async first() {
      const r = await client.execute({ sql: this.sql, args: this.values });
      return r.rows[0] ?? null;
    }
    async run() {
      const r = await client.execute({ sql: this.sql, args: this.values });
      return {
        success: true,
        meta: { changes: Number(r.rowsAffected ?? 0), lastRowid: Number(r.lastInsertRowid ?? 0) }
      };
    }
  }

  const shim = {
    prepare(sql) {
      const bound = (...values) => new TursoStmt(sql, values);
      const stmt = new TursoStmt(sql, []);
      return Object.assign(stmt, { bind: bound });
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) { await s.run(); out.push({ success: true }); }
      return out;
    },
    migrated: false,
    async ensureMigrated() {
      if (shim.migrated) return;
      shim.migrated = true;
      const migDir = findMigrationsDir();
      if (!migDir) { console.error('[db-vercel] FATAL: migrations/ not found'); return; }
      const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        const sql = readFileSync(join(migDir, f), 'utf8');
        for (const stmt of splitSql(sql)) {
          const trimmed = stmt.trim();
          if (!trimmed) continue;
          try {
            await client.execute(trimmed);
          } catch (err) {
            const msg = err && err.message ? String(err.message) : '';
            if (/already exists|duplicate column|UNIQUE constraint failed|table .* already exists/i.test(msg)) continue;
            console.error(`[db-vercel] migration error in ${f}:`, msg);
          }
        }
      }
      console.log('[db-vercel] migrations complete (Turso)');
    }
  };
  return shim;
}

// ─────────────────────────────────────────────────────────────
//  Backend 2: node:sqlite — local file, ephemeral on Vercel
// ─────────────────────────────────────────────────────────────

function createSqliteShim() {
  const { DatabaseSync } = require('node:sqlite');

  function defaultDir() {
    if (process.env.VERCEL === '1') return '/tmp/studyhub-data';
    return join(root, '.data');
  }

  function openDb() {
    const path = process.env.DATABASE_URL || process.env.DB_PATH || join(defaultDir(), 'studyhub.db');
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    return new DatabaseSync(path, { open: true });
  }

  const db = openDb();

  // NOTE: all()/first()/run() are declared async on purpose. D1's interface is
  // promise-based, and app code relies on that beyond plain `await` -- e.g.
  // routes/admin.ts uses `.first().catch(() => fallback)` for best-effort
  // queries (table counts, audit aggregates). Returning a bare value here made
  // those calls throw "(...).catch is not a function" and turned
  // /api/admin/logs and /api/admin/data/tables into hard 500s. None of the
  // three bodies awaits anything, so execution still happens synchronously on
  // call: only the return type changes.
  class Stmt {
    constructor(sql, values) {
      this.sql = sql;
      this.values = values;
    }
    async all() {
      const rows = db.prepare(this.sql).all(...this.values);
      return { results: Array.isArray(rows) ? rows : [] };
    }
    async first() {
      return db.prepare(this.sql).get(...this.values) ?? null;
    }
    async run() {
      const info = db.prepare(this.sql).run(...this.values);
      return {
        success: true,
        meta: { changes: Number(info.changes ?? 0), lastRowid: info.lastInsertRowid ?? null }
      };
    }
  }

  const shim = {
    prepare(sql) {
      const bound = (...values) => new Stmt(sql, values);
      const stmt = new Stmt(sql, []);
      return Object.assign(stmt, { bind: bound });
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) { const r = await s.run(); out.push(r ?? { success: true }); }
      return out;
    },
    migrated: false,
    ensureMigrated() {
      if (shim.migrated) return;
      shim.migrated = true;
      const migDir = findMigrationsDir();
      if (!migDir) { console.error('[db-vercel] FATAL: migrations/ not found'); return; }
      const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        const sql = readFileSync(join(migDir, f), 'utf8');
        for (const stmt of splitSql(sql)) {
          const trimmed = stmt.trim();
          if (!trimmed) continue;
          try {
            db.prepare(trimmed).run();
          } catch (err) {
            const msg = err && err.message ? String(err.message) : '';
            if (/already exists|duplicate column|UNIQUE constraint failed/i.test(msg)) continue;
            throw err;
          }
        }
      }
    }
  };
  return shim;
}

// ─────────────────────────────────────────────────────────────
//  Singleton
// ─────────────────────────────────────────────────────────────

let singleton = null;
export async function getD1() {
  if (!singleton) {
    if (process.env.TURSO_DATABASE_URL) {
      console.log('[db-vercel] using Turso backend');
      singleton = await createTursoShim();
    } else {
      console.log('[db-vercel] using node:sqlite backend (ephemeral)');
      singleton = createSqliteShim();
    }
  }
  if (typeof singleton.ensureMigrated === 'function') await singleton.ensureMigrated();
  return singleton;
}
