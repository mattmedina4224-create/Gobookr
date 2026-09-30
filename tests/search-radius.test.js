'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('search results distance control uses supported radius values', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /\[1,2,3,4,5,7,9,11,13,15,17,19\]\.map\(\(m\)/);
  assert.doesNotMatch(source, /\[1,2,3,4,5,10,15,20\]\.map\(\(m\)/);
});

test('ordinary search does not require profile coordinates', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /if \(radiusBounds\) \{ sql \+= ' AND latitude BETWEEN \? AND \? AND longitude BETWEEN \? AND \?'\;/);
  assert.match(source, /const radiusResult = await filterByRadius\(results, radiusLat, radiusLon, radius\);/);
});


test('category search uses membership rows so one professional can match every selected specialty', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /if \(category\) \{ sql \+= ' AND EXISTS \(SELECT 1 FROM pro_categories pc WHERE pc\.pro_id = pro_profiles\.id AND pc\.category = \?\)'/);
  assert.doesNotMatch(source, /JOIN pro_categories[\s\S]*SELECT \* FROM pro_profiles/);
});

test('category search does not duplicate cards for multi-specialty professionals', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /EXISTS \(SELECT 1 FROM pro_categories pc WHERE pc\.pro_id = pro_profiles\.id AND pc\.category = \?\)/);
  assert.match(source, /let results = hydratePros\(db\.prepare\(sql\)\.all\(\.\.\.args\)\)/);
});
