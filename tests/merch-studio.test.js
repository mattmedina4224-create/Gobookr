'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const caps = require('../lib/merch/capabilities');
const qr = require('../lib/merch/qr');
const artwork = require('../lib/merch/artwork');
const orders = require('../lib/merch/orders');
const suppliers = require('../lib/merch/suppliers');
const branding = require('../lib/merch/branding');
const { memoryStore } = require('../lib/merch/store');
const { qrTarget } = require('../lib/merch/identity');
const { renderPrintFile } = require('./helpers/merch-fixtures');

const ADDRESS = { name: 'Northline Barber Co.', address1: '100 Main St', city: 'Denver', state: 'CO', zip: '80203' };

test('catalog shows only what each supplier supports', () => {
  const printful = caps.catalogFor('printful').map((p) => p.key);
  assert.deepEqual(printful.sort(), ['appointment_card', 'business_card', 'sticker_kiss_cut', 'tshirt']);
  assert.deepEqual(caps.catalogFor('gelato'), [], 'unverified supplier offers nothing orderable');
  assert.ok(caps.laterProducts().every((p) => !caps.catalogFor('printful').some((c) => c.key === p.key)));
  assert.equal(caps.validateLine({ product: 'business_card', supplier: 'printful', finish: 'glossy', pack: 100, units: 1 }).ok, false, 'no gloss on Printful cards');
  assert.equal(caps.validateLine({ product: 'sticker_kiss_cut', supplier: 'printful', size: '2x2', units: 10 }).ok, false);
  assert.equal(caps.validateLine({ product: 'business_card', supplier: 'printful', pack: 250, units: 2 }).ok, false, 'Printful sells sets of 50 or 100 only');
  assert.deepEqual(caps.unitsForPieces('business_card', 'printful', 500), { pack: 100, units: 5 });
  assert.deepEqual(caps.unitsForPieces('business_card', 'printful', 150), { pack: 50, units: 3 });
  assert.equal(caps.unitsForPieces('business_card', 'printful', 125), null);
});

test('print geometry follows the supplier spec, not a generic format', () => {
  const g = caps.geometry('business_card', 'printful', '3.5x2');
  assert.deepEqual(g.canvasPx, { w: 1125, h: 675 });
  assert.deepEqual(g.trimPx, { w: 1050, h: 600 });
  assert.equal(caps.geometry('sticker_kiss_cut', 'printful', '3x3').canvasPx.w, 900);
  assert.equal(caps.geometry('tshirt', 'printful').dpi, 150);
  assert.equal(caps.geometry('business_card', 'gelato'), null);
});

test('QR encoder round-trips GoBookr links and rejects tiny prints', () => {
  for (const url of ['https://gobookr.com/pro/1', 'https://gobookr.com/shop/123456', 'https://gobookr.com/merch/reorder/GBM-1A2B3C4D', 'https://gobookr.com/pro/' + '9'.repeat(120)]) {
    const code = qr.encode(url);
    assert.equal(qr.decodeMatrix(code.modules).text, url);
    assert.ok(qr.verify(code, url, { printInches: 0.8 }).ok);
  }
  const code = qr.encode('https://gobookr.com/pro/1');
  assert.equal(qr.verify(code, 'https://gobookr.com/pro/1', { printInches: 0.5 }).ok, false);
  assert.equal(qr.verify(code, 'https://gobookr.com/pro/2').ok, false);
  const broken = code.modules.map((r) => r.slice()); broken[12][12] ^= 1; broken[13][14] ^= 1;
  assert.throws(() => qr.decodeMatrix(broken));
});

test('a professional QR always targets their permanent profile', () => {
  assert.equal(qrTarget({ kind: 'pro', id: 42 }), 'https://gobookr.com/pro/42');
  assert.equal(qrTarget({ kind: 'shop', id: 7 }), 'https://gobookr.com/shop/7');
  assert.throws(() => qrTarget({ kind: 'workplace', id: 7 }));
});

