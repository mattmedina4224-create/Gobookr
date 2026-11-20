'use strict';
// Business profiles: validation, owner permissions, editing, uploads, services, gallery, free team invitations,
// public rendering (unclaimed / unpublished / published / preview), mobile markup and search SQL.
// Database tests run on PGlite (CI) or on a real Postgres when TEST_PG_URL is set.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
const storage = [];
const plain = (x) => JSON.parse(JSON.stringify(x)); // values from vm-loaded modules live in another realm
function load(file, deps = {}, env = {}) {
  const filename = path.join(__dirname, '..', file), module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, URL, URLSearchParams, AbortSignal, console, Date, JSON, Math,
    process: { env: { SUPABASE_URL: 'https://storage.example.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', ...env } },
    fetch: async (url, opts) => { storage.push({ url, method: opts.method, type: opts.headers['content-type'] }); return { ok: true, status: 200, json: async () => ({}) }; },
    require: (n) => (Object.hasOwn(deps, n) ? deps[n] : local(n)),
  });
  return module.exports;
}

const ROLES = "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;";
const SCHEMA = `${ROLES}
CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT, role TEXT, name TEXT);
CREATE TABLE shops (id BIGINT PRIMARY KEY, owner_user_id BIGINT, name TEXT, description TEXT DEFAULT '', city TEXT, state TEXT, street_address TEXT DEFAULT '', suite TEXT DEFAULT '',
  zip_code TEXT DEFAULT '', phone TEXT DEFAULT '', website_url TEXT DEFAULT '', booking_url TEXT DEFAULT '', logo_url TEXT DEFAULT '', cover_url TEXT DEFAULT '', claim_status TEXT,
  source_name TEXT, source_checked_at TIMESTAMPTZ, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, operational_status TEXT DEFAULT 'verified', updated_at TIMESTAMPTZ);
CREATE TABLE shop_categories (shop_id BIGINT, category TEXT, source TEXT, PRIMARY KEY (shop_id, category));
CREATE TABLE pro_profiles (id BIGINT PRIMARY KEY, user_id BIGINT, business_name TEXT, professional_handle TEXT, category TEXT, profile_photo_url TEXT, booking_url TEXT,
  license_verified INTEGER DEFAULT 0, initials TEXT, city TEXT, state TEXT, workplace_name TEXT, street_address TEXT, claim_status TEXT);
CREATE TABLE subscriptions (pro_id BIGINT PRIMARY KEY, status TEXT);
INSERT INTO users VALUES (1, 'owner@example.com', 'customer', 'Owner'), (2, 'pro@example.com', 'pro', 'Pro'), (3, 'other@example.com', 'customer', 'Other'),
  (4, 'second@example.com', 'pro', 'Second'), (5, 'owner2@example.com', 'customer', 'Owner Two');
INSERT INTO shops (id, owner_user_id, name, city, state, street_address, zip_code, claim_status, latitude, longitude) VALUES
  (10, 1, 'Fixture Barbers', 'Denver', 'CO', '1 Main St', '80209', 'claimed', 39.7, -104.9),
  (20, 5, 'Other Salon', 'Austin', 'TX', '', '78701', 'claimed', NULL, NULL),
  (30, NULL, 'Listed Nails', 'Denver', 'CO', '', '80202', 'unclaimed', NULL, NULL),
  (40, 3, 'Pending Claim Spa', 'Denver', 'CO', '', '', 'pending', NULL, NULL);
INSERT INTO shop_categories VALUES (10, 'barber', 'registered_name'), (30, 'nail_technician', 'registered_name');
INSERT INTO pro_profiles (id, user_id, business_name, category, initials, city, state, workplace_name, claim_status, booking_url, license_verified) VALUES
  (12, 2, 'First Pro', 'barber', 'FP', 'Denver', 'CO', '', 'claimed', 'https://book.example/first', 1),
  (13, 4, 'Second Pro', 'stylist', 'SP', 'Denver', 'CO', '', 'claimed', '', 0),
  (14, NULL, 'Listing Tech', 'nail_technician', 'LT', 'Denver', 'CO', 'Listed Nails', 'unclaimed', '', 0);
INSERT INTO subscriptions VALUES (12, 'trialing'), (13, 'active');`;

