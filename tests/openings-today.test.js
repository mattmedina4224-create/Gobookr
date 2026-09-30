'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('pros can publish only real opening campaigns with entered times', () => {
  const src = read('routes/pro.js');
  assert.match(src, /\/dashboard\/pro\/marketing\/campaigns\/:id\/publish-openings/);
  assert.match(src, /campaign_type IN \('openings-today','last-minute'\)/);
  assert.match(src, /Add at least one real open appointment time before publishing/);
  assert.match(src, /SET status = 'published'/);
});

test('customers have a same-day openings discovery page', () => {
  const src = read('routes/public.js');
  assert.match(src, /router\.get\('\/openings'/);
  assert.match(src, /mc\.status = 'published'/);
  assert.match(src, /mc\.created_at >= CURRENT_DATE/);
  assert.match(src, /source=openings-today/);
  assert.match(src, /confirm the time on the professional's booking page/);
});

test('Openings Today is linked globally and responsive', () => {
  const layout = read('lib/layout.js');
  const css = read('public/styles.css');
  assert.match(layout, /href="\/openings">Openings Today/);
  assert.match(css, /\.openings-grid/);
  assert.match(css, /@media\(max-width:760px\)\{\.openings-grid\{grid-template-columns:1fr\}/);
});


test('homepage gives same-day intent a direct path into openings', () => {
  const home = read('routes/home.js');
  const css = read('public/styles.css');
  assert.match(home, /Need something today\?/);
  assert.match(home, /See appointments professionals just opened up/);
  assert.match(home, /href="\/openings"/);
  assert.match(css, /\.home-openings-cta/);
});
