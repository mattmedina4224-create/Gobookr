'use strict';

const crypto = require('node:crypto');

const STRIPE_API = 'https://api.stripe.com/v1';

function cleanBaseUrl() {
  const value = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) return '';
  if (process.env.NODE_ENV === 'production' && !/^https:\/\//i.test(value)) return '';
  return value;
}

function stripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function stripePublishableKey() {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
}

function stripePriceId() { return String(process.env.STRIPE_PRICE_ID || '').trim(); }
function stripeShopPriceId() { return String(process.env.STRIPE_SHOP_PRICE_ID || '').trim(); }

function stripeConfigured() {
  return Boolean(stripeSecretKey() && stripePriceId() && cleanBaseUrl());
}

function embeddedCheckoutConfigured() {
  return Boolean(stripeConfigured() && stripePublishableKey());
}

function webhookConfigured() {
  return Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
}
function businessTeamBillingConfigured() {
  // Preview team checkout must use a Stripe sandbox; never reuse live billing keys.
  return stripeConfigured() && webhookConfigured() && (process.env.VERCEL_ENV !== 'preview' || /^(sk|rk)_test_/.test(stripeSecretKey()));
}

async function stripeRequest(path, params, method = 'POST', idempotencyKey = '') {
  const secretKey = stripeSecretKey();
  if (!secretKey) throw new Error('Stripe is not configured.');
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    body.append(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(STRIPE_API + path + (method === 'GET' && body.size ? '?' + body.toString() : ''), {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: method === 'GET' ? undefined : body,
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

async function createCheckoutSession({ proId, shopId, email, trialEndsAt, embedded = false, idempotencyKey = '' }) {
  if (shopId) throw new Error('Business accounts are complimentary.');
  if (/\.test$/i.test(String(email || ''))) { const error = new Error('Demo accounts cannot start paid billing.'); error.code = 'DEMO_ACCOUNT'; throw error; }
  const priceId = await professionalPriceId();
  if (!stripeSecretKey() || !priceId || !cleanBaseUrl()) throw new Error('Stripe checkout is not configured.');
  const baseUrl = cleanBaseUrl();
  const params = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': 1,
    customer_email: email,
    ...(shopId ? { 'metadata[shop_id]': shopId, 'subscription_data[metadata][shop_id]': shopId } : { 'metadata[pro_id]': proId, 'subscription_data[metadata][pro_id]': proId }),
  };

  if (embedded) {
    params.ui_mode = 'embedded';
    params.return_url = `${baseUrl}${shopId ? '/dashboard/shop/billing' : '/dashboard/pro/billing'}?success=${encodeURIComponent('Secure checkout completed. Billing status will update as soon as Stripe confirms your subscription.')}&session_id={CHECKOUT_SESSION_ID}`;
  } else {
    params.success_url = `${baseUrl}${shopId ? '/dashboard/shop/billing' : '/dashboard/pro/billing'}?success=${encodeURIComponent('Secure checkout completed. Billing status will update as soon as Stripe confirms your subscription.')}&session_id={CHECKOUT_SESSION_ID}`;
    params.cancel_url = `${baseUrl}${shopId ? '/dashboard/shop/billing' : '/dashboard/pro/billing'}?error=${encodeURIComponent('Checkout was canceled. No changes were made.')}`;
  }

  if (trialEndsAt) {
    const raw = String(trialEndsAt).trim();
    const date = trialEndsAt instanceof Date ? trialEndsAt : new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
    const end = Math.floor(date.getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(end)) throw new Error('Trial end date is invalid.');
    if (end > now && end < now + 48 * 3600 + 60) {
      const error = new Error('Your trial is still free. Payment setup is available when your trial ends; you will not be charged early.');
      error.code = 'TRIAL_END_TOO_CLOSE';
      throw error;
    }
    if (end > now) params['subscription_data[trial_end]'] = end;
  }
  return stripeRequest('/checkout/sessions', params, 'POST', idempotencyKey);
}

async function retrieveSubscription(id) {
  if (!/^sub_[A-Za-z0-9]+$/.test(String(id || ''))) throw new Error('Invalid Stripe subscription ID.');
  return stripeRequest('/subscriptions/' + encodeURIComponent(id), {}, 'GET');
}

function isProfessionalPrice(price) {
  return Boolean(price && price.active && price.currency === 'usd' && price.unit_amount === 2000 && price.type === 'recurring' && price.recurring && price.recurring.interval === 'month' && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed');
}

async function professionalPriceId() {
  if (!stripeSecretKey()) throw new Error('Stripe is not configured.');
  const lookup = String(process.env.STRIPE_PRO_PRICE_LOOKUP_KEY || 'gobookr_professional_monthly_20').trim();
  const prices = await stripeRequest('/prices', { 'lookup_keys[0]': lookup, active: true, limit: 2 }, 'GET');
  if (prices.data && prices.data.length === 1 && isProfessionalPrice(prices.data[0])) return prices.data[0].id;
  if (stripePriceId()) {
    const price = await stripeRequest('/prices/' + encodeURIComponent(stripePriceId()), {}, 'GET');
    if (isProfessionalPrice(price)) return price.id;
  }
  const error = new Error('GoBookr Professional must use an active $20 USD monthly price.');
  error.code = 'PRICE_UNAVAILABLE';
  throw error;
}

async function createPortalSession(customerId, returnPath = '/dashboard/pro/billing') {
  if (!stripeSecretKey() || !cleanBaseUrl()) throw new Error('Stripe portal is not configured.');
  return stripeRequest('/billing_portal/sessions', {
    customer: customerId,
    return_url: `${cleanBaseUrl()}${returnPath === '/dashboard/shop/billing' ? returnPath : '/dashboard/pro/billing'}`,
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
  const expected = crypto.createHmac('sha256', String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()).update(payload).digest('hex');
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
  const allowed = new Set(['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused']);
  return allowed.has(status) ? status : 'incomplete';
}

module.exports = {
  businessTeamBillingConfigured,
  stripeRequest,
  professionalPriceId,
  cleanBaseUrl,
  retrieveSubscription,
  isProfessionalPrice,
  stripeConfigured,
  embeddedCheckoutConfigured,
  stripePublishableKey,
  stripeShopPriceId,
  webhookConfigured,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  unixToSqlite,
  normalizedSubscriptionStatus,
};
