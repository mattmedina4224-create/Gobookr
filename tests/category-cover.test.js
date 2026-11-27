'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { categoryCover } = require('../lib/category-cover');

test('service covers match the listing category and are stable per listing', () => {
  assert.match(categoryCover(['barber'], 1).src, /barber/);
  assert.match(categoryCover(['nail_technician'], 7).src, /nails/);
  assert.match(categoryCover(['eyebrow_technician'], 3).src, /lashes/);
  assert.match(categoryCover(['tattoo_artist'], 3).src, /tattoo/);
  assert.match(categoryCover(['Gold Leaf Nail Studio'], 9).src, /nails/, 'business names fall back to keywords');
  assert.match(categoryCover([], 4).src, /hair/, 'unknown falls back to hair');
  assert.deepEqual(categoryCover(['barber'], 42), categoryCover(['barber'], 42));
});

test('cards without their own photo label the service photo', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const pub = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  const home = fs.readFileSync(path.join(__dirname, '..', 'routes', 'home.js'), 'utf8');
  assert.match(pub, /market-cover-tag/);
  assert.match(pub, /Example photo/);
  assert.match(home, /gb-cover-tag/);
});
