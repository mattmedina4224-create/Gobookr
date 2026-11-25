'use strict';
// Owner dashboard + guided setup for claimed business pages. Pure rendering; routes load the data.
const { escapeHtml: e } = require('./util');
const { SHOP_CATEGORY_LABELS, shopCategoryLabel } = require('./shop-categories');
const P = require('./shop-profile');

// Tabs are defined with the navigation below (TABS).
const STEPS = [[1, 'Business info'], [2, 'Branding'], [3, 'Services'], [4, 'Gallery'], [5, 'Team'], [6, 'Preview and publish']];
const CATEGORY_CHOICES = Object.entries(SHOP_CATEGORY_LABELS);

const v = (x) => e(x == null ? '' : String(x));
const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${v(csrf)}">`;
const shopField = (shop) => `<input type="hidden" name="shop" value="${Number(shop.id)}">`;
const field = (label, input, help = '') => `<div class="sd-field"><label><span class="sd-label-text">${label}</span>${input}</label>${help ? `<p class="sd-help">${help}</p>` : ''}</div>`;
const text = (name, value, attrs = '') => `<input name="${name}" value="${v(value)}" ${attrs}>`;
const q = (shop, extra = '') => `?shop=${Number(shop.id)}${extra}`;

// ---- form sections (shared by tabs and setup steps) -------------------------------------------------------
function infoSection(shop, categories) {
  return `<fieldset class="sd-group"><legend>Business</legend>
    ${field('Business name', text('name', shop.name, 'maxlength="160" required autocomplete="organization"'))}
    ${field('Tagline <span class="sd-opt">optional</span>', text('tagline', shop.tagline, 'maxlength="120" placeholder="Precision fades and hot-towel shaves since 2014"'), 'One line under your name.')}
    <div class="sd-field"><span class="sd-label">Services you offer</span><div class="sd-checks">${CATEGORY_CHOICES.map(([value, label]) => `<label class="sd-check"><input type="checkbox" name="category_${value}" value="1"${categories.includes(value) ? ' checked' : ''}><span>${e(label)}</span></label>`).join('')}</div><p class="sd-help">Customers find you when they search these services.</p></div>
  </fieldset>
  ${locationSection(shop)}`;
}
function locationSection(shop) {
  return `<fieldset class="sd-group"><legend>Location and contact</legend>
    ${field('Street address', text('street_address', shop.street_address, 'maxlength="200" autocomplete="address-line1"'))}
    <div class="sd-row">${field('Suite or unit <span class="sd-opt">optional</span>', text('suite', shop.suite, 'maxlength="80" autocomplete="address-line2"'))}${field('Neighborhood <span class="sd-opt">optional</span>', text('neighborhood', shop.neighborhood, 'maxlength="80" placeholder="Wash Park"'))}</div>
    <div class="sd-row sd-row-3">${field('City', text('city', shop.city, 'maxlength="100" required autocomplete="address-level2"'))}${field('State', text('state', shop.state, 'maxlength="2" required autocomplete="address-level1" style="text-transform:uppercase"'))}${field('ZIP', text('zip_code', shop.zip_code, 'maxlength="10" inputmode="numeric" autocomplete="postal-code"'))}</div>
    <div class="sd-row">${field('Phone', text('phone', shop.phone, 'maxlength="40" type="tel" autocomplete="tel"'))}${field('Website <span class="sd-opt">optional</span>', text('website_url', shop.website_url, 'maxlength="2048" inputmode="url" placeholder="yourbusiness.com"'))}</div>
    ${field('Online booking link <span class="sd-opt">optional</span>', text('booking_url', shop.booking_url, 'maxlength="2048" inputmode="url" placeholder="https://"'), 'Square, Vagaro, Booksy, GlossGenius or your own booking page. Shown as “Book an appointment”.')}
  </fieldset>`;
}
function aboutSection(shop) {
  const amenities = shop.amenities || [];
  return `<fieldset class="sd-group"><legend>About</legend>
    ${field('Description', `<textarea name="description" rows="7" maxlength="3000" placeholder="What makes your business special? Your story, your style, what clients can expect.">${v(shop.description)}</textarea>`, '<span data-count="description">Aim for at least 80 characters.</span>')}
    ${field('Specialties <span class="sd-opt">optional</span>', text('specialties', (shop.specialties || []).join(', '), 'maxlength="500" placeholder="Skin fades, beard sculpting, color correction"'), 'Separate with commas. Up to 12.')}
    <div class="sd-field"><span class="sd-label">Good to know <span class="sd-opt">optional</span></span><div class="sd-checks">${P.AMENITIES.map((a, i) => `<label class="sd-check"><input type="checkbox" name="amenity_${i}" value="1"${amenities.includes(a) ? ' checked' : ''}><span>${e(a)}</span></label>`).join('')}</div></div>
  </fieldset>`;
}
function hoursSection(shop) {
  const h = shop.hours || {};
  return `<fieldset class="sd-group"><legend>Opening hours</legend><p class="sd-help" style="margin-top:-4px">Leave a day blank to hide it, or mark it closed.</p><div class="sd-hours">
    ${P.DAYS.map(([day, label]) => { const d = h[day] || {}; return `<div class="sd-hours-row"><span>${label}</span>
      <input type="time" name="hours_${day}_open" value="${v(d.open)}" aria-label="${label} opens"${d.closed ? ' disabled' : ''}><span class="sd-to">to</span><input type="time" name="hours_${day}_close" value="${v(d.close)}" aria-label="${label} closes"${d.closed ? ' disabled' : ''}>
      <label class="sd-check sd-check-inline"><input type="checkbox" name="hours_${day}_closed" value="1" data-closed-toggle${d.closed ? ' checked' : ''}><span>Closed</span></label></div>`; }).join('')}
    <button type="button" class="sd-textbtn" data-copy-weekday-hours>Copy Monday to all weekdays</button></div></fieldset>`;
}
function linksSection(shop) {
  const s = shop.social_links || {};
  return `<fieldset class="sd-group"><legend>Social links <span class="sd-opt">optional</span></legend><div class="sd-row">${Object.entries(P.SOCIAL).map(([k, spec]) => field(spec.label, text('social_' + k, s[k], `maxlength="300" placeholder="@yourbusiness or link"`))).join('')}</div></fieldset>`;
}

