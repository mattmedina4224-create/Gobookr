'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, `/login?next=${encodeURIComponent('/dashboard/pro/billing')}`);
    return null;
  }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) { send(ctx.res, '<h1>500 — pro profile missing</h1>', 500); return null; }
  return profile;
}

function prettyDate(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function daysRemaining(value) {
  if (!value) return 0;
  const end = new Date(String(value).replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function statusLabel(status) {
  return ({ trialing: 'Free trial', active: 'Active', past_due: 'Past due', canceled: 'Canceled', incomplete: 'Payment setup incomplete', unpaid: 'Unpaid' })[status] || status;
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
    const stripeReady = Boolean(subscription.stripe_subscription_id);

    let notice = '';
    if (isPastDue) notice = `<div class="alert error" style="margin-bottom:18px;"><strong>We couldn't process your payment.</strong> Your profile can remain active during GoBookr's 7-day payment grace period. Once Stripe billing is connected, you'll be able to update your payment method here.</div>`;
    else if (cancelPending) notice = `<div class="alert" style="margin-bottom:18px;"><strong>Cancellation scheduled.</strong> Your membership remains available through the end of your current billing period. Reactivation will be available here once Stripe is connected.</div>`;

    const trialText = isTrial ? `<p style="margin:4px 0 0;"><strong>${remaining} day${remaining === 1 ? '' : 's'} remaining</strong> in your free trial.</p>` : '';
    const billingLabel = isTrial ? 'Trial ends' : 'Current period ends';

    const paymentButton = stripeReady
      ? `<button class="btn secondary" type="button" disabled>Manage payment method</button>`
      : `<button class="btn secondary" type="button" disabled>Set up payment method</button><p class="helptext" style="margin-top:8px;">This will activate when Stripe is connected.</p>`;

    const cancelArea = cancelPending
      ? `<button class="btn secondary" type="button" disabled>Reactivate subscription</button><p class="helptext" style="margin-top:8px;">Reactivation will be enabled with Stripe.</p>`
      : `<button class="btn ghost" type="button" disabled>Cancel subscription</button><p class="helptext" style="margin-top:8px;">Cancellation will be enabled after Stripe is connected. Canceling will stop future renewals, not delete your account.</p>`;

    const body = `<section class="section container"><div class="dash-layout"><nav class="dash-nav"><a href="/dashboard/pro">Overview</a><a href="/dashboard/pro/profile">Profile &amp; services</a><a href="/dashboard/pro/portfolio">Portfolio</a><a class="active" href="/dashboard/pro/billing">Billing</a></nav><div><h1>Billing &amp; subscription</h1>${notice}<div class="panel"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;"><div><p class="muted" style="margin:0 0 4px;">GoBookr Professional</p><h2 style="margin:0;">$15 <span class="muted" style="font-size:16px;font-weight:500;">/ month</span></h2>${trialText}</div><span class="badge category">${escapeHtml(statusLabel(subscription.status))}</span></div><div style="border-top:1px solid var(--paper-line);margin-top:22px;padding-top:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;"><div><div class="muted" style="font-size:13px;">${billingLabel}</div><strong>${prettyDate(isTrial ? subscription.trial_ends_at : subscription.current_period_end)}</strong></div><div><div class="muted" style="font-size:13px;">Renewal price</div><strong>$15/month</strong></div><div><div class="muted" style="font-size:13px;">Auto-renewal</div><strong>${cancelPending ? 'Off' : 'On'}</strong></div></div></div><div class="panel"><h3>Payment method</h3><p class="muted">GoBookr will use Stripe for secure checkout. Professionals will be able to pay with major cards and Apple Pay when available on their device and browser. GoBookr will not store raw card or wallet payment details.</p>${paymentButton}</div><div class="panel"><h3>Manage subscription</h3><p>Your membership renews monthly after the 30-day free trial unless you cancel. If a payment fails, GoBookr plans to provide a 7-day grace period before temporarily hiding an unpaid profile.</p>${cancelArea}</div><p class="helptext">Billing controls are currently in setup mode. No payment will be charged from this page until Stripe is connected and tested.</p></div></div></section>`;
    send(ctx.res, layout({ title: 'Billing & subscription', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
