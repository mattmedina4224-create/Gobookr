'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, money, slugCategory, avgRating, stars } = require('../lib/util');
const { isProPubliclyVisible } = require('../lib/subscription');

const CATEGORIES = [
  { value: '', label: 'All services' },
  { value: 'barber', label: 'Barbers' },
  { value: 'stylist', label: 'Hairstylists' },
  { value: 'colorist', label: 'Colorists' },
  { value: 'nail_technician', label: 'Nail Technicians' },
];

function categoriesForPro(proId) {
  const rows = db.prepare('SELECT category FROM pro_categories WHERE pro_id = ? ORDER BY category').all(proId);
  return rows.length ? rows.map((row) => row.category) : [];
}

function proWithStats(pro) {
  if (!isProPubliclyVisible(pro.id)) return null;
  const reviews = db.prepare('SELECT rating FROM reviews WHERE pro_id = ?').all(pro.id);
  const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(pro.id);
  const categories = categoriesForPro(pro.id);
  const portfolio = db.prepare('SELECT image_url, caption FROM portfolio_items WHERE pro_id = ? AND image_url IS NOT NULL AND image_url != ? ORDER BY id DESC LIMIT 1').get(pro.id, '');
  return { ...pro, categories: categories.length ? categories : [pro.category], reviewCount: reviews.length, rating: avgRating(reviews), services, coverPhoto: portfolio || null };
}

function categoryBadges(categories) {
  return (categories || []).map((category) => `<span class="badge category">${slugCategory(category)}</span>`).join(' ');
}

function verifiedBadge() {
  return `<span class="verified-badge" title="License verified by GoBookr" aria-label="License verified by GoBookr"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.2 2.1 3-.4.9 2.9 2.7 1.4-.9 2.9 1.3 2.7-2.4 1.8-.1 3-3 .5-2 2.3-2.7-1.3-2.7 1.3-2-2.3-3-.5-.1-3-2.4-1.8 1.3-2.7-.9-2.9 2.7-1.4.9-2.9 3 .4L12 2.5z"/><path d="M8.4 12.1l2.2 2.2 5-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}

function proCard(pro) {
  const priceLine = pro.price_min && pro.price_max ? `${money(pro.price_min)}${pro.price_min !== pro.price_max ? '–' + money(pro.price_max) : ''}` : 'Pricing varies';
  const ratingHtml = pro.rating != null ? `<span class="rating">${stars(pro.rating)}<span class="count"><b>${pro.rating}</b> (${pro.reviewCount})</span></span>` : `<span class="muted">New on GoBookr</span>`;
  const serviceNames = pro.services.slice(0, 3).map((s) => escapeHtml(s.name)).join(' · ') || 'Services coming soon';
  const hasLocation = Number.isFinite(Number(pro.latitude)) && Number.isFinite(Number(pro.longitude));
  const locationAttrs = hasLocation ? ` data-lat="${Number(pro.latitude)}" data-lon="${Number(pro.longitude)}"` : '';
  const distanceHtml = hasLocation ? `<span class="distance-away">Use location for distance</span>` : '';
  const workplaceHtml = pro.workplace_name ? `<div class="pro-workplace">${escapeHtml(pro.workplace_name)}</div>` : '';
  const photoHtml = pro.coverPhoto ? `<div class="pro-card-photo"><img src="${escapeHtml(pro.coverPhoto.image_url)}" alt="${escapeHtml(pro.coverPhoto.caption || pro.business_name)}" loading="lazy" /></div>` : '';
  return `<a class="pro-card${pro.coverPhoto ? ' has-photo' : ''}" href="/pro/${pro.id}"${locationAttrs}>${photoHtml}<div class="pro-card-body"><div class="pro-card-top"><div class="avatar accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div><div class="pro-card-main"><h3>${escapeHtml(pro.business_name)}${pro.license_verified ? verifiedBadge() : ''}</h3>${workplaceHtml}<div class="pro-location">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}${distanceHtml ? ` <span aria-hidden="true">·</span> ${distanceHtml}` : ''}</div></div></div><div class="pro-card-badges">${categoryBadges(pro.categories)}</div><div class="pro-card-rating">${ratingHtml}</div><div class="services-line">${serviceNames}</div><div class="pro-card-footer"><span class="price-tag">${priceLine}</span><span class="view-profile">View profile →</span></div></div></a>`;
}

