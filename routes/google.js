'use strict';

const db = require('../db');
const { createSession, setSessionCookie } = require('../lib/auth');
const { redirect } = require('../lib/http');

async function verifyGoogleCredential(credential) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('Google sign-in is not configured.');
  if (!credential) throw new Error('Missing Google credential.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Google could not verify this sign-in.');
    const payload = await response.json();

    if (String(payload.aud || '') !== clientId) throw new Error('Google credential was issued for another app.');
    if (String(payload.email_verified || '') !== 'true') throw new Error('Google email is not verified.');
    const exp = Number(payload.exp || 0);
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) throw new Error('Google credential has expired.');

    const email = String(payload.email || '').trim().toLowerCase();
    const sub = String(payload.sub || '').trim();
    const name = String(payload.name || '').trim();
    if (!email || !sub) throw new Error('Google did not return a usable account.');
    return { email, sub, name };
  } finally {
    clearTimeout(timeout);
  }
}

function safeLocalPath(value) {
  const path = String(value || '');
  return path.startsWith('/') && !path.startsWith('//') ? path : '';
}

module.exports = function (router) {
  router.post('/auth/google', async (ctx) => {
    const credential = String(ctx.body.credential || ctx.body.google_credential || '');
    const next = safeLocalPath(ctx.body.next);
    const role = ctx.body.role === 'pro' ? 'pro' : 'customer';

    let google;
    try {
      google = await verifyGoogleCredential(credential);
    } catch (err) {
      return redirect(ctx.res, '/login?error=' + encodeURIComponent(err && err.message ? err.message : 'Google sign-in failed.'));
    }

    let user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(google.sub);
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(google.email);
      if (user) {
        db.prepare("UPDATE users SET google_sub = ?, auth_provider = CASE WHEN auth_provider = 'password' THEN 'password+google' ELSE auth_provider END WHERE id = ?")
          .run(google.sub, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }

    if (!user) {
      const params = new URLSearchParams({
        role,
        error: 'Google verified your account, but new-account Google signup is not enabled yet. Create your GoBookr account here, then Google sign-in can be linked later.',
      });
      return redirect(ctx.res, '/signup?' + params.toString());
    }

    const token = createSession(user.id);
    setSessionCookie(ctx.res, token);
    if (next) return redirect(ctx.res, next);
    return redirect(ctx.res, user.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
  });
};