// One database for the whole file (PGlite instances are heavy); each test resets the schema.
let shared = null;
test.after(async () => { if (shared) await shared.close(); });
function harness() {
  if (!shared) shared = database();
  const db = { ...shared, close: async () => {} };
  db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  db.exec(SCHEMA);
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20261120_business_profiles.sql'), 'utf8');
  db.exec(migration); db.exec(migration); // forward-safe: applying twice is a no-op
  const util = require('../lib/util');
  const P = load('lib/shop-profile.js', { '../db': db });
  const PV = load('lib/shop-profile-view.js', { './shop-profile': P });
  const DV = load('lib/shop-dashboard-view.js', { './shop-profile': P });
  const layout = { layout: (x) => `<title>${x.title}</title><meta robots="${x.robots || ''}">${x.flash?.message ? `<flash>${x.flash.message}</flash>` : ''}${x.structuredData ? `<ld>${JSON.stringify(x.structuredData)}</ld>` : ''}${x.body}` };
  const http = { send: (res, html, status = 200) => { res.status = status; res.body = html; }, redirect: (res, loc) => { res.status = 302; res.location = loc; }, flashFromQuery: () => null };
  const routes = {}, router = { get: (p, f) => (routes['GET ' + p] = f), post: (p, f) => (routes['POST ' + p] = f) };
  load('routes/shop-profile-routes.js', { '../db': db, '../lib/layout': layout, '../lib/http': http, '../lib/util': util, '../lib/shop-profile': P, '../lib/shop-dashboard-view': DV })(router);
  load('routes/shops.js', { '../db': db, '../lib/layout': layout, '../lib/http': http, '../lib/util': util, '../lib/shop-profile': P, '../lib/shop-profile-view': PV })(router);
  function find(method, url) {
    for (const key of Object.keys(routes)) {
      const [m, pattern] = key.split(' ');
      if (m !== method) continue;
      const names = []; const re = new RegExp('^' + pattern.split('/').map((s) => (s.startsWith(':') ? (names.push(s.slice(1)), '([^/]+)') : s)).join('/') + '$');
      const hit = re.exec(url); if (hit) return { fn: routes[key], params: Object.fromEntries(names.map((n, i) => [n, hit[i + 1]])) };
    }
    throw new Error('no route ' + method + ' ' + url);
  }
  async function request(method, url, userId, body = {}, headers = {}) {
    const [p, qs] = url.split('?');
    const { fn, params } = find(method, p);
    const user = userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId) : null;
    const res = { writeHead(status, h) { this.status = status; this.headers = h; }, end(b) { this.body = b; } };
    await fn({ req: { url, headers: { host: 'gobookr.test', ...headers } }, res, params, query: Object.fromEntries(new URLSearchParams(qs || '')), body, currentUser: user, session: { csrf_token: 't' } });
    return res;
  }
  return { db, P, PV, request };
}

// ---- pure validation ---------------------------------------------------------------------------------------------
test('owner input validation: hours, prices, links, emails, images', () => {
  const { P } = { P: load('lib/shop-profile.js', { '../db': {} }) };
  assert.deepEqual(plain(P.parseHours({ hours_mon_open: '09:00', hours_mon_close: '17:30', hours_sun_closed: '1' })), { mon: { open: '09:00', close: '17:30' }, sun: { closed: true } });
  assert.throws(() => P.parseHours({ hours_tue_open: '18:00', hours_tue_close: '09:00' }), /closing time must be after/);
  assert.equal(P.parsePrice(''), null, 'blank price is "not listed", never zero');
  assert.equal(P.parsePrice('$1,250.5'), 125050);
  assert.throws(() => P.parsePrice('12.345'));
  assert.equal(P.formatPrice({ price_cents: 6000, price_type: 'from' }), 'From $60');
  assert.equal(P.formatPrice({ price_cents: null }), '');
  assert.equal(P.safeUrl('javascript:alert(1)'), null);
  assert.equal(P.safeUrl('https://user:pw@evil.example/'), null);
  assert.equal(P.safeUrl('studio.example'), 'https://studio.example/');
  assert.equal(P.socialUrl('instagram', '@northline'), 'https://www.instagram.com/northline/');
  assert.equal(P.socialUrl('instagram', 'https://evil.example/northline'), null);
  assert.deepEqual(plain(P.parseEmails('a@x.com, A@x.com\nbad b@y.org').valid), ['a@x.com', 'b@y.org']);
  assert.throws(() => P.decodeImage(Buffer.from('<svg onload=alert(1)>'.repeat(20)).toString('base64')), /JPG, PNG or WebP/);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
  assert.equal(P.decodeImage(png.toString('base64')).contentType, 'image/png');
  assert.throws(() => P.decodeImage(Buffer.concat([png, Buffer.alloc(3.2 * 1024 * 1024)]).toString('base64')));
});