module.exports = function (router) {
  router.get('/', async (ctx) => {
    const featured = db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 20').all().map(proWithStats).filter(Boolean).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
    const body = `<section class="hero"><div class="container"><h1>Find a local professional you can actually trust.</h1><p class="lede">Discover barbers, hairstylists, colorists, nail technicians, and more — then book directly with the professional.</p><div class="search-card"><form method="GET" action="/search"><select name="category" aria-label="Service">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select><input type="text" name="city" placeholder="City or ZIP" /><input type="text" name="q" placeholder="Name or business" /><button class="btn" type="submit">Search</button></form></div><div class="category-pills"><a href="/search?category=barber">Barbers</a><a href="/search?category=stylist">Hairstylists</a><a href="/search?category=colorist">Colorists</a><a href="/search?category=nail_technician">Nail Technicians</a><a href="/search">Browse everyone</a></div></div></section><section class="section container"><div class="section-head"><div><h2>Top-rated professionals</h2><p class="muted" style="margin:4px 0 0;">Explore local work, services, reviews, and booking options.</p></div><a class="btn secondary small" href="/search">See all</a></div><div class="pro-grid">${featured.map(proCard).join('') || '<p class="muted">No professionals listed yet.</p>'}</div></section><section class="section container"><div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;"><div><h2 style="margin-bottom:4px;">Are you a personal-service professional?</h2><p style="margin:0;">Show your work, build trust, and send new clients straight to your booking page.</p></div><a class="btn" href="/signup?role=pro">Start 30 days free</a></div></section>`;
    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/search', async (ctx) => {
    const { category = '', city = '', q = '', minRating = '' } = ctx.query;
    let sql = 'SELECT * FROM pro_profiles WHERE 1=1'; const args = [];
    if (category) { sql += ' AND EXISTS (SELECT 1 FROM pro_categories pc WHERE pc.pro_id = pro_profiles.id AND pc.category = ?)'; args.push(category); }
    if (city) { sql += ' AND (city LIKE ? OR state LIKE ? OR zip_code LIKE ?)'; args.push(`%${city}%`, `%${city}%`, `%${city}%`); }
    if (q) { sql += ' AND (business_name LIKE ? OR workplace_name LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY id DESC';
    let results = db.prepare(sql).all(...args).map(proWithStats).filter(Boolean);
    if (minRating) { const min = Number(minRating); results = results.filter((p) => (p.rating || 0) >= min); }
    const filterLink = (overrides) => { const merged = { category, city, q, minRating, ...overrides }; const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v)); return `/search?${qs.toString()}`; };
    const heading = `${category ? slugCategory(category) + 's' : 'Professionals'}${city ? ' near ' + escapeHtml(city) : ' near you'}`;
    const body = `<section class="section container"><div class="section-head"><div><h2>${heading}</h2><p class="muted" style="margin:4px 0 0;">${results.length} professional${results.length === 1 ? '' : 's'} found</p></div>${(category || city || q || minRating) ? '<a class="btn secondary small" href="/search">Clear all filters</a>' : ''}</div><div class="search-layout"><aside class="filters"><h4>Service</h4><ul>${CATEGORIES.map((c) => `<li><a href="${filterLink({ category: c.value })}" style="display:block; padding:6px 0; font-weight:${c.value === category ? '800' : '500'}; color:${c.value === category ? 'var(--brand)' : 'inherit'};">${c.label}</a></li>`).join('')}</ul><h4 style="margin-top:18px;">City or ZIP</h4><form method="GET" action="/search" class="field" style="margin-bottom:0;"><input type="hidden" name="category" value="${escapeHtml(category)}" /><input type="hidden" name="q" value="${escapeHtml(q)}" /><input type="text" name="city" value="${escapeHtml(city)}" placeholder="City or ZIP" /><button class="btn secondary small block" type="submit" style="margin-top:8px;">Apply</button></form><h4 style="margin-top:18px;">Minimum rating</h4><ul class="checks">${[4.5, 4, 3].map((r) => `<li><a href="${filterLink({ minRating: String(r) })}" style="font-weight:${minRating == String(r) ? '800' : '500'};">${stars(r)} &amp; up</a></li>`).join('')}${minRating ? `<li style="margin-top:6px;"><a href="${filterLink({ minRating: '' })}" class="muted">Clear rating</a></li>` : ''}</ul></aside><div>${results.length ? `<div class="pro-grid">${results.map(proCard).join('')}</div>` : `<div class="empty-state"><h3>No professionals match those filters</h3><p>Try another city, ZIP code, service, or rating.</p><a class="btn secondary" href="/search">Clear filters</a></div>`}</div></div></section>`;
    send(ctx.res, layout({ title: 'Search local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/location', async (ctx) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') return send(ctx.res, 'Unauthorized', 401);
    const latitude = Number(ctx.body.latitude); const longitude = Number(ctx.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return send(ctx.res, 'Invalid location.', 400);
    const profile = db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
    if (!profile) return send(ctx.res, 'Professional profile not found.', 404);
    db.prepare('UPDATE pro_profiles SET latitude = ?, longitude = ? WHERE id = ?').run(latitude, longitude, profile.id); send(ctx.res, 'Location saved.');
  });

  router.get('/pro/:id', async (ctx) => {
    const pro = db.prepare('SELECT * FROM pro_profiles WHERE id = ?').get(ctx.params.id);
    if (!pro) return send(ctx.res, '<h1>404 — pro not found</h1>', 404);
    const ownProfile = ctx.currentUser && ctx.currentUser.role === 'pro' && db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id)?.id === pro.id;
    if (!ownProfile && !isProPubliclyVisible(pro.id)) return send(ctx.res, '<h1>404 — pro not found</h1>', 404);
    const categories = categoriesForPro(pro.id); const displayCategories = categories.length ? categories : [pro.category];
    const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(pro.id);
    const portfolio = db.prepare('SELECT * FROM portfolio_items WHERE pro_id = ? ORDER BY id DESC').all(pro.id);
    const reviews = db.prepare(`SELECT reviews.*, users.name AS customer_name FROM reviews JOIN users ON users.id = reviews.customer_id WHERE reviews.pro_id = ? ORDER BY reviews.created_at DESC`).all(pro.id);
    const rating = avgRating(reviews);
    const isOwnProfile = Boolean(ownProfile);
    let ctaHtml;
    if (isOwnProfile) ctaHtml = `<a class="btn secondary block" href="/dashboard/pro/profile">Manage your profile</a>`;
    else if (pro.booking_url) ctaHtml = `<a class="btn block profile-book-btn" href="${escapeHtml(pro.booking_url)}" target="_blank" rel="noopener noreferrer">Book Appointment <span aria-hidden="true">↗</span></a><p class="muted" style="font-size:12px; margin:8px 0 0; text-align:center;">You'll book securely on this professional's scheduling site.</p>`;
    else ctaHtml = `<div class="booking-unavailable"><strong>Online booking not connected yet</strong><p class="muted" style="margin:4px 0 0;">Check back soon for this professional's booking link.</p></div>`;
    const accentColors = ['#6d3bf0', '#a06bff', '#e8a33d', '#f2c675', '#1c8a8a', '#4fc7c0', '#d13b6f', '#ef7ba0'];
    const gradientFor = (i) => `linear-gradient(135deg, ${accentColors[i % accentColors.length]}, ${accentColors[(i + 3) % accentColors.length]})`;
    const hasLocation = Number.isFinite(Number(pro.latitude)) && Number.isFinite(Number(pro.longitude));
    const workplaceHtml = pro.workplace_name ? `<p class="profile-workplace">${escapeHtml(pro.workplace_name)}</p>` : '';
    const verifiedHtml = pro.license_verified ? `<div class="profile-verified">${verifiedBadge()} <span>License verified by GoBookr</span></div>` : '';
    const experienceHtml = Number(pro.years_experience) > 0 ? `<span class="stat"><b>${Number(pro.years_experience)}</b> yrs experience</span>` : '';
    const priceHtml = pro.price_min && pro.price_max ? `<span class="stat"><b>${money(pro.price_min)}–${money(pro.price_max)}</b> typical range</span>` : '';
    const body = `<section class="section container profile-page"><div class="profile-head"${hasLocation ? ` data-lat="${Number(pro.latitude)}" data-lon="${Number(pro.longitude)}"` : ''}><div class="avatar lg accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div><div class="meta"><div class="profile-categories">${categoryBadges(displayCategories)}</div><h1>${escapeHtml(pro.business_name)}${pro.license_verified ? verifiedBadge() : ''}</h1>${workplaceHtml}<div class="profile-location">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}${hasLocation ? ' <span aria-hidden="true">·</span> <span class="profile-distance">Use location for distance</span>' : ''}</div><div class="stat-row"><span class="stat">${rating != null ? `<span class="rating">${stars(rating)}</span> <b>${rating}</b> <span class="muted">(${reviews.length} review${reviews.length === 1 ? '' : 's'})</span>` : '<b>New</b> <span class="muted">No reviews yet</span>'}</span>${experienceHtml}${priceHtml}</div>${verifiedHtml}</div><div class="cta-col">${ctaHtml}</div></div><div class="tabs-grid"><main><div class="panel profile-about"><h2>About</h2><p>${escapeHtml(pro.bio) || 'This professional has not added a bio yet.'}</p></div><div class="panel"><div class="profile-section-head"><h2>Portfolio</h2><span class="muted">${portfolio.length} photo${portfolio.length === 1 ? '' : 's'}</span></div><div class="portfolio-grid profile-portfolio">${portfolio.length ? portfolio.map((p, i) => p.image_url ? `<figure><div class="portfolio-item"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.caption || 'Portfolio photo')}" loading="lazy" /></div>${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}</figure>` : `<figure><div class="portfolio-item" style="background:${gradientFor(i)};"><span>${escapeHtml(p.caption)}</span></div></figure>`).join('') : '<p class="muted">Portfolio photos coming soon.</p>'}</div></div><div class="panel"><div class="profile-section-head"><h2>Reviews</h2>${rating != null ? `<strong>${rating} ${stars(rating)}</strong>` : ''}</div>${reviews.length ? reviews.map((r) => `<div class="review"><div class="review-top"><span class="name">${escapeHtml(r.customer_name)}</span><span class="rating">${stars(r.rating)}</span></div><p>${escapeHtml(r.comment)}</p></div>`).join('') : '<p class="muted">No reviews yet.</p>'}</div></main><aside><div class="panel services-panel"><h2>Services &amp; pricing</h2>${services.length ? services.map((s) => `<div class="service-row"><div><div class="name">${escapeHtml(s.name)}</div><div class="duration">${s.duration_minutes} min</div></div><div class="price-tag">${money(s.price)}</div></div>`).join('') : '<p class="muted">Services coming soon.</p>'}${!isOwnProfile && pro.booking_url ? `<a class="btn block" href="${escapeHtml(pro.booking_url)}" target="_blank" rel="noopener noreferrer" style="margin-top:18px;">Book Appointment <span aria-hidden="true">↗</span></a>` : ''}</div></aside></div></section>`;
    send(ctx.res, layout({ title: `${pro.business_name} · ${pro.city}, ${pro.state}`, currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
