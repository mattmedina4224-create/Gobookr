'use strict';
// Password-reset delivery on real Postgres semantics (PGlite in CI, or a local Postgres via TEST_PG_URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { createPasswordReset, senderFor, LIMITS } = require('../lib/password-reset');

function database() {
  const worker = process.env.TEST_PG_URL
    ? new Worker(path.join(__dirname, 'helpers/pg-url-worker.js'), { workerData: { url: process.env.TEST_PG_URL } })
    : new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function call(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4), { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    if (Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000) === 'timed-out') throw new Error('database timeout');
    const msg = receiveMessageOnPort(port1).message; port1.close();
    if (msg.error) throw new Error(msg.error);
    return msg.value;
  }
  return { exec: (sql) => call('exec', sql), prepare: (sql) => ({ get: (...a) => call('get', sql, a), all: (...a) => call('all', sql, a), run: (...a) => call('run', sql, a) }), close: async () => { call('close', ''); await worker.terminate(); } };
}
let shared = null;
test.after(async () => { if (shared) await shared.close(); });
const tokenHash = (t) => crypto.createHash('sha256').update(String(t || '')).digest('hex');
const ENV = { RESEND_API_KEY: 're_test', APP_URL: 'https://gobookr.com' };

function setup({ env = ENV, reply } = {}) {
  if (!shared) shared = database();
  const db = shared;
  db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  db.exec(`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE public.users (id BIGINT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, password_hash TEXT);
    CREATE TABLE public.password_reset_tokens (id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES public.users(id), token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO public.users VALUES (8, 'owner@example.test', 'Owner', 'pro', 'old-hash'), (22, 'admin@example.test', 'Admin', 'customer', 'admin-hash');`);
  const m = fs.readFileSync(path.join(__dirname, '../db/migrations/20261125_password_reset_requests.sql'), 'utf8');
  db.exec(m); db.exec(m); // idempotent
  const mail = [];
  const fetchEmail = async (url, opts) => { mail.push({ url, headers: opts.headers, body: JSON.parse(opts.body) }); return reply ? reply() : { ok: true, status: 200, json: async () => ({ id: 'em_' + mail.length }) }; };
  const reset = createPasswordReset({ db, env, fetchEmail, tokenHash });
  const linkToken = () => /token=([a-f0-9]{64})/.exec(mail[mail.length - 1].body.text)[1];
  const tokens = () => db.prepare('SELECT user_id, token_hash, expires_at, used_at, (expires_at - created_at) AS ttl FROM public.password_reset_tokens').all();
  return { db, reset, mail, linkToken, tokens };
}

const quiet = async (fn) => { const e = console.error, l = console.log, out = []; console.error = (...a) => out.push(a.join(' ')); console.log = (...a) => out.push(a.join(' ')); try { await fn(); } finally { console.error = e; console.log = l; } return out; };

test('an existing account gets one email from admin@gobookr.com with a 1-hour single-use link; only the hash is stored', async () => {
  const h = setup();
  let logs;
  logs = await quiet(async () => assert.equal((await h.reset.request('  Owner@Example.test ', '1.1.1.1')).status, 'sent'));
  assert.equal(h.mail.length, 1);
  const sent = h.mail[0];
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.body.from, 'GoBookr <admin@gobookr.com>');
  assert.deepEqual(sent.body.to, ['owner@example.test']);
  assert.match(sent.body.html, /https:\/\/gobookr\.com\/reset-password\?token=[a-f0-9]{64}/);
  const raw = h.linkToken();
  const rows = h.tokens();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, tokenHash(raw));
  assert.equal(JSON.stringify(rows).includes(raw), false, 'raw token is never stored');
  assert.match(String(JSON.stringify(rows[0].ttl)), /01:00:00|"hours":1/);
  for (const line of logs) { assert.equal(line.includes(raw), false, 'raw token never logged'); assert.equal(line.includes('owner@example.test'), false, 'recipient never logged'); }
  assert.equal(senderFor({ PASSWORD_RESET_EMAIL_FROM: 'GoBookr <x@gobookr.com>' }), 'GoBookr <x@gobookr.com>');
});

