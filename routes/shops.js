'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

function safeUrl(value) {
  try { const u = new URL(String(value || '').trim()); return ['http:','https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; }
}

module.exports = function (router) {
  router.get('/shop/:id', async (ctx) => {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(ctx.params.id);
    if (!shop) return send(ctx.res, layout({ title:'Shop not found', currentUser:ctx.currentUser, session:ctx.session, body:'<section class="section container"><div class="panel"><h1>Shop not found</h1><p>This shop listing is not available.</p></div></section>' }), 404);

    const logo = safeUrl(shop.logo_url);
    const cover = safeUrl(shop.cover_url);
    const booking = safeUrl(shop.booking_url);
    const website = safeUrl(shop.website_url);
    const address = [shop.street_address, shop.suite, shop.city, shop.state, shop.zip_code].filter(Boolean).join(', ');
    const claimed = shop.claim_status === 'claimed';
    const body = `<section class="section container">
      <div class="panel" style="overflow:hidden;padding:0;">
        ${cover ? `<img src="${escapeHtml(cover)}" alt="" style="width:100%;height:260px;object-fit:cover;display:block;">` : ''}
        <div style="padding:24px;">
          <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(shop.name)} logo" style="width:84px;height:84px;border-radius:18px;object-fit:cover;border:1px solid #e5e7eb;">` : ''}
            <div><div class="badge">${claimed ? 'Claimed shop' : 'Unclaimed shop'}</div><h1 style="margin:8px 0 4px;">${escapeHtml(shop.name)}</h1><p class="muted" style="margin:0;">${escapeHtml(shop.city)}, ${escapeHtml(shop.state)}</p></div>
          </div>
          ${shop.description ? `<p style="margin-top:20px;">${escapeHtml(shop.description)}</p>` : ''}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:22px;">
            <div class="card"><h3>Location</h3><p>${escapeHtml(address || 'Address coming soon')}</p>${shop.phone ? `<p>${escapeHtml(shop.phone)}</p>` : ''}</div>
            <div class="card"><h3>Book & learn more</h3><div style="display:flex;gap:8px;flex-wrap:wrap;">${booking ? `<a class="btn" href="${escapeHtml(booking)}" target="_blank" rel="noopener noreferrer">Book with shop</a>` : ''}${website ? `<a class="btn secondary" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}${!booking && !website ? '<span class="muted">Links coming soon</span>' : ''}</div></div>
          </div>
          ${!claimed ? `<div class="card" style="margin-top:18px;"><h3>Own this business?</h3><p>Claim this shop to manage its GoBookr business profile.</p><a class="btn secondary" href="/shop/${shop.id}/claim">Claim this shop</a></div>` : ''}
        </div>
      </div>
    </section>`;
    send(ctx.res, layout({ title: shop.name, currentUser:ctx.currentUser, session:ctx.session, flash:flashFromQuery(ctx.query), body }));
  });
};
