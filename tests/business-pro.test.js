'use strict';
// GoBookr Business Pro + Career Studio: entitlement rules, Stripe test-mode checkout, webhook sync, access revocation,
// ownership permissions, and the free/paid split. Database tests run on PGlite (CI) or Postgres when TEST_PG_URL is set.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');

function database() {
  const worker = process.env.TEST_PG_URL
    ? new Worker(path.join(__dirname, 'helpers/pg-url-worker.js'), { workerData: { url: process.env.TEST_PG_URL } })
    : new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function call(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4), { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    if (Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000) === 'timed-out') throw new Error('database timeout');
    const msg = receiveMessageOnPort(port1).message; port1.close();
    if (msg.error) { const err = new Error(msg.error); if (msg.code) err.code = msg.code; throw err; }
    return msg.value;
  }
  return { exec: (sql) => call('exec', sql), prepare: (sql) => ({ get: (...a) => call('get', sql, a), all: (...a) => call('all', sql, a), run: (...a) => call('run', sql, a) }), close: async () => { call('close', ''); await worker.terminate(); } };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const ENV = {};
function load(file, deps = {}) {
  const filename = path.join(__dirname, '..', file), module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, URL, URLSearchParams, AbortSignal, console, Date, JSON, Math, Number, String, Set, Map, Object, Array, Error, Promise,
    process: { env: ENV }, fetch: async () => { throw new Error('unexpected network call'); },
    require: (n) => (Object.hasOwn(deps, n) ? deps[n] : local(n)),
  });
  return module.exports;
}
function setEnv(values) { for (const k of Object.keys(ENV)) delete ENV[k]; Object.assign(ENV, { CAREER_STUDIO_ENABLED: '1', APP_URL: 'https://preview.gobookr.test' }, values); }

const SCHEMA = `DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT, role TEXT, name TEXT);
CREATE TABLE shops (id BIGINT PRIMARY KEY, owner_user_id BIGINT, name TEXT, city TEXT, state TEXT, claim_status TEXT, logo_url TEXT DEFAULT '');
CREATE TABLE pro_profiles (id BIGINT PRIMARY KEY, user_id BIGINT, business_name TEXT, workplace_name TEXT DEFAULT '', category TEXT, profile_photo_url TEXT, city TEXT, state TEXT, claim_status TEXT);
CREATE TABLE subscriptions (pro_id BIGINT PRIMARY KEY, status TEXT, stripe_subscription_id TEXT);
CREATE TABLE shop_subscriptions (shop_id BIGINT PRIMARY KEY, status TEXT);
INSERT INTO users VALUES (1, 'owner@example.com', 'customer', 'Owner'), (2, 'pro@example.com', 'pro', 'Pro'), (3, 'pro2@example.com', 'pro', 'Pro Two'), (5, 'other@example.com', 'customer', 'Other owner'), (6, 'new-owner@example.com', 'customer', 'New owner');
INSERT INTO shops (id, owner_user_id, name, city, state, claim_status) VALUES (10, 1, 'Fixture Barbers', 'Denver', 'CO', 'claimed'), (20, 5, 'Other Salon', 'Austin', 'TX', 'claimed'), (30, NULL, 'Unclaimed Nails', 'Denver', 'CO', 'unclaimed');
INSERT INTO pro_profiles (id, user_id, business_name, category, city, state, claim_status) VALUES (12, 2, 'First Pro', 'barber', 'Denver', 'CO', 'claimed'), (13, 3, 'Second Pro', 'stylist', 'Aurora', 'CO', 'claimed');
INSERT INTO subscriptions VALUES (12, 'active', 'sub_pro_12'), (13, 'trialing', NULL);
INSERT INTO shop_subscriptions VALUES (10, 'complimentary');`;