function uploader({ shop, csrf, purpose, label, current, hint, multiple = false }) {
  return `<div class="sd-uploader" data-uploader data-purpose="${purpose}" data-shop="${Number(shop.id)}" data-csrf="${v(csrf)}">
    ${current ? current : ''}
    <label class="btn secondary sd-upload-btn"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" ${multiple ? 'multiple' : ''} hidden><span>${label}</span></label>
    <p class="sd-help">${hint}</p><p class="sd-upload-status" role="status" aria-live="polite"></p></div>`;
}
function brandingSection(shop, csrf) {
  const logo = P.publicUrl(shop.logo_url), cover = P.publicUrl(shop.cover_url);
  return `<fieldset class="sd-group"><legend>Logo</legend>
    ${uploader({ shop, csrf, purpose: 'logo', label: logo ? 'Replace logo' : 'Upload logo', hint: 'Square works best. We resize it for you.',
      current: logo ? `<img class="sd-logo-preview" src="${v(logo)}" alt="Current logo">` : '<div class="sd-logo-preview sd-empty-thumb" aria-hidden="true"></div>' })}
    ${logo ? removeMedia(shop, csrf, 'logo', 'Remove logo') : ''}
  </fieldset>
  <fieldset class="sd-group"><legend>Cover photo</legend>
    ${uploader({ shop, csrf, purpose: 'cover', label: cover ? 'Replace cover photo' : 'Upload cover photo', hint: 'A wide photo of your space or work. Only use photos you took or have the rights to use.',
      current: cover ? `<div class="sd-cover-frame"><img src="${v(cover)}" alt="Current cover" data-cover-preview style="object-position:50% ${Number(shop.cover_position ?? 50)}%"></div>` : '' })}
    ${cover ? `<form method="POST" action="/dashboard/shop/cover-position" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<label class="sd-range"><span>Reposition</span><input type="range" name="cover_position" min="0" max="100" value="${Number(shop.cover_position ?? 50)}" data-cover-range aria-label="Cover vertical position"></label><button class="btn secondary small" type="submit">Save position</button></form>${removeMedia(shop, csrf, 'cover', 'Remove cover')}` : ''}
  </fieldset>`;
}
function removeMedia(shop, csrf, purpose, label) {
  return `<form method="POST" action="/dashboard/shop/media/remove" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<input type="hidden" name="purpose" value="${purpose}"><button class="sd-textbtn sd-danger" type="submit">${label}</button></form>`;
}

function photosSection(shop, csrf, photos) {
  const left = P.MAX_PHOTOS - photos.length;
  return `${left > 0 ? uploader({ shop, csrf, purpose: 'photo', label: 'Add photos', multiple: true, hint: `Interior, exterior, stations, products and work you have the rights to share. ${left} of ${P.MAX_PHOTOS} left.` }) : `<p class="sd-help">You have reached ${P.MAX_PHOTOS} photos. Remove one to add another.</p>`}
    ${photos.length ? `<ul class="sd-photos">${photos.map((ph, i) => `<li class="sd-photo"><img src="${v(P.publicUrl(ph.image_url))}" alt="" loading="lazy">
      <form method="POST" action="/dashboard/shop/photos/${Number(ph.id)}" class="sd-photo-form">${csrfField(csrf)}${shopField(shop)}
        <input name="caption" value="${v(ph.caption)}" maxlength="140" placeholder="Caption (optional)" aria-label="Caption">
        <select name="kind" aria-label="Photo type">${Object.entries(P.PHOTO_KINDS).map(([k, label]) => `<option value="${k}"${ph.kind === k ? ' selected' : ''}>${label}</option>`).join('')}</select>
        <div class="sd-photo-actions"><button class="btn secondary small" type="submit">Save</button>
        <button class="sd-iconbtn" formaction="/dashboard/shop/photos/${Number(ph.id)}/move?dir=up" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">↑</button>
        <button class="sd-iconbtn" formaction="/dashboard/shop/photos/${Number(ph.id)}/move?dir=down" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="Move later">↓</button>
        <button class="sd-textbtn sd-danger" formaction="/dashboard/shop/photos/${Number(ph.id)}/delete" data-confirm="Delete this photo?">Delete</button></div>
      </form></li>`).join('')}</ul>` : '<div class="sd-empty"><p>No photos yet. Pages with four or more photos get noticeably more clicks.</p></div>'}`;
}

