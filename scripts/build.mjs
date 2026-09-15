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
const toolsShimPath = join(root, 'src', 'client', 'tools-shim.js');
const adminSrc = join(root, 'admin');

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

// 1a. Copy the developer admin panel into public/admin/.
// The panel lives in its OWN source directory (admin/) and is served from its
// own URL space (/admin/*), so nothing in the student app or in public/ root
// is touched. It is guarded server-side by functions/admin/[[route]].ts.
if (existsSync(adminSrc)) {
  copyTree(adminSrc, join(out, 'admin'));
  console.log(`  copied   admin/ -> public/admin/`);
} else {
  console.error('  MISSING  admin/ source directory');
  process.exit(1);
}

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
  [
    '/index.html / 200',
    '/*.html /:splat 200',
    ''
  ].join('\n')
);
console.log(`  wrote    public/_redirects (.html URLs preserved)`);

// 2. Append the storage shim to the served script.js.
const originalScript = readFileSync(join(src, 'script.js'));
const shim = readFileSync(shimPath);
// 2b. Append the site-tools controller (admin-managed navigation) after it.
const toolsShim = readFileSync(toolsShimPath);
const combined = Buffer.concat([
  originalScript,
  Buffer.from('\n\n'),
  shim,
  Buffer.from('\n\n'),
  toolsShim
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
console.log('\n  integrity check (student frontend)');
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

// 3a. The admin panel's static assets must be present and copied through.
// NOTE: there is deliberately NO admin/index.html. The admin shell is served by
// functions/admin/[[route]].ts from src/client/admin-shell.js, and is only ever
// returned AFTER the server-side guard passes. A static shell file would both
// loop through Pages' directory-index normalization and risk being served
// directly, bypassing the guard.
const adminRequired = ['admin.css', 'admin.js'];
const adminManifest = {};
console.log('\n  integrity check (admin panel)');
for (const file of adminRequired) {
  const path = join(adminSrc, file);
  if (!existsSync(path)) {
    console.error(`  MISSING  admin/${file}`);
    failed = true;
    continue;
  }
  adminManifest[file] = createHash('md5').update(readFileSync(path)).digest('hex');
  // The copied output must exist too.
  if (!existsSync(join(out, 'admin', file))) {
    console.error(`  MISSING  public/admin/${file} (not copied)`);
    failed = true;
    continue;
  }
  console.log(`  OK       admin/${file}`);
}
// Guard against a static admin shell reappearing on Cloudflare Pages (a
// guard bypass). On Vercel there is no server-side guard, so the shell MUST be
// a static file -- the authorization lives in /api/admin/* via requireDeveloper.
// The generator (step 5) materializes it after this check passes.
if (process.env.VERCEL !== '1' && existsSync(join(out, 'admin', 'index.html'))) {
  console.error('  ERROR    public/admin/index.html exists � shell must be served only by the guard');
  failed = true;
}
writeFileSync(join(root, 'dist', 'admin-manifest.json'), JSON.stringify(adminManifest, null, 2));

// 4. Verify the served script.js keeps the original bytes as a prefix.
const served = readFileSync(join(out, 'script.js'));
const prefixIntact = served.subarray(0, originalScript.length).equals(originalScript);
console.log(`\n  script.js original bytes preserved as prefix: ${prefixIntact ? 'YES' : 'NO'}`);

if (failed || !prefixIntact) {
  console.error('\nBuild failed.');
  process.exit(1);
}

console.log('Build passed.');

// 5. (Vercel) Bundle the TypeScript app to JS.
//    The app uses `.js` import specifiers for `.ts` files (standard TS
//    convention), which Node ESM cannot resolve. esbuild bundles
//    src/index.ts -> dist/server.mjs, self-contained and platform=node so
//    `node:sqlite` stays an external runtime import. The Next.js API
//    catch-all (pages/api/[...route].js) imports from this bundle.
try {
  const esbuild = await import('esbuild');
  const path = await import('node:path');
  const out = path.join(root, 'dist', 'server.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: out,
    external: ['node:sqlite', 'node:crypto', 'node:fs', 'node:path', 'node:url', 'node:child_process'],
    define: { 'process.env.STORAGE_DRIVER': JSON.stringify(process.env.STORAGE_DRIVER || 'local') },
    logLevel: 'warning',
  });
  console.log('  bundled  src/index.ts -> dist/server.mjs');
} catch (e) {
  if (e?.code !== 'MODULE_NOT_FOUND') throw e;
  console.error('  WARNING  esbuild not found, skipping server bundle');
}

// 5b. On Vercel, fail the build if server.mjs was not created.
if (process.env.VERCEL === '1') {
  const serverPath = join(root, 'dist', 'server.mjs');
  if (!existsSync(serverPath)) {
    console.error('\nBuild failed: dist/server.mjs not found. esbuild must be available on Vercel.');
    console.error('Ensure esbuild is in dependencies and installCommand runs without --production.');
    process.exit(1);
  }
}

// 5. (Vercel only) Materialize public/admin/index.html from the shell source.
//    On Cloudflare Pages the shell is served by functions/admin/[[route]].ts
//    after the server-side guard; a static shell would loop through Pages'
//    directory-index normalization and risk bypassing the guard. On Vercel
//    there is no server-side guard, so the shell must be a static file -- the
//    authorization lives in /api/admin/* via requireDeveloper. The generator
//    extracts the ADMIN_SHELL string verbatim, so both platforms ship
//    identical markup. Skipped (non-fatal) when the module is absent.
if (process.env.VERCEL === '1') {
  try {
    await import('./generate-admin-page.mjs');
  } catch (e) {
    if (e?.code !== 'MODULE_NOT_FOUND') throw e;
  }
}
