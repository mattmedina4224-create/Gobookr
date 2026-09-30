'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('billing accurately explains automatic monthly renewal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'billing.js'), 'utf8');
  assert.match(src, /billingConnected \? 'Renews automatically monthly' : 'Set up payment to continue after trial'/);
  assert.match(src, /cancelPending \? 'Cancels at period end'/);
  assert.match(src, /Membership renewal/);
  assert.match(src, /Your membership renews monthly after the 30-day free trial unless canceled/);
  assert.match(src, /escapeHtml\(renewalStatus\)/);
});
