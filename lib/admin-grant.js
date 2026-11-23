'use strict';
// Application side of one-time administrator provisioning (see db/migrations/20261123_admin_grant_verification.sql).
// The app can only (a) show a signed-in user an authorization the project owner already created for exactly that
// account, (b) email that account a one-time code, and (c) submit the code. All checks and the grant itself happen
// inside the database functions, in one transaction.
const crypto = require('node:crypto');

const FRESH = 'WITH fresh_read AS (SELECT 1) ';

function configured(env = process.env) {
  return Boolean(env.RESEND_API_KEY && (env.ADMIN_GRANT_EMAIL_FROM || env.PROFILE_EMAIL_FROM) && String(env.ADMIN_GRANT_SECRET || '').length >= 32);
}
function codeHash(requestId, code, env = process.env) {
  return crypto.createHmac('sha256', String(env.ADMIN_GRANT_SECRET)).update(`admin-grant:${requestId}:${code}`).digest('hex');
}
function newCode() { return String(crypto.randomInt(0, 100000000)).padStart(8, '0'); }
const clientTag = (ctx) => crypto.createHash('sha256').update(String((ctx.req.headers['x-forwarded-for'] || '').split(',')[0].trim() || ctx.req.socket?.remoteAddress || '') + '|' + String(ctx.req.headers['user-agent'] || '')).digest('hex').slice(0, 16);

function createAdminGrant({ db, env = process.env, fetchEmail = fetch }) {
  // Open, owner-authorized request for exactly this signed-in account (or null).
  function pending(user) {
    if (!user) return null;
    return db.prepare(FRESH + `SELECT r.id, r.email, r.owner_approver, r.authorized_at, r.expires_at, r.codes_sent, r.last_code_sent_at, r.code_expires_at, r.failed_attempts
      FROM public.admin_grant_requests r JOIN public.users u ON u.id = r.user_id AND u.email = r.email
      WHERE r.user_id = ? AND r.granted_at IS NULL AND r.canceled_at IS NULL AND r.expires_at > CURRENT_TIMESTAMP`).get(user.id) || null;
  }
  async function sendCode(ctx, user) {
    if (!configured(env)) return { ok: false, reason: 'not_configured' };
    const req = pending(user);
    if (!req) return { ok: false, reason: 'not_found' };
    const code = newCode();
    const status = db.prepare('SELECT public.admin_grant_set_code(?, ?, ?, ?) AS status').get(req.id, user.id, codeHash(req.id, code, env), clientTag(ctx)).status;
    if (status !== 'ok') return { ok: false, reason: status };
    const from = env.ADMIN_GRANT_EMAIL_FROM || env.PROFILE_EMAIL_FROM;
    // A local stand-in may be used for automated browser tests (loopback only).
    const api = /^http:\/\/127\.0\.0\.1:\d+$/.test(String(env.ADMIN_GRANT_EMAIL_API_BASE || '')) ? env.ADMIN_GRANT_EMAIL_API_BASE : 'https://api.resend.com';
    const res = await fetchEmail(api + '/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `admin-grant-${req.id}-${req.codes_sent + 1}` },
      body: JSON.stringify({ from, to: [req.email], subject: 'Your GoBookr administrator verification code',
        text: `Your one-time GoBookr administrator verification code is ${code}.\n\nIt expires in 15 minutes. Enter it only on gobookr.com while signed in as ${req.email}.\nIf you did not expect this, do not use the code — nothing is granted without it.`,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'send_failed' };
    return { ok: true, email: req.email };
  }
  function verify(ctx, user, rawCode) {
    const code = String(rawCode || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(code)) return { ok: false, reason: 'format' };
    if (!configured(env)) return { ok: false, reason: 'not_configured' };
    const req = pending(user);
    if (!req) return { ok: false, reason: 'not_found' };
    const status = db.prepare('SELECT public.admin_grant_verify(?, ?, ?, ?) AS status').get(req.id, user.id, codeHash(req.id, code, env), clientTag(ctx)).status;
    return { ok: status === 'granted', reason: status };
  }
  return { pending, sendCode, verify };
}

module.exports = { createAdminGrant, configured, codeHash };