test('preflight accepts a correct print file and reads the QR from its pixels', () => {
  const url = 'https://gobookr.com/pro/42';
  const { file, placement } = renderPrintFile({ qrText: url });
  const r = artwork.preflight({ product: 'business_card', supplier: 'printful', size: '3.5x2', side: 'back', file, qrPlacement: placement, qrTarget: url });
  assert.ok(r.ok, r.issues.join('; '));
  assert.equal(r.qr.decoded, url);
  assert.ok(r.qr.inches >= 0.75);
});

test('preflight rejects wrong size, a covered QR, a low-contrast QR, and a small QR', () => {
  const url = 'https://gobookr.com/pro/42';
  const wrong = renderPrintFile({ width: 1050, height: 600 });
  assert.match(artwork.preflight({ product: 'business_card', supplier: 'printful', size: '3.5x2', side: 'front', file: wrong.file }).issues[0], /1125×675/);
  const covered = renderPrintFile({ qrText: url, overlap: true });
  assert.equal(artwork.preflight({ product: 'business_card', supplier: 'printful', size: '3.5x2', side: 'back', file: covered.file, qrPlacement: covered.placement, qrTarget: url }).ok, false);
  const small = renderPrintFile({ qrText: url, modulePx: 4 });
  assert.match(artwork.preflight({ product: 'business_card', supplier: 'printful', size: '3.5x2', side: 'back', file: small.file, qrPlacement: small.placement, qrTarget: url }).issues.join(' '), /at least 0.75 in/);
  const other = renderPrintFile({ qrText: 'https://gobookr.com/shop/1' });
  assert.equal(artwork.preflight({ product: 'business_card', supplier: 'printful', size: '3.5x2', side: 'back', file: other.file, qrPlacement: other.placement, qrTarget: url }).ok, false);
});

async function demoOrder(store, sup) {
  const card = await store.saveDesign({ owner_kind: 'shop', owner_id: 7, product: 'business_card', supplier: 'printful', size: '3.5x2', name: 'Card', print_files_ok: true, qr_target: 'https://gobookr.com/shop/7', qr_verified_at: new Date().toISOString(), files: [{ placement: 'front', url: 'https://x/f.png' }, { placement: 'back', url: 'https://x/b.png' }] });
  const tee = await store.saveDesign({ owner_kind: 'shop', owner_id: 7, product: 'tshirt', supplier: 'printful', name: 'Tee', print_files_ok: true, files: [{ placement: 'front', url: 'https://x/t.png' }] });
  const stick = await store.saveDesign({ owner_kind: 'shop', owner_id: 7, product: 'sticker_kiss_cut', supplier: 'printful', size: '3x3', name: 'Sticker', print_files_ok: true, files: [{ placement: 'default', url: 'https://x/s.png' }] });
  const designs = { [card.id]: card, [tee.id]: tee, [stick.id]: stick };
  const lines = [...[['S', 5], ['M', 10], ['L', 15], ['XL', 15], ['2XL', 5]].map(([size, units]) => ({ product: 'tshirt', supplier: 'printful', color: 'black', size, units, design_id: tee.id })),
    { product: 'business_card', supplier: 'printful', size: '3.5x2', sides: 'double', pack: 100, units: 5, design_id: card.id },
    { product: 'sticker_kiss_cut', supplier: 'printful', size: '3x3', units: 100, design_id: stick.id }];
  const order = await orders.createOrder(store, { owner: { kind: 'shop', id: 7 }, businessName: 'Northline Barber Co.', shipTo: ADDRESS, lines, designs });
  return orders.quote(store, order.id, sup);
}