let shared = null;
test.after(async () => { if (shared) await shared.close(); });
function harness(env = { BUSINESS_PRO_STRIPE_SECRET_KEY: 'sk_test_bizpro' }) {
  setEnv(env);
  if (!shared) shared = database();
  const db = shared;
  db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  db.exec(SCHEMA);
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20261122_career_studio_business_pro.sql'), 'utf8');
  db.exec(migration); db.exec(migration);
  const BP = load('lib/business-pro.js', { '../db': db });
  const C = load('lib/career.js', { '../db': db, './business-pro': BP });
  const calls = [];
  const stripe = { subs: {}, sessions: {} };
  BP._setFetch(async (url, opts) => {
    const u = new URL(url), body = opts.body ? Object.fromEntries(new URLSearchParams(opts.body)) : {};
    calls.push({ path: u.pathname, method: opts.method, body, key: opts.headers['Idempotency-Key'], auth: opts.headers.Authorization });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname === '/v1/checkout/sessions' && opts.method === 'POST') { const id = 'cs_test_' + crypto.createHash('sha1').update(opts.headers['Idempotency-Key']).digest('hex').slice(0, 12); stripe.sessions[id] = { id, url: 'https://checkout.stripe.com/c/pay/' + id, metadata: { kind: 'business_pro', business_pro_shop_id: body['metadata[business_pro_shop_id]'], business_pro_owner_user_id: body['metadata[business_pro_owner_user_id]'] }, subscription: null }; return ok(stripe.sessions[id]); }
    if (u.pathname.startsWith('/v1/checkout/sessions/')) return ok(stripe.sessions[u.pathname.split('/').pop()]);
    if (u.pathname.startsWith('/v1/subscriptions/')) return ok(stripe.subs[u.pathname.split('/').pop()]);
    if (u.pathname === '/v1/billing_portal/sessions') return ok({ url: 'https://billing.stripe.com/p/session/test' });
    return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) };
  });
  // Simulate Stripe: create/modify a subscription for shop 10 and complete its checkout session.
  const period = (days) => Math.floor(Date.now() / 1000) + days * 86400;
  function subscribe(shopId = 10, ownerId = 1, patch = {}) {
    const id = patch.id || `sub_bp_${shopId}_${Object.keys(stripe.subs).length + 1}`;
    stripe.subs[id] = { id, object: 'subscription', status: 'active', livemode: false, customer: `cus_bp_${shopId}`, cancel_at_period_end: false, current_period_end: period(30), metadata: { kind: 'business_pro', business_pro_shop_id: String(shopId), business_pro_owner_user_id: String(ownerId) }, items: { data: [{ price: { unit_amount: 3900, currency: 'usd' } }] }, ...patch };
    const row = db.prepare('SELECT stripe_checkout_session_id FROM business_pro_subscriptions WHERE shop_id = ?').get(shopId);
    if (row && stripe.sessions[row.stripe_checkout_session_id]) stripe.sessions[row.stripe_checkout_session_id].subscription = id;
    return id;
  }
  const user = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const shop = (id) => db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
  return { db, BP, C, calls, stripe, subscribe, user, shop, period };
}
const RESUME = { headline: 'Barber with 6 years of fades', summary: 'Precise fades.', years_experience: '6', specialties: 'Fades, Beards', wt_employee: '1', exp_0_role: 'Barber', exp_0_workplace: 'Northside Cuts', exp_0_start: '2019-04', lic_0_name: 'Barber license', lic_0_state: 'co' };

