'use strict';
// Supplier capability matrix + product catalog for GoBookr Merch Studio.
//
// Every option a customer can pick comes from here, per supplier. A product or option that a supplier does not
// offer is simply absent for that supplier, so the UI cannot display it. Each fact carries `source` (public page it
// was checked against, 2026-11-20) and `verified`:
//   'public'  – stated on the supplier's own public product/help page
//   'runtime' – must be confirmed from the supplier's API at quote time (variant IDs, print-file pixel sizes, prices)
//   'unknown' – not confirmed; the capability is treated as NOT available
// Prices are never stored here. They come from the supplier API at quote time (or are labelled "simulated").

const CHECKED_AT = '2026-11-20';

const SUPPLIERS = {
  printful: {
    key: 'printful',
    name: 'Printful',
    integration: 'live', // real account; API calls only when PRINTFUL_API_KEY is set and MERCH_LIVE_FULFILLMENT=1
    api: 'REST v1 (orders, estimate-costs, shipping rates, webhooks); draft orders are not charged until confirmed',
    branding: {
      whiteLabel: { value: true, verified: 'public', source: 'https://help.printful.com/hc/en-us/articles/360014006620' },
      packingSlipLogo: { value: true, note: 'Black-and-white logo, 3″ × 2″', verified: 'public', source: 'https://www.printful.com/blog/printful-branding-tools' },
      packingSlipMessage: { value: true, note: 'Custom message plus support email and phone', verified: 'public', source: 'https://help.printful.com/hc/en-us/articles/360014065499' },
      packingSlipException: { value: true, note: 'Orders routed to backup or partner facilities ship without the custom packing slip or logo', verified: 'public', source: 'https://help.printful.com/hc/en-us/articles/360014065499' },
      packIns: { value: true, note: 'Pre-made inserts must be approved, mailed to a Printful facility and stocked there; $0.50 picking fee per pack-in and $25/month minimum storage. Orders fulfilled in a facility without stock ship without the insert.', verified: 'public', source: 'https://help.printful.com/hc/en-us/articles/360014007840' },
      customMailers: { value: true, note: 'Poly, bubble and paper mailers only; stored inventory; not available for orders with outsourced products or at partner facilities', verified: 'public', source: 'https://www.printful.com/print-on-demand-with-custom-packaging' },
      customBoxes: { value: false, note: 'Not offered – only mailers', verified: 'public', source: 'https://www.printful.com/print-on-demand-with-custom-packaging' },
      shippingLabelLogo: { value: true, verified: 'public', source: 'https://help.printful.com/hc/en-us/articles/360014006620' },
      perOrderInsertPrinting: { value: false, note: 'Printful cannot print a different insert per order; inserts are stocked items', verified: 'public', source: 'https://www.printful.com/branded-packaging-inserts' },
    },
  },
  gelato: {
    key: 'gelato',
    name: 'Gelato',
    integration: 'simulated', // no GoBookr account connected
    api: 'Order Flow REST API with webhooks (not connected)',
    branding: {
      whiteLabel: { value: null, verified: 'unknown' },
      packingSlipLogo: { value: null, verified: 'unknown' },
      packingSlipMessage: { value: null, verified: 'unknown' },
      packIns: { value: null, verified: 'unknown' },
      customMailers: { value: null, verified: 'unknown' },
      customBoxes: { value: null, verified: 'unknown' },
    },
  },
  printify: {
    key: 'printify',
    name: 'Printify',
    integration: 'simulated',
    api: 'REST v1 orders, shipping and webhooks (not connected)',
    branding: {
      whiteLabel: { value: null, verified: 'unknown' },
      packingSlipLogo: { value: null, verified: 'unknown' },
      packingSlipMessage: { value: null, verified: 'unknown' },
      packIns: { value: null, verified: 'unknown' },
      customMailers: { value: null, verified: 'unknown' },
      customBoxes: { value: null, verified: 'unknown' },
    },
  },
};

