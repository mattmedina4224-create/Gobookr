'use strict';
// Public business profile. Pure rendering: callers pass already-loaded data (no queries here).
// mode: 'public' (published or unclaimed listing), 'base' (claimed but unpublished: factual listing only),
//       'preview' (owner preview of everything, published or not).
const { escapeHtml: e } = require('./util');
const { shopCategoryLabel } = require('./shop-categories');
const P = require('./shop-profile');
const { PROFESSIONAL_CATEGORIES } = require('./pro-categories');
const PRO_LABELS = Object.fromEntries(PROFESSIONAL_CATEGORIES.map((c) => [c.value, c.label]));

const SCHEMA_TYPES = { barber: 'BarberShop', stylist: 'HairSalon', colorist: 'HairSalon', nail_technician: 'NailSalon', tattoo_artist: 'TattooParlor',
  massage_therapist: 'HealthAndBeautyBusiness', esthetician: 'DaySpa' };
const DAY_SCHEMA = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const icon = {
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8 12.3 4l3.1-.2.6 3 2.4 2-1.5 2.7.6 3-3 .9-1.4 2.8-2.9-1.1-2.9 1.1-1.4-2.8-3-.9.6-3L1.6 9l2.4-2 .6-3 3.1.2Z" fill="currentColor"/><path d="m6.8 10.2 2.2 2.2 4.4-4.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3v4M16 3v4M3.5 10h17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  route: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 9-9 9-9-9Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 13v-2.5h5V8.5l2.5 2.5L14 13.5V12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function addressLine(shop) {
  return [[shop.street_address, shop.suite].filter(Boolean).join(', '), shop.city, [shop.state, shop.zip_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function directionsUrl(shop) {
  const q = shop.latitude && shop.longitude && !shop.street_address ? `${shop.latitude},${shop.longitude}` : addressLine(shop) || `${shop.name} ${shop.city} ${shop.state}`;
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
}
function mapEmbed(shop) {
  const lat = Number(shop.latitude), lon = Number(shop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return '';
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d * 0.6},${lon + d},${lat + d * 0.6}&layer=mapnik&marker=${lat},${lon}`;
  return `<div class="sp-map"><iframe title="Map showing ${e(shop.name)}" src="${e(src)}" loading="lazy" referrerpolicy="no-referrer"></iframe><a class="sp-map-credit" href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener">© OpenStreetMap</a></div>`;
}

function cover(shop, full) {
  const url = full && P.publicUrl(shop.cover_url);
  if (url) return `<div class="sp-cover"><img src="${e(url)}" alt="" fetchpriority="high" decoding="async" style="object-position:50% ${Number(shop.cover_position ?? 50)}%"></div>`;
  const initial = (String(shop.name || 'G').match(/[A-Za-z0-9]/) || ['G'])[0].toUpperCase();
  return `<div class="sp-cover sp-cover-fallback" aria-hidden="true"><span class="sp-cover-initial">${e(initial)}</span></div>`;
}
function logo(shop, full) {
  const url = full && P.publicUrl(shop.logo_url);
  const initials = String(shop.name || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w.match(/[A-Za-z0-9]/)[0].toUpperCase()).join('') || 'GB';
  return url ? `<img class="sp-logo" src="${e(url)}" alt="${e(shop.name)} logo" width="112" height="112" decoding="async">` : `<div class="sp-logo sp-logo-fallback" aria-hidden="true">${e(initials)}</div>`;
}

function servicesSection(services) {
  if (!services.length) return '';
  const groups = P.groupServices(services);
  return `<section class="sp-section" id="services" aria-labelledby="services-h"><h2 id="services-h">Services</h2>
    ${groups.length > 1 ? `<nav class="sp-chips sp-chips-scroll" aria-label="Service categories">${groups.map((g, i) => `<a href="#svc-${i}">${e(g.label)}</a>`).join('')}</nav>` : ''}
    ${groups.map((g, i) => `<div class="sp-menu" id="svc-${i}">${groups.length > 1 ? `<h3>${e(g.label)}</h3>` : ''}<ul>${g.items.map((s) => {
      const price = P.formatPrice(s), dur = P.formatDuration(s.duration_minutes);
      return `<li><div class="sp-menu-line"><span class="sp-menu-name">${e(s.name)}</span><span class="sp-menu-leader" aria-hidden="true"></span><span class="sp-menu-price">${price ? e(price) : '<span class="sp-muted">Ask for price</span>'}</span></div>${s.description || dur ? `<p class="sp-menu-meta">${[dur, s.description].filter(Boolean).map(e).join(' · ')}</p>` : ''}</li>`;
    }).join('')}</ul></div>`).join('')}
    <p class="sp-note">Prices and durations are set by the business and may vary.</p></section>`;
}

function teamSection(team, { verified, shopName }) {
  if (!team.length) return '';
  const heading = verified ? 'Meet the team' : 'Professionals who list this business';
  return `<section class="sp-section" id="team" aria-labelledby="team-h"><h2 id="team-h">${heading}</h2>
    ${verified ? '' : `<p class="sp-lede-sm">These professionals name ${e(shopName)} on their own Tovara profiles. The business has not confirmed them as staff.</p>`}
    <div class="sp-team">${team.map((p) => {
      const photo = P.publicUrl(p.profile_photo_url);
      const book = P.publicUrl(p.booking_url);
      const specialty = PRO_LABELS[p.category] || String(p.category || 'Professional').replace(/_/g, ' ');
      return `<article class="sp-member">
        <a class="sp-member-main" href="/pro/${Number(p.id)}">${photo ? `<img src="${e(photo)}" alt="" loading="lazy" decoding="async" width="72" height="72">` : `<span class="sp-member-initials" aria-hidden="true">${e(p.initials || String(p.business_name || 'GB').slice(0, 2).toUpperCase())}</span>`}
        <span class="sp-member-text"><strong>${e(p.business_name)}</strong><span>${e(specialty.charAt(0).toUpperCase() + specialty.slice(1))}${p.license_verified ? ' · <span class="sp-verified-text">License verified</span>' : ''}</span></span></a>
        <div class="sp-member-actions"><a class="sp-link" href="/pro/${Number(p.id)}">View profile</a>${book ? `<a class="btn small" href="${e(book)}" target="_blank" rel="noopener noreferrer">Book</a>` : ''}</div>
      </article>`;
    }).join('')}</div></section>`;
}

function gallerySection(photos) {
  if (!photos.length) return '';
  const items = photos.map((ph, i) => {
    const url = P.publicUrl(ph.image_url); if (!url) return '';
    const label = ph.caption || P.PHOTO_KINDS[ph.kind] || 'Photo';
    return `<button type="button" class="sp-photo${i === 0 && photos.length >= 5 ? ' sp-photo-lead' : ''}" data-index="${i}" data-src="${e(url)}" data-caption="${e(ph.caption || '')}" aria-label="Open photo: ${e(label)}"><img src="${e(url)}" alt="${e(ph.caption || P.PHOTO_KINDS[ph.kind] || '')}" loading="lazy" decoding="async"${ph.width && ph.height ? ` width="${Number(ph.width)}" height="${Number(ph.height)}"` : ''}></button>`;
  }).join('');
  return `<section class="sp-section" id="photos" aria-labelledby="photos-h"><h2 id="photos-h">Photos</h2><div class="sp-gallery" data-gallery>${items}</div>
    <dialog class="sp-lightbox" aria-label="Photo viewer"><button type="button" class="sp-lb-close" aria-label="Close">×</button><button type="button" class="sp-lb-prev" aria-label="Previous photo">‹</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" class="sp-lb-next" aria-label="Next photo">›</button><p class="sp-lb-count" aria-live="polite"></p></dialog></section>`;
}

function joinCard(shop, relationship, csrf) {
  if (!relationship) return '';
  const manage = '<a class="sp-link" href="/dashboard/pro/businesses">My workplaces</a>';
  const body = {
    none: `<h3>Work here?</h3><p>Ask to appear on this page with your Tovara profile. The owner approves your request.</p><form method="POST" action="/shop/${Number(shop.id)}/join"><input type="hidden" name="_csrf" value="${e(csrf || '')}"><button class="btn secondary block" type="submit">Request to join</button></form>`,
    requested: `<h3>Request sent</h3><p>Your request to join is waiting for the owner.</p>${manage}`,
    pending: `<h3>You’re invited</h3><p>This business invited you to join its page.</p><a class="btn block" href="/dashboard/pro/businesses">Review invitation</a>`,
    accepted: `<h3>You’re on this team</h3><p>You can leave at any time from ${manage}.</p>`,
  }[relationship.status];
  return body ? `<div class="sp-claim sp-join">${body}</div>` : '';
}

function visitCard(shop, { full, claimed, relationship, csrf }) {
  const addr = addressLine(shop);
  const phone = String(shop.phone || '').trim();
  const website = P.publicUrl(shop.website_url);
  const hours = full ? P.hoursRows(shop.hours) : [];
  const social = full ? Object.entries(shop.social_links || {}).filter(([k, v]) => P.SOCIAL[k] && P.publicUrl(v)) : [];
  return `<aside class="sp-visit" id="visit" aria-labelledby="visit-h"><h2 id="visit-h">Visit</h2>
    ${mapEmbed(shop)}
    <div class="sp-visit-row">${icon.pin}<div><p>${e(addr || `${shop.city}, ${shop.state}`)}</p><a class="sp-link" href="${e(directionsUrl(shop))}" target="_blank" rel="noopener">Get directions</a></div></div>
    ${phone ? `<div class="sp-visit-row">${icon.phone}<a class="sp-link" href="tel:${e(phone.replace(/[^\d+]/g, ''))}">${e(phone)}</a></div>` : ''}
    ${website ? `<div class="sp-visit-row">${icon.globe}<a class="sp-link" href="${e(website)}" target="_blank" rel="noopener noreferrer">${e(new URL(website).hostname.replace(/^www\./, ''))}</a></div>` : ''}
    ${hours.length ? `<div class="sp-hours"><h3>Hours</h3><table>${hours.map((h) => `<tr data-day="${h.day}"><th scope="row">${h.label}</th><td>${e(h.text)}</td></tr>`).join('')}</table></div>` : ''}
    ${social.length ? `<div class="sp-social">${social.map(([k, v]) => `<a href="${e(v)}" target="_blank" rel="noopener noreferrer">${e(P.SOCIAL[k].label)}</a>`).join('')}</div>` : ''}
    ${claimed ? joinCard(shop, relationship, csrf) : ''}
    ${!claimed ? `<div class="sp-claim"><h3>Own this business?</h3><p>Claim this page for free to add photos, services, hours and your team.</p><a class="btn secondary block" href="/shop/${Number(shop.id)}/claim">Claim this business</a></div>` : ''}
  </aside>`;
}

function renderProfile({ shop, profile, listedPros = [], mode = 'public', canEdit = false, relationship = null, csrf = '' }) {
  const claimed = shop.claim_status === 'claimed';
  const full = claimed && (mode === 'preview' || (mode === 'public' && shop.profile_published_at));
  const categories = profile.categories.map(shopCategoryLabel).filter(Boolean);
  const booking = P.publicUrl(shop.booking_url);
  const website = P.publicUrl(shop.website_url);
  const place = [shop.neighborhood && full ? shop.neighborhood : '', shop.city, shop.state].filter(Boolean).join(', ');
  const services = full ? profile.services : [];
  const photos = full ? profile.photos : [];
  const team = full ? profile.team : (!claimed ? listedPros : []);
  const specialties = full ? (shop.specialties || []) : [];
  const amenities = full ? (shop.amenities || []) : [];
  const about = full ? String(shop.description || '') : '';
  const sections = [about || specialties.length || amenities.length ? ['about', 'About'] : null, services.length ? ['services', 'Services'] : null,
    team.length ? ['team', 'Team'] : null, photos.length ? ['photos', 'Photos'] : null, ['visit', 'Visit']].filter(Boolean);
  const phone = String(shop.phone || '').trim();

  const banner = mode === 'preview' ? `<div class="sp-preview-bar" role="status"><div class="container"><span><strong>Preview.</strong> ${shop.profile_published_at ? 'This is how customers see your page.' : 'Customers see a basic listing until you publish.'}</span><a class="btn small" href="/dashboard/shop?shop=${Number(shop.id)}${shop.profile_published_at ? '' : '&step=6'}">${shop.profile_published_at ? 'Back to dashboard' : 'Review and publish'}</a></div></div>` : '';
  const closed = shop.operational_status === 'closed' ? '<p class="sp-alert">This business may have closed. We are reviewing this listing.</p>' : '';

  return `<link rel="stylesheet" href="/shop-profile.css?v=2">${banner}
  <article class="sp" data-shop-url="https://gobookr.com/shop/${Number(shop.id)}">
    <div class="container sp-head">
      ${cover(shop, full)}
      <div class="sp-identity">
        ${logo(shop, full)}
        <div class="sp-title">
          <h1>${e(shop.name)}</h1>
          ${full && shop.tagline ? `<p class="sp-tagline">${e(shop.tagline)}</p>` : ''}
          <p class="sp-meta">${categories.length ? `<span>${categories.map(e).join(' · ')}</span>` : ''}<span>${e(place)}</span>${claimed ? `<span class="sp-verified">${icon.check}Claimed by the business</span>` : '<span class="sp-unclaimed">Unclaimed listing</span>'}</p>
        </div>
        <div class="sp-actions">
          ${booking ? `<a class="btn" href="/shop/${Number(shop.id)}/book" target="_blank" rel="noopener">${icon.cal}Book<span class="sp-long"> an appointment</span></a>` : ''}
          ${website ? `<a class="btn secondary" href="${e(website)}" target="_blank" rel="noopener noreferrer">${icon.globe}Website</a>` : ''}
          <button type="button" class="btn secondary sp-share" data-share>${icon.share}<span>Share</span></button>
          ${canEdit ? `<a class="btn secondary" href="/dashboard/shop?shop=${Number(shop.id)}">Edit page</a>` : ''}
        </div>
      </div>
      ${closed}
    </div>
    ${sections.length > 1 ? `<nav class="sp-tabs" aria-label="On this page"><div class="container">${sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</div></nav>` : ''}
    <div class="container sp-body">
      <div class="sp-main">
        ${about || specialties.length || amenities.length ? `<section class="sp-section" id="about" aria-labelledby="about-h"><h2 id="about-h">About</h2>
          ${about ? about.split(/\n{2,}/).map((para) => `<p class="sp-about">${e(para).replace(/\n/g, '<br>')}</p>`).join('') : ''}
          ${specialties.length ? `<h3 class="sp-sub">Specialties</h3><div class="sp-chips">${specialties.map((s) => `<span>${e(s)}</span>`).join('')}</div>` : ''}
          ${amenities.length ? `<h3 class="sp-sub">Good to know</h3><ul class="sp-amenities">${amenities.map((a) => `<li>${e(a)}</li>`).join('')}</ul>` : ''}
        </section>` : ''}
        ${servicesSection(services)}
        ${teamSection(team, { verified: full, shopName: shop.name })}
        ${gallerySection(photos)}
        ${!full && !team.length ? `<section class="sp-section sp-empty"><h2>${claimed ? 'More coming soon' : 'About this listing'}</h2><p>${claimed ? `${e(shop.name)} is setting up its Tovara page. Check back soon for services, photos and the team.` : `This page was created from public business records${shop.source_name ? ` (${e(shop.source_name)}${shop.source_checked_at ? `, checked ${e(new Date(shop.source_checked_at).toISOString().slice(0, 10))}` : ''})` : ''}. Details may have changed.`}</p></section>` : ''}
      </div>
      ${visitCard(shop, { full, claimed, relationship: canEdit ? null : relationship, csrf })}
    </div>
    <div class="sp-actionbar" aria-label="Quick actions">
      ${booking ? `<a class="btn" href="/shop/${Number(shop.id)}/book" target="_blank" rel="noopener">Book</a>` : ''}
      ${phone ? `<a class="btn secondary" href="tel:${e(phone.replace(/[^\d+]/g, ''))}">Call</a>` : ''}
      <a class="btn secondary" href="${e(directionsUrl(shop))}" target="_blank" rel="noopener">Directions</a>
    </div>
    <p class="sp-toast" role="status" aria-live="polite" hidden>Link copied</p>
  </article>
  <script src="/shop-profile.js?v=1" defer></script>`;
}

function structuredData(shop, profile, full) {
  const url = 'https://gobookr.com/shop/' + Number(shop.id);
  const type = SCHEMA_TYPES[profile.categories[0]] || 'HealthAndBeautyBusiness';
  const hours = full && shop.hours ? Object.entries(shop.hours).filter(([, h]) => h && !h.closed && h.open).map(([d, h]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_SCHEMA[d], opens: h.open, closes: h.close })) : [];
  const images = full ? [P.publicUrl(shop.cover_url), ...profile.photos.slice(0, 6).map((p) => P.publicUrl(p.image_url))].filter(Boolean) : [];
  const sameAs = [P.publicUrl(shop.website_url), ...(full ? Object.values(shop.social_links || {}).map(P.publicUrl) : [])].filter(Boolean);
  const data = {
    '@context': 'https://schema.org', '@type': type, '@id': url, name: shop.name, url,
    description: (full && (shop.tagline || shop.description)) || undefined,
    image: images.length ? images : undefined, logo: (full && P.publicUrl(shop.logo_url)) || undefined, telephone: shop.phone || undefined,
    address: { '@type': 'PostalAddress', streetAddress: [shop.street_address, shop.suite].filter(Boolean).join(', ') || undefined, addressLocality: shop.city || undefined, addressRegion: shop.state || undefined, postalCode: shop.zip_code || undefined, addressCountry: 'US' },
    geo: Number.isFinite(Number(shop.latitude)) && shop.latitude ? { '@type': 'GeoCoordinates', latitude: Number(shop.latitude), longitude: Number(shop.longitude) } : undefined,
    openingHoursSpecification: hours.length ? hours : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    makesOffer: full && profile.services.length ? profile.services.slice(0, 50).map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name }, ...(s.price_cents != null && s.price_type === 'fixed' ? { price: (s.price_cents / 100).toFixed(2), priceCurrency: 'USD' } : {}) })) : undefined,
  };
  return JSON.parse(JSON.stringify(data));
}

function metaDescription(shop, profile, full) {
  const cats = profile.categories.map(shopCategoryLabel).filter(Boolean).slice(0, 2).join(' and ').toLowerCase();
  const lead = full && (shop.tagline || shop.description) ? String(shop.tagline || shop.description).slice(0, 110).trim() + '. ' : '';
  return `${lead}${shop.name}${cats ? `, ${cats}` : ''} in ${shop.city}, ${shop.state}. See services, photos, hours and the team on Tovara.`.slice(0, 300);
}

module.exports = { renderProfile, structuredData, metaDescription, addressLine, directionsUrl };
