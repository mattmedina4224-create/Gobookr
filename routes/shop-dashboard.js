'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { setupView } = require('../lib/business-setup-view');

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
    if(process.env.BUSINESS_TEAMS_ENABLED==='1' && ['basics','profile'].includes(ctx.query.setup)) {
      return send(ctx.res,layout({title:'Business setup',currentUser:ctx.currentUser,session:ctx.session,flash:flashFromQuery(ctx.query),body:setupView(shop,ctx,ctx.query.setup)}));
    }
    const body = `<section class="section container" style="max-width:900px;"><div class="section-head"><div><h1>${escapeHtml(shop.name)}</h1><p class="muted">Manage your independent GoBookr business page.</p></div><a class="btn secondary" href="/shop/${shop.id}">View public page</a></div>
    ${process.env.BUSINESS_TEAMS_ENABLED==='1'?'<link rel="stylesheet" href="/business-team.css"><div class="panel team-start"><span class="team-kicker">YOUR BUSINESS, CONNECTED</span><h2>Build your business presence</h2><p>A simple three-step setup: business basics, your public page, and your professionals.</p><a class="btn" href="/dashboard/shop?setup=basics">Start business setup</a></div><div class="panel"><h2>Your business team</h2><p>Invite professionals by their GoBookr email and cover their $20/month memberships with one business bill.</p><a class="btn" href="/dashboard/shop/team">Manage team &amp; billing</a></div>':''}
    <div class="panel"><h3>Business details</h3><form method="POST" action="/dashboard/shop"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session?.csrf_token || '')}">
    <div class="field"><label>Business name</label><input name="name" maxlength="160" required value="${escapeHtml(shop.name)}"></div>
    <div class="field"><label>Description</label><textarea name="description" rows="5" maxlength="3000">${escapeHtml(shop.description || '')}</textarea></div>
    <div class="field"><label>Street address</label><input name="street_address" maxlength="200" value="${escapeHtml(shop.street_address || '')}"></div>
    <div class="field"><label>Suite / Unit</label><input name="suite" maxlength="80" value="${escapeHtml(shop.suite || '')}"></div>
    <div class="field-row"><div class="field"><label>City</label><input name="city" maxlength="100" required value="${escapeHtml(shop.city)}"></div><div class="field"><label>State</label><input name="state" maxlength="2" required value="${escapeHtml(shop.state)}"></div></div>
    <div class="field"><label>ZIP</label><input name="zip_code" maxlength="10" value="${escapeHtml(shop.zip_code || '')}"></div>
    <div class="field"><label>Phone</label><input name="phone" maxlength="40" value="${escapeHtml(shop.phone || '')}"></div>
    <div class="field"><label>Booking link</label><input name="booking_url" maxlength="2048" value="${escapeHtml(shop.booking_url || '')}" placeholder="https://"></div>
    <div class="field"><label>Logo image URL</label><input name="logo_url" maxlength="2048" value="${escapeHtml(shop.logo_url || '')}" placeholder="https://"></div>
    <div class="field"><label>Cover image URL</label><input name="cover_url" maxlength="2048" value="${escapeHtml(shop.cover_url || '')}" placeholder="https://"></div>
    <button class="btn" type="submit">Save business</button></form></div></section>`;
    send(ctx.res, layout({ title:'Business dashboard', currentUser:ctx.currentUser, session:ctx.session, flash:flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/shop', async (ctx) => {
    const shop = ownedShop(ctx); if (!shop) return;
    const step=process.env.BUSINESS_TEAMS_ENABLED==='1' && ['basics','profile'].includes(ctx.body.setup_step)?ctx.body.setup_step:null;
    const originalBody=ctx.body;
    if(step) {
      const allowed=step==='basics'?['name','street_address','suite','city','state','zip_code']:['description','phone','booking_url','logo_url','cover_url'];
      ctx.body={...shop,...Object.fromEntries(allowed.map(key=>[key,originalBody[key]??'']))};
    }
    const errorPath='/dashboard/shop'+(step?'?setup='+step+'&':'?');
    const invalid=message=>step?send(ctx.res,layout({title:'Business setup',currentUser:ctx.currentUser,session:ctx.session,flash:{type:'error',message},body:setupView(ctx.body,ctx,step)}),422):redirect(ctx.res,errorPath+'error='+encodeURIComponent(message));
    if(step==='basics' && (!clean(ctx.body.street_address,200) || !/^\d{5}(-\d{4})?$/.test(clean(ctx.body.zip_code,10)))) return invalid('Add a street address and a valid ZIP code.');
    const name=clean(ctx.body.name,160), city=clean(ctx.body.city,100).toLowerCase().replace(/\b\w/g,x=>x.toUpperCase()), state=clean(ctx.body.state,2).toUpperCase();
    const booking=url(ctx.body.booking_url), logo=url(ctx.body.logo_url), cover=url(ctx.body.cover_url);
    if (!name || !city || !/^[A-Z]{2}$/.test(state) || [booking,logo,cover].some(x=>x===null)) return invalid('Check the required fields and URLs.');
    db.prepare(`UPDATE shops SET name=?, description=?, city=?, state=?, street_address=?, suite=?, zip_code=?, phone=?, booking_url=?, logo_url=?, cover_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_user_id=?`).run(
      name,clean(ctx.body.description,3000),city,state,clean(ctx.body.street_address,200),clean(ctx.body.suite,80),clean(ctx.body.zip_code,10),clean(ctx.body.phone,40),booking,logo,cover,shop.id,ctx.currentUser.id);
    redirect(ctx.res,(step==='basics'?'/dashboard/shop?setup=profile&':step==='profile'?'/dashboard/shop/team?setup=team&':'/dashboard/shop?')+'success='+encodeURIComponent('Business profile saved.'));
  });
};
