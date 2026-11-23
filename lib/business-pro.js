'use strict';
// GoBookr Business Pro — an optional paid subscription for a claimed business that unlocks hiring tools
// (applications, Hiring Inbox, messaging, job posts, candidate statuses, hiring notifications).
//
// Kept completely separate from:
//   - the professional $20/month plan (`subscriptions`, routes/billing.js, STRIPE_PRICE_ID)
//   - optional business-sponsored seats (`business_team_plans`, lib/business-team.js)
//   - the legacy `shop_subscriptions` table
// Its own table, its own Stripe customer per business, its own metadata key (business_pro_shop_id — never shop_id,
// which the legacy webhook matches), its own webhook endpoint and secret, and optionally its own Stripe key.
//
// Live charges are refused unless BUSINESS_PRO_LIVE_BILLING=1 is set together with a live key.
const crypto = require('node:crypto');
const db = require('../db');

const FRESH = 'WITH fresh_read AS (SELECT 1) ';
const ENTITLED = new Set(['active', 'trialing']);
const FEATURES = [
  ['applications', 'Accept résumés and applications', 'Professionals apply to your business or to an opening, with their GoBookr résumé attached.'],
  ['inbox', 'Hiring Inbox', 'Every applicant in one place, newest first, with unread markers.'],
  ['messaging', 'Message applicants', 'Two-way conversations with each candidate, right next to their résumé.'],
  ['jobs', 'Post job openings', 'Openings appear on your business page and on GoBookr Jobs.'],
  ['statuses', 'Candidate status tracking', 'Move people from new to reviewing, interview, offer and hired.'],
  ['notifications', 'Hiring notifications', 'Get told about new applicants and replies in GoBookr and by email.'],
  ['search', 'Recruiting search (coming later)', 'Find professionals who are open to work near you.'],
];

// ---- configuration -----------------------------------------------------------------------------------------------
const enabled = () => process.env.CAREER_STUDIO_ENABLED === '1';
function priceCents() { const n = Number(process.env.BUSINESS_PRO_PRICE_CENTS || 3900); return Number.isInteger(n) && n >= 100 && n <= 100000 ? n : 3900; }
const priceLabel = (cents = priceCents()) => '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
function secretKey() { return String(process.env.BUSINESS_PRO_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '').trim(); }
function keyMode(key = secretKey()) { return /^(sk|rk)_live_/.test(key) ? 'live' : /^(sk|rk)_test_/.test(key) ? 'test' : 'none'; }
// What billing can do right now: 'test' (Stripe test mode), 'live' (explicitly approved), 'blocked' (live key without
// approval) or 'off' (no key).
function billingMode() {
  const m = keyMode();
  if (m === 'live') return process.env.BUSINESS_PRO_LIVE_BILLING === '1' ? 'live' : 'blocked';
  return m === 'test' ? 'test' : 'off';
}
const webhookSecret = () => String(process.env.BUSINESS_PRO_WEBHOOK_SECRET || '').trim();
const graceDays = () => { const n = Number(process.env.BUSINESS_PRO_GRACE_DAYS ?? 3); return Number.isFinite(n) && n >= 0 && n <= 14 ? n : 3; };
const baseUrl = () => String(process.env.APP_URL || 'https://gobookr.com').replace(/\/$/, '');

// ---- entitlement -------------------------------------------------------------------------------------------------
function record(shopId) { return db.prepare(FRESH + 'SELECT * FROM business_pro_subscriptions WHERE shop_id = ?').get(shopId) || null; }
const bool = (v) => v === true || v === 't' || v === 1 || v === '1';
const time = (v) => (v ? new Date(typeof v === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v.replace(' ', 'T') + 'Z' : v).getTime() : NaN);

