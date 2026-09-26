'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const root = path.join(__dirname, '..');
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, Buffer, URL, URLSearchParams, process: { env: {} },
    console: { log() {}, error() {} }, __dirname: path.dirname(path.join(root, file)),
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('node:')) return require(id);
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  return module.exports;
}
function app() {
  const saved = new Set(); const queries = []; let fail = false;
  const profile = { id: 42, business_name: 'Example <Salon>', city: 'Denver', state: 'CO' };
  const db = { prepare(sql) {
    queries.push(sql);
    return {
      get(id) {
        if (sql.includes('COUNT(*)')) return { total: [...saved].filter(k => k.endsWith(':' + id)).length };
        return id === 42 ? profile : null;
      },
      all(customer) {
        if (sql.includes('p.*')) return saved.has(customer + ':42') ? [profile] : [];
        return saved.has(customer + ':42') ? [{ pro_id: '42' }] : [];
      },
      run(customer, pro) {
        if (fail) throw new Error('database unavailable');
        const key = customer + ':' + pro;
        if (sql.startsWith('INSERT')) saved.add(key); else saved.delete(key);
      },
    };
  } };
  const util = require('../lib/util'); const http = require('../lib/http');
  const favorites = load('lib/favorites.js', { '../db': db, './util': util });
  const customerRoute = load('routes/customer.js', {
    '../db': db, '../lib/layout': { layout: ({ body }) => body }, '../lib/http': http,
    '../lib/util': util, '../lib/favorites': favorites,
    '../lib/pro-listing-data': { hydratePros: p => p },
    '../lib/subscription': { isProPubliclyVisible: id => id === 42 },
  });
  const dependencies = {
    './lib/router': load('lib/router.js', { '../routes/home': () => {} }),
    './lib/layout': {}, './lib/auth': { getSessionUser(req) {
      const role = req.headers.cookie;
      if (!role) return null;
      return { user: { id: role === 'other' ? 2 : 1, role: role === 'other' ? 'customer' : role }, session: { csrf_token: 'valid' } };
    } },
    './lib/pro-billing-banner': { installBillingBanner() {} }, './lib/square-dashboard-card': { installSquareDashboardCard() {} },
    './lib/rate-limit': { checkAuthRateLimit: () => ({ allowed: true }) },
  };
  for (const name of ['public','auth','become-pro','google','pro','admin','legal','claim','embedded-billing','billing','square','shops','shop-dashboard','shop-billing','business-account']) dependencies['./routes/' + name] = () => {};
  dependencies['./routes/customer'] = customerRoute;
  let handle;
  dependencies['node:http'] = { createServer(fn) { handle = fn; return { listen() {} }; } };
  load('server.js', dependencies);
  return { saved, favorites, queries, fail() { fail = true; }, async request(method, url, body = {}, role = 'customer') {
    const req = Readable.from(method === 'POST' ? [Buffer.from(new URLSearchParams(body).toString())] : []);
    Object.assign(req, { method, url, headers: { host: 'localhost', 'content-type': 'application/x-www-form-urlencoded', cookie: role } });
    const res = { status: 200, headers: {}, body: '', writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body = '') { this.body = body; } };
    await handle(req, res); return res;
  } };
}

