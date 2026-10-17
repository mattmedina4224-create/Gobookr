'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('customer login polish is clean, useful, mobile-friendly, and claim-safe', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'site-navigation.js'), 'utf8');
  assert.match(js, /Sign in to GoBookr/);
  assert.match(js, /Save your favorite professionals and find them again anytime\./);
  assert.match(js, /Create a free account/);
  assert.match(js, /href="\/signup"/);
  assert.match(js, /has\('claim'\)/);
  assert.match(js, /@media\(max-width:600px\)/);
  assert.doesNotMatch(js, /gradient/i);
  assert.doesNotMatch(js, /glow/i);
});