test('demo order: 50 tees, 500 cards, 100 stickers — suppliers only after payment, idempotent', async () => {
  const store = memoryStore(), sup = suppliers.registry({ printful: suppliers.simulated('printful') });
  let submits = 0; const orig = sup.printful.submit; sup.printful.submit = async (a) => { submits++; return orig(a); };
  const q = await demoOrder(store, sup);
  const items = await store.items(q.id);
  assert.equal(items.filter((i) => i.product === 'tshirt').reduce((s, i) => s + i.pieces, 0), 50);
  assert.equal(items.find((i) => i.product === 'business_card').pieces, 500);
  assert.equal(items.find((i) => i.product === 'sticker_kiss_cut').pieces, 100);
  assert.equal(q.total_cents, q.subtotal_cents + q.shipping_cents + q.tax_cents);
  assert.equal(q.simulated, true);
  await assert.rejects(orders.submitSupplierOrders(store, q.id, sup), /after payment/);
  const session = await orders.startCheckout(store, q.id, { stripe: null });
  assert.equal(submits, 0, 'nothing submitted before payment');
  const paid = await orders.markPaid(store, { sessionId: session.id, amountTotal: q.total_cents, eventId: 'evt_1', simulated: true }, sup);
  assert.equal(paid.status, 'in_production');
  assert.equal(submits, 1);
  assert.deepEqual(await orders.markPaid(store, { sessionId: session.id, amountTotal: q.total_cents, eventId: 'evt_1' }, sup), { duplicate: true });
  await orders.markPaid(store, { sessionId: session.id, amountTotal: q.total_cents, eventId: 'evt_2' }, sup);
  await orders.submitSupplierOrders(store, q.id, sup);
  assert.equal(submits, 1, 'replays never create a second supplier order');
  const [row] = await store.supplierOrders(q.id);
  await orders.applySupplierUpdate(store, { supplier: 'printful', supplierOrderId: row.supplier_order_id, type: 'shipped', shipment: { id: 's1', carrier: 'USPS', trackingNumber: '9400', items: [] } }, 'pf-1');
  assert.equal((await store.getOrder(q.id)).status, 'shipped');
  await orders.applySupplierUpdate(store, { supplier: 'printful', supplierOrderId: row.supplier_order_id, type: 'shipped', shipment: { id: 's2', carrier: 'UPS', trackingNumber: '1Z', items: [] } }, 'pf-2');
  assert.equal((await store.supplierOrders(q.id))[0].shipments.length, 2, 'split shipments are tracked separately');
  await orders.applySupplierUpdate(store, { supplier: 'printful', supplierOrderId: row.supplier_order_id, type: 'delivered' }, 'pf-3');
  const tl = orders.timeline(await store.events(q.id));
  assert.equal(tl.length, 11);
  assert.ok(tl.every((s) => s.done), tl.filter((s) => !s.done).map((s) => s.key).join(','));
});

test('payment that does not match the quote is held, never fulfilled', async () => {
  const store = memoryStore(), sup = suppliers.registry({ printful: suppliers.simulated('printful') });
  const q = await demoOrder(store, sup); const s = await orders.startCheckout(store, q.id, {});
  assert.deepEqual(await orders.markPaid(store, { sessionId: s.id, amountTotal: q.total_cents - 1, eventId: 'e' }, sup), { mismatch: true });
  assert.equal((await store.getOrder(q.id)).status, 'needs_attention');
  assert.equal((await store.supplierOrders(q.id)).length, 0);
});

