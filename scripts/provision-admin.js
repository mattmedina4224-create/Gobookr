'use strict';

// Trusted operator tool only. Never called by an HTTP route.
async function provisionAdmin(client, { action, userId, email, ownerVerified }) {
  if (!['inspect', 'grant', 'revoke'].includes(action) || !/^[1-9]\d*$/.test(String(userId)) ||
      !Number.isSafeInteger(Number(userId)) || typeof email !== 'string' || !email.trim()) {
    throw new Error('Supply inspect|grant|revoke, a positive user ID, and the exact account email.');
  }
  if (action === 'grant' && ownerVerified !== true) throw new Error('Grant requires --confirm-owner-verified. Read docs/admin-access.md first.');
  await client.query('BEGIN');
  try {
    const result = await client.query('SELECT id, email, name, role, google_sub FROM public.users WHERE id = $1 AND email = $2 FOR UPDATE', [userId, email]);
    if (result.rows.length !== 1) throw new Error('No exact user ID/email match; no changes made.');
    const user = result.rows[0];
    if (action === 'grant') {
      await client.query('INSERT INTO public.admin_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    } else if (action === 'revoke') {
      await client.query('DELETE FROM public.admin_accounts WHERE user_id = $1', [userId]);
    }
    if (action !== 'inspect') await client.query('DELETE FROM public.sessions WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
    return { action, id: user.id, email: user.email, name: user.name, role: user.role, googleLinked: Boolean(user.google_sub) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const [action, userId, email, confirmation, ...extra] = process.argv.slice(2);
  if (extra.length || (confirmation && confirmation !== '--confirm-owner-verified')) throw new Error('Unexpected arguments.');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the explicitly selected database.');
  const { Client } = require('pg');
  // Use pg TLS verification defaults; supply a trusted CA when required.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log(JSON.stringify(await provisionAdmin(client, { action, userId, email, ownerVerified: confirmation === '--confirm-owner-verified' }), null, 2));
  } finally {
    await client.end();
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { provisionAdmin };
