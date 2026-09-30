'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('professional overview frames analytics as customer and booking outcomes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(src, /bookingClickRate = views > 0/);
  assert.match(src, /Customer interest · last 30 days/);
  assert.match(src, /booking-click rate/);
  assert.match(src, /customers are finding and engaging with your business/);
  assert.match(src, /NEXT BEST ACTION/);
});


test('professional overview surfaces a measurable marketing pulse', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(src, /marketingPulse = \{ total_campaigns:/);
  assert.match(src, /source LIKE 'marketing-%'/);
  assert.match(src, /Marketing pulse/);
  assert.match(src, /Campaign views · 30 days/);
  assert.match(src, /Campaign booking clicks · 30 days/);
  assert.match(src, /Open Marketing Center/);
});
