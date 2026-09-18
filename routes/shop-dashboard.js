'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

const clean = (v, max) => String(v || '').trim().slice(0, max);
function url(v) {
  const s = clean(v, 2048); if (!s) return '';
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return ['http:','https:'].includes(u.protocol) && u.hostname ? u.toString() : null; } catch { return null; }
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
    const body = `<section class="section container" style="max-width:900px;"><div class="section-head"><div><h1>${escapeHtml(shop.name)}</h1><p class="muted">Manage your independent GoBookr business page.</p></div><a class="btn secondary" href="/shop/${shop.id}">View public page</a></div>
    <div class="panel"><h3>Shop details</h3><form method="POST" action="/dashboard/shop"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session?.csrf_token || '')}">
    <div class="field"><label>Shop name</label><input name="name" maxlength="160" required value="${escapeHtml(shop.name)}"></div>
    <div class="field"><label>Description</label><textarea name="description" rows="5" maxlength="3000">${escapeHtml(shop.description || '')}</textarea></div>
    <div class="field"><label>Street address</label><input name="street_address" maxlength="200" value="${escapeHtml(shop.street_address || '')}"></div>
    <div class="field"><label>Suite / Unit</label><input name="suite" maxlength="80" value="${escapeHtml(shop.suite || '')}"></div>
    <div class="field-row"><div class="field"><label>City</label><input name="city" maxlength="100" required value="${escapeHtml(shop.city)}"></div><div class="field"><label>State</label><input name="state" maxlength="2" required value="${escapeHtml(shop.state)}"></div></div>
    <div class="field"><label>ZIP</label><input name="zip_code" maxlength="10" value="${escapeHtml(shop.zip_code || '')}"></div>
    <div class="field"><label>Phone</label><input name="phone" maxlength="40" value="${escapeHtml(shop.phone || '')}"></div>
    <div class="field"><label>Website</label><input name="website_url" maxlength="2048" value="${escapeHtml(shop.website_url || '')}" placeholder="https://"></div>
    <div class="field"><label>Booking link</label><input name="booking_url" maxlength="2048" value="${escapeHtml(shop.booking_url || '')}" placeholder="https://"></div>
    <div class="field"><label>Logo image URL</label><input name="logo_url" maxlength="2048" value="${escapeHtml(shop.logo_url || '')}" placeholder="https://"></div>
    <div class="field"><label>Cover image URL</label><input name="cover_url" maxlength="2048" value="${escapeHtml(shop.cover_url || '')}" placeholder="https://"></div>
    <button class="btn" type="submit">Save shop</button></form></div></section>`;
    send(ctx.res, layout({ title:'Business dashboard', currentUser:ctx.currentUser, session:ctx.session, flash:flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/shop', async (ctx) => {
    const shop = ownedShop(ctx); if (!shop) return;
    const name=clean(ctx.body.name,160), city=clean(ctx.body.city,100).toLowerCase().replace(/\b\w/g,x=>x.toUpperCase()), state=clean(ctx.body.state,2).toUpperCase();
    const website=url(ctx.body.website_url), booking=url(ctx.body.booking_url), logo=url(ctx.body.logo_url), cover=url(ctx.body.cover_url);
    if (!name || !city || !/^[A-Z]{2}$/.test(state) || [website,booking,logo,cover].some(x=>x===null)) return redirect(ctx.res,'/dashboard/shop?error='+encodeURIComponent('Check the required fields and URLs.'));
    db.prepare(`UPDATE shops SET name=?, description=?, city=?, state=?, street_address=?, suite=?, zip_code=?, phone=?, website_url=?, booking_url=?, logo_url=?, cover_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_user_id=?`).run(
      name,clean(ctx.body.description,3000),city,state,clean(ctx.body.street_address,200),clean(ctx.body.suite,80),clean(ctx.body.zip_code,10),clean(ctx.body.phone,40),website,booking,logo,cover,shop.id,ctx.currentUser.id);
    redirect(ctx.res,'/dashboard/shop?success='+encodeURIComponent('Shop profile saved.'));
  });
};
