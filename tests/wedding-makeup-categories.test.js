'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('makeup and weddings are customer-searchable categories', () => {
  for (const file of ['routes/public.js', 'routes/home.js']) {
    const src = read(file);
    assert.match(src, /makeup_artist/);
    assert.match(src, /Makeup Artists/);
    assert.match(src, /wedding_services/);
    assert.match(src, /Weddings/);
  }
});

test('new professionals can select makeup and weddings alongside their main profession', () => {
  const src = read('routes/auth.js');
  assert.match(src, /value: 'makeup_artist', label: 'Makeup Artist'/);
  assert.match(src, /value: 'wedding_services', label: 'Weddings'/);
  assert.match(src, /Hairstylist \+ Makeup Artist \+ Weddings/);
  assert.match(src, /for \(const category of categories\) addCategory\.run\(proId, category\)/);
});

test('existing professionals can manage multiple searchable specialties', () => {
  const src = read('routes/pro.js');
  assert.match(src, /router\.post\('\/dashboard\/pro\/categories'/);
  assert.match(src, /Hairstylist \+ Makeup Artist \+ Weddings/);
  assert.match(src, /DELETE FROM pro_categories WHERE pro_id = \?/);
  assert.match(src, /for \(const category of selected\) addCategory\.run\(profile\.id, category\)/);
  assert.match(src, /Select at least one service or specialty/);
  assert.match(src, /BEGIN IMMEDIATE/);
  assert.match(src, /ROLLBACK/);
});

test('inventory tooling recognizes the new marketplace categories', () => {
  for (const file of ['scripts/import-unclaimed-profiles.js', 'scripts/audit-imported-profiles.js']) {
    const src = read(file);
    assert.match(src, /makeup_artist/);
    assert.match(src, /wedding_services/);
  }
});


test('public profile badges use friendly specialty labels', () => {
  const src = read('lib/util.js');
  assert.match(src, /makeup_artist: 'Makeup Artist'/);
  assert.match(src, /wedding_services: 'Weddings'/);
});
