'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
function database() {
  const worker = new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function call(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4);
    const { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    if (Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000) === 'timed-out') throw Error('Postgres test timed out');
    const result = receiveMessageOnPort(port1).message; port1.close();
    if (result.error) throw Error(result.error);
    return result.value;
  }
  return { exec: sql => call('exec', sql), prepare: sql => ({ get: (...args) => call('get', sql, args), all: (...args) => call('all', sql, args), run: (...args) => call('run', sql, args) }), close: async () => { call('close', ''); await worker.terminate(); } };
}
function load(file, dependencies) {
  const filename = path.join(__dirname, '..', file); const module = { exports: {} }; const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: name => Object.hasOwn(dependencies,name) ? dependencies[name] : localRequire(name), console: { error() {} }, process: { env: {} }, Buffer, Date, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => [] }) });
  return module.exports;
}
const schema = `CREATE TABLE users (id BIGSERIAL PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT, phone TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id BIGINT REFERENCES users(id), csrf_token TEXT, expires_at TIMESTAMPTZ);
CREATE TABLE admin_accounts (user_id BIGINT PRIMARY KEY REFERENCES users(id));
CREATE TABLE pro_profiles (id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id), business_name TEXT, workplace_name TEXT, category TEXT DEFAULT 'barber', city TEXT, state TEXT, street_address TEXT, suite TEXT, zip_code TEXT, claim_status TEXT, claim_requested_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ, professional_handle TEXT, booking_url TEXT, latitude DOUBLE PRECISION DEFAULT 39.7, longitude DOUBLE PRECISION DEFAULT -105, license_number TEXT, license_state TEXT, license_verified INTEGER DEFAULT 0, price_min INTEGER, price_max INTEGER, years_experience INTEGER, bio TEXT, onboarding_completed INTEGER DEFAULT 0);
CREATE TABLE customer_favorites (customer_id BIGINT, pro_id BIGINT, created_at TIMESTAMPTZ);
CREATE TABLE subscriptions (id BIGSERIAL PRIMARY KEY, pro_id BIGINT UNIQUE REFERENCES pro_profiles(id), status TEXT, trial_started_at TIMESTAMPTZ, trial_ends_at TIMESTAMPTZ);
INSERT INTO users (id,name,email,role) VALUES (90,'Reviewer','reviewer@example.test','customer');
INSERT INTO admin_accounts VALUES (90);
INSERT INTO sessions VALUES ('admin-session',90,'csrf',CURRENT_TIMESTAMP + INTERVAL '1 day');
INSERT INTO pro_profiles (id,business_name,workplace_name,city,state,street_address,suite,zip_code,claim_status) VALUES (42,'Internal claim fixture','Test workplace','Denver','CO','123 Main St','','80202','unclaimed'),(43,'Second fixture','Test workplace','Denver','CO','123 Main St','','80202','unclaimed');`;
function app(db) {
  const http = require('../lib/http'); const common = { '../db': db, '../lib/http': http, '../lib/layout': { layout: args => (args.flash?.message || '') + args.body }, '../lib/util': require('../lib/util'), '../lib/favorites': { currentSaves: () => 0 }, '../lib/pro-listing-data': { hydratePros: () => [] }, '../lib/subscription': { isProPubliclyVisible: () => true } };
  const auth = load('lib/auth.js', { '../db': db });
  common['../lib/auth'] = auth;
  common['../lib/claims'] = load('lib/claims.js', { '../db': db, './http': http });
  common['../lib/admin'] = load('lib/admin.js', { '../db': db, './http': http });
  const routes = {};
  const router = { get: (p,f) => routes['GET '+p] = f, post: (p,f) => routes['POST '+p] = f };
  for (const file of ['auth','claim','admin','pro','customer']) load('routes/'+file+'.js', common)(router);
  return async (method,route,{ id,body={},query={},user,token }={}) => {
    const ctx = { params: { id: String(id || '') }, body, query, currentUser: user, session: token ? db.prepare('SELECT * FROM sessions WHERE token=?').get(token) : null, res: { status: 200, headers: {}, body: '', setHeader(k,v) { this.headers[k]=v; }, writeHead(s,h) { this.status=s; Object.assign(this.headers,h); }, end(b) { this.body=b; } } };
    await routes[method+' '+route](ctx); return ctx.res;
  };
}
test('Postgres claim signup, pending review, approval, trial and profile editing use the same listing', async () => {
  const db=database();
  try {
    db.exec(schema); db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/20260915_profile_claims.sql'),'utf8'));
    const request=app(db);
    const signup=await request('POST','/signup',{body:{claim:'42',name:'Claim tester',email:'claimant@example.test',password:'DemoTest!123',legal_agreement:'1',role:'pro'}});
    assert.equal(signup.headers.Location,'/pro/42/claim');
    const user=db.prepare('SELECT * FROM users WHERE email=?').get('claimant@example.test');
    assert.equal(user.role,'customer'); assert.equal(db.prepare('SELECT count(*) AS n FROM subscriptions').get().n,0);
    const token=signup.headers['Set-Cookie'].match(/gobookr_session=([^;]+)/)[1];
    assert.equal(db.prepare('SELECT count(*) AS n FROM pro_profiles').get().n,2);
    const invalid=await request('POST','/pro/:id/claim',{id:42,user,token,body:{verification_method:'other',verification_evidence:'x'}});
    assert.match(invalid.headers.Location,/error=/);
    const errorPage=await request('GET','/pro/:id/claim',{id:42,user,token,query:{error:'Verification details required'}});
    assert.match(errorPage.body,/Verification details required/);
    for(let i=0;i<2;i++) await request('POST','/pro/:id/claim',{id:42,user,token,body:{verification_method:'booking_profile',verification_evidence:'Internal fixture ownership proof'}});
    assert.equal(db.prepare("SELECT count(*) AS n FROM profile_claims WHERE status='pending'").get().n,1);
    assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=42').get().user_id,null);
    assert.match((await request('GET','/pro/:id/claim',{id:42,user,token})).body,/Claim request received/);
    assert.match((await request('GET','/dashboard/customer',{user,token})).body,/Your profile claims/);
    assert.match((await request('GET','/dashboard/customer',{user,token})).body,/Under review/);
    const unauthorized=await request('POST','/admin/profile-claims/:id/approve',{id:1,user,token}); assert.equal(unauthorized.status,403);
    const admin=db.prepare('SELECT * FROM users WHERE id=90').get();
    await request('POST','/admin/profile-claims/:id/approve',{id:1,user:admin,token:'admin-session'});
    const profile=db.prepare('SELECT * FROM pro_profiles WHERE id=42').get();
    assert.equal(profile.user_id,user.id); assert.equal(profile.claim_status,'claimed');
    const updated=db.prepare('SELECT * FROM users WHERE id=?').get(user.id); assert.equal(updated.role,'pro');
    const trial=db.prepare('SELECT *, EXTRACT(EPOCH FROM (trial_ends_at-trial_started_at))/86400 AS duration FROM subscriptions WHERE pro_id=42').get();
    assert.equal(trial.status,'trialing'); assert.equal(Number(trial.duration),30);
    await request('POST','/admin/profile-claims/:id/approve',{id:1,user:admin,token:'admin-session'});
    assert.equal(db.prepare('SELECT count(*) AS n FROM subscriptions').get().n,1);
    assert.equal((await request('GET','/pro/:id/claim',{id:42,user:updated,token})).headers.Location,'/dashboard/pro');
    await request('POST','/dashboard/pro/profile',{user:updated,token,body:{...profile,business_name:'Edited claim fixture',professional_handle:'claimfixture',booking_url:'https://example.test/book',bio:'Edited by approved owner'}});
    assert.equal(db.prepare('SELECT business_name FROM pro_profiles WHERE id=42').get().business_name,'Edited claim fixture');
    assert.equal(db.prepare('SELECT count(*) AS n FROM pro_profiles').get().n,2);
  } finally { await db.close(); }
});

