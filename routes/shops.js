'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, slugCategory } = require('../lib/util');
const { professionalsAtBusiness, businessBanner, licenseIsVerified } = require('../lib/profile-polish');

function safeUrl(value) {
  try { const u = new URL(String(value || '').trim()); return ['http:','https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; }
}

function shopForClaim(id) { return db.prepare('SELECT * FROM shops WHERE id = ?').get(id); }
function pendingShopClaim(shopId, userId) { return db.prepare("SELECT id FROM shop_claims WHERE shop_id = ? AND claimant_user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(shopId, userId); }

module.exports = function (router) {
  router.get('/shop/:id', async (ctx) => {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(ctx.params.id);
    if (!shop) return send(ctx.res, layout({ title:'Shop not found', currentUser:ctx.currentUser, session:ctx.session, body:'<section class="section container"><div class="panel"><h1>Shop not found</h1><p>This shop listing is not available.</p></div></section>' }), 404);

    const logo = safeUrl(shop.logo_url);
    const cover = safeUrl(shop.cover_url);
    const booking = safeUrl(shop.booking_url);
    const address = [shop.street_address, shop.suite, shop.city, shop.state, shop.zip_code].filter(Boolean).join(', ');
    const claimed = shop.claim_status === 'claimed';
    const professionals = require('../lib/pro-listing-data').hydratePros(professionalsAtBusiness(db, shop), { includeServices: false });
    const staffHtml = professionals.length ? professionals.map((pro) => `<a class="card" href="/pro/${pro.id}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px;">${safeUrl(pro.profile_photo_url) ? `<img class="shop-staff-photo" src="${escapeHtml(safeUrl(pro.profile_photo_url))}" alt="${escapeHtml(pro.business_name)} profile photo">` : `<div class="shop-staff-photo shop-staff-fallback">${escapeHtml(pro.initials || 'GB')}</div>`}<div><strong>${escapeHtml(pro.business_name)}</strong>${pro.professional_handle ? `<div class="profile-handle">@${escapeHtml(pro.professional_handle)}</div>` : ''}<div class="muted" style="margin-top:2px;">${escapeHtml((pro.categories || [pro.category]).map(slugCategory).join(' · '))}${licenseIsVerified(pro) ? ' · License verified' : ''}</div></div></a>`).join('') : '<p class="muted">No GoBookr professionals are connected to this business yet.</p>';
    const body = `<section class="section container shop-public-page">
      <div class="panel shop-public-shell" style="overflow:hidden;padding:0;">
        ${businessBanner(cover, shop.name)}
        <div style="padding:24px;">
          <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(shop.name)} logo" style="width:84px;height:84px;border-radius:18px;object-fit:cover;border:1px solid #e5e7eb;">` : ''}
            <div><div class="badge">${claimed ? 'Claimed shop' : 'Unclaimed business'}</div><h1 style="margin:8px 0 4px;">${escapeHtml(shop.name)}</h1><p class="muted" style="margin:0;">${escapeHtml(shop.city)}, ${escapeHtml(shop.state)}</p></div>
          </div>
          ${shop.description ? `<p style="margin-top:20px;">${escapeHtml(shop.description)}</p>` : ''}
          ${booking ? `<a class="btn shop-book-btn" href="${escapeHtml(booking)}" target="_blank" rel="noopener noreferrer">Book with this business <span aria-hidden="true">↗</span></a>` : ''}
          <div class="shop-info-grid">
            <div class="card"><h3>Location</h3><p>${escapeHtml(address || 'Address coming soon')}</p>${shop.phone ? `<p>${escapeHtml(shop.phone)}</p>` : ''}</div>
            <div class="card"><h3>GoBookr professionals</h3><p class="muted" style="margin-bottom:0;">Choose a professional below to view their profile and booking options.</p></div>
          </div>
          <div class="shop-staff-section"><h2>Professionals at this business</h2><p class="muted">Profiles with a matching business name and full workplace address. Professionals manage their own profiles.</p><div class="shop-staff-grid">${staffHtml}</div></div>
          ${!claimed ? `<div class="card" style="margin-top:18px;"><h3>Own this business?</h3><p>Claim this business to manage its GoBookr business profile.</p><a class="btn secondary" href="/shop/${shop.id}/claim">Claim this business</a></div>` : ''}
        </div>
      </div>
    </section><script src="/business-banner.js" defer></script>`;
    const shopUrl = 'https://gobookr.com/shop/' + shop.id;
    const structuredData = { '@context':'https://schema.org', '@type':'LocalBusiness', name:shop.name, url:shopUrl, description:shop.description || undefined, image:logo || cover || undefined, telephone:shop.phone || undefined, address: address ? { '@type':'PostalAddress', streetAddress:[shop.street_address,shop.suite].filter(Boolean).join(', ') || undefined, addressLocality:shop.city || undefined, addressRegion:shop.state || undefined, postalCode:shop.zip_code || undefined } : undefined };
    send(ctx.res, layout({ title: shop.name + (shop.city ? ' · ' + shop.city + ', ' + shop.state : ''), description:`View ${shop.name}${shop.city ? ' in ' + shop.city + ', ' + shop.state : ''} on GoBookr. Explore professionals at this business and booking options.`, canonical:shopUrl, structuredData, currentUser:ctx.currentUser, session:ctx.session, flash:flashFromQuery(ctx.query), body }));
  });
  router.get('/shop/:id/claim', async (ctx) => {
    const id = Number(ctx.params.id); const shop = Number.isInteger(id) && id > 0 ? shopForClaim(id) : null;
    if (!shop) return send(ctx.res, '<h1>404 — shop not found</h1>', 404);
    if (shop.claim_status === 'claimed') return require('../lib/http').redirect(ctx.res, `/shop/${shop.id}?message=${encodeURIComponent('This shop has already been claimed.')}`);
    const signedIn = Boolean(ctx.currentUser); const pending = signedIn ? Boolean(pendingShopClaim(shop.id, ctx.currentUser.id)) : false;
    const action = pending ? '<div class="panel"><strong>Claim request pending</strong><p class="muted">GoBookr will verify ownership before transferring control of this business page.</p></div>' :
      signedIn ? `<form method="POST" action="/shop/${shop.id}/claim"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session?.csrf_token || '')}"><button class="btn" type="submit">Request to claim this shop</button></form>` :
      `<a class="btn" href="/signup?claim_shop=${shop.id}">Create an account to claim</a> <a class="btn secondary" href="/login?claim_shop=${shop.id}">Log in</a>`;
    send(ctx.res, layout({ title:`Claim ${shop.name}`, currentUser:ctx.currentUser, session:ctx.session, body:`<section class="section container" style="max-width:720px;"><div class="card"><span class="badge">Unclaimed business</span><h1>Claim ${escapeHtml(shop.name)}</h1><p class="lede">If you own or manage this business, request control of its GoBookr business page.</p><div class="panel" style="margin:20px 0;"><strong>${escapeHtml(shop.name)}</strong><div class="muted">${escapeHtml(shop.city)}, ${escapeHtml(shop.state)}</div></div>${action}</div></section>` }));
  });

  router.post('/shop/:id/claim', async (ctx) => {
    const { redirect } = require('../lib/http');
    if (!ctx.currentUser) return redirect(ctx.res, `/login?claim_shop=${encodeURIComponent(ctx.params.id)}`);
    const id = Number(ctx.params.id); const shop = Number.isInteger(id) && id > 0 ? shopForClaim(id) : null;
    if (!shop) return send(ctx.res, '<h1>404 — shop not found</h1>', 404);
    if (shop.claim_status === 'claimed') return redirect(ctx.res, `/shop/${shop.id}`);
    if (!pendingShopClaim(shop.id, ctx.currentUser.id)) db.prepare("INSERT INTO shop_claims (shop_id, claimant_user_id, status, requested_at) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)").run(shop.id, ctx.currentUser.id);
    db.prepare("UPDATE shops SET claim_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND claim_status != 'claimed'").run(shop.id);
    redirect(ctx.res, `/shop/${shop.id}?message=${encodeURIComponent('Shop claim request received. GoBookr will verify ownership before transferring control.')}`);
  });
};
