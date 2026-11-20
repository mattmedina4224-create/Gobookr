'use strict';
// Supplier adapters. Every adapter exposes the same interface:
//   quote({ lines, recipient })            -> { lines:[{ id, unitCents, totalCents }], shippingCents, taxCents, currency, simulated, source }
//   submit({ externalId, recipient, lines, packingSlip }) -> { supplierOrderId, status, acknowledged, simulated, raw }
//   status(supplierOrderId)                -> { status, shipments:[...] }
// Printful is the only real integration. It talks to the API only when PRINTFUL_API_KEY is set AND
// MERCH_LIVE_FULFILLMENT=1; otherwise it behaves as a clearly-labelled simulation. No other supplier makes
// network calls.
const crypto = require('node:crypto');
const caps = require('./capabilities');

// ---- simulated -------------------------------------------------------------------------------------------------
// Placeholder amounts so the flow can be exercised end to end. They are NOT supplier prices and every surface that
// shows them labels them "Simulated".
const SIM_UNIT_CENTS = { business_card: { 50: 1900, 100: 2900 }, appointment_card: { 50: 1900, 100: 2900 }, sticker_kiss_cut: { '3x3': 250, '4x4': 290, '5.5x5.5': 350, '15x3.75': 450 }, tshirt: { S: 1350, M: 1350, L: 1350, XL: 1350, '2XL': 1550 } };
function simUnit(line) {
  const t = SIM_UNIT_CENTS[line.product] || {};
  return t[line.pack] || t[line.size] || 1000;
}
function simulated(key) {
  const orders = new Map();
  return {
    key, mode: 'simulated', name: caps.SUPPLIERS[key].name,
    async quote({ lines }) {
      const out = lines.map((l) => ({ id: l.id, unitCents: simUnit(l), totalCents: simUnit(l) * l.units }));
      const sub = out.reduce((s, l) => s + l.totalCents, 0);
      return { lines: out, shippingCents: 795 + 150 * Math.max(0, lines.length - 1), taxCents: Math.round(sub * 0.0765), currency: 'usd', simulated: true, source: `Simulated ${caps.SUPPLIERS[key].name} quote — not a real price` };
    },
    async submit({ externalId }) {
      if (orders.has(externalId)) return { ...orders.get(externalId), duplicate: true };
      const rec = { supplierOrderId: `sim_${key}_${crypto.createHash('sha1').update(externalId).digest('hex').slice(0, 10)}`, status: 'pending', acknowledged: true, simulated: true };
      orders.set(externalId, rec); return rec;
    },
    async status(id) { return { status: 'pending', shipments: [], simulated: true, id }; },
  };
}

// ---- Printful ----------------------------------------------------------------------------------------------------
const PF_API = 'https://api.printful.com';
function printfulLive() { return Boolean(String(process.env.PRINTFUL_API_KEY || '').trim()) && process.env.MERCH_LIVE_FULFILLMENT === '1'; }
async function pf(path, { method = 'GET', body } = {}, fetchImpl = fetch) {
  const headers = { Authorization: 'Bearer ' + String(process.env.PRINTFUL_API_KEY || '').trim(), 'Content-Type': 'application/json' };
  if (process.env.PRINTFUL_STORE_ID) headers['X-PF-Store-Id'] = String(process.env.PRINTFUL_STORE_ID);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchImpl(PF_API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) return null;
    if (!res.ok) { const err = new Error((data && data.error && data.error.message) || data.result || `Printful request failed (${res.status})`); err.status = res.status; throw err; }
    return data.result;
  } finally { clearTimeout(timer); }
}
const centsOf = (v) => Math.round(Number(v || 0) * 100);