function initialize(db) {
  db.exec(schema);
  db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/20260915_profile_claims.sql'),'utf8'));
  db.exec("INSERT INTO users (id,name,email,role) VALUES (1,'Claimant one','one@example.test','customer'),(2,'Claimant two','two@example.test','customer'); INSERT INTO profile_claims (pro_id,claimant_user_id,verification_method,verification_evidence) VALUES (42,1,'other','Internal proof one'),(42,2,'other','Internal proof two'); UPDATE pro_profiles SET claim_status='claim_pending' WHERE id=42;");
}
test('Postgres rejection reopens only after the final pending request and stale approval cannot transfer ownership', async () => {
  const db=database();
  try {
    initialize(db); const request=app(db); const admin=db.prepare('SELECT * FROM users WHERE id=90').get();
    for (const id of [1,2]) {
      await request('POST','/admin/profile-claims/:id/reject',{id,user:admin,token:'admin-session'});
      assert.equal(db.prepare('SELECT claim_status FROM pro_profiles WHERE id=42').get().claim_status,id===1?'claim_pending':'unclaimed');
    }
    await request('POST','/admin/profile-claims/:id/approve',{id:1,user:admin,token:'admin-session'});
    assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=42').get().user_id,null);
    assert.equal(db.prepare('SELECT count(*) AS n FROM subscriptions').get().n,0);
  } finally { await db.close(); }
});
test('Postgres approval rejects competitors, prevents a second owned profile, and records reviewer', async () => {
  const db=database();
  try {
    initialize(db); const request=app(db); const admin=db.prepare('SELECT * FROM users WHERE id=90').get();
    await request('POST','/admin/profile-claims/:id/approve',{id:1,user:admin,token:'admin-session'});
    assert.equal(db.prepare('SELECT status FROM profile_claims WHERE id=2').get().status,'rejected');
    assert.equal(db.prepare('SELECT reviewer_user_id FROM profile_claims WHERE id=1').get().reviewer_user_id,90);
    db.exec("INSERT INTO profile_claims (pro_id,claimant_user_id,verification_method,verification_evidence) VALUES (43,1,'other','Internal second proof');");
    const result=await request('POST','/admin/profile-claims/:id/approve',{id:3,user:admin,token:'admin-session'});
    assert.match(decodeURIComponent(result.headers.Location),/already owns/);
    assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=43').get().user_id,null);
    assert.equal(db.prepare('SELECT count(*) AS n FROM subscriptions').get().n,1);
    await request('POST','/admin/profile-claims/:id/approve',{id:2,user:admin,token:'admin-session'});
    assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=42').get().user_id,1);
  } finally { await db.close(); }
});
test('Postgres approval failure rolls back profile, account, reviews and trial together', async () => {
  const db=database();
  try {
    initialize(db); db.exec("ALTER TABLE subscriptions ADD CONSTRAINT force_test_failure CHECK (status <> 'trialing');");
    const request=app(db); const admin=db.prepare('SELECT * FROM users WHERE id=90').get();
    const result=await request('POST','/admin/profile-claims/:id/approve',{id:1,user:admin,token:'admin-session'});
    assert.match(decodeURIComponent(result.headers.Location),/No ownership change/);
    assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=42').get().user_id,null);
    assert.equal(db.prepare('SELECT role FROM users WHERE id=1').get().role,'customer');
    assert.equal(db.prepare("SELECT count(*) AS n FROM profile_claims WHERE status='pending'").get().n,2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM subscriptions').get().n,0);
  } finally { await db.close(); }
});