// Physical print specs. Pixel sizes are derived (inches × dpi). `verified: 'runtime'` means the Printful adapter
// re-reads the exact print-file size from the supplier API before artwork is accepted for a live order.
const inch = (w, h) => ({ w, h });
const SPECS = {
  'printful:business_card': {
    trim: inch(3.5, 2), bleed: 0.125, safe: 0.125, dpi: 300, format: 'PNG', colorProfile: 'sRGB',
    sides: ['front', 'back'], verified: 'runtime',
    note: 'Size, paper and set quantities from Printful\'s product page; exact print-file pixels are confirmed from the Printful API before a live order.',
    source: 'https://www.printful.com/custom/product/724',
  },
  'printful:sticker_kiss_cut': {
    trim: null, bleed: 0, safe: 0.0625, dpi: 300, format: 'PNG', colorProfile: 'sRGB', sides: ['front'], verified: 'runtime',
    note: 'White vinyl only – transparency prints as white; Printful adds a white border around the cut line.',
    source: 'https://support.printful.com/hc/en-us/articles/41396541153553',
  },
  'printful:tshirt': {
    trim: inch(12, 16), bleed: 0, safe: 0, dpi: 150, format: 'PNG', colorProfile: 'sRGB', sides: ['front'], verified: 'runtime',
    note: 'Printful recommends 150 DPI at print size for apparel; print area confirmed from the API.',
    source: 'https://www.printful.com/blog/how-to-create-perfect-printfile',
  },
};

// Products. `offers[supplier]` lists ONLY options the supplier is known to support.
const PRODUCTS = {
  business_card: {
    key: 'business_card', name: 'Business cards', group: 'print', designer: 'card', status: 'available',
    blurb: 'Front and back, with a permanent QR code to your GoBookr page.',
    offers: {
      printful: {
        supplierProduct: 'Set of Business Cards', supplierProductId: 724,
        sizes: [{ key: '3.5x2', label: '3.5″ × 2″', w: 3.5, h: 2 }],
        sides: ['single', 'double'],
        papers: [{ key: 'uncoated', label: 'Uncoated cover stock', note: 'Mohawk uncoated (US), Munken Lynx 300 g/m² (EU)' }],
        finishes: [{ key: 'uncoated', label: 'Uncoated matte feel' }],
        packs: [50, 100], // cards per set
        orderUnit: 'set',
        verified: 'public', source: 'https://www.printful.com/custom/product/724',
      },
    },
  },
  appointment_card: {
    key: 'appointment_card', name: 'Appointment cards', group: 'print', designer: 'card', status: 'available',
    blurb: 'Your details on the front, a fill-in "next appointment" on the back.',
    printsAs: 'business_card',
    offers: {
      printful: {
        supplierProduct: 'Set of Business Cards (appointment layout on the back)', supplierProductId: 724,
        sizes: [{ key: '3.5x2', label: '3.5″ × 2″', w: 3.5, h: 2 }],
        sides: ['double'],
        papers: [{ key: 'uncoated', label: 'Uncoated cover stock', note: 'Writable uncoated stock' }],
        finishes: [{ key: 'uncoated', label: 'Uncoated matte feel' }],
        packs: [50, 100], orderUnit: 'set', verified: 'public', source: 'https://www.printful.com/custom/product/724',
      },
    },
  },
  sticker_kiss_cut: {
    key: 'sticker_kiss_cut', name: 'Stickers', group: 'print', designer: 'sticker', status: 'available',
    blurb: 'Kiss-cut vinyl stickers for mirrors, stations and take-home bags.',
    offers: {
      printful: {
        supplierProduct: 'Kiss-Cut Stickers', supplierProductId: 358,
        sizes: [
          { key: '3x3', label: '3″ × 3″', w: 3, h: 3 }, { key: '4x4', label: '4″ × 4″', w: 4, h: 4 },
          { key: '5.5x5.5', label: '5.5″ × 5.5″', w: 5.5, h: 5.5 }, { key: '15x3.75', label: '15″ × 3.75″', w: 15, h: 3.75 },
        ],
        sides: ['single'],
        papers: [{ key: 'white_vinyl', label: 'White vinyl', note: 'Water, scratch and UV resistant' }],
        finishes: [{ key: 'glossy', label: 'Glossy' }],
        packs: [1], orderUnit: 'sticker', verified: 'public', source: 'https://www.printful.com/custom/collections/fast-delivery/kiss-cut-stickers',
      },
    },
  },
  tshirt: {
    key: 'tshirt', name: 'Team T-shirts', group: 'apparel', designer: 'apparel', status: 'available',
    blurb: 'Staff tees with your logo on the front.',
    offers: {
      printful: {
        supplierProduct: 'Unisex Staple T-Shirt (Bella + Canvas 3001)', supplierProductId: 71,
        colors: [{ key: 'black', label: 'Black', hex: '#111111' }],
        sizes: ['S', 'M', 'L', 'XL', '2XL'].map((s) => ({ key: s, label: s })),
        placements: ['front'], packs: [1], orderUnit: 'shirt', verified: 'runtime',
        note: 'Colors and sizes re-checked against live variant stock before quoting.',
        source: 'https://www.printful.com/custom/mens/t-shirts',
      },
    },
  },
  // Later phases: listed so the roadmap is visible, never orderable until a supplier offer is verified.
  gift_card: { key: 'gift_card', name: 'Gift card designs', group: 'print', status: 'later', offers: {} },
  flyer: { key: 'flyer', name: 'Flyers', group: 'print', status: 'later', offers: {} },
  postcard: { key: 'postcard', name: 'Postcards', group: 'print', status: 'later', offers: {} },
  product_label: { key: 'product_label', name: 'Product labels', group: 'print', status: 'later', offers: {} },
  thank_you_card: { key: 'thank_you_card', name: 'Thank-you cards', group: 'print', status: 'later', offers: {} },
  loyalty_card: { key: 'loyalty_card', name: 'Loyalty cards', group: 'print', status: 'later', offers: {} },
  packaging_insert: { key: 'packaging_insert', name: 'Packaging inserts', group: 'print', status: 'later', offers: {} },
};