test('unknown addresses send nothing and leave no token, but still count toward the limit', async () => {
  const h = setup();
  assert.equal((await h.reset.request('nobody@example.test', '2.2.2.2')).status, 'no_account');
  assert.equal(h.mail.length, 0);
  assert.equal(h.tokens().length, 0);
  assert.equal((await h.reset.request('nobody@example.test', '2.2.2.2')).status, 'limited', 'cooldown applies to unknown addresses too');
  const stored = h.db.prepare('SELECT key_hash FROM public.password_reset_requests').all().map((r) => r.key_hash);
  assert.ok(stored.every((k) => /^[a-f0-9]{64}$/.test(k)), 'only hashes stored');
  assert.equal(JSON.stringify(stored).includes('nobody'), false);
});

test('rate limits: 60-second cooldown per address, 3 per hour per address, 10 per hour per client', async () => {
  const h = setup();
  await quiet(async () => {
    assert.equal((await h.reset.request('owner@example.test', '3.3.3.3')).status, 'sent');
    assert.equal((await h.reset.request('owner@example.test', '4.4.4.4')).status, 'limited', 'cooldown across clients');
  });
  assert.equal(h.mail.length, 1);
  // Age the attempts past the cooldown but inside the hour.
  const age = (s) => h.db.exec(`UPDATE public.password_reset_requests SET requested_at = requested_at - INTERVAL '${s} seconds'`);
  await quiet(async () => {
    age(61); assert.equal((await h.reset.request('owner@example.test', '5.5.5.5')).status, 'sent');
    age(61); assert.equal((await h.reset.request('owner@example.test', '6.6.6.6')).status, 'limited', 'third attempt in the hour already counted (limited one included)');
  });
  assert.equal(LIMITS.emailPerHour, 3);
  // Client-wide limit across many addresses.
  const c = setup();
  const results = [];
  for (let i = 0; i < 11; i += 1) results.push((await c.reset.request(`x${i}@example.test`, '9.9.9.9')).status);
  assert.deepEqual(results.slice(0, 10), Array(10).fill('no_account'));
  assert.equal(results[10], 'limited');
});

test('a new request replaces the previous link; delivery failure leaves no usable token and logs no secrets', async () => {
  const h = setup();
  await quiet(async () => { await h.reset.request('owner@example.test', '1.1.1.1'); });
  const first = h.linkToken();
  h.db.exec("UPDATE public.password_reset_requests SET requested_at = requested_at - INTERVAL '2 minutes'");
  await quiet(async () => { await h.reset.request('owner@example.test', '1.1.1.1'); });
  assert.notEqual(h.linkToken(), first);
  assert.deepEqual(h.tokens().map((t) => t.token_hash), [tokenHash(h.linkToken())]);

  const f = setup({ reply: () => ({ ok: false, status: 403, json: async () => ({ name: 'validation_error', message: 'The gobookr.com domain is not verified.' }) }) });
  const logs = await quiet(async () => assert.equal((await f.reset.request('owner@example.test', '1.1.1.1')).status, 'failed'));
  assert.equal(f.tokens().length, 0, 'failed delivery removes the token');
  const raw = /token=([a-f0-9]{64})/.exec(f.mail[0].body.text)[1];
  assert.ok(logs.some((l) => /delivery rejected/.test(l) && /403/.test(l) && /validation_error/.test(l) && /not verified/.test(l)), 'diagnosable');
  for (const line of logs) { assert.equal(line.includes(raw), false); assert.equal(line.includes('re_test'), false); assert.equal(line.includes('owner@example.test'), false); }
});

test('without RESEND_API_KEY nothing is issued; the route never logs reset links', async () => {
  const h = setup({ env: {} });
  await quiet(async () => assert.equal((await h.reset.request('owner@example.test', '1.1.1.1')).status, 'unavailable'));
  assert.equal(h.mail.length, 0);
  assert.equal(h.tokens().length, 0);
  const route = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  assert.equal(/console\.(log|info|debug)\([^)]*reset/i.test(route), false);
  assert.match(route, /If an account exists for that email/);
});
