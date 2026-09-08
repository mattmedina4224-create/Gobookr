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

async function geocodeBusinessAddress({ street, city, state, zip }) {
  const query = [street, city, state, zip, 'USA'].filter(Boolean).join(', ');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' +
      encodeURIComponent(query);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GoBookr/1.0 (business address geocoding)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const results = await response.json();
    if (!Array.isArray(results) || !results.length) return null;

    const latitude = Number(results[0].lat);
    const longitude = Number(results[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = function (router) {
  require('./onboarding')(router);

  router.get('/login', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, ctx.currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
    const next = ctx.query.next || '';
    const body = `<section class="section container" style="max-width:560px;"><div class="panel"><h1>Log in</h1><p class="muted">Welcome back to GoBookr.</p><form method="POST" action="/login"><input type="hidden" name="next" value="${escapeHtml(next)}"/><div class="field"><label>Email</label><input type="email" name="email" required/></div><div class="field"><label>Password</label><input type="password" name="password" required/></div><button class="btn block" type="submit">Log in</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Log in', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/login', async (ctx) => {
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const next = String(ctx.body.next || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return redirect(ctx.res, '/login?error=' + encodeURIComponent('Invalid email or password.'));
    }
    const token = createSession(user.id);
    setSessionCookie(ctx.res, token);
    if (next && next.startsWith('/')) return redirect(ctx.res, next);
    redirect(ctx.res, user.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer');
  });

  router.get('/signup', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, '/');
    const role = ctx.query.role === 'pro' ? 'pro' : 'customer';
    const proFields = role === 'pro'
      ? `<div class="field"><label for="business_name">Business name</label><input id="business_name" name="business_name" required/><div class="helptext">Your personal or professional business name.</div></div>
         <div class="field"><label for="category">Service</label><select id="category" name="category" required><option value="barber">Barber</option><option value="stylist">Hairstylist</option><option value="colorist">Colorist</option></select></div>
         <div style="margin:24px 0 12px;"><h3 style="margin-bottom:4px;">Where do you work?</h3><p class="muted" style="margin:0;">Your address is used to calculate distance for nearby customers.</p></div>
         <div class="field"><label for="workplace_name">Barbershop / Salon name</label><input id="workplace_name" name="workplace_name" placeholder="e.g. Novo Barbers" required/></div>
         <div class="field"><label for="street_address">Street address</label><input id="street_address" name="street_address" placeholder="e.g. 399 Perry St" autocomplete="street-address" required/></div>
         <div class="field"><label for="suite">Suite / Unit <span class="muted">(optional)</span></label><input id="suite" name="suite" placeholder="e.g. #100"/></div>
         <div class="field-row"><div class="field"><label for="city">City</label><input id="city" name="city" placeholder="Castle Rock" autocomplete="address-level2" required/></div><div class="field"><label for="state">State</label><input id="state" name="state" value="CO" maxlength="2" autocomplete="address-level1" required/></div></div>
         <div class="field"><label for="zip_code">ZIP code</label><input id="zip_code" name="zip_code" inputmode="numeric" autocomplete="postal-code" maxlength="10" required/></div>
         <div class="helptext" style="margin-top:-6px; margin-bottom:18px;">We use this address to place your business on GoBookr and calculate mileage. Customers still see your city and state on search cards.</div>`
      : '';

    const body = `<section class="section container" style="max-width:620px;"><div class="panel"><h1>${role === 'pro' ? 'Join GoBookr as a professional' : 'Create your account'}</h1><form method="POST" action="/signup"><input type="hidden" name="role" value="${role}"/><div class="field"><label>Your name</label><input name="name" required/></div><div class="field"><label>Email</label><input type="email" name="email" required/></div><div class="field"><label>Password</label><input type="password" name="password" minlength="6" required/></div>${proFields}<button class="btn block" type="submit">Create account</button></form></div></section>`;
    send(ctx.res, layout({ title: 'Sign up', currentUser: null, session: null, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/signup', async (ctx) => {
    const name = String(ctx.body.name || '').trim();
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const role = ctx.body.role === 'pro' ? 'pro' : 'customer';

    if (!name || !email || password.length < 6) {
      return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('Please complete all required fields.'));
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return redirect(ctx.res, `/signup?role=${role}&error=` + encodeURIComponent('An account with that email already exists.'));
    }

    if (role === 'pro') {
      const required = ['business_name', 'workplace_name', 'street_address', 'city', 'state', 'zip_code'];
      if (required.some((key) => !String(ctx.body[key] || '').trim())) {
        return redirect(ctx.res, '/signup?role=pro&error=' + encodeURIComponent('Please complete your business and workplace address.'));
      }
    }

    const result = db
      .prepare('INSERT INTO users (email,password_hash,role,name,phone) VALUES (?,?,?,?,?)')
      .run(email, hashPassword(password), role, name, '');
    const userId = result.lastInsertRowid;

    if (role === 'pro') {
      const businessName = String(ctx.body.business_name || '').trim();
      const category = ['barber', 'stylist', 'colorist'].includes(ctx.body.category) ? ctx.body.category : 'barber';
      const city = String(ctx.body.city || '').trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
      const state = String(ctx.body.state || '').trim().toUpperCase();
      const workplace = String(ctx.body.workplace_name || '').trim();
      const street = String(ctx.body.street_address || '').trim();
      const suite = String(ctx.body.suite || '').trim();
      const zip = String(ctx.body.zip_code || '').trim();

      const coordinates = await geocodeBusinessAddress({ street, city, state, zip });

      db.prepare(`INSERT INTO pro_profiles (
        user_id,business_name,category,bio,city,state,workplace_name,street_address,suite,zip_code,
        latitude,longitude,price_min,price_max,years_experience,accent,initials
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        userId,
        businessName || name,
        category,
        '',
        city,
        state,
        workplace,
        street,
        suite,
        zip,
        coordinates ? coordinates.latitude : null,
        coordinates ? coordinates.longitude : null,
        0,
        0,
        0,
        'violet',
        initialsFrom(businessName || name)
      );
    }

    const token = createSession(userId);
    setSessionCookie(ctx.res, token);
    redirect(ctx.res, role === 'pro' ? '/dashboard/pro/onboarding' : '/dashboard/customer');
  });

  router.post('/logout', async (ctx) => {
    const cookie = String(ctx.req.headers.cookie || '');
    const match = cookie.match(/(?:^|;\s*)gobookr_session=([^;]+)/);
    if (match) destroySession(decodeURIComponent(match[1]));
    clearSessionCookie(ctx.res);
    redirect(ctx.res, '/');
  });
};
