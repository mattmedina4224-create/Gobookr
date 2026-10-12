'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '..');

function load(file, overrides) {
  const filename = path.join(root, file), local = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, URL, URLSearchParams, process: { env: {} }, console,
    __dirname: path.dirname(filename), require: name => Object.hasOwn(overrides, name) ? overrides[name] : local(name),
  });
  return module.exports;
}

test('follow → publish → customer feed → hide/unfollow uses real Postgres and HTTP CSRF guards', async () => {
  const worker = new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function query(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4), { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    if (Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000) === 'timed-out') throw Error('Database timeout');
    const result = receiveMessageOnPort(port1).message; port1.close();
    if (result.error) throw Error(result.error); return result.value;
  }
  const db = { exec: sql => query('exec', sql), prepare: sql => ({
    get: (...args) => query('get', sql, args), all: (...args) => query('all', sql, args), run: (...args) => query('run', sql, args),
  }) };
  try {
    db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE users(id BIGINT PRIMARY KEY, role TEXT, name TEXT);
      CREATE TABLE pro_profiles(id BIGINT PRIMARY KEY,user_id BIGINT UNIQUE,business_name TEXT,city TEXT,state TEXT,category TEXT,claim_status TEXT,onboarding_completed INT);
      CREATE TABLE portfolio_items(id BIGINT PRIMARY KEY,pro_id BIGINT REFERENCES pro_profiles(id),image_url TEXT,caption TEXT);
      CREATE TABLE subscriptions(pro_id BIGINT,status TEXT,trial_ends_at TIMESTAMPTZ,past_due_since TIMESTAMPTZ);
      CREATE TABLE reviews(pro_id BIGINT,rating INT);
      CREATE TABLE pro_categories(pro_id BIGINT,category TEXT);
      INSERT INTO users VALUES(1,'customer','Customer'),(2,'customer','Other'),(3,'pro','Owner'),(4,'pro','Other owner'),(5,'admin','Admin');
      INSERT INTO pro_profiles VALUES(10,3,'Test <Studio>','Denver','CO','barber','claimed',1),(20,4,'Other studio','Denver','CO','barber','claimed',1);
      INSERT INTO subscriptions(pro_id,status) VALUES(10,'active'),(20,'active');
      INSERT INTO portfolio_items VALUES(100,10,'https://example.test/work.jpg','My work'),(200,20,'https://example.test/other.jpg','Other work');`);
    const migration = fs.readFileSync(path.join(root, 'db/migrations/20261012184514_customer_follow_updates.sql'), 'utf8');
    db.exec(migration); db.exec(migration); // deployment is idempotent
    const team = { coverage: () => [] };
    const subscriptions = load('lib/subscription.js', { '../db': db, './business-team': team });
    const hydrate = load('lib/pro-listing-data.js', { '../db': db, './subscription': subscriptions, './business-team': team });
    const following = load('lib/following.js', { '../db': db, './pro-listing-data': hydrate });
    const route = load('routes/following.js', { '../db': db, '../lib/following': following,
      '../lib/subscription': subscriptions, '../lib/pro-listing-data': hydrate,
      '../lib/layout': { layout: m => m.body },
    });
    let handle;
    const overrides = { './routes/following': route, './lib/layout': { layout: m => m.body },
      './lib/pro-billing-banner': { installBillingBanner() {} }, './lib/square-dashboard-card': { installSquareDashboardCard() {} },
      './lib/rate-limit': { checkAuthRateLimit: () => ({ allowed: true }) },
      './lib/router': load('lib/router.js', { '../routes/home': () => {} }),
      './lib/auth': { getSessionUser: req => { const id = Number(req.headers.cookie); const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id); return user ? { user, session: { csrf_token: 'test-csrf' } } : null; } },
      'node:http': { createServer(fn) { handle = fn; return { listen() {} }; } },
    };
    for (const [, name] of fs.readFileSync(path.join(root, 'server.js'), 'utf8').matchAll(/require\('\.\/routes\/([^']+)'\)/g)) {
      if (name !== 'following') overrides['./routes/' + name] = () => {};
    }
    load('server.js', overrides);
    async function request(method, url, id, body = {}) {
      const req = Readable.from(method === 'POST' ? [Buffer.from(new URLSearchParams(body).toString())] : []);
      Object.assign(req, { method, url, headers: { host: 'localhost', cookie: String(id || ''), 'content-type': 'application/x-www-form-urlencoded' } });
      const res = { status: 200, headers: {}, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
        setHeader(key,value) { this.headers[key] = value; }, end(body = '') { this.body = body; } };
      await handle(req, res); return res;
    }
    const follow = { following: '1', _csrf: 'test-csrf', return_to: '/following' };
    assert.equal((await request('POST','/following/10',1,{following:'1'})).status,403);
    assert.equal((await request('GET','/following',null)).headers.Location,'/login?next=%2Ffollowing');
    assert.equal((await request('POST','/following/10',3,follow)).status,403);
    assert.equal((await request('POST','/following/not-a-number',1,follow)).status,400);
    assert.equal((await request('POST','/following/10',1,follow)).status,302);
    await request('POST','/following/10',1,follow);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_follows').get().n,1);
    assert.equal((await request('POST','/following/10',2,{...follow,return_to:'//evil.test'})).headers.Location,'/pro/10');
    assert.equal((await request('POST','/dashboard/pro/updates',3,{message:'Hi'})).status,403);
    assert.equal((await request('POST','/dashboard/pro/updates',1,{message:'Hi',_csrf:'test-csrf'})).status,403);
    assert.equal((await request('POST','/dashboard/pro/updates',3,{message:'Hi',photo:'200',_csrf:'test-csrf'})).status,400);
    const publish = await request('POST','/dashboard/pro/updates',3,{message:'Fresh <script>alert(1)</script> work',photo:'100',_csrf:'test-csrf'});
    assert.equal(publish.status,302);
    const feed = await request('GET','/following',1);
    assert.match(feed.body,/Fresh &lt;script&gt;/); assert.doesNotMatch(feed.body,/<script>alert/);
    assert.match(feed.body,/work.jpg/); assert.match(feed.body,/Test &lt;Studio&gt;/);
    const post = db.prepare('SELECT * FROM pro_updates').get();
    assert.equal((await request('POST',`/dashboard/pro/updates/${post.id}/hide`,4,{_csrf:'test-csrf'})).status,404);
    const publisher = await request('GET','/dashboard/pro/updates',3);
    assert.match(publisher.body,/2 followers/); assert.doesNotMatch(publisher.body,/Other owner/);
    db.prepare('UPDATE pro_profiles SET onboarding_completed=0 WHERE id=10').run();
    assert.doesNotMatch((await request('GET','/following',1)).body,/Fresh &lt;script/);
    assert.equal((await request('POST','/following/10',1,follow)).status,404);
    assert.match((await request('POST','/dashboard/pro/updates',3,{message:'Private',_csrf:'test-csrf'})).headers.Location,/error=/);
    db.prepare('UPDATE pro_profiles SET onboarding_completed=1 WHERE id=10').run();
    db.prepare("UPDATE subscriptions SET status='canceled' WHERE pro_id=10").run();
    assert.doesNotMatch((await request('GET','/following',1)).body,/Fresh &lt;script/);
    db.prepare("UPDATE subscriptions SET status='active' WHERE pro_id=10").run();
    await request('POST','/following/10',1,{...follow,following:'0'});
    assert.doesNotMatch((await request('GET','/following',1)).body,/Fresh &lt;script/);
    assert.match((await request('GET','/following',2)).body,/Fresh &lt;script/);
    await request('POST',`/dashboard/pro/updates/${post.id}/hide`,3,{_csrf:'test-csrf'});
    assert.equal(following.publicUpdates(10).length,0);
    assert.doesNotMatch((await request('GET','/following',2)).body,/Fresh &lt;script/);
    assert.equal((await request('GET','/following?before=invalid',2)).status,400);
    for (let i=0;i<22;i++) db.prepare('INSERT INTO pro_updates(pro_id,message) VALUES(10,?)').run('Update '+i);
    const page1=following.followedUpdates(2), page2=following.followedUpdates(2,page1.next);
    assert.equal(page1.updates.length,20); assert.equal(page2.updates.length,2);
    assert.equal(new Set([...page1.updates,...page2.updates].map(p=>p.update_id)).size,22);
    assert.match((await request('POST','/dashboard/pro/updates',3,{message:'Too many',_csrf:'test-csrf'})).headers.Location,/error=/);
    assert.equal(db.prepare("SELECT has_table_privilege('anon','customer_follows','SELECT') AS allowed").get().allowed,false);
    assert.equal(db.prepare("SELECT has_table_privilege('authenticated','pro_updates','INSERT') AS allowed").get().allowed,false);
    assert.equal(following.safeImage('javascript:alert(1)'), '');
    assert.equal(following.followReturnPath('/following?before=1',10),'/following?before=1');
    assert.equal(following.followReturnPath('/\\evil.test',10),'/pro/10');
  } finally { query('close',''); await worker.terminate(); }
});
