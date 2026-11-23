'use strict';
// Owner dashboard + guided setup for claimed business pages. Pure rendering; routes load the data.
const { escapeHtml: e } = require('./util');
const { SHOP_CATEGORY_LABELS, shopCategoryLabel } = require('./shop-categories');
const P = require('./shop-profile');

const TABS = [['overview', 'Overview'], ['profile', 'Edit profile'], ['photos', 'Photos'], ['services', 'Services'], ['team', 'Team'], ['hiring', 'Hiring'], ['settings', 'Business settings'], ['pro', 'Business Pro']];
// Hiring and Business Pro tabs exist only when Career Studio is switched on.
const careerOn = () => process.env.CAREER_STUDIO_ENABLED === '1';
const visibleTabs = () => TABS.filter(([id]) => careerOn() || !['hiring', 'pro'].includes(id));
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

function overview(shop, data) {
  const c = data.completion;
  const url = 'https://gobookr.com/shop/' + Number(shop.id);
  const stepHref = (i) => '/dashboard/shop' + q(shop, i.step === 6 ? '&step=6' : `&tab=${{ 1: i.key === 'basics' || i.key === 'links' || i.key === 'hours' ? 'settings' : 'profile', 2: 'profile', 3: 'services', 4: 'photos', 5: 'team' }[i.step]}`);
  return `<div class="sd-grid">
    <div class="sd-card"><div class="sd-progress-head"><h3>Profile strength</h3><strong>${c.percent}%</strong></div><div class="sd-progress" role="progressbar" aria-valuenow="${c.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${c.percent}%"></span></div>
      ${c.next.length ? `<ul class="sd-todo">${c.next.slice(0, 5).map((i) => `<li><a href="${stepHref(i)}">${e(i.label)}</a></li>`).join('')}</ul>` : '<p class="sd-help">Your page is complete. Keep photos and services fresh.</p>'}</div>
    <div class="sd-card"><h3>Share your page</h3><p class="sd-help">Your free GoBookr page. Add it to your Instagram bio and Google Business Profile.</p><div class="sd-copy"><input readonly value="${v(url)}" aria-label="Your page link"><button type="button" class="btn secondary small" data-copy>Copy link</button></div>
      <dl class="sd-stats"><div><dt>Services</dt><dd>${data.profile.services.length}</dd></div><div><dt>Photos</dt><dd>${data.profile.photos.length}</dd></div><div><dt>Team</dt><dd>${data.profile.team.length}</dd></div><div><dt>Invites</dt><dd>${data.pendingInvites}</dd></div></dl></div>
  </div>`;
}

function publishPanel(shop, csrf) {
  return `<div class="sd-card sd-publish"><h3>${shop.profile_published_at ? 'Your page is live' : 'Ready when you are'}</h3>
    <p>${shop.profile_published_at ? 'Changes you save appear on your public page right away.' : 'Until you publish, customers see your basic listing (name, address and contact details). Preview it first, then publish.'}</p>
    <div class="sd-actions"><a class="btn secondary" href="/shop/${Number(shop.id)}?preview=1" target="_blank" rel="noopener">Preview your page</a>
    ${shop.profile_published_at ? `<form method="POST" action="/dashboard/shop/unpublish" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="sd-textbtn" data-confirm="Hide photos, services and team from your public page?">Unpublish</button></form>` : `<form method="POST" action="/dashboard/shop/publish" class="sd-inline-form">${csrfField(csrf)}${shopField(shop)}<button class="btn" type="submit">Publish my page</button></form>`}</div>
    <p class="sd-help">Your business page is free${careerOn() ? ' and stays free. Business Pro is an optional add-on for hiring.' : '. There is no subscription for businesses.'}</p></div>`;
}

function profileForm(shop, csrf, section, inner, submit = 'Save changes', next = '') {
  return `<form method="POST" action="/dashboard/shop/profile" class="sd-form" novalidate>${csrfField(csrf)}${shopField(shop)}<input type="hidden" name="section" value="${section}">${next ? `<input type="hidden" name="next" value="${v(next)}">` : ''}${inner}<div class="sd-savebar"><button class="btn" type="submit">${submit}</button></div></form>`;
}

function tabContent(tab, shop, data) {
  const { csrf } = data;
  switch (tab) {
    case 'profile': return `${brandingSection(shop, csrf)}${profileForm(shop, csrf, 'profile', `<fieldset class="sd-group"><legend>Name and services</legend>${field('Business name', text('name', shop.name, 'maxlength="160" required'))}${field('Tagline <span class="sd-opt">optional</span>', text('tagline', shop.tagline, 'maxlength="120"'))}<div class="sd-field"><span class="sd-label">Services you offer</span><div class="sd-checks">${CATEGORY_CHOICES.map(([value, label]) => `<label class="sd-check"><input type="checkbox" name="category_${value}" value="1"${data.profile.categories.includes(value) ? ' checked' : ''}><span>${e(label)}</span></label>`).join('')}</div></div></fieldset>${aboutSection(shop)}`)}`;
    case 'photos': return photosSection(shop, csrf, data.profile.photos);
    case 'services': return servicesSection(shop, csrf, data.profile.services, data.profile.categories);
    case 'team': return teamSection(shop, csrf, data.team, data.inviteLinks, data.sponsorship);
    case 'hiring': case 'pro': return data.panel || '';
    case 'settings': return `${profileForm(shop, csrf, 'settings', `${locationSection(shop)}${hoursSection(shop)}${linksSection(shop)}`)}${publishPanel(shop, csrf)}`;
    default: return `${overview(shop, data)}${publishPanel(shop, csrf)}`;
  }
}