function printful({ fetchImpl = fetch } = {}) {
  if (!printfulLive()) return { ...simulated('printful'), liveCapable: Boolean(process.env.PRINTFUL_API_KEY) };
  const variantCache = new Map();
  async function variantFor(line) {
    const o = caps.offer(line.product, 'printful');
    const key = `${o.supplierProductId}`;
    if (!variantCache.has(key)) variantCache.set(key, await pf(`/products/${o.supplierProductId}`, {}, fetchImpl));
    const product = variantCache.get(key);
    const variants = (product && product.variants) || [];
    const norm = (s) => String(s || '').toLowerCase().replace(/[″"\s]/g, '');
    const want = { size: line.size && (o.sizes.find((s) => s.key === line.size) || {}).label, color: line.color && (o.colors || []).find((c) => c.key === line.color) };
    const match = variants.filter((v) => (!want.size || norm(v.size) === norm(want.size) || norm(v.name).includes(norm(want.size)))
      && (!want.color || norm(v.color) === norm(want.color.label))
      && (!line.pack || line.pack === 1 || norm(v.name).includes(String(line.pack))));
    if (match.length !== 1) { const err = new Error(`Printful variant for ${line.product} ${line.size || ''} ${line.color || ''} could not be matched exactly (${match.length} candidates).`); err.code = 'VARIANT_UNRESOLVED'; throw err; }
    if (match[0].in_stock === false) { const err = new Error(`${line.product} ${line.size || ''} is out of stock at Printful.`); err.code = 'OUT_OF_STOCK'; throw err; }
    return match[0].id;
  }
  async function items(lines) {
    return Promise.all(lines.map(async (l) => ({ external_id: String(l.id), variant_id: await variantFor(l), quantity: l.units, files: (l.files || []).map((f) => ({ type: f.placement, url: f.url })) })));
  }
  const recipientBody = (r) => ({ name: r.name, company: r.company || undefined, address1: r.address1, address2: r.address2 || undefined, city: r.city, state_code: r.state, country_code: r.country || 'US', zip: r.zip, phone: r.phone || undefined, email: r.email || undefined });
  return {
    key: 'printful', mode: 'live', name: 'Printful',
    async quote({ lines, recipient }) {
      const result = await pf('/orders/estimate-costs', { method: 'POST', body: { recipient: recipientBody(recipient), items: await items(lines) } }, fetchImpl);
      const c = (result && result.costs) || {};
      // Per-line split proportional to Printful's subtotal is not returned; keep the supplier subtotal authoritative.
      const subtotal = centsOf(c.subtotal), weights = lines.map((l) => simUnit(l) * l.units), wsum = weights.reduce((a, b) => a + b, 0) || 1;
      let assigned = 0;
      const out = lines.map((l, i) => { const t = i === lines.length - 1 ? subtotal - assigned : Math.round((subtotal * weights[i]) / wsum); assigned += t; return { id: l.id, unitCents: Math.round(t / l.units), totalCents: t }; });
      return { lines: out, shippingCents: centsOf(c.shipping), taxCents: centsOf(c.tax) + centsOf(c.vat), currency: String(c.currency || 'USD').toLowerCase(), simulated: false, source: 'Printful estimate-costs API' };
    },
    async submit({ externalId, recipient, lines, packingSlip }) {
      // Idempotent: external_id is unique per Printful store. Look it up first; create a draft only if missing.
      let order = await pf(`/orders/@${encodeURIComponent(externalId)}`, {}, fetchImpl);
      if (!order) order = await pf('/orders', { method: 'POST', body: { external_id: externalId, shipping: 'STANDARD', recipient: recipientBody(recipient), items: await items(lines), packing_slip: packingSlip } }, fetchImpl);
      if (order.status === 'draft') order = await pf(`/orders/${order.id}/confirm`, { method: 'POST' }, fetchImpl);
      return { supplierOrderId: String(order.id), status: order.status, acknowledged: order.status !== 'draft', simulated: false };
    },
    async status(id) {
      const order = await pf(`/orders/${encodeURIComponent(id)}`, {}, fetchImpl);
      return { status: order && order.status, shipments: ((order && order.shipments) || []).map(shipmentFrom), simulated: false };
    },
  };
}
function shipmentFrom(s) {
  return { id: String(s.id || ''), carrier: s.carrier || '', service: s.service || '', trackingNumber: s.tracking_number || '', trackingUrl: /^https:\/\//.test(String(s.tracking_url || '')) ? s.tracking_url : '', shippedAt: s.ship_date || s.shipped_at || null, items: (s.items || []).map((i) => ({ lineId: i.item_id || i.external_id, quantity: i.quantity })) };
}

function registry(overrides = {}) {
  return { printful: overrides.printful || printful(overrides), gelato: overrides.gelato || simulated('gelato'), printify: overrides.printify || simulated('printify') };
}

module.exports = { registry, printful, simulated, printfulLive, shipmentFrom, pf };
