'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('zero-result marketplace searches preserve intent and offer progressive recovery', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(src, /broadenDistance/);
  assert.match(src, /Search within \$\{broadenDistance\} miles/);
  assert.match(src, /Browse all services/);
  assert.match(src, /Clear name or business/);
  assert.match(src, /Keep your search and broaden one thing at a time/);
  assert.match(src, /filterLink\(\{ radius: broadenDistance \}\)/);
});
