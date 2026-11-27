'use strict';
// One-time administrator provisioning: owner authorization + email-control verification + audit, on real Postgres
// semantics (PGlite in CI, or a local Postgres via TEST_PG_URL).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { createAdminGrant, codeHash } = require('../lib/admin-grant');

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
const ENV = { RESEND_API_KEY: 're_test', ADMIN_GRANT_EMAIL_FROM: 'Tovara <security@gobookr.test>', ADMIN_GRANT_SECRET: 'x'.repeat(40) };
const ctx = { req: { headers: { 'user-agent': 'test' }, socket: { remoteAddress: '127.0.0.1' } } };

function setup() {
  if (!shared) shared = database();
  const db = shared;
  db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  db.exec(`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE public.users (id BIGINT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, google_sub TEXT);
    CREATE TABLE public.sessions (token TEXT PRIMARY KEY, user_id BIGINT REFERENCES public.users(id), expires_at TIMESTAMPTZ);
    INSERT INTO public.users VALUES (21, 'info@example.test', 'Admin to be', 'customer', NULL), (8, 'business@example.test', 'Business account', 'pro', NULL);
    INSERT INTO public.sessions VALUES ('s21', 21, CURRENT_TIMESTAMP + INTERVAL '1 day'), ('s8', 8, CURRENT_TIMESTAMP + INTERVAL '1 day');`);
  db.exec(fs.readFileSync(path.join(__dirname, '../db/migrations/20260924050440_admin_accounts.sql'), 'utf8'));
  const m = fs.readFileSync(path.join(__dirname, '../db/migrations/20261123_admin_grant_verification.sql'), 'utf8');
  db.exec(m); db.exec(m);
  const mail = [];
  const fetchEmail = async (url, opts) => { mail.push({ url, body: JSON.parse(opts.body) }); return { ok: true }; };
  const grant = createAdminGrant({ db, env: ENV, fetchEmail });
  const lastCode = () => /code is (\d{8})/.exec(mail[mail.length - 1].body.text)[1];
  const isAdmin = (id) => Number(db.prepare('SELECT COUNT(*) AS n FROM public.admin_accounts WHERE user_id = ?').get(id).n) === 1;
  const authorize = (id = 21, email = 'info@example.test') => db.prepare("SELECT public.admin_grant_authorize(?, ?, 'Project owner', 'test') AS id").get(id, email).id;
  return { db, grant, mail, lastCode, isAdmin, authorize };
}

test('nothing works without an owner authorization; authorization needs an exact ID and email', async () => {
  const h = setup();
  assert.equal(h.grant.pending({ id: 21 }), null);
  assert.equal((await h.grant.sendCode(ctx, { id: 21 })).reason, 'not_found');
  assert.equal(h.grant.verify(ctx, { id: 21 }, '12345678').reason, 'not_found');
  assert.throws(() => h.authorize(21, 'INFO@example.test'), /No exact user ID\/email match/);
  assert.throws(() => h.authorize(8, 'info@example.test'), /No exact/);
  assert.equal(h.isAdmin(21), false);
});

