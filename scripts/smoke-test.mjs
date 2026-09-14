/**
 * Smoke-test the Vercel DB shim against a fresh temp DB.
 *
 * Verifies that src/lib/db-vercel.js loads, migrations apply, and the D1
 * interface (prepare/bind/all/first/run/batch) behaves correctly -- the exact
 * contract the StudyHub app relies on. The full Hono app is exercised on
 * Vercel itself (esbuild bundles src/index.ts -> dist/server.mjs there).
 */
import { getD1 } from '../src/lib/db-vercel.js';
import { existsSync, rmSync } from 'node:fs';

const tmp = 'C:/Users/kmuks/OneDrive/Desktop/NEfiu=work/code/webapp/.data/test-' + Date.now() + '.db';
process.env.DB_PATH = tmp;

const db = getD1();
db.ensureMigrated();

const results = [];

// 1. Schema applied?
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
const names = (tables.results || []).map((r) => r.name);
results.push({ name: 'migrations applied', ok: names.includes('users') && names.includes('sessions') && names.includes('workspaces') && names.includes('files') && names.includes('site_tools') && names.includes('app_settings'), detail: names.join(', ') });

// 2. Insert a user + workspace
const uid = 'test-' + Date.now();
const u = db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').bind(uid, 'vercel@example.com', 'x');
u.run();
const w = db.prepare("INSERT INTO workspaces (user_id, data) VALUES (?, ?)").bind(uid, '{}');
w.run();
results.push({ name: 'user + workspace insert', ok: true });

// 3. First() returns a row or null
const found = db.prepare('SELECT id, email FROM users WHERE email = ?').bind('vercel@example.com').first();
results.push({ name: 'prepare().first() returns row', ok: found && found.email === 'vercel@example.com' });
const missing = db.prepare('SELECT id FROM users WHERE email = ?').bind('nope@nowhere.com').first();
results.push({ name: 'prepare().first() returns null for missing', ok: missing === null });

// 4. all() returns array
const rows = db.prepare('SELECT email FROM users ORDER BY email').all();
results.push({ name: 'prepare().all() returns array', ok: Array.isArray(rows.results) && rows.results.length === 1 });

// 5. run() returns success + meta
const r = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind('y', uid).run();
results.push({ name: 'prepare().run() returns meta', ok: r.success === true && r.meta && typeof r.meta.changes === 'number' });

// 6. batch() works (the AI config save path)
const stmt1 = db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").bind('ai_provider', 'openai');
const stmt2 = db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").bind('ai_model', 'gpt-4o-mini');
const batched = await db.batch([stmt1, stmt2]);
results.push({ name: 'batch() applies multiple stmts', ok: Array.isArray(batched) && batched.length === 2 && batched.every((b) => b.success) });

// 7. ON CONFLICT upsert (used by saveAiConfig)
const upsert = db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind('ai_model', 'gpt-4o');
upsert.run();
const val = db.prepare('SELECT value FROM app_settings WHERE key = ?').bind('ai_model').first();
results.push({ name: 'ON CONFLICT upsert works', ok: val && val.value === 'gpt-4o' });

// 8. site_tools table exists (migration 0003)
const tools = db.prepare('SELECT COUNT(*) AS c FROM site_tools').all();
results.push({ name: 'site_tools table exists', ok: (tools.results[0].c || 0) >= 0 });

// 9. Foreign keys enforced (sessions -> users cascade)
db.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
const leftover = db.prepare('SELECT COUNT(*) AS c FROM workspaces WHERE user_id = ?').bind(uid).all();
results.push({ name: 'FK cascade on user delete', ok: (leftover.results[0].c || 0) === 0 });

console.log('\n=== Vercel DB shim smoke test ===');
let pass = 0, fail = 0;
for (const r of results) {
  if (r.ok) pass++; else fail++;
  console.log((r.ok ? 'PASS' : 'FAIL'), r.name, r.detail ? `(${r.detail})` : '');
}
console.log(`\n${pass} passed, ${fail} failed`);

try { rmSync(tmp); } catch {}
if (fail > 0) process.exit(1);