'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { businessBanner } = require('../lib/profile-polish');

const clean = (v, max) => String(v || '').trim().slice(0, max);
function url(v) {
  const s = clean(v, 2048); if (!s) return '';
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return ['http:','https:'].includes(u.protocol) && u.hostname && !u.username && !u.password ? u.toString() : null; } catch { return null; }
}
function ownedShop(ctx) {
  if (!ctx.currentUser) { redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/shop')); return null; }
  const shop = db.prepare("SELECT * FROM shops WHERE owner_user_id = ? AND claim_status = 'claimed' ORDER BY id DESC LIMIT 1").get(ctx.currentUser.id);
  if (!shop) { send(ctx.res, layout({ title:'Business dashboard', currentUser:ctx.currentUser, session:ctx.session, body:'<section class="section container"><div class="panel"><h1>Business dashboard</h1><p>No claimed business is connected to this account yet.</p><a class="btn secondary" href="/search">Find your business</a></div></section>' }), 403); return null; }
  return shop;
}

module.exports = function (router) {
  router.get('/dashboard/shop', async (ctx) => {
    const shop = ownedShop(ctx); if (!shop) return;
    const body = `<section class="section container business-editor">
    <header class="business-editor__header"><div><p class="business-editor__eyebrow">Your business page</p><h1>${escapeHtml(shop.name)}</h1><p class="muted">Manage your independent GoBookr business page.</p></div><a class="btn secondary" href="/shop/${shop.id}">View public page</a></header>
    <form id="business-editor-form" class="business-editor__grid" method="POST" action="/dashboard/shop"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session?.csrf_token || '')}">
    <div class="business-editor__details">
    <fieldset class="panel business-editor__section"><legend>Business details</legend>
    <div class="field"><label for="name">Business name</label><input id="name" name="name" maxlength="160" required value="${escapeHtml(shop.name)}"></div>
    <div class="field"><label for="description">Description</label><textarea id="description" name="description" rows="4" maxlength="3000">${escapeHtml(shop.description || '')}</textarea></div></fieldset>
    <fieldset class="panel business-editor__section"><legend>Location</legend>
    <div class="field"><label for="street_address">Street address</label><input id="street_address" name="street_address" maxlength="200"  value="${escapeHtml(shop.street_address || '')}"></div>
    <div class="field"><label for="suite">Suite / Unit</label><input id="suite" name="suite" maxlength="80"  value="${escapeHtml(shop.suite || '')}"></div>
    <div class="field-row"><div class="field"><label for="city">City</label><input id="city" name="city" maxlength="100" required value="${escapeHtml(shop.city)}"></div><div class="field"><label for="state">State</label><input id="state" name="state" maxlength="2" required value="${escapeHtml(shop.state)}"></div></div>
    <div class="field"><label for="zip_code">ZIP</label><input id="zip_code" name="zip_code" maxlength="10" autocomplete="postal-code" value="${escapeHtml(shop.zip_code || '')}"></div></fieldset>
    <fieldset class="panel business-editor__section"><legend>Booking &amp; contact</legend>
    <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" maxlength="40" type="tel" value="${escapeHtml(shop.phone || '')}"></div>
    <div class="field"><label for="booking_url">Booking link</label><input id="booking_url" name="booking_url" maxlength="2048" placeholder="https://" value="${escapeHtml(shop.booking_url || '')}"></div></fieldset></div>
    <aside class="business-editor__photos"><fieldset class="panel business-editor__section"><legend>Photos</legend>
    <div class="business-banner-preview">${businessBanner(shop.cover_url, shop.name)}</div>
    <div class="field"><label for="cover_url">Banner photo URL</label><input id="cover_url" name="cover_url" maxlength="2048" placeholder="https://" aria-describedby="banner-help" value="${escapeHtml(shop.cover_url || '')}"></div>
    <p id="banner-help" class="helptext">Use a direct image URL for a photo you own or have permission to use. Leave blank for a neutral banner.</p>
    <div class="field"><label for="logo_url">Logo image URL</label><input id="logo_url" name="logo_url" maxlength="2048" placeholder="https://" value="${escapeHtml(shop.logo_url || '')}"></div></fieldset></aside>
    <div class="business-editor__save"><button class="btn" type="submit">Save business</button><a href="/shop/${shop.id}">View public page</a></div>
    </form></section><script src="/business-banner.js" defer></script>`;
    send(ctx.res, layout({ title:'Business dashboard', currentUser:ctx.currentUser, session:ctx.session, flash:flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/shop', async (ctx) => {
    const shop = ownedShop(ctx); if (!shop) return;
    const name=clean(ctx.body.name,160), city=clean(ctx.body.city,100).toLowerCase().replace(/\b\w/g,x=>x.toUpperCase()), state=clean(ctx.body.state,2).toUpperCase();
    const booking=url(ctx.body.booking_url), logo=url(ctx.body.logo_url), cover=url(ctx.body.cover_url);
    if (!name || !city || !/^[A-Z]{2}$/.test(state) || [booking,logo,cover].some(x=>x===null)) return redirect(ctx.res,'/dashboard/shop?error='+encodeURIComponent('Check the required fields and URLs.'));
    db.prepare(`UPDATE shops SET name=?, description=?, city=?, state=?, street_address=?, suite=?, zip_code=?, phone=?, booking_url=?, logo_url=?, cover_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_user_id=?`).run(
      name,clean(ctx.body.description,3000),city,state,clean(ctx.body.street_address,200),clean(ctx.body.suite,80),clean(ctx.body.zip_code,10),clean(ctx.body.phone,40),booking,logo,cover,shop.id,ctx.currentUser.id);
    redirect(ctx.res,'/dashboard/shop?success='+encodeURIComponent('Business profile saved.'));
  });
};