// ---- pure rules ----------------------------------------------------------------------------------------------------
test('entitlement rules: active, canceling, grace, expired, canceled, unpaid, ownership, billing mode', () => {
  setEnv({ BUSINESS_PRO_STRIPE_SECRET_KEY: 'sk_test_x' });
  const BP = load('lib/business-pro.js', { '../db': {} });
  const shop = { id: 10, owner_user_id: 1, claim_status: 'claimed' };
  const now = Date.now(), future = new Date(now + 20 * 86400000).toISOString(), past = new Date(now - 10 * 86400000).toISOString();
  const sub = (p) => ({ owner_user_id: 1, livemode: false, current_period_end: future, cancel_at_period_end: false, ...p });
  const e = (s, sh = shop) => plain(BP.evaluate(s, sh));
  assert.equal(e(null).state, 'free'); assert.equal(e(null).entitled, false);
  assert.equal(e(sub({ status: 'active' })).entitled, true);
  assert.equal(e(sub({ status: 'trialing' })).entitled, true);
  assert.deepEqual([e(sub({ status: 'active', cancel_at_period_end: true })).entitled, e(sub({ status: 'active', cancel_at_period_end: true })).state], [true, 'canceling']);
  assert.equal(e(sub({ status: 'past_due', past_due_since: new Date(now - 86400000).toISOString() })).entitled, true, 'grace period');
  assert.equal(e(sub({ status: 'past_due', past_due_since: past })).entitled, false, 'grace expired');
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) assert.equal(e(sub({ status: s })).entitled, false, s);
  assert.equal(e(sub({ status: 'active', current_period_end: past })).state, 'stale', 'missed renewal never stays unlocked');
  assert.equal(e(sub({ status: 'active', owner_user_id: 99 })).state, 'owner_changed');
  assert.equal(e(sub({ status: 'active' }), { ...shop, claim_status: 'pending' }).entitled, false);
  assert.equal(e(sub({ status: 'active', livemode: true })).state, 'mode_mismatch', 'a live subscription never unlocks a test deployment');
  setEnv({ STRIPE_SECRET_KEY: 'sk_live_real' });
  assert.equal(BP.billingMode(), 'blocked', 'live key without approval is blocked');
  setEnv({ STRIPE_SECRET_KEY: 'sk_live_real', BUSINESS_PRO_STRIPE_SECRET_KEY: 'sk_test_preview' });
  assert.equal(BP.billingMode(), 'test', 'a dedicated Business Pro test key overrides the shared live key');
  setEnv({}); assert.equal(BP.billingMode(), 'off');
  setEnv({ BUSINESS_PRO_PRICE_CENTS: '4900' }); assert.equal(BP.priceLabel(), '$49');
  setEnv({ BUSINESS_PRO_PRICE_CENTS: 'abc' }); assert.equal(BP.priceLabel(), '$39', 'default test price');
});

test('legacy professional webhook ignores Business Pro objects; metadata never uses shop_id', () => {
  const billing = fs.readFileSync(path.join(__dirname, '../routes/billing.js'), 'utf8');
  assert.match(billing, /isBusinessProObject\(subscription\)/);
  assert.match(billing, /isBusinessProObject\(object\)/);
  const bp = fs.readFileSync(path.join(__dirname, '../lib/business-pro.js'), 'utf8');
  assert.doesNotMatch(bp, /[^_]shop_id: String/, 'legacy webhook matches metadata.shop_id, so Business Pro must not set it');
});

// ---- billing flows -------------------------------------------------------------------------------------------------
test('checkout: owner only, test mode, separate metadata, idempotent, live blocked', async () => {
  const h = harness();
  await assert.rejects(h.BP.startCheckout({ shop: h.shop(10), user: h.user(5) }), /Only the owner/);
  const s1 = await h.BP.startCheckout({ shop: h.shop(10), user: h.user(1) });
  const s2 = await h.BP.startCheckout({ shop: h.shop(10), user: h.user(1) });
  assert.equal(s1.id, s2.id, 'same idempotency key within the window');
  const c = h.calls[0];
  assert.equal(c.auth, 'Bearer sk_test_bizpro');
  assert.equal(c.body.mode, 'subscription');
  assert.equal(c.body['line_items[0][price_data][unit_amount]'], '3900');
  assert.equal(c.body['line_items[0][price_data][recurring][interval]'], 'month');
  assert.equal(c.body['metadata[kind]'], 'business_pro');
  assert.equal(c.body['subscription_data[metadata][business_pro_shop_id]'], '10');
  assert.equal(c.body['metadata[shop_id]'], undefined);
  assert.equal(c.body.customer_email, 'owner@example.com');
  assert.match(c.key, /^bizpro-checkout-10-1-3900-/);
  assert.equal(h.BP.entitlement(10).entitled, false, 'opening checkout grants nothing');
  setEnv({ STRIPE_SECRET_KEY: 'sk_live_real' });
  await assert.rejects(h.BP.startCheckout({ shop: h.shop(20), user: h.user(5) }), /Live Business Pro charges are turned off/);
  setEnv({});
  await assert.rejects(h.BP.startCheckout({ shop: h.shop(20), user: h.user(5) }), /not configured/);
});

