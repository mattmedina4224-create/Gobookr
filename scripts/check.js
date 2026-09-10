'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'data', 'public']);

function collectJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = collectJs(ROOT).sort();
let failed = false;

for (const file of files) {
  const relative = path.relative(ROOT, file);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`✓ ${relative}`);
  } else {
    failed = true;
    console.error(`✗ ${relative}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