test('split routing across suppliers, partial failure and partial refund', async () => {
  const store = memoryStore();
  const failing = suppliers.simulated('printful'); failing.submit = async () => { throw new Error('Printful rejected the file'); };
  const other = suppliers.simulated('gelato');
  const sup = { printful: failing, gelato: other };
  // Pretend Gelato offered stickers for this test only (no verified Gelato offers exist in the real catalog).
  caps.PRODUCTS.sticker_kiss_cut.offers.gelato = caps.PRODUCTS.sticker_kiss_cut.offers.printful;
  caps.SPECS['gelato:sticker_kiss_cut'] = caps.SPECS['printful:sticker_kiss_cut'];
  try {
    const card = await store.saveDesign({ owner_kind: 'pro', owner_id: 3, product: 'business_card', print_files_ok: true, qr_target: 'https://gobookr.com/pro/3', qr_verified_at: 'now', files: [] });
    const st = await store.saveDesign({ owner_kind: 'pro', owner_id: 3, product: 'sticker_kiss_cut', print_files_ok: true, files: [] });
    const o = await orders.createOrder(store, { owner: { kind: 'pro', id: 3 }, shipTo: ADDRESS, designs: { [card.id]: card, [st.id]: st }, lines: [{ product: 'business_card', supplier: 'printful', pack: 100, units: 1, design_id: card.id }, { product: 'sticker_kiss_cut', supplier: 'gelato', size: '3x3', units: 20, design_id: st.id }] });
    const q = await orders.quote(store, o.id, sup); const s = await orders.startCheckout(store, q.id, {});
    const after = await orders.markPaid(store, { sessionId: s.id, amountTotal: q.total_cents }, sup);
    assert.equal(after.status, 'needs_attention');
    const rows = await store.supplierOrders(q.id);
    assert.equal(rows.find((r) => r.supplier === 'gelato').status, 'acknowledged');
    const r = await orders.refundSupplierPortion(store, q.id, 'printful', {});
    assert.ok(r.amount > 0 && r.amount < q.total_cents);
    assert.equal((await store.getOrder(q.id)).status, 'partially_refunded');
    assert.equal((await orders.refundSupplierPortion(store, q.id, 'printful', {})).duplicate, true);
  } finally { delete caps.PRODUCTS.sticker_kiss_cut.offers.gelato; delete caps.SPECS['gelato:sticker_kiss_cut']; }
});

test('orders refuse designs that are unverified or belong to someone else', async () => {
  const store = memoryStore();
  const mine = await store.saveDesign({ owner_kind: 'pro', owner_id: 3, product: 'business_card', print_files_ok: true, qr_target: 'https://gobookr.com/pro/3', files: [] });
  await assert.rejects(orders.createOrder(store, { owner: { kind: 'pro', id: 3 }, shipTo: ADDRESS, designs: { [mine.id]: mine }, lines: [{ product: 'business_card', pack: 50, units: 1, design_id: mine.id }] }), /QR code has not been verified/);
  await assert.rejects(orders.createOrder(store, { owner: { kind: 'shop', id: 9 }, shipTo: ADDRESS, designs: { [mine.id]: mine }, lines: [{ product: 'business_card', pack: 50, units: 1, design_id: mine.id }] }), /belongs to someone else/);
  await assert.rejects(orders.createOrder(store, { owner: { kind: 'pro', id: 3 }, shipTo: { ...ADDRESS, zip: 'abc' }, lines: [] }), /ZIP/);
});

test('live Stripe keys are blocked unless explicitly enabled; expired quotes cannot be paid', async () => {
  const store = memoryStore(), sup = suppliers.registry({ printful: suppliers.simulated('printful') });
  const q = await demoOrder(store, sup);
  const prev = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_live_123';
    await assert.rejects(orders.startCheckout(store, q.id, { stripe: {} }), /Live payments are turned off/);
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    let params, key; const stripe = { createSession: async (p, k) => { params = p; key = k; return { id: 'cs_test_1', url: 'https://checkout.stripe.com/x' }; } };
    await orders.startCheckout(store, q.id, { stripe, successUrl: 'https://gobookr.com/s', cancelUrl: 'https://gobookr.com/c' });
    assert.match(key, /^merch-checkout-/);
    assert.equal(params['metadata[merch_order_number]'], q.order_number);
    const total = Object.entries(params).filter(([k]) => k.endsWith('[unit_amount]')).reduce((s, [, v]) => s + v, 0);
    assert.equal(total, q.total_cents, 'checkout charges exactly the quoted total');
    await store.updateOrder(q.id, { quote_expires_at: new Date(Date.now() - 1000).toISOString() });
    await assert.rejects(orders.startCheckout(store, q.id, { stripe }), /expired/);
  } finally { if (prev === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = prev; }
});

