'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('zero years experience is valid for professional onboarding', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  assert.match(src, /Number\(profile\.years_experience\) >= 0/);
  assert.doesNotMatch(src, /profile\.years_experience > 0/);
  assert.match(src, /profile\.price_min > 0 \|\| profile\.price_max > 0/);
  assert.match(src, /const requiredSteps = \[basicsDone, detailsDone, servicesDone, photosDone, bookingDone\]/);
});


test('missing experience is not silently treated as zero experience', () => {
  assert.match(src, /profile\.years_experience !== null/);
  assert.match(src, /profile\.years_experience !== undefined/);
  assert.match(src, /String\(profile\.years_experience\)\.trim\(\) !== ''/);
});
