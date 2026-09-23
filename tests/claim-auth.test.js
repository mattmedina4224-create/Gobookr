'use strict';

// Exercise the real HTTP parsing/CSRF layer and route handlers with an isolated
// database double. No production database, Stripe calls, or network listener.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const root = path.join(__dirname, '..');

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, Buffer, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout, process: { env: {} },
    console: { log() {}, warn() {}, error() {} }, __dirname: path.dirname(path.join(root, file)),
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('node:')) return require(id);
      throw new Error(`Unexpected dependency ${id} in ${file}`);
    },
    ...globals,
  }, { filename: file });
  return module.exports;
}

function app(options = {}) {
  const state = {
    profiles: [{ id: 42, user_id: null, claim_status: 'unclaimed', business_name: 'Example <Salon>', city: 'Denver', state: 'CO' }],
    users: [], claims: [], subscriptions: [], categories: [], writes: [], sessions: new Map(),
  };
  const db = {
    exec(sql) { state.writes.push(sql); },
    prepare(sql) {
      return {
        get(...args) {
          if (sql.includes('FROM pro_profiles WHERE id = ?')) return state.profiles.find(p => p.id === args[0]);
          if (sql.includes('FROM profile_claims')) return state.claims.find(c => c.pro_id === args[0] && c.claimant_user_id === args[1] && c.status === 'pending');
          if (sql.includes('FROM users WHERE email = ?')) return state.users.find(u => u.email === args[0]);
          throw new Error(`Unexpected read: ${sql}`);
        },
        run(...args) {
          state.writes.push(sql);
          if (sql.startsWith('INSERT INTO users')) {
            if (options.failSignup) throw new Error('Simulated signup failure');
            const user = { id: state.users.length + 1, email: args[0], password_hash: args[1], role: args[2], name: args[3] };
            state.users.push(user);
            return { changes: 1, lastInsertRowid: user.id };
          }
          if (sql.startsWith('INSERT INTO pro_profiles')) {
            const profile = { id: 43, user_id: args[0], business_name: args[1] };
            state.profiles.push(profile);
            return { changes: 1, lastInsertRowid: profile.id };
          }
          if (sql.startsWith('INSERT OR IGNORE INTO pro_categories')) { state.categories.push(args); return { changes: 1 }; }
          if (sql.startsWith('INSERT OR IGNORE INTO subscriptions')) { state.subscriptions.push(args); return { changes: 1 }; }
          if (sql.startsWith('WITH eligible_profile')) {
            // Assert that the actual statement carries the ownership and dedupe
            // guards; this double is not a substitute for a Postgres SQL test.
            assert.match(sql, /WHERE id = \? AND user_id IS NULL AND claim_status IN \('unclaimed', 'claim_pending'\)/);
            assert.match(sql, /ON CONFLICT \(pro_id, claimant_user_id\) WHERE status = 'pending'/);
            if (options.beforeClaimWrite) options.beforeClaimWrite(state);
            const p = state.profiles.find(p => p.id === args[0] && p.user_id == null && ['unclaimed', 'claim_pending'].includes(p.claim_status));
            if (!p) return { changes: 0 };
            p.claim_status = 'claim_pending';
            if (!state.claims.some(c => c.pro_id === p.id && c.claimant_user_id === args[1] && c.status === 'pending')) {
              state.claims.push({ id: state.claims.length + 1, pro_id: p.id, claimant_user_id: args[1], status: 'pending' });
            }
            return { changes: 1 };
          }
          throw new Error(`Unexpected write: ${sql}`);
        },
      };
    },
  };
  const httpHelpers = require('../lib/http');
  const auth = load('lib/auth.js', { '../db': db });
  auth.createSession = userId => {
    const token = `test-session-${state.sessions.size + 1}`;
    state.sessions.set(token, { user: state.users.find(u => u.id === userId), session: { csrf_token: 'test-csrf' } });
    return token;
  };
  auth.getSessionUser = req => state.sessions.get(String(req.headers.cookie || '').split('=')[1]) || null;
  const common = { '../db': db, '../lib/http': httpHelpers, '../lib/util': require('../lib/util'), '../lib/layout': require('../lib/layout') };
  common['../lib/claims'] = load('lib/claims.js', { '../db': db, './http': httpHelpers });
  const authRoute = load('routes/auth.js', { ...common, '../lib/auth': auth, './onboarding': () => {} }, {
    fetch: async () => { if (options.claimOnly) throw new Error('Claim signup must not geocode'); return { ok: true, json: async () => [] }; },
  });
  const claimRoute = load('routes/claim.js', common);
  const dependencies = { './routes/auth': authRoute, './routes/claim': claimRoute, './lib/auth': auth, './lib/layout': common['../lib/layout'],
    './lib/pro-billing-banner': { installBillingBanner() {} }, './lib/rate-limit': { checkAuthRateLimit: () => ({ allowed: true }) } };
  for (const file of ['public', 'become-pro', 'google', 'pro', 'customer', 'admin', 'legal', 'embedded-billing', 'billing']) dependencies[`./routes/${file}`] = () => {};
  dependencies['./lib/router'] = load('lib/router.js', { '../routes/home': () => {} });
  let handle;
  dependencies['node:http'] = { createServer(fn) { handle = fn; return { listen() {} }; } };
  load('server.js', dependencies);
  return {
    state,
    async request(method, url, body = {}, token) {
      const req = Readable.from(method === 'POST' ? [Buffer.from(new URLSearchParams(body).toString())] : []);
      Object.assign(req, { method, url, headers: { host: 'localhost', 'content-type': 'application/x-www-form-urlencoded', cookie: token ? `gobookr_session=${token}` : '' } });
      const res = { status: 200, headers: {}, body: '', headersSent: false,
        writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); this.headersSent = true; },
        setHeader(key, value) { this.headers[key] = value; }, end(body = '') { this.body = body; } };
      await handle(req, res);
      return res;
    },
    addUser(role = 'customer') {
      const user = { id: state.users.length + 1, email: `existing${state.users.length}@example.test`, name: 'Existing user', role, password_hash: auth.hashPassword('password123') };
      state.users.push(user);
      return { user, token: auth.createSession(user.id) };
    },
  };
}
const signup = { name: 'Test claimant', email: 'claimant@example.test', password: 'password123', legal_agreement: '1', role: 'pro', claim: '42' };
function sessionToken(res) { return res.headers['Set-Cookie'].match(/gobookr_session=([^;]+)/)[1]; }