function serviceForm(shop, csrf, s, categories, action, submit) {
  const cats = categories.length ? categories : Object.keys(SHOP_CATEGORY_LABELS);
  return `<form method="POST" action="${action}" class="sd-service-form">${csrfField(csrf)}${shopField(shop)}
    <div class="sd-row">${field('Service name', text('name', s.name, 'maxlength="120" required placeholder="Men’s haircut"'))}
      ${field('Category', `<select name="category"><option value="">General</option>${cats.map((c) => `<option value="${c}"${s.category === c ? ' selected' : ''}>${e(shopCategoryLabel(c))}</option>`).join('')}</select>`)}</div>
    <div class="sd-row sd-row-3">${field('Price <span class="sd-opt">optional</span>', `<div class="sd-prefix"><span>$</span>${text('price', s.price_cents != null ? (s.price_cents % 100 ? (s.price_cents / 100).toFixed(2) : s.price_cents / 100) : '', 'inputmode="decimal" maxlength="10" placeholder="45"')}</div>`)}
      ${field('Price shown as', `<select name="price_type"><option value="fixed"${s.price_type !== 'from' ? ' selected' : ''}>Exact price</option><option value="from"${s.price_type === 'from' ? ' selected' : ''}>Starting at</option></select>`)}
      ${field('Duration <span class="sd-opt">minutes</span>', text('duration', s.duration_minutes || '', 'inputmode="numeric" maxlength="4" placeholder="45"'))}</div>
    ${field('Description <span class="sd-opt">optional</span>', `<textarea name="description" rows="2" maxlength="500">${v(s.description)}</textarea>`)}
    <button class="btn${submit === 'Add service' ? '' : ' secondary'} small" type="submit">${submit}</button></form>`;
}
function servicesSection(shop, csrf, services, categories) {
  const groups = P.groupServices(services);
  return `<div class="sd-card sd-card-quiet"><h3>Add a service</h3>${serviceForm(shop, csrf, {}, categories, '/dashboard/shop/services', 'Add service')}</div>
    ${services.length ? groups.map((g) => `<h3 class="sd-group-title">${e(g.label)}</h3><ul class="sd-services">${g.items.map((s) => {
      const i = services.indexOf(s);
      return `<li><details><summary><span class="sd-svc-name">${e(s.name)}</span><span class="sd-svc-meta">${[P.formatPrice(s) || 'No price listed', P.formatDuration(s.duration_minutes)].filter(Boolean).join(' · ')}</span><span class="sd-svc-edit">Edit</span></summary>
        ${serviceForm(shop, csrf, s, categories, `/dashboard/shop/services/${Number(s.id)}`, 'Save changes')}
        <form method="POST" class="sd-inline-form sd-svc-tools">${csrfField(csrf)}${shopField(shop)}
          <button class="sd-iconbtn" formaction="/dashboard/shop/services/${Number(s.id)}/move?dir=up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="sd-iconbtn" formaction="/dashboard/shop/services/${Number(s.id)}/move?dir=down" ${i === services.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="sd-textbtn sd-danger" formaction="/dashboard/shop/services/${Number(s.id)}/delete" data-confirm="Delete ${v(s.name)}?">Delete</button></form></details></li>`;
    }).join('')}</ul>`).join('') : '<div class="sd-empty"><p>No services yet. Add what you offer; prices and durations are optional and only shown as you enter them.</p></div>'}`;
}

