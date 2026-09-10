'use strict';

const crypto = require('node:crypto');

const STRIPE_API = 'https://api.stripe.com/v1';

function cleanBaseUrl() {
  const value = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) return '';
  if (process.env.NODE_ENV === 'production' && !/^https:\/\//i.test(value)) return '';
  return value;
}

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && cleanBaseUrl());
}

function webhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

async function stripeRequest(path, params) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    body.append(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(STRIPE_API + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : `Stripe request failed (${response.status}).`;
      throw new Error(message);
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Stripe request timed out. Please try again.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function createCheckoutSession({ proId, email, trialDays }) {
  if (!stripeConfigured()) throw new Error('Stripe checkout is not configured.');
  const baseUrl = cleanBaseUrl();
  const params = {
    mode: 'subscription',
    'line_items[0][price]': process.env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': 1,
    customer_email: email,
    'payment_method_types[0]': 'card',
    success_url: `${baseUrl}/dashboard/pro/billing?success=${encodeURIComponent('Payment method saved. Your membership billing is connected.')}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard/pro/billing?error=${encodeURIComponent('Checkout was canceled. No changes were made.')}`,
    'metadata[pro_id]': proId,
    'subscription_data[metadata][pro_id]': proId,
    'allow_promotion_codes': 'false',
  };
  if (Number.isInteger(trialDays) && trialDays > 0) params['subscription_data[trial_period_days]'] = trialDays;
  return stripeRequest('/checkout/sessions', params);
}

async function createPortalSession(customerId) {
  if (!process.env.STRIPE_SECRET_KEY || !cleanBaseUrl()) throw new Error('Stripe portal is not configured.');
  return stripeRequest('/billing_portal/sessions', {
    customer: customerId,
    return_url: `${cleanBaseUrl()}/dashboard/pro/billing`,
  });
}

function verifyWebhookSignature(rawBody, signatureHeader, toleranceSeconds = 300) {
  if (!webhookConfigured() || !rawBody || !signatureHeader) return false;
  const parts = String(signatureHeader).split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestampPart || !signatures.length) return false;
  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) return false;
  const payload = `${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`;
  const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(payload).digest('hex');
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

function unixToSqlite(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function normalizedSubscriptionStatus(status) {
  const allowed = new Set(['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid']);
  return allowed.has(status) ? status : 'incomplete';
}

module.exports = {
  stripeConfigured,
  webhookConfigured,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  unixToSqlite,
  normalizedSubscriptionStatus,
};