test('claim links and auth forms preserve the original listing ID, with escaped listing name', async () => {
  const a = app();
  const claim = await a.request('GET', '/pro/42/claim');
  assert.match(claim.body, /signup\?role=pro&claim=42/);
  assert.match(claim.body, /login\?claim=42/);
  for (const page of ['login', 'signup']) {
    const res = await a.request('GET', `/${page}?role=pro&claim=42`);
    assert.equal(res.status, 200);
    assert.match(res.body, /name="claim" value="42"/);
    assert.match(res.body, new RegExp(`${page === 'login' ? 'signup' : 'login'}\\?claim=42`));
    if (page === 'signup') {
      assert.match(res.body, /Example &lt;Salon&gt;/);
      assert.doesNotMatch(res.body, /name="business_name"|Start 30-day free trial/);
    }
  }
});

test('claim signup creates only an account; explicit request stays pending and is repeatable', async () => {
  const a = app({ claimOnly: true });
  const res = await a.request('POST', '/signup', signup);
  assert.equal(res.headers.Location, '/pro/42/claim');
  assert.equal(a.state.users.length, 1);
  assert.equal(a.state.users[0].role, 'customer');
  assert.equal(a.state.profiles.length, 1);
  assert.equal(a.state.profiles[0].user_id, null);
  assert.equal(a.state.subscriptions.length, 0);
  assert.equal(a.state.claims.length, 0);
  const token = sessionToken(res);
  const page = await a.request('GET', '/pro/42/claim', {}, token);
  assert.match(page.body, /name="_csrf" value="test-csrf"/);
  for (let i = 0; i < 2; i++) {
    const claim = await a.request('POST', '/pro/42/claim', { _csrf: 'test-csrf' }, token);
    assert.equal(claim.headers.Location, '/pro/42/claim');
  }
  assert.equal(a.state.claims.length, 1);
  assert.equal(a.state.claims[0].pro_id, 42);
  assert.equal(a.state.profiles[0].user_id, null);
  assert.equal(a.state.subscriptions.length, 0);
  assert.match((await a.request('GET', '/pro/42/claim', {}, token)).body, /Claim request pending/);
});

test('existing customer and professional login returns to claim, without changing role or creating profiles', async () => {
  for (const role of ['customer', 'pro']) {
    const a = app(); const { user, token } = a.addUser(role);
    const res = await a.request('POST', '/login', { email: user.email, password: 'password123', claim: '42', next: 'https://evil.example' });
    assert.equal(res.headers.Location, '/pro/42/claim');
    assert.equal(user.role, role);
    assert.equal(a.state.profiles.length, 1);
    assert.equal(a.state.writes.length, 0);
    for (const page of ['login', 'signup']) assert.equal((await a.request('GET', `/${page}?claim=42`, {}, token)).headers.Location, '/pro/42/claim');
  }
});