function teamSection(shop, csrf, team, inviteLinks, sponsorship) {
  const accepted = team.filter((m) => m.status === 'accepted'), pending = team.filter((m) => m.status === 'pending');
  const requests = team.filter((m) => m.status === 'requested'), recent = team.filter((m) => ['left', 'removed'].includes(m.status));
  const proLabel = (c) => require('./pro-categories').PROFESSIONAL_CATEGORIES.find((x) => x.value === c)?.label || '';
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  return `<div class="sd-card sd-invite"><h3>Invite your team</h3><p>Add your professionals’ email addresses. Each gets a secure link to connect their own GoBookr profile to your page. Joining is free for them and never changes their plan.</p>
    <form method="POST" action="/dashboard/shop/invites">${csrfField(csrf)}${shopField(shop)}<label class="sd-label" for="invite-emails">Email addresses</label><textarea id="invite-emails" name="emails" rows="3" placeholder="alex@example.com, sam@example.com" required></textarea><p class="sd-help">Separate with commas or new lines. Up to 25 at a time.</p><button class="btn" type="submit">Send invitations</button></form></div>
    ${inviteLinks && inviteLinks.length ? `<div class="sd-card sd-links" role="status"><h3>Invitation links</h3><p class="sd-help">${inviteLinks.some((l) => l.emailed) ? 'We emailed these invitations. ' : ''}You can also copy a link and send it yourself. Links are shown once.</p><ul>${inviteLinks.map((l) => `<li><span>${e(l.email)}</span><input readonly value="${v(l.link)}" aria-label="Invitation link for ${v(l.email)}"><button type="button" class="btn secondary small" data-copy>Copy</button></li>`).join('')}</ul></div>` : ''}
    ${requests.length ? `<h3 class="sd-group-title">Requests to join (${requests.length})</h3><ul class="sd-people">${requests.map((m) => `<li><span class="sd-avatar">${P.publicUrl(m.profile_photo_url) ? `<img src="${v(P.publicUrl(m.profile_photo_url))}" alt="">` : e(m.initials || 'GB')}</span><span><strong><a class="sd-link" href="/pro/${Number(m.pro_id)}" target="_blank" rel="noopener">${e(m.business_name || m.email)}</a></strong><small>${e(proLabel(m.category))} · asked ${e(day(m.invited_at))}</small></span>
      <form method="POST" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="btn small" formaction="/dashboard/shop/requests/${Number(m.id)}/approve">Approve</button><button class="sd-textbtn" formaction="/dashboard/shop/requests/${Number(m.id)}/decline">Decline</button></form></li>`).join('')}</ul><p class="sd-help">Approving adds them to your page. They asked to join, so their consent is already given.</p>` : ''}
    <h3 class="sd-group-title">On your page (${accepted.length})</h3>
    ${accepted.length ? `<ul class="sd-people">${accepted.map((m) => `<li><span class="sd-avatar">${P.publicUrl(m.profile_photo_url) ? `<img src="${v(P.publicUrl(m.profile_photo_url))}" alt="">` : e(m.initials || 'GB')}</span><span><strong>${e(m.business_name || m.email)}</strong><small>${e(require('./pro-categories').PROFESSIONAL_CATEGORIES.find((c) => c.value === m.category)?.label || '')}</small></span>
      <form method="POST" action="/dashboard/shop/members/${Number(m.id)}/remove" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="sd-textbtn sd-danger" data-confirm="Remove ${v(m.business_name || m.email)} from your page?">Remove</button></form></li>`).join('')}</ul>` : '<p class="sd-help">No one has joined yet. Only professionals who accept your invitation appear on your page.</p>'}
    ${pending.length ? `<h3 class="sd-group-title">Pending invitations (${pending.length})</h3><ul class="sd-people">${pending.map((m) => { const expired = new Date(m.expires_at) < new Date(); return `<li><span class="sd-avatar">@</span><span><strong>${e(m.email)}</strong><small>${expired ? 'Expired' : 'Expires ' + e(new Date(m.expires_at).toISOString().slice(0, 10))}</small></span>
      <form method="POST" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="btn secondary small" formaction="/dashboard/shop/invites/${Number(m.id)}/resend">Resend</button><button class="sd-textbtn sd-danger" formaction="/dashboard/shop/invites/${Number(m.id)}/cancel">Cancel</button></form></li>`; }).join('')}</ul>` : ''}
    ${recent.length ? `<h3 class="sd-group-title">Recent changes</h3><ul class="sd-people sd-people-quiet">${recent.map((m) => `<li><span class="sd-avatar">${e(m.initials || 'GB')}</span><span><strong>${e(m.business_name || m.email)}</strong><small>${m.status === 'left' ? 'Left your team' : 'Removed from your page'} on ${e(day(m.ended_at))}</small></span><span></span></li>`).join('')}</ul><p class="sd-help">Professionals own their GoBookr profiles and can change workplaces at any time. Removing someone only takes them off your page; it never affects their account, portfolio or subscription.</p>` : ''}
    ${sponsorship ? '<div class="sd-card sd-card-quiet"><h3>Optional: sponsor memberships</h3><p class="sd-help">You can choose to pay for your team’s GoBookr Professional memberships. This is separate from your free business page and nothing is charged unless you start it.</p><a class="btn secondary small" href="/dashboard/shop/team">Review sponsorship</a></div>' : ''}`;
}

// ---- shell, navigation and pages ------------------------------------------------------------------------------
const UI = require('./dashboard-ui');
const { icon } = UI;

const SECTION_META = {
  overview: { label: 'Dashboard', title: 'Dashboard' },
  profile: { label: 'Business profile', title: 'Business profile', description: 'Your name, the services you offer and the story customers read first.' },
  photos: { label: 'Photos & branding', title: 'Photos & branding', description: 'Your logo, cover photo and gallery. Only use photos you took or have the rights to share.' },
  services: { label: 'Services & pricing', title: 'Services & pricing', description: 'What you offer. Prices and durations are optional and appear only as you enter them.' },
  team: { label: 'Team & invitations', title: 'Team & invitations', description: 'Invite your professionals, review requests to join and manage who appears on your page.' },
  settings: { label: 'Business settings', title: 'Business settings', description: 'Address, contact details, hours, links and whether your full page is published.' },
  analytics: { label: 'Analytics', title: 'Analytics', description: 'Visits to your public business page and clicks on its Book button.' },
  hiring: { label: 'Hiring / Business Pro', title: 'Hiring / Business Pro', description: 'Job posts and applicant tools for your business.' },
  merch: { label: 'Merch Studio', title: 'Merch Studio', description: 'Business cards, stickers and team apparel with your branding.' },
  account: { label: 'Account settings', title: 'Account settings', description: 'The GoBookr login that manages this business.' },
};
const TAB_IDS = Object.keys(SECTION_META);
const TABS = TAB_IDS.map((id) => [id, SECTION_META[id].label]);
const link = (shop, tab) => '/dashboard/shop' + q(shop, tab === 'overview' ? '' : `&tab=${tab}`);

