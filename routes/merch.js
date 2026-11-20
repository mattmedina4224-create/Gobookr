'use strict';
// GoBookr Merch Studio routes.
//   Public:  /merch/demo (simulated end-to-end order), /merch/demo/design/:product, /merch/capabilities
//   Signed in (pro or claimed-shop owner) and MERCH_STUDIO_ENABLED=1: studio, designer, saved designs, orders
//   Webhooks: /merch/stripe/webhook (STRIPE_MERCH_WEBHOOK_SECRET), /merch/printful/webhook/:token (PRINTFUL_WEBHOOK_TOKEN)
const crypto = require('node:crypto');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const caps = require('../lib/merch/capabilities');
const orders = require('../lib/merch/orders');
const artwork = require('../lib/merch/artwork');
const views = require('../lib/merch/views');
const demo = require('../lib/merch/demo');
const supplierLib = require('../lib/merch/suppliers');
const { dbStore, memoryStore } = require('../lib/merch/store');
const identity = require('../lib/merch/identity');

const enabled = () => process.env.MERCH_STUDIO_ENABLED === '1';
const DESIGN_PRODUCTS = ['business_card', 'appointment_card', 'sticker_kiss_cut', 'tshirt'];
const MAX_PNG_BYTES = 1.6 * 1024 * 1024;
let storeInstance = null; const store = () => (storeInstance = storeInstance || dbStore());
let supplierInstance = null; const suppliers = () => (supplierInstance = supplierInstance || supplierLib.registry());
const demoDesigns = memoryStore(); // designer demo checks only; never persisted

function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function page(ctx, title, body, opts = {}) { send(ctx.res, layout({ title, currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body, robots: 'noindex', ...opts }), opts.status || 200); }
function requireStudio(ctx) {
  if (!enabled()) { page(ctx, 'Merch Studio', '<section class="section container"><h1>Merch Studio is not available yet</h1><p><a href="/merch/demo">See the demo order</a></p></section>', { status: 404 }); return null; }
  if (!ctx.currentUser) { redirect(ctx.res, '/login?next=' + encodeURIComponent(ctx.req.url)); return null; }
  const owners = identity.ownersFor(ctx.currentUser).map((o) => ({ ...o, qrTarget: identity.qrTarget(o) }));
  if (!owners.length) { page(ctx, 'Merch Studio', '<section class="section container"><h1>Merch Studio is for professionals and business owners</h1><p>Claim your profile or business to design cards and order merch.</p></section>', { status: 403 }); return null; }
  return owners;
}
const pickOwner = (owners, ref) => (ref ? owners.find((o) => `${o.kind}:${o.id}` === ref) : owners[0]) || null;
function decodeDataUrl(v) { const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(v || '')); if (!m) return null; const b = Buffer.from(m[1], 'base64'); return b.length <= MAX_PNG_BYTES ? b : null; }
function cleanDesign(d) {
  const out = {}; const str = (k, n = 90) => { if (d[k] != null) out[k] = String(d[k]).replace(/[\u0000-\u001f]/g, '').slice(0, n); };
  ['business', 'tagline', 'name', 'title', 'phone', 'email', 'website', 'address', 'social', 'qrCaption'].forEach((k) => str(k));
  for (const k of ['frontBg', 'backBg', 'accent', 'teeInk']) if (/^#[0-9a-f]{6}$/i.test(String(d[k] || ''))) out[k] = d[k];
  for (const [k, allowed] of [['layout', ['classic', 'centered', 'bold']], ['font', ['inter', 'display', 'serif']], ['sides', ['single', 'double']], ['paper', ['uncoated', 'white_vinyl']], ['size', ['3.5x2', '3x3', '4x4', '5.5x5.5', '15x3.75', 'S']]]) if (allowed.includes(d[k])) out[k] = d[k];
  out.stickerQr = d.stickerQr === true; out.showGuides = d.showGuides === true;
  if (typeof d.logo === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.logo) && d.logo.length < 1.4e6) out.logo = d.logo;
  return out;
}

