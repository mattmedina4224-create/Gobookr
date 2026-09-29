'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('billing does not claim auto-renewal before payment is connected', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'billing.js'), 'utf8');
  assert.match(src, /const renewalStatus = cancelPending \? 'Off' : \(hasStripeCustomer \? 'On' : 'Payment not set up'\)/);
  assert.match(src, /escapeHtml\(renewalStatus\)/);
  assert.doesNotMatch(src, /Auto-renewal<\/div><strong>\$\{cancelPending \? 'Off' : 'On'\}/);
});