// ---- database-backed flows ----------------------------------------------------------------------------------------
test('only the owner of a claimed shop can open or change its dashboard', async () => {
  const h = harness();
  try {
    assert.equal((await h.request('GET', '/dashboard/shop', null)).status, 302, 'signed out → sign in');
    assert.equal((await h.request('GET', '/dashboard/shop', 3)).status, 403, 'pending claimant has no dashboard');
    assert.equal((await h.request('GET', '/dashboard/shop?shop=10', 5)).status, 403, 'another owner is refused, not redirected to their own shop');
    const ok = await h.request('GET', '/dashboard/shop?shop=10', 1);
    assert.equal(ok.status, 200); assert.match(ok.body, /Profile strength/); assert.match(ok.body, /no subscription for businesses/);
    assert.equal((await h.request('POST', '/dashboard/shop/profile', 5, { shop: '10', section: 'about', description: 'hijack' })).status, 403);
    assert.equal((await h.request('POST', '/dashboard/shop/services', 3, { shop: '40', name: 'Facial' })).status, 403);
    const media = await h.request('POST', '/dashboard/shop/media', 5, { shop: '10', purpose: 'logo', image_data: 'x' });
    assert.equal(media.status, 403); assert.match(media.body, /do not manage/);
    assert.equal(h.db.prepare("SELECT description FROM shops WHERE id = 10").get().description, '');
    assert.equal(h.db.prepare('SELECT count(*)::int AS n FROM shop_services').get().n, 0);
  } finally { await h.db.close(); }
});

test('profile editing saves, validates and keeps what the owner typed', async () => {
  const h = harness();
  try {
    const base = { shop: '10', section: 'setup1', name: 'Fixture Barbers', tagline: 'Sharp cuts', category_barber: '1', category_stylist: '1', street_address: '1 Main St', city: 'denver', state: 'co', zip_code: '80209', phone: '303-555-0100', website_url: 'fixture.example', booking_url: '', hours_mon_open: '09:00', hours_mon_close: '17:00' };
    const bad = await h.request('POST', '/dashboard/shop/profile', 1, { ...base, zip_code: '802' });
    assert.equal(bad.status, 422); assert.match(bad.body, /5-digit ZIP/); assert.match(bad.body, /value="Sharp cuts"/);
    const good = await h.request('POST', '/dashboard/shop/profile', 1, base);
    assert.equal(good.status, 302); assert.match(good.location, /step=2/);
    const shop = h.db.prepare('SELECT * FROM shops WHERE id = 10').get();
    assert.equal(shop.city, 'Denver'); assert.equal(shop.state, 'CO'); assert.equal(shop.website_url, 'https://fixture.example/');
    assert.deepEqual(shop.hours, { mon: { open: '09:00', close: '17:00' } });
    assert.deepEqual(h.db.prepare('SELECT category FROM shop_categories WHERE shop_id = 10 ORDER BY category').all().map((r) => r.category), ['barber', 'stylist']);
    await h.request('POST', '/dashboard/shop/profile', 1, { shop: '10', section: 'profile', name: 'Fixture Barbers', category_barber: '1', description: 'About us', specialties: 'Fades, Fades, Shaves', amenity_0: '1' });
    assert.deepEqual(h.db.prepare('SELECT category FROM shop_categories WHERE shop_id = 10').all().map((r) => r.category), ['barber'], 'unchecked categories are removed');
    const s2 = h.db.prepare('SELECT specialties, amenities FROM shops WHERE id = 10').get();
    assert.deepEqual(s2.specialties, ['Fades', 'Shaves']); assert.deepEqual(s2.amenities, ['Walk-ins welcome']);
    const noCats = await h.request('POST', '/dashboard/shop/profile', 1, { shop: '10', section: 'profile', name: 'Fixture Barbers' });
    assert.equal(noCats.status, 422); assert.match(noCats.body, /at least one service/);
  } finally { await h.db.close(); }
});

