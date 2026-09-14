#!/usr/bin/env node
/**
 * Generate public/admin/index.html from src/client/admin-shell.js.
 *
 * scripts/build.mjs deliberately refuses to copy a static admin shell into
 * public/admin/ for Cloudflare Pages -- the shell is served only by
 * functions/admin/[[route]].ts after the server-side guard, and a static shell
 * would loop through Pages' directory-index normalization and risk being
 * served directly, bypassing the guard.
 *
 * On Vercel there is no server-side guard, so the shell must be a static file
 * (authorization lives in /api/admin/* via requireDeveloper). This script
 * extracts the ADMIN_SHELL string from the same source module and writes it
 * verbatim, so both platforms always ship identical markup.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shellSrc = join(root, 'src', 'client', 'admin-shell.js');
const outDir = join(root, 'public', 'admin');
const outFile = join(outDir, 'index.html');

if (!existsSync(shellSrc)) {
  console.error('  MISSING  src/client/admin-shell.js');
  process.exit(1);
}

const src = readFileSync(shellSrc, 'utf8');

// Extract the ADMIN_SHELL template literal:  export const ADMIN_SHELL = `...`;
const match = src.match(/export\s+const\s+ADMIN_SHELL\s*=\s*`([\s\S]*?)`;/);
if (!match) {
  console.error('  ERROR    could not find ADMIN_SHELL export in admin-shell.js');
  process.exit(1);
}

const shell = match[1];

// The shell references /admin/admin.js and /admin/admin.css (copied into
// public/admin/ by the build) and /logoedu.png at the root. The markup is
// platform-agnostic -- no transformation needed.
writeFileSync(outFile, shell, 'utf8');
console.log(`  wrote    public/admin/index.html (from admin-shell.js, ${shell.length} bytes)`);