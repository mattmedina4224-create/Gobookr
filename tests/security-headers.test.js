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


test('authenticated POST requests are CSRF protected by default', () => {
  const src = read('server.js');
  assert.match(src, /const CSRF_EXEMPT_POST_PATHS = new Set\(\['\/login', '\/signup', '\/forgot-password', '\/reset-password'\]\)/);
  assert.match(src, /if \(ctx\.session && !CSRF_EXEMPT_POST_PATHS\.has\(pathname\)\)/);
  assert.match(src, /if \(!submitted \|\| submitted !== expected\)/);
  assert.match(src, /res\.writeHead\(403/);
});

test('claim and admin mutation routes are not CSRF exemptions', () => {
  const src = read('server.js');
  const exempt = src.match(/CSRF_EXEMPT_POST_PATHS = new Set\(\[([^\]]+)\]\)/)?.[1] || '';
  assert.doesNotMatch(exempt, /claim|admin|dashboard|billing|portfolio/);
});