// Pure decision used by every check. `shop` must be the current row (owner_user_id, claim_status).
function evaluate(sub, shop, { now = Date.now(), mode = billingMode() } = {}) {
  const out = (entitled, state, reason) => ({ entitled, state, reason, sub });
  if (!shop || shop.claim_status !== 'claimed' || !shop.owner_user_id) return out(false, 'unclaimed', 'The business page is not claimed.');
  if (!sub || sub.status === 'none' || sub.status === 'checkout') return out(false, 'free', 'Free plan.');
  if (Number(sub.owner_user_id) !== Number(shop.owner_user_id)) return out(false, 'owner_changed', 'The person who started Business Pro no longer manages this business.');
  // A test-mode subscription never unlocks a live deployment and vice versa.
  if ((mode === 'live') !== bool(sub.livemode) && mode !== 'off') return out(false, 'mode_mismatch', 'This subscription belongs to a different billing mode.');
  const periodEnd = time(sub.current_period_end);
  if (ENTITLED.has(sub.status)) {
    if (Number.isFinite(periodEnd) && periodEnd + 3 * 86400000 < now) return out(false, 'stale', 'Your billing period ended and has not renewed.');
    return out(true, bool(sub.cancel_at_period_end) ? 'canceling' : sub.status, '');
  }
  if (sub.status === 'past_due') {
    const since = time(sub.past_due_since);
    if (Number.isFinite(since) && since + graceDays() * 86400000 > now) return out(true, 'past_due_grace', 'Your last payment failed. Update your card to keep hiring tools.');
    return out(false, 'past_due', 'Your last payment failed, so hiring tools are paused until you update your card.');
  }
  if (sub.status === 'canceled') return out(false, 'canceled', 'Business Pro was canceled.');
  if (sub.status === 'unpaid') return out(false, 'unpaid', 'Business Pro is unpaid. Update your card to restore hiring tools.');
  return out(false, sub.status, 'Business Pro is not active.');
}
function entitlement(shopOrId) {
  const shop = typeof shopOrId === 'object' ? db.prepare(FRESH + 'SELECT id, owner_user_id, claim_status FROM shops WHERE id = ?').get(shopOrId.id) : db.prepare(FRESH + 'SELECT id, owner_user_id, claim_status FROM shops WHERE id = ?').get(shopOrId);
  return evaluate(shop ? record(shop.id) : null, shop);
}
// Server-side gate: the user must own the claimed shop AND the shop must be entitled.
function canHire(user, shopId) {
  if (!user) return { ok: false, code: 401 };
  const shop = db.prepare(FRESH + "SELECT id, owner_user_id, claim_status FROM shops WHERE id = ? AND owner_user_id = ? AND claim_status = 'claimed'").get(shopId, user.id);
  if (!shop) return { ok: false, code: 403 };
  const ent = evaluate(record(shop.id), shop);
  return { ok: ent.entitled, code: ent.entitled ? 200 : 402, entitlement: ent };
}
// Bulk version for lists (job board, shop pages) — one query, no N+1.
function entitledShopIds(shopIds) {
  const ids = [...new Set(shopIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return new Set();
  const rows = db.prepare(FRESH + "SELECT s.id, s.owner_user_id, s.claim_status, b.* , s.id AS shop_id FROM shops s JOIN business_pro_subscriptions b ON b.shop_id = s.id WHERE s.id = ANY(string_to_array(?, ',')::bigint[])").all(ids.join(','));
  return new Set(rows.filter((r) => evaluate(r, { id: r.shop_id, owner_user_id: r.owner_user_id, claim_status: r.claim_status }).entitled).map((r) => Number(r.shop_id)));
}

// ---- Stripe (own key; form-encoded) --------------------------------------------------------------------------------
function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else out.push([key, String(v)]);
  }
  return out;
}
let fetchImpl = (...a) => fetch(...a);
async function stripe(path, { method = 'POST', params = null, idempotencyKey = '' } = {}) {
  const mode = billingMode();
  if (mode === 'off') throw Object.assign(new Error('Business Pro billing is not configured.'), { code: 'BILLING_OFF' });
  if (mode === 'blocked') throw Object.assign(new Error('Live Business Pro charges are turned off.'), { code: 'LIVE_BLOCKED' });
  const headers = { Authorization: `Bearer ${secretKey()}`, 'Stripe-Version': '2024-06-20' };
  let body;
  if (params && method !== 'GET') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form(params)).toString(); }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const qs = params && method === 'GET' ? '?' + new URLSearchParams(form(params)).toString() : '';
  // A local Stripe stand-in may be used for automated browser tests, and only with a test-mode key.
  const api = mode === 'test' && /^http:\/\/127\.0\.0\.1:\d+$/.test(String(process.env.BUSINESS_PRO_STRIPE_API_BASE || '')) ? process.env.BUSINESS_PRO_STRIPE_API_BASE : 'https://api.stripe.com';
  const res = await fetchImpl(api + '/v1' + path + qs, { method, headers, body, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data.error && data.error.message) || `Stripe error ${res.status}`), { status: res.status, stripe: data.error });
  return data;
}