function nav(shop, data, active) {
  const requests = data.team.filter((m) => m.status === 'requested').length;
  const flags = data.flags || {};
  const manage = [
    { key: 'profile', label: 'Business profile', icon: 'store' },
    { key: 'photos', label: 'Photos & branding', icon: 'image' },
    { key: 'services', label: 'Services & pricing', icon: 'scissors' },
    { key: 'team', label: 'Team & invitations', icon: 'users', soon: requests ? String(requests) : '' },
    { key: 'settings', label: 'Business settings', icon: 'sliders' },
  ];
  const growth = [
    { key: 'analytics', label: 'Analytics', icon: 'chart' },
    { key: 'hiring', label: 'Hiring / Business Pro', icon: 'briefcase', soon: flags.hiring ? '' : 'Soon' },
    { key: 'merch', label: 'Merch Studio', icon: 'shirt', soon: flags.merch ? '' : 'Soon' },
  ];
  const account = [
    data.pro ? { key: 'pro', label: 'Switch to my pro dashboard', href: '/dashboard/pro', icon: 'switch' } : null,
    { key: 'public', label: 'View public page', href: `/shop/${Number(shop.id)}`, icon: 'eye', external: true },
    { key: 'account', label: 'Account settings', icon: 'account' },
    { key: 'logout', label: 'Log out', href: '/logout', icon: 'logout', form: csrfField(data.csrf) },
  ].filter(Boolean);
  const withHref = (items) => items.map((i) => ({ ...i, href: i.href || link(shop, i.key) }));
  return UI.sidebar({
    label: 'Business dashboard',
    active,
    switcher: UI.workspaceSwitch({ active: 'business',
      business: { name: shop.name, href: link(shop, 'overview'), logo: P.publicUrl(shop.logo_url) },
      pro: data.pro ? { name: data.pro.business_name || 'My pro profile', href: '/dashboard/pro', photo: P.publicUrl(data.pro.profile_photo_url) } : null }),
    groups: [
      { label: 'Overview', items: withHref([{ key: 'overview', label: 'Dashboard', icon: 'dashboard' }]) },
      { label: 'Manage business', items: withHref(manage) },
      { label: 'Growth', items: withHref(growth) },
      { label: 'Account', items: withHref(account) },
    ],
  });
}

const fmtDate = (d) => (d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' }).format(new Date(d)) : '');
function relative(d) {
  const t = new Date(d).getTime(); if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60); if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24); if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return fmtDate(d);
}
const count = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);

function greeting(name) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Denver' }).format(new Date()));
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

// The overview's one bold moment: who you are managing, its status, and what to do next.
function identity(shop, data) {
  const logo = P.publicUrl(shop.logo_url);
  const place = [shop.neighborhood, shop.city, shop.state].filter(Boolean).join(', ');
  const picker = data.shops.length > 1 ? `<form method="GET" action="/dashboard/shop" class="gbd-picker"><label class="gbd-visually-hidden" for="shop-picker">Switch business</label><select id="shop-picker" name="shop" onchange="this.form.submit()">${data.shops.map((s) => `<option value="${Number(s.id)}"${Number(s.id) === Number(shop.id) ? ' selected' : ''}>${e(s.name)} · ${e(s.city)}</option>`).join('')}</select></form>` : '';
  const c = data.completion;
  return `<section class="gbd-hero">
    <div class="gbd-hero-main">
      <p class="gbd-hero-greeting">${e(greeting(data.user && data.user.name))}</p>
      <div class="gbd-identity-main">
        <span class="gbd-identity-logo">${logo ? `<img src="${v(logo)}" alt="${v(shop.name)} logo">` : e(UI.initials(shop.name))}</span>
        <div class="gbd-identity-text">
          <h1>${e(shop.name)}</h1>
          <p class="gbd-identity-meta">${place ? `<span>${icon('pin', 15)}${e(place)}</span>` : ''}
            ${UI.badge('Verified owner', 'verified')}
            ${shop.profile_published_at ? UI.badge('Published', 'live') : UI.badge('Not published', 'neutral')}</p>
        </div>
      </div>
      <div class="gbd-identity-actions">${picker}
        <a class="btn" href="${link(shop, 'profile')}">${icon('pencil', 16)}<span>Edit business</span></a>
        <a class="btn gbd-btn-ghost" href="/shop/${Number(shop.id)}" target="_blank" rel="noopener">${icon('external', 16)}<span>View public page</span></a>
      </div>
    </div>
    <a class="gbd-hero-score" href="/dashboard/shop${q(shop, `&step=${data.suggestedStep}`)}">
      ${UI.ring(c.percent, { size: 72, stroke: 7, label: 'Profile strength' })}
      <span><strong>Profile strength</strong><small>${c.next.length ? `${c.next.length} step${c.next.length === 1 ? '' : 's'} to a complete page` : 'Complete'}</small></span>
    </a>
  </section>`;
}

const ITEM_TAB = { basics: 'settings', links: 'settings', hours: 'settings', logo: 'photos', cover: 'photos', about: 'profile', services: 'services', photos: 'photos', team: 'team', publish: 'settings' };

