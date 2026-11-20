'use strict';
const caps = require('./capabilities');
const orders = require('./orders');
const branding = require('./branding');
const qr = require('./qr');
const { escapeHtml: e } = require('../util');

const css = '<link rel="stylesheet" href="/merch.css?v=1">';
const js = '<script src="/merch-card.js?v=1" defer></script>';
const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jsonAttr = (v) => e(JSON.stringify(v));
const simBadge = (on, text = 'Simulated') => (on ? `<span class="mx-sim" title="No real supplier order or payment">${e(text)}</span>` : '');

function specForClient(product, supplier, size) {
  return { product, supplier, size, geometry: caps.geometry(product, supplier, size) };
}
function specChips(product, supplier, size) {
  const g = caps.geometry(product, supplier, size), o = caps.offer(product, supplier), sp = caps.specFor(product, supplier);
  if (!g) return '';
  const chips = [`${g.trimIn.w}″ × ${g.trimIn.h}″`, `${g.canvasPx.w} × ${g.canvasPx.h} px`, `${g.dpi} DPI`, g.bleedIn ? `${g.bleedIn}″ bleed` : 'No bleed', `${g.safeIn}″ safe margin`, sp.format, sp.colorProfile];
  if (o.papers) chips.push(o.papers.map((p) => p.label).join(' or '));
  return `<ul class="mx-chips" aria-label="Print specification">${chips.map((c) => `<li>${e(c)}</li>`).join('')}</ul>`;
}
function nav(active, demo) {
  const base = demo ? '/merch/demo' : '/merch';
  const items = demo ? [['/merch/demo', 'Demo order'], ['/merch/demo/design/business_card', 'Try the designer'], ['/merch/capabilities', 'Supplier capabilities']]
    : [['/merch', 'Studio'], ['/merch/designs', 'Saved designs'], ['/merch/orders', 'Orders'], ['/merch/capabilities', 'Supplier capabilities']];
  void base;
  return `<nav class="mx-tabs" aria-label="Merch Studio">${items.map(([h, l]) => `<a href="${h}"${h === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
}
function head(title, lead, active, demo = false) {
  return `<header class="mx-head"><div><p class="mx-kicker">GoBookr Merch Studio</p><h1>${e(title)}</h1>${lead ? `<p class="mx-lead">${lead}</p>` : ''}</div></header>${nav(active, demo)}`;
}
function shell(inner) { return `${css}<section class="section container mx">${inner}</section>${js}`; }

// ---- studio home ---------------------------------------------------------------------------------------------------
function home({ owners, supplier = 'printful' }) {
  const products = caps.catalogFor(supplier);
  const ownerPick = owners.length > 1 ? `<p class="mx-muted">Designing for: ${owners.map((o) => `<strong>${e(o.name)}</strong>`).join(' or ')}. You choose on the next screen.</p>` : '';
  const cards = products.map((p) => `<article class="mx-product"><div class="mx-product-art mx-art-${p.key}" aria-hidden="true"></div><div><h2>${e(p.name)}</h2><p>${e(p.blurb)}</p>
    <p class="mx-muted">${e(p.offer.supplierProduct)} from ${e(caps.SUPPLIERS[supplier].name)}${p.offer.packs.length > 1 || p.offer.packs[0] > 1 ? ` — sold in sets of ${p.offer.packs.join(' or ')}` : ''}.</p>
    <a class="btn" href="/merch/design/${p.key}">Design ${e(p.name.toLowerCase())}</a></div></article>`).join('');
  const later = caps.laterProducts().map((p) => `<li>${e(p.name)}</li>`).join('');
  return shell(`${head('Branded print and team merch', 'Design once, check every print file against the supplier\'s spec, and reorder whenever you run low.', '/merch')}
  ${ownerPick}<div class="mx-products">${cards}</div>
  <aside class="mx-later"><h2>Coming later</h2><p class="mx-muted">These appear here only once a fulfillment partner\'s options are verified.</p><ul>${later}</ul></aside>`);
}

// ---- designer ------------------------------------------------------------------------------------------------------
const SWATCHES = ['#101828', '#FFFFFF', '#F8FAFC', '#6558F5', '#18B6A4', '#1F3A2E', '#7A2E2E', '#E9E1D3'];
function swatchRow(target, label, value) {
  return `<div class="mx-field"><span class="mx-label">${label}</span><div class="mx-swatches">${SWATCHES.map((s) => `<button type="button" class="mx-swatch" style="--sw:${s}" data-swatch="${s}" data-target="${target}" aria-label="${label} ${s}"></button>`).join('')}<input type="color" name="${target}" value="${e(value || '#101828')}" aria-label="Custom ${label.toLowerCase()}"></div></div>`;
}
function designerPage({ product, supplier = 'printful', owner, design, designId = null, csrf, saveUrl, demo = false }) {
  const p = caps.PRODUCTS[product], o = caps.offer(product, supplier);
  const size = design.size || o.sizes[0].key, spec = specForClient(product, supplier, size);
  const target = owner.qrTarget, code = qr.encode(target);
  const isCard = p.designer === 'card', isSticker = product === 'sticker_kiss_cut', isTee = product === 'tshirt';
  const config = { spec, design, designId, owner: `${owner.kind}:${owner.id}`, qr: code.modules, csrf, saveUrl };
  const v = (k) => e(design[k] || '');
  const field = (name, label, opts = {}) => `<label class="mx-field"><span class="mx-label">${label}</span><input name="${name}" value="${v(name)}" maxlength="${opts.max || 80}" ${opts.type ? `type="${opts.type}"` : ''} autocomplete="off"></label>`;
  const select = (name, label, options) => `<label class="mx-field"><span class="mx-label">${label}</span><select name="${name}">${options.map(([val, lab]) => `<option value="${e(val)}"${design[name] === val ? ' selected' : ''}>${e(lab)}</option>`).join('')}</select></label>`;
  const sides = isCard ? `<div class="mx-side-toggle" role="group" aria-label="Preview side"><button type="button" data-mx-side="front" aria-pressed="true">Front</button><button type="button" data-mx-side="back" aria-pressed="false">Back</button></div>` : '';
  const qrNote = `<div class="mx-qr-note"><strong>Your QR code</strong><p>Opens <a href="${e(target)}">${e(target.replace('https://', ''))}</a>. ${owner.kind === 'pro' ? 'It points to your own GoBookr profile, so it keeps working if you change where you work.' : 'It points to your business page on GoBookr.'} It is checked from the actual print pixels before you can order.</p></div>`;
  const controls = `<form class="mx-controls" onsubmit="return false">
    <fieldset><legend>Brand</legend>
      <div class="mx-field"><span class="mx-label">Logo</span><div class="mx-logo-row"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp"><button type="button" class="btn ghost small" data-mx-remove-logo>Remove</button></div><span class="mx-hint">PNG with a transparent background works best.</span></div>
      ${field('business', 'Business name', { max: 60 })}${field('tagline', 'Tagline', { max: 70 })}
      ${isCard ? select('layout', 'Front layout', [['classic', 'Classic'], ['centered', 'Centered'], ['bold', 'Bold']]) : ''}
      ${select('font', 'Typeface', [['inter', 'Inter'], ['display', 'Inter Display'], ['serif', 'Serif']])}
    </fieldset>
    ${isCard ? `<fieldset><legend>${product === 'appointment_card' ? 'Card details' : 'Contact details'}</legend>${field('name', 'Name')}${product === 'business_card' ? field('title', 'Title', { max: 60 }) : ''}${field('phone', 'Phone', { max: 30 })}${product === 'business_card' ? field('email', 'Email', { max: 80 }) : ''}${field('website', 'Website', { max: 80 })}${product === 'business_card' ? field('address', 'Address', { max: 90 }) + field('social', 'Social handle', { max: 60 }) : ''}${field('qrCaption', 'QR caption', { max: 30 })}</fieldset>` : ''}
    ${isSticker ? `<fieldset><legend>Sticker</legend><label class="mx-check"><input type="checkbox" name="stickerQr"${design.stickerQr ? ' checked' : ''}> Include QR code</label>${select('size', 'Size', o.sizes.map((s) => [s.key, s.label]))}</fieldset>` : ''}
    <fieldset><legend>Color</legend>${isTee ? swatchRow('teeInk', 'Print color', design.teeInk) : swatchRow('frontBg', isSticker ? 'Sticker color' : 'Front background', design.frontBg)}${isCard ? swatchRow('backBg', 'Back background', design.backBg) + swatchRow('accent', 'Accent', design.accent) : ''}</fieldset>
    ${isCard ? `<fieldset><legend>Paper</legend>${select('sides', 'Printing', o.sides.map((s) => [s, s === 'double' ? 'Front and back' : 'Front only']))}${select('paper', 'Stock', o.papers.map((x) => [x.key, x.label]))}<p class="mx-hint">${e(o.papers.map((x) => x.note).join(' '))} ${e(caps.SUPPLIERS[supplier].name)} offers this card on one stock only; no gloss or foil options are shown because they are not available.</p></fieldset>` : ''}
    <label class="mx-check"><input type="checkbox" name="showGuides"${design.showGuides !== false ? ' checked' : ''}> Show trim, bleed and safe-area guides</label>
  </form>`;
  const stage = (id, label) => `<figure class="mx-proof" data-face="${id}"><div class="mx-crop"><canvas id="mx-${id}" class="mx-canvas" aria-label="${label} preview"></canvas><canvas id="mx-guides-${id}" class="mx-guides" aria-hidden="true"></canvas></div><figcaption>${label}</figcaption></figure>`;
  return shell(`${head(`${demo ? 'Try the designer: ' : ''}${p.name}`, `Designing for <strong>${e(owner.name)}</strong>. Printed by ${e(caps.SUPPLIERS[supplier].name)}${demo ? ' — demo mode, nothing is saved or ordered' : ''}.`, demo ? '/merch/demo/design/business_card' : '/merch', demo)}
  <div class="mx-designer" data-merch-designer data-side="front" data-product="${product}">
    <div class="mx-stage">${sides}<div class="mx-faces">${stage('front', isTee ? 'Front print' : 'Front')}${isCard ? stage('back', 'Back') : ''}</div>${specChips(product, supplier, size)}
      <div class="mx-legend" aria-hidden="true"><span class="lg-bleed">Bleed (trimmed off)</span><span class="lg-trim">Trim line</span><span class="lg-safe">Safe area</span></div>${qrNote}</div>
    <div class="mx-panel">${controls}<div class="mx-actions"><button type="button" class="btn" data-mx-save>${demo ? 'Check print files' : 'Save and check print files'}</button><a class="btn secondary" data-mx-next hidden href="#">Order these</a></div><p class="mx-status" data-mx-status role="status" aria-live="polite"></p></div>
  </div><script type="application/json" id="merch-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>`);
}

// ---- saved designs -------------------------------------------------------------------------------------------------
function designsPage({ list, owners }) {
  const name = (d) => (owners.find((o) => o.kind === d.owner_kind && o.id === d.owner_id) || {}).name || '';
  const rows = list.map((d) => {
    const p = caps.PRODUCTS[d.product];
    return `<article class="mx-design"><canvas data-merch-render="${jsonAttr({ spec: specForClient(d.product, d.supplier, d.size || caps.offer(d.product, d.supplier).sizes[0].key), design: d.front, side: 'front', qr: d.qr_target ? qr.encode(d.qr_target).modules : null })}" class="mx-thumb p-${d.product}"></canvas>
      <div><h2>${e(d.name || p.name)}</h2><p class="mx-muted">${e(p.name)} for ${e(name(d))}</p><p>${d.print_files_ok ? '<span class="mx-ok">Print-ready</span>' : '<span class="mx-warn">Needs a print check</span>'}${d.qr_verified_at ? ' <span class="mx-ok">QR verified</span>' : ''}</p>
      <div class="mx-row"><a class="btn secondary small" href="/merch/design/${d.product}?design=${d.id}">Edit</a>${d.print_files_ok ? `<a class="btn small" href="/merch/order/new?owner=${d.owner_kind}:${d.owner_id}&design=${d.id}">Reorder</a>` : ''}</div></div></article>`;
  }).join('');
  return shell(`${head('Saved designs', 'A professional\'s designs belong to their own profile and stay with them if they change workplaces.', '/merch/designs')}${rows ? `<div class="mx-designs">${rows}</div>` : '<div class="mx-empty"><h2>No saved designs yet</h2><p>Start with a business card. It takes about two minutes.</p><a class="btn" href="/merch/design/business_card">Design a business card</a></div>'}`);
}

// ---- order builder -------------------------------------------------------------------------------------------------
function orderBuilder({ owner, designs, ship, csrf, error }) {
  const byProduct = (k) => designs.filter((d) => d.product === k && d.print_files_ok);
  const designSelect = (k, sel) => { const list = byProduct(k); return list.length ? `<select name="${k}_design">${list.map((d) => `<option value="${d.id}"${String(sel) === String(d.id) ? ' selected' : ''}>${e(d.name)}</option>`).join('')}</select>` : `<a href="/merch/design/${k}">Design ${e(caps.PRODUCTS[k].name.toLowerCase())} first</a>`; };
  const tee = caps.offer('tshirt', 'printful'), card = caps.offer('business_card', 'printful'), st = caps.offer('sticker_kiss_cut', 'printful');
  const a = (k) => e((ship || {})[k] || '');
  return shell(`${head('New order', `Ordering for <strong>${e(owner.name)}</strong>. Prices, shipping and tax come from the supplier before you pay.`, '/merch/orders')}
  ${error ? `<div class="alert error" role="alert">${e(error)}</div>` : ''}
  <form method="POST" action="/merch/orders" class="mx-builder"><input type="hidden" name="_csrf" value="${e(csrf)}"><input type="hidden" name="owner" value="${owner.kind}:${owner.id}">
    <section class="mx-block"><h2>Business cards</h2><div class="mx-grid2"><label class="mx-field"><span class="mx-label">Design</span>${designSelect('business_card')}</label>
      <label class="mx-field"><span class="mx-label">Quantity</span><select name="business_card_qty"><option value="0">None</option>${[50, 100, 200, 300, 500, 1000].map((n) => `<option value="${n}">${n} cards${caps.unitsForPieces('business_card', 'printful', n).units > 1 ? ` (${caps.unitsForPieces('business_card', 'printful', n).units} sets of ${caps.unitsForPieces('business_card', 'printful', n).pack})` : ''}</option>`).join('')}</select><span class="mx-hint">Printful sells cards in sets of ${card.packs.join(' or ')}.</span></label></div></section>
    <section class="mx-block"><h2>Stickers</h2><div class="mx-grid2"><label class="mx-field"><span class="mx-label">Design</span>${designSelect('sticker_kiss_cut')}</label>
      <label class="mx-field"><span class="mx-label">Quantity</span><input type="number" name="sticker_qty" min="0" max="1000" value="0" inputmode="numeric"><span class="mx-hint">${e(st.sizes.map((s) => s.label).join(', '))} — size is part of the design.</span></label></div></section>
    <section class="mx-block"><h2>Team T-shirts</h2><label class="mx-field"><span class="mx-label">Design</span>${designSelect('tshirt')}</label>
      <p class="mx-muted">${e(tee.supplierProduct)} in ${e(tee.colors.map((c) => c.label).join(', '))}.</p><div class="mx-sizes">${tee.sizes.map((s) => `<label><span>${e(s.label)}</span><input type="number" name="tee_${e(s.key)}" min="0" max="500" value="0" inputmode="numeric"></label>`).join('')}</div></section>
    <section class="mx-block"><h2>Ship to</h2><div class="mx-grid2">${[['name', 'Name or business'], ['address1', 'Street address'], ['address2', 'Suite (optional)'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['phone', 'Phone (optional)'], ['email', 'Email for tracking']].map(([k, l]) => `<label class="mx-field"><span class="mx-label">${l}</span><input name="ship_${k}" value="${a(k)}" ${k === 'state' ? 'maxlength="2"' : ''}></label>`).join('')}</div></section>
    <div class="mx-actions"><button class="btn" type="submit">Get supplier pricing</button></div>
  </form>`);
}

// ---- order detail / tracking ---------------------------------------------------------------------------------------
function timelineHtml(tl, simulatedOrder) {
  return `<ol class="mx-steps">${tl.map((s) => `<li class="${s.done ? 'is-done' : ''}${s.error ? ' is-error' : ''}"><span class="mx-step-n" aria-hidden="true">${s.n}</span><div><strong>${e(s.label)}</strong>${s.events.map((ev) => `<p>${e(ev.message)}${simBadge(ev.meta && ev.meta.simulated)}</p>`).join('') || `<p class="mx-muted">${s.done ? '' : 'Waiting'}</p>`}</div></li>`).join('')}</ol>${simulatedOrder ? '<p class="mx-muted mx-simnote">Steps marked Simulated did not contact a supplier or charge a card.</p>' : ''}`;
}
function itemsHtml(items, previews) {
  return `<ul class="mx-items">${items.map((i) => `<li>${previews[i.design_id] || ''}<div><strong>${e(i.label)}</strong><span class="mx-muted">${i.pieces.toLocaleString('en-US')} pieces · ${e(caps.SUPPLIERS[i.supplier].name)}</span></div><span class="mx-num">${i.line_cents ? money(i.line_cents) : ''}</span></li>`).join('')}</ul>`;
}
function previewFor(design) {
  if (!design) return '';
  const size = design.size || caps.offer(design.product, design.supplier).sizes[0].key;
  return `<canvas class="mx-thumb sm p-${design.product}" data-merch-render="${jsonAttr({ spec: specForClient(design.product, design.supplier, size), design: design.front, side: 'front', qr: design.qr_target ? qr.encode(design.qr_target).modules : null })}"></canvas>`;
}
function orderPage({ order, items, supplierOrders, events, designs, csrf, demo = false }) {
  const previews = Object.fromEntries(Object.values(designs).map((d) => [d.id, previewFor(d)]));
  const tl = orders.timeline(events);
  const groups = orders.groupBySupplier(items);
  const multi = Object.keys(groups).length > 1 || supplierOrders.some((s) => (s.shipments || []).length > 1);
  const canPay = !demo && ['quoted', 'awaiting_payment'].includes(order.status);
  const sup = supplierOrders.map((s) => `<article class="mx-sup"><header><strong>${e(caps.SUPPLIERS[s.supplier].name)}</strong>${simBadge(s.simulated)}<span class="mx-pill st-${e(s.status)}">${e(s.status.replace('_', ' '))}</span></header>
    <p class="mx-muted">Supplier order ${e(s.supplier_order_id || 'not created yet')}</p>${s.error ? `<p class="mx-warn">${e(s.error)}</p>` : ''}
    ${(s.shipments || []).map((sh, i) => `<div class="mx-ship"><span>Package ${i + 1}</span><strong>${e(sh.carrier || 'Carrier')} ${e(sh.trackingNumber || '')}</strong>${sh.trackingUrl ? `<a href="${e(sh.trackingUrl)}" rel="noopener" target="_blank">Track package</a>` : ''}</div>`).join('')}</article>`).join('');
  const totals = `<dl class="mx-totals"><div><dt>Items</dt><dd>${money(order.subtotal_cents)}</dd></div><div><dt>Shipping</dt><dd>${money(order.shipping_cents)}</dd></div><div><dt>Tax</dt><dd>${money(order.tax_cents)}</dd></div><div class="mx-total"><dt>Total</dt><dd>${money(order.total_cents)}</dd></div>${order.refunded_cents ? `<div><dt>Refunded</dt><dd>−${money(order.refunded_cents)}</dd></div>` : ''}</dl>${order.simulated ? '<p class="mx-simnote">Simulated prices for testing — not a supplier quote. Live checkout only accepts prices returned by the supplier.</p>' : `<p class="mx-muted">Prices from ${e([...new Set(items.map((i) => caps.SUPPLIERS[i.supplier].name))].join(' and '))}. Quote valid until ${e(new Date(order.quote_expires_at || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}.</p>`}`;
  const pay = canPay ? `<form method="POST" action="/merch/orders/${e(order.order_number)}/checkout"><input type="hidden" name="_csrf" value="${e(csrf)}"><button class="btn" type="submit">${orders.stripeMode() === 'simulated' ? 'Run simulated checkout' : 'Pay securely with Stripe'}</button></form><p class="mx-hint">${orders.stripeMode() === 'test' ? 'Stripe test mode — use a test card; nothing is charged.' : orders.stripeMode() === 'simulated' ? 'No Stripe key on this environment: payment is simulated and no card is charged.' : ''}</p>` : '';
  return shell(`${head(`Order ${order.order_number}`, `${e(order.business_name || '')} <span class="mx-pill st-${e(order.status)}">${e(orders.STATUS_LABEL[order.status] || order.status)}</span>${simBadge(order.simulated)}`, demo ? '/merch/demo' : '/merch/orders', demo)}
  <div class="mx-order"><div class="mx-order-main"><section class="mx-block"><h2>Items</h2>${itemsHtml(items, previews)}${totals}${pay}</section>
    <section class="mx-block"><h2>Fulfillment</h2>${multi ? '<p class="mx-note">Your items are made by more than one facility and may arrive in separate packages on different days.</p>' : ''}${sup || '<p class="mx-muted">Supplier orders are created only after payment is confirmed.</p>'}</section>
    <section class="mx-block"><h2>Receipt and packing slip</h2>${branding.packingSlipHtml(order, items, supplierOrders)}<p class="mx-row">${['shipped', 'delivered', 'in_production', 'partially_shipped'].includes(order.status) ? `<a class="btn secondary small" href="${demo ? '/merch/demo' : `/merch/order/new?owner=${order.owner_kind}:${order.owner_id}&reorder=${e(order.order_number)}`}">Reorder</a>` : ''}</p></section></div>
  <aside class="mx-order-side"><section class="mx-block"><h2>Progress</h2>${timelineHtml(tl, order.simulated)}</section></aside></div>`);
}

function ordersList({ list }) {
  const rows = list.map((o) => `<a class="mx-orow" href="/merch/orders/${e(o.order_number)}"><strong>${e(o.order_number)}</strong><span>${e(o.business_name)}</span><span class="mx-pill st-${e(o.status)}">${e(orders.STATUS_LABEL[o.status] || o.status)}</span><span class="mx-num">${money(o.total_cents)}</span></a>`).join('');
  return shell(`${head('Orders', 'Track production, shipping and tracking numbers for every supplier in one place.', '/merch/orders')}<div class="mx-row"><a class="btn" href="/merch/order/new">New order</a></div>${rows ? `<div class="mx-olist">${rows}</div>` : '<div class="mx-empty"><h2>No orders yet</h2><p>Save a design, then order it here.</p></div>'}`);
}

// ---- capability matrix -----------------------------------------------------------------------------------------------
function capabilitiesPage() {
  const sups = Object.values(caps.SUPPLIERS);
  const val = (c) => (!c ? '<td class="cap-unknown">Not confirmed</td>' : c.value === true ? `<td class="cap-yes">Yes${c.note ? `<small>${e(c.note)}</small>` : ''}</td>` : c.value === false ? `<td class="cap-no">No${c.note ? `<small>${e(c.note)}</small>` : ''}</td>` : '<td class="cap-unknown">Not confirmed</td>');
  const rows = [['whiteLabel', 'Ships without supplier branding'], ['packingSlipLogo', 'Logo on packing slip'], ['packingSlipMessage', 'Custom packing-slip message'], ['packIns', 'Branded inserts (pack-ins)'], ['customMailers', 'Custom mailers'], ['customBoxes', 'Custom boxes'], ['perOrderInsertPrinting', 'Different insert printed per order']];
  const prodRows = Object.values(caps.PRODUCTS).filter((p) => p.status === 'available').map((p) => `<tr><th scope="row">${e(p.name)}</th>${sups.map((s) => { const o = p.offers[s.key]; return o ? `<td class="cap-yes">${e(o.supplierProduct)}<small>${e([(o.sizes || []).map((x) => x.label).join(', '), o.packs.length > 1 || o.packs[0] > 1 ? `sets of ${o.packs.join('/')}` : ''].filter(Boolean).join(' — '))}</small></td>` : '<td class="cap-unknown">Not offered or not confirmed</td>'; }).join('')}</tr>`).join('');
  return shell(`${head('Supplier capabilities', `Checked ${caps.CHECKED_AT} against each supplier's public pages. Anything not confirmed is treated as unavailable and never shown to customers.`, '/merch/capabilities')}
  <div class="mx-table-wrap"><table class="mx-cap"><thead><tr><th scope="col">Products</th>${sups.map((s) => `<th scope="col">${e(s.name)}<small>${s.integration === 'live' ? 'Connected account' : 'Not connected — simulated'}</small></th>`).join('')}</tr></thead><tbody>${prodRows}</tbody></table></div>
  <div class="mx-table-wrap"><table class="mx-cap"><thead><tr><th scope="col">Branded fulfillment</th>${sups.map((s) => `<th scope="col">${e(s.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([k, l]) => `<tr><th scope="row">${l}</th>${sups.map((s) => val(s.branding[k])).join('')}</tr>`).join('')}</tbody></table></div>
  <section class="mx-block"><h2>Packaging roadmap</h2><ol class="mx-phases"><li><strong>Phase 1 — now.</strong> White-label shipping and a GoBookr packing slip (order number, business name, items, support, reorder link) through Printful's packing-slip settings. Orders routed to a Printful partner facility ship without the custom slip; the order page says so.</li><li><strong>Phase 2.</strong> Stock the standard GoBookr insert card and promotional stickers at Printful as approved pack-ins ($0.50 picking fee each, $25/month storage minimum). Inserts are generic (not personalized per order) because Printful stores pre-printed stock.</li><li><strong>Phase 3.</strong> Branded poly or paper mailers at Printful once volume justifies stored inventory. Custom boxes are not offered by Printful and will not be promised.</li></ol></section>`);
}

function demoPage({ order, items, supplierOrders, events, designs, insertSvg, promise }) {
  const page = orderPage({ order, items, supplierOrders, events, designs, csrf: '', demo: true });
  const banner = `<div class="mx-demo-banner" role="note"><strong>Demo order — simulated end to end.</strong> No supplier was contacted, no print order was placed and no card was charged. Prices are placeholders, not Printful quotes.</div>`;
  const extra = `<section class="mx-block"><h2>Standard insert card</h2><div class="mx-insert">${insertSvg}</div><p class="mx-muted">Printed as stocked pack-ins in phase 2. The reorder QR points to the order's reorder link.</p></section>
  <section class="mx-block"><h2>What branded fulfillment this order gets</h2>${promise.map((p) => `<h3>${e(p.name)}</h3><ul class="mx-promise">${p.items.map((i) => `<li class="${i.ok ? 'ok' : 'no'}"><span>${i.ok ? 'Included' : 'Not included'}</span>${e(i.label)}${i.note ? `<small>${e(i.note)}</small>` : ''}</li>`).join('')}</ul>`).join('')}</section>`;
  return page.replace('<section class="section container mx">', `<section class="section container mx">${banner}`).replace('</div>\n  <aside class="mx-order-side">', `${extra}</div>\n  <aside class="mx-order-side">`);
}

module.exports = { home, designerPage, designsPage, orderBuilder, orderPage, ordersList, capabilitiesPage, demoPage, specForClient, money };