function ensureRow(shop, userId) {
  db.prepare('INSERT INTO business_pro_subscriptions (shop_id, owner_user_id) VALUES (?, ?) ON CONFLICT (shop_id) DO NOTHING').run(shop.id, userId);
  return record(shop.id);
}

// Start (or resume) a Stripe Checkout for Business Pro. Idempotent per shop+owner+price for 30 minutes.
async function startCheckout({ shop, user }) {
  if (Number(shop.owner_user_id) !== Number(user.id) || shop.claim_status !== 'claimed') throw Object.assign(new Error('Only the owner of this claimed business can start Business Pro.'), { code: 'NOT_OWNER' });
  const row = ensureRow(shop, user.id);
  const current = evaluate(row, shop);
  if (current.entitled || ['active', 'trialing', 'past_due', 'unpaid'].includes(row.status) && Number(row.owner_user_id) === Number(user.id)) throw Object.assign(new Error('Business Pro is already set up. Use Manage billing.'), { code: 'ALREADY' });
  const window = Math.floor(Date.now() / (30 * 60 * 1000));
  const key = `bizpro-checkout-${shop.id}-${user.id}-${priceCents()}-${window}`;
  const priceId = String(process.env.BUSINESS_PRO_STRIPE_PRICE_ID || '').trim();
  const lineItem = priceId ? { price: priceId, quantity: 1 } : { quantity: 1, price_data: { currency: 'usd', unit_amount: priceCents(), recurring: { interval: 'month' }, product_data: { name: 'GoBookr Business Pro', description: 'Hiring tools for your GoBookr business page' } } };
  const meta = { kind: 'business_pro', business_pro_shop_id: String(shop.id), business_pro_owner_user_id: String(user.id) };
  const params = {
    mode: 'subscription', line_items: [lineItem], client_reference_id: `bizpro-${shop.id}`,
    success_url: `${baseUrl()}/dashboard/shop/business-pro?shop=${shop.id}&checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl()}/dashboard/shop/business-pro?shop=${shop.id}&canceled=1`,
    metadata: meta, subscription_data: { metadata: meta, description: `GoBookr Business Pro — ${String(shop.name || '').slice(0, 80)}` },
    allow_promotion_codes: 'false',
  };
  if (row.stripe_customer_id) params.customer = row.stripe_customer_id; else params.customer_email = user.email;
  const session = await stripe('/checkout/sessions', { params, idempotencyKey: key });
  db.prepare("UPDATE business_pro_subscriptions SET status = CASE WHEN status IN ('none','canceled','incomplete_expired') THEN 'checkout' ELSE status END, owner_user_id = ?, stripe_checkout_session_id = ?, checkout_key = ?, updated_at = CURRENT_TIMESTAMP WHERE shop_id = ?").run(user.id, session.id, key, shop.id);
  return session;
}

// Apply a Stripe subscription object to our table. Only subscriptions carrying our metadata are accepted, and only
// for the shop named in that metadata. Returns the updated row or null when the object is not ours.
function applySubscription(sub) {
  if (!sub || !sub.metadata || sub.metadata.kind !== 'business_pro') return null;
  const shopId = Number(sub.metadata.business_pro_shop_id), ownerId = Number(sub.metadata.business_pro_owner_user_id);
  if (!Number.isInteger(shopId) || shopId < 1 || !Number.isInteger(ownerId)) return null;
  const row = record(shopId);
  if (!row) return null;
  // A different, newer subscription for the same shop wins; never let an old canceled one overwrite it.
  if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id && ENTITLED.has(row.status) && !ENTITLED.has(sub.status)) return row;
  const item = sub.items && sub.items.data && sub.items.data[0];
  const periodEnd = sub.current_period_end || (item && item.current_period_end);
  const status = ['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'].includes(sub.status) ? sub.status : 'incomplete';
  const pastDueSince = status === 'past_due' ? (row.status === 'past_due' && row.past_due_since ? row.past_due_since : new Date().toISOString()) : null;
  return db.prepare(`UPDATE business_pro_subscriptions SET stripe_subscription_id = ?, stripe_customer_id = ?, status = ?, livemode = ?, price_cents = ?, currency = ?,
      current_period_end = ?, cancel_at_period_end = ?, past_due_since = ?, canceled_at = ?, owner_user_id = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE shop_id = ? RETURNING *`).get(sub.id, typeof sub.customer === 'object' ? sub.customer.id : sub.customer, status, Boolean(sub.livemode),
    item && item.price ? Number(item.price.unit_amount) : null, (item && item.price && item.price.currency) || 'usd',
    periodEnd ? new Date(periodEnd * 1000).toISOString() : null, Boolean(sub.cancel_at_period_end), pastDueSince,
    sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null, ownerId, shopId);
}
async function syncSubscription(id) { return applySubscription(await stripe(`/subscriptions/${encodeURIComponent(id)}`, { method: 'GET' })); }