test('upgrade, cancel at period end, payment failure, expiry and resubscribe', async () => {
  const h = harness();
  const session = await h.BP.startCheckout({ shop: h.shop(10), user: h.user(1) });
  const subId = h.subscribe();
  await h.BP.confirmCheckout(h.shop(10), session.id);
  let ent = plain(h.BP.entitlement(10));
  assert.equal(ent.entitled, true); assert.equal(ent.sub.price_cents, 3900);
  await assert.rejects(h.BP.startCheckout({ shop: h.shop(10), user: h.user(1) }), /already set up/);
  assert.match((await h.BP.portal(h.shop(10), h.user(1))).url, /billing\.stripe\.com/);
  // Cancel at period end: still on.
  h.stripe.subs[subId].cancel_at_period_end = true;
  await h.BP.handleEvent({ type: 'customer.subscription.updated', data: { object: h.stripe.subs[subId] } });
  ent = plain(h.BP.entitlement(10)); assert.deepEqual([ent.entitled, ent.state], [true, 'canceling']);
  // Payment fails: grace, then paused.
  Object.assign(h.stripe.subs[subId], { status: 'past_due', cancel_at_period_end: false });
  await h.BP.handleEvent({ type: 'invoice.payment_failed', data: { object: { subscription: subId, parent: { subscription_details: { subscription: subId, metadata: { kind: 'business_pro' } } } } } });
  assert.equal(plain(h.BP.entitlement(10)).state, 'past_due_grace');
  h.db.prepare("UPDATE business_pro_subscriptions SET past_due_since = CURRENT_TIMESTAMP - INTERVAL '5 days' WHERE shop_id = 10").run();
  assert.equal(plain(h.BP.entitlement(10)).state, 'past_due');
  // Repeated past_due syncs keep the original start of the grace period.
  await h.BP.handleEvent({ type: 'customer.subscription.updated', data: { object: h.stripe.subs[subId] } });
  assert.equal(plain(h.BP.entitlement(10)).entitled, false);
  // Unpaid, then deleted.
  h.stripe.subs[subId].status = 'canceled';
  await h.BP.handleEvent({ type: 'customer.subscription.deleted', data: { object: h.stripe.subs[subId] } });
  assert.equal(plain(h.BP.entitlement(10)).state, 'canceled');
  // Resubscribe with a new subscription; a late event for the old one cannot override it.
  const s2 = await h.BP.startCheckout({ shop: h.shop(10), user: h.user(1) });
  const newSub = h.subscribe(10, 1);
  await h.BP.confirmCheckout(h.shop(10), s2.id);
  assert.equal(plain(h.BP.entitlement(10)).entitled, true);
  await h.BP.handleEvent({ type: 'customer.subscription.deleted', data: { object: h.stripe.subs[subId] } });
  assert.equal(plain(h.BP.entitlement(10)).entitled, true, 'old canceled subscription does not revoke the new one');
  assert.equal(h.db.prepare('SELECT stripe_subscription_id FROM business_pro_subscriptions WHERE shop_id = 10').get().stripe_subscription_id, newSub);
  // Professional and legacy shop billing untouched.
  assert.deepEqual(plain(h.db.prepare('SELECT status, stripe_subscription_id FROM subscriptions ORDER BY pro_id').all()), [{ status: 'active', stripe_subscription_id: 'sub_pro_12' }, { status: 'trialing', stripe_subscription_id: null }]);
  assert.equal(h.db.prepare('SELECT status FROM shop_subscriptions WHERE shop_id = 10').get().status, 'complimentary');
});

