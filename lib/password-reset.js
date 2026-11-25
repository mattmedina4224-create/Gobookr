'use strict';

// Password-reset email delivery with a database-backed rate limit (works across serverless instances).
// Never logs tokens, links, passwords, recipient addresses, or provider secrets.

const crypto = require('node:crypto');

const DEFAULT_FROM = 'GoBookr <admin@gobookr.com>';
const LIMITS = {
  emailCooldownSeconds: 60,   // one email per address per minute
  emailPerHour: 3,            // and at most three per hour
  clientPerHour: 10,          // per client (hashed IP) across all addresses
};

function configured(env = process.env) {
  return Boolean(env.RESEND_API_KEY);
}

function senderFor(env = process.env) {
  return String(env.PASSWORD_RESET_EMAIL_FROM || DEFAULT_FROM);
}

function baseUrl(env = process.env) {
  const raw = String(env.APP_URL || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(raw) ? raw : 'https://gobookr.com';
}

const keyHash = (kind, value) => crypto.createHash('sha256').update(`pw-reset:${kind}:${value}`).digest('hex');

function resetEmail(link) {
  const safe = String(link).replace(/[<>"']/g, '');
  return {
    subject: 'Reset your GoBookr password',
    text: `We received a request to reset the password for your GoBookr account.\n\nChoose a new password here (this link works once and expires in 1 hour):\n${safe}\n\nIf you did not request this, you can ignore this email. Your password will not change.`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your GoBookr password</title></head><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#101828"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px"><tr><td style="padding:36px 28px"><p style="font-size:26px;font-weight:700;margin:0 0 28px">GoBookr</p><h1 style="font-size:24px;line-height:1.25;margin:0 0 12px">Reset your password</h1><p style="color:#475467;line-height:1.6;margin:0 0 24px">We received a request to reset the password for your GoBookr account. This link works once and expires in 1 hour.</p><p style="margin:0 0 28px"><a href="${safe}" style="display:inline-block;background:#6558F5;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700">Choose a new password</a></p><p style="color:#475467;font-size:13px;line-height:1.5;margin:0 0 8px">Or paste this link into your browser:</p><p style="font-size:13px;word-break:break-all;margin:0 0 28px"><a href="${safe}" style="color:#6558F5">${safe}</a></p><hr style="border:0;border-top:1px solid #e5e7eb"><p style="font-size:13px;color:#475467;line-height:1.5">Didn’t request this? You can ignore this email. Your password will not change.</p></td></tr></table></td></tr></table></body></html>`,
  };
}

// Records the attempt and returns true when this request is within limits. Every request counts,
// whether or not an account exists, so the limit itself reveals nothing.
function reserve(db, emailKey, clientKey) {
  const limited = db.prepare(`WITH fresh_read AS (SELECT 1) SELECT
      (SELECT count(*) FROM password_reset_requests WHERE key_hash = ? AND requested_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') AS email_hour,
      (SELECT count(*) FROM password_reset_requests WHERE key_hash = ? AND requested_at > CURRENT_TIMESTAMP - INTERVAL '${LIMITS.emailCooldownSeconds} seconds') AS email_recent,
      (SELECT count(*) FROM password_reset_requests WHERE key_hash = ? AND requested_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') AS client_hour`).get(emailKey, emailKey, clientKey);
  db.prepare('INSERT INTO password_reset_requests (key_hash) VALUES (?), (?)').run(emailKey, clientKey);
  db.prepare("DELETE FROM password_reset_requests WHERE requested_at < CURRENT_TIMESTAMP - INTERVAL '1 day'").run();
  return Number(limited.email_hour) < LIMITS.emailPerHour && Number(limited.email_recent) === 0 && Number(limited.client_hour) < LIMITS.clientPerHour;
}

function createPasswordReset({ db, env = process.env, fetchEmail = fetch, tokenHash }) {
  async function request(email, clientId) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || normalized.length > 320) return { status: 'ignored' };
    if (!reserve(db, keyHash('email', normalized), keyHash('client', String(clientId || 'unknown')))) return { status: 'limited' };
    const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(normalized);
    if (!user) return { status: 'no_account' };
    if (!configured(env)) { console.error('[password-reset] email delivery is not configured (RESEND_API_KEY missing)'); return { status: 'unavailable' }; }

    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
    const rawToken = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')").run(user.id, tokenHash(rawToken));
    const link = `${baseUrl(env)}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const api = /^http:\/\/127\.0\.0\.1:\d+$/.test(String(env.PASSWORD_RESET_EMAIL_API_BASE || '')) ? env.PASSWORD_RESET_EMAIL_API_BASE : 'https://api.resend.com';
    try {
      const response = await fetchEmail(`${api}/emails`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pw-reset-${tokenHash(rawToken).slice(0, 32)}` },
        body: JSON.stringify({ from: senderFor(env), to: [user.email], ...resetEmail(link) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.id) {
        // Status and provider error type only (e.g. 403 validation_error for an unverified sender domain).
        console.error('[password-reset] delivery rejected', JSON.stringify({ status: response.status, name: String(payload.name || '').slice(0, 60), message: String(payload.message || '').replace(/[^\w .:@-]/g, '').slice(0, 160) }));
        throw new Error('not accepted');
      }
      console.log('[password-reset] delivered', JSON.stringify({ user_id: user.id, provider_id: String(payload.id).slice(0, 64) }));
      return { status: 'sent' };
    } catch (err) {
      db.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash(rawToken));
      if (err && err.message !== 'not accepted') console.error('[password-reset] delivery failed', String(err && err.name || 'Error'));
      return { status: 'failed' };
    }
  }
  return { request };
}

module.exports = { createPasswordReset, configured, senderFor, resetEmail, LIMITS };
