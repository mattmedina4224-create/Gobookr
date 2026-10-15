'use strict';

const crypto = require('node:crypto');

// Explicit rollout switch: publishing works normally until delivery is configured.
function configured(env = process.env) {
  return env.PROFILE_EMAIL_CONFIRMATION_ENABLED === '1' && Boolean(env.RESEND_API_KEY && env.PROFILE_EMAIL_FROM && String(env.EMAIL_VERIFICATION_SECRET || '').length >= 32);
}

function confirmationEmail(code) {
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid confirmation code');
  return {
    subject: `${code} is your GoBookr confirmation code`,
    text: `Your GoBookr profile is published!\n\nConfirm your email with this code: ${code}\n\nThis code expires in 10 minutes. Return to https://gobookr.com/dashboard/pro/confirm-email to enter it.\n\nIf you did not request this, ignore this email.`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your GoBookr email</title></head><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#0B1F3A"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:20px"><tr><td align="center" style="padding:36px 24px"><p style="font-size:30px;font-weight:700;margin:0 0 32px">GoBookr<span style="color:#2563EB">.</span></p><h1 style="font-size:28px;line-height:1.2">Your profile is published!</h1><h2 style="font-size:20px">One last step: confirm your email.</h2><p style="color:#596579;line-height:1.6">Enter this 6-digit code on GoBookr to confirm the email for your professional profile.</p><p style="background:#eff6ff;border-radius:12px;padding:22px 8px;font-size:38px;font-weight:700;letter-spacing:6px">${code}</p><p style="color:#596579;font-size:14px">This code expires in 10 minutes.</p><p style="margin:32px 0"><a href="https://gobookr.com/dashboard/pro/confirm-email" style="display:inline-block;background:#2563EB;color:white;text-decoration:none;padding:16px 24px;border-radius:10px;font-weight:700">Return to GoBookr</a></p><hr style="border:0;border-top:1px solid #e5e7eb"><p style="font-size:13px;color:#596579;line-height:1.5">Didn’t request this? You can safely ignore this email.</p><p style="font-size:13px;color:#596579">gobookr.com</p></td></tr></table></td></tr></table></body></html>`,
  };
}

function createConfirmation({ db, env = process.env, fetchEmail = fetch }) {
  const enabled = () => configured(env);
  function identity(userId) {
    return db.prepare(`WITH account AS (SELECT p.id AS pro_id, u.id AS user_id, lower(trim(u.email)) AS email
      FROM users u JOIN pro_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.role = 'pro' AND p.onboarding_completed = 1)
      SELECT * FROM account`).get(userId);
  }
  function state(account) {
    return db.prepare(`WITH confirmation AS (SELECT verified_at, delivered_at, expires_at, attempts, nonce
      FROM profile_email_confirmations WHERE pro_id = ? AND user_id = ? AND email = ?)
      SELECT * FROM confirmation`).get(account.pro_id, account.user_id, account.email);
  }
  function digest(account, nonce, code) {
    return crypto.createHmac('sha256', env.EMAIL_VERIFICATION_SECRET)
      .update(JSON.stringify([String(account.pro_id), String(account.user_id), account.email, nonce, code])).digest('hex');
  }
  async function sendCode(account) {
    if (!enabled()) return { status: 'unavailable' };
    const nonce = crypto.randomBytes(24).toString('hex');
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    // UPSERT serializes competing sends across instances. Cooldown and hourly
    // allowance count failures too, preventing delivery-error retry storms.
    const reserved = db.prepare(`INSERT INTO profile_email_confirmations AS existing
      (pro_id, user_id, email, nonce, code_digest, expires_at, requested_at, window_started_at, requests_in_window)
      SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '10 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
      WHERE EXISTS (SELECT 1 FROM users u JOIN pro_profiles p ON p.user_id = u.id
        WHERE p.id = ? AND u.id = ? AND lower(trim(u.email)) = ? AND u.role = 'pro' AND p.onboarding_completed = 1)
      ON CONFLICT (pro_id) DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email,
        nonce = EXCLUDED.nonce, code_digest = EXCLUDED.code_digest, expires_at = EXCLUDED.expires_at,
        requested_at = CURRENT_TIMESTAMP, delivered_at = NULL, verified_at = NULL, attempts = 0,
        window_started_at = CASE WHEN existing.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN CURRENT_TIMESTAMP ELSE existing.window_started_at END,
        requests_in_window = CASE WHEN existing.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 1 ELSE existing.requests_in_window + 1 END
      WHERE existing.requested_at <= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
        AND (existing.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '1 hour' OR existing.requests_in_window < 5)
        AND (existing.verified_at IS NULL OR existing.email <> EXCLUDED.email OR existing.user_id <> EXCLUDED.user_id)
      RETURNING nonce`).get(account.pro_id, account.user_id, account.email, nonce, digest(account, nonce, code), account.pro_id, account.user_id, account.email);
    if (!reserved) return { status: 'limited' };
    try {
      const response = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `profile-email-${nonce}` },
        body: JSON.stringify({ from: env.PROFILE_EMAIL_FROM, to: [account.email], ...confirmationEmail(code) }),
      });
      if (!response.ok || !(await response.json()).id) throw new Error('Delivery not accepted');
      db.prepare('UPDATE profile_email_confirmations SET delivered_at = CURRENT_TIMESTAMP WHERE pro_id = ? AND nonce = ?').run(account.pro_id, nonce);
      return { status: 'sent' };
    } catch (_) {
      db.prepare('UPDATE profile_email_confirmations SET code_digest = NULL, expires_at = CURRENT_TIMESTAMP WHERE pro_id = ? AND nonce = ?').run(account.pro_id, nonce);
      // Do not log provider responses, recipient addresses, codes, or secrets.
      return { status: 'failed' };
    }
  }
  function verify(account, value) {
    if (!enabled()) return false;
    const current = state(account);
    if (!current || current.verified_at) return false;
    const code = String(value || '').trim().replace(/[\s-]/g, '');
    // Invalid submissions also consume attempts. Never accept a partial code.
    const candidate = digest(account, current.nonce, /^\d{6}$/.test(code) ? code : 'invalid');
    const result = db.prepare(`UPDATE profile_email_confirmations v SET attempts = attempts + 1,
      verified_at = CASE WHEN code_digest = ? THEN CURRENT_TIMESTAMP ELSE NULL END,
      code_digest = CASE WHEN code_digest = ? THEN NULL ELSE code_digest END
      WHERE pro_id = ? AND user_id = ? AND email = ? AND nonce = ? AND verified_at IS NULL
        AND delivered_at IS NOT NULL AND expires_at > CURRENT_TIMESTAMP AND attempts < 5
        AND EXISTS (SELECT 1 FROM users u JOIN pro_profiles p ON p.user_id = u.id
          WHERE p.id = v.pro_id AND u.id = v.user_id AND lower(trim(u.email)) = v.email AND u.role = 'pro' AND p.onboarding_completed = 1)
      RETURNING verified_at`).get(candidate, candidate, account.pro_id, account.user_id, account.email, current.nonce);
    return Boolean(result && result.verified_at);
  }
  return { enabled, identity, state, sendCode, verify };
}

function dashboardConfirmation(profile, user) {
  if (!configured() || !profile.onboarding_completed) return null;
  try {
    const api = createConfirmation({ db: require('../db') });
    const current = api.state({ pro_id: profile.id, user_id: user.id, email: String(user.email || '').trim().toLowerCase() });
    return { confirmed: Boolean(current && current.verified_at) };
  } catch (_) { return null; }
}

module.exports = { configured, confirmationEmail, createConfirmation, dashboardConfirmation };
