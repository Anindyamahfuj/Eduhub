#!/usr/bin/env node
/**
 * Admin panel render test.
 *
 * Regression guard for a real bug: `table()` appended cell values directly with
 * appendChild(), which only accepts DOM Nodes. Any numeric column (Overview
 * counts, Users file/session counts, Data row counts and byte sizes) therefore
 * threw
 *
 *     TypeError: Failed to execute 'appendChild' on 'Node':
 *                parameter 1 is not of type 'Node'
 *
 * and the ENTIRE section failed to render — Overview, Users and Data all showed
 * "Request failed." while the string-only sections worked. The API was healthy
 * throughout, so no API-level test could have caught it.
 *
 * This test loads the real admin.js in jsdom with the exact payload SHAPES the
 * API returns (numbers, nulls, empty arrays, badge elements) and asserts every
 * section renders content without throwing.
 *
 * Usage: node scripts/admin-render-test.mjs [base_url]
 *        When a base_url is given and ADMIN_EMAIL/ADMIN_PASSWORD are set, the
 *        payloads are fetched live instead of using the embedded shapes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adminJs = readFileSync(join(root, 'admin', 'admin.js'), 'utf8');
const shell = readFileSync(join(root, 'src', 'client', 'admin-shell.js'), 'utf8')
  .replace(/^export const ADMIN_SHELL = `/, '')
  .replace(/`;\s*$/, '');

/* ---------------- embedded payload shapes (from the real API) ------------- */

const synthetic = {
  whoami: { ok: true, developer: true, user: { id: 'u1', email: 'dev@example.com', role: 'developer' } },

  // numbers + nested recent rows with a badge-producing `result`
  overview: {
    ok: true, logAvailable: true,
    counts: { users: 15, developers: 2, usersWithUnexpiredSession: 15, activeSessions: 16, files: 3, fileBytes: 4096, workspaces: 15, workspacesParsed: 15 },
    collections: [
      { key: 'notes', label: 'Notes', count: 7 },
      { key: 'assignments', label: 'Assignments', count: 0 },
      { key: 'flashcardDecks', label: 'Flashcard decks', count: 2 }
    ],
    recent: [
      { created_at: '2026-09-13 15:00:00', actor_email: 'dev@example.com', action: 'auth.login', target: 'account', result: 'ok' },
      { created_at: '2026-09-13 15:01:00', actor_email: null, action: 'authz.denied', target: '/admin', result: 'denied' }
    ]
  },

  // numeric columns + nulls (a user with no files/workspace/sessions)
  users: {
    ok: true, query: '', limit: 100,
    users: [
      { id: 'u1', email: 'dev@example.com', role: 'developer', developer: true, createdAt: '2026-09-13 14:00:00', fileCount: 3, fileBytes: 4096, workspaceBytes: 220, workspaceUpdatedAt: '2026-09-13 15:00:00', sessionCount: 4, latestSessionExpiry: '2026-10-13T00:00:00.000Z' },
      { id: 'u2', email: 'student@example.com', role: 'student', developer: false, createdAt: '2026-09-13 14:05:00', fileCount: 0, fileBytes: 0, workspaceBytes: 0, workspaceUpdatedAt: null, sessionCount: 0, latestSessionExpiry: null }
    ]
  },

  data: {
    ok: true,
    workspaces: [{ userId: 'u1', email: 'dev@example.com', bytes: 220, updatedAt: '2026-09-13 15:00:00' }],
    sample: { userId: 'u1', email: 'dev@example.com', updatedAt: '2026-09-13 15:00:00' },
    shape: [
      { key: 'notes', type: 'array', count: 7 },
      { key: 'theme', type: 'string', count: null },   // null count -> number column
      { key: 'settings', type: 'object', count: 3 }
    ]
  },

  'data/tables': {
    ok: true,
    tables: [
      { name: 'users', rows: 15, columns: [{ name: 'id', type: 'TEXT' }, { name: 'role', type: 'TEXT' }] },
      { name: 'audit_logs', rows: 128, columns: [{ name: 'id', type: 'INTEGER' }] }
    ]
  },

  files: {
    ok: true, driver: 'local', total: 1, totalBytes: 2048, contentsExposed: false,
    files: [{ id: 'f1', name: 'notes.pdf', size: 2048, mime: 'application/pdf', ownerId: 'u1', ownerEmail: 'dev@example.com', uploadedAt: '2026-09-13 15:00:00', storageKey: null, status: 'inline (database blob)' }]
  },

  tools: {
    ok: true,
    tools: [
      { id: 'dashboard', kind: 'builtin', label: 'Dashboard', href: 'index.html', icon: 'ph-squares-four', sortOrder: 10, enabled: true, createdAt: '2026-09-13 14:00:00', updatedAt: '2026-09-13 14:00:00' },
      { id: 'calculator', kind: 'builtin', label: 'Calculator', href: 'calculator.html', icon: 'ph-calculator', sortOrder: 30, enabled: false, createdAt: '2026-09-13 14:00:00', updatedAt: '2026-09-13 15:00:00' },
      { id: 'pomodoro', kind: 'custom', label: 'Pomodoro', href: 'https://pomofocus.io', icon: 'ph-timer', sortOrder: 120, enabled: true, createdAt: '2026-09-13 15:00:00', updatedAt: '2026-09-13 15:00:00' }
    ]
  },

  logs: {
    ok: true, available: true, total: 2,
    actions: [{ action: 'auth.login', n: 1 }, { action: 'authz.denied', n: 1 }],
    logs: [
      { id: 2, created_at: '2026-09-13 15:01:00', actor_email: null, action: 'authz.denied', target: '/admin', result: 'denied', detail: 'not a developer' },
      { id: 1, created_at: '2026-09-13 15:00:00', actor_email: 'dev@example.com', action: 'auth.login', target: 'account', result: 'ok', detail: null }
    ]
  },

  system: {
    ok: true,
    checks: [
      { name: 'Backend / API', status: 'ok', detail: 'Hono application responding' },
      { name: 'Audit log', status: 'degraded', detail: 'audit_logs table present' },
      { name: 'AI provider', status: 'error', detail: 'not configured' }
    ],
    runtime: { storageDriver: 'local', aiConfigured: false, time: '2026-09-13T15:00:00.000Z' }
  },

  ai: {
    ok: true, provider: 'OpenAI-compatible', status: 'not configured', model: null,
    endpoint: 'https://api.openai.com/v1', hasKey: false,
    chatEndpoint: '/api/ai/chat/completions', configured: false,
    note: 'Placeholder only — no LLM integration is enabled and no request is sent.'
  }
};