async function uploadPrintFile(owner, name, buf) {
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''), key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  if (!base || !key) return null;
  const path = `merch/${owner.kind}-${owner.id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${name}.png`;
  const r = await fetch(`${base}/storage/v1/object/portfolio/${path}`, { method: 'POST', headers: { ...(key.startsWith('sb_secret_') ? {} : { authorization: 'Bearer ' + key }), apikey: key, 'content-type': 'image/png', 'x-upsert': 'false' }, body: buf });
  if (!r.ok) throw new Error('Print file upload failed (' + r.status + ')');
  return `${base}/storage/v1/object/public/portfolio/${path}`;
}

// Preflight every side; the QR side must read back as the owner's permanent link.
function checkFiles(body, owner, product, size) {
  const sp = caps.specFor(product, 'printful'), sides = product === 'tshirt' ? ['front'] : product === 'sticker_kiss_cut' ? ['front'] : (cleanDesign(body.design || {}).sides === 'single' ? ['front'] : sp.sides);
  const results = {}, issues = [], bufs = {};
  const needsQr = product !== 'tshirt' && !(product === 'sticker_kiss_cut' && !(body.design || {}).stickerQr);
  for (const side of sides) {
    const buf = decodeDataUrl(body.files && body.files[side]);
    if (!buf) { issues.push(`The ${side} print file is missing or larger than 1.6 MB.`); continue; }
    bufs[side] = buf;
    const qrHere = needsQr && body.qr && body.qr.side === side;
    const r = artwork.preflight({ product, supplier: 'printful', size, side, file: buf, qrPlacement: qrHere ? body.qr.placement : null, qrTarget: qrHere ? owner.qrTarget : null });
    results[side] = r; issues.push(...r.issues);
  }
  if (needsQr && !(body.qr && results[body.qr.side] && results[body.qr.side].qr)) issues.push('Add the QR code to the design before ordering.');
  if (Array.isArray(body.browserScan) && body.browserScan.length && !body.browserScan.includes(owner.qrTarget)) issues.push('Your browser\'s scanner read a different link from the QR code.');
  return { ok: issues.length === 0, issues: [...new Set(issues)], results, bufs, needsQr };
}

