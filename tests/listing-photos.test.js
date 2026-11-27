'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('professional and business listings never show stock photos in place of their own', () => {
  for (const file of ['routes/public.js', 'routes/home.js']) {
    const src = read(file);
    assert.doesNotMatch(src, /categoryCover/);
    assert.match(src, /no-photo/);
  }
  assert.doesNotMatch(read('routes/public.js'), /Example photo/);
});

test('site sections carry illustrative photos so pages are not plain', () => {
  assert.match(read('routes/public.js'), /class="gb-svc-row"/);
  const home = read('routes/home.js');
  assert.match(home, /gb-step-photo/);
  assert.match(home, /gb-band-photos/);
  assert.match(home, /SPECIALTY_PHOTOS/);
});
