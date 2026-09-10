'use strict';

const crypto = require('node:crypto');
const db = require('../db');
const { layout } = require('../lib/layout');
const { redirect, send, flashFromQuery } = require('../lib/http');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
} = require('../lib/auth');
const { escapeHtml, initialsFrom } = require('../lib/util');

const PRO_CATEGORIES = [
  { value: 'barber', label: 'Barber' },
  { value: 'stylist', label: 'Hairstylist' },
  { value: 'colorist', label: 'Colorist' },
  { value: 'nail_technician', label: 'Nail Technician' },
];

async function geocodeBusinessAddress({ street, city, state, zip }) {
  const query = [street, city, state, zip, 'USA'].filter(Boolean).join(', ');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(query);
    const response = await fetch(url, { headers: { 'User-Agent': 'GoBookr/1.0 (business address geocoding)', 'Accept-Language': 'en-US,en;q=0.9' }, signal: controller.signal });
    if (!response.ok) return null;
    const results = await response.json();
    if (!Array.isArray(results) || !results.length) return null;
    const latitude = Number(results[0].lat); const longitude = Number(results[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch { return null; } finally { clearTimeout(timeout); }
}

function selectedCategories(body) {
  return PRO_CATEGORIES.filter((item) => String(body[`category_${item.value}`] || '') === '1').map((item) => item.value);
}

function passwordField({ minlength = '', name = 'password', label = 'Password' } = {}) {
  const min = minlength ? ` minlength="${minlength}"` : '';
  const id = escapeHtml(name);
  return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><div style="position:relative;"><input id="${id}" type="password" name="${id}"${min} required style="padding-right:48px;"/><button type="button" class="password-toggle" aria-label="Show password" aria-pressed="false" onclick="const input=this.previousElementSibling; const showing=input.type==='text'; input.type=showing?'password':'text'; this.setAttribute('aria-label',showing?'Show password':'Hide password'); this.setAttribute('aria-pressed',String(!showing)); this.querySelector('.eye-open').style.display=showing?'block':'none'; this.querySelector('.eye-off').style.display=showing?'none':'block';" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;padding:6px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;">
    <svg class="eye-open" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
    <svg class="eye-off" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none;"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0112 4c6.5 0 10 8 10 8a18 18 0 01-2.1 3.2"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a9.7 9.7 0 005.4-1.6"/></svg>
  </button></div></div>`;
}

function resetTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

module.exports = function (router) {
  require('./onboarding')(router);

  router.get('/login', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, ctx.currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
    const next = ctx.query.next || '';
    const body = `<section class="section container" style="max-width:560px;"><div class="panel"><h1>Log in</h1><p class="muted">Welcome back to GoBookr.</p><form method="POST" action="/login"><input type="hidden" name="next" value="${escapeHtml(next)}"/><div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required/></div>${passwordField()}<div style="display:flex;justify-content:flex-end;margin:-4px 0 16px;"><a href="/forgot-password">Forgot password?</a></div><button class="btn block" type="submit">Log in</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Log in', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/login', async (ctx) => {
    const email = String(ctx.body.email || '').trim().toLowerCase(); const password = String(ctx.body.password || ''); const next = String(ctx.body.next || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) return redirect(ctx.res, '/login?error=' + encodeURIComponent('Invalid email or password.'));
    const token = createSession(user.id); setSessionCookie(ctx.res, token);
    if (next && next.startsWith('/') && !next.startsWith('//')) return redirect(ctx.res, next);
    redirect(ctx.res, user.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
  });

  router.get('/forgot-password', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, ctx.currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
    const body = `<section class="section container" style="max-width:560px;"><div class="panel"><h1>Reset your password</h1><p class="muted">Enter the email address on your GoBookr account. If an account exists, we'll send password reset instructions.</p><form method="POST" action="/forgot-password"><div class="field"><label for="reset_email">Email</label><input id="reset_email" type="email" name="email" autocomplete="email" required/></div><button class="btn block" type="submit">Send reset instructions</button></form><p class="helptext" style="margin-top:16px;"><a href="/login">Back to log in</a></p></div></section>`;
    send(ctx.res, layout({ title: 'Forgot password', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/forgot-password', async (ctx) => {
    const email = String(ctx.body.email || '').trim().toLowerCase();
    db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= datetime('now') OR used_at IS NOT NULL").run();
    const user = email ? db.prepare('SELECT id FROM users WHERE email = ?').get(email) : null;
    if (user) {
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = resetTokenHash(rawToken);
      db.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now','+1 hour'))").run(user.id, tokenHash);
      const resetPath = '/reset-password?token=' + encodeURIComponent(rawToken);
      if (process.env.NODE_ENV !== 'production') console.log('[GoBookr password reset]', resetPath);
      // Production email delivery will send resetPath through the configured email provider.
    }
    redirect(ctx.res, '/forgot-password?success=' + encodeURIComponent("If an account exists for that email, we've sent password reset instructions."));
  });

  router.get('/reset-password', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, ctx.currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
    const token = String(ctx.query.token || '');
    const record = token ? db.prepare("SELECT id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')").get(resetTokenHash(token)) : null;
    if (!record) return redirect(ctx.res, '/forgot-password?error=' + encodeURIComponent('That password reset link is invalid or has expired. Please request a new one.'));
    const body = `<section class="section container" style="max-width:560px;"><div class="panel"><h1>Choose a new password</h1><p class="muted">Use at least 8 characters.</p><form method="POST" action="/reset-password"><input type="hidden" name="token" value="${escapeHtml(token)}"/>${passwordField({ minlength: 8, name: 'password', label: 'New password' })}${passwordField({ minlength: 8, name: 'confirm_password', label: 'Confirm new password' })}<button class="btn block" type="submit">Update password</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Reset password', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/reset-password', async (ctx) => {
    const token = String(ctx.body.token || '');
    const password = String(ctx.body.password || '');
    const confirmPassword = String(ctx.body.confirm_password || '');
    if (password.length < 8) return redirect(ctx.res, '/reset-password?token=' + encodeURIComponent(token) + '&error=' + encodeURIComponent('Password must be at least 8 characters.'));
    if (password !== confirmPassword) return redirect(ctx.res, '/reset-password?token=' + encodeURIComponent(token) + '&error=' + encodeURIComponent('Passwords do not match.'));
    const tokenHash = resetTokenHash(token);
    const record = db.prepare("SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')").get(tokenHash);
    if (!record) return redirect(ctx.res, '/forgot-password?error=' + encodeURIComponent('That password reset link is invalid or has expired. Please request a new one.'));
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), record.user_id);
      db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(record.id);
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?').run(record.user_id, record.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(record.user_id);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Password reset failed', err);
      return redirect(ctx.res, '/forgot-password?error=' + encodeURIComponent('We could not reset your password. Please try again.'));
    }
    redirect(ctx.res, '/login?success=' + encodeURIComponent('Password updated. You can log in with your new password.'));
  });

  router.get('/signup', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, '/');
    const role = ctx.query.role === 'pro' ? 'pro' : 'customer';
    const categoryOptions = PRO_CATEGORIES.map((item) => `<label style="display:flex; align-items:center; gap:9px; padding:11px 13px; border:1px solid var(--paper-line); border-radius:12px; cursor:pointer;"><input type="checkbox" name="category_${item.value}" value="1" style="width:18px; height:18px; margin:0;" /><span style="font-weight:700;">${item.label}</span></label>`).join('');
    const proFields = role === 'pro' ? `<div class="field" style="margin-bottom:22px;"><label for="business_name">Business name</label><input id="business_name" name="business_name" required/><div class="helptext" style="display:block; position:static; margin-top:8px; line-height:1.4;">Your personal or professional business name.</div></div><div class="field"><label>Services you offer</label><div class="helptext" style="margin-bottom:10px;">Select all that apply. You can be listed in more than one category.</div><div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">${categoryOptions}</div></div><div style="margin:24px 0 12px;"><h3 style="margin-bottom:4px;">Where do you work?</h3><p class="muted" style="margin:0;">Your address is used to calculate distance for nearby customers.</p></div><div class="field"><label for="workplace_name">Business / workplace name</label><input id="workplace_name" name="workplace_name" placeholder="e.g. Main Street Salon" required/></div><div class="field"><label for="street_address">Street address</label><input id="street_address" name="street_address" placeholder="e.g. 123 Main St" autocomplete="street-address" required/></div><div class="field"><label for="suite">Suite / Unit <span class="muted">(optional)</span></label><input id="suite" name="suite" placeholder="e.g. #100"/></div><div class="field-row"><div class="field"><label for="city">City</label><input id="city" name="city" placeholder="Denver" autocomplete="address-level2" required/></div><div class="field"><label for="state">State</label><input id="state" name="state" value="CO" maxlength="2" pattern="[A-Za-z]{2}" autocomplete="address-level1" required/></div></div><div class="field"><label for="zip_code">ZIP code</label><input id="zip_code" name="zip_code" inputmode="numeric" autocomplete="postal-code" maxlength="10" pattern="[0-9]{5}(-[0-9]{4})?" required/></div><div class="helptext" style="margin-top:-6px; margin-bottom:18px;">We use this address to place your business on GoBookr and calculate mileage. Customers still see your city and state on search cards.</div><div class="panel" style="margin:20px 0; background:var(--paper-soft);"><strong>30 days free</strong><p class="muted" style="margin:5px 0 0;">Professional membership is $15/month after your 30-day free trial. Cancel anytime.</p></div>` : '';
    const legalAgreement = `<label style="display:flex;align-items:flex-start;gap:9px;margin:18px 0;font-size:14px;"><input type="checkbox" name="legal_agreement" value="1" required style="width:18px;height:18px;margin-top:2px;flex:0 0 auto;"/><span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>`;
    const signupFaviconFix = `<script>(function(){var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="%231e2a4a"/><rect x="9" y="10" width="22" height="21" rx="3" fill="white"/><rect x="13.5" y="6" width="2.6" height="7" rx="1.3" fill="white"/><rect x="23.9" y="6" width="2.6" height="7" rx="1.3" fill="white"/><rect x="9" y="15.5" width="22" height="2.6" fill="%231e2a4a"/><circle cx="20" cy="24.5" r="2.8" fill="%231e2a4a"/></svg>';var href='data:image/svg+xml,'+svg;document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function(n){n.remove();});var l=document.createElement('link');l.rel='icon';l.type='image/svg+xml';l.href=href;document.head.appendChild(l);})();</script>`;
    const body = `${signupFaviconFix}<section class="section container" style="max-width:620px;"><div class="panel"><h1>${role === 'pro' ? 'Join GoBookr as a professional' : 'Create your account'}</h1><form method="POST" action="/signup"><input type="hidden" name="role" value="${role}"/><div class="field"><label>Your name</label><input name="name" autocomplete="name" required/></div><div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required/></div>${passwordField({ minlength: 8 })}<div class="helptext" style="margin-top:-10px;margin-bottom:14px;">Use at least 8 characters.</div>${proFields}${legalAgreement}<button class="btn block" type="submit">${role === 'pro' ? 'Start 30-day free trial' : 'Create account'}</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Sign up', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/signup', async (ctx) => {
    const name = String(ctx.body.name || '').trim();
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const role = ctx.body.role === 'pro' ? 'pro' : 'customer';
    if (!name || !validEmail(email) || password.length < 8) return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('Enter a valid name and email, and use a password with at least 8 characters.'));
    if (String(ctx.body.legal_agreement || '') !== '1') return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('Please agree to the Terms of Service and Privacy Policy.'));
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('An account with that email already exists.'));

    const categories = role === 'pro' ? selectedCategories(ctx.body) : [];
    let businessName = '';
    let city = '';
    let state = '';
    let workplace = '';
    let street = '';
    let suite = '';
    let zip = '';
    let coordinates = null;

    if (role === 'pro') {
      businessName = String(ctx.body.business_name || '').trim();
      city = String(ctx.body.city || '').trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
      state = String(ctx.body.state || '').trim().toUpperCase();
      workplace = String(ctx.body.workplace_name || '').trim();
      street = String(ctx.body.street_address || '').trim();
      suite = String(ctx.body.suite || '').trim();
      zip = String(ctx.body.zip_code || '').trim();
      if (!businessName || !workplace || !street || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(?:-\d{4})?$/.test(zip)) {
        return redirect(ctx.res, '/signup?role=pro&error=' + encodeURIComponent('Please complete a valid business and workplace address.'));
      }
      if (!categories.length) return redirect(ctx.res, '/signup?role=pro&error=' + encodeURIComponent('Select at least one service you offer.'));
      coordinates = await geocodeBusinessAddress({ street, city, state, zip });
    }

    let userId;
    try {
      db.exec('BEGIN IMMEDIATE');
      const result = db.prepare('INSERT INTO users (email,password_hash,role,name,phone) VALUES (?,?,?,?,?)').run(email, hashPassword(password), role, name, '');
      userId = result.lastInsertRowid;
      if (role === 'pro') {
        const legacyCategory = categories.find((category) => ['barber', 'stylist', 'colorist'].includes(category)) || 'barber';
        const profileResult = db.prepare(`INSERT INTO pro_profiles (user_id,business_name,category,bio,city,state,workplace_name,street_address,suite,zip_code,latitude,longitude,price_min,price_max,years_experience,accent,initials) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(userId,businessName,legacyCategory,'',city,state,workplace,street,suite,zip,coordinates ? coordinates.latitude : null,coordinates ? coordinates.longitude : null,0,0,0,'violet',initialsFrom(businessName || name));
        const proId = profileResult.lastInsertRowid;
        const addCategory = db.prepare('INSERT OR IGNORE INTO pro_categories (pro_id, category) VALUES (?, ?)');
        for (const category of categories) addCategory.run(proId, category);
        db.prepare(`INSERT OR IGNORE INTO subscriptions (pro_id, status, trial_started_at, trial_ends_at) VALUES (?, 'trialing', datetime('now'), datetime('now','+30 days'))`).run(proId);
      }
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Signup failed', err);
      const message = String(err && err.message || '').toLowerCase().includes('unique') ? 'An account with that email already exists.' : 'We could not create your account. Please try again.';
      return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent(message));
    }

    const token = createSession(userId);
    setSessionCookie(ctx.res, token);
    redirect(ctx.res, role === 'pro' ? '/dashboard/pro/onboarding' : '/dashboard/customer');
  });

  router.post('/logout', async (ctx) => {
    const cookie = String(ctx.req.headers.cookie || ''); const match = cookie.match(/(?:^|;\s*)gobookr_session=([^;]+)/); if (match) destroySession(decodeURIComponent(match[1])); clearSessionCookie(ctx.res); redirect(ctx.res, '/');
  });
};
