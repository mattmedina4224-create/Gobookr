'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('billing UI only calls membership connected after Stripe subscription is linked', () => {
  const src = read('routes/billing.js');
  assert.match(src, /billingConnected = hasStripeCustomer && hasStripeSubscription/);
  assert.match(src, /billingConnected \? 'Renews automatically monthly'/);
  assert.match(src, /subscription\.stripe_customer_id && subscription\.stripe_subscription_id/);
});

test('embedded billing uses the same confirmed-subscription guard', () => {
  const src = read('routes/embedded-billing.js');
  assert.match(src, /subscription\.stripe_customer_id && subscription\.stripe_subscription_id/);
});

test('checkout completion copy waits for webhook confirmation', () => {
  const src = read('lib/stripe.js');
  assert.match(src, /Billing status will update as soon as Stripe confirms your subscription/);
  assert.doesNotMatch(src, /Payment method saved\. Your membership billing is connected/);
});

test('checkout does not force Cash App or stale promotion-code parameters', () => {
  const src = read('lib/stripe.js');
  assert.match(src, /payment_method_types\[0\].*card/);
  assert.doesNotMatch(src, /cashapp/);
  assert.doesNotMatch(src, /allow_promotion_codes/);
});


test('Stripe status normalization preserves non-public paused and expired-setup states', () => {
  const src = read('lib/stripe.js');
  assert.match(src, /'incomplete_expired'/);
  assert.match(src, /'paused'/);
  const visibility = read('lib/subscription.js');
  assert.doesNotMatch(visibility, /subscription\.status === 'paused'\) return true/);
  assert.doesNotMatch(visibility, /subscription\.status === 'incomplete_expired'\) return true/);
});


test('trial warning and portal both wait for a confirmed Stripe subscription', () => {
  const banner = read('lib/pro-billing-banner.js');
  const billing = read('routes/billing.js');
  assert.match(banner, /!\(subscription\.stripe_customer_id && subscription\.stripe_subscription_id\)/);
  assert.match(billing, /!subscription\.stripe_customer_id \|\| !subscription\.stripe_subscription_id/);
  assert.match(billing, /No confirmed Stripe subscription is connected yet/);
});
