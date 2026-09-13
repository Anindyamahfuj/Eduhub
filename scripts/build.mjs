#!/usr/bin/env node
/**
 * Build step.
 *
 * Source of truth for the frontend is `frontend/` — the StudyHub files are
 * kept there BYTE-IDENTICAL to the original project. This script produces the
 * served output in `public/` by:
 *
 *   1. copying every frontend file over (never deleting public/static/uploads,
 *      which holds locally stored uploads);
 *   2. appending src/client/storage-shim.js to public/script.js.
 *
 * The shim only overrides the storage functions (loadData/saveData) and adds
 * the auth gate. The original bytes of script.js remain an unmodified prefix,
 * and the HTML files are copied untouched — so the UI, DOM and interactions
 * are unchanged.
 */
import { createHash } from 'node:crypto';
import {
  readFileSync, existsSync, mkdirSync, writeFileSync,
  readdirSync, copyFileSync, statSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'frontend');
const out = join(root, 'public');
const shimPath = join(root, 'src', 'client', 'storage-shim.js');

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const s = join(from, entry);
    const d = join(to, entry);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

console.log('StudyHub build');
console.log('--------------');

// 1. Copy the pristine frontend into the served output directory.
copyTree(src, out);
console.log(`  copied   frontend/ -> public/`);

// 1b. Preserve the original .html URLs.
// Cloudflare Pages otherwise 308-redirects /notes.html -> /notes, which
// changes the site's URLs and breaks the frontend's own path checks
// (setActiveNavLink / refreshCurrentPage compare location.pathname to
// 'notes.html'). A rewrite (status 200) serves the file at the original URL.
//
// The /index.html rule must come first: Pages treats the root index specially
// and would otherwise redirect it to "/" before the wildcard rule is reached.
writeFileSync(
  join(out, '_redirects'),
  ['/index.html / 200', '/*.html /:splat 200', ''].join('\n')
);
console.log(`  wrote    public/_redirects (.html URLs preserved)`);

// 2. Append the storage shim to the served script.js.
const originalScript = readFileSync(join(src, 'script.js'));
const shim = readFileSync(shimPath);
const combined = Buffer.concat([
  originalScript,
  Buffer.from('\n\n'),
  shim
]);
writeFileSync(join(out, 'script.js'), combined);

// 3. Record the hashes of the pristine files so byte-identity can be re-verified.
const required = [
  'index.html', 'ai-tools.html', 'calculator.html', 'files.html', 'habits.html',
  'notice.html', 'notes.html', 'assignments.html', 'planner.html', 'flashcards.html',
  'reading.html', 'style.css', 'script.js', 'logoedu.png', 'login.html'
];

let failed = false;
const manifest = {};
console.log('\n  integrity check');
for (const file of required) {
  const path = join(src, file);
  if (!existsSync(path)) {
    console.error(`  MISSING  ${file}`);
    failed = true;
    continue;
  }
  const hash = createHash('md5').update(readFileSync(path)).digest('hex');
  manifest[file] = hash;
  console.log(`  OK       ${file}`);
}

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'frontend-manifest.json'), JSON.stringify(manifest, null, 2));

// 4. Verify the served script.js keeps the original bytes as a prefix.
const served = readFileSync(join(out, 'script.js'));
const prefixIntact = served.subarray(0, originalScript.length).equals(originalScript);
console.log(`\n  script.js original bytes preserved as prefix: ${prefixIntact ? 'YES' : 'NO'}`);

if (failed || !prefixIntact) {
  console.error('\nBuild failed.');
  process.exit(1);
}

console.log('Build passed.');