test('uploads: logo, cover and gallery photos are stored under the shop and bounded', async () => {
  const h = harness();
  try {
    storage.length = 0;
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400)]).toString('base64');
    const logo = await h.request('POST', '/dashboard/shop/media', 1, { shop: '10', purpose: 'logo', image_data: jpeg });
    assert.equal(logo.status, 200); assert.equal(JSON.parse(logo.body).ok, true);
    assert.match(h.db.prepare('SELECT logo_url FROM shops WHERE id = 10').get().logo_url, /^https:\/\/storage\.example\.test\/storage\/v1\/object\/public\/portfolio\/shops\/10\/logo-/);
    for (let i = 0; i < 3; i++) assert.equal((await h.request('POST', '/dashboard/shop/media', 1, { shop: '10', purpose: 'photo', image_data: jpeg, kind: i ? 'interior' : 'bogus', width: 1600, height: 1200 })).status, 200);
    const photos = h.db.prepare('SELECT * FROM shop_photos WHERE shop_id = 10 ORDER BY sort_order').all();
    assert.equal(photos.length, 3); assert.equal(photos[0].kind, 'other', 'unknown kinds fall back to other');
    assert.ok(storage.filter((s) => s.method === 'POST').every((s) => /\/portfolio\/shops\/10\//.test(s.url) && s.type === 'image/jpeg'));
    await h.request('POST', `/dashboard/shop/photos/${photos[2].id}/move?dir=up`, 1, { shop: '10' });
    assert.deepEqual(h.db.prepare('SELECT id FROM shop_photos WHERE shop_id = 10 ORDER BY sort_order').all().map((r) => Number(r.id)), [photos[0].id, photos[2].id, photos[1].id].map(Number));
    await h.request('POST', `/dashboard/shop/photos/${photos[0].id}/delete`, 5, { shop: '20' });
    assert.equal(h.db.prepare('SELECT count(*)::int AS n FROM shop_photos WHERE shop_id = 10').get().n, 3, "another owner cannot delete this shop's photo");
    await h.request('POST', `/dashboard/shop/photos/${photos[0].id}/delete`, 1, { shop: '10' });
    assert.equal(h.db.prepare('SELECT count(*)::int AS n FROM shop_photos WHERE shop_id = 10').get().n, 2);
    const svg = await h.request('POST', '/dashboard/shop/media', 1, { shop: '10', purpose: 'photo', image_data: Buffer.from('<svg/>'.repeat(40)).toString('base64') });
    assert.equal(svg.status, 422);
  } finally { await h.db.close(); }
});

test('services: owner-entered prices only, edit, reorder and delete', async () => {
  const h = harness();
  try {
    await h.request('POST', '/dashboard/shop/services', 1, { shop: '10', name: 'Haircut', category: 'barber', price: '45', duration: '45' });
    await h.request('POST', '/dashboard/shop/services', 1, { shop: '10', name: 'Consultation', category: 'barber', price: '', duration: '' });
    const bad = await h.request('POST', '/dashboard/shop/services', 1, { shop: '10', name: 'Bad', price: 'free' });
    assert.match(decodeURIComponent(bad.location), /Enter a price/);
    const rows = h.db.prepare('SELECT * FROM shop_services WHERE shop_id = 10 ORDER BY sort_order').all();
    assert.deepEqual(rows.map((r) => [r.name, r.price_cents == null ? null : Number(r.price_cents)]), [['Haircut', 4500], ['Consultation', null]]);
    await h.request('POST', `/dashboard/shop/services/${rows[0].id}`, 1, { shop: '10', name: 'Signature haircut', category: 'barber', price: '50', price_type: 'from', duration: '60' });
    await h.request('POST', `/dashboard/shop/services/${rows[1].id}/move?dir=up`, 1, { shop: '10' });
    const after = h.db.prepare('SELECT name, price_cents, price_type FROM shop_services WHERE shop_id = 10 ORDER BY sort_order').all();
    assert.deepEqual(after.map((r) => r.name), ['Consultation', 'Signature haircut']);
    assert.equal(after[1].price_type, 'from');
    await h.request('POST', `/dashboard/shop/services/${rows[1].id}/delete`, 1, { shop: '10' });
    assert.equal(h.db.prepare('SELECT count(*)::int AS n FROM shop_services').get().n, 1);
  } finally { await h.db.close(); }
});