test('authorization alone grants nothing; the email code completes it once, with audit and sign-out', async () => {
  const h = setup();
  h.authorize();
  assert.equal(h.isAdmin(21), false, 'authorization is not a grant');
  assert.equal(h.grant.pending({ id: 8 }), null, 'another account cannot see or use it');
  assert.equal((await h.grant.sendCode(ctx, { id: 8 })).reason, 'not_found');
  const sent = await h.grant.sendCode(ctx, { id: 21 });
  assert.equal(sent.ok, true);
  assert.deepEqual(h.mail[0].body.to, ['info@example.test'], 'code goes only to the authorized address');
  assert.equal((await h.grant.sendCode(ctx, { id: 21 })).reason, 'wait', 'resend cooldown');
  const stored = h.db.prepare('SELECT code_hash FROM public.admin_grant_requests').get().code_hash;
  assert.notEqual(stored, h.lastCode(), 'only an HMAC is stored'); assert.match(stored, /^[a-f0-9]{64}$/);
  assert.equal(h.grant.verify(ctx, { id: 21 }, '00000000').reason, 'wrong_code');
  assert.equal(h.grant.verify(ctx, { id: 8 }, h.lastCode()).reason, 'not_found', 'the code is useless to another account');
  assert.equal(h.isAdmin(21), false);
  const done = h.grant.verify(ctx, { id: 21 }, h.lastCode());
  assert.deepEqual([done.ok, done.reason], [true, 'granted']);
  assert.equal(h.isAdmin(21), true);
  assert.equal(h.isAdmin(8), false, 'the separate business account is untouched');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM public.sessions WHERE user_id = 21").get().n, 0, 'signed out everywhere');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM public.sessions WHERE user_id = 8").get().n, 1);
  assert.equal(h.grant.verify(ctx, { id: 21 }, h.lastCode()).reason, 'not_found', 'one-time');
  const audit = h.db.prepare('SELECT event, actor FROM public.admin_grant_audit ORDER BY id').all();
  assert.deepEqual(audit.map((a) => a.event), ['authorized', 'code_sent', 'code_rejected', 'verified_and_granted']);
  assert.equal(audit[0].actor, 'Project owner');
  assert.throws(() => h.db.exec('DELETE FROM public.admin_grant_audit'), /append-only/);
  assert.throws(() => h.db.exec("UPDATE public.admin_grant_audit SET actor = 'x'"), /append-only/);
  assert.throws(() => h.authorize(), /already an administrator/);
});

test('five wrong codes lock the authorization; expiry and email changes void it', async () => {
  let h = setup();
  h.authorize(); await h.grant.sendCode(ctx, { id: 21 });
  for (let i = 0; i < 4; i++) assert.equal(h.grant.verify(ctx, { id: 21 }, '11111111').reason, 'wrong_code');
  assert.equal(h.grant.verify(ctx, { id: 21 }, '11111111').reason, 'locked');
  assert.equal(h.grant.verify(ctx, { id: 21 }, h.lastCode()).reason, 'not_found', 'locked for good');
  assert.equal(h.isAdmin(21), false);

  h = setup();
  const id = h.authorize(); await h.grant.sendCode(ctx, { id: 21 });
  h.db.prepare("UPDATE public.admin_grant_requests SET code_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = ?").run(id);
  assert.equal(h.grant.verify(ctx, { id: 21 }, h.lastCode()).reason, 'code_expired');
  h.db.prepare("UPDATE public.admin_grant_requests SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = ?").run(id);
  assert.equal(h.grant.pending({ id: 21 }), null);
  assert.equal(h.db.prepare('SELECT public.admin_grant_verify(?, 21, ?, \'\') AS s').get(id, codeHash(id, h.lastCode(), ENV)).s, 'expired');
  assert.equal(h.isAdmin(21), false);

  h = setup();
  const id2 = h.authorize(); await h.grant.sendCode(ctx, { id: 21 });
  h.db.exec("UPDATE public.users SET email = 'someone-else@example.test' WHERE id = 21");
  assert.equal(h.grant.pending({ id: 21 }), null, 'an authorization is tied to the exact email');
  assert.equal(h.db.prepare('SELECT public.admin_grant_verify(?, 21, ?, \'\') AS s').get(id2, codeHash(id2, h.lastCode(), ENV)).s, 'email_changed');
  assert.equal(h.isAdmin(21), false);
});

test('no email transport means no code and no grant', async () => {
  const h = setup(); h.authorize();
  const g = createAdminGrant({ db: h.db, env: {}, fetchEmail: async () => assert.fail('should not send') });
  assert.equal((await g.sendCode(ctx, { id: 21 })).reason, 'not_configured');
  assert.equal(g.verify(ctx, { id: 21 }, '12345678').reason, 'not_configured');
  assert.equal(h.isAdmin(21), false);
});

test('no route can create an authorization; the app only calls set_code and verify', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../routes/admin-access.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../lib/admin-grant.js'), 'utf8');
  assert.doesNotMatch(routes, /admin_grant_authorize|INSERT INTO public\.admin_accounts|admin_accounts \(/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../lib/admin.js'), 'utf8'), /admin_grant/, 'permission check unchanged');
});
