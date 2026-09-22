'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml, money, slugCategory, avgRating, stars } = require('../lib/util');
const { isProPubliclyVisible } = require('../lib/subscription');
const { hydratePros } = require('../lib/pro-listing-data');
const { parseRadius, resolveSearchCenter, filterByRadius, filterBusinessesByRadius } = require('../lib/geo-search');

const CATEGORIES = [
  { value: '', label: 'All services' },
  { value: 'barber', label: 'Barbers' },
  { value: 'stylist', label: 'Hairstylists' },
  { value: 'colorist', label: 'Colorists' },
  { value: 'nail_technician', label: 'Nail Technicians' },
  { value: 'eyelash_technician', label: 'Eyelash Technicians' },
  { value: 'eyebrow_technician', label: 'Eyebrow Technicians' },
  { value: 'waxing_specialist', label: 'Waxing Specialists' },
  { value: 'massage_therapist', label: 'Massage Therapists' },
  { value: 'tattoo_artist', label: 'Tattoo Artists' },
];
const CATEGORY_VALUES = new Set(CATEGORIES.map((item) => item.value));
const RATING_VALUES = new Set(['4.5', '4', '3']);
const RESULT_TYPES = new Set(['all', 'professionals', 'businesses']);

function queryText(value, max = 100) { return String(value || '').trim().slice(0, max); }
function likeValue(value) { return '%' + String(value).replace(/[\\%_]/g, (char) => '\\' + char) + '%'; }
function safeExternalUrl(value) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > 2048) return '';
  try { const url = new URL(clean); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return ''; url.username = ''; url.password = ''; return url.toString(); } catch (_) { return ''; }
}
function categoriesForPro(proId) {
  const rows = db.prepare('SELECT category FROM pro_categories WHERE pro_id = ? ORDER BY category').all(proId);
  return rows.length ? rows.map((row) => row.category) : [];
}
function categoryBadges(categories) { return (categories || []).map((category) => `<span class="badge category">${escapeHtml(slugCategory(category))}</span>`).join(' '); }
function verifiedBadge() { return `<span class="verified-badge" title="License verified by GoBookr" aria-label="License verified by GoBookr"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.2 2.1 3-.4.9 2.9 2.7 1.4-.9 2.9 1.3 2.7-2.4 1.8-.1 3-3 .5-2 2.3-2.7-1.3-2.7 1.3-2-2.3-3-.5-.1-3-2.4-1.8 1.3-2.7-.9-2.9 2.7-1.4.9-2.9 3 .4L12 2.5z"/><path d="M8.4 12.1l2.2 2.2 5-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`; }
function claimBadge(pro) {
  if (pro.claim_status === 'unclaimed') return `<span class="badge" style="background:#eef4ff;color:#0b1f3a;border:1px solid #c8d8f2;">Unclaimed profile</span>`;
  if (pro.claim_status === 'claim_pending') return `<span class="badge" style="background:#f7f7f7;color:#555;border:1px solid #ddd;">Claim pending</span>`;
  return '';
}
function proCard(pro) {
  const priceLine = pro.price_min && pro.price_max ? `${money(pro.price_min)}${pro.price_min !== pro.price_max ? '–' + money(pro.price_max) : ''}` : 'Pricing varies';
  const ratingHtml = pro.rating != null ? `<span class="rating">${stars(pro.rating)}<span class="count"><b>${pro.rating}</b> (${pro.reviewCount})</span></span>` : `<span class="muted">New on GoBookr</span>`;
  const serviceNames = pro.services.slice(0, 3).map((s) => escapeHtml(s.name)).join(' · ') || 'Services coming soon';
  const hasLocation = pro.latitude !== null && pro.latitude !== '' && pro.longitude !== null && pro.longitude !== '' && Number.isFinite(Number(pro.latitude)) && Number.isFinite(Number(pro.longitude));
  const locationAttrs = hasLocation ? ` data-lat="${Number(pro.latitude)}" data-lon="${Number(pro.longitude)}"` : '';
  const distanceHtml = Number.isFinite(Number(pro.distanceMiles)) ? `<span class="distance-away">${Number(pro.distanceMiles).toFixed(1)} miles away</span>` : (hasLocation ? `<span class="distance-away">Use location for distance</span>` : '');
  const workplaceHtml = pro.workplace_name ? `<div class="pro-workplace">${escapeHtml(pro.workplace_name)}</div>` : '';
  const photoHtml = pro.coverPhoto ? `<div class="pro-card-photo"><img src="${escapeHtml(pro.coverPhoto.image_url)}" alt="${escapeHtml(pro.coverPhoto.caption || pro.business_name)}" loading="lazy" /></div>` : '';
  return `<a class="pro-card${pro.coverPhoto ? ' has-photo' : ''}" href="/pro/${pro.id}"${locationAttrs}>${photoHtml}<div class="pro-card-body"><div class="pro-card-top"><div class="avatar accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div><div class="pro-card-main"><h3>${escapeHtml(pro.business_name)}${pro.license_verified ? verifiedBadge() : ''}</h3>${workplaceHtml}<div class="pro-location">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}${distanceHtml ? ` <span aria-hidden="true">·</span> ${distanceHtml}` : ''}</div></div></div><div style="margin:8px 0;">${claimBadge(pro)}</div><div class="pro-card-badges">${categoryBadges(pro.categories)}</div><div class="pro-card-rating">${ratingHtml}</div><div class="services-line">${serviceNames}</div><div class="pro-card-footer"><span class="price-tag">${priceLine}</span><span class="view-profile">${pro.claim_status === 'unclaimed' ? 'View & claim profile →' : 'View profile →'}</span></div></div></a>`;
}
function businessCard(shop) {
  const location = [shop.city, shop.state].filter(Boolean).join(', ');
  const status = shop.claim_status === 'unclaimed' ? '<span class="badge" style="background:#eef4ff;color:#0b1f3a;border:1px solid #c8d8f2;">Unclaimed business</span>' : '';
  const action = shop.claim_status === 'unclaimed' ? 'View & claim business →' : 'View business →';
  const distanceHtml = Number.isFinite(Number(shop.distanceMiles)) ? '<span class="distance-away">' + Number(shop.distanceMiles).toFixed(1) + ' miles away</span>' : '';
  return '<a class="pro-card business-card" href="/shop/' + shop.id + '"><div class="pro-card-body"><div class="pro-card-top">' +
    (shop.logo_url ? '<img src="' + escapeHtml(shop.logo_url) + '" alt="" style="width:52px;height:52px;border-radius:14px;object-fit:cover;border:1px solid var(--paper-line);"/>' : '<div class="avatar accent-slate">B</div>') +
    '<div class="pro-card-main"><div style="margin-bottom:5px;"><span class="badge category">Business</span></div><h3>' + escapeHtml(shop.name) + '</h3><div class="pro-location">' + escapeHtml(location) + (distanceHtml ? ' <span aria-hidden="true">·</span> ' + distanceHtml : '') + '</div></div></div>' +
    (status ? '<div style="margin:8px 0;">' + status + '</div>' : '') +
    '<div class="services-line">' + escapeHtml((shop.description || 'Local service business').slice(0, 140)) + '</div><div class="pro-card-footer"><span></span><span class="view-profile">' + action + '</span></div></div></a>';
}

