'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('search defaults to five miles and preserves every supported customer choice', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  const expression = source.match(/const radius = (.*?); const latText/)[1];
  const supported = [1,2,3,4,5,7,9,11,13,15,17,19];
  const resolve = (value) => vm.runInNewContext(expression, {
    ctx: { query: { radius: value } },
    parseRadius: (input) => supported.includes(Number(input)) ? Number(input) : null,
  });
  for (const value of [undefined, null, '', 'invalid', '99']) assert.equal(resolve(value), 5);
  for (const value of supported) assert.equal(resolve(String(value)), value);
});

test('distance and result type controls share the same height on desktop and mobile', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'discovery.css'), 'utf8');
  assert.match(css, /\.results-actions \.result-type-tabs \{[^}]*height:48px;/);
  assert.match(css, /\.distance-control select \{[^}]*height:48px; min-height:48px;/);
  assert.doesNotMatch(css, /\.distance-control select \{[^}]*min-height:40px;/);
});

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
  const searchHandler = source.slice(source.indexOf("router.get('/search'"), source.indexOf("router.get('/discover/:city/:category'"));
  assert.doesNotMatch(searchHandler, /JOIN pro_categories[\s\S]*SELECT \* FROM pro_profiles/);
});

test('category search does not duplicate cards for multi-specialty professionals', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /EXISTS \(SELECT 1 FROM pro_categories pc WHERE pc\.pro_id = pro_profiles\.id AND pc\.category = \?\)/);
  assert.match(source, /let results = hydratePros\(db\.prepare\(sql\)\.all\(\.\.\.args\)\)/);
});

test('home search offers the same supported radius sequence as results', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  const values = [...source.matchAll(/<option value="(\d+)"(?: selected)?>\d+ mile(?:s)?<\/option>/g)].map((match) => Number(match[1]));
  assert.deepEqual(values.slice(0, 12), [1,2,3,4,5,7,9,11,13,15,17,19]);
});

test('empty results broaden to the next supported radius without dropping filters', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /const broadenDistance = radius !== null && radius < 19 \? \[1,2,3,4,5,7,9,11,13,15,17,19\]\.find/);
  assert.match(source, /filterLink\(\{ radius: broadenDistance \}\)/);
  assert.match(source, /const merged = \{ type: resultType === 'all' \? '' : resultType, category, city, q, radius:/);
});

test('business and professional radius searches share the same geographic bounds', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(source, /businessSql \+= ' AND latitude BETWEEN \? AND \? AND longitude BETWEEN \? AND \?'/);
  assert.match(source, /filterBusinessesByRadius\(businesses, radiusLat, radiusLon, radius\)/);
});
