'use strict';
// The public, fully simulated demo order: 50 black tees (5 S, 10 M, 15 L, 15 XL, 5 2XL), 500 business cards and
// 100 GoBookr promotional stickers, shipped to the business address. Runs the real order pipeline against an
// in-memory store and simulated suppliers — nothing touches the database, a supplier, or Stripe.
const png = require('./png');
const qr = require('./qr');
const caps = require('./capabilities');
const artwork = require('./artwork');
const orders = require('./orders');
const branding = require('./branding');
const suppliers = require('./suppliers');
const { memoryStore } = require('./store');

const DEMO_TARGET = 'https://gobookr.com/merch/demo'; // demo codes never point at a real business page
const DEMO_BUSINESS = { name: 'Northline Barber Co. (Demo)', address1: '1450 Larimer St', city: 'Denver', state: 'CO', zip: '80202', email: 'owner@example.com' };
const DEMO_OWNER = { kind: 'shop', id: 990001, name: DEMO_BUSINESS.name, qrTarget: DEMO_TARGET };

// Server-side print file in the same layout the designer records: background + QR with quiet zone.
function renderPrintFile({ product = 'business_card', supplier = 'printful', size = '3.5x2', qrText = null, modulePx = 9, bg = [255, 255, 255], width, height, overlap = false }) {
  const geo = caps.geometry(product, supplier, size);
  const w = width || geo.canvasPx.w, h = height || geo.canvasPx.h, rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = bg[0]; rgba[i * 4 + 1] = bg[1]; rgba[i * 4 + 2] = bg[2]; rgba[i * 4 + 3] = 255; }
  let placement = null;
  if (qrText) {
    const code = qr.encode(qrText), quiet = 4, total = (code.size + 2 * quiet) * modulePx;
    placement = { x: w - geo.safePx - total, y: h - geo.safePx - total, modulePx, quiet };
    const fill = (x0, y0, s, v) => { for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) { const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; } };
    for (let r = 0; r < code.size + 8; r++) for (let c = 0; c < code.size + 8; c++) {
      const inCode = r >= quiet && c >= quiet && r < quiet + code.size && c < quiet + code.size;
      fill(placement.x + c * modulePx, placement.y + r * modulePx, modulePx, inCode && code.modules[r - quiet][c - quiet] ? 16 : 255);
    }
    if (overlap) fill(placement.x + (quiet + 10) * modulePx, placement.y + (quiet + 10) * modulePx, modulePx * 5, 16);
  }
  return { file: png.encode({ width: w, height: h, rgba, dpi: geo.dpi }), placement, geo };
}

const CARD_DESIGN = { business: 'Northline Barber Co.', tagline: 'Classic cuts, sharp fades', name: 'Jordan Reyes', title: 'Owner and master barber', phone: '(303) 555-0142', email: 'hello@example.com', website: 'gobookr.com', address: '1450 Larimer St, Denver', social: '@northline.demo', qrCaption: 'Scan to book', layout: 'classic', font: 'display', frontBg: '#101828', backBg: '#FFFFFF', accent: '#6558F5', sides: 'double', paper: 'uncoated', showGuides: false };
const STICKER_DESIGN = { business: 'GoBookr', tagline: 'Book your next visit', frontBg: '#6558F5', font: 'display', stickerQr: true, size: '3x3' };
const TEE_DESIGN = { business: 'NORTHLINE', tagline: 'Barber Co.', teeInk: '#FFFFFF', font: 'display' };