function socialLinks(pro) {
  const links = [['Instagram', safeExternalUrl(pro.instagram_url)], ['TikTok', safeExternalUrl(pro.tiktok_url)], ['Facebook', safeExternalUrl(pro.facebook_url)], ['Website', safeExternalUrl(pro.website_url)]].filter(([, url]) => url);
  if (!links.length) return '';
  return `<div class="panel"><h3>Around the web</h3><div style="display:flex;flex-wrap:wrap;gap:8px;">${links.map(([label, url]) => `<a class="btn secondary small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`).join('')}</div></div>`;
}

module.exports = function (router) {
  router.get('/', async (ctx) => {
    const featured = hydratePros(db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 20').all()).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
    const body = `<section class="hero"><div class="container"><h1>Find a local professional you can actually trust.</h1><p class="lede">Discover barbers, hairstylists, colorists, nail technicians, lash and brow professionals, waxing specialists, massage therapists, tattoo artists, and more — then book directly with the professional.</p><div class="search-card"><form method="GET" action="/search"><select name="category" aria-label="Service">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select><input type="text" name="city" maxlength="100" placeholder="City or ZIP" /><select name="radius" aria-label="Search radius"><option value="1">1 mile</option><option value="2">2 miles</option><option value="3">3 miles</option><option value="4">4 miles</option><option value="5" selected>5 miles</option><option value="10">10 miles</option><option value="15">15 miles</option><option value="20">20 miles</option></select><input type="hidden" name="lat" value="" /><input type="hidden" name="lon" value="" /><input type="text" name="q" maxlength="100" placeholder="Name or business" /><button class="btn" type="submit">Search</button></form></div><div class="category-pills">${CATEGORIES.filter((c) => c.value).map((c) => `<a href="/search?category=${c.value}">${c.label}</a>`).join('')}<a href="/search">Browse everyone</a></div></div></section><section class="section container"><div class="section-head"><div><h2>Top-rated professionals</h2><p class="muted" style="margin:4px 0 0;">Explore local work, services, reviews, and booking options.</p></div><a class="btn secondary small" href="/search">See all</a></div><div class="pro-grid">${featured.map(proCard).join('') || '<p class="muted">No professionals listed yet.</p>'}</div></section><section class="section container"><div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;"><div><h2 style="margin-bottom:4px;">Are you a personal-service professional?</h2><p style="margin:0;">Show your work, build trust, and send new clients straight to your booking page.</p></div><a class="btn" href="/signup?role=pro">Start 30 days free</a></div></section>`;
    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/search', async (ctx) => {
    const requestedCategory = queryText(ctx.query.category, 40); const category = CATEGORY_VALUES.has(requestedCategory) ? requestedCategory : '';
    const city = queryText(ctx.query.city, 100); const q = queryText(ctx.query.q, 100); const requestedType = queryText(ctx.query.type, 20); const resultType = RESULT_TYPES.has(requestedType) ? requestedType : 'all'; const requestedRating = queryText(ctx.query.minRating, 8); const minRating = RATING_VALUES.has(requestedRating) ? requestedRating : '';
    const radius = parseRadius(ctx.query.radius); const latText = queryText(ctx.query.lat, 30); const lonText = queryText(ctx.query.lon, 30); const lat = Number(latText); const lon = Number(lonText); const hasGps = latText !== '' && lonText !== '' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180 && radius !== null;
    const manualCenter = !hasGps && city && radius ? resolveSearchCenter(city) : null;
    const radiusLat = hasGps ? lat : (manualCenter ? manualCenter.latitude : null); const radiusLon = hasGps ? lon : (manualCenter ? manualCenter.longitude : null); const hasRadiusCenter = hasGps || Boolean(manualCenter);
    let sql = 'SELECT * FROM pro_profiles WHERE 1=1'; const args = [];
    if (category) { sql += ' AND EXISTS (SELECT 1 FROM pro_categories pc WHERE pc.pro_id = pro_profiles.id AND pc.category = ?)'; args.push(category); }
    if (city && !hasRadiusCenter) { sql += " AND (city LIKE ? ESCAPE '\\' OR state LIKE ? ESCAPE '\\' OR zip_code LIKE ? ESCAPE '\\')"; const value = likeValue(city); args.push(value, value, value); }
    if (q) { sql += " AND (business_name LIKE ? ESCAPE '\\' OR workplace_name LIKE ? ESCAPE '\\')"; const value = likeValue(q); args.push(value, value); }
    sql += ' ORDER BY id DESC LIMIT 500';
    let results = hydratePros(db.prepare(sql).all(...args));
    const radiusResult = await filterByRadius(results, radiusLat, radiusLon, radius);
    results = radiusResult.profiles;
    if (minRating) results = results.filter((p) => (p.rating || 0) >= Number(minRating));
    if (resultType === 'businesses') results = [];
    let businessSql = 'SELECT * FROM shops WHERE 1=1'; const businessArgs = [];
    if (city && !hasRadiusCenter) { businessSql += " AND (city LIKE ? OR state LIKE ? OR zip_code LIKE ?)"; const value = likeValue(city); businessArgs.push(value, value, value); }
    if (q) { businessSql += " AND name LIKE ?"; businessArgs.push(likeValue(q)); }
    businessSql += ' ORDER BY id DESC LIMIT 200';
    let businesses = [];
    try { businesses = db.prepare(businessSql).all(...businessArgs); } catch (err) { console.error('Business search unavailable', err); }
    if (hasRadiusCenter && businesses.length) { const businessRadiusResult = await filterBusinessesByRadius(businesses, radiusLat, radiusLon, radius); businesses = businessRadiusResult.businesses; }
    if (category || minRating || resultType === 'professionals') businesses = [];
    const totalResults = results.length + businesses.length;
    const filterLink = (overrides) => { const merged = { type: resultType === 'all' ? '' : resultType, category, city, q, minRating, radius: radius || '', lat: hasGps ? lat : '', lon: hasGps ? lon : '', ...overrides }; const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v !== '' && v !== null && v !== undefined)); return `/search?${qs.toString()}`; };
    const typeTabs = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 22px;">' + [['all','All'],['professionals','Professionals'],['businesses','Businesses']].map(([value,label]) => '<a href="' + filterLink({ type: value === 'all' ? '' : value }) + '" class="btn small ' + (resultType === value ? '' : 'secondary') + '" style="border-radius:999px;">' + label + '</a>').join('') + '</div>';
    const centerLabel = hasGps ? 'your location' : (manualCenter ? manualCenter.label : city);
    const heading = hasRadiusCenter ? `${category ? slugCategory(category) + 's' : 'Professionals'} within ${radius} mile${radius === 1 ? '' : 's'} of ${escapeHtml(centerLabel)}` : `${category ? slugCategory(category) + 's' : 'Professionals'}${city ? ' near ' + escapeHtml(city) : ' near you'}`;
    const body = `<section class="section container"><div class="section-head"><div><h2>${heading}</h2><p class="muted" style="margin:4px 0 0;">${totalResults} result${totalResults === 1 ? '' : 's'} found${hasRadiusCenter ? ' · sorted by distance' : ''}</p></div>${(category || city || q || minRating || hasRadiusCenter) ? '<a class="btn secondary small" href="/search">Clear all filters</a>' : ''}</div>${typeTabs}<div class="search-layout"><aside class="filters"><h4>Service</h4><ul>${CATEGORIES.map((c) => `<li><a href="${filterLink({ category: c.value })}" style="display:block;padding:6px 0;font-weight:${c.value === category ? '800' : '500'};color:${c.value === category ? 'var(--brand)' : 'inherit'};">${c.label}</a></li>`).join('')}</ul><h4 style="margin-top:18px;">City or ZIP</h4><form method="GET" action="/search" class="field"><input type="hidden" name="category" value="${escapeHtml(category)}" /><input type="hidden" name="q" value="${escapeHtml(q)}" /><input type="hidden" name="minRating" value="${escapeHtml(minRating)}" /><input type="hidden" name="lat" value="${hasGps ? lat : ''}" /><input type="hidden" name="lon" value="${hasGps ? lon : ''}" /><input type="text" name="city" maxlength="100" value="${escapeHtml(city)}" placeholder="City or ZIP" /><label for="radius-filter" style="display:block;margin-top:12px;font-weight:700;">Distance</label><select id="radius-filter" name="radius" style="width:100%;margin-top:6px;"><option value="1"${radius === 1 ? ' selected' : ''}>1 mile</option><option value="2"${radius === 2 ? ' selected' : ''}>2 miles</option><option value="3"${radius === 3 ? ' selected' : ''}>3 miles</option><option value="4"${radius === 4 ? ' selected' : ''}>4 miles</option><option value="5"${!radius || radius === 5 ? ' selected' : ''}>5 miles</option><option value="10"${radius === 10 ? ' selected' : ''}>10 miles</option><option value="15"${radius === 15 ? ' selected' : ''}>15 miles</option><option value="20"${radius === 20 ? ' selected' : ''}>20 miles</option></select><button class="btn secondary small block" type="submit" style="margin-top:8px;">Apply</button></form><h4>Minimum rating</h4><ul class="checks">${[4.5,4,3].map((r) => `<li><a href="${filterLink({ minRating:String(r) })}">${stars(r)} &amp; up</a></li>`).join('')}</ul></aside><div>${totalResults ? `<div class="pro-grid">${results.map(proCard).join('')}${businesses.map(businessCard).join('')}</div>` : `<div class="empty-state"><h3>No results match those filters</h3><p>Try a larger distance, another city or ZIP code, or another service.</p><a class="btn secondary" href="/search">Clear filters</a></div>`}</div></div></section>`;
    send(ctx.res, layout({ title: 'Search local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/location', async (ctx) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') return send(ctx.res, 'Unauthorized', 401);
    const latitude = Number(ctx.body.latitude); const longitude = Number(ctx.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return send(ctx.res, 'Invalid location.', 400);
    const profile = db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id); if (!profile) return send(ctx.res, 'Professional profile not found.', 404);
    db.prepare('UPDATE pro_profiles SET latitude = ?, longitude = ? WHERE id = ?').run(latitude, longitude, profile.id); send(ctx.res, 'Location saved.');
  });

  router.get('/book/:id', async (ctx) => {
    const proId = Number(ctx.params.id);
    if (!Number.isInteger(proId) || proId <= 0) return send(ctx.res, '<h1>404 — professional not found</h1>', 404);
    const pro = db.prepare('SELECT id, booking_url FROM pro_profiles WHERE id = ?').get(proId);
    if (!pro || !isProPubliclyVisible(proId)) return send(ctx.res, '<h1>404 — professional not found</h1>', 404);
    const bookingUrl = safeExternalUrl(pro.booking_url);
    if (!bookingUrl) return redirect(ctx.res, '/pro/' + proId + '?error=' + encodeURIComponent('Online booking is not connected yet.'));
    try {
      db.prepare('INSERT INTO booking_clicks (pro_id, customer_user_id) VALUES (?, ?)').run(proId, ctx.currentUser ? ctx.currentUser.id : null);
    } catch (err) {
      console.error('Booking click tracking failed', err);
    }
    redirect(ctx.res, bookingUrl);
  });

  router.get('/pro/:id', async (ctx) => {
    const proId = Number(ctx.params.id); if (!Number.isInteger(proId) || proId <= 0) return send(ctx.res, '<h1>404 — pro not found</h1>', 404);
    const pro = db.prepare('SELECT * FROM pro_profiles WHERE id = ?').get(proId); if (!pro) return send(ctx.res, '<h1>404 — pro not found</h1>', 404);
    const ownProfile = ctx.currentUser && ctx.currentUser.role === 'pro' && db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id)?.id === pro.id;
    if (!ownProfile && !isProPubliclyVisible(pro.id)) return send(ctx.res, '<h1>404 — pro not found</h1>', 404);
    const categories = categoriesForPro(pro.id); const displayCategories = categories.length ? categories : [pro.category];
    const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(pro.id); const portfolio = db.prepare('SELECT * FROM portfolio_items WHERE pro_id = ? ORDER BY id DESC').all(pro.id);
    const reviews = db.prepare(`SELECT reviews.*, users.name AS customer_name FROM reviews JOIN users ON users.id = reviews.customer_id WHERE reviews.pro_id = ? ORDER BY reviews.created_at DESC`).all(pro.id);
    const rating = avgRating(reviews); const isOwnProfile = Boolean(ownProfile); const bookingUrl = safeExternalUrl(pro.booking_url);
    let ctaHtml;
    if (isOwnProfile) ctaHtml = `<a class="btn secondary block" href="/dashboard/pro/profile">Manage your profile</a>`;
    else if (pro.claim_status === 'unclaimed') ctaHtml = `${bookingUrl ? `<a class="btn block profile-book-btn" href="/book/${pro.id}">Book Appointment <span aria-hidden="true">↗</span></a>` : ''}<a class="btn secondary block" href="/pro/${pro.id}/claim" style="margin-top:10px;">Claim this profile</a><p class="muted" style="font-size:12px;margin:8px 0 0;text-align:center;">Are you this professional? Verify ownership to manage this listing.</p>`;
    else if (pro.claim_status === 'claim_pending') ctaHtml = `${bookingUrl ? `<a class="btn block profile-book-btn" href="/book/${pro.id}">Book Appointment <span aria-hidden="true">↗</span></a>` : ''}<div class="booking-unavailable" style="margin-top:10px;"><strong>Claim pending</strong><p class="muted" style="margin:4px 0 0;">GoBookr is verifying ownership of this profile.</p></div>`;
    else if (bookingUrl) ctaHtml = `<a class="btn block profile-book-btn" href="/book/${pro.id}">Book Appointment <span aria-hidden="true">↗</span></a><p class="muted" style="font-size:12px;margin:8px 0 0;text-align:center;">You'll book on this professional's scheduling site.</p>`;
    else ctaHtml = `<div class="booking-unavailable"><strong>Online booking not connected yet</strong><p class="muted" style="margin:4px 0 0;">Check back soon for this professional's booking link.</p></div>`;
    const accentColors = ['#6d3bf0','#a06bff','#e8a33d','#f2c675','#1c8a8a','#4fc7c0','#d13b6f','#ef7ba0']; const gradientFor = (i) => `linear-gradient(135deg, ${accentColors[i % accentColors.length]}, ${accentColors[(i + 3) % accentColors.length]})`;
    const hasLocation = pro.latitude !== null && pro.latitude !== '' && pro.longitude !== null && pro.longitude !== '' && Number.isFinite(Number(pro.latitude)) && Number.isFinite(Number(pro.longitude)); const workplaceHtml = pro.workplace_name ? `<p class="profile-workplace">${escapeHtml(pro.workplace_name)}</p>` : '';
    const verifiedHtml = pro.license_verified ? `<div class="profile-verified">${verifiedBadge()} <span>License verified by GoBookr</span></div>` : ''; const experienceHtml = Number(pro.years_experience) > 0 ? `<span class="stat"><b>${Number(pro.years_experience)}</b> yrs experience</span>` : ''; const priceHtml = pro.price_min && pro.price_max ? `<span class="stat"><b>${money(pro.price_min)}–${money(pro.price_max)}</b> typical range</span>` : '';
    const body = `<section class="section container profile-page"><div class="profile-head"${hasLocation ? ` data-lat="${Number(pro.latitude)}" data-lon="${Number(pro.longitude)}"` : ''}><div class="avatar lg accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div><div class="meta"><div style="margin-bottom:8px;">${claimBadge(pro)}</div><div class="profile-categories">${categoryBadges(displayCategories)}</div><h1>${escapeHtml(pro.business_name)}${pro.license_verified ? verifiedBadge() : ''}</h1>${workplaceHtml}<div class="profile-location">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}${hasLocation ? ' <span aria-hidden="true">·</span> <span class="profile-distance">Use location for distance</span>' : ''}</div><div class="stat-row"><span class="stat">${rating != null ? `<span class="rating">${stars(rating)}</span> <b>${rating}</b> <span class="muted">(${reviews.length} review${reviews.length === 1 ? '' : 's'})</span>` : '<b>New</b> <span class="muted">No reviews yet</span>'}</span>${experienceHtml}${priceHtml}</div>${verifiedHtml}</div><div class="cta-col">${ctaHtml}</div></div><div class="tabs-grid"><main><div class="panel profile-about"><h2>About</h2><p>${escapeHtml(pro.bio) || 'This professional has not added a bio yet.'}</p></div><div class="panel"><div class="profile-section-head"><h2>Portfolio</h2><span class="muted">${portfolio.length} photo${portfolio.length === 1 ? '' : 's'}</span></div><div class="portfolio-grid profile-portfolio">${portfolio.length ? portfolio.map((p,i) => p.image_url ? `<figure><div class="portfolio-item"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.caption || 'Portfolio photo')}" loading="lazy" /></div>${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}</figure>` : `<figure><div class="portfolio-item" style="background:${gradientFor(i)};"><span>${escapeHtml(p.caption)}</span></div></figure>`).join('') : '<p class="muted">Portfolio photos coming soon.</p>'}</div></div><div class="panel"><div class="profile-section-head"><h2>Reviews</h2>${rating != null ? `<strong>${rating} ${stars(rating)}</strong>` : ''}</div>${reviews.length ? reviews.map((r) => `<div class="review"><div class="review-top"><span class="name">${escapeHtml(r.customer_name)}</span><span class="rating">${stars(r.rating)}</span></div><p>${escapeHtml(r.comment)}</p></div>`).join('') : '<p class="muted">No reviews yet.</p>'}</div></main><aside><div class="panel services-panel"><h2>Services &amp; pricing</h2>${services.length ? services.map((s) => `<div class="service-row"><div><div class="name">${escapeHtml(s.name)}</div><div class="duration">${Number(s.duration_minutes) || 0} min</div></div><div class="price-tag">${money(s.price)}</div></div>`).join('') : '<p class="muted">Services coming soon.</p>'}${!isOwnProfile && bookingUrl ? `<a class="btn block" href="/book/${pro.id}" style="margin-top:18px;">Book Appointment <span aria-hidden="true">↗</span></a>` : ''}</div>${socialLinks(pro)}</aside></div></section>`;
    send(ctx.res, layout({ title: `${pro.business_name} · ${pro.city}, ${pro.state}`, currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};