function overview(shop, data) {
  const c = data.completion, a = data.analytics;
  const accepted = data.team.filter((m) => m.status === 'accepted').length;
  const since = a.firstAt ? `since ${fmtDate(a.firstAt)}` : 'Tracking started Nov 25, 2026';
  const views = (a.series || []).map((d) => d.views), clicks = (a.series || []).map((d) => d.clicks);
  const stats = `<div class="gbd-stats">
    ${UI.stat({ label: 'Profile views', value: a.ok ? count(a.views30) : '—', note: a.ok ? (a.viewsAll ? `Last 30 days · ${since}` : 'No visits recorded yet') : 'Unavailable right now', iconName: 'eye', href: link(shop, 'analytics'), chart: a.ok ? UI.sparkline(views, { label: 'Profile views' }) : '' })}
    ${UI.stat({ label: 'Booking link clicks', value: a.ok ? count(a.clicks30) : '—', note: !shop.booking_url ? 'Add a booking link to start counting' : a.ok ? (a.clicksAll ? 'Last 30 days' : 'No clicks recorded yet') : 'Unavailable right now', iconName: 'click', href: link(shop, 'analytics'), chart: a.ok ? UI.sparkline(clicks, { label: 'Booking link clicks' }) : '' })}
    ${UI.stat({ label: 'Team members', value: count(accepted), note: data.pendingInvites ? `${data.pendingInvites} invitation${data.pendingInvites === 1 ? '' : 's'} pending` : 'On your public page', iconName: 'users', href: link(shop, 'team') })}
    ${UI.stat({ label: 'Profile completeness', value: `${c.percent}%`, note: `${c.items.length - c.next.length} of ${c.items.length} steps done`, iconName: 'gauge', chart: `<span class="gbd-mini-progress" aria-hidden="true"><span style="width:${c.percent}%"></span></span>` })}
  </div>`;

  const todo = c.items.filter((i) => !i.done), done = c.items.filter((i) => i.done);
  const first = todo[0];
  const checklist = todo.length ? UI.card({ title: 'Finish your page', description: 'Complete pages earn more trust and more bookings.', className: 'gbd-checklist-card',
    action: `<span class="gbd-count">${done.length}/${c.items.length}</span>`,
    body: `<a class="gbd-nextup" href="${link(shop, ITEM_TAB[first.key] || 'profile')}">
        <span class="gbd-nextup-icon">${icon('sparkles', 18)}</span>
        <span class="gbd-nextup-text"><small>Next up</small><strong>${e(first.label)}</strong></span>
        <span class="gbd-nextup-go">${icon('arrow', 18)}</span></a>
      <ul class="gbd-checklist">${todo.slice(1).map((i) => `<li><a href="${link(shop, ITEM_TAB[i.key] || 'profile')}">${icon('circle', 18)}<span>${e(i.label)}</span>${icon('chevron', 16)}</a></li>`).join('')}${done.map((i) => `<li class="is-done">${icon('check', 18)}<span>${e(i.label)}</span></li>`).join('')}</ul>
      <a class="gbd-textlink" href="/dashboard/shop${q(shop, `&step=${data.suggestedStep}`)}">${c.percent > 10 ? 'Continue guided setup' : 'Start guided setup'} ${icon('arrow', 16)}</a>` })
    : '';
  const tiles = [
    ['image', 'Add photos', 'Show your space and your work', 'photos'],
    ['scissors', 'Edit services', 'Prices, durations and order', 'services'],
    ['users', 'Invite your team', 'Professionals join for free', 'team'],
    ['chart', 'See analytics', 'Visits and booking clicks', 'analytics'],
  ];
  const quick = UI.card({ title: todo.length ? 'Quick actions' : 'Your page is complete', description: todo.length ? '' : 'Keep photos and services fresh so customers see what you offer today.',
    body: `<div class="gbd-tiles">${tiles.map(([ic, t, d, tab]) => `<a class="gbd-tile" href="${link(shop, tab)}"><span class="gbd-tile-icon">${icon(ic, 18)}</span><span><strong>${t}</strong><small>${d}</small></span></a>`).join('')}</div>` });

  const activity = UI.card({ title: 'Recent activity', description: 'Changes to your page and your team.',
    body: data.activity.length ? `<ol class="gbd-activity gbd-timeline">${data.activity.slice(0, 8).map((x) => `<li><span class="gbd-activity-icon">${icon(x.icon, 15)}</span><span class="gbd-activity-text">${e(x.text)}</span><time datetime="${v(new Date(x.at).toISOString())}">${e(relative(x.at))}</time></li>`).join('')}</ol>`
      : UI.emptyState({ iconName: 'activity', title: 'Nothing here yet', text: 'Edits, new photos and team changes will show up here as they happen.' }) });

  const url = 'https://gobookr.com/shop/' + Number(shop.id);
  const share = UI.card({ title: 'Share your page', description: 'Add it to your Instagram bio and Google Business Profile.',
    body: `<div class="gbd-copy"><input readonly value="${v(url)}" aria-label="Your page link"><button type="button" class="btn secondary small" data-copy>${icon('link', 16)}<span>Copy link</span></button></div>
      <p class="gbd-footnote">${shop.profile_published_at ? 'Your full page is live.' : `Customers see your basic listing until you <a href="${link(shop, 'settings')}#publish">publish</a>.`} Your business page is free. There is no subscription for businesses.</p>` });

  return `${identity(shop, data)}${stats}<div class="gbd-columns"><div class="gbd-stack">${todo.length ? checklist : quick}${share}</div>${activity}</div>`;
}

function bars(series, key, label) {
  const max = Math.max(1, ...series.map((d) => d[key]));
  return `<figure class="gbd-chart"><figcaption>${e(label)} per day</figcaption>
    <div class="gbd-bars" role="img" aria-label="${e(label)} per day for the last 30 days">${series.map((d) => `<span class="gbd-bar" style="--h:${Math.round((100 * d[key]) / max)}%" title="${e(fmtDate(d.day + 'T12:00:00Z'))}: ${d[key]}"></span>`).join('')}</div>
    <div class="gbd-chart-axis"><span>${e(fmtDate(series[0].day + 'T12:00:00Z'))}</span><span>Today</span></div></figure>`;
}