async function build() {
  const store = memoryStore();
  const sup = suppliers.registry({ printful: suppliers.simulated('printful') });
  // Real preflight of the card back and sticker print files, QR read back from pixels.
  const back = renderPrintFile({ qrText: DEMO_TARGET });
  const cardCheck = artwork.preflight({ product: 'business_card', supplier: 'printful', size: '3.5x2', side: 'back', file: back.file, qrPlacement: back.placement, qrTarget: DEMO_TARGET });
  const stick = renderPrintFile({ product: 'sticker_kiss_cut', size: '3x3', qrText: DEMO_TARGET, modulePx: 8 });
  const stickCheck = artwork.preflight({ product: 'sticker_kiss_cut', supplier: 'printful', size: '3x3', side: 'front', file: stick.file, qrPlacement: stick.placement, qrTarget: DEMO_TARGET });
  const now = new Date().toISOString();
  const mk = (product, size, front, check, extra = {}) => store.saveDesign({ owner_kind: 'shop', owner_id: DEMO_OWNER.id, product, supplier: 'printful', size, name: `${caps.PRODUCTS[product].name} — demo`, front, back: front, print_files_ok: check ? check.ok : true, qr_target: check ? DEMO_TARGET : null, qr_verified_at: check && check.ok ? now : null, files: [], preflight: check || {}, ...extra });
  const card = await mk('business_card', '3.5x2', CARD_DESIGN, cardCheck);
  const sticker = await mk('sticker_kiss_cut', '3x3', STICKER_DESIGN, stickCheck);
  const tee = await mk('tshirt', 'S', TEE_DESIGN, null);
  const designs = { [card.id]: card, [sticker.id]: sticker, [tee.id]: tee };
  const cards = caps.unitsForPieces('business_card', 'printful', 500);
  const lines = [
    ...[['S', 5], ['M', 10], ['L', 15], ['XL', 15], ['2XL', 5]].map(([size, units]) => ({ product: 'tshirt', supplier: 'printful', color: 'black', size, units, design_id: tee.id })),
    { product: 'business_card', supplier: 'printful', size: '3.5x2', sides: 'double', pack: cards.pack, units: cards.units, design_id: card.id },
    { product: 'sticker_kiss_cut', supplier: 'printful', size: '3x3', units: 100, design_id: sticker.id },
  ];
  let order = await orders.createOrder(store, { owner: DEMO_OWNER, businessName: 'Northline Barber Co. (Demo)', shipTo: DEMO_BUSINESS, lines, designs });
  order = await orders.quote(store, order.id, sup);
  const session = await orders.startCheckout(store, order.id, { stripe: null });
  await orders.markPaid(store, { sessionId: session.id, amountTotal: order.total_cents, eventId: 'evt_demo', simulated: true }, sup);
  const [row] = await store.supplierOrders(order.id);
  // Printful produces apparel and stationery in different departments; the demo shows the split as two packages.
  await orders.applySupplierUpdate(store, { supplier: 'printful', supplierOrderId: row.supplier_order_id, type: 'shipped', shipment: { id: 'demo-1', carrier: 'USPS', service: 'Ground Advantage', trackingNumber: 'SIMULATED-0001', trackingUrl: '', items: [] } }, 'demo-ship-1');
  await orders.applySupplierUpdate(store, { supplier: 'printful', supplierOrderId: row.supplier_order_id, type: 'shipped', shipment: { id: 'demo-2', carrier: 'UPS', service: 'Ground', trackingNumber: 'SIMULATED-0002', trackingUrl: '', items: [] } }, 'demo-ship-2');
  await orders.applySupplierUpdate(store, { supplier: 'printful', supplierOrderId: row.supplier_order_id, type: 'delivered' }, 'demo-delivered');
  order = await store.getOrder(order.id);
  return { store, order, items: await store.items(order.id), supplierOrders: await store.supplierOrders(order.id), events: await store.events(order.id), designs, checks: { card: cardCheck, sticker: stickCheck }, insertSvg: branding.insertCardSvg({ businessName: 'Northline Barber Co.', orderNumber: order.order_number }), promise: branding.brandingPromise(['printful']) };
}

module.exports = { build, renderPrintFile, DEMO_TARGET, DEMO_OWNER, DEMO_BUSINESS, CARD_DESIGN, STICKER_DESIGN, TEE_DESIGN };
