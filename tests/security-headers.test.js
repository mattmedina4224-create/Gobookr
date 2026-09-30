'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('HTML and redirect responses carry baseline browser security headers', () => {
  const src = read('lib/http.js');
  for (const header of [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    'X-Permitted-Cross-Domain-Policies',
  ]) assert.match(src, new RegExp(header));
  assert.match(src, /\.\.\.SECURITY_HEADERS, Location: location/);
  assert.match(src, /\.\.\.SECURITY_HEADERS, 'Content-Type': 'text\/html; charset=utf-8'/);
});
