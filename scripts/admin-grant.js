'use strict';
// Trusted operator tool for the project owner. Never called by an HTTP route.
//   node scripts/admin-grant.js authorize USER_ID EXACT_EMAIL --approver "Name <email>" [--note "why"]
//   node scripts/admin-grant.js status USER_ID
//   node scripts/admin-grant.js cancel REQUEST_ID --approver "Name <email>"
// "authorize" does not grant anything. The account itself must then verify its email at /account/admin-access.
// The same SQL functions can be called from the Supabase SQL editor by the project owner.

async function run(client, argv) {
  const [action, id, email, ...rest] = argv;
  const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  if (!/^[1-9]\d*$/.test(String(id || ''))) throw new Error('Supply a positive numeric ID.');
  if (action === 'authorize') {
    const approver = flag('--approver');
    if (!email || !approver || approver.trim().length < 3) throw new Error('authorize needs USER_ID EXACT_EMAIL --approver "Name <email>".');
    const r = await client.query('SELECT public.admin_grant_authorize($1, $2, $3, $4) AS request_id', [id, email, approver, flag('--note') || '']);
    return { authorized: true, requestId: r.rows[0].request_id, next: 'Sign in as that account and open /account/admin-access within 24 hours.' };
  }
  if (action === 'status') {
    const r = await client.query(`SELECT id, email, owner_approver, authorized_at, expires_at, codes_sent, failed_attempts, email_verified_at, granted_at, canceled_at, cancel_reason
      FROM public.admin_grant_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 5`, [id]);
    const a = await client.query('SELECT event, actor, created_at FROM public.admin_grant_audit WHERE user_id = $1 ORDER BY id', [id]);
    const g = await client.query('SELECT granted_at FROM public.admin_accounts WHERE user_id = $1', [id]);
    return { admin: g.rows.length === 1, requests: r.rows, audit: a.rows };
  }
  if (action === 'cancel') {
    const approver = flag('--approver') || (email === '--approver' ? rest[0] : undefined);
    if (!approver) throw new Error('cancel needs REQUEST_ID --approver "Name <email>".');
    const r = await client.query('SELECT public.admin_grant_cancel($1, $2) AS status', [id, approver]);
    return { status: r.rows[0].status };
  }
  throw new Error('Use authorize, status or cancel.');
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the explicitly selected database.');
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { console.log(JSON.stringify(await run(client, process.argv.slice(2)), null, 2)); } finally { await client.end(); }
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { run };