test('team invitations are free, secure, single-use and never touch billing', async () => {
  const h = harness();
  try {
    const before = h.db.prepare('SELECT * FROM subscriptions ORDER BY pro_id').all();
    const res = await h.request('POST', '/dashboard/shop/invites', 1, { shop: '10', emails: 'pro@example.com, second@example.com nope' });
    assert.equal(res.status, 200); assert.match(res.body, /Not valid: nope/);
    const links = [...res.body.matchAll(/value="(https:\/\/gobookr\.test\/team\/invite\/[^"]+)"/g)].map((m) => m[1]);
    assert.equal(links.length, 2);
    const tokenFor = (email) => links[[...res.body.matchAll(/<span>([^<]+)<\/span><input readonly/g)].map((m) => m[1]).indexOf(email)].split('/').pop();
    const stored = h.db.prepare('SELECT token_hash FROM shop_team_members WHERE shop_id = 10').all();
    assert.ok(stored.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash)), 'only token hashes are stored');
    const dup = await h.request('POST', '/dashboard/shop/invites', 1, { shop: '10', emails: 'PRO@example.com' });
    assert.match(dup.body, /already invited/);
    const wrong = await h.request('POST', `/team/invite/${tokenFor('pro@example.com')}/accept`, 4, {});
    assert.equal(wrong.status, 422); assert.match(wrong.body, /sent to pro@example\.com/);
    const accepted = await h.request('POST', `/team/invite/${tokenFor('pro@example.com')}/accept`, 2, {});
    assert.equal(accepted.status, 302);
    assert.equal((await h.request('POST', `/team/invite/${tokenFor('pro@example.com')}/accept`, 2, {})).status, 422, 'links are single-use');
    h.db.prepare("UPDATE shop_team_members SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE email = 'second@example.com'").run();
    const expired = await h.request('POST', `/team/invite/${tokenFor('second@example.com')}/accept`, 4, {});
    assert.equal(expired.status, 422); assert.match(expired.body, /expired/);
    assert.deepEqual(h.db.prepare('SELECT * FROM subscriptions ORDER BY pro_id').all(), before, 'accepting an invitation changes no subscription');
    assert.match((await h.request('GET', '/dashboard/pro/businesses', 2)).body, /Fixture Barbers/);
    const pendingId = h.db.prepare("SELECT id FROM shop_team_members WHERE email = 'second@example.com'").get().id;
    assert.match(decodeURIComponent((await h.request('POST', `/dashboard/shop/invites/${pendingId}/resend`, 1, { shop: '10' })).location), /sent recently/);
    h.db.prepare("UPDATE shop_team_members SET last_sent_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id = ?").run(pendingId);
    const resent = await h.request('POST', `/dashboard/shop/invites/${pendingId}/resend`, 1, { shop: '10' });
    assert.equal(resent.status, 200); assert.match(resent.body, /previous link no longer works/);
    assert.match(decodeURIComponent((await h.request('POST', `/dashboard/shop/invites/${pendingId}/cancel`, 5, { shop: '20' })).location), /not found/, 'another owner cannot cancel it');
    assert.match((await h.request('POST', `/dashboard/shop/invites/${pendingId}/cancel`, 1, { shop: '10' })).location, /canceled/);
    const memberId = h.db.prepare("SELECT id FROM shop_team_members WHERE email = 'pro@example.com'").get().id;
    await h.request('POST', `/dashboard/pro/businesses/${memberId}/leave`, 4, {});
    assert.equal(h.db.prepare('SELECT status FROM shop_team_members WHERE id = ?').get(memberId).status, 'accepted', 'only the member can leave');
    await h.request('POST', `/dashboard/pro/businesses/${memberId}/leave`, 2, {});
    assert.equal(h.db.prepare('SELECT status FROM shop_team_members WHERE id = ?').get(memberId).status, 'left');
  } finally { await h.db.close(); }
});

