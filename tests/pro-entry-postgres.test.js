'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { createRequire } = require('node:module');

test('professional entry searches only unclaimed sourced listings and creates one private draft per account', async () => {
  const worker = new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function query(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4);
    const { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    if (Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000) === 'timed-out') throw Error('Database timeout');
    const result = receiveMessageOnPort(port1).message;
    port1.close();
    if (result.error) throw Error(result.error);
    return result.value;
  }
  const db = { exec: sql => query('exec', sql), prepare: sql => ({
    get: (...args) => query('get', sql, args), all: (...args) => query('all', sql, args), run: (...args) => query('run', sql, args),
  }) };
  try {
    db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY, role TEXT);
      CREATE TABLE pro_profiles(id BIGSERIAL PRIMARY KEY,user_id BIGINT UNIQUE,business_name TEXT,category TEXT,city TEXT,state TEXT,workplace_name TEXT,claim_status TEXT DEFAULT 'claimed',onboarding_completed INTEGER DEFAULT 0,source_url TEXT,source_name TEXT);
      CREATE TABLE subscriptions(id BIGSERIAL PRIMARY KEY,pro_id BIGINT UNIQUE,status TEXT,trial_started_at TIMESTAMPTZ,trial_ends_at TIMESTAMPTZ);
      INSERT INTO users VALUES (1,'customer'),(2,'customer'),(3,'admin');
      INSERT INTO pro_profiles(business_name,city,state,claim_status,source_url,source_name) VALUES
      ('Test <Studio>','Denver','CO','unclaimed','https://example.com','Fixture'),
      ('Test pending','Denver','CO','claim_pending','https://example.com','Fixture'),
      ('Test unsourced','Denver','CO','unclaimed',NULL,NULL);`);
    const filename = path.join(__dirname, '../routes/pro-entry.js');
    const local = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console, require: name => name === '../db' ? db : name === '../lib/layout' ? { layout: m => m.body } : local(name) });
    const routes = new Map();
    module.exports({ get: (p, f) => routes.set('GET ' + p, f), post: (p, f) => routes.set('POST ' + p, f) });
    const chooser = {exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/business-account.js'),'utf8'), { module:chooser,URLSearchParams,require:name=>name==='../lib/layout'?{layout:m=>m.body}:local(name) });
    chooser.exports({ get:(p,f)=>routes.set('GET '+p,f) });
    async function request(method, pathname, userId, params = {}) {
      const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
      await routes.get(method + ' ' + pathname)({ res, query: params, body: {}, session: { csrf_token: 'csrf' }, currentUser: userId ? db.prepare('SELECT * FROM users WHERE id=?').get(userId) : null });
      return res;
    }
    const choice = await request('GET','/join',null);
    assert.match(choice.body,/Are you joining as an individual or a business\?/);
    assert.match(choice.body,/href="\/join\/individual"/);
    assert.match(choice.body,/href="\/signup\?role=storefront"/);
    assert.match(choice.body,/30 days free, then \$20\/month/);
    assert.match(choice.body,/Complimentary/);
    assert.doesNotMatch(choice.body,/Find my profile/);
    assert.equal((await request('GET','/business-account',null)).headers.Location,'/join');
    const legacySearch=await request('GET','/join',null,{q:'Test',city:'Denver'});
    assert.equal(legacySearch.headers.Location,'/join/individual?q=Test&city=Denver');
    const results = await request('GET', '/join/individual', null, { q: 'Test', city: 'Denver' });
    assert.match(results.body, /Test &lt;Studio&gt;/);
    assert.doesNotMatch(results.body, /Test pending|Test unsourced/);
    assert.match(results.body, /\/pro\/1\/claim/);
    assert.match(results.body, /action="\/join\/individual"/);
    assert.match(results.body, /\/login\?next=%2Fjoin%2Findividual/);
    await request('GET', '/join', 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM subscriptions').get().count, 0);
    await request('POST', '/join/create', 1);
    assert.equal(db.prepare('SELECT role FROM users WHERE id=1').get().role, 'pro');
    const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id=1').get();
    assert.equal(profile.onboarding_completed, 0);
    assert.equal(profile.business_name, '');
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE pro_id=?').get(profile.id);
    assert.equal(subscription.status, 'trialing');
    await request('POST', '/join/create', 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM pro_profiles WHERE user_id=1').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM subscriptions').get().count, 1);
    assert.equal((await request('POST', '/join/create', 3)).status, 403);
    assert.match((await request('POST', '/join/create', null)).headers.Location, /login/);
    assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=1').get().user_id, null);
    // A mid-conversion failure must leave the customer account unchanged.
    db.exec('DROP TABLE subscriptions;');
    const failed = await request('POST', '/join/create', 2);
    assert.match(failed.headers.Location, /\/join\/individual\?error=/);
    assert.equal(db.prepare('SELECT role FROM users WHERE id=2').get().role, 'customer');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM pro_profiles WHERE user_id=2').get().count, 0);
  } finally {
    query('close', '');
    await worker.terminate();
  }
});
