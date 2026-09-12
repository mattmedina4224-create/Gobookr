'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { graceDaysRemaining } = require('../lib/subscription');
const {
  stripeConfigured,
  webhookConfigured,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  unixToSqlite,
  normalizedSubscriptionStatus,
} = require('../lib/stripe');

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, `/login?next=${encodeURIComponent('/dashboard/pro/billing')}`);
    return null;
  }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) { send(ctx.res, '<h1>500 — pro profile missing</h1>', 500); return null; }
  return profile;
}

function parseDatabaseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone
    ? raw
    : (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function prettyDate(value) {
  const date = parseDatabaseDate(value);
  if (!date) return value ? escapeHtml(String(value)) : '—';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function daysRemaining(value) {
  const date = parseDatabaseDate(value);
  if (!date) return 0;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function statusLabel(status) {
  return ({ trialing: 'Free trial', active: 'Active', past_due: 'Past due', canceled: 'Canceled', incomplete: 'Payment setup incomplete', unpaid: 'Unpaid' })[status] || status;
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function findSubscriptionForStripeObject(object) {
  const metadataProId = Number(object && object.metadata && object.metadata.pro_id);
  if (Number.isInteger(metadataProId) && metadataProId > 0) return db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(metadataProId);
  if (object && object.id && String(object.id).startsWith('sub_')) return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(object.id);
  if (object && object.subscription) return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(object.subscription);
  if (object && object.customer) return db.prepare('SELECT * FROM subscriptions WHERE stripe_customer_id = ?').get(object.customer);
  return null;
}

module.exports = function (router) {
  router.get('/dashboard/pro/billing', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(profile.id);
    if (!subscription) return send(ctx.res, '<h1>Subscription record missing</h1>', 500);

    const remaining = daysRemaining(subscription.trial_ends_at);
    const isTrial = subscription.status === 'trialing';
    const isPastDue = subscription.status === 'past_due' || subscription.status === 'unpaid';
    const cancelPending = Boolean(subscription.cancel_at_period_end);
    const configured = stripeConfigured();
    const hasStripeCustomer = Boolean(subscription.stripe_customer_id);
    const graceRemaining = graceDaysRemaining(subscription);

    let notice = '';
    if (isPastDue && graceRemaining > 0) notice = `<div class="alert error" style="margin-bottom:18px;"><strong>We couldn't process your payment.</strong> You have ${graceRemaining} day${graceRemaining === 1 ? '' : 's'} left in your payment grace period. Update your payment method to keep your profile visible.</div>`;
    else if (isPastDue) notice = `<div class="alert error" style="margin-bottom:18px;"><strong>Payment is still overdue.</strong> Your 7-day grace period has ended, so your public profile is temporarily hidden. Update your payment method to restore it.</div>`;
    else if (cancelPending) notice = `<div class="alert" style="margin-bottom:18px;"><strong>Cancellation scheduled.</strong> Your membership remains available through the end of your current billing period.</div>`;

    const trialText = isTrial ? `<p style="margin:4px 0 0;"><strong>${remaining} day${remaining === 1 ? '' : 's'} remaining</strong> in your free trial.</p>` : '';
    const billingLabel = isTrial ? 'Trial ends' : 'Current period ends';

    let paymentButton = `<button class="btn secondary" type="button" disabled>Set up payment method</button><p class="helptext" style="margin-top:8px;">Stripe test billing will activate after the required environment keys are configured.</p>`;
    if (configured && hasStripeCustomer) {
      paymentButton = `<form method="POST" action="/dashboard/pro/billing/portal"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"/><button class="btn secondary" type="submit">Manage payment &amp; subscription</button></form>`;
    } else if (configured) {
      paymentButton = `<form method="POST" action="/dashboard/pro/billing/checkout"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"/><button class="btn secondary" type="submit">Set up secure payment</button></form><p class="helptext" style="margin-top:8px;">Stripe Checkout will show eligible wallet options such as Apple Pay automatically on supported devices.</p>`;
    }

    const manageArea = hasStripeCustomer && configured
      ? `<p class="helptext">Cancellation, reactivation, payment-method updates, and invoices are handled securely through Stripe's customer portal.</p>`
      : `<p class="helptext">Subscription management becomes available after Stripe checkout is connected.</p>`;

    const body = `<section class="section container"><div class="dash-layout"><nav class="dash-nav"><a href="/dashboard/pro">Overview</a><a href="/dashboard/pro/profile">Profile &amp; services</a><a href="/dashboard/pro/portfolio">Portfolio</a><a class="active" href="/dashboard/pro/billing">Billing</a></nav><div><h1>Billing &amp; subscription</h1>${notice}<div class="panel"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;"><div><p class="muted" style="margin:0 0 4px;">GoBookr Professional</p><h2 style="margin:0;">$15 <span class="muted" style="font-size:16px;font-weight:500;">/ month</span></h2>${trialText}</div><span class="badge category">${escapeHtml(statusLabel(subscription.status))}</span></div><div style="border-top:1px solid var(--paper-line);margin-top:22px;padding-top:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;"><div><div class="muted" style="font-size:13px;">${billingLabel}</div><strong>${prettyDate(isTrial ? subscription.trial_ends_at : subscription.current_period_end)}</strong></div><div><div class="muted" style="font-size:13px;">Renewal price</div><strong>$15/month</strong></div><div><div class="muted" style="font-size:13px;">Auto-renewal</div><strong>${cancelPending ? 'Off' : 'On'}</strong></div></div></div><div class="panel"><h3>Payment method</h3><p class="muted">Payments are securely processed by Stripe. Professionals can use major cards and, when available on their device and browser, Apple Pay. GoBookr never stores raw card or Apple Pay payment details.</p>${paymentButton}</div><div class="panel"><h3>Manage subscription</h3><p>Your membership renews monthly after the 30-day free trial unless canceled. Failed payments receive a 7-day grace period before an unpaid professional profile is temporarily hidden.</p>${manageArea}</div><p class="helptext">${configured ? 'Stripe billing is configured.' : 'No payment will be charged until Stripe environment keys are configured and tested.'}</p></div></div></section>`;
    send(ctx.res, layout({ title: 'Billing & subscription', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/billing/checkout', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(profile.id);
    if (!subscription) return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('Subscription record missing.'));
    if (!stripeConfigured()) return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('Stripe billing is not configured yet.'));
    if (subscription.stripe_customer_id) return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('Billing is already connected. Use Manage payment & subscription.'));
    try {
      const session = await createCheckoutSession({ proId: profile.id, email: ctx.currentUser.email, trialDays: daysRemaining(subscription.trial_ends_at) });
      if (!session || !session.url) throw new Error('Stripe did not return a checkout URL.');
      redirect(ctx.res, session.url);
    } catch (err) {
      console.error('Stripe checkout creation failed', err);
      redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('We could not start secure checkout. Please try again.'));
    }
  });

  router.post('/dashboard/pro/billing/portal', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const subscription = db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(profile.id);
    if (!subscription || !subscription.stripe_customer_id) return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('No Stripe billing account is connected yet.'));
    try {
      const portal = await createPortalSession(subscription.stripe_customer_id);
      if (!portal || !portal.url) throw new Error('Stripe did not return a portal URL.');
      redirect(ctx.res, portal.url);
    } catch (err) {
      console.error('Stripe portal creation failed', err);
      redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('We could not open subscription management. Please try again.'));
    }
  });

  router.post('/stripe/webhook', async (ctx) => {
    if (!webhookConfigured()) return json(ctx.res, 503, { error: 'Webhook not configured' });
    const signature = ctx.req.headers['stripe-signature'];
    if (!verifyWebhookSignature(ctx.rawBody, signature)) return json(ctx.res, 400, { error: 'Invalid signature' });
    const event = ctx.body || {};
    const object = event.data && event.data.object ? event.data.object : {};

    try {
      if (event.type === 'checkout.session.completed') {
        const proId = Number(object.metadata && object.metadata.pro_id);
        if (Number.isInteger(proId) && proId > 0) db.prepare(`UPDATE subscriptions SET stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = datetime('now') WHERE pro_id = ?`).run(String(object.customer || ''), String(object.subscription || ''), proId);
      } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const local = findSubscriptionForStripeObject(object);
        if (local) {
          const status = event.type === 'customer.subscription.deleted' ? 'canceled' : normalizedSubscriptionStatus(object.status);
          const pastDueSince = ['past_due', 'unpaid'].includes(status) ? (local.past_due_since || new Date().toISOString().slice(0, 19).replace('T', ' ')) : null;
          db.prepare(`UPDATE subscriptions SET status = ?, stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?, current_period_end = ?, cancel_at_period_end = ?, past_due_since = ?, updated_at = datetime('now') WHERE id = ?`).run(
            status,
            String(object.customer || local.stripe_customer_id || ''),
            String(object.id || local.stripe_subscription_id || ''),
            String((object.items && object.items.data && object.items.data[0] && object.items.data[0].price && object.items.data[0].price.id) || local.stripe_price_id || ''),
            unixToSqlite(object.current_period_end),
            object.cancel_at_period_end ? 1 : 0,
            pastDueSince,
            local.id
          );
        }
      } else if (event.type === 'invoice.payment_failed') {
        const local = findSubscriptionForStripeObject(object);
        if (local) db.prepare(`UPDATE subscriptions SET status = 'past_due', past_due_since = COALESCE(past_due_since, datetime('now')), updated_at = datetime('now') WHERE id = ?`).run(local.id);
      } else if (event.type === 'invoice.paid') {
        const local = findSubscriptionForStripeObject(object);
        if (local && local.status !== 'canceled') db.prepare(`UPDATE subscriptions SET status = 'active', past_due_since = NULL, updated_at = datetime('now') WHERE id = ?`).run(local.id);
      }
      json(ctx.res, 200, { received: true });
    } catch (err) {
      console.error('Stripe webhook processing failed', err);
      json(ctx.res, 500, { error: 'Webhook processing failed' });
    }
  });
};
