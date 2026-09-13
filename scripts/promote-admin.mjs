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

const DB = 'studyhub-production';

function usage() {
  console.log(`StudyHub developer bootstrap

  node scripts/promote-admin.mjs list   [--local|--remote]
  node scripts/promote-admin.mjs grant  <email> [--local|--remote]
  node scripts/promote-admin.mjs revoke <email> [--local|--remote]

Targets the local development database by default; pass --remote for production.`);
}

function run(sql) {
  const target = process.argv.includes('--remote') ? '--remote' : '--local';
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, target, '--json', '--command', sql],
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

function main() {
  const [, , command, maybeEmail] = process.argv;

  if (!command || command === 'help' || command === '--help') {
    usage();
    process.exit(0);
  }

  if (command === 'list') {
    const result = run(
      `SELECT email, COALESCE(role,'student') AS role, created_at FROM users ORDER BY role DESC, email ASC`
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
      run(`SELECT id, email FROM users WHERE email = ${sqlQuote(email)}`)
    );
    if (existing.length === 0) {
      console.error(`Error: no account exists with email "${email}".`);
      console.error('Create the account in the app first, then run this again.');
      process.exit(1);
    }

    const role = command === 'grant' ? 'developer' : 'student';
    run(`UPDATE users SET role = ${sqlQuote(role)} WHERE email = ${sqlQuote(email)}`);

    const confirm = rowsOf(
      run(`SELECT email, role FROM users WHERE email = ${sqlQuote(email)}`)
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

main();