test('validation failures, existing email, and database errors keep claim context', async () => {
  const a = app(); const { user } = a.addUser();
  for (const fields of [{ password: 'short' }, { legal_agreement: '' }, { email: user.email }]) {
    const res = await a.request('POST', '/signup', { ...signup, ...fields });
    assert.match(res.headers.Location, /^\/signup\?claim=42&error=/);
  }
  const login = await a.request('POST', '/login', { email: user.email, password: 'wrong', claim: '42' });
  assert.match(login.headers.Location, /^\/login\?claim=42&error=/);
  const failed = await app({ failSignup: true }).request('POST', '/signup', signup);
  assert.match(failed.headers.Location, /^\/signup\?claim=42&error=/);
  assert.equal(a.state.writes.length, 0);
});

test('malformed and nonexistent IDs fail closed on authentication and claim endpoints', async () => {
  const a = app(); const { token } = a.addUser();
  for (const id of ['', '0', '-1', '1.5', '4e1', '0x2a', ' 42', '042', '9007199254740992', '999', '//evil.example']) {
    for (const page of ['login', 'signup']) {
      assert.equal((await a.request('GET', `/${page}?claim=${encodeURIComponent(id)}`)).status, 404, `${page}: ${id}`);
      assert.equal((await a.request('POST', `/${page}`, { ...signup, claim: id })).status, 404);
    }
    if (id) {
      for (const method of ['GET', 'POST']) assert.equal((await a.request(method, `/pro/${encodeURIComponent(id)}/claim`, { _csrf: 'test-csrf' }, token)).status, 404);
    }
  }
  assert.equal(a.state.writes.length, 0);
});

test('owned and non-claimable listings are rejected, including stale claim-status values', async () => {
  for (const fields of [{ user_id: 9 }, { claim_status: 'claimed' }, { claim_status: null }]) {
    const a = app(); const { token } = a.addUser(); Object.assign(a.state.profiles[0], fields);
    for (const page of ['login', 'signup']) {
      assert.equal((await a.request('GET', `/${page}?claim=42`)).status, 409);
      assert.equal((await a.request('POST', `/${page}`, signup)).status, 409);
    }
    for (const method of ['GET', 'POST']) assert.equal((await a.request(method, '/pro/42/claim', { _csrf: 'test-csrf' }, token)).status, 409);
    assert.equal(a.state.writes.length, 0);
  }
});

test('ownership changes after lookup reject the pending-claim write', async () => {
  const a = app({ beforeClaimWrite(state) { state.profiles[0].user_id = 999; } });
  const { token } = a.addUser();
  assert.equal((await a.request('POST', '/pro/42/claim', { _csrf: 'test-csrf' }, token)).status, 409);
  assert.equal(a.state.claims.length, 0);
  assert.equal(a.state.profiles[0].user_id, 999);
});

test('real server middleware still rejects missing/wrong CSRF and unauthenticated requests cannot create claims', async () => {
  const a = app(); const { token } = a.addUser();
  for (const body of [{}, { _csrf: 'wrong' }]) assert.equal((await a.request('POST', '/pro/42/claim', body, token)).status, 403);
  assert.equal((await a.request('POST', '/pro/42/claim')).headers.Location, '/login?claim=42');
  assert.equal(a.state.writes.length, 0);
});

test('normal professional/customer signup and ordinary login keep existing behavior', async () => {
  for (const role of ['pro', 'customer']) {
    const a = app(); const { claim, ...normalSignup } = signup;
    const res = await a.request('POST', '/signup', { ...normalSignup, role, business_name: 'New business', workplace_name: 'Workplace', street_address: '123 Main St', city: 'Denver', state: 'CO', zip_code: '80202', category_barber: '1' });
    assert.equal(res.headers.Location, role === 'pro' ? '/dashboard/pro/onboarding' : '/dashboard/customer');
    assert.equal(a.state.users[0].role, role);
    assert.equal(a.state.profiles.length, role === 'pro' ? 2 : 1);
    assert.equal(a.state.subscriptions.length, role === 'pro' ? 1 : 0);
    if (role === 'pro') assert.match(a.state.writes.find(sql => sql.includes('INTO subscriptions')), /\+30 days/);
    const login = await a.request('POST', '/login', { email: signup.email, password: signup.password, next: '/search' });
    assert.equal(login.headers.Location, '/search');
    const external = await a.request('POST', '/login', { email: signup.email, password: signup.password, next: '//evil.example' });
    assert.equal(external.headers.Location, role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
  }
});
