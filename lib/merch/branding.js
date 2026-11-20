'use strict';
// GoBookr white-label branding: the standard insert card and the packing slip. Wording never claims GoBookr
// manufactured anything ("Made for your business. Powered by GoBookr.").
const caps = require('./capabilities');
const qr = require('./qr');
const { escapeHtml } = require('../util');

const SUPPORT = { email: 'support@gobookr.com', site: 'gobookr.com' };
const qrBase = () => String(process.env.MERCH_QR_BASE_URL || 'https://gobookr.com').replace(/\/$/, '');
const reorderUrl = (orderNumber) => `${qrBase()}/merch/reorder/${encodeURIComponent(orderNumber)}`;

function insertCopy(businessName) {
  const name = String(businessName || '').trim();
  return {
    headline: 'Made for your business. Powered by GoBookr.',
    greeting: name ? `Thank you, ${name}, for ordering through GoBookr Merch Studio.` : 'Thank you for ordering through GoBookr Merch Studio.',
    prompt: 'Need more uniforms, business cards, or branded merchandise?',
    action: 'Scan the QR code to reorder anytime.',
    signoff: 'gobookr.',
  };
}

function insertCardSvg({ businessName, orderNumber }) {
  const c = insertCopy(businessName), url = reorderUrl(orderNumber), code = qr.encode(url);
  const mod = 4, qsz = (code.size + 8) * mod;
  let path = ''; code.modules.forEach((row, r) => row.forEach((on, col) => { if (on) path += `M${(col + 4) * mod} ${(r + 4) * mod}h${mod}v${mod}h-${mod}z`; }));
  const wrap = (t, n) => { const out = []; let cur = ''; for (const w of t.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };
  const body = [...wrap(c.greeting, 40), '', ...wrap(c.prompt, 40), ...wrap(c.action, 40)].slice(0, 7);
  const tspans = body.map((l, i) => `<text x="44" y="${128 + i * 26}" font-size="17" fill="#E9EAF2">${escapeHtml(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 400" role="img" aria-label="GoBookr insert card"><rect width="700" height="400" rx="18" fill="#101828"/>
<g font-family="Inter Display, Inter, sans-serif" fill="#fff"><text x="44" y="78" font-size="26" font-weight="700">${escapeHtml(c.headline)}</text>${tspans}
<text x="44" y="352" font-size="30" font-weight="700">gobookr<tspan fill="#6558F5">.</tspan></text></g>
<g transform="translate(${700 - 40 - qsz} ${214 - qsz / 2})"><rect width="${qsz}" height="${qsz}" rx="10" fill="#fff"/><path d="${path}" fill="#101828"/></g></svg>`;
}

// Printful's packing slip accepts a custom message, a black-and-white logo, support email/phone (capability matrix).
// The packing_slip body below is what the Printful adapter sends; GoBookr's own slip (HTML) is the receipt copy.
function supplierPackingSlip(order, supplierKey) {
  const branding = (caps.SUPPLIERS[supplierKey] || {}).branding || {};
  if (!branding.packingSlipMessage || !branding.packingSlipMessage.value) return null;
  return {
    email: SUPPORT.email,
    message: `${insertCopy(order.business_name).headline} Order ${order.order_number}. Reorder: ${reorderUrl(order.order_number)}`.slice(0, 200),
    logo_url: process.env.MERCH_PACKING_SLIP_LOGO_URL || undefined,
    store_name: 'GoBookr Merch Studio',
    custom_order_id: order.order_number,
  };
}

function packingSlipHtml(order, items, supplierOrders = []) {
  const rows = items.map((i) => `<tr><td>${escapeHtml(i.label)}</td><td class="num">${i.pieces.toLocaleString('en-US')}</td><td>${escapeHtml((caps.SUPPLIERS[i.supplier] || {}).name || i.supplier)}</td></tr>`).join('');
  const split = supplierOrders.length > 1 || supplierOrders.some((s) => (s.shipments || []).length > 1);
  return `<article class="mx-slip"><header><img src="/gobookr-mark-2026.svg" alt="" width="36" height="36"><div><strong>GoBookr Merch Studio</strong><span>Packing slip</span></div><div class="mx-slip-no">Order ${escapeHtml(order.order_number)}</div></header>
<p class="mx-slip-for">Prepared for <strong>${escapeHtml(order.business_name || 'your business')}</strong></p>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th>Produced by</th></tr></thead><tbody>${rows}</tbody></table>
${split ? '<p class="mx-note">Your order is produced by more than one facility and may arrive in separate packages.</p>' : ''}
<footer><p>Made for your business. Powered by GoBookr. Items are produced and shipped by our fulfillment partners.</p><p>Questions? ${SUPPORT.email} · Reorder: ${escapeHtml(reorderUrl(order.order_number))}</p></footer></article>`;
}

// What branded fulfillment we can honestly promise for a set of suppliers.
function brandingPromise(supplierKeys) {
  return [...new Set(supplierKeys)].map((k) => {
    const b = (caps.SUPPLIERS[k] || {}).branding || {}, yes = (f) => b[f] && b[f].value === true;
    return { supplier: k, name: caps.SUPPLIERS[k].name, items: [
      { label: 'Ships without the supplier\'s branding', ok: yes('whiteLabel') },
      { label: 'GoBookr packing slip with order number and reorder link', ok: yes('packingSlipMessage'), note: yes('packingSlipException') ? 'Not printed when the order is routed to a partner facility.' : '' },
      { label: 'GoBookr insert card in the package', ok: false, note: yes('packIns') ? 'Available once insert stock is approved and stored at the supplier (phase 2).' : 'Not confirmed for this supplier.' },
      { label: 'Custom mailers or boxes', ok: false, note: yes('customMailers') ? 'Branded mailers only, once stocked (phase 3). No custom boxes.' : 'Not confirmed for this supplier.' },
    ] };
  });
}

module.exports = { insertCopy, insertCardSvg, supplierPackingSlip, packingSlipHtml, brandingPromise, reorderUrl, qrBase, SUPPORT };
