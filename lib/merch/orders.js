'use strict';
// Merch Studio order lifecycle: build → route/split → quote → checkout → paid (webhook) → supplier submit
// (idempotent) → acknowledgment → shipments/tracking → delivered, plus failure and refund handling.
// Supplier orders are only ever submitted after Stripe has confirmed payment for the exact quoted total.
const crypto = require('node:crypto');
const caps = require('./capabilities');
const branding = require('./branding');

const STEPS = [
  ['design_saved', 'Design saved'], ['qr_verified', 'QR codes verified'], ['print_files_ready', 'Print files checked'],
  ['quoted', 'Supplier pricing, shipping and tax quoted'], ['checkout_created', 'Secure checkout opened'],
  ['payment_confirmed', 'Payment confirmed'], ['routed', 'Order routed to suppliers'], ['supplier_submitted', 'Supplier orders submitted'],
  ['supplier_acknowledged', 'Suppliers acknowledged'], ['shipped', 'Shipped with tracking'], ['delivered', 'Delivered'],
];
const QUOTE_TTL_MS = 30 * 60 * 1000;
const STATUS_LABEL = { draft: 'Draft', quoted: 'Quoted', awaiting_payment: 'Awaiting payment', paid: 'Paid', in_production: 'In production', partially_shipped: 'Partly shipped', shipped: 'Shipped', delivered: 'Delivered', needs_attention: 'Needs attention', refunded: 'Refunded', partially_refunded: 'Partly refunded', canceled: 'Canceled' };