/* ------------------------------- live mode -------------------------------- */

const base = process.argv[2];
let payloads = synthetic;
let live = false;

if (base && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  live = true;
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!login.ok) {
    console.error(`Live login failed (${login.status}); falling back to embedded payloads.`);
    live = false;
  } else {
    payloads = { ...synthetic };
    for (const key of ['whoami', 'overview', 'users', 'data', 'data/tables', 'files', 'tools', 'logs', 'system', 'ai']) {
      const res = await fetch(`${base}/api/admin/${key}`, { headers: { Cookie: cookie } });
      payloads[key] = await res.json();
    }
    console.log(`live payloads from ${base}\n`);
  }
}

/* --------------------------------- runner --------------------------------- */

const SECTIONS = ['overview', 'users', 'data', 'files', 'tools', 'logs', 'system', 'ai'];
let pass = 0;
let fail = 0;

console.log('StudyHub admin render test');
console.log(`mode: ${live ? 'live' : 'embedded payload shapes'}`);
console.log('-----------------------------------------------');

for (const section of SECTIONS) {
  const url = section === 'overview' ? 'https://admin.test/admin' : `https://admin.test/admin/${section}`;
  const dom = new JSDOM(shell, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  const thrown = [];
  window.fetch = (input) => {
    const path = String(input).replace(/^.*\/api\/admin\/?/, '').replace(/\/$/, '');
    const key = path === '' ? 'whoami' : path;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(payloads[key] ?? {}))
    });
  };
  window.addEventListener('error', (e) => thrown.push(e.message));

  try {
    window.eval(adminJs);
  } catch (e) {
    thrown.push(`eval: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 120));

  const body = window.document.getElementById('admin-body');
  const stillLoading = Boolean(body.querySelector('.admin-loading'));
  const errorBox = body.querySelector('.admin-error');
  const cards = body.querySelectorAll('.admin-card').length;
  const tables = body.querySelectorAll('table.admin-table').length;
  const rendered = cards + tables > 0;

  if (thrown.length === 0 && !stillLoading && rendered) {
    console.log(`  PASS  ${section} renders (cards=${cards}, tables=${tables})`);
    pass++;
  } else {
    console.log(`  FAIL  ${section}`);
    if (stillLoading) console.log('        still stuck on the loading placeholder');
    if (errorBox) console.log(`        error box: ${errorBox.textContent.trim().slice(0, 140)}`);
    for (const t of thrown) console.log(`        thrown: ${t}`);
    if (!rendered && !stillLoading) console.log('        rendered no cards or tables');
    fail++;
  }
}

console.log('-----------------------------------------------');
console.log(`PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
