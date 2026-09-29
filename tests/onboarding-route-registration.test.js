'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('professional onboarding has one registered source of truth', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const pro = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  const onboarding = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');

  assert.match(server, /require\('\.\/routes\/onboarding'\)\(router\)/);
  assert.doesNotMatch(pro, /router\.get\('\/dashboard\/pro\/onboarding'/);
  assert.match(onboarding, /router\.get\('\/dashboard\/pro\/onboarding'/);
  assert.match(onboarding, /router\.post\('\/dashboard\/pro\/onboarding\/finish'/);
});