function analyticsPage(shop, data) {
  const a = data.analytics;
  if (!a.ok) return UI.card({ body: UI.emptyState({ iconName: 'chart', title: 'Analytics are unavailable right now', text: 'Nothing is lost. Try again in a few minutes.' }) });
  const stats = `<div class="gbd-stats">
    ${UI.stat({ label: 'Profile views · 7 days', value: count(a.views7), iconName: 'eye' })}
    ${UI.stat({ label: 'Profile views · 30 days', value: count(a.views30), iconName: 'eye' })}
    ${UI.stat({ label: 'Booking clicks · 7 days', value: count(a.clicks7), iconName: 'click' })}
    ${UI.stat({ label: 'Booking clicks · 30 days', value: count(a.clicks30), iconName: 'click' })}
  </div>`;
  const body = a.viewsAll + a.clicksAll === 0
    ? UI.emptyState({ iconName: 'chart', title: 'No visits recorded yet', text: 'Tracking for business pages started on Nov 25, 2026. Share your page link and visits will appear here within minutes.', action: `<a class="btn secondary small" href="${link(shop, 'overview')}">Get your page link</a>` })
    : `<div class="gbd-charts">${bars(a.series, 'views', 'Profile views')}${bars(a.series, 'clicks', 'Booking clicks')}</div>
       <details class="gbd-table-details"><summary>View daily numbers</summary><div class="gbd-table-wrap"><table class="gbd-table"><thead><tr><th scope="col">Day</th><th scope="col">Profile views</th><th scope="col">Booking clicks</th></tr></thead><tbody>${a.series.slice().reverse().map((d) => `<tr><td>${e(fmtDate(d.day + 'T12:00:00Z'))}</td><td>${d.views}</td><td>${d.clicks}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `${stats}${UI.card({ title: 'Last 30 days', description: `Visits to your public page and clicks on its Book button. Your own visits and search-engine crawlers are not counted.${a.firstAt ? ` Recording since ${fmtDate(a.firstAt)}.` : ''}`, body })}
    <p class="gbd-footnote">These are business page numbers only. Your personal professional profile has its own analytics in your pro dashboard.</p>`;
}

function comingSoon(shop, data, kind) {
  const enabled = kind === 'merch' ? data.flags.merch : data.flags.hiring;
  if (enabled) {
    const href = kind === 'merch' ? '/merch' : '/dashboard/shop' + q(shop, '&tab=hiring');
    return UI.card({ body: UI.emptyState({ iconName: kind === 'merch' ? 'shirt' : 'briefcase', title: kind === 'merch' ? 'Open Merch Studio' : 'Hiring tools', text: 'Available for your business.', action: `<a class="btn" href="${href}">Open</a>` }) });
  }
  const text = kind === 'merch'
    ? 'Design business cards, stickers and team shirts from your logo. Merch Studio is being prepared and is not open yet. Nothing is charged and no orders are placed from GoBookr today.'
    : 'Post openings for chairs and stations, receive applications from professionals and message candidates. Hiring tools are being prepared and are not open yet. Nothing here is charged.';
  return UI.card({ body: UI.emptyState({ iconName: kind === 'merch' ? 'shirt' : 'briefcase', title: 'Not available yet', text }) });
}

function accountPage(shop, data) {
  const u = data.user || {};
  return `${UI.card({ title: 'Login', description: 'This account owns the business. Ownership changes go through GoBookr support.',
    body: `<dl class="gbd-dl"><div><dt>Email</dt><dd>${e(u.email || '')}</dd></div><div><dt>Name</dt><dd>${e(u.name || '')}</dd></div><div><dt>Manages</dt><dd>${e(shop.name)}</dd></div></dl>` })}
    ${UI.card({ title: 'Password', description: 'For your security we send a one-time link to your email. It works once and expires in 1 hour.',
      body: `<a class="btn secondary" href="/forgot-password">${icon('key', 16)}<span>Change password</span></a>` })}
    ${data.pro ? UI.card({ title: 'Personal professional profile', description: `${e(data.pro.business_name || 'Your pro profile')} has its own dashboard, analytics and $20/month professional plan, separate from this business.`,
      body: `<a class="btn secondary" href="/dashboard/pro">${icon('switch', 16)}<span>Switch to my pro dashboard</span></a>` }) : ''}
    ${UI.card({ title: 'Sign out', body: `<form method="POST" action="/logout">${csrfField(data.csrf)}<button class="btn secondary" type="submit">${icon('logout', 16)}<span>Log out</span></button></form>` })}`;
}

function publishPanel(shop, csrf) {
  return `<section class="gbd-card sd-publish" id="publish"><div class="gbd-card-head"><div><h2>${shop.profile_published_at ? 'Your page is live' : 'Publish your page'}</h2>
    <p>${shop.profile_published_at ? 'Changes you save appear on your public page right away.' : 'Until you publish, customers see your basic listing: name, address and contact details. Preview it first, then publish.'}</p></div></div>
    <div class="sd-actions"><a class="btn secondary" href="/shop/${Number(shop.id)}?preview=1" target="_blank" rel="noopener">${icon('eye', 16)}<span>Preview your page</span></a>
    ${shop.profile_published_at ? `<form method="POST" action="/dashboard/shop/unpublish" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="sd-textbtn" data-confirm="Hide photos, services and team from your public page?">Unpublish</button></form>` : `<form method="POST" action="/dashboard/shop/publish" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="btn" type="submit">Publish my page</button></form>`}</div>
    <p class="sd-help">Your business page is free. There is no subscription for businesses.</p></section>`;
}

function profileForm(shop, csrf, section, inner, submit = 'Save changes', next = '') {
  return `<form method="POST" action="/dashboard/shop/profile" class="sd-form" novalidate>${csrfField(csrf)}${shopField(shop)}<input type="hidden" name="section" value="${section}">${next ? `<input type="hidden" name="next" value="${v(next)}">` : ''}${inner}<div class="sd-savebar"><button class="btn" type="submit">${submit}</button></div></form>`;
}

