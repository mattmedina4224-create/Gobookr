'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function source(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); }

test('auth entry points are rate limited', () => {
  const rate = source('lib/rate-limit.js');
  for (const route of ['/login', '/signup', '/forgot-password', '/reset-password']) assert.ok(rate.includes(`'${route}'`));
});

test('password reset preserves enumeration resistance and session revocation', () => {
  const auth = source('routes/auth.js');
  assert.ok(auth.includes("If an account exists for that email"));
  assert.ok(auth.includes("DELETE FROM sessions WHERE user_id = ?"));
  assert.ok(auth.includes("crypto.randomBytes(32).toString('hex')"));
  assert.ok(auth.includes("resetTokenHash(rawToken)"));
});

test('authenticated POST requests require CSRF tokens', () => {
  const server = source('server.js');
  assert.ok(server.includes('ctx.session && !CSRF_EXEMPT_POST_PATHS.has(pathname)'));
  assert.ok(server.includes("submitted !== expected"));
});
