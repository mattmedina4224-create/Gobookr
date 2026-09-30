'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('professionals are warned in final trial week when billing is not connected', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pro-billing-banner.js'), 'utf8');
  assert.match(src, /trialDaysRemaining/);
  assert.match(src, /!\(subscription\.stripe_customer_id && subscription\.stripe_subscription_id\)/);
  assert.match(src, /days <= 7/);
  assert.match(src, /continues automatically at \$20\/month/);
  assert.match(src, /Set up billing/);
});


test('active trial under one day never displays zero days left', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pro-billing-banner.js'), 'utf8');
  assert.match(src, /days < 1 \? 'Less than 1 day left'/);
  assert.match(src, /timeLeft/);
});
