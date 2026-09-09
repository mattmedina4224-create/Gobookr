'use strict';

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

function passwordField({ minlength = '' } = {}) {
  const min = minlength ? ` minlength="${minlength}"` : '';
  return `<div class="field"><label for="password">Password</label><div style="position:relative;"><input id="password" type="password" name="password"${min} required style="padding-right:48px;"/><button type="button" class="password-toggle" aria-label="Show password" aria-pressed="false" onclick="const input=this.previousElementSibling; const showing=input.type==='text'; input.type=showing?'password':'text'; this.setAttribute('aria-label',showing?'Show password':'Hide password'); this.setAttribute('aria-pressed',String(!showing)); this.querySelector('.eye-open').style.display=showing?'block':'none'; this.querySelector('.eye-off').style.display=showing?'none':'block';" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;padding:6px;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:center;">
    <svg class="eye-open" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
    <svg class="eye-off" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none;"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0112 4c6.5 0 10 8 10 8a18 18 0 01-2.1 3.2"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a9.7 9.7 0 005.4-1.6"/></svg>
  </button></div></div>`;
}

module.exports = function (router) {
  require('./onboarding')(router);

  router.get('/login', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, ctx.currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
    const next = ctx.query.next || '';
    const body = `<section class="section container" style="max-width:560px;"><div class="panel"><h1>Log in</h1><p class="muted">Welcome back to GoBookr.</p><form method="POST" action="/login"><input type="hidden" name="next" value="${escapeHtml(next)}"/><div class="field"><label>Email</label><input type="email" name="email" required/></div>${passwordField()}<button class="btn block" type="submit">Log in</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Log in', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/login', async (ctx) => {
    const email = String(ctx.body.email || '').trim().toLowerCase(); const password = String(ctx.body.password || ''); const next = String(ctx.body.next || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) return redirect(ctx.res, '/login?error=' + encodeURIComponent('Invalid email or password.'));
    const token = createSession(user.id); setSessionCookie(ctx.res, token);
    if (next && next.startsWith('/')) return redirect(ctx.res, next);
    redirect(ctx.res, user.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
  });

  router.get('/signup', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, '/');
    const role = ctx.query.role === 'pro' ? 'pro' : 'customer';
    const categoryOptions = PRO_CATEGORIES.map((item) => `<label style="display:flex; align-items:center; gap:9px; padding:11px 13px; border:1px solid var(--paper-line); border-radius:12px; cursor:pointer;"><input type="checkbox" name="category_${item.value}" value="1" style="width:18px; height:18px; margin:0;" /><span style="font-weight:700;">${item.label}</span></label>`).join('');
    const proFields = role === 'pro' ? `<div class="field" style="margin-bottom:22px;"><label for="business_name">Business name</label><input id="business_name" name="business_name" required/><div class="helptext" style="display:block; position:static; margin-top:8px; line-height:1.4;">Your personal or professional business name.</div></div><div class="field"><label>Services you offer</label><div class="helptext" style="margin-bottom:10px;">Select all that apply. You can be listed in more than one category.</div><div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px;">${categoryOptions}</div></div><div style="margin:24px 0 12px;"><h3 style="margin-bottom:4px;">Where do you work?</h3><p class="muted" style="margin:0;">Your address is used to calculate distance for nearby customers.</p></div><div class="field"><label for="workplace_name">Business / workplace name</label><input id="workplace_name" name="workplace_name" placeholder="e.g. Main Street Salon" required/></div><div class="field"><label for="street_address">Street address</label><input id="street_address" name="street_address" placeholder="e.g. 123 Main St" autocomplete="street-address" required/></div><div class="field"><label for="suite">Suite / Unit <span class="muted">(optional)</span></label><input id="suite" name="suite" placeholder="e.g. #100"/></div><div class="field-row"><div class="field"><label for="city">City</label><input id="city" name="city" placeholder="Denver" autocomplete="address-level2" required/></div><div class="field"><label for="state">State</label><input id="state" name="state" value="CO" maxlength="2" autocomplete="address-level1" required/></div></div><div class="field"><label for="zip_code">ZIP code</label><input id="zip_code" name="zip_code" inputmode="numeric" autocomplete="postal-code" maxlength="10" required/></div><div class="helptext" style="margin-top:-6px; margin-bottom:18px;">We use this address to place your business on GoBookr and calculate mileage. Customers still see your city and state on search cards.</div>` : '';
    const body = `<section class="section container" style="max-width:620px;"><div class="panel"><h1>${role === 'pro' ? 'Join GoBookr as a professional' : 'Create your account'}</h1><form method="POST" action="/signup"><input type="hidden" name="role" value="${role}"/><div class="field"><label>Your name</label><input name="name" required/></div><div class="field"><label>Email</label><input type="email" name="email" required/></div>${passwordField({ minlength: 6 })}${proFields}<button class="btn block" type="submit">Create account</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Sign up', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/signup', async (ctx) => {
    const name = String(ctx.body.name || '').trim(); const email = String(ctx.body.email || '').trim().toLowerCase(); const password = String(ctx.body.password || ''); const role = ctx.body.role === 'pro' ? 'pro' : 'customer';
    if (!name || !email || password.length < 6) return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('Please complete all required fields.'));
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('An account with that email already exists.'));
    const categories = role === 'pro' ? selectedCategories(ctx.body) : [];
    if (role === 'pro') {
      const required = ['business_name', 'workplace_name', 'street_address', 'city', 'state', 'zip_code'];
      if (required.some((key) => !String(ctx.body[key] || '').trim())) return redirect(ctx.res, '/signup?role=pro&error=' + encodeURIComponent('Please complete your business and workplace address.'));
      if (!categories.length) return redirect(ctx.res, '/signup?role=pro&error=' + encodeURIComponent('Select at least one service you offer.'));
    }
    const result = db.prepare('INSERT INTO users (email,password_hash,role,name,phone) VALUES (?,?,?,?,?)').run(email, hashPassword(password), role, name, ''); const userId = result.lastInsertRowid;
    if (role === 'pro') {
      const businessName = String(ctx.body.business_name || '').trim(); const legacyCategory = categories.find((category) => ['barber', 'stylist', 'colorist'].includes(category)) || 'barber'; const city = String(ctx.body.city || '').trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); const state = String(ctx.body.state || '').trim().toUpperCase(); const workplace = String(ctx.body.workplace_name || '').trim(); const street = String(ctx.body.street_address || '').trim(); const suite = String(ctx.body.suite || '').trim(); const zip = String(ctx.body.zip_code || '').trim();
      const coordinates = await geocodeBusinessAddress({ street, city, state, zip });
      const profileResult = db.prepare(`INSERT INTO pro_profiles (user_id,business_name,category,bio,city,state,workplace_name,street_address,suite,zip_code,latitude,longitude,price_min,price_max,years_experience,accent,initials) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(userId,businessName || name,legacyCategory,'',city,state,workplace,street,suite,zip,coordinates ? coordinates.latitude : null,coordinates ? coordinates.longitude : null,0,0,0,'violet',initialsFrom(businessName || name));
      const proId = profileResult.lastInsertRowid; const addCategory = db.prepare('INSERT OR IGNORE INTO pro_categories (pro_id, category) VALUES (?, ?)'); for (const category of categories) addCategory.run(proId, category);
    }
    const token = createSession(userId); setSessionCookie(ctx.res, token); redirect(ctx.res, role === 'pro' ? '/dashboard/pro/onboarding' : '/dashboard/customer');
  });

  router.post('/logout', async (ctx) => {
    const cookie = String(ctx.req.headers.cookie || ''); const match = cookie.match(/(?:^|;\s*)gobookr_session=([^;]+)/); if (match) destroySession(decodeURIComponent(match[1])); clearSessionCookie(ctx.res); redirect(ctx.res, '/');
  });
};
