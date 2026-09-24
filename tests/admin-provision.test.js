'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { provisionAdmin } = require('../scripts/provision-admin');

// Optional isolated PostgreSQL runtime, installed outside the repository.
// GOBOOKR_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node --test tests/*.test.js
const runtime = process.env.GOBOOKR_PGLITE_MODULE;

test('provisioning refuses missing confirmation and malformed identities before querying', async () => {
  const client = { query() { assert.fail('Invalid request reached database'); } };
  await assert.rejects(provisionAdmin(client, { action: 'grant', userId: '1', email: 'owner@example.test' }), /confirm-owner-verified/);
  for (const userId of ['0', '-1', '1x', '9007199254740992']) {
    await assert.rejects(provisionAdmin(client, { action: 'grant', userId, email: 'owner@example.test', ownerVerified: true }), /positive user ID/);
  }
});

test('migration, grants, session invalidation, revocation and rollback in isolated Postgres', { skip: !runtime }, async () => {
  const { PGlite } = require(runtime);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, google_sub TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id BIGINT REFERENCES users(id), expires_at TIMESTAMPTZ);
      CREATE ROLE anon; CREATE ROLE authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      INSERT INTO users VALUES (1, 'owner@example.test', 'Owner', 'pro', NULL), (2, 'other@example.test', 'Other', 'customer', NULL);
      INSERT INTO sessions VALUES ('old', 1, CURRENT_TIMESTAMP + INTERVAL '1 day');`);
    const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20260924050440_admin_accounts.sql'), 'utf8');
    await db.exec(migration);
    const grants = async () => (await db.query('SELECT * FROM admin_accounts')).rows;
    assert.equal((await grants()).length, 0);
    const options = { action: 'grant', userId: '1', email: 'owner@example.test', ownerVerified: true };
    await provisionAdmin(db, { ...options, action: 'inspect' });
    assert.equal((await grants()).length, 0);
    await assert.rejects(provisionAdmin(db, { ...options, email: 'wrong@example.test' }), /No exact/);
    assert.equal((await grants()).length, 0);
    await provisionAdmin(db, options);
    const first = await grants();
    assert.equal(first.length, 1);
    assert.equal((await db.query('SELECT * FROM sessions')).rows.length, 0);
    await provisionAdmin(db, options);
    assert.deepEqual(await grants(), first);
    assert.deepEqual((await db.query('SELECT role FROM users ORDER BY id')).rows.map(u => u.role), ['pro', 'customer']);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('INSERT INTO admin_accounts (user_id) VALUES (2)'), /permission denied/);
      await assert.rejects(db.query('SELECT * FROM admin_accounts'), /permission denied/);
      await assert.rejects(db.query('UPDATE admin_accounts SET user_id = 2'), /permission denied/);
      await assert.rejects(db.query('DELETE FROM admin_accounts'), /permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec("INSERT INTO sessions VALUES ('new', 1, CURRENT_TIMESTAMP + INTERVAL '1 day')");
    // Run the authorization helper's actual SQL against Postgres, including
    // expired/wrong-user sessions. Route tests separately exercise HTTP behavior.
    let accessSql;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/admin.js'), 'utf8'), {
      module,
      require(id) {
        if (id === '../db') return { prepare(sql) { accessSql = sql; return { get() { return { user_id: 1 }; } }; } };
        if (id === './http') return { redirect() {}, send() {} };
        throw new Error(`Unexpected dependency: ${id}`);
      },
    });
    module.exports.requireAdmin({ currentUser: { id: 1 }, session: { token: 'new' } });
    let parameter = 0;
    accessSql = accessSql.replace(/\?/g, () => `$${++parameter}`);
    assert.equal((await db.query(accessSql, [1, 'new'])).rows.length, 1);
    assert.equal((await db.query(accessSql, [2, 'new'])).rows.length, 0);
    assert.equal((await db.query(accessSql, [1, 'old'])).rows.length, 0);
    await db.exec("UPDATE sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");
    assert.equal((await db.query(accessSql, [1, 'new'])).rows.length, 0);
    await provisionAdmin(db, { ...options, action: 'revoke' });
    assert.equal((await grants()).length, 0);
    assert.equal((await db.query('SELECT * FROM sessions')).rows.length, 0);
    const failingClient = { query(sql, args) {
      if (sql.startsWith('DELETE FROM public.sessions')) throw new Error('Simulated session deletion failure');
      return db.query(sql, args);
    } };
    await assert.rejects(provisionAdmin(failingClient, options), /Simulated/);
    assert.equal((await grants()).length, 0, 'failed provisioning must roll back grant');
  } finally { await db.close(); }
});
