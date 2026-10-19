'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const authSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'auth.js'), 'utf8');

test('session cookies are backed by hashed database tokens', () => {
  assert.match(authSource, /function sessionTokenHash\(token\)/);
  assert.match(authSource, /\.run\(sessionTokenHash\(token\), userId, csrfToken, expires\)/);
  assert.match(authSource, /WHERE \(token = \? OR token = \?\)/);
});

test('session cookie keeps browser security attributes', () => {
  assert.match(authSource, /HttpOnly; SameSite=Lax/);
  assert.match(authSource, /NODE_ENV === 'production' \? '; Secure'/);
});

test('logout deletes both hashed and legacy session rows during rollout', () => {
  assert.match(authSource, /DELETE FROM sessions WHERE token = \? OR token = \?/);
});
