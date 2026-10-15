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
const { requireClaimProfile } = require('../lib/claims');
const { PROFESSIONAL_CATEGORIES: PRO_CATEGORIES } = require('../lib/pro-categories');

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
  return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><div style="position:relative;"><input id="${id}" type="password" name="${id}"${min} required style="padding-right:48px;"/><button type="button" class="password-toggle" aria-controls="${id}" aria-label="Show password" aria-pressed="false" onclick="const input=document.getElementById(this.getAttribute('aria-controls')); if (!input) return; const showing=input.type==='text'; input.type=showing?'password':'text'; this.setAttribute('aria-label',showing?'Show password':'Hide password'); this.setAttribute('aria-pressed',String(!showing)); this.querySelector('.eye-open').style.display=showing?'block':'none'; this.querySelector('.eye-off').style.display=showing?'none':'block';" style="position:absolute;right:2px;top:50%;width:44px;height:44px;z-index:1;transform:translateY(-50%);border:0;background:transparent;padding:6px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;">
    <svg class="eye-open" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="pointer-events:none;"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
    <svg class="eye-off" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none;pointer-events:none;"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0112 4c6.5 0 10 8 10 8a18 18 0 01-2.1 3.2"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a9.7 9.7 0 005.4-1.6"/></svg>
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
  require('./pro-entry')(router);

  router.get('/login', async (ctx) => {
    const hasClaim = Object.hasOwn(ctx.query, 'claim');
    const claim = hasClaim ? requireClaimProfile(ctx, ctx.query.claim) : null;
    if (hasClaim && !claim) return;
    if (claim && ctx.currentUser) return redirect(ctx.res, `/pro/${claim.id}/claim`);
    if (ctx.currentUser) return redirect(ctx.res, ctx.currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
    const next = ctx.query.next || '';
    const body = `<section class="section container" style="max-width:560px;"><div class="panel"><h1>Log in</h1><p class="muted">Welcome back to GoBookr.</p><form method="POST" action="/login">${claim ? `<input type="hidden" name="claim" value="${claim.id}"/>` : ''}<input type="hidden" name="next" value="${escapeHtml(next)}"/><div class="field"><label for="account_email">Email</label><input id="account_email" type="email" name="email" autocomplete="email" required/></div>${passwordField()}<div style="display:flex;justify-content:flex-end;margin:-4px 0 16px;"><a href="/forgot-password">Forgot password?</a></div><button class="btn block" type="submit">Log in</button></form>${claim ? `<p><a href="/signup?claim=${claim.id}">Create an account to claim this profile</a></p>` : ''}</div></section>`;
    send(ctx.res, layout({ title: 'Log in', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/login', async (ctx) => {
    const hasClaim = Object.hasOwn(ctx.body, 'claim');
    const claim = hasClaim ? requireClaimProfile(ctx, ctx.body.claim) : null;
    if (hasClaim && !claim) return;
    const email = String(ctx.body.email || '').trim().toLowerCase(); const password = String(ctx.body.password || ''); const next = String(ctx.body.next || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) return redirect(ctx.res, `/login?${claim ? `claim=${claim.id}&` : ''}error=` + encodeURIComponent('Invalid email or password.'));
    const token = createSession(user.id); setSessionCookie(ctx.res, token);
    if (claim) return redirect(ctx.res, `/pro/${claim.id}/claim`);
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
    const hasClaim = Object.hasOwn(ctx.query, 'claim');
    const claim = hasClaim ? requireClaimProfile(ctx, ctx.query.claim) : null;
    if (hasClaim && !claim) return;
    if (claim && ctx.currentUser) return redirect(ctx.res, `/pro/${claim.id}/claim`);
    if (ctx.currentUser) return redirect(ctx.res, ctx.query.role === 'pro' ? '/join' : '/');
    const role = claim ? 'customer' : ctx.query.role === 'pro' ? 'pro' : ctx.query.role === 'storefront' ? 'storefront' : 'customer';
    const proFields = role === 'pro' ? '<div class="setup-notice"><strong>Your profile starts as a private draft.</strong><p>Next, we’ll walk through your business details, services, photos, and booking link. Your 30-day free trial starts when you create this account. Membership is $20/month afterward.</p></div><p>Already listed? <a href="/join/individual">Find and claim your profile</a>.</p>' : '';
    const storefrontFields = role === 'storefront' ? `<div class="field"><label for="shop_name">Business name</label><input id="shop_name" name="shop_name" maxlength="160" required/></div><div class="field"><label for="street_address">Street address</label><input id="street_address" name="street_address" maxlength="200" autocomplete="street-address" required/></div><div class="field"><label for="suite">Suite / Unit <span class="muted">(optional)</span></label><input id="suite" name="suite" maxlength="80"/></div><div class="field-row"><div class="field"><label for="city">City</label><input id="city" name="city" maxlength="100" autocomplete="address-level2" required/></div><div class="field"><label for="state">State</label><input id="state" name="state" placeholder="State abbreviation" value="" maxlength="2" pattern="[A-Za-z]{2}" autocomplete="address-level1" required/></div></div><div class="field"><label for="zip_code">ZIP code</label><input id="zip_code" name="zip_code" maxlength="10" pattern="[0-9]{5}(-[0-9]{4})?" autocomplete="postal-code" required/></div><div class="field"><label for="phone">Business phone <span class="muted">(optional)</span></label><input id="phone" name="phone" maxlength="40" autocomplete="tel"/></div><div class="panel" style="margin:20px 0;background:var(--paper-soft);"><strong>Business Account</strong><p class="muted" style="margin:5px 0 0;">Complimentary. Your business page is separate from individual professional profiles.</p></div>` : '';
    const legalAgreement = `<label style="display:flex;align-items:flex-start;gap:9px;margin:18px 0;font-size:14px;"><input type="checkbox" name="legal_agreement" value="1" required style="width:18px;height:18px;margin-top:2px;flex:0 0 auto;"/><span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>`;
    const body = `${role === 'pro' ? '<link rel="stylesheet" href="/pro-setup.css">' : ''}<section class="section container${role === 'pro' ? ' pro-setup' : ''}" style="max-width:620px;"><div class="panel"><h1>${claim ? 'Create an account to claim this profile' : role === 'pro' ? 'Join GoBookr as a professional' : role === 'storefront' ? 'Create your business account' : 'Create your account'}</h1>${claim ? `<p>Continue claiming ${escapeHtml(claim.business_name)}. Ownership and your professional trial begin only after approval.</p>` : ''}<form method="POST" action="/signup">${claim ? `<input type="hidden" name="claim" value="${claim.id}"/>` : ''}<input type="hidden" name="role" value="${role}"/><div class="field"><label for="signup_name">Your name</label><input id="signup_name" name="name" maxlength="120" autocomplete="name" required/></div><div class="field"><label for="account_email">Email</label><input id="account_email" type="email" name="email" autocomplete="email" required/></div>${passwordField({ minlength: 8 })}<div class="helptext" style="margin-top:-10px;margin-bottom:14px;">Use at least 8 characters.</div>${proFields}${storefrontFields}${legalAgreement}<button class="btn block" type="submit">${claim ? 'Create account and continue claim' : role === 'pro' ? 'Create account &amp; continue' : role === 'storefront' ? 'Create business account' : 'Create account'}</button></form>${role === 'pro' ? '<p>Already have an account? <a href="/login?next=%2Fjoin">Sign in and continue</a></p>' : ''}${claim ? `<p>Already have an account? <a href="/login?claim=${claim.id}">Log in to continue your claim</a></p>` : ''}</div></section>`;
    send(ctx.res, layout({ title: 'Sign up', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/signup', async (ctx) => {
    const hasClaim = Object.hasOwn(ctx.body, 'claim');
    const claim = hasClaim ? requireClaimProfile(ctx, ctx.body.claim) : null;
    if (hasClaim && !claim) return;
    const name = String(ctx.body.name || '').trim();
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    // Claimants do not have professional access until ownership is approved.
    const signupType = claim ? 'customer' : ctx.body.role === 'pro' ? 'pro' : ctx.body.role === 'storefront' ? 'storefront' : 'customer';
    const role = signupType === 'pro' ? 'pro' : 'customer';
    const signupUrl = claim ? `/signup?claim=${claim.id}` : `/signup?role=${signupType}`;
    if (!name || !validEmail(email) || password.length < 8) return redirect(ctx.res, `${signupUrl}&error=` + encodeURIComponent('Enter a valid name and email, and use a password with at least 8 characters.'));
    if (String(ctx.body.legal_agreement || '') !== '1') return redirect(ctx.res, `${signupUrl}&error=` + encodeURIComponent('Please agree to the Terms of Service and Privacy Policy.'));
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      const loginUrl = claim ? `/login?claim=${claim.id}&error=` : role === 'pro' ? '/login?next=%2Fjoin&error=' : '/login?error=';
      return redirect(ctx.res, loginUrl + encodeURIComponent('An account with that email already exists. Log in to continue.'));
    }

    const categories = role === 'pro' ? selectedCategories(ctx.body) : [];
    let businessName = '';
    let city = '';
    let state = '';
    let workplace = '';
    let street = '';
    let suite = '';
    let zip = '';
    let coordinates = null;

    if (role === 'pro' && ctx.body.business_name) {
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

    if (signupType === 'storefront') {
      businessName = String(ctx.body.shop_name || '').trim();
      city = String(ctx.body.city || '').trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
      state = String(ctx.body.state || '').trim().toUpperCase();
      street = String(ctx.body.street_address || '').trim();
      suite = String(ctx.body.suite || '').trim();
      zip = String(ctx.body.zip_code || '').trim();
      if (!businessName || !street || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(?:-\d{4})?$/.test(zip)) return redirect(ctx.res, "/signup?role=storefront&error=" + encodeURIComponent("Please complete a valid storefront address."));
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
      if (signupType === 'storefront') {
        const shopResult = db.prepare(`INSERT INTO shops (owner_user_id,name,city,state,street_address,suite,zip_code,phone,claim_status) VALUES (?,?,?,?,?,?,?,?, 'claimed')`).run(userId,businessName,city,state,street,suite,zip,String(ctx.body.phone || '').trim().slice(0,40));
        db.prepare(`INSERT INTO shop_subscriptions (shop_id,status,plan_code) VALUES (?, 'active', 'business_complimentary')`).run(shopResult.lastInsertRowid);
      }
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Signup failed', err);
      const message = String(err && err.message || '').toLowerCase().includes('unique') ? 'An account with that email already exists.' : 'We could not create your account. Please try again.';
      return redirect(ctx.res, `${signupUrl}&error=` + encodeURIComponent(message));
    }

    const token = createSession(userId);
    setSessionCookie(ctx.res, token);
    redirect(ctx.res, claim ? `/pro/${claim.id}/claim` : role === 'pro' ? '/dashboard/pro/onboarding' : signupType === 'storefront' ? (process.env.BUSINESS_TEAMS_ENABLED==='1'?'/dashboard/shop?setup=basics':'/dashboard/shop/billing') : '/dashboard/customer');
  });

  router.post('/logout', async (ctx) => {
    const cookie = String(ctx.req.headers.cookie || ''); const match = cookie.match(/(?:^|;\s*)gobookr_session=([^;]+)/); if (match) destroySession(decodeURIComponent(match[1])); clearSessionCookie(ctx.res); redirect(ctx.res, '/');
  });
};
