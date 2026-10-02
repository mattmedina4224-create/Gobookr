'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { module, exports: module.exports, require: name => dependencies[name] || require(name), console, process, Buffer, Date, URLSearchParams, AbortController, setTimeout, clearTimeout, ...globals });
  return module.exports;
}
function stripeHarness(priceAmount = 2000) {
  const calls = [];
  const stripe = load('lib/stripe.js', {}, {
    process: { env: { STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_PRICE_ID: 'price_old', APP_URL: 'https://example.test' } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const price = { id: 'price_twenty', active: true, currency: 'usd', unit_amount: priceAmount, type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
      return { ok: true, json: async () => url.includes('/prices?') ? { data: [price] } : url.includes('/prices/') ? price : { url: 'https://checkout.stripe.com/mock' } };
    },
  });
  return { stripe, calls };
}
test('checkout preserves the exact trial deadline and uses the $20 monthly price', async () => {
  const { stripe, calls } = stripeHarness();
  const end = Math.floor(Date.now() / 1000) + 10 * 86400 + 123;
  await stripe.createCheckoutSession({ proId: 8, email: 'real@example.com', trialEndsAt: new Date(end * 1000).toISOString() });
  const params = calls.at(-1).options.body;
  assert.equal(params.get('subscription_data[trial_end]'), String(end));
  assert.equal(params.get('line_items[0][price]'), 'price_twenty');
  assert.equal(params.has('subscription_data[trial_period_days]'), false);
});
test('wrong pricing, complimentary businesses, demo accounts, and final trial hours cannot create paid checkout', async () => {
  const wrong = stripeHarness(1500);
  await assert.rejects(wrong.stripe.createCheckoutSession({ proId: 8, email: 'real@example.com' }), /\$20/);
  assert.equal(wrong.calls.some(c => c.url.includes('/checkout/')), false);
  const { stripe, calls } = stripeHarness();
  await assert.rejects(stripe.createCheckoutSession({ shopId: 2 }), /complimentary/);
  await assert.rejects(stripe.createCheckoutSession({ proId: 8, email: 'demo@gobookr.test' }), /Demo/);
  await assert.rejects(stripe.createCheckoutSession({ proId: 8, email: 'real@example.com', trialEndsAt: new Date(Date.now() + 3600000).toISOString() }), /trial is still free/);
  assert.equal(calls.some(c => c.url.includes('/checkout/')), false);
});
function webhookHarness(subscription) {
  const routes = {}, writes = [];
  const db = { prepare: sql => ({ get: () => sql.includes('shop_subscriptions') ? null : { id: 1, pro_id: 8 }, run: (...values) => writes.push({ sql, values }) }) };
  load('routes/billing.js', { '../db': db, '../lib/layout': {}, '../lib/http': {}, '../lib/util': {}, '../lib/subscription': {}, '../lib/stripe': { webhookConfigured: () => true, verifyWebhookSignature: () => true, retrieveSubscription: async () => subscription, normalizedSubscriptionStatus: x => x, unixToSqlite: x => x ? new Date(x * 1000).toISOString() : null } })({ get: (p,f) => routes[p] = f, post: (p,f) => routes[p] = f });
  return { writes, invoke: async event => { let status; await routes['/stripe/webhook']({ req: { headers: {} }, body: event, rawBody: 'mock', res: { writeHead: x => status = x, end: () => {} } }); return status; } };
}
for (const status of ['trialing', 'active', 'canceled', 'past_due']) {
  test(`invoice webhook retains canonical ${status} subscription state`, async () => {
    const end = Math.floor(Date.now() / 1000) + 86400;
    const h = webhookHarness({ id: 'sub_mock', customer: 'cus_mock', metadata: { pro_id: '8' }, status, trial_end: status === 'trialing' ? end : null, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_twenty' }, current_period_end: end }] } });
    assert.equal(await h.invoke({ type: 'invoice.paid', data: { object: { amount_paid: 0, parent: { subscription_details: { subscription: 'sub_mock' } } } } }), 200);
    assert.equal(h.writes[0].values[0], status);
    assert.equal(h.writes[0].values[4], new Date(end * 1000).toISOString());
    assert.equal(h.writes[0].values[6] !== null, status === 'past_due');
  });
}
test('complimentary business checkout never calls Stripe', async () => {
  const routes = {};
  let destination;
  load('routes/shop-billing.js', { '../db': { prepare: () => ({ get: () => ({ id: 2 }) }) }, '../lib/layout': {}, '../lib/util': {}, '../lib/http': { redirect: (_res,url) => destination = url }, '../lib/stripe': { createPortalSession: () => { throw new Error('Unexpected Stripe request'); } } })({ get: (p,f) => routes[p] = f, post: (p,f) => routes[p] = f });
  await routes['/dashboard/shop/billing/checkout']({ currentUser: { id: 3 }, res: {} });
  assert.match(decodeURIComponent(destination), /complimentary/);
});