test('Printful adapter: estimate, idempotent draft lookup, confirm only through submit', async () => {
  const prev = { k: process.env.PRINTFUL_API_KEY, l: process.env.MERCH_LIVE_FULFILLMENT };
  process.env.PRINTFUL_API_KEY = 'test-token'; process.env.MERCH_LIVE_FULFILLMENT = '1';
  const calls = []; const existing = new Map();
  const fetchImpl = async (url, opts) => {
    const path = url.replace('https://api.printful.com', ''); calls.push(`${opts.method} ${path}`);
    const ok = (result, status = 200) => ({ ok: status < 400, status, json: async () => ({ code: status, result }) });
    if (path === '/products/724') return ok({ variants: [{ id: 11, name: 'Set of Business Cards (100 pcs)', size: '3.5″×2″' }, { id: 10, name: 'Set of Business Cards (50 pcs)', size: '3.5″×2″' }] });
    if (path === '/orders/estimate-costs') return ok({ costs: { currency: 'USD', subtotal: '58.00', shipping: '4.99', tax: '3.10', vat: 0 } });
    if (path.startsWith('/orders/@')) return existing.has(path) ? ok(existing.get(path)) : ok(null, 404);
    if (path === '/orders' && opts.method === 'POST') { const body = JSON.parse(opts.body); assert.equal(body.items[0].variant_id, 11); assert.ok(!('confirm' in body)); const o = { id: 555, status: 'draft' }; existing.set('/orders/@' + body.external_id, o); return ok(o); }
    if (path === '/orders/555/confirm') { existing.forEach((v) => { v.status = 'pending'; }); return ok({ id: 555, status: 'pending' }); }
    return ok(null, 404);
  };
  try {
    const pf = suppliers.printful({ fetchImpl });
    assert.equal(pf.mode, 'live');
    const line = { id: 'L1', product: 'business_card', size: '3.5x2', pack: 100, units: 2, files: [{ placement: 'front', url: 'https://x/f.png' }] };
    const q = await pf.quote({ lines: [line], recipient: ADDRESS });
    assert.equal(q.lines[0].totalCents, 5800); assert.equal(q.shippingCents, 499); assert.equal(q.taxCents, 310); assert.equal(q.simulated, false);
    const first = await pf.submit({ externalId: 'gbm-1-printful', recipient: ADDRESS, lines: [line], packingSlip: branding.supplierPackingSlip({ order_number: 'GBM-1', business_name: 'Northline' }, 'printful') });
    assert.equal(first.supplierOrderId, '555'); assert.equal(first.acknowledged, true);
    await pf.submit({ externalId: 'gbm-1-printful', recipient: ADDRESS, lines: [line] });
    assert.equal(calls.filter((c) => c === 'POST /orders').length, 1, 'second submit reuses the existing Printful order');
    assert.equal(calls.filter((c) => c.endsWith('/confirm')).length, 1);
  } finally { for (const [k, v] of [['PRINTFUL_API_KEY', prev.k], ['MERCH_LIVE_FULFILLMENT', prev.l]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  assert.equal(suppliers.printful().mode, 'simulated', 'without the live flag Printful is simulated');
});

test('branding never claims GoBookr made the goods and only promises supported packaging', () => {
  const c = branding.insertCopy('Northline Barber Co.');
  assert.equal(c.headline, 'Made for your business. Powered by GoBookr.');
  assert.match(c.greeting, /Northline Barber Co\./);
  const slip = branding.packingSlipHtml({ order_number: 'GBM-1', business_name: 'Northline' }, [{ label: 'Tee', pieces: 50, supplier: 'printful' }], [{ shipments: [{}, {}] }]);
  assert.doesNotMatch(slip, /manufactured by GoBookr|made by GoBookr/i);
  assert.match(slip, /separate packages/);
  const promise = branding.brandingPromise(['printful', 'gelato']);
  assert.equal(promise[0].items.find((i) => /Custom mailers/.test(i.label)).ok, false);
  assert.ok(promise[1].items.every((i) => !i.ok), 'nothing promised for unverified suppliers');
  assert.ok(qr.verify(qr.encode(branding.reorderUrl('GBM-1')), 'https://gobookr.com/merch/reorder/GBM-1').ok);
});
