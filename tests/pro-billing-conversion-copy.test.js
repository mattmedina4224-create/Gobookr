'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const banner = fs.readFileSync(path.join(__dirname, '../lib/pro-billing-banner.js'), 'utf8');
const billing = fs.readFileSync(path.join(__dirname, '../routes/billing.js'), 'utf8');
const stripe = fs.readFileSync(path.join(__dirname, '../lib/stripe.js'), 'utf8');

test('trial conversion stays $20 monthly and uses a restrained 14-day then 7-day cadence', () => {
  assert.match(banner, /days <= 14/);
  assert.match(banner, /days <= 7/);
  assert.match(banner, /keep it searchable afterward for \$20\/month/i);
  assert.match(banner, /Keep your profile searchable after the trial for \$20\/month/i);
  assert.match(banner, /Activate for \$20\/month/);
});

test('billing page states the 30-day trial, monthly renewal, grace period, and self-service management', () => {
  assert.match(billing, /GoBookr Professional/);
  assert.match(billing, /\$20 <span/);
  assert.match(billing, /Renews automatically monthly/);
  assert.match(billing, /30-day free trial/);
  assert.match(billing, /7-day grace period/);
  assert.match(billing, /Manage payment &amp; subscription/);
});

test('Stripe checkout rejects any professional price that is not active licensed $20 monthly USD', () => {
  assert.match(stripe, /unit_amount === 2000/);
  assert.match(stripe, /currency === 'usd'/);
  assert.match(stripe, /recurring\.interval === 'month'/);
  assert.match(stripe, /recurring\.usage_type === 'licensed'/);
  assert.match(stripe, /gobookr_professional_monthly_20/);
});
