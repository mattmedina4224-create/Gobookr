'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml, money, slugCategory, avgRating } = require('../lib/util');

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, `/login?next=${encodeURIComponent('/dashboard/pro')}`);
    return null;
  }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) { send(ctx.res, '<h1>500 — pro profile missing</h1>', 500); return null; }
  return profile;
}

function normalizeUrl(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (clean.length > 2048) return null;

  const candidate = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function clampText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function validUsState(value) {
  return /^[A-Z]{2}$/.test(String(value || ''));
}

function validZip(value) {
  return /^\d{5}(?:-\d{4})?$/.test(String(value || ''));
}

function finiteInteger(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function imageLooksValid(data, contentType) {
  if (!Buffer.isBuffer(data) || data.length < 12) return false;
  if (contentType === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/gif') {
    const header = data.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (contentType === 'image/webp') return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    if (data.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
    const brand = data.subarray(8, 12).toString('ascii').toLowerCase();
    return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand);
  }
  return false;
}

async function geocodeBusinessAddress({ street, city, state, zip }) {
  const query = [street, city, state, zip, 'USA'].filter(Boolean).join(', ');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(query);
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

function dashNav(active) {
  const items = [
    { key: 'overview', href: '/dashboard/pro', label: 'Overview' },
    { key: 'profile', href: '/dashboard/pro/profile', label: 'Profile & services' },
    { key: 'portfolio', href: '/dashboard/pro/portfolio', label: 'Portfolio' },
    { key: 'billing', href: '/dashboard/pro/billing', label: 'Billing' },
  ];
  return `<nav class="dash-nav">${items.map((i) => `<a href="${i.href}" class="${i.key === active ? 'active' : ''}">${i.label}</a>`).join('')}</nav>`;
}

function portfolioTile(item, i, gradientFor) {
  const visual = item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.caption || 'Portfolio photo')}" style="width:100%; height:100%; object-fit:cover; display:block;" />` : `<span>${escapeHtml(item.caption)}</span>`;
  const background = item.image_url ? 'background:#eee;' : `background:${gradientFor(i)};`;
  return `<div class="portfolio-item" style="${background} overflow:hidden;">${visual}</div>`;
}

module.exports = function (router) {
  router.get('/dashboard/pro', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const reviews = db.prepare('SELECT rating FROM reviews WHERE pro_id = ?').all(profile.id);
    const bookingReady = Boolean(profile.booking_url);
    const body = `<section class="section container"><div class="dash-layout">${dashNav('overview')}<div><h1>Welcome back, ${escapeHtml(ctx.currentUser.name.split(' ')[0])}</h1><div class="stat-cards"><div class="stat-card"><div class="num">${bookingReady ? '✓' : '—'}</div><div class="label">Booking link</div></div><div class="stat-card"><div class="num">${avgRating(reviews) ?? '—'}</div><div class="label">Average rating</div></div><div class="stat-card"><div class="num">${reviews.length}</div><div class="label">Reviews</div></div></div><div class="panel"><h3>Your public profile</h3><p>${escapeHtml(profile.business_name)} · ${slugCategory(profile.category)} · ${escapeHtml(profile.city)}, ${escapeHtml(profile.state)}</p><a class="btn secondary" href="/pro/${profile.id}">View public profile</a><a class="btn ghost" href="/dashboard/pro/profile">Edit details</a></div><div class="panel"><h3>Online booking</h3>${bookingReady ? '<p>Your Book Appointment button is connected to your scheduling site.</p><a class="btn secondary" href="/dashboard/pro/profile">Update booking link</a>' : '<p class="muted">Add your Square, Booksy, Vagaro, Fresha, GlossGenius, or other scheduling link so customers can book directly from your GoBookr profile.</p><a class="btn" href="/dashboard/pro/profile">Add booking link</a>'}</div></div></div></section>`;
    send(ctx.res, layout({ title: 'Pro dashboard', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/dashboard/pro/requests', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent('GoBookr now sends customers directly to your scheduling link.'));
  });

  router.get('/dashboard/pro/profile', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(profile.id);
    const locationStatus = Number.isFinite(Number(profile.latitude)) && Number.isFinite(Number(profile.longitude))
      ? '<span style="color:#067647;font-weight:700;">Location ready for mileage</span>'
      : '<span class="muted">Location will be refreshed from this address when you save.</span>';
    const body = `<section class="section container"><div class="dash-layout">${dashNav('profile')}<div><h1>Profile &amp; services</h1><div class="panel"><h3>Business details</h3><form method="POST" action="/dashboard/pro/profile"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><div class="field"><label for="business_name">Business name</label><input id="business_name" name="business_name" value="${escapeHtml(profile.business_name)}" maxlength="120" required /></div>
    <div class="field"><label for="booking_url">Booking / scheduling link</label><input id="booking_url" name="booking_url" type="url" value="${escapeHtml(profile.booking_url || '')}" maxlength="2048" placeholder="https://square.site/book/..." /><div class="helptext">Paste the link customers use to book with you on Square, Booksy, Vagaro, Fresha, GlossGenius, or another scheduling system.</div></div>
    <div style="margin:26px 0 12px; padding-top:20px; border-top:1px solid var(--paper-line);"><h3 style="margin-bottom:4px;">Where do you work?</h3><p class="muted" style="margin:0;">Keep this current so customers get accurate distance results.</p></div>
    <div class="field"><label for="workplace_name">Barbershop / Salon name</label><input id="workplace_name" name="workplace_name" value="${escapeHtml(profile.workplace_name || '')}" maxlength="160" placeholder="e.g. Novo Barbers" required /></div>
    <div class="field"><label for="street_address">Street address</label><input id="street_address" name="street_address" value="${escapeHtml(profile.street_address || '')}" maxlength="200" placeholder="e.g. 399 Perry St" autocomplete="street-address" required /></div>
    <div class="field"><label for="suite">Suite / Unit <span class="muted">(optional)</span></label><input id="suite" name="suite" value="${escapeHtml(profile.suite || '')}" maxlength="80" placeholder="e.g. #100" /></div>
    <div class="field-row"><div class="field"><label for="city">City</label><input id="city" name="city" value="${escapeHtml(profile.city)}" maxlength="100" autocomplete="address-level2" required /></div><div class="field"><label for="state">State</label><input id="state" name="state" value="${escapeHtml(profile.state)}" maxlength="2" pattern="[A-Za-z]{2}" autocomplete="address-level1" required /></div></div>
    <div class="field"><label for="zip_code">ZIP code</label><input id="zip_code" name="zip_code" value="${escapeHtml(profile.zip_code || '')}" inputmode="numeric" autocomplete="postal-code" maxlength="10" pattern="[0-9]{5}(-[0-9]{4})?" required /></div>
    <div class="helptext" style="margin-top:-6px; margin-bottom:18px;">${locationStatus}</div>
    <div class="field"><label for="license_number">License #</label><input id="license_number" name="license_number" value="${escapeHtml(profile.license_number || '')}" maxlength="100" placeholder="e.g. BAR.1234567" /></div><div class="field"><label for="license_state">License state</label><input id="license_state" name="license_state" value="${escapeHtml(profile.license_state || profile.state || '')}" maxlength="2" pattern="[A-Za-z]{2}" placeholder="CO" /></div><div class="field-row"><div class="field"><label for="price_min">Starting price ($)</label><input id="price_min" type="number" name="price_min" value="${profile.price_min}" min="0" max="100000" /></div><div class="field"><label for="price_max">Top price ($)</label><input id="price_max" type="number" name="price_max" value="${profile.price_max}" min="0" max="100000" /></div></div><div class="field"><label for="years_experience">Years of experience</label><input id="years_experience" type="number" name="years_experience" value="${profile.years_experience}" min="0" max="100" /></div><div class="field"><label for="bio">About / bio</label><textarea id="bio" name="bio" rows="4" maxlength="3000">${escapeHtml(profile.bio)}</textarea></div><button class="btn" type="submit">Save changes</button></form></div><div class="panel"><h3>Services</h3>${services.map((s) => `<div class="service-row"><div><div class="name">${escapeHtml(s.name)}</div><div class="duration">${s.duration_minutes} min · ${money(s.price)}</div></div><form method="POST" action="/dashboard/pro/services/${s.id}/delete"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><button class="btn ghost small" type="submit">Remove</button></form></div>`).join('') || '<p class="muted">No services yet — add your first below.</p>'}<form method="POST" action="/dashboard/pro/services" style="margin-top:16px; border-top:1px solid var(--paper-line); padding-top:16px;"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><div class="field-row"><div class="field"><label for="name">Service name</label><input id="name" name="name" maxlength="120" placeholder="e.g. Skin fade" required /></div><div class="field"><label for="price">Price ($)</label><input id="price" type="number" name="price" min="0" max="100000" required /></div></div><div class="field"><label for="duration_minutes">Duration (minutes)</label><input id="duration_minutes" type="number" name="duration_minutes" value="30" min="5" max="1440" /></div><button class="btn secondary" type="submit">Add service</button></form></div></div></div></section>`;
    send(ctx.res, layout({ title: 'Edit profile', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/profile', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const { business_name, booking_url, workplace_name, street_address, suite, city, state, zip_code, license_number, license_state, price_min, price_max, years_experience, bio } = ctx.body;

    const cleanBusinessName = clampText(business_name || profile.business_name, 120);
    const cleanCity = clampText(city || profile.city, 100).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
    const cleanState = clampText(state || profile.state, 2).toUpperCase();
    const cleanWorkplace = clampText(workplace_name, 160);
    const cleanStreet = clampText(street_address, 200);
    const cleanSuite = clampText(suite, 80);
    const cleanZip = clampText(zip_code, 10);
    const cleanBookingUrl = normalizeUrl(booking_url);
    const cleanLicenseNumber = clampText(license_number, 100) || null;
    const cleanLicenseState = clampText(license_state || cleanState, 2).toUpperCase();
    const cleanBio = String(bio || '').trim().slice(0, 3000);
    const minPrice = finiteInteger(price_min || 0, 0, 100000);
    const maxPrice = finiteInteger(price_max || 0, 0, 100000);
    const years = finiteInteger(years_experience || 0, 0, 100);

    if (!cleanBusinessName) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Business name is required.'));
    if (cleanBookingUrl === null) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Please enter a valid booking website, such as https://square.site/book/...'));
    if (!cleanWorkplace || !cleanStreet || !cleanCity || !validUsState(cleanState) || !validZip(cleanZip)) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Please complete a valid workplace address.'));
    if (cleanLicenseNumber && !validUsState(cleanLicenseState)) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Please enter a valid two-letter license state.'));
    if (minPrice === null || maxPrice === null || years === null) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Please enter valid pricing and experience values.'));
    if (minPrice > 0 && maxPrice > 0 && maxPrice < minPrice) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Top price must be at least the starting price.'));

    const addressChanged =
      cleanWorkplace !== String(profile.workplace_name || '') ||
      cleanStreet !== String(profile.street_address || '') ||
      cleanSuite !== String(profile.suite || '') ||
      cleanCity !== String(profile.city || '') ||
      cleanState !== String(profile.state || '') ||
      cleanZip !== String(profile.zip_code || '');

    let latitude = profile.latitude;
    let longitude = profile.longitude;
    if (addressChanged || latitude == null || longitude == null) {
      const coordinates = await geocodeBusinessAddress({ street: cleanStreet, city: cleanCity, state: cleanState, zip: cleanZip });
      latitude = coordinates ? coordinates.latitude : null;
      longitude = coordinates ? coordinates.longitude : null;
    }

    const licenseChanged = cleanLicenseNumber !== (profile.license_number || null) || cleanLicenseState !== String(profile.license_state || profile.state || '').toUpperCase();
    db.prepare(`UPDATE pro_profiles SET business_name = ?, booking_url = ?, workplace_name = ?, street_address = ?, suite = ?, city = ?, state = ?, zip_code = ?, latitude = ?, longitude = ?, license_number = ?, license_state = ?, license_verified = ?, price_min = ?, price_max = ?, years_experience = ?, bio = ? WHERE id = ?`).run(
      cleanBusinessName,
      cleanBookingUrl,
      cleanWorkplace,
      cleanStreet,
      cleanSuite,
      cleanCity,
      cleanState,
      cleanZip,
      latitude,
      longitude,
      cleanLicenseNumber,
      cleanLicenseState,
      licenseChanged ? 0 : Number(profile.license_verified || 0),
      minPrice,
      maxPrice,
      years,
      cleanBio,
      profile.id
    );

    const message = latitude != null && longitude != null
      ? 'Profile and workplace location updated.'
      : 'Profile updated, but we could not map that address yet. Check the address and save again.';
    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent(message));
  });

  router.post('/dashboard/pro/services', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const name = clampText(ctx.body.name, 120);
    const price = finiteInteger(ctx.body.price, 0, 100000);
    const duration = finiteInteger(ctx.body.duration_minutes || 30, 5, 1440);
    if (!name || price === null || duration === null) return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Enter a valid service name, price, and duration.'));
    db.prepare('INSERT INTO services (pro_id, name, price, duration_minutes) VALUES (?, ?, ?, ?)').run(profile.id, name, price, duration);
    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent('Service added.'));
  });

  router.post('/dashboard/pro/services/:id/delete', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const serviceId = Number(ctx.params.id);
    if (Number.isInteger(serviceId) && serviceId > 0) db.prepare('DELETE FROM services WHERE id = ? AND pro_id = ?').run(serviceId, profile.id);
    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent('Service removed.'));
  });

  router.get('/dashboard/pro/portfolio', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const items = db.prepare('SELECT * FROM portfolio_items WHERE pro_id = ? ORDER BY id DESC').all(profile.id);
    const accentColors = ['#6d3bf0', '#a06bff', '#e8a33d', '#f2c675', '#1c8a8a', '#4fc7c0', '#d13b6f', '#ef7ba0'];
    const gradientFor = (i) => `linear-gradient(135deg, ${accentColors[i % accentColors.length]}, ${accentColors[(i + 3) % accentColors.length]})`;
    const body = `<section class="section container"><div class="dash-layout">${dashNav('portfolio')}<div><h1>Portfolio</h1><p class="helptext" style="margin-top:-4px;">Upload photos of your work from your phone, tablet, or computer. JPG, PNG, WEBP, GIF, HEIC and HEIF are supported up to 10 MB. Up to 50 photos per profile.</p><div class="panel"><div class="portfolio-grid">${items.map((p, i) => `<div style="position:relative;">${portfolioTile(p, i, gradientFor)}<div style="margin-top:6px; font-size:14px;">${escapeHtml(p.caption)}</div><form method="POST" action="/dashboard/pro/portfolio/${p.id}/delete" style="margin-top:6px;"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><button class="btn ghost small" type="submit">Remove</button></form></div>`).join('') || '<p class="muted">No portfolio items yet.</p>'}</div><form method="POST" action="/dashboard/pro/portfolio" enctype="multipart/form-data" style="margin-top:20px; border-top:1px solid var(--paper-line); padding-top:16px; max-width:420px;"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><div class="field"><label for="image">Photo</label><input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif" required /><div class="helptext">On a phone, tap this to choose from Photos or Files.</div></div><div class="field"><label for="caption">Caption</label><input id="caption" name="caption" maxlength="200" placeholder="e.g. Fresh fade" required /></div><button class="btn secondary" type="submit">Upload photo</button></form></div></div></div></section>`;
    send(ctx.res, layout({ title: 'Portfolio', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/portfolio', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const count = db.prepare('SELECT COUNT(*) AS count FROM portfolio_items WHERE pro_id = ?').get(profile.id).count;
    if (count >= 50) return redirect(ctx.res, '/dashboard/pro/portfolio?error=' + encodeURIComponent('Portfolio limit reached. Remove a photo before adding another.'));

    const caption = clampText(ctx.body.caption, 200);
    const image = ctx.files && ctx.files.image;
    if (!caption) return redirect(ctx.res, '/dashboard/pro/portfolio?error=' + encodeURIComponent('Add a short caption for your photo.'));
    if (!image || !image.data || !image.data.length) return redirect(ctx.res, '/dashboard/pro/portfolio?error=' + encodeURIComponent('Choose a photo to upload.'));
    const allowedTypes = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif'], ['image/heic', '.heic'], ['image/heif', '.heif']]);
    const ext = allowedTypes.get(String(image.contentType || '').toLowerCase());
    if (!ext || !imageLooksValid(image.data, String(image.contentType || '').toLowerCase())) return redirect(ctx.res, '/dashboard/pro/portfolio?error=' + encodeURIComponent('That file does not appear to be a supported image.'));
    if (image.data.length > 10 * 1024 * 1024) return redirect(ctx.res, '/dashboard/pro/portfolio?error=' + encodeURIComponent('Photo must be 10 MB or smaller.'));

    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'portfolio');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `${profile.id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const filePath = path.join(uploadDir, filename);
    const imageUrl = `/uploads/portfolio/${filename}`;
    const accents = ['violet', 'gold', 'teal', 'rose', 'slate'];

    try {
      fs.writeFileSync(filePath, image.data, { flag: 'wx' });
      db.prepare('INSERT INTO portfolio_items (pro_id, caption, accent, image_url) VALUES (?, ?, ?, ?)').run(profile.id, caption, accents[Math.floor(Math.random() * accents.length)], imageUrl);
    } catch (err) {
      try { fs.unlinkSync(filePath); } catch (_) {}
      console.error('Portfolio upload failed', err);
      return redirect(ctx.res, '/dashboard/pro/portfolio?error=' + encodeURIComponent('We could not save that photo. Please try again.'));
    }
    redirect(ctx.res, '/dashboard/pro/portfolio?success=' + encodeURIComponent('Photo uploaded.'));
  });

  router.post('/dashboard/pro/portfolio/:id/delete', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const itemId = Number(ctx.params.id);
    if (!Number.isInteger(itemId) || itemId <= 0) return redirect(ctx.res, '/dashboard/pro/portfolio');
    const item = db.prepare('SELECT * FROM portfolio_items WHERE id = ? AND pro_id = ?').get(itemId, profile.id);
    if (item && item.image_url && item.image_url.startsWith('/uploads/portfolio/')) {
      const relativePath = item.image_url.replace(/^\/+/, '');
      const filePath = path.join(__dirname, '..', 'public', relativePath);
      try { fs.unlinkSync(filePath); } catch (err) { if (err.code !== 'ENOENT') console.error(err); }
    }
    db.prepare('DELETE FROM portfolio_items WHERE id = ? AND pro_id = ?').run(itemId, profile.id);
    redirect(ctx.res, '/dashboard/pro/portfolio?success=' + encodeURIComponent('Removed.'));
  });
};
