#!/usr/bin/env node
/**
 * Developer bootstrap CLI.
 *
 * The admin panel is developer-only, so at least one account must hold the
 * `developer` role before anyone can reach /admin. This script is that
 * bootstrap path. It writes to the `users.role` column — the same server-side
 * source of truth the API guard reads — via `wrangler d1 execute`.
 *
 * Usage:
 *   node scripts/promote-admin.mjs list   [--local|--remote]
 *   node scripts/promote-admin.mjs grant  <email> [--local|--remote]
 *   node scripts/promote-admin.mjs revoke <email> [--local|--remote]
 *
 * Defaults to --local (the development database). Use --remote to target the
 * deployed production D1 database.
 *
 * This is intentionally a CLI, not an HTTP endpoint: there must be no unguarded
 * route that can grant developer rights.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB = 'studyhub-production';

function usage() {
  console.log(`StudyHub developer bootstrap

  node scripts/promote-admin.mjs list   [--local|--remote]
  node scripts/promote-admin.mjs grant  <email> [--local|--remote]
  node scripts/promote-admin.mjs revoke <email> [--local|--remote]

Targets the local development database by default; pass --remote for production.
Uses wrangler when it is installed, otherwise writes the local node:sqlite file
directly (.data/studyhub.db, or DB_PATH/DATABASE_URL when set).`);
}

function wranglerBin() {
  // Windows: `npx` is a .cmd shim that Node's spawnSync cannot exec directly
  // (ENOENT). Fall back to the wrangler entry point installed in node_modules.
  const local = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url);
  const path = fileURLToPath(local);
  return existsSync(path) ? path : null;
}

/**
 * Direct SQLite path, used when wrangler is unavailable.
 *
 * The Next.js runtime serves from node:sqlite (src/lib/db-vercel.js) and this
 * branch does not ship wrangler at all, so shelling out to `wrangler d1
 * execute` -- the original bootstrap -- simply fails here. This writes the same
 * `users.role` column to the same database the server reads, honouring the same
 * DB_PATH/DATABASE_URL resolution order. --remote is still wrangler-only: a
 * hosted database is reached through Turso credentials, not this local file.
 */
function sqliteFile() {
  if (process.argv.includes('--remote')) return null;
  const explicit = process.env.DATABASE_URL || process.env.DB_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const local = fileURLToPath(new URL('../.data/studyhub.db', import.meta.url));
  return existsSync(local) ? local : null;
}

async function runSqlite(file, statements) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  try {
    const results = [];
    for (const sql of statements) {
      const stmt = db.prepare(sql);
      results.push(/^\s*select/i.test(sql) ? { results: stmt.all() } : (stmt.run(), { results: [] }));
    }
    return results.length === 1 ? results[0] : results;
  } finally {
    db.close();
  }
}

function run(sql, file) {
  if (file) return runSqlite(file, [sql]);
  const target = process.argv.includes('--remote') ? '--remote' : '--local';
  const out = execFileSync(
    process.execPath,
    [wranglerBin(), 'd1', 'execute', DB, target, '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

/** Quote a value for a SQL literal (single-quote escaping). */
function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rowsOf(result) {
  if (Array.isArray(result)) {
    for (const entry of result) if (Array.isArray(entry.results)) return entry.results;
  }
  if (result && Array.isArray(result.results)) return result.results;
  return [];
}

async function main() {
  const [, , command, maybeEmail] = process.argv;
  // Resolve the backend once: wrangler when present, else the local SQLite file.
  const bin = wranglerBin();
  const file = bin ? null : sqliteFile();

  if (!bin && !file) {
    console.error('Error: no database backend available.');
    console.error('Install wrangler for --remote, or run this from a checkout whose local');
    console.error('database exists at .data/studyhub.db (set DB_PATH to point elsewhere).');
    process.exit(1);
  }

  if (!command || command === 'help' || command === '--help') {
    usage();
    process.exit(0);
  }

  if (command === 'list') {
    const result = await run(
      `SELECT email, COALESCE(role,'student') AS role, created_at FROM users ORDER BY role DESC, email ASC`,
      file
    );
    const rows = rowsOf(result);
    if (rows.length === 0) {
      console.log('No users found.');
      return;
    }
    console.log('\n  role        email');
    console.log('  ----------  ----------------------------------------');
    for (const row of rows) {
      console.log(`  ${String(row.role).padEnd(10)}  ${row.email}`);
    }
    console.log('');
    return;
  }

  if (command === 'grant' || command === 'revoke') {
    const email = (maybeEmail || '').trim().toLowerCase();
    if (!email) {
      console.error(`Error: ${command} requires an email address.`);
      usage();
      process.exit(1);
    }

    const existing = rowsOf(
      await run(`SELECT id, email FROM users WHERE email = ${sqlQuote(email)}`, file)
    );
    if (existing.length === 0) {
      console.error(`Error: no account exists with email "${email}".`);
      console.error('Create the account in the app first, then run this again.');
      process.exit(1);
    }

    const role = command === 'grant' ? 'developer' : 'student';
    await run(`UPDATE users SET role = ${sqlQuote(role)} WHERE email = ${sqlQuote(email)}`, file);

    const confirm = rowsOf(
      await run(`SELECT email, role FROM users WHERE email = ${sqlQuote(email)}`, file)
    )[0];
    console.log(`\n  ${confirm.email} -> role = ${confirm.role}\n`);
    if (confirm.role !== role) {
      console.error('Warning: the update did not take effect as expected.');
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(`Error: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
