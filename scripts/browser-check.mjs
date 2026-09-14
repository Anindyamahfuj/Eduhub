#!/usr/bin/env node
/**
 * Browser-side verification of the storage layer.
 *
 * The curl suite tests the API, but it cannot prove the *frontend* actually
 * talks to it. This harness loads the real appended shim into a jsdom window
 * (a browser-like global scope) alongside the original global loadData /
 * saveData declarations, then verifies:
 *
 *   1. window.loadData / window.saveData are actually overridden
 *      (the previous shim used nested IIFE functions, which do NOT shadow the
 *       globals — so the backend was silently never called);
 *   2. an unauthenticated visitor is gated: /api/auth/me is consulted and no
 *      workspace write is attempted;
 *   3. a signed-in user's workspace is loaded from the server;
 *   4. calling saveData() issues a PUT /api/workspace that really persists,
 *      verified by re-reading it through the API with the same session.
 *
 * Usage: node scripts/browser-check.mjs [base_url]
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const BASE = process.argv[2] || 'http://localhost:3000';
let pass = 0;
let fail = 0;
const ok = (m) => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++; };
const check = (m, cond) => (cond ? ok(m) : bad(m));

const SHIM = readFileSync(new URL('../src/client/storage-shim.js', import.meta.url), 'utf8');

const ORIGINAL_GLOBALS = `
  function getDefaultData() {
    return {
      files: [], habits: [], notices: [], notes: [], history: [], searches: [],
      lastReset: null, assignments: [], goals: [], flashcards: { decks: [] },
      readingList: [], sessions: [], pomodoroLogs: [], planner: {}, journal: {},
      subjects: ['General','Math','Science','Language'],
      priorityMatrix: {
        'urgent-important': [], 'not-urgent-important': [],
        'urgent-not-important': [], 'not-urgent-not-important': []
      },
      deepWorkLogs: [], blockerOn: false, trash: [], fileAnnotations: {}
    };
  }
  function loadData() {
    try { var raw = localStorage.getItem('studyHubData'); if (raw) return JSON.parse(raw); } catch (e) {}
    return getDefaultData();
  }
  function saveData(data) {
    localStorage.setItem('studyHubData', JSON.stringify(data));
  }
`;

/** Build a jsdom window wired to the real server, recording every request. */
function makeEnv(cookie) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: `${BASE}/index.html`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;

  const requests = [];
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? new URL(input, BASE).toString() : String(input);
    const method = (init.method || 'GET').toUpperCase();
    requests.push({ url, method, body: init.body || null });
    const headers = { ...(init.headers || {}) };
    if (cookie) headers['Cookie'] = cookie; // emulate the browser's session cookie
    return fetch(url, { method, headers, body: init.body });
  };

  window.eval(ORIGINAL_GLOBALS);
  const originalLoad = window.loadData;
  const originalSave = window.saveData;
  return { dom, window, requests, originalLoad, originalSave, getCookie: () => cookie };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run the shim in a window and return after its gate() has settled. */
function runShim(window) {
  window.eval(SHIM);
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
}

async function register(email, password) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, cookie: setCookie.split(';')[0] };
}

console.log(`StudyHub browser-layer check — ${BASE}`);
console.log('----------------------------------------------------------------');

// ---------------------------------------------------------------- 1. override
{
  const env = makeEnv(null);
  runShim(env.window);
  await wait(50);
  check(
    'window.loadData is overridden by the storage layer',
    env.window.loadData !== env.originalLoad
  );
  check(
    'window.saveData is overridden by the storage layer',
    env.window.saveData !== env.originalSave
  );
  env.dom.window.close();
}

// ------------------------------------------------- 2. unauthenticated gating
{
  const env = makeEnv(null);
  runShim(env.window);
  await wait(400);
  const calledMe = env.requests.some((r) => r.url.endsWith('/api/auth/me'));
  check('unauthenticated: /api/auth/me is consulted', calledMe);
  const wroteWorkspace = env.requests.some(
    (r) => r.method === 'PUT' && r.url.endsWith('/api/workspace')
  );
  check('unauthenticated: no workspace write is attempted', !wroteWorkspace);
  env.dom.window.close();
}

// --------------------------------------------- 3 + 4. authenticated round trip
{
  const email = `browser${Date.now()}${Math.floor(Math.random() * 1e6)}@test.local`;
  const { status, cookie } = await register(email, 'testpassword123');
  check('register a real account for the browser test (201)', status === 201);

  if (status === 201) {
    // Put a distinctive document on the server first.
    const prime = { notes: [{ id: 'primer', text: 'SERVER-SIDE-DOC' }] };
    await fetch(`${BASE}/api/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ data: prime })
    });

    const env = makeEnv(cookie);
    runShim(env.window);
    await wait(600);

    const loadedWorkspace = env.requests.some(
      (r) => r.method === 'GET' && r.url.endsWith('/api/workspace')
    );
    check('authenticated: workspace is loaded from the server', loadedWorkspace);

    const data = env.window.loadData();
    check(
      'loadData() returns the server document (not an empty local default)',
      JSON.stringify(data).includes('SERVER-SIDE-DOC')
    );

    // Now edit through the frontend's own saveData and confirm it persists.
    data.notes.push({ id: 'frombrowser', text: 'EDITED-IN-BROWSER' });
    env.window.saveData(data);
    await wait(1500); // debounce is 700ms

    const put = env.requests.find(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/workspace')
    );
    check('saveData() issues PUT /api/workspace', Boolean(put));

    const verify = await fetch(`${BASE}/api/workspace`, { headers: { Cookie: cookie } });
    const payload = await verify.json();
    const text = JSON.stringify(payload.data ?? {});
    check('the edit is persisted on the server', text.includes('EDITED-IN-BROWSER'));
    check(
      'the server document still holds the earlier content',
      text.includes('SERVER-SIDE-DOC')
    );

    // A second account on the same browser must not inherit the first's cache.
    const other = await register(
      `other${Date.now()}${Math.floor(Math.random() * 1e6)}@test.local`,
      'testpassword123'
    );
    const env2 = makeEnv(other.cookie);
    // Reuse the same localStorage document the first user left behind.
    env2.window.localStorage.setItem(
      'studyHubData',
      JSON.stringify({ notes: [{ id: 'leak', text: 'EDITED-IN-BROWSER' }] })
    );
    env2.window.localStorage.setItem('studyHubUser', 'stale-user-id');
    runShim(env2.window);
    await wait(600);
    const leaked = JSON.stringify(env2.window.loadData()).includes('EDITED-IN-BROWSER');
    const serverLeak = env2.requests.some(
      (r) => r.method === 'PUT' && String(r.body || '').includes('EDITED-IN-BROWSER')
    );
    check('different account does not reuse the previous cache', !leaked);
    check('different account never pushes the previous user\'s data', !serverLeak);

    env.dom.window.close();
    env2.dom.window.close();
  }
}

console.log('----------------------------------------------------------------');
console.log(`PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