function stepContent(step, shop, data) {
  const { csrf } = data;
  const nextHref = (n) => '/dashboard/shop' + q(shop, `&step=${n}`);
  const nav = (n, label = 'Continue') => `<div class="sd-stepnav">${n > 2 ? `<a class="sd-textbtn" href="${nextHref(n - 2)}">Back</a>` : '<span></span>'}<a class="btn" href="${nextHref(n)}">${label}</a></div>`;
  switch (step) {
    case 1: return profileForm(shop, csrf, 'setup1', `${infoSection(shop, data.profile.categories)}${hoursSection(shop)}`, 'Save and continue', nextHref(2));
    case 2: return `${brandingSection(shop, csrf)}${profileForm(shop, csrf, 'about', aboutSection(shop), 'Save and continue', nextHref(3))}`;
    case 3: return `${servicesSection(shop, csrf, data.profile.services, data.profile.categories)}${nav(4)}`;
    case 4: return `${photosSection(shop, csrf, data.profile.photos)}${nav(5)}`;
    case 5: return `${teamSection(shop, csrf, data.team, data.inviteLinks, data.sponsorship)}${nav(6)}`;
    default: return `<div class="sd-card"><h3>Checklist</h3><ul class="sd-checklist">${data.completion.items.filter((i) => i.key !== 'publish').map((i) => `<li class="${i.done ? 'is-done' : ''}">${e(i.label)}</li>`).join('')}</ul></div>${publishPanel(shop, csrf)}<div class="sd-stepnav"><a class="sd-textbtn" href="${nextHref(5)}">Back</a><a class="sd-textbtn" href="/dashboard/shop${q(shop, '&tab=overview')}">Go to dashboard</a></div>`;
  }
}

function page({ shop, shops, tab, step, data }) {
  const status = shop.profile_published_at ? '<span class="sd-pill sd-pill-live">Published</span>' : '<span class="sd-pill">Not published</span>';
  const picker = shops.length > 1 ? `<form method="GET" action="/dashboard/shop" class="sd-picker"><label class="sd-label" for="shop-picker">Business</label><select id="shop-picker" name="shop" onchange="this.form.submit()">${shops.map((s) => `<option value="${Number(s.id)}"${Number(s.id) === Number(shop.id) ? ' selected' : ''}>${e(s.name)} · ${e(s.city)}</option>`).join('')}</select></form>` : '';
  const head = `<header class="sd-head"><div><p class="sd-crumb">Business dashboard</p><h1>${e(shop.name)}</h1><p class="sd-sub">${status}<span>${e(shop.city)}, ${e(shop.state)}</span></p></div>
    <div class="sd-head-actions">${picker}<a class="btn secondary" href="/shop/${Number(shop.id)}?preview=1" target="_blank" rel="noopener">Preview</a><a class="btn secondary" href="/shop/${Number(shop.id)}">View public page</a></div></header>`;
  const content = step
    ? `<nav class="sd-steps" aria-label="Setup steps"><ol>${STEPS.map(([n, label]) => `<li class="${n === step ? 'is-current' : n < step ? 'is-past' : ''}"><a href="/dashboard/shop${q(shop, `&step=${n}`)}"${n === step ? ' aria-current="step"' : ''}><span class="sd-step-n">${n}</span><span class="sd-step-l">${label}</span></a></li>`).join('')}</ol></nav>
       <div class="sd-step-head"><h2>${STEPS[step - 1][1]}</h2><a class="sd-textbtn" href="/dashboard/shop${q(shop, '&tab=overview')}">Exit setup</a></div>${stepContent(step, shop, data)}`
    : `<nav class="sd-tabs" aria-label="Dashboard sections">${visibleTabs().map(([id, label]) => `<a href="/dashboard/shop${q(shop, `&tab=${id}`)}"${id === tab ? ' aria-current="page"' : ''}>${label}${id === 'hiring' && data.hiringUnread ? ` <span class="sd-count">${Number(data.hiringUnread)}</span>` : ''}${id === 'pro' && data.proActive ? ' <span class="sd-count sd-count-ok">On</span>' : ''}</a>`).join('')}</nav>
       ${!shop.profile_published_at && tab === 'overview' ? `<div class="sd-banner"><div><strong>Finish setting up your page</strong><p>Six short steps: info, branding, services, photos, team, publish. It’s free.</p></div><a class="btn" href="/dashboard/shop${q(shop, `&step=${data.suggestedStep}`)}">${data.completion.percent > 10 ? 'Continue setup' : 'Start setup'}</a></div>` : ''}
       <div class="sd-content">${tabContent(tab, shop, data)}</div>`;
  return `<link rel="stylesheet" href="/shop-dashboard.css?v=3"><section class="section container sd">${head}${content}</section><script src="/shop-dashboard.js?v=1" defer></script>`;
}

module.exports = { page, TABS, STEPS };
