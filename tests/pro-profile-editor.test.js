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


test('service editor explains customer value and has a useful empty state', () => {
  assert.match(src, /customers use your services, prices, and timing to decide whether to book/);
  assert.match(src, /Add your first service/);
  assert.match(src, /clear service name, price, and duration/);
});


test('service creation defaults only a truly blank duration and delete reports ownership misses', () => {
  assert.match(src, /durationRaw = String\(ctx\.body\.duration_minutes == null \? '' : ctx\.body\.duration_minutes\)\.trim\(\)/);
  assert.match(src, /finiteInteger\(durationRaw \|\| '30', 5, 1440\)/);
  assert.match(src, /DELETE FROM services WHERE id = \? AND pro_id = \?/);
  assert.match(src, /changed \? 'success=' \+ encodeURIComponent\('Service removed\.'\) : 'error=' \+ encodeURIComponent\('Service not found\.'\)/);
});


test('portfolio upload UI is honest about one photo and keeps payloads serverless-friendly', () => {
  const layout = fs.readFileSync(path.join(__dirname, '..', 'lib', 'layout.js'), 'utf8');
  assert.match(layout, /button\.textContent = 'Add Photo'/);
  assert.doesNotMatch(layout, /button\.textContent = 'Add Photos'/);
  assert.match(layout, /file\.size > 3 \* 1024 \* 1024/);
  assert.match(src, /supported up to 3 MB/);
  assert.match(src, /image\.data\.length > 3 \* 1024 \* 1024/);
});