test('public page: unclaimed, unpublished, preview and published rendering', async () => {
  const h = harness();
  try {
    const unclaimed = await h.request('GET', '/shop/30', null);
    assert.equal(unclaimed.status, 200);
    assert.match(unclaimed.body, /Claim this business/); assert.match(unclaimed.body, /Unclaimed listing/);
    assert.match(unclaimed.body, /Professionals who list this business/); assert.match(unclaimed.body, /has not confirmed them as staff/);
    assert.match(unclaimed.body, /sp-cover-fallback/, 'no photo → typographic cover, never a stock photo');

    await h.request('POST', '/dashboard/shop/services', 1, { shop: '10', name: 'Haircut', category: 'barber', price: '45' });
    await h.request('POST', '/dashboard/shop/profile', 1, { shop: '10', section: 'profile', name: 'Fixture Barbers', category_barber: '1', description: 'Our story.', specialties: 'Fades' });
    const res = await h.request('POST', '/dashboard/shop/invites', 1, { shop: '10', emails: 'pro@example.com' });
    await h.request('POST', `/team/invite/${res.body.match(/team\/invite\/([^"]+)"/)[1]}/accept`, 2, {});

    const base = await h.request('GET', '/shop/10', null);
    assert.doesNotMatch(base.body, /Haircut|Our story|Meet the team/, 'unpublished owner content stays private');
    assert.match(base.body, /setting up its GoBookr page/);
    assert.match((await h.request('GET', '/shop/10?preview=1', 3)).body, /setting up its GoBookr page/, 'preview is owner-only');
    const preview = await h.request('GET', '/shop/10?preview=1', 1);
    assert.match(preview.body, /<strong>Preview\.<\/strong>/); assert.match(preview.body, /robots="noindex,nofollow"/); assert.match(preview.body, /Haircut/);

    await h.request('POST', '/dashboard/shop/publish', 1, { shop: '10' });
    const live = await h.request('GET', '/shop/10', null);
    assert.match(live.body, /Haircut/); assert.match(live.body, /\$45/); assert.match(live.body, /Our story/);
    assert.match(live.body, /Meet the team/); assert.match(live.body, /First Pro/); assert.doesNotMatch(live.body, /Second Pro|Listing Tech/, 'only accepted members appear');
    assert.match(live.body, /href="https:\/\/book\.example\/first"/);
    assert.match(live.body, /class="sp-actionbar"/, 'mobile action bar');
    assert.match(live.body, /openstreetmap\.org\/export\/embed\.html/);
    const ld = JSON.parse(live.body.match(/<ld>(.*?)<\/ld>/)[1]);
    assert.equal(ld['@type'], 'BarberShop'); assert.equal(ld.address.postalCode, '80209'); assert.equal(ld.makesOffer[0].itemOffered.name, 'Haircut');
    assert.doesNotMatch(live.body, /\$20\/month|subscription/i);
    await h.request('POST', '/dashboard/shop/unpublish', 1, { shop: '10' });
    assert.doesNotMatch((await h.request('GET', '/shop/10', null)).body, /Haircut/);
  } finally { await h.db.close(); }
});

test('search and importer guards around claimed business pages', () => {
  const pub = fs.readFileSync(path.join(__dirname, '../routes/public.js'), 'utf8');
  assert.match(pub, /CASE WHEN profile_published_at IS NOT NULL THEN ' ' \|\| COALESCE\(tagline, ''\) \|\| ' ' \|\| COALESCE\(specialties::text, ''\)/, 'name search covers published taglines and specialties');
  assert.match(pub, /const published = shop\.claim_status === 'claimed' && Boolean\(shop\.profile_published_at\)/, 'cards show owner content only once published');
  const importer = fs.readFileSync(path.join(__dirname, '../scripts/import-state-shops.js'), 'utf8');
  assert.match(importer, /s\.owner_user_id IS NULL AND s\.claim_status = 'unclaimed'/, 'importer enrichment never touches claimed shops');
  assert.doesNotMatch(importer, /shop_photos|shop_services|shop_team_members|tagline|profile_published_at/, 'importers never write owner content');
});
