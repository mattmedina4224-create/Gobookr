'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const {
  stripeConfigured,
  embeddedCheckoutConfigured,
  stripePublishableKey,
  createCheckoutSession,
} = require('../lib/stripe');

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

function daysRemaining(value) {
  const date = parseDatabaseDate(value);
  if (!date) return 0;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, `/login?next=${encodeURIComponent('/dashboard/pro/billing')}`);
    return null;
  }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) {
    send(ctx.res, '<h1>500 — pro profile missing</h1>', 500);
    return null;
  }
  return profile;
}

module.exports = function (router) {
  // This route is registered before the legacy Stripe-hosted Checkout route so
  // professionals stay on GoBookr while Stripe securely renders the payment form.
  router.post('/dashboard/pro/billing/checkout', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;

    const subscription = db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(profile.id);
    if (!subscription) {
      return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('Subscription record missing.'));
    }
    if (subscription.stripe_customer_id && subscription.stripe_subscription_id) {
      return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('Billing is already connected. Use Manage payment & subscription.'));
    }
    if (!stripeConfigured()) {
      return redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent('Secure billing is not available yet. Please try again later.'));
    }

    try {
      const checkoutSession = await createCheckoutSession({
        proId: profile.id,
        email: ctx.currentUser.email,
        trialEndsAt: subscription.status === 'trialing' ? subscription.trial_ends_at : null,
        embedded: embeddedCheckoutConfigured(),
      });

      if (!embeddedCheckoutConfigured() && checkoutSession && checkoutSession.url) return redirect(ctx.res, checkoutSession.url);
      if (!checkoutSession || !checkoutSession.client_secret) {
        throw new Error('Stripe did not return an embedded checkout client secret.');
      }

      const publishableKey = stripePublishableKey();
      const clientSecret = checkoutSession.client_secret;
      const body = `
        <section class="section container" style="max-width:980px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--gb-space-3);flex-wrap:wrap;margin-bottom:var(--gb-space-3);">
            <div>
              <p class="muted" style="margin:0 0 var(--gb-space-1);">GoBookr Professional</p>
              <h1 style="margin:0;">Set up secure payment</h1>
              <p class="muted" style="margin:var(--gb-space-2) 0 0;">${subscription.status === 'trialing' && daysRemaining(subscription.trial_ends_at) > 0 ? 'Your remaining trial stays free, then $20/month.' : '$20/month, billed when you confirm checkout.'} Stripe securely handles your payment details.</p>
            </div>
            <a class="btn secondary" href="/dashboard/pro/billing">Back to billing</a>
          </div>
          <div class="panel" style="padding:var(--gb-space-3);min-height:520px;">
            <div id="gobookr-embedded-checkout" aria-live="polite"></div>
            <div id="gobookr-checkout-error" class="alert error" style="display:none;margin:var(--gb-space-3);"></div>
          </div>
        </section>
        <script src="https://js.stripe.com/v3/"></script>
        <script>
          (async () => {
            const errorBox = document.getElementById('gobookr-checkout-error');
            try {
              const stripe = Stripe(${JSON.stringify(publishableKey)});
              const checkout = await stripe.initEmbeddedCheckout({
                clientSecret: ${JSON.stringify(clientSecret)}
              });
              checkout.mount('#gobookr-embedded-checkout');
            } catch (err) {
              console.error('Embedded Stripe Checkout failed', err);
              errorBox.style.display = 'block';
              errorBox.textContent = 'We could not load secure checkout. Please return to billing and try again.';
            }
          })();
        </script>`;

      send(ctx.res, layout({
        title: 'Secure checkout',
        currentUser: ctx.currentUser,
        session: ctx.session,
        body,
      }));
    } catch (err) {
      console.error('Embedded Stripe checkout creation failed', err);
      redirect(ctx.res, '/dashboard/pro/billing?error=' + encodeURIComponent(['TRIAL_END_TOO_CLOSE', 'DEMO_ACCOUNT'].includes(err.code) ? err.message : err.code === 'PRICE_UNAVAILABLE' ? 'Payment setup is temporarily unavailable. Your account has not been charged.' : 'We could not start secure checkout. Please try again.'));
    }
  });
};