function orderNumber() { return 'GBM-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }
function lineLabel(l) {
  const p = caps.PRODUCTS[l.product], o = caps.offer(l.product, l.supplier) || {};
  const size = (o.sizes || []).find((s) => s.key === l.size), color = (o.colors || []).find((c) => c.key === l.color);
  const unit = o.orderUnit === 'set' ? ` (${l.units} set${l.units === 1 ? '' : 's'} of ${l.pack})` : '';
  return [p ? p.name : l.product, color && color.label, size && size.label].filter(Boolean).join(' · ') + unit;
}
const hashQuote = (q) => crypto.createHash('sha256').update(JSON.stringify(q)).digest('hex').slice(0, 16);

// Route each line to a supplier: the explicitly chosen one if it offers the product, otherwise the first
// supplier with a verified offer (live integrations first).
function route(line) {
  if (line.supplier && caps.offer(line.product, line.supplier)) return line.supplier;
  const order = Object.values(caps.SUPPLIERS).sort((a, b) => (a.integration === 'live' ? -1 : 0) - (b.integration === 'live' ? -1 : 0));
  const found = order.find((s) => caps.offer(line.product, s.key));
  return found ? found.key : null;
}

async function createOrder(store, { simulate = false, buyerUserId = null, owner, businessName, shipTo, lines, designs = {} }) {
  if (!owner || !['pro', 'shop'].includes(owner.kind) || !Number.isInteger(Number(owner.id))) throw Object.assign(new Error('Choose whose order this is.'), { code: 'OWNER' });
  const addr = validateAddress(shipTo); if (!addr.ok) throw Object.assign(new Error(addr.error), { code: 'ADDRESS' });
  if (!Array.isArray(lines) || !lines.length || lines.length > 40) throw Object.assign(new Error('Add at least one item.'), { code: 'EMPTY' });
  const prepared = lines.map((raw, i) => {
    const line = { ...raw, id: raw.id || `L${i + 1}` };
    line.supplier = route(line);
    if (!line.supplier) throw Object.assign(new Error(`${line.product} is not available from any connected supplier.`), { code: 'UNAVAILABLE' });
    const v = caps.validateLine(line); if (!v.ok) throw Object.assign(new Error(v.error), { code: 'LINE' });
    line.pack = v.pack; line.units = v.units; line.pieces = v.pieces; line.label = lineLabel(line);
    const p = caps.PRODUCTS[line.product];
    if (p.designer === 'card' || p.designer === 'sticker' || p.designer === 'apparel') {
      const design = designs[line.design_id];
      if (!design) throw Object.assign(new Error(`Choose a design for ${p.name.toLowerCase()}.`), { code: 'DESIGN' });
      if (design.owner_kind !== owner.kind || Number(design.owner_id) !== Number(owner.id)) throw Object.assign(new Error('That design belongs to someone else.'), { code: 'DESIGN_OWNER' });
      if (!design.print_files_ok) throw Object.assign(new Error(`The ${p.name.toLowerCase()} design has not passed the print check yet.`), { code: 'PREFLIGHT' });
      if (design.qr_target && !design.qr_verified_at) throw Object.assign(new Error('The QR code has not been verified yet.'), { code: 'QR' });
      line.files = design.files || [];
    }
    return line;
  });
  const order = await store.createOrder({ order_number: orderNumber(), buyer_user_id: buyerUserId, owner_kind: owner.kind, owner_id: Number(owner.id), business_name: String(businessName || '').slice(0, 120), ship_to: addr.value, status: 'draft', currency: 'usd', mode: simulate ? 'simulated' : stripeMode() });
  await store.addItems(order.id, prepared);
  const designIds = [...new Set(prepared.map((l) => l.design_id).filter(Boolean))];
  await store.addEvent(order.id, 'design_saved', `${designIds.length || 'No'} saved design${designIds.length === 1 ? '' : 's'} attached`);
  if (prepared.some((l) => designs[l.design_id] && designs[l.design_id].qr_target)) await store.addEvent(order.id, 'qr_verified', 'Every QR code reads back as its permanent GoBookr link');
  await store.addEvent(order.id, 'print_files_ready', 'Print files match each supplier\'s size, bleed and resolution');
  return order;
}

function groupBySupplier(items) { return items.reduce((g, l) => { (g[l.supplier] = g[l.supplier] || []).push(l); return g; }, {}); }

function validateAddress(a) {
  a = a || {};
  const v = { name: String(a.name || '').trim(), company: String(a.company || '').trim(), address1: String(a.address1 || '').trim(), address2: String(a.address2 || '').trim(), city: String(a.city || '').trim(), state: String(a.state || '').trim().toUpperCase(), zip: String(a.zip || '').trim(), country: String(a.country || 'US').trim().toUpperCase(), phone: String(a.phone || '').trim(), email: String(a.email || '').trim() };
  if (!v.name || !v.address1 || !v.city) return { ok: false, error: 'Enter the full shipping address.' };
  if (v.country !== 'US') return { ok: false, error: 'Merch Studio ships to US addresses only right now.' };
  if (!/^[A-Z]{2}$/.test(v.state)) return { ok: false, error: 'Use the two-letter state code.' };
  if (!/^\d{5}(-\d{4})?$/.test(v.zip)) return { ok: false, error: 'Enter a valid ZIP code.' };
  for (const k of Object.keys(v)) v[k] = v[k].slice(0, 120);
  return { ok: true, value: v };
}

function markupBps() { const n = Number(process.env.MERCH_MARKUP_BPS || 0); return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : 0; }

async function quote(store, orderId, suppliers) {
  const order = await store.getOrder(orderId), items = await store.items(orderId);
  if (!['draft', 'quoted', 'awaiting_payment'].includes(order.status)) throw Object.assign(new Error('This order can no longer be re-priced.'), { code: 'STATE' });
  const groups = groupBySupplier(items), parts = {};
  let subtotal = 0, shipping = 0, tax = 0, simulated = false;
  for (const [key, lines] of Object.entries(groups)) {
    const q = await suppliers[key].quote({ lines, recipient: order.ship_to });
    parts[key] = q; simulated = simulated || q.simulated;
    for (const ql of q.lines) {
      const item = lines.find((l) => l.id === ql.id); const total = Math.round(ql.totalCents * (1 + markupBps() / 10000));
      await store.updateItem(item.row_id, { unit_cents: Math.round(total / item.units), line_cents: total });
      subtotal += total;
    }
    shipping += q.shippingCents; tax += q.taxCents;
  }
  const quoteRecord = { parts, subtotal, shipping, tax, total: subtotal + shipping + tax, simulated, quotedAt: new Date().toISOString(), markupBps: markupBps() };
  quoteRecord.hash = hashQuote({ parts, subtotal, shipping, tax });
  const updated = await store.updateOrder(orderId, { status: 'quoted', subtotal_cents: subtotal, shipping_cents: shipping, tax_cents: tax, total_cents: subtotal + shipping + tax, quote: quoteRecord, quote_expires_at: new Date(Date.now() + QUOTE_TTL_MS).toISOString(), simulated });
  await store.addEvent(orderId, 'quoted', `${simulated ? 'Simulated quote' : 'Supplier quote'}: ${fmt(subtotal)} items + ${fmt(shipping)} shipping + ${fmt(tax)} tax`, { simulated, hash: quoteRecord.hash });
  return updated;
}
const fmt = (c) => '$' + (c / 100).toFixed(2);

// ---- payments ----------------------------------------------------------------------------------------------------
// Test-mode only unless MERCH_LIVE_PAYMENTS=1 is explicitly set with a live key.
function stripeMode() {
  const key = String(process.env.STRIPE_SECRET_KEY || '');
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return process.env.MERCH_LIVE_PAYMENTS === '1' ? 'live' : 'blocked';
  return key ? 'test' : 'simulated';
}

async function startCheckout(store, orderId, { stripe, successUrl, cancelUrl, customerEmail, simulate = false }) {
  const order = await store.getOrder(orderId), items = await store.items(orderId);
  if (order.status !== 'quoted' && order.status !== 'awaiting_payment') throw Object.assign(new Error('Get an up-to-date quote first.'), { code: 'STATE' });
  if (!order.quote_expires_at || Date.parse(order.quote_expires_at) < Date.now()) throw Object.assign(new Error('Your quote expired. Refresh prices to continue.'), { code: 'QUOTE_EXPIRED' });
  const mode = simulate ? 'simulated' : stripeMode();
  if (mode === 'blocked') throw Object.assign(new Error('Live payments are turned off for Merch Studio.'), { code: 'LIVE_BLOCKED' });
  if (order.simulated && mode === 'live') throw Object.assign(new Error('Simulated prices cannot be charged.'), { code: 'SIMULATED_PRICE' });
  if (mode === 'simulated' || !stripe) {
    const session = { id: `cs_sim_${order.order_number}`, url: `/merch/orders/${order.order_number}?simulated_checkout=1`, simulated: true };
    await store.updateOrder(orderId, { status: 'awaiting_payment', stripe_checkout_session_id: session.id });
    await store.addEvent(orderId, 'checkout_created', 'Simulated checkout — no card is charged', { simulated: true });
    return session;
  }
  const params = { mode: 'payment', success_url: successUrl, cancel_url: cancelUrl, client_reference_id: order.order_number, 'metadata[merch_order_id]': order.id, 'metadata[merch_order_number]': order.order_number, 'metadata[quote_hash]': order.quote.hash, 'payment_intent_data[metadata][merch_order_number]': order.order_number, customer_email: customerEmail || undefined, expires_at: Math.floor(Date.now() / 1000) + 31 * 60 };
  let i = 0;
  const add = (name, cents, qty = 1) => { params[`line_items[${i}][price_data][currency]`] = order.currency; params[`line_items[${i}][price_data][product_data][name]`] = name.slice(0, 120); params[`line_items[${i}][price_data][unit_amount]`] = cents; params[`line_items[${i}][quantity]`] = qty; i++; };
  for (const it of items) add(it.label, it.line_cents);
  if (order.shipping_cents) add('Shipping', order.shipping_cents);
  if (order.tax_cents) add('Sales tax', order.tax_cents);
  const session = await stripe.createSession(params, `merch-checkout-${order.id}-${order.quote.hash}`);
  await store.updateOrder(orderId, { status: 'awaiting_payment', stripe_checkout_session_id: session.id });
  await store.addEvent(orderId, 'checkout_created', `Stripe ${mode} checkout ${session.id}`);
  return session;
}

// Called from the verified Stripe webhook (or the simulator). Idempotent.
async function markPaid(store, { sessionId, paymentIntentId = null, amountTotal, currency = 'usd', eventId = null, simulated = false }, suppliers) {
  if (eventId && !(await store.claimWebhook('stripe', eventId))) return { duplicate: true };
  const order = await store.getOrderBySession(sessionId);
  if (!order) return { ignored: true };
  if (['paid', 'in_production', 'partially_shipped', 'shipped', 'delivered'].includes(order.status)) return { duplicate: true, order };
  if (Number(amountTotal) !== Number(order.total_cents) || String(currency).toLowerCase() !== order.currency) {
    await store.updateOrder(order.id, { status: 'needs_attention', attention: 'Payment amount does not match the quote' });
    await store.addEvent(order.id, 'payment_confirmed', `Payment of ${fmt(Number(amountTotal))} does not match the quoted ${fmt(order.total_cents)} — held for review, nothing sent to suppliers`, { error: true });
    return { mismatch: true };
  }
  await store.updateOrder(order.id, { status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId });
  await store.addEvent(order.id, 'payment_confirmed', simulated ? 'Simulated payment confirmed (test only, no card charged)' : `Stripe confirmed ${fmt(order.total_cents)}`, { simulated });
  const groups = groupBySupplier(await store.items(order.id));
  await store.addEvent(order.id, 'routed', Object.keys(groups).map((k) => `${caps.SUPPLIERS[k].name}: ${groups[k].reduce((n, l) => n + l.pieces, 0).toLocaleString('en-US')} pieces in ${groups[k].length} line${groups[k].length === 1 ? '' : 's'}`).join('; '), { suppliers: Object.keys(groups) });
  return submitSupplierOrders(store, order.id, suppliers);
}

async function submitSupplierOrders(store, orderId, suppliers) {
  const order = await store.getOrder(orderId);
  if (!order.paid_at) throw Object.assign(new Error('Supplier orders are only submitted after payment is confirmed.'), { code: 'UNPAID' });
  const groups = groupBySupplier(await store.items(orderId)), results = {};
  for (const [key, lines] of Object.entries(groups)) {
    const externalId = `${order.order_number}-${key}`.toLowerCase();
    const row = await store.upsertSupplierOrder(orderId, key, { external_id: externalId });
    if (['submitted', 'acknowledged', 'in_production', 'shipped', 'delivered'].includes(row.status)) { results[key] = row; continue; }
    try {
      const res = await suppliers[key].submit({ externalId, recipient: order.ship_to, lines, packingSlip: branding.supplierPackingSlip(order, key) });
      results[key] = await store.upsertSupplierOrder(orderId, key, { supplier_order_id: res.supplierOrderId, status: res.acknowledged ? 'acknowledged' : 'submitted', simulated: Boolean(res.simulated), submitted_at: new Date().toISOString(), acknowledged_at: res.acknowledged ? new Date().toISOString() : null, attempts: (row.attempts || 0) + 1, error: '' });
      await store.addEvent(orderId, 'supplier_submitted', `${caps.SUPPLIERS[key].name} order ${res.supplierOrderId}${res.simulated ? ' (simulated)' : ''}`, { supplier: key });
      if (res.acknowledged) await store.addEvent(orderId, 'supplier_acknowledged', `${caps.SUPPLIERS[key].name} accepted the order${res.simulated ? ' (simulated)' : ''}`, { supplier: key });
    } catch (err) {
      results[key] = await store.upsertSupplierOrder(orderId, key, { status: 'failed', attempts: (row.attempts || 0) + 1, error: String(err.message).slice(0, 500) });
      await store.addEvent(orderId, 'supplier_submitted', `${caps.SUPPLIERS[key].name} could not take the order: ${err.message}`, { supplier: key, error: true });
    }
  }
  return refreshStatus(store, orderId);
}

// Supplier webhook / poll result. `update` = { supplier, supplierOrderId, type: 'shipped'|'delivered'|'failed'|'canceled'|'in_production', shipment }
async function applySupplierUpdate(store, update, eventId = null) {
  if (eventId && !(await store.claimWebhook(update.supplier, eventId))) return { duplicate: true };
  const row = await store.supplierOrderBySupplierId(update.supplier, update.supplierOrderId);
  if (!row) return { ignored: true };
  const patch = {};
  if (update.type === 'shipped' && update.shipment) {
    const shipments = (row.shipments || []).filter((s) => s.id !== update.shipment.id).concat([update.shipment]);
    patch.shipments = shipments; patch.status = 'shipped'; patch.shipped_at = row.shipped_at || new Date().toISOString();
    await store.addEvent(row.order_id, 'shipped', `${caps.SUPPLIERS[update.supplier].name} shipped via ${update.shipment.carrier || 'carrier'} ${update.shipment.trackingNumber || ''}`.trim(), { supplier: update.supplier, simulated: row.simulated });
  } else if (update.type === 'delivered') { patch.status = 'delivered'; await store.addEvent(row.order_id, 'delivered', `${caps.SUPPLIERS[update.supplier].name} package delivered`, { supplier: update.supplier }); }
  else if (update.type === 'in_production') patch.status = 'in_production';
  else if (update.type === 'failed' || update.type === 'canceled') { patch.status = 'failed'; patch.error = update.reason || `Supplier reported ${update.type}`; await store.addEvent(row.order_id, 'supplier_acknowledged', `${caps.SUPPLIERS[update.supplier].name} ${update.type} the order: ${patch.error}`, { supplier: update.supplier, error: true }); }
  await store.upsertSupplierOrder(row.order_id, update.supplier, patch);
  return refreshStatus(store, row.order_id);
}

async function refreshStatus(store, orderId) {
  const order = await store.getOrder(orderId), rows = await store.supplierOrders(orderId);
  if (['refunded', 'canceled'].includes(order.status)) return order;
  const st = rows.map((r) => r.status);
  let status = order.status;
  if (st.some((s) => s === 'failed')) status = 'needs_attention';
  else if (st.length && st.every((s) => s === 'delivered')) status = 'delivered';
  else if (st.length && st.every((s) => ['shipped', 'delivered'].includes(s))) status = 'shipped';
  else if (st.some((s) => ['shipped', 'delivered'].includes(s))) status = 'partially_shipped';
  else if (st.length && st.every((s) => ['acknowledged', 'submitted', 'in_production'].includes(s))) status = 'in_production';
  return status === order.status ? order : store.updateOrder(orderId, { status });
}

// Refund the items a failed supplier could not make (plus their share of shipping/tax). Uses Stripe test mode only
// unless live payments are explicitly enabled; idempotency key per order+supplier.
async function refundSupplierPortion(store, orderId, supplierKey, { stripe } = {}) {
  const order = await store.getOrder(orderId), rows = await store.supplierOrders(orderId), row = rows.find((r) => r.supplier === supplierKey);
  if (!row || row.status !== 'failed') throw Object.assign(new Error('Only failed supplier orders can be refunded here.'), { code: 'STATE' });
  if (row.refunded_cents) return { duplicate: true, amount: row.refunded_cents };
  const items = (await store.items(orderId)).filter((i) => i.supplier === supplierKey);
  const itemsCents = items.reduce((s, i) => s + i.line_cents, 0), share = order.subtotal_cents ? itemsCents / order.subtotal_cents : 0;
  const amount = itemsCents + Math.round((order.shipping_cents + order.tax_cents) * share);
  let refundId = `re_sim_${order.order_number}_${supplierKey}`;
  if (stripe && stripeMode() !== 'simulated' && !order.simulated) refundId = (await stripe.refund({ payment_intent: order.stripe_payment_intent_id, amount, 'metadata[merch_order_number]': order.order_number, 'metadata[supplier]': supplierKey }, `merch-refund-${order.id}-${supplierKey}`)).id;
  await store.upsertSupplierOrder(orderId, supplierKey, { refunded_cents: amount, refund_id: refundId, status: 'failed' });
  const allFailed = rows.every((r) => r.supplier === supplierKey || r.status === 'failed');
  await store.updateOrder(orderId, { status: allFailed ? 'refunded' : 'partially_refunded', refunded_cents: (order.refunded_cents || 0) + amount });
  await store.addEvent(orderId, 'supplier_acknowledged', `Refunded ${fmt(amount)} for items ${caps.SUPPLIERS[supplierKey].name} could not produce${refundId.startsWith('re_sim') ? ' (simulated)' : ''}`, { supplier: supplierKey });
  return { amount, refundId };
}

function timeline(events) {
  return STEPS.map(([key, label], i) => {
    const evs = events.filter((e) => e.step === key);
    return { n: i + 1, key, label, done: evs.length > 0 && !evs.every((e) => e.meta && e.meta.error), error: evs.some((e) => e.meta && e.meta.error), events: evs };
  });
}

module.exports = { STEPS, STATUS_LABEL, QUOTE_TTL_MS, route, createOrder, quote, startCheckout, markPaid, submitSupplierOrders, applySupplierUpdate, refundSupplierPortion, refreshStatus, timeline, validateAddress, groupBySupplier, stripeMode, lineLabel, fmt };
