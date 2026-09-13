#!/usr/bin/env node
/**
 * Uploads files to local disk storage for development.
 *
 * Usage:  node scripts/upload.mjs <file> [<file> ...]
 *
 * Writes bytes into the local uploads directory (LOCAL_FILES_DIR in
 * wrangler.jsonc) and prints the resulting public path for each file.
 * This is a development convenience only; it does not require R2.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { extname, basename, join } from 'node:path';

const DIR = 'static/uploads';
const URL_PREFIX = '/static/uploads';

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage: node scripts/upload.mjs <file> [<file> ...]');
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });

for (const input of inputs) {
  try {
    const buf = readFileSync(input);
    const ext = extname(input).replace('.', '') || 'bin';
    const key = `${randomBytes(10).toString('hex')}.${ext}`;
    const target = join(DIR, key);
    writeFileSync(target, buf);
    console.log(`${basename(input)}\t${buf.length}\t${URL_PREFIX}/${key}`);
  } catch (e) {
    console.error(`${input}\tFAILED\t${e.message}`);
  }
}