module.exports = function merchRoutes(router) {
  // ---- public demo + capability matrix ---------------------------------------------------------------------------
  router.get('/merch/demo', async (ctx) => {
    const d = await demo.build();
    page(ctx, 'Merch Studio demo order', views.demoPage(d), { description: 'A fully simulated GoBookr Merch Studio order.' });
  });
  router.get('/merch/demo/design/:product', async (ctx) => {
    const product = ctx.params.product; if (!DESIGN_PRODUCTS.includes(product)) return page(ctx, 'Not found', '<section class="section container"><h1>Unknown product</h1></section>', { status: 404 });
    const base = product === 'sticker_kiss_cut' ? demo.STICKER_DESIGN : product === 'tshirt' ? demo.TEE_DESIGN : { ...demo.CARD_DESIGN, showGuides: true };
    page(ctx, 'Try the designer', views.designerPage({ product, owner: demo.DEMO_OWNER, design: base, csrf: ctx.session ? ctx.session.csrf_token : '', saveUrl: '/merch/demo/check', demo: true }));
  });
  router.post('/merch/demo/check', async (ctx) => {
    const body = ctx.body || {}, product = body.product; if (!DESIGN_PRODUCTS.includes(product)) return json(ctx.res, 400, { ok: false, error: 'Unknown product' });
    const design = cleanDesign(body.design || {}), size = design.size && product === 'sticker_kiss_cut' ? design.size : caps.offer(product, 'printful').sizes[0].key;
    const check = checkFiles(body, demo.DEMO_OWNER, product, size);
    if (!check.ok) return json(ctx.res, 422, { ok: false, issues: check.issues });
    const saved = await demoDesigns.saveDesign({ owner_kind: 'shop', owner_id: demo.DEMO_OWNER.id, product, front: design });
    json(ctx.res, 200, { ok: true, id: saved.id, message: `Print files pass ${caps.SUPPLIERS.printful.name}'s spec${check.needsQr ? ' and the QR code reads back correctly from the print pixels' : ''}. Demo mode: nothing was saved.` });
  });
  router.get('/merch/capabilities', (ctx) => page(ctx, 'Supplier capabilities', views.capabilitiesPage()));

  // ---- studio ----------------------------------------------------------------------------------------------------
  router.get('/merch', (ctx) => { const owners = requireStudio(ctx); if (!owners) return; page(ctx, 'Merch Studio', views.home({ owners })); });
  router.get('/merch/design/:product', async (ctx) => {
    const owners = requireStudio(ctx); if (!owners) return;
    const product = ctx.params.product; if (!DESIGN_PRODUCTS.includes(product)) return page(ctx, 'Not found', '<h1>Unknown product</h1>', { status: 404 });
    let design = null;
    if (ctx.query.design) { design = await store().getDesign(Number(ctx.query.design)); if (!design || !owners.some((o) => o.kind === design.owner_kind && o.id === design.owner_id)) return page(ctx, 'Not found', '<section class="section container"><h1>Design not found</h1></section>', { status: 404 }); }
    const owner = design ? owners.find((o) => o.kind === design.owner_kind && o.id === design.owner_id) : pickOwner(owners, ctx.query.owner);
    if (!owner) return page(ctx, 'Not found', '<h1>Unknown owner</h1>', { status: 404 });
    const p = owner.profile || {};
    const defaults = { business: owner.kind === 'shop' ? owner.name : (p.workplace_name || owner.name), name: owner.kind === 'pro' ? owner.name : '', phone: p.contact_phone || p.phone || '', email: p.contact_email || '', website: 'gobookr.com', address: owner.kind === 'shop' ? [p.street_address, p.city].filter(Boolean).join(', ') : [p.city, p.state].filter(Boolean).join(', '), qrCaption: 'Scan to book', layout: 'classic', font: 'display', frontBg: '#101828', backBg: '#FFFFFF', accent: '#6558F5', sides: 'double', paper: 'uncoated', showGuides: true, size: product === 'sticker_kiss_cut' ? '3x3' : undefined, stickerQr: product === 'sticker_kiss_cut', teeInk: '#FFFFFF' };
    const switcher = owners.length > 1 && !design ? `<form class="container mx-owner" method="GET"><label>Designing for <select name="owner" onchange="this.form.submit()">${owners.map((o) => `<option value="${o.kind}:${o.id}"${o === owner ? ' selected' : ''}>${o.kind === 'pro' ? 'Me — ' : ''}${require('../lib/util').escapeHtml(o.name)}</option>`).join('')}</select></label></form>` : '';
    page(ctx, caps.PRODUCTS[product].name, switcher + views.designerPage({ product, owner, design: design ? { ...defaults, ...design.front, size: design.size || defaults.size } : defaults, designId: design && design.id, csrf: ctx.session.csrf_token, saveUrl: '/merch/designs' }));
  });
  router.post('/merch/designs', async (ctx) => {
    if (!enabled() || !ctx.currentUser) return json(ctx.res, 401, { ok: false, error: 'Sign in to save designs.' });
    const owners = identity.ownersFor(ctx.currentUser).map((o) => ({ ...o, qrTarget: identity.qrTarget(o) }));
    const body = ctx.body || {}, product = body.product, owner = pickOwner(owners, body.owner);
    if (!owner || !DESIGN_PRODUCTS.includes(product)) return json(ctx.res, 403, { ok: false, error: 'You cannot save designs for that profile.' });
    if (body.id) { const existing = await store().getDesign(Number(body.id)); if (!existing || existing.owner_kind !== owner.kind || existing.owner_id !== owner.id) return json(ctx.res, 403, { ok: false, error: 'That design belongs to someone else.' }); }
    const design = cleanDesign(body.design || {}), size = product === 'sticker_kiss_cut' ? (design.size || '3x3') : caps.offer(product, 'printful').sizes[0].key;
    const check = checkFiles(body, owner, product, size);
    const files = [];
    if (check.ok) {
      try { for (const [side, buf] of Object.entries(check.bufs)) { const url = await uploadPrintFile(owner, side, buf); if (url) files.push({ placement: product === 'sticker_kiss_cut' ? 'default' : side, url }); } }
      catch (err) { console.error('Merch print file upload failed', err); return json(ctx.res, 502, { ok: false, error: 'Print files passed the check but could not be stored. Try again.' }); }
      if (!files.length) return json(ctx.res, 503, { ok: false, error: 'Print file storage is not configured on this environment.' });
    }
    const saved = await store().saveDesign({ id: body.id ? Number(body.id) : null, owner_kind: owner.kind, owner_id: owner.id, created_by_user_id: ctx.currentUser.id, product, supplier: 'printful', size, name: `${caps.PRODUCTS[product].name} — ${design.business || owner.name}`.slice(0, 120), front: design, back: design, files, preflight: Object.fromEntries(Object.entries(check.results).map(([k, r]) => [k, { ok: r.ok, issues: r.issues, qr: r.qr, file: r.file }])), print_files_ok: check.ok, qr_target: check.needsQr ? owner.qrTarget : null, qr_verified_at: check.ok && check.needsQr ? new Date().toISOString() : null });
    if (!check.ok) return json(ctx.res, 422, { ok: false, id: saved.id, issues: check.issues });
    json(ctx.res, 200, { ok: true, id: saved.id, message: 'Saved. Print files match Printful\'s spec' + (check.needsQr ? ' and the QR code reads back as your permanent GoBookr link.' : '.'), orderUrl: `/merch/order/new?owner=${owner.kind}:${owner.id}&design=${saved.id}` });
  });
  router.get('/merch/designs', async (ctx) => {
    const owners = requireStudio(ctx); if (!owners) return;
    const lists = await Promise.all(owners.map((o) => store().listDesigns({ ownerKind: o.kind, ownerId: o.id })));
    page(ctx, 'Saved designs', views.designsPage({ list: lists.flat(), owners }));
  });

  // ---- orders ----------------------------------------------------------------------------------------------------
  async function builder(ctx, owner, error, ship) {
    const designs = await store().listDesigns({ ownerKind: owner.kind, ownerId: owner.id });
    const p = owner.profile || {};
    page(ctx, 'New order', views.orderBuilder({ owner, designs, csrf: ctx.session.csrf_token, error, ship: ship || { name: owner.name, address1: p.street_address || '', address2: p.suite || '', city: p.city || '', state: p.state || '', zip: p.zip_code || '', email: ctx.currentUser.email } }));
  }
  router.get('/merch/order/new', async (ctx) => { const owners = requireStudio(ctx); if (!owners) return; const owner = pickOwner(owners, ctx.query.owner); if (!owner) return redirect(ctx.res, '/merch'); await builder(ctx, owner); });
  router.post('/merch/orders', async (ctx) => {
    const owners = requireStudio(ctx); if (!owners) return;
    const b = ctx.body || {}, owner = pickOwner(owners, b.owner); if (!owner) return redirect(ctx.res, '/merch');
    const designs = Object.fromEntries((await store().listDesigns({ ownerKind: owner.kind, ownerId: owner.id })).map((d) => [d.id, d]));
    const lines = [];
    const cardQty = Number(b.business_card_qty || 0);
    if (cardQty) { const u = caps.unitsForPieces('business_card', 'printful', cardQty); if (!u) return builder(ctx, owner, 'Business cards come in sets of 50 or 100.'); lines.push({ product: 'business_card', supplier: 'printful', size: '3.5x2', sides: (designs[b.business_card_design] || { front: {} }).front.sides || 'double', pack: u.pack, units: u.units, design_id: Number(b.business_card_design) }); }
    const stQty = Number(b.sticker_qty || 0);
    if (stQty) { const d = designs[b.sticker_kiss_cut_design]; lines.push({ product: 'sticker_kiss_cut', supplier: 'printful', size: (d && d.size) || '3x3', units: stQty, design_id: Number(b.sticker_kiss_cut_design) }); }
    for (const s of caps.offer('tshirt', 'printful').sizes) { const n = Number(b[`tee_${s.key}`] || 0); if (n) lines.push({ product: 'tshirt', supplier: 'printful', color: 'black', size: s.key, units: n, design_id: Number(b.tshirt_design) }); }
    const ship = Object.fromEntries(['name', 'address1', 'address2', 'city', 'state', 'zip', 'phone', 'email'].map((k) => [k, b[`ship_${k}`]]));
    try {
      const order = await orders.createOrder(store(), { buyerUserId: ctx.currentUser.id, owner, businessName: owner.name, shipTo: ship, lines, designs });
      await orders.quote(store(), order.id, suppliers());
      redirect(ctx.res, `/merch/orders/${order.order_number}`);
    } catch (err) {
      if (!err.code) console.error('Merch order failed', err);
      await builder(ctx, owner, err.code ? err.message : 'We could not get supplier pricing. Nothing was charged. Try again in a minute.', ship);
    }
  });
  async function loadOrder(ctx, owners) {
    const order = await store().getOrderByNumber(String(ctx.params.number || ''));
    if (!order || !owners.some((o) => o.kind === order.owner_kind && o.id === order.owner_id)) { page(ctx, 'Not found', '<section class="section container"><h1>Order not found</h1></section>', { status: 404 }); return null; }
    return order;
  }
  router.get('/merch/orders', async (ctx) => { const owners = requireStudio(ctx); if (!owners) return; const lists = await Promise.all(owners.map((o) => store().listOrders({ ownerKind: o.kind, ownerId: o.id }))); page(ctx, 'Merch orders', views.ordersList({ list: lists.flat() })); });
  router.get('/merch/orders/:number', async (ctx) => {
    const owners = requireStudio(ctx); if (!owners) return; const order = await loadOrder(ctx, owners); if (!order) return;
    const [items, supplierOrders, events] = await Promise.all([store().items(order.id), store().supplierOrders(order.id), store().events(order.id)]);
    const designIds = [...new Set(items.map((i) => i.design_id).filter(Boolean))], designs = {};
    for (const d of await Promise.all(designIds.map((id) => store().getDesign(id)))) if (d) designs[d.id] = d;
    page(ctx, `Order ${order.order_number}`, views.orderPage({ order, items, supplierOrders, events, designs, csrf: ctx.session.csrf_token }));
  });
  router.post('/merch/orders/:number/checkout', async (ctx) => {
    const owners = requireStudio(ctx); if (!owners) return; const order = await loadOrder(ctx, owners); if (!order) return;
    const base = String(process.env.APP_URL || 'https://gobookr.com').replace(/\/$/, '');
    const { stripeRequest } = require('../lib/stripe');
    const stripe = orders.stripeMode() === 'simulated' ? null : { createSession: (p, k) => stripeRequest('/checkout/sessions', p, 'POST', k), refund: (p, k) => stripeRequest('/refunds', p, 'POST', k) };
    try {
      const session = await orders.startCheckout(store(), order.id, { stripe, successUrl: `${base}/merch/orders/${order.order_number}?paid=1`, cancelUrl: `${base}/merch/orders/${order.order_number}`, customerEmail: (order.ship_to || {}).email || ctx.currentUser.email });
      if (session.simulated) { await orders.markPaid(store(), { sessionId: session.id, amountTotal: order.total_cents, eventId: `sim-${order.order_number}`, simulated: true }, supplierLib.registry({ printful: supplierLib.simulated('printful') })); return redirect(ctx.res, `/merch/orders/${order.order_number}?success=${encodeURIComponent('Simulated payment recorded. No card was charged and no real supplier order was placed.')}`); }
      redirect(ctx.res, session.url);
    } catch (err) {
      if (!err.code) console.error('Merch checkout failed', err);
      redirect(ctx.res, `/merch/orders/${order.order_number}?error=${encodeURIComponent(err.code ? err.message : 'Secure checkout could not start. You have not been charged.')}`);
    }
  });
  router.get('/merch/reorder/:number', (ctx) => redirect(ctx.res, `/merch/orders/${encodeURIComponent(ctx.params.number)}`));

  // ---- webhooks --------------------------------------------------------------------------------------------------
  router.post('/merch/stripe/webhook', async (ctx) => {
    const secret = String(process.env.STRIPE_MERCH_WEBHOOK_SECRET || '').trim();
    if (!secret) return json(ctx.res, 503, { error: 'Webhook not configured' });
    if (!verifyStripe(ctx.rawBody, ctx.req.headers['stripe-signature'], secret)) return json(ctx.res, 400, { error: 'Invalid signature' });
    const event = ctx.body || {}, obj = (event.data && event.data.object) || {};
    try {
      if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid' && obj.metadata && obj.metadata.merch_order_number) {
        await orders.markPaid(store(), { sessionId: obj.id, paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : null, amountTotal: obj.amount_total, currency: obj.currency, eventId: event.id }, suppliers());
      }
      json(ctx.res, 200, { received: true });
    } catch (err) { console.error('Merch Stripe webhook failed', err); json(ctx.res, 500, { error: 'processing failed' }); }
  });
  router.post('/merch/printful/webhook/:token', async (ctx) => {
    const expected = String(process.env.PRINTFUL_WEBHOOK_TOKEN || '');
    const got = String(ctx.params.token || '');
    if (!expected || got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return json(ctx.res, 404, { error: 'not found' });
    const ev = ctx.body || {}, data = ev.data || {}, order = data.order || {};
    const map = { package_shipped: 'shipped', order_failed: 'failed', order_canceled: 'canceled', order_put_hold: 'in_production', order_updated: null };
    const type = map[ev.type]; if (!type) return json(ctx.res, 200, { ignored: true });
    try {
      // Never trust the webhook body for state: re-read the order from Printful when live.
      let shipment = data.shipment ? supplierLib.shipmentFrom(data.shipment) : null;
      if (supplierLib.printfulLive() && order.id) { const s = await suppliers().printful.status(order.id); if (type === 'shipped' && shipment) shipment = s.shipments.find((x) => x.id === shipment.id) || null; if (type === 'shipped' && !shipment) return json(ctx.res, 409, { error: 'shipment not confirmed' }); }
      await orders.applySupplierUpdate(store(), { supplier: 'printful', supplierOrderId: String(order.id), type, shipment, reason: data.reason }, `${ev.type}:${order.id}:${(data.shipment && data.shipment.id) || ev.created || ''}`);
      json(ctx.res, 200, { received: true });
    } catch (err) { console.error('Printful webhook failed', err); json(ctx.res, 500, { error: 'processing failed' }); }
  });
};

function verifyStripe(rawBody, header, secret, tolerance = 300) {
  if (!rawBody || !header) return false;
  const parts = String(header).split(','), t = Number((parts.find((p) => p.startsWith('t=')) || '').slice(2)), sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!Number.isFinite(t) || !sigs.length || Math.abs(Date.now() / 1000 - t) > tolerance) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`).digest();
  return sigs.some((s) => /^[a-f0-9]{64}$/i.test(s) && crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
}
module.exports.verifyStripe = verifyStripe;