function offer(productKey, supplierKey) {
  const p = PRODUCTS[productKey];
  return p && p.status === 'available' && p.offers[supplierKey] ? p.offers[supplierKey] : null;
}
function catalogFor(supplierKey) {
  return Object.values(PRODUCTS).filter((p) => p.status === 'available' && p.offers[supplierKey])
    .map((p) => ({ ...p, offer: p.offers[supplierKey] }));
}
function laterProducts() { return Object.values(PRODUCTS).filter((p) => p.status === 'later'); }
function specFor(productKey, supplierKey) {
  const p = PRODUCTS[productKey]; if (!p) return null;
  return SPECS[`${supplierKey}:${p.printsAs || productKey}`] || null;
}
// Pixel geometry for a side of a product, including bleed.
function geometry(productKey, supplierKey, sizeKey) {
  const spec = specFor(productKey, supplierKey), o = offer(productKey, supplierKey);
  if (!spec || !o) return null;
  const size = (o.sizes || []).find((s) => s.key === sizeKey) || (o.sizes || [])[0];
  const trim = spec.trim && productKey !== 'sticker_kiss_cut' ? spec.trim : { w: size.w, h: size.h };
  const px = (inches) => Math.round(inches * spec.dpi);
  return {
    dpi: spec.dpi, trimIn: trim, bleedIn: spec.bleed, safeIn: spec.safe,
    trimPx: { w: px(trim.w), h: px(trim.h) },
    canvasPx: { w: px(trim.w + 2 * spec.bleed), h: px(trim.h + 2 * spec.bleed) },
    bleedPx: px(spec.bleed), safePx: px(spec.bleed + spec.safe), format: spec.format, sides: spec.sides,
  };
}
// Validate a requested line against the supplier offer. Returns { ok, error, units, pieces }.
function validateLine(line) {
  const o = offer(line.product, line.supplier);
  if (!o) return { ok: false, error: `${(PRODUCTS[line.product] || {}).name || line.product} is not available from ${(SUPPLIERS[line.supplier] || {}).name || line.supplier}.` };
  if (line.size && !(o.sizes || []).some((s) => s.key === line.size)) return { ok: false, error: 'That size is not offered by this supplier.' };
  if (line.color && !(o.colors || []).some((c) => c.key === line.color)) return { ok: false, error: 'That color is not offered by this supplier.' };
  if (line.finish && o.finishes && !o.finishes.some((f) => f.key === line.finish)) return { ok: false, error: 'That finish is not offered by this supplier.' };
  if (line.sides && o.sides && !o.sides.includes(line.sides)) return { ok: false, error: 'That print option is not offered by this supplier.' };
  const pack = Number(line.pack || o.packs[0]);
  if (!o.packs.includes(pack)) return { ok: false, error: 'That pack size is not offered by this supplier.' };
  const units = Number(line.units);
  if (!Number.isInteger(units) || units < 1 || units > 1000) return { ok: false, error: 'Quantity must be a whole number between 1 and 1,000.' };
  return { ok: true, pack, units, pieces: pack * units };
}
// Turn a requested piece count into supplier units (e.g. 500 cards → 5 sets of 100). Only exact multiples.
function unitsForPieces(productKey, supplierKey, pieces) {
  const o = offer(productKey, supplierKey); if (!o) return null;
  for (const pack of [...o.packs].sort((a, b) => b - a)) if (pieces % pack === 0) return { pack, units: pieces / pack };
  return null;
}

module.exports = { CHECKED_AT, SUPPLIERS, SPECS, PRODUCTS, offer, catalogFor, laterProducts, specFor, geometry, validateLine, unitsForPieces };