// Return from Checkout: confirm with Stripe directly instead of waiting for the webhook.
async function confirmCheckout(shop, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId || ''))) return null;
  const row = record(shop.id);
  if (!row || row.stripe_checkout_session_id !== sessionId) return null;
  const session = await stripe(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
  if (!session.metadata || session.metadata.business_pro_shop_id !== String(shop.id) || !session.subscription) return null;
  return syncSubscription(typeof session.subscription === 'object' ? session.subscription.id : session.subscription);
}

async function portal(shop, user) {
  const row = record(shop.id);
  if (!row || !row.stripe_customer_id) throw Object.assign(new Error('There is no Business Pro billing to manage yet.'), { code: 'NO_CUSTOMER' });
  if (Number(row.owner_user_id) !== Number(user.id) || Number(shop.owner_user_id) !== Number(user.id)) throw Object.assign(new Error('Only the owner who set up Business Pro can manage its billing.'), { code: 'NOT_OWNER' });
  return stripe('/billing_portal/sessions', { params: { customer: row.stripe_customer_id, return_url: `${baseUrl()}/dashboard/shop/business-pro?shop=${shop.id}` } });
}

function verifySignature(rawBody, header, secret = webhookSecret(), tolerance = 300) {
  if (!secret || !rawBody || !header) return false;
  const parts = String(header).split(','), t = Number((parts.find((p) => p.startsWith('t=')) || '').slice(2));
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!Number.isFinite(t) || !sigs.length || Math.abs(Date.now() / 1000 - t) > tolerance) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`).digest();
  return sigs.some((s) => /^[a-f0-9]{64}$/i.test(s) && crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
}
function claimEvent(id) { return Boolean(db.prepare('INSERT INTO business_pro_events (event_id) VALUES (?) ON CONFLICT DO NOTHING RETURNING event_id').get(String(id))); }

// Handle one verified Stripe event. Always re-reads the subscription from Stripe, so event order does not matter.
async function handleEvent(event) {
  const obj = (event.data && event.data.object) || {};
  let subId = null;
  if (event.type === 'checkout.session.completed' && obj.metadata && obj.metadata.kind === 'business_pro') subId = obj.subscription;
  else if (event.type && event.type.startsWith('customer.subscription.') && obj.metadata && obj.metadata.kind === 'business_pro') subId = obj.id;
  else if (event.type && event.type.startsWith('invoice.')) {
    const meta = (obj.subscription_details && obj.subscription_details.metadata) || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.metadata) || {};
    if (meta.kind === 'business_pro') subId = obj.subscription || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription);
  }
  if (!subId) return { ignored: true };
  if (typeof subId === 'object') subId = subId.id;
  return { row: await syncSubscription(subId) };
}

function isBusinessProObject(obj) { return Boolean(obj && obj.metadata && obj.metadata.kind === 'business_pro'); }

module.exports = {
  FEATURES, enabled, priceCents, priceLabel, billingMode, keyMode, graceDays, webhookSecret,
  record, evaluate, entitlement, canHire, entitledShopIds, startCheckout, applySubscription, syncSubscription, confirmCheckout, portal,
  verifySignature, claimEvent, handleEvent, isBusinessProObject, form,
  _stripe: stripe,
  _setFetch(f) { fetchImpl = f; },
};
