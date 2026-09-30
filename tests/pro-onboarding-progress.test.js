'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('professional onboarding progress measures only core launch steps', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  assert.match(source, /const requiredSteps = \[basicsDone, detailsDone, servicesDone, photosDone, bookingDone\]/);
  assert.match(source, /const requiredDone = requiredSteps\.every\(Boolean\)/);
  assert.match(source, /coreDoneCount \/ requiredSteps\.length/);
});

test('optional enhancements are explained separately from core setup', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  assert.match(source, /five core steps to get your profile ready for customers/);
  assert.match(source, /License, GPS, and social links are optional enhancements/);
});


test('portfolio completion requires a stored image, not a legacy placeholder row', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  assert.match(source, /portfolio_items WHERE pro_id = \? AND image_url IS NOT NULL AND image_url != ''/);
  assert.match(source, /const photoCount = Number/);
});


test('business basics require a valid state abbreviation and ZIP shape', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  assert.match(source, /\^\[A-Za-z\]\{2\}\$/);
  assert.match(source, /\\d\{5\}/);
});
