'use strict';

const db = require('../db');
const { favoriteIds, favoriteControl } = require('../lib/favorites');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml, money, slugCategory, avgRating, stars } = require('../lib/util');
const { isProPubliclyVisible } = require('../lib/subscription');
const { hydratePros } = require('../lib/pro-listing-data');
const { parseRadius, resolveSearchCenter, filterByRadius, filterBusinessesByRadius } = require('../lib/geo-search');
const { PROFESSIONAL_CATEGORIES, PROFESSIONAL_CATEGORY_VALUES, categoryPlural } = require('../lib/pro-categories');

const CATEGORIES = [{ value: '', label: 'All services' }, ...PROFESSIONAL_CATEGORIES.map((item) => ({ value: item.value, label: item.plural }))];
const CATEGORY_VALUES = new Set(['', ...PROFESSIONAL_CATEGORY_VALUES]);
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
function safeBookingUrl(value) {
  const url = safeExternalUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  // A city/category directory cannot book this individual professional.
  if (/(^|\.)booksy\.com$/i.test(parsed.hostname) && /^\/en-us\/s\//i.test(parsed.pathname)) return '';
  return url;
}
function categoryBadges(categories) { return (categories || []).map((category) => `<span class="badge category">${escapeHtml(slugCategory(category))}</span>`).join(' '); }
function verifiedBadge() { return `<span class="verified-badge" title="License verified by GoBookr" aria-label="License verified by GoBookr"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.2 2.1 3-.4.9 2.9 2.7 1.4-.9 2.9 1.3 2.7-2.4 1.8-.1 3-3 .5-2 2.3-2.7-1.3-2.7 1.3-2-2.3-3-.5-.1-3-2.4-1.8 1.3-2.7-.9-2.9 2.7-1.4.9-2.9 3 .4L12 2.5z"/><path d="M8.4 12.1l2.2 2.2 5-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`; }
function claimBadge(pro) {
  if (pro.claim_status === 'unclaimed') return `<span class="badge" style="background:#eef4ff;color:#0b1f3a;border:1px solid #c8d8f2;">Unclaimed profile</span>`;
  if (pro.claim_status === 'claim_pending') return `<span class="badge" style="background:#f7f7f7;color:#555;border:1px solid #ddd;">Claim pending</span>`;
  return '';
}
function proCard(pro, ctx, savedIds) {
  const licenseVerified = Number(pro.license_verified) === 1 && Boolean(pro.license_number && pro.license_state);
  const startingPrice = pro.services && pro.services.length ? money(Math.min(...pro.services.map((s) => Number(s.price)).filter(Number.isFinite))) + '+' : (pro.price_min ? money(pro.price_min) + '+' : 'Pricing varies');
  const ratingHtml = pro.rating != null
    ? `<div class="market-rating"><span class="market-star" aria-hidden="true">★</span><strong>${pro.rating}</strong><span class="market-review-count">(${pro.reviewCount} review${pro.reviewCount === 1 ? '' : 's'})</span></div>`
    : `<div class="market-new">New on GoBookr</div>`;
  const specialties = (pro.categories || [pro.category]).filter(Boolean);
  const specialtyLabels = specialties.slice(0, 3).map((category) => escapeHtml(slugCategory(category))).join(' · ');
  const extraSpecialties = specialties.length > 3 ? ` <span class="market-specialty-more">+${specialties.length - 3}</span>` : '';
  const serviceNames = pro.services.slice(0, 2).map((s) => escapeHtml(s.name)).join(' · ');
  const specialtyHtml = specialtyLabels ? `<div class="market-specialties" aria-label="Specialties">${specialtyLabels}${extraSpecialties}</div>` : '';
  const hasLocation = pro.latitude !== null && pro.latitude !== '' && pro.longitude !== null && pro.longitude !== '' && Number.isFinite(Number(pro.latitude)) && Number.isFinite(Number(pro.longitude));
  const locationAttrs = hasLocation ? ` data-lat="${Number(pro.latitude)}" data-lon="${Number(pro.longitude)}"` : '';
  const distanceHtml = Number.isFinite(Number(pro.distanceMiles)) ? `<span class="market-distance">${Number(pro.distanceMiles).toFixed(1)} mi away</span>` : '';
  const workplaceHtml = pro.workplace_name ? `<div class="market-workplace">${escapeHtml(pro.workplace_name)}</div>` : '';
  const photoHtml = pro.profile_photo_url
    ? `<img class="market-avatar-img" src="${escapeHtml(pro.profile_photo_url)}" alt="${escapeHtml(pro.business_name)} profile photo" loading="lazy" />`
    : pro.coverPhoto
      ? `<img class="market-avatar-img" src="${escapeHtml(pro.coverPhoto.image_url)}" alt="${escapeHtml(pro.coverPhoto.caption || pro.business_name)}" loading="lazy" />`
      : `<div class="market-avatar-fallback accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div>`;
  const verified = licenseVerified ? `<span class="market-verified">${verifiedBadge()}<span>Verified</span></span>` : '';
  const claim = pro.claim_status === 'unclaimed' ? `<span class="market-status">Unclaimed</span>` : '';
  const claimAction = pro.claim_status === 'unclaimed' ? `<a class="market-claim-link" href="/pro/${pro.id}/claim">Is this you? Claim profile</a>` : '';
  return `<div class="favorite-card"><a class="pro-card market-pro-card" href="/pro/${pro.id}"${locationAttrs}>
    <div class="market-pro-inner">
      <div class="market-avatar-wrap">${photoHtml}</div>
      <div class="market-pro-info">
        <div class="market-name-row"><h3>${escapeHtml(pro.business_name)}</h3>${licenseVerified ? verifiedBadge() : ''}</div>
        ${pro.professional_handle ? `<div class="market-handle">@${escapeHtml(pro.professional_handle)}</div>` : ''}
        ${workplaceHtml}
        <div class="market-trust-row">${verified}${claim}</div>
        ${ratingHtml}
        ${specialtyHtml}
        ${serviceNames ? `<div class="market-service">${serviceNames}</div>` : ''}
        <div class="market-meta"><span class="market-price">From ${startingPrice}</span>${distanceHtml}${pro.city ? `<span class="market-place">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</span>` : ''}</div>
      </div>
      <span class="market-chevron" aria-hidden="true">›</span>
    </div>
  </a>${claimAction}${favoriteControl(pro, ctx, savedIds.has(Number(pro.id)))}</div>`;
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
  router.get('/pricing', async (ctx) => {
    const body = `<section class="section container narrow"><h1>GoBookr pricing</h1><div class="panel"><h2>GoBookr Professional</h2><p class="lede"><strong>30 days free, then $20/month</strong></p><p>Claim or create your profile, finish setup, and connect your existing booking page. Activate paid billing to continue after your trial. Once activated, your subscription renews monthly unless canceled.</p><p>No paid subscription is created just because you appear in the directory. If your trial expires before billing is activated, your professional profile may be hidden until you activate billing.</p><p>Use your billing dashboard to manage or cancel an activated subscription. Your cancellation date appears in the payment provider's subscription portal.</p><a class="btn" href="/signup?role=pro">Get started</a></div><div class="panel"><h2>GoBookr Business</h2><p class="lede"><strong>Complimentary</strong></p><p>Business accounts have no membership fee and need no payment setup. Individual professional memberships are separate.</p><a class="btn secondary" href="/business-account">For businesses</a></div><p class="muted">Customers browse GoBookr without a membership fee. Appointment prices, availability and cancellation policies are set by the professional's external booking provider.</p></section>`;
    send(ctx.res, layout({title:'Pricing · 30 days free, then $20/month', description:'GoBookr Professional offers a 30-day free trial, then $20/month with activated billing. Business accounts are complimentary.',canonical:'https://gobookr.com/pricing',currentUser:ctx.currentUser,session:ctx.session,body}));
  });
  router.get('/', async (ctx) => {
    const featured = hydratePros(db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 20').all()).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
    const savedIds = favoriteIds(ctx, featured);
    const body = `<section class="hero"><div class="container"><h1>Find a local professional you can actually trust.</h1><p class="lede">Discover barbers, hairstylists, colorists, nail technicians, lash and brow professionals, waxing specialists, massage therapists, tattoo artists, and more — then book directly with the professional.</p><div class="search-card"><form method="GET" action="/search"><select name="category" aria-label="Service">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select><input type="text" name="city" maxlength="100" placeholder="City or ZIP" /><select name="radius" aria-label="Search radius"><option value="1">1 mile</option><option value="2">2 miles</option><option value="3">3 miles</option><option value="4">4 miles</option><option value="5" selected>5 miles</option><option value="7">7 miles</option><option value="9">9 miles</option><option value="11">11 miles</option><option value="13">13 miles</option><option value="15">15 miles</option><option value="17">17 miles</option><option value="19">19 miles</option></select><input type="hidden" name="lat" value="" /><input type="hidden" name="lon" value="" /><input type="text" name="q" maxlength="100" placeholder="Name, @handle, or business" /><button class="btn" type="submit">Search</button></form></div><div class="category-pills">${CATEGORIES.filter((c) => c.value).map((c) => `<a href="/search?category=${c.value}">${c.label}</a>`).join('')}<a href="/search">Browse everyone</a></div><div class="seo-local-links"><strong>Explore Denver professionals</strong><div class="category-pills">${CATEGORIES.filter((item)=>item.value).map((item)=>`<a href="/discover/denver/${item.value}">${item.label} in Denver</a>`).join('')}</div></div></div></section><section class="section container discovery-page"><div class="section-head"><div><h2>Top-rated professionals</h2><p class="muted" style="margin:4px 0 0;">Explore local work, services, reviews, and booking options.</p></div><a class="btn secondary small" href="/search">See all</a></div><div class="pro-grid">${featured.map(pro => proCard(pro, ctx, savedIds)).join('') || '<p class="muted">No professionals listed yet.</p>'}</div></section><section class="section container"><div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;"><div><h2 style="margin-bottom:4px;">Are you a personal-service professional?</h2><p style="margin:0;">Show your work, build trust, and send new clients straight to your booking page.</p></div><a class="btn" href="/signup?role=pro">Start 30 days free</a></div></section>`;
    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/discover/:city/:category', async (ctx) => {
    const citySlug = queryText(ctx.params.city, 80).toLowerCase(); const category = queryText(ctx.params.category, 40);
    if (!/^[a-z0-9-]+$/.test(citySlug)) return send(ctx.res, '<h1>404 — page not found</h1>', 404);
    if (!CATEGORY_VALUES.has(category) || !category) return send(ctx.res, '<h1>404 — page not found</h1>', 404);
    const cityName = citySlug.split('-').filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');
    if (!cityName) return send(ctx.res, '<h1>404 — page not found</h1>', 404);
    const rows = db.prepare("SELECT * FROM pro_profiles WHERE LOWER(city) = LOWER(?) AND EXISTS (SELECT 1 FROM pro_categories pc WHERE pc.pro_id = pro_profiles.id AND pc.category = ?) ORDER BY id DESC LIMIT 100").all(cityName, category);
    const results = hydratePros(rows); const savedIds = favoriteIds(ctx, results); const categoryLabel = slugCategory(category); const canonical = 'https://gobookr.com/discover/' + encodeURIComponent(citySlug) + '/' + encodeURIComponent(category);
    const relatedCategories = new Set(db.prepare("SELECT DISTINCT pc.category FROM pro_profiles p JOIN pro_categories pc ON pc.pro_id=p.id WHERE LOWER(p.city)=LOWER(?)").all(cityName).map((row)=>row.category));
    const related = CATEGORIES.filter((item)=>item.value && item.value!==category && relatedCategories.has(item.value)).slice(0,8).map((item)=>`<a href="/discover/${encodeURIComponent(citySlug)}/${item.value}">${item.label} in ${escapeHtml(cityName)}</a>`).join('');
    const body = `<section class="section container search-results-page"><div class="results-toolbar"><div><a class="back-search" href="/search">‹ Browse all</a><h1>${escapeHtml(categoryLabel)} in ${escapeHtml(cityName)}</h1><p>${results.length ? `${results.length} local ${results.length === 1 ? 'professional' : 'professionals'} · ` : ''}Compare portfolios, reviews, services, and booking options.</p></div></div><div class="pro-grid">${results.map(pro=>proCard(pro,ctx,savedIds)).join('') || `<div class="empty-state"><h3>More professionals coming soon</h3><p>Try another service or browse all professionals near ${escapeHtml(cityName)}.</p><a class="btn secondary" href="/search?city=${encodeURIComponent(cityName)}">Browse ${escapeHtml(cityName)}</a></div>`}</div>${related ? `<nav class="seo-related" aria-label="Related local services"><h2>More professionals in ${escapeHtml(cityName)}</h2><div class="category-pills">${related}</div></nav>` : ''}</section>`;
    const structuredData = results.length ? {
      '@context': 'https://schema.org', '@type': 'CollectionPage', url: canonical, name: `${categoryLabel} in ${cityName}`,
      mainEntity: { '@type': 'ItemList', numberOfItems: results.length, itemListElement: results.map((pro, index) => ({
        '@type': 'ListItem', position: index + 1, name: pro.business_name, url: `https://gobookr.com/pro/${pro.id}`,
      })) },
    } : null;
    send(ctx.res, layout({ title:`${categoryLabel} in ${cityName}`, description:`Find ${categoryLabel.toLowerCase()} in ${cityName}. Compare local professionals, portfolios, reviews, services, and booking options on GoBookr.`, canonical, structuredData, robots:results.length ? 'index,follow' : 'noindex,follow', currentUser:ctx.currentUser, session:ctx.session, body }));
  });

  router.get('/openings', async (ctx) => {
    const city = queryText(ctx.query.city, 100);
    const requestedCategory = queryText(ctx.query.category, 40);
    const category = CATEGORY_VALUES.has(requestedCategory) ? requestedCategory : '';
    let openings = [];
    try {
      let sql = `SELECT mc.id AS campaign_id, mc.available_slots, mc.copy, mc.created_at, p.*
        FROM marketing_campaigns mc
        JOIN pro_profiles p ON p.id = mc.pro_id
        WHERE mc.status = 'published'
          AND mc.campaign_type IN ('openings-today','last-minute')
          AND mc.created_at >= CURRENT_DATE`;
      const args = [];
      if (city) { sql += " AND (p.city LIKE ? ESCAPE '\\\\' OR p.state LIKE ? ESCAPE '\\\\' OR p.zip_code LIKE ? ESCAPE '\\\\')"; const value = likeValue(city); args.push(value, value, value); }
      if (category) { sql += ' AND EXISTS (SELECT 1 FROM pro_categories pc WHERE pc.pro_id = p.id AND pc.category = ?)'; args.push(category); }
      sql += ' ORDER BY mc.created_at DESC LIMIT 100';
      openings = db.prepare(sql).all(...args);
    } catch (err) { console.error('Public openings unavailable', err); }
    const visible = hydratePros(openings);
    const savedIds = favoriteIds(ctx, visible);
    const cards = visible.map((pro) => {
      const slots = Array.isArray(pro.available_slots) ? pro.available_slots.filter(Boolean).slice(0, 8) : [];
      return `<div class="opening-card"><div class="opening-card-head"><span class="badge category">Available today</span><span class="muted">${slots.length} open ${slots.length === 1 ? 'time' : 'times'}</span></div>${proCard(pro, ctx, savedIds)}<div class="opening-times">${slots.map((slot) => `<span>${escapeHtml(slot)}</span>`).join('')}</div><a class="btn block" href="/pro/${pro.id}/opening">See today’s openings</a></div>`;
    }).join('');
    const categoryOptions = CATEGORIES.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === category ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
    const filter = `<form class="openings-filter" method="GET" action="/openings"><label><span>Service</span><select name="category">${categoryOptions}</select></label><label><span>City or ZIP</span><input name="city" value="${escapeHtml(city)}" maxlength="100" placeholder="Denver" /></label><button class="btn" type="submit">Find openings</button>${city || category ? '<a class="btn ghost" href="/openings">Clear</a>' : ''}</form>`;
    const summary = visible.length ? `${visible.length} professional${visible.length === 1 ? '' : 's'} with openings today` : 'No matching openings posted yet today';
    const openingCount = visible.reduce((total, pro) => total + (Array.isArray(pro.available_slots) ? pro.available_slots.filter(Boolean).length : 0), 0);
    const body = `<section class="section container"><div class="results-toolbar"><div><span class="badge category">Openings Today</span><h1>Appointments you can grab today</h1><p>These times were posted by local professionals today. Availability can change, so confirm the time on the professional's booking page.</p></div><a class="btn secondary" href="/search">Browse all professionals</a></div>${filter}<p class="openings-summary" aria-live="polite">${escapeHtml(summary)}${openingCount ? ` · ${openingCount} posted ${openingCount === 1 ? 'time' : 'times'}` : ''}</p><div class="openings-grid">${cards || '<div class="empty-state"><h3>No openings match that search yet</h3><p>Try another service or location, browse professionals nearby, or check back as pros post last-minute availability.</p><a class="btn" href="/search">Find a professional</a></div>'}</div></section>`;
    send(ctx.res, layout({ title: 'Openings Today', description: 'Find same-day appointments posted by local personal-service professionals on GoBookr.', canonical: 'https://gobookr.com/openings', robots: city || category || !visible.length ? 'noindex,follow' : 'index,follow', currentUser: ctx.currentUser, session: ctx.session, body }));
  });

  router.get('/pro/:id/opening', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) return redirect(ctx.res, '/openings');
    const pro = hydratePros(db.prepare('SELECT * FROM pro_profiles WHERE id = ?').all(id))[0];
    if (!pro) return redirect(ctx.res, '/openings?error=' + encodeURIComponent('That professional is not currently available.'));
    let opening = null;
    try { opening = db.prepare("SELECT id, available_slots, copy FROM marketing_campaigns WHERE pro_id = ? AND status = 'published' AND campaign_type IN ('openings-today','last-minute') AND created_at >= CURRENT_DATE ORDER BY created_at DESC LIMIT 1").get(id) || null; } catch (err) { console.error('Opening detail unavailable', err); }
    if (!opening) return redirect(ctx.res, '/pro/' + id);
    const slots = Array.isArray(opening.available_slots) ? opening.available_slots.filter(Boolean).slice(0, 8) : [];
    const bookingHref = '/book/' + id + '?source=openings-today';
    const shareUrl = 'https://gobookr.com/pro/' + id + '/opening';
    const shareText = pro.business_name + ' has openings today on GoBookr.';
    const body = `<section class="section container narrow"><a class="back-link" href="/openings">← Openings Today</a><div class="opening-detail"><span class="badge category">Available today</span><h1>${escapeHtml(pro.business_name)}</h1>${pro.city ? `<p class="muted">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</p>` : ''}<p>${escapeHtml(opening.copy || 'I have openings today.')}</p><div class="opening-times opening-times-large">${slots.map((slot) => `<span>${escapeHtml(slot)}</span>`).join('')}</div>${pro.booking_url ? `<a class="btn block" href="${bookingHref}">Check availability &amp; book</a>` : '<a class="btn block" href="/pro/' + id + '">View professional profile</a>'}<p class="helptext">Times are posted by the professional and can change. Confirm the appointment time on their booking page before making plans.</p><div class="opening-detail-actions"><button class="btn secondary block opening-share" type="button" data-share-url="${escapeHtml(shareUrl)}" data-share-text="${escapeHtml(shareText)}">Share these openings</button><a class="btn ghost block" href="/pro/${id}">See full profile &amp; work</a></div></div></section><script>(()=>{const b=document.querySelector('.opening-share');if(!b)return;b.addEventListener('click',async()=>{const data={title:'Openings Today · GoBookr',text:b.dataset.shareText,url:b.dataset.shareUrl};try{if(navigator.share){await navigator.share(data);return;}await navigator.clipboard.writeText(data.url);b.textContent='Link copied';setTimeout(()=>b.textContent='Share these openings',1800);}catch(e){if(e&&e.name!=='AbortError')b.textContent='Copy the page link to share';}});})();</script>`;
    send(ctx.res, layout({ title: `Today's openings · ${pro.business_name}`, description: `See today's appointment openings posted by ${pro.business_name} on GoBookr.`, canonical: shareUrl, shareImage: pro.profile_photo_url || pro.image_url || '', robots: 'noindex,follow', currentUser: ctx.currentUser, session: ctx.session, body }));
  });

  router.get('/search', async (ctx) => {
    const requestedCategory = queryText(ctx.query.category, 40); const category = CATEGORY_VALUES.has(requestedCategory) ? requestedCategory : '';
    const city = queryText(ctx.query.city, 100); const q = queryText(ctx.query.q, 100); const requestedType = queryText(ctx.query.type, 20); const resultType = RESULT_TYPES.has(requestedType) ? requestedType : 'all';
    const radius = parseRadius(ctx.query.radius); const latText = queryText(ctx.query.lat, 30); const lonText = queryText(ctx.query.lon, 30); const lat = Number(latText); const lon = Number(lonText); const hasGps = latText !== '' && lonText !== '' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180 && radius !== null;
    const manualCenter = !hasGps && city && radius ? resolveSearchCenter(city) : null;
    const radiusBounds = hasGps || manualCenter ? require('../lib/geo-search').boundingBox(hasGps ? lat : manualCenter.latitude, hasGps ? lon : manualCenter.longitude, radius) : null;
    const radiusLat = hasGps ? lat : (manualCenter ? manualCenter.latitude : null); const radiusLon = hasGps ? lon : (manualCenter ? manualCenter.longitude : null); const hasRadiusCenter = hasGps || Boolean(manualCenter);
    let sql = "SELECT pro_profiles.* FROM pro_profiles LEFT JOIN subscriptions search_sub ON search_sub.pro_id=pro_profiles.id WHERE ((pro_profiles.user_id IS NULL AND pro_profiles.claim_status IN ('unclaimed','claim_pending') AND COALESCE(pro_profiles.business_name,'') <> '' AND COALESCE(pro_profiles.city,'') <> '' AND COALESCE(pro_profiles.state,'') <> '' AND COALESCE(pro_profiles.source_url,'') <> '' AND COALESCE(pro_profiles.source_name,'') <> '') OR (pro_profiles.user_id IS NOT NULL AND pro_profiles.onboarding_completed=1 AND (search_sub.status='active' OR (search_sub.status='trialing' AND search_sub.trial_ends_at > CURRENT_TIMESTAMP) OR (search_sub.status IN ('past_due','unpaid') AND search_sub.past_due_since IS NOT NULL AND search_sub.past_due_since > CURRENT_TIMESTAMP - INTERVAL '7 days'))))"; const args = [];
    if (category) { sql += ' AND EXISTS (SELECT 1 FROM pro_categories pc WHERE pc.pro_id = pro_profiles.id AND pc.category = ?)'; args.push(category); }
    if (city && !hasRadiusCenter) { sql += " AND (city LIKE ? ESCAPE '\\' OR state LIKE ? ESCAPE '\\' OR zip_code LIKE ? ESCAPE '\\')"; const value = likeValue(city); args.push(value, value, value); }
    if (q) { const cleanQ = q.replace(/^@+/, ''); sql += " AND (business_name LIKE ? ESCAPE '\\' OR professional_handle LIKE ? ESCAPE '\\' OR workplace_name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM services qs WHERE qs.pro_id = pro_profiles.id AND qs.name LIKE ? ESCAPE '\\') OR EXISTS (SELECT 1 FROM pro_categories qc WHERE qc.pro_id = pro_profiles.id AND REPLACE(qc.category, '_', ' ') LIKE ? ESCAPE '\\'))"; const value = likeValue(cleanQ); args.push(value, value, value, value, value); }
    if (radiusBounds) { sql += ' AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?'; args.push(radiusBounds.minLat, radiusBounds.maxLat, radiusBounds.minLon, radiusBounds.maxLon); }
    sql += ' ORDER BY id DESC LIMIT 200';
    let results = hydratePros(db.prepare(sql).all(...args));
    const radiusResult = await filterByRadius(results, radiusLat, radiusLon, radius);
    results = radiusResult.profiles;
    if (resultType === 'businesses') results = [];
    let businessSql = 'SELECT * FROM shops WHERE 1=1'; const businessArgs = [];
    if (city && !hasRadiusCenter) { businessSql += " AND (city LIKE ? OR state LIKE ? OR zip_code LIKE ?)"; const value = likeValue(city); businessArgs.push(value, value, value); }
    if (q) { businessSql += " AND name LIKE ?"; businessArgs.push(likeValue(q)); }
    if (radiusBounds) { businessSql += ' AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?'; businessArgs.push(radiusBounds.minLat, radiusBounds.maxLat, radiusBounds.minLon, radiusBounds.maxLon); }
    businessSql += ' ORDER BY id DESC LIMIT 100';
    let businesses = [];
    try { businesses = db.prepare(businessSql).all(...businessArgs); } catch (err) { console.error('Business search unavailable', err); }
    if (hasRadiusCenter && businesses.length) { const businessRadiusResult = await filterBusinessesByRadius(businesses, radiusLat, radiusLon, radius); businesses = businessRadiusResult.businesses; }
    if (category || resultType === 'professionals') businesses = [];
    const totalResults = results.length + businesses.length;
    ctx.analyticsSearchResults = totalResults;
    const filterLink = (overrides) => { const merged = { type: resultType === 'all' ? '' : resultType, category, city, q, radius: radius || '', lat: hasGps ? lat : '', lon: hasGps ? lon : '', ...overrides }; const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v !== '' && v !== null && v !== undefined)); return `/search?${qs.toString()}`; };
    const centerLabel = hasGps ? 'your location' : (manualCenter ? manualCenter.label : city);
    const savedIds = favoriteIds(ctx, results);
    const broadenDistance = radius !== null && radius < 19 ? [1,2,3,4,5,7,9,11,13,15,17,19].find((m) => m > radius) : null;
    const emptySearchActions = [
      broadenDistance ? `<a class="btn" href="${filterLink({ radius: broadenDistance })}">Search within ${broadenDistance} miles</a>` : '',
      category ? `<a class="btn secondary" href="${filterLink({ category: '' })}">Browse all services</a>` : '',
      q ? `<a class="btn secondary" href="${filterLink({ q: '' })}">Clear name or business</a>` : '',
      `<a class="btn ghost" href="/#find">Start a new search</a>`,
    ].filter(Boolean).join('');
    const body = `<section class="section container search-results-page"><div class="results-toolbar"><div><a class="back-search" href="/#find">‹ Change search</a><h1>${resultType === 'businesses' ? 'Businesses' : resultType === 'professionals' ? 'Professionals' : 'Results'}${city ? ' near ' + escapeHtml(city) : ''}</h1><p>${totalResults} result${totalResults === 1 ? '' : 's'}${hasRadiusCenter ? ' · within ' + radius + ' miles of ' + escapeHtml(centerLabel) : ''}</p></div><div class="results-actions"><div class="result-type-tabs">${[['all','All'],['professionals','Pros'],['businesses','Businesses']].map(([value,label]) => '<a href="' + filterLink({ type: value === 'all' ? '' : value }) + '" class="' + (resultType === value ? 'active' : '') + '">' + label + '</a>').join('')}</div><label class="distance-control"><span>Distance</span><select onchange="window.location.href=this.value"><option value="${filterLink({ radius: '' })}"${radius === null ? ' selected' : ''}>Any distance</option>${[1,2,3,4,5,7,9,11,13,15,17,19].map((m) => '<option value="' + filterLink({ radius:m }) + '"' + (radius === m ? ' selected' : '') + '>' + m + ' mi</option>').join('')}</select></label></div></div>${totalResults ? `<div class="pro-grid">${results.map(pro => proCard(pro, ctx, savedIds)).join('')}${businesses.map(businessCard).join('')}</div>` : `<div class="empty-state"><h3>No exact matches yet</h3><p>Keep your search and broaden one thing at a time. GoBookr will keep the rest of your filters in place.</p><div class="empty-search-actions">${emptySearchActions}</div></div>`}</section>`;
    const searchTitle = category ? `${slugCategory(category)} near ${city || 'you'}` : `Personal-service professionals${city ? ' near ' + city : ''}`;
    send(ctx.res, layout({ title: searchTitle, description: `Find ${category ? slugCategory(category).toLowerCase() : 'personal-service professionals'}${city ? ' in ' + city : ''}. Compare profiles, work, reviews, and booking options on GoBookr.`, canonical: 'https://gobookr.com/search' + (category || city ? '?' + new URLSearchParams(Object.entries({ category, city }).filter(([,v])=>v)).toString() : ''), robots: q || hasGps ? 'noindex,follow' : 'index,follow', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
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
    const bookingUrl = safeBookingUrl(pro.booking_url);
    if (!bookingUrl) return redirect(ctx.res, '/pro/' + proId + '?error=' + encodeURIComponent('Online booking is not connected yet.'));
    try {
      db.prepare('INSERT INTO booking_clicks (pro_id, customer_user_id) VALUES (?, ?)').run(proId, ctx.currentUser ? ctx.currentUser.id : null);
      db.prepare("INSERT INTO pro_events (pro_id, event_type, actor_user_id, source) VALUES (?, 'booking_click', ?, ?)").run(proId, ctx.currentUser ? ctx.currentUser.id : null, queryText(ctx.query.source, 80).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'profile');
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
    const licenseVerified = Number(pro.license_verified) === 1 && Boolean(pro.license_number && pro.license_state);
    const rating = avgRating(reviews); const isOwnProfile = Boolean(ownProfile); const bookingUrl = safeBookingUrl(pro.booking_url);
    let todayOpening = null;
    try { todayOpening = db.prepare("SELECT id, available_slots FROM marketing_campaigns WHERE pro_id = ? AND status = 'published' AND campaign_type IN ('openings-today','last-minute') AND created_at >= CURRENT_DATE ORDER BY created_at DESC LIMIT 1").get(pro.id); }
    catch (err) { console.error('Profile opening lookup failed', err); }
    const todaySlots = todayOpening && Array.isArray(todayOpening.available_slots) ? todayOpening.available_slots.filter(Boolean).slice(0, 8) : [];
    const openingHtml = todaySlots.length ? `<div class="profile-opening-banner"><div><span class="badge category">Available today</span><strong>${todaySlots.length === 1 ? 'An appointment just opened up' : todaySlots.length + ' appointments are open today'}</strong><div class="opening-times">${todaySlots.map((slot) => `<span>${escapeHtml(slot)}</span>`).join('')}</div><p>Posted by this professional today. Confirm availability when you book.</p></div>${bookingUrl && !isOwnProfile ? `<a class="btn" href="${escapeHtml('/book/' + pro.id + '?source=profile-opening')}">Book an opening</a>` : ''}</div>` : '';
    if (!isOwnProfile) {
      try { db.prepare("INSERT INTO pro_events (pro_id, event_type, actor_user_id, source) VALUES (?, 'profile_view', ?, ?)").run(pro.id, ctx.currentUser ? ctx.currentUser.id : null, queryText(ctx.query.source, 80).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'marketplace'); }
      catch (err) { console.error('Profile view tracking failed', err); }
    }
    const attributionSource = queryText(ctx.query.source, 80).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
    const bookingHref = '/book/' + pro.id + (attributionSource ? '?source=' + encodeURIComponent(attributionSource) : '');
    const bookingLabel = bookingUrl && /\/(services|team)\/?$/.test(new URL(bookingUrl).pathname) ? 'Book with this business' : 'Book Appointment';
    let ctaHtml;
    if (isOwnProfile) ctaHtml = `<a class="btn secondary block" href="/dashboard/pro/profile">Manage your profile</a>`;
    else if (pro.claim_status === 'unclaimed') ctaHtml = `${bookingUrl ? `<a class="btn block profile-book-btn" href="${escapeHtml(bookingHref)}">${bookingLabel} <span aria-hidden="true">↗</span></a>` : ''}<a class="btn secondary block" href="/pro/${pro.id}/claim" style="margin-top:10px;">Claim this profile</a><p class="muted" style="font-size:12px;margin:8px 0 0;text-align:center;">Are you this professional? Verify ownership to manage this listing.</p>`;
    else if (pro.claim_status === 'claim_pending') ctaHtml = `${bookingUrl ? `<a class="btn block profile-book-btn" href="${escapeHtml(bookingHref)}">${bookingLabel} <span aria-hidden="true">↗</span></a>` : ''}<div class="booking-unavailable" style="margin-top:10px;"><strong>Claim pending</strong><p class="muted" style="margin:4px 0 0;">GoBookr is verifying ownership of this profile.</p></div>`;
    else if (bookingUrl) ctaHtml = `<a class="btn block profile-book-btn" href="${escapeHtml(bookingHref)}">${bookingLabel} <span aria-hidden="true">↗</span></a><p class="muted" style="font-size:12px;margin:8px 0 0;text-align:center;">You'll book on this professional's scheduling site.</p>`;
    else ctaHtml = `<div class="booking-unavailable"><strong>Online booking not connected yet</strong><p class="muted" style="margin:4px 0 0;">Check back soon for this professional's booking link.</p></div>`;
    const accentColors = ['#6d3bf0','#a06bff','#e8a33d','#f2c675','#1c8a8a','#4fc7c0','#d13b6f','#ef7ba0']; const gradientFor = (i) => `linear-gradient(135deg, ${accentColors[i % accentColors.length]}, ${accentColors[(i + 3) % accentColors.length]})`;
    const hasLocation = pro.latitude !== null && pro.latitude !== '' && pro.longitude !== null && pro.longitude !== '' && Number.isFinite(Number(pro.latitude)) && Number.isFinite(Number(pro.longitude)); const workplaceHtml = pro.workplace_name ? `<p class="profile-workplace">${escapeHtml(pro.workplace_name)}</p>` : '';
    const verifiedHtml = licenseVerified ? `<div class="profile-verified">${verifiedBadge()} <span>License verified by GoBookr</span></div>` : ''; const experienceHtml = Number(pro.years_experience) > 0 ? `<span class="stat"><b>${Number(pro.years_experience)}</b> yrs experience</span>` : ''; const priceHtml = pro.price_min && pro.price_max ? `<span class="stat"><b>${money(pro.price_min)}–${money(pro.price_max)}</b> typical range</span>` : '';
    const body = `<section class="section container profile-page"><div class="profile-head"${hasLocation ? ` data-lat="${Number(pro.latitude)}" data-lon="${Number(pro.longitude)}"` : ''}>${pro.profile_photo_url ? `<div class="avatar lg profile-photo-avatar"><img src="${escapeHtml(pro.profile_photo_url)}" alt="${escapeHtml(pro.business_name)} profile photo" /></div>` : `<div class="avatar lg accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div>`}<div class="meta"><div style="margin-bottom:8px;">${claimBadge(pro)}</div><div class="profile-categories">${categoryBadges(displayCategories)}</div><h1>${escapeHtml(pro.business_name)}${licenseVerified ? verifiedBadge() : ''}</h1>${pro.professional_handle ? `<div class="profile-handle">@${escapeHtml(pro.professional_handle)}</div>` : ''}${workplaceHtml}<div class="profile-location">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}${hasLocation ? ' <span aria-hidden="true">·</span> <span class="profile-distance">Use location for distance</span>' : ''}</div><div class="stat-row"><span class="stat">${rating != null ? `<span class="rating">${stars(rating)}</span> <b>${rating}</b> <span class="muted">(${reviews.length} review${reviews.length === 1 ? '' : 's'})</span>` : '<b>New</b> <span class="muted">No reviews yet</span>'}</span>${experienceHtml}${priceHtml}</div>${verifiedHtml}</div><div class="cta-col">${favoriteControl(pro, ctx, favoriteIds(ctx, [pro]).has(Number(pro.id)))}${ctaHtml}</div></div>${openingHtml}<div class="profile-mobile-actions">${!isOwnProfile && bookingUrl ? `<a class="btn block" href="${escapeHtml(bookingHref)}">${bookingLabel} <span aria-hidden="true">↗</span></a>` : ''}${!isOwnProfile ? favoriteControl(pro, ctx, favoriteIds(ctx, [pro]).has(Number(pro.id))) : ''}${!isOwnProfile && pro.claim_status === 'unclaimed' ? `<a class="btn secondary block" href="/pro/${pro.id}/claim">Claim this profile</a>` : ''}</div><div class="tabs-grid"><main><div class="panel profile-about"><h2>About</h2><p>${escapeHtml(pro.bio) || (isOwnProfile ? 'Add an About section so customers understand your specialties and what to expect.' : 'More details from this professional are coming soon.')}</p></div><div class="panel"><div class="profile-section-head"><h2>Portfolio</h2><span class="muted">${portfolio.length} photo${portfolio.length === 1 ? '' : 's'}</span></div><div class="portfolio-grid profile-portfolio">${portfolio.length ? portfolio.map((p,i) => p.image_url ? `<figure><div class="portfolio-item"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.caption || 'Portfolio photo')}" loading="lazy" /></div>${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}</figure>` : `<figure><div class="portfolio-item" style="background:${gradientFor(i)};"><span>${escapeHtml(p.caption)}</span></div></figure>`).join('') : isOwnProfile ? '<p class="muted">Add portfolio photos to show customers your work.</p>' : '<p class="muted">More work from this professional is coming soon.</p>'}</div></div><div class="panel"><div class="profile-section-head"><h2>Reviews</h2>${rating != null ? `<strong>${rating} ${stars(rating)}</strong>` : ''}</div>${reviews.length ? reviews.map((r) => `<div class="review"><div class="review-top"><span class="name">${escapeHtml(r.customer_name)}</span><span class="rating">${stars(r.rating)}</span></div><p>${escapeHtml(r.comment)}</p></div>`).join('') : '<p class="muted">No reviews yet.</p>'}</div></main><aside><div class="panel services-panel"><h2>Services &amp; pricing</h2>${services.length ? services.map((s) => `<div class="service-row"><div><div class="name">${escapeHtml(s.name)}</div><div class="duration">${Number(s.duration_minutes) || 0} min</div></div><div class="price-tag">${money(s.price)}</div></div>`).join('') : '<p class="muted">Services coming soon.</p>'}${!isOwnProfile && bookingUrl ? `<a class="btn block" href="${escapeHtml(bookingHref)}" style="margin-top:18px;">${bookingLabel} <span aria-hidden="true">↗</span></a>` : ''}</div>${socialLinks(pro)}</aside></div></section>`;
    const profileUrl = 'https://gobookr.com/pro/' + pro.id;
    const structuredData = { '@context': 'https://schema.org', '@type': 'Person', name: pro.business_name, url: profileUrl, description: pro.bio || undefined, image: pro.profile_photo_url || (portfolio.find((item) => item.image_url) || {}).image_url || undefined, jobTitle: displayCategories.map(slugCategory).join(', '), address: (pro.city || pro.state) ? { '@type': 'PostalAddress', addressLocality: pro.city || undefined, addressRegion: pro.state || undefined } : undefined, worksFor: pro.workplace_name ? { '@type': 'Organization', name: pro.workplace_name } : undefined };
    // Ratings remain visible in the profile UI. Schema.org does not allow
    // aggregateRating on Person; do not relabel a person as a business to force it.
    send(ctx.res, layout({ title: `${pro.business_name} · ${pro.city}, ${pro.state}`, description: `View ${pro.business_name}${pro.city ? ' in ' + pro.city + ', ' + pro.state : ''} on GoBookr. See services, portfolio, reviews, and booking options.`, canonical: profileUrl, structuredData, shareImage: safeExternalUrl(pro.profile_photo_url) || safeExternalUrl((portfolio.find((item) => item.image_url) || {}).image_url), currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
