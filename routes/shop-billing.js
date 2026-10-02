'use strict';
const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { createPortalSession } = require('../lib/stripe');
function shop(ctx) {
  if (!ctx.currentUser) { redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/shop/billing')); return null; }
  const result = db.prepare("SELECT * FROM shops WHERE owner_user_id=? AND claim_status='claimed' ORDER BY id DESC LIMIT 1").get(ctx.currentUser.id);
  if (!result) redirect(ctx.res, '/dashboard/shop');
  return result;
}
module.exports = function(router) {
  router.get('/dashboard/shop/billing', async ctx => {
    const s = shop(ctx); if (!s) return;
    const sub = db.prepare('SELECT * FROM shop_subscriptions WHERE shop_id=?').get(s.id);
    const connected = Boolean(sub && sub.provider_customer_id && sub.provider_subscription_id);
    const legacy = connected ? `<div class="panel"><h3>Existing subscription</h3><p>You have a previous Stripe subscription. Review or cancel it in Stripe.</p><form method="POST" action="/dashboard/shop/billing/portal"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"><button class="btn secondary">Manage existing subscription</button></form></div>` : '';
    const body = `<section class="section container" style="max-width:900px;"><div class="section-head"><div><h1>Business billing</h1><p class="muted">${escapeHtml(s.name)}</p></div><a class="btn secondary" href="/dashboard/shop">Business dashboard</a></div><div class="panel"><p class="muted">GoBookr Business</p><h2>Complimentary</h2><p>Your business account has no membership fee. No payment setup is needed.</p><p>Individual professional profiles have a separate 30-day free trial, then $20/month.</p></div>${legacy}</section>`;
    send(ctx.res, layout({ title: 'Business billing', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
  router.post('/dashboard/shop/billing/checkout', async ctx => {
    if (!shop(ctx)) return;
    redirect(ctx.res, '/dashboard/shop/billing?success=' + encodeURIComponent('Business accounts are complimentary. No payment setup is needed.'));
  });
  router.post('/dashboard/shop/billing/portal', async ctx => {
    const s = shop(ctx); if (!s) return;
    const sub = db.prepare('SELECT * FROM shop_subscriptions WHERE shop_id=?').get(s.id);
    if (!sub || !sub.provider_customer_id || !sub.provider_subscription_id) return redirect(ctx.res, '/dashboard/shop/billing');
    try {
      const portal = await createPortalSession(sub.provider_customer_id, '/dashboard/shop/billing');
      if (!portal || !portal.url) throw new Error('Missing portal URL');
      redirect(ctx.res, portal.url);
    } catch (error) {
      console.error('Business portal failed', error);
      redirect(ctx.res, '/dashboard/shop/billing?error=' + encodeURIComponent('Could not open subscription management.'));
    }
  });
};