test('webhook: signature, foreign objects ignored, events de-duplicated', async () => {
  const h = harness({ BUSINESS_PRO_STRIPE_SECRET_KEY: 'sk_test_bizpro', BUSINESS_PRO_WEBHOOK_SECRET: 'whsec_test' });
  const body = JSON.stringify({ id: 'evt_1' }), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
  assert.equal(h.BP.verifySignature(body, `t=${t},v1=${sig}`), true);
  assert.equal(h.BP.verifySignature(body, `t=${t},v1=${'0'.repeat(64)}`), false);
  assert.equal(h.BP.verifySignature(body, `t=${t - 1000},v1=${sig}`), false, 'replayed old event');
  assert.equal(plain(await h.BP.handleEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_pro_12', status: 'canceled', metadata: { pro_id: '12' } } } })).ignored, true, 'professional subscriptions are not ours');
  assert.equal(h.BP.applySubscription({ id: 'sub_x', status: 'active', metadata: { kind: 'business_pro', business_pro_shop_id: '20', business_pro_owner_user_id: '5' } }), null, 'no row without a checkout started by the owner');
  assert.equal(h.BP.claimEvent('evt_1'), true); assert.equal(h.BP.claimEvent('evt_1'), false);
});

// ---- Career Studio ----------------------------------------------------------------------------------------------
async function activate(h, shopId = 10, ownerId = 1) {
  const s = await h.BP.startCheckout({ shop: h.shop(shopId), user: h.user(ownerId) });
  const id = h.subscribe(shopId, ownerId); await h.BP.confirmCheckout(h.shop(shopId), s.id); return id;
}

test('professionals: free résumé; applying only to Business Pro businesses; one live application each', async () => {
  const h = harness();
  assert.throws(() => h.C.apply({ user: h.user(2), shopId: 10 }), /Create your free résumé/);
  assert.throws(() => h.C.parseResume({ headline: 'x' }), /headline/);
  h.C.saveResume(12, h.C.parseResume(RESUME));
  const r = plain(h.C.resumeFor(12));
  assert.deepEqual(r.specialties, ['Fades', 'Beards']);
  assert.deepEqual(r.licenses, [{ name: 'Barber license', state: 'CO', self_reported: true }]);
  assert.throws(() => h.C.apply({ user: h.user(2), shopId: 10 }), /isn't accepting applications/, 'free business cannot receive applications');
  assert.throws(() => h.C.apply({ user: h.user(1), shopId: 10 }), /claimed GoBookr profile/, 'customers cannot apply');
  await activate(h);
  const appId = h.C.apply({ user: h.user(2), shopId: 10, note: 'Free Tuesdays.' });
  assert.throws(() => h.C.apply({ user: h.user(2), shopId: 10 }), /already applied/);
  const snap = plain(h.db.prepare('SELECT resume_snapshot FROM job_applications WHERE id = ?').get(appId).resume_snapshot);
  assert.equal((typeof snap === 'string' ? JSON.parse(snap) : snap).headline, 'Barber with 6 years of fades');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM hiring_notifications WHERE user_id = 1').get().n, 1, 'owner notified');
  h.C.withdraw(h.user(2), appId);
  assert.ok(h.C.apply({ user: h.user(2), shopId: 10 }), 'can reapply after withdrawing');
});

test('owners: inbox, status, two-way messages, jobs; other owners and customers refused', async () => {
  const h = harness();
  h.C.saveResume(12, h.C.parseResume(RESUME));
  const draft = h.C.saveJob(h.user(1), 10, null, h.C.parseJob({ title: 'Barber, full time', work_type: 'commission', category: 'barber' }));
  assert.throws(() => h.C.setJobStatus(h.user(1), 10, draft, 'open'), /needs Business Pro/, 'free plan: drafts only');
  assert.throws(() => h.C.saveJob(h.user(5), 10, null, h.C.parseJob({ title: 'Hijack' })), /do not manage/);
  await activate(h);
  h.C.setJobStatus(h.user(1), 10, draft, 'open');
  assert.equal(plain(h.C.openJobs()).length, 1);
  const appId = h.C.apply({ user: h.user(2), shopId: 10, jobId: draft });
  const box = plain(h.C.inbox(h.user(1), 10));
  assert.equal(box.locked, false); assert.equal(box.items.length, 1); assert.equal(box.items[0].job_title, 'Barber, full time');
  assert.throws(() => h.C.inbox(h.user(5), 10), /do not manage/);
  assert.throws(() => h.C.applicationForOwner(h.user(5), 10, appId), /do not manage/);
  assert.throws(() => h.C.applicationForOwner(h.user(5), 20, appId), /hiring tools are paused|Application not found/, 'cannot read another shop\'s application through your own shop');
  h.C.setStatus(h.user(1), 10, appId, 'interview');
  h.C.sendMessage({ user: h.user(1), appId, body: 'Can you come Tuesday?', as: 'business', shopId: 10 });
  h.C.sendMessage({ user: h.user(2), appId, body: 'Yes, 10am works.', as: 'pro' });
  assert.throws(() => h.C.sendMessage({ user: h.user(3), appId, body: 'Not mine', as: 'pro' }), /not found/i);
  const proView = plain(h.C.applicationForPro(h.user(2), appId));
  assert.equal(proView.app.status, 'interview'); assert.equal(proView.messages.length, 2);
  assert.throws(() => h.C.applicationForPro(h.user(3), appId), /not found/i);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM hiring_notifications WHERE user_id = 2").get().n, 2, 'status + message notifications');
});

test('revocation: cancellation hides applicants, pauses tools, keeps data; ownership change revokes', async () => {
  const h = harness();
  h.C.saveResume(12, h.C.parseResume(RESUME));
  const subId = await activate(h);
  const job = h.C.saveJob(h.user(1), 10, null, h.C.parseJob({ title: 'Stylist' })); h.C.setJobStatus(h.user(1), 10, job, 'open');
  const appId = h.C.apply({ user: h.user(2), shopId: 10, jobId: job });
  h.stripe.subs[subId].status = 'canceled';
  await h.BP.handleEvent({ type: 'customer.subscription.deleted', data: { object: h.stripe.subs[subId] } });
  const box = plain(h.C.inbox(h.user(1), 10));
  assert.deepEqual([box.locked, box.savedCount, box.items.length], [true, 1, 0], 'count only — no names or résumés');
  assert.throws(() => h.C.applicationForOwner(h.user(1), 10, appId), /paused/);
  assert.throws(() => h.C.setStatus(h.user(1), 10, appId, 'hired'), /paused/);
  assert.throws(() => h.C.sendMessage({ user: h.user(1), appId, body: 'hi', as: 'business', shopId: 10 }), /needs Business Pro/);
  assert.throws(() => h.C.sendMessage({ user: h.user(2), appId, body: 'hi', as: 'pro' }), /isn’t receiving messages/);
  assert.equal(h.C.publicJob(job), null, 'opening hidden publicly');
  assert.equal(plain(h.C.openJobs()).length, 0);
  assert.equal(plain(h.C.applicationForPro(h.user(2), appId)).businessActive, false, 'the professional still sees their application');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM job_applications').get().n, 1, 'nothing deleted');
  // Resubscribe restores everything.
  await activate(h);
  assert.equal(plain(h.C.inbox(h.user(1), 10)).items.length, 1);
  assert.ok(h.C.publicJob(job));
  // Ownership transfer: the new owner does not inherit the previous owner's paid plan.
  h.db.prepare('UPDATE shops SET owner_user_id = 6 WHERE id = 10').run();
  assert.equal(plain(h.BP.entitlement(10)).state, 'owner_changed');
  assert.equal(plain(h.C.inbox(h.user(6), 10)).locked, true);
  assert.throws(() => h.C.inbox(h.user(1), 10), /do not manage/, 'the previous owner loses access entirely');
  await assert.rejects(h.BP.portal(h.shop(10), h.user(6)), /Only the owner who set up/);
});