test('real HTTP middleware rejects CSRF, anonymous and non-customer mutations', async () => {
  const a = app();
  for (const _csrf of ['', 'wrong']) assert.equal((await a.request('POST', '/favorites/42', { saved: '1', _csrf })).status, 403);
  for (const role of ['pro', 'admin']) assert.equal((await a.request('POST', '/favorites/42', { saved: '1', _csrf: 'valid' }, role)).status, 403);
  assert.equal((await a.request('POST', '/favorites/42', { saved: '1' }, '')).headers.Location, '/login?next=%2Fdashboard%2Fcustomer');
  assert.equal(a.saved.size, 0);
});
test('save/remove are idempotent, isolate customers, and update current aggregate', async () => {
  const a = app(); const body = { _csrf: 'valid', saved: '1', customer_id: '999', return_to: '/search?city=Denver' };
  for (let i = 0; i < 2; i++) assert.equal((await a.request('POST', '/favorites/42', body)).headers.Location, '/search?city=Denver');
  assert.deepEqual([...a.saved], ['1:42']); assert.equal(a.favorites.currentSaves(42), 1);
  assert.match((await a.request('GET', '/dashboard/customer')).body, /Example &lt;Salon&gt;/);
  assert.match((await a.request('GET', '/dashboard/customer', {}, 'other')).body, /No favorites yet/);
  await a.request('POST', '/favorites/42', body, 'other'); assert.equal(a.favorites.currentSaves(42), 2);
  for (let i = 0; i < 2; i++) await a.request('POST', '/favorites/42', { ...body, saved: '0' });
  assert.deepEqual([...a.saved], ['2:42']); assert.equal(a.favorites.currentSaves(42), 1);
  assert.match((await a.request('GET', '/dashboard/customer')).body, /No favorites yet/);
});
test('invalid targets, open redirects and persistence errors fail safely', async () => {
  const a = app(); const body = { saved: '1', _csrf: 'valid' };
  for (const id of ['0','-1','nope','9007199254740992']) assert.equal((await a.request('POST', '/favorites/' + id, body)).status, 400);
  assert.equal((await a.request('POST', '/favorites/43', body)).status, 404);
  assert.equal((await a.request('POST', '/favorites/42', { ...body, saved: 'toggle' })).status, 400);
  for (const return_to of ['//evil.test', 'https://evil.test', '/\\evil.test', '/billing', '/search\r\nInjected: yes']) {
    assert.equal((await a.request('POST', '/favorites/42', { ...body, return_to })).headers.Location, '/pro/42');
  }
  a.fail(); assert.match((await a.request('POST', '/favorites/42', body)).headers.Location, /error=Could%20not%20update/);
});
test('heart is accessible and escaped; listing state is loaded in one query; counts disclose no identities', () => {
  const a = app(); const ctx = { currentUser: { id: 1, role: 'customer' }, session: { csrf_token: 'valid' } };
  const html = a.favorites.favoriteControl({ id: 42, business_name: '<script>' }, ctx, true);
  assert.match(html, /aria-pressed="true"/); assert.match(html, /&lt;script&gt;/); assert.match(html, /name="_csrf"/);
  const before = a.queries.length; a.favorites.favoriteIds(ctx, [{ id: 42 }, { id: 43 }]); assert.equal(a.queries.length - before, 1);
  a.favorites.currentSaves(42); assert.match(a.queries.at(-1), /COUNT\(\*\)/); assert.doesNotMatch(a.queries.at(-1), /users|customer_id/);
});

const runtime = process.env.GOBOOKR_PGLITE_MODULE;
test('Postgres migration enforces uniqueness, cascading deletion, revoked grants and deny-by-default RLS', { skip: !runtime }, async () => {
  const { PGlite } = require(runtime); const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      CREATE TABLE users (id BIGINT PRIMARY KEY); CREATE TABLE pro_profiles (id BIGINT PRIMARY KEY);
      INSERT INTO users VALUES (1),(2); INSERT INTO pro_profiles VALUES (42),(43);`);
    const migration = fs.readdirSync(path.join(root, 'db/migrations')).find(f => f.endsWith('_customer_favorites.sql'));
    await db.exec(fs.readFileSync(path.join(root, 'db/migrations', migration), 'utf8'));
    await db.exec('INSERT INTO customer_favorites (customer_id, pro_id) VALUES (1,42),(2,42)');
    await assert.rejects(db.exec('INSERT INTO customer_favorites VALUES (1,42)'), /duplicate key/);
    await assert.rejects(db.exec('INSERT INTO customer_favorites VALUES (99,42)'), /foreign key/);
    assert.equal((await db.query('SELECT COUNT(*) FROM customer_favorites WHERE pro_id=42')).rows[0].count, 2);
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for (const sql of ['SELECT * FROM customer_favorites','INSERT INTO customer_favorites VALUES (1,43)','UPDATE customer_favorites SET pro_id=43','DELETE FROM customer_favorites']) await assert.rejects(db.exec(sql), /permission denied/);
      await db.exec('RESET ROLE');
    }
    // Even an accidental future grant cannot expose rows without a policy.
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON customer_favorites TO authenticated; SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM customer_favorites')).rows.length, 0);
    await assert.rejects(db.exec('INSERT INTO customer_favorites VALUES (1,43)'), /row-level security/);
    await db.exec('UPDATE customer_favorites SET pro_id=43; DELETE FROM customer_favorites; RESET ROLE');
    assert.equal((await db.query('SELECT * FROM customer_favorites')).rows.length, 2);
    await db.exec('DELETE FROM users WHERE id=1');
    assert.equal((await db.query('SELECT COUNT(*) FROM customer_favorites')).rows[0].count, 1);
    await db.exec('DELETE FROM pro_profiles WHERE id=42');
    assert.equal((await db.query('SELECT COUNT(*) FROM customer_favorites')).rows[0].count, 0);
  } finally { await db.close(); }
});