function tabContent(tab, shop, data) {
  const { csrf } = data;
  switch (tab) {
    case 'profile': return profileForm(shop, csrf, 'profile', `<fieldset class="sd-group"><legend>Name and services</legend>${field('Business name', text('name', shop.name, 'maxlength="160" required'))}${field('Tagline <span class="sd-opt">optional</span>', text('tagline', shop.tagline, 'maxlength="120"'))}<div class="sd-field"><span class="sd-label">Services you offer</span><div class="sd-checks">${CATEGORY_CHOICES.map(([value, label]) => `<label class="sd-check"><input type="checkbox" name="category_${value}" value="1"${data.profile.categories.includes(value) ? ' checked' : ''}><span>${e(label)}</span></label>`).join('')}</div><p class="sd-help">Customers find you when they search these services.</p></div></fieldset>${aboutSection(shop)}`);
    case 'photos': return `<div class="gbd-two">${brandingSection(shop, csrf)}</div><fieldset class="sd-group"><legend>Gallery</legend>${photosSection(shop, csrf, data.profile.photos)}</fieldset>`;
    case 'services': return servicesSection(shop, csrf, data.profile.services, data.profile.categories);
    case 'team': return teamSection(shop, csrf, data.team, data.inviteLinks, data.sponsorship);
    case 'settings': return `${profileForm(shop, csrf, 'settings', `${locationSection(shop)}${hoursSection(shop)}${linksSection(shop)}`)}${publishPanel(shop, csrf)}`;
    case 'analytics': return analyticsPage(shop, data);
    case 'hiring': return comingSoon(shop, data, 'hiring');
    case 'merch': return comingSoon(shop, data, 'merch');
    case 'account': return accountPage(shop, data);
    default: return overview(shop, data);
  }
}

function stepContent(step, shop, data) {
  const { csrf } = data;
  const nextHref = (n) => '/dashboard/shop' + q(shop, `&step=${n}`);
  const stepNav = (n, label = 'Continue') => `<div class="sd-stepnav">${n > 2 ? `<a class="sd-textbtn" href="${nextHref(n - 2)}">Back</a>` : '<span></span>'}<a class="btn" href="${nextHref(n)}">${label}</a></div>`;
  switch (step) {
    case 1: return profileForm(shop, csrf, 'setup1', `${infoSection(shop, data.profile.categories)}${hoursSection(shop)}`, 'Save and continue', nextHref(2));
    case 2: return `<div class="gbd-two">${brandingSection(shop, csrf)}</div>${profileForm(shop, csrf, 'about', aboutSection(shop), 'Save and continue', nextHref(3))}`;
    case 3: return `${servicesSection(shop, csrf, data.profile.services, data.profile.categories)}${stepNav(4)}`;
    case 4: return `${photosSection(shop, csrf, data.profile.photos)}${stepNav(5)}`;
    case 5: return `${teamSection(shop, csrf, data.team, data.inviteLinks, data.sponsorship)}${stepNav(6)}`;
    default: return `${UI.card({ title: 'Checklist', body: `<ul class="gbd-checklist">${data.completion.items.filter((i) => i.key !== 'publish').map((i) => `<li class="${i.done ? 'is-done' : ''}">${icon(i.done ? 'check' : 'circle', 18)}<span>${e(i.label)}</span></li>`).join('')}</ul>` })}${publishPanel(shop, csrf)}<div class="sd-stepnav"><a class="sd-textbtn" href="${nextHref(5)}">Back</a><a class="sd-textbtn" href="${link(shop, 'overview')}">Go to dashboard</a></div>`;
  }
}

function page({ shop, shops, tab, step, data }) {
  data = { ...data, shops: shops || [shop], flags: data.flags || {}, analytics: data.analytics || { ok: false, series: [] }, activity: data.activity || [] };
  const active = step ? 'overview' : tab;
  const meta = SECTION_META[active] || SECTION_META.overview;
  let content;
  if (step) {
    content = `${UI.pageHeader({ title: `Set up ${shop.name}`, description: `Step ${step} of ${STEPS.length}: ${e(STEPS[step - 1][1])}`, actions: `<a class="btn secondary" href="${link(shop, 'overview')}">Exit setup</a>` })}
      <nav class="sd-steps" aria-label="Setup steps"><ol>${STEPS.map(([n, label]) => `<li class="${n === step ? 'is-current' : n < step ? 'is-past' : ''}"><a href="/dashboard/shop${q(shop, `&step=${n}`)}"${n === step ? ' aria-current="step"' : ''}><span class="sd-step-n">${n}</span><span class="sd-step-l">${label}</span></a></li>`).join('')}</ol></nav>
      ${stepContent(step, shop, data)}`;
  } else if (active === 'overview') {
    content = overview(shop, data);
  } else {
    const actions = { profile: 'preview', photos: 'preview', services: 'preview', team: 'preview', settings: 'preview' }[active]
      ? `<a class="btn secondary" href="/shop/${Number(shop.id)}?preview=1" target="_blank" rel="noopener">${icon('eye', 16)}<span>Preview page</span></a>` : '';
    content = `${UI.pageHeader({ title: meta.title, description: meta.description || '', actions })}${tabContent(active, shop, data)}`;
  }
  const sidebarHtml = nav(shop, data, active);
  return `<link rel="stylesheet" href="/shop-dashboard.css?v=3">${UI.shell({ sidebarHtml, mobileTitle: step ? 'Setup' : meta.label, mobileContext: shop.name,
    mobileAction: `<a class="gbd-iconbtn" href="/shop/${Number(shop.id)}" target="_blank" rel="noopener" aria-label="View public page">${icon('external', 18)}</a>`,
    content: `<div class="sd gbd-content">${content}</div>` })}<script src="/shop-dashboard.js?v=1" defer></script>`;
}

module.exports = { page, TABS, STEPS, SECTION_META };
