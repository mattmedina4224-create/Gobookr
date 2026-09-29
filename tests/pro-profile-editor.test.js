'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');

test('professional editor uses category-neutral workplace language', () => {
  assert.match(src, /Business \/ workplace name/);
  assert.doesNotMatch(src, /Barbershop \/ Salon name/);
});

test('professionals can edit existing services without deleting them', () => {
  assert.match(src, /router\.post\('\/dashboard\/pro\/services\/:id'/);
  assert.match(src, /UPDATE services SET name = \?, price = \?, duration_minutes = \? WHERE id = \? AND pro_id = \?/);
  assert.match(src, /Save service/);
  assert.match(src, /Service updated\./);
});

test('profile pricing explains relationship to service pricing', () => {
  assert.match(src, /quick profile summary/);
  assert.match(src, /individual service prices are managed below/);
});
