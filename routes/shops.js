'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const ShopProfile = require('../lib/shop-profile');
const { renderProfile, structuredData, metaDescription } = require('../lib/shop-profile-view');

function shopForClaim(id) { return db.prepare('SELECT * FROM shops WHERE id = ?').get(id); }
function pendingShopClaim(shopId, userId) { return db.prepare("SELECT id FROM shop_claims WHERE shop_id = ? AND claimant_user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(shopId, userId); }

module.exports = function (router) {
  router.get('/shop/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    const shop = Number.isInteger(id) && id > 0 ? db.prepare('SELECT * FROM shops WHERE id = ?').get(id) : null;
    if (!shop) return send(ctx.res, layout({ title:'Shop not found', currentUser:ctx.currentUser, session:ctx.session, body:'<section class="section container"><div class="panel"><h1>Shop not found</h1><p>This shop listing is not available.</p></div></section>' }), 404);
    let claimed = shop.claim_status === 'claimed';
    const isOwner = Boolean(claimed && ctx.currentUser && Number(shop.owner_user_id) === Number(ctx.currentUser.id));
    // Owners see their own saves immediately (bypasses the per-instance read cache).
    if (isOwner) { Object.assign(shop, db.prepare(ShopProfile.FRESH + 'SELECT * FROM shops WHERE id = ?').get(id)); claimed = shop.claim_status === 'claimed'; }
    const mode = isOwner && ctx.query?.preview === '1' ? 'preview' : (claimed && !shop.profile_published_at ? 'base' : 'public');
    const profile = ShopProfile.loadProfile(shop.id, { fresh: isOwner });
    // Unclaimed pages only: professionals who name this business on their own profiles (shown as unconfirmed).
    const listedPros = claimed ? [] : db.prepare(`SELECT id, business_name, professional_handle, category, profile_photo_url, booking_url, license_verified, initials FROM pro_profiles
      WHERE LOWER(COALESCE(workplace_name,'')) = LOWER(?) AND LOWER(city) = LOWER(?) AND UPPER(state) = UPPER(?)
        AND (? = '' OR COALESCE(street_address,'') = '' OR LOWER(street_address) = LOWER(?)) ORDER BY business_name ASC LIMIT 50`)
      .all(shop.name, shop.city, shop.state, String(shop.street_address || ''), String(shop.street_address || ''));
    const full = claimed && (mode === 'preview' || Boolean(shop.profile_published_at));
    // Professionals see where they stand with a claimed business (request to join, invited, on the team).
    const relationship = claimed && ctx.currentUser?.role === 'pro' ? ShopProfile.teamRelationship(ctx.currentUser, shop.id) : null;
    const body = renderProfile({ shop, profile, listedPros, mode, canEdit: isOwner, relationship, csrf: ctx.session?.csrf_token || '' });
    const shopUrl = 'https://gobookr.com/shop/' + shop.id;
    send(ctx.res, layout({
      title: shop.name + (shop.city ? ' · ' + shop.city + ', ' + shop.state : ''),
      description: metaDescription(shop, profile, full), canonical: shopUrl, robots: mode === 'preview' ? 'noindex,nofollow' : '',
      structuredData: structuredData(shop, profile, full), shareImage: full ? ShopProfile.publicUrl(shop.cover_url) : '',
      currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body,
    }));
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
