'use strict';
// Views for Career Studio (professionals, free) and Business Pro hiring tools (businesses, paid).
const BP = require('./business-pro');
const C = require('./career');
const { escapeHtml: e } = require('./util');
const { PROFESSIONAL_CATEGORIES } = require('./pro-categories');

const v = (x) => e(x == null ? '' : String(x));
const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${v(csrf)}">`;
const shopField = (shop) => `<input type="hidden" name="shop" value="${Number(shop.id)}">`;
const css = '<link rel="stylesheet" href="/career.css?v=4">';
const day = (d) => { if (!d) return ''; const t = new Date(typeof d === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? d.replace(' ', 'T') + 'Z' : d); return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const statusLabel = (s) => (C.STATUSES.find(([k]) => k === s) || [s, s])[1];
const workTypeLabel = (s) => (C.WORK_TYPES.find(([k]) => k === s) || ['', ''])[1];
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const nl = (t) => v(t).replace(/\n/g, '<br>');

// ---- Business Pro plan panel --------------------------------------------------------------------------------------
const STATE_COPY = {
  free: ['Free plan', 'Your business page, photos, services, team and Merch Studio stay free. Business Pro adds hiring tools.'],
  active: ['Business Pro is active', 'Your hiring tools are on.'],
  trialing: ['Business Pro is active', 'Your hiring tools are on.'],
  canceling: ['Business Pro ends soon', 'You canceled. Hiring tools stay on until the end of the paid period, then pause. Your applicants and messages are kept.'],
  past_due_grace: ['Payment failed', 'Update your card to keep hiring tools on. They pause automatically if the payment is not fixed.'],
  past_due: ['Hiring tools paused', 'Your last payment failed. Update your card to turn hiring tools back on. Nothing has been deleted.'],
  unpaid: ['Hiring tools paused', 'Business Pro is unpaid. Update your card to turn hiring tools back on. Nothing has been deleted.'],
  canceled: ['Business Pro ended', 'Hiring tools are paused. Your openings are hidden and applicants are saved. Restart any time.'],
  owner_changed: ['Hiring tools paused', 'Business Pro was set up by a previous manager of this business. Start your own subscription to use hiring tools.'],
  mode_mismatch: ['Hiring tools paused', 'This subscription belongs to a different billing environment.'],
  stale: ['Hiring tools paused', 'Your billing period ended without a renewal. Open billing to check your subscription.'],
  incomplete: ['Finishing setup', 'Stripe is still confirming your first payment.'],
  incomplete_expired: ['Checkout expired', 'The first payment was not completed. Start again when you are ready.'],
  paused: ['Hiring tools paused', 'Your subscription is paused in Stripe.'],
};
function planPanel({ shop, csrf, ent, user, notice = '' }) {
  const sub = ent.sub || {};
  const [title, copy] = STATE_COPY[ent.state] || STATE_COPY.free;
  const mode = BP.billingMode();
  const price = BP.priceLabel(sub.price_cents || BP.priceCents());
  const owner = Number(sub.owner_user_id) === Number(user.id);
  const manageable = sub.stripe_customer_id && owner && ['active', 'trialing', 'canceling', 'past_due_grace', 'past_due', 'unpaid', 'canceled', 'stale'].includes(ent.state);
  const canStart = ['free', 'canceled', 'owner_changed', 'incomplete_expired', 'mode_mismatch'].includes(ent.state) || (ent.state === 'incomplete' && !sub.stripe_subscription_id);
  const startBtn = mode === 'off' || mode === 'blocked'
    ? `<p class="cs-note">${mode === 'blocked' ? 'Live Business Pro charges are turned off until they are approved.' : 'Business Pro billing is not set up on this site yet.'} No card can be charged.</p>`
    : `<form method="POST" action="/dashboard/shop/business-pro/checkout">${csrfField(csrf)}${shopField(shop)}<button class="btn" type="submit">${ent.state === 'free' ? 'Upgrade to Business Pro' : 'Start Business Pro'}</button></form>`;
  const testHint = canStart && !ent.entitled && mode === 'test' ? '<p class="cs-hint">Stripe test mode — use the test card 4242 4242 4242 4242. Nothing is charged.</p>' : '';
  const manageBtn = manageable ? `<form method="POST" action="/dashboard/shop/business-pro/portal">${csrfField(csrf)}${shopField(shop)}<button class="btn ${ent.entitled ? 'secondary' : ''}" type="submit">${ent.state.startsWith('past_due') || ent.state === 'unpaid' ? 'Update payment method' : 'Manage billing'}</button></form>` : '';
  const facts = sub.stripe_subscription_id ? `<dl class="cs-facts"><div><dt>Plan</dt><dd>Business Pro, ${v(price)}/month</dd></div><div><dt>${ent.state === 'canceling' ? 'Ends' : ['canceled', 'stale', 'owner_changed'].includes(ent.state) ? 'Period ended' : 'Next payment'}</dt><dd>${v(day(sub.current_period_end)) || '—'}</dd></div><div><dt>Billing</dt><dd>Separate from professional memberships</dd></div></dl>` : '';
  return `${css}<div class="cs-plan cs-state-${v(ent.state)}">${notice}
    <div class="cs-plan-head"><div><p class="cs-kicker">GoBookr Business Pro</p><h2>${v(title)}</h2><p>${v(copy)}</p></div>
      <div class="cs-price"><strong>${v(price)}</strong><span>per month</span></div></div>
    ${facts}<div class="cs-actions">${ent.entitled ? '' : canStart ? startBtn : ''}${manageBtn}<a class="sd-textbtn" href="/dashboard/shop?shop=${Number(shop.id)}&tab=hiring">${ent.entitled ? 'Open Hiring Inbox' : 'Preview hiring tools'}</a></div>${testHint}</div>
  <div class="cs-compare"><section><h3>Free business account</h3><ul class="cs-list">${['Claimed, customizable business page', 'Photos, services and team display', 'Invite professionals and manage your team', 'Merch Studio purchases', 'Everything your page does today'].map((x) => `<li class="ok">${x}</li>`).join('')}</ul></section>
    <section class="cs-pro"><h3>Business Pro adds</h3><ul class="cs-list">${BP.FEATURES.map(([k, t, d]) => `<li class="${k === 'search' ? 'later' : 'ok'}"><strong>${v(t)}</strong><span>${v(d)}</span></li>`).join('')}</ul></section></div>
  <p class="cs-hint">Business Pro is billed to this business only. It never changes a professional’s own $20/month membership or any sponsored team seats. Cancel any time in billing; access continues to the end of the paid month.</p>`;
}

// ---- Hiring (owner) -------------------------------------------------------------------------------------------------
const EXAMPLES = [
  { name: 'Example applicant A', category: 'Barber', city: 'Denver', headline: 'Barber, 6 years — fades, tapers and beard work', status: 'new', job: 'Barber, full time', ago: 'Today' },
  { name: 'Example applicant B', category: 'Hairstylist', city: 'Aurora', headline: 'Color-focused stylist looking for booth rental', status: 'reviewing', job: 'General application', ago: 'Yesterday' },
  { name: 'Example applicant C', category: 'Nail technician', city: 'Lakewood', headline: 'Licensed nail tech, gel and structured manicures', status: 'interview', job: 'Nail technician, commission', ago: '3 days ago' },
];
function hiringPreview({ shop, csrf, ent, savedCount, jobs }) {
  const rows = EXAMPLES.map((x) => `<li class="cs-row is-example" aria-hidden="true"><span class="cs-avatar">${initials(x.name)}</span><span class="cs-who"><strong>${v(x.name)}</strong><small>${v(x.headline)}</small></span><span class="cs-meta">${v(x.job)}<small>${v(x.city)}</small></span><span class="cs-status st-${x.status}">${statusLabel(x.status)}</span><span class="cs-when">${v(x.ago)}</span></li>`).join('');
  const saved = savedCount ? `<div class="cs-locked"><strong>${savedCount} application${savedCount === 1 ? ' is' : 's are'} saved for ${v(shop.name)}</strong><p>Applicant names, résumés and messages stay private until Business Pro is active again.</p></div>` : '';
  return `${css}<div class="cs-preview-banner"><div><p class="cs-kicker">Preview</p><h2>Hire through your GoBookr page</h2><p>This is what your Hiring Inbox looks like with Business Pro. The people below are examples, not real applicants.</p></div><a class="btn" href="/dashboard/shop?shop=${Number(shop.id)}&tab=pro">See Business Pro — ${v(BP.priceLabel())}/month</a></div>
  ${saved}<div class="cs-inbox is-preview"><div class="cs-inbox-head"><h3>Hiring Inbox</h3><span class="cs-example-tag">Example data</span></div><ul class="cs-rows">${rows}</ul>
    <div class="cs-thread-peek" aria-hidden="true"><p class="cs-bubble them">Hi! I saw your opening for a full-time barber. I’m free for a working interview next week.</p><p class="cs-bubble us">Thanks for applying — does Tuesday at 10 work?</p></div></div>
  ${jobsSection({ shop, csrf, jobs, entitled: false })}`;
}
function inboxView({ shop, csrf, data, jobs, filter }) {
  const counts = data.counts || {};
  const tabs = [['', 'All active'], ...C.STATUSES.filter(([k]) => k !== 'withdrawn'), ['withdrawn', 'Withdrawn']]
    .map(([k, l]) => `<a href="/dashboard/shop?shop=${Number(shop.id)}&tab=hiring${k ? `&status=${k}` : ''}"${filter === k ? ' aria-current="page"' : ''}>${v(l)}${k && counts[k] ? ` <span>${counts[k]}</span>` : ''}</a>`).join('');
  const rows = data.items.map((a) => { const r = a.resume_snapshot || {}; const unread = a.business_unread === true || a.business_unread === 't';
    return `<li class="cs-row${unread ? ' is-unread' : ''}"><a class="cs-rowlink" href="/dashboard/shop/hiring/applications/${Number(a.id)}?shop=${Number(shop.id)}"><span class="cs-avatar">${v(initials(r.name))}</span><span class="cs-who"><strong>${v(r.name || 'Professional')}</strong><small>${v(r.headline || '')}</small></span><span class="cs-meta">${v(a.job_title || 'General application')}<small>${v([r.category, r.city].filter(Boolean).join(', '))}</small></span><span class="cs-status st-${v(a.status)}">${v(statusLabel(a.status))}</span><span class="cs-when">${v(day(a.updated_at))}${Number(a.message_count) ? `<small>${Number(a.message_count)} message${Number(a.message_count) === 1 ? '' : 's'}</small>` : ''}</span></a></li>`; }).join('');
  return `${css}${data.entitlement && data.entitlement.state === 'past_due_grace' ? `<div class="cs-warn"><strong>Payment failed.</strong> Update your card to keep hiring tools on. <a href="/dashboard/shop?shop=${Number(shop.id)}&tab=pro">Fix billing</a></div>` : ''}
  <div class="cs-inbox"><div class="cs-inbox-head"><h3>Hiring Inbox</h3><a class="sd-textbtn" href="/shop/${Number(shop.id)}#hiring" target="_blank" rel="noopener">See how applicants find you</a></div>
    <nav class="cs-filter" aria-label="Filter by status">${tabs}</nav>
    ${rows ? `<ul class="cs-rows">${rows}</ul>` : `<div class="cs-empty"><h4>No applications ${filter ? 'with this status' : 'yet'}</h4><p>Publish an opening below, or share your page — professionals can send a general application from it.</p></div>`}</div>
  ${jobsSection({ shop, csrf, jobs, entitled: true })}`;
}
function jobForm(shop, csrf, job = {}) {
  const sel = (name, options, cur) => `<select name="${name}">${options.map(([k, l]) => `<option value="${v(k)}"${k === cur ? ' selected' : ''}>${v(l)}</option>`).join('')}</select>`;
  return `<form method="POST" action="/dashboard/shop/jobs${job.id ? `/${Number(job.id)}` : ''}" class="cs-jobform">${csrfField(csrf)}${shopField(shop)}
    <label class="cs-field cs-wide"><span>Title</span><input name="title" value="${v(job.title)}" maxlength="100" required placeholder="Barber, full time"></label>
    <label class="cs-field"><span>Specialty</span>${sel('category', [['', 'Any specialty'], ...PROFESSIONAL_CATEGORIES.map((c) => [c.value, c.label])], job.category || '')}</label>
    <label class="cs-field"><span>Arrangement</span>${sel('work_type', C.WORK_TYPES, job.work_type || 'employee')}</label>
    <label class="cs-field cs-wide"><span>Pay or rent <em>optional</em></span><input name="compensation" value="${v(job.compensation)}" maxlength="120" placeholder="60% commission, or $250/week booth rent"></label>
    <label class="cs-field cs-wide"><span>About the role</span><textarea name="description" rows="5" maxlength="4000">${v(job.description)}</textarea></label>
    <label class="cs-field cs-wide"><span>Requirements <em>optional</em></span><textarea name="requirements" rows="3" maxlength="2000">${v(job.requirements)}</textarea></label>
    <div class="cs-wide"><button class="btn secondary" type="submit">${job.id ? 'Save opening' : 'Save as draft'}</button></div></form>`;
}
function jobsSection({ shop, csrf, jobs, entitled, editing = null }) {
  const list = jobs.map((j) => `<li class="cs-job"><div><strong>${v(j.title)}</strong><small>${v([workTypeLabel(j.work_type), C.categoryLabel(j.category)].filter(Boolean).join(', '))}${j.status === 'open' ? ` · ${Number(j.applicants) || 0} applicant${Number(j.applicants) === 1 ? '' : 's'}` : ''}</small></div>
    <span class="cs-jobstate js-${j.status === 'open' && !entitled ? 'paused' : v(j.status)}">${j.status === 'open' ? (entitled ? 'Live' : 'Hidden — Business Pro paused') : j.status === 'draft' ? 'Draft' : 'Closed'}</span>
    <form method="POST" class="cs-inline">${csrfField(csrf)}${shopField(shop)}<a class="sd-textbtn" href="/dashboard/shop?shop=${Number(shop.id)}&tab=hiring&edit=${Number(j.id)}#job-editor">Edit</a>
      ${j.status !== 'open' ? (entitled ? `<button class="btn small" formaction="/dashboard/shop/jobs/${Number(j.id)}/publish">Publish</button>` : '<span class="cs-hint">Publishing needs Business Pro</span>') : `<button class="sd-textbtn" formaction="/dashboard/shop/jobs/${Number(j.id)}/close">Close</button>`}</form></li>`).join('');
  return `<section class="cs-jobs" id="job-editor"><div class="cs-inbox-head"><h3>Job openings</h3></div>
    ${list ? `<ul class="cs-joblist">${list}</ul>` : '<p class="cs-hint">No openings yet. Drafts are free to write; publishing puts them on your page and GoBookr Jobs.</p>'}
    <details class="cs-newjob"${editing || !list ? ' open' : ''}><summary>${editing ? 'Edit opening' : 'Write a new opening'}</summary>${jobForm(shop, csrf, editing || {})}</details></section>`;
}
function resumeBlock(r, { showEmail = false } = {}) {
  const exp = (r.experience || []).map((x) => `<li><strong>${v(x.role)}</strong>${x.workplace ? ` at ${v(x.workplace)}` : ''}<small>${v([x.start, x.end || (x.start ? 'present' : '')].filter(Boolean).join(' – '))}</small>${x.description ? `<p>${nl(x.description)}</p>` : ''}</li>`).join('');
  const lic = (r.licenses || []).map((x) => `<li>${v(x.name)}${x.state ? `, ${v(x.state)}` : ''} <small>self-reported</small></li>`).join('');
  const edu = (r.education || []).map((x) => `<li>${v(x.program)}${x.school ? `, ${v(x.school)}` : ''}${x.year ? ` <small>${v(x.year)}</small>` : ''}</li>`).join('');
  return `<article class="cs-resume"><header><span class="cs-avatar lg">${v(initials(r.name))}</span><div><h2>${v(r.name || 'Your name')}</h2><p class="cs-headline">${v(r.headline)}</p><p class="cs-sub">${v([r.category, [r.city, r.state].filter(Boolean).join(', '), r.years_experience != null && r.years_experience !== '' ? `${r.years_experience} yr${Number(r.years_experience) === 1 ? '' : 's'} experience` : ''].filter(Boolean).join(' · '))}</p>
      ${showEmail && r.email ? `<p class="cs-sub"><a href="mailto:${v(r.email)}">${v(r.email)}</a>${r.profile_url ? ` · <a href="${v(r.profile_url)}" target="_blank" rel="noopener">GoBookr profile</a>` : ''}</p>` : ''}</div></header>
    ${r.summary ? `<section><h3>About</h3><p>${nl(r.summary)}</p></section>` : ''}
    ${(r.specialties || []).length ? `<section><h3>Specialties</h3><ul class="cs-tags">${r.specialties.map((s) => `<li>${v(s)}</li>`).join('')}</ul></section>` : ''}
    ${(r.work_types || []).length ? `<section><h3>Open to</h3><ul class="cs-tags">${r.work_types.map((s) => `<li>${v(workTypeLabel(s))}</li>`).join('')}</ul>${r.preferred_cities ? `<p class="cs-sub">Areas: ${v(r.preferred_cities)}</p>` : ''}</section>` : ''}
    ${exp ? `<section><h3>Experience</h3><ul class="cs-timeline">${exp}</ul></section>` : ''}
    ${lic ? `<section><h3>Licenses</h3><ul class="cs-plainlist">${lic}</ul></section>` : ''}
    ${edu ? `<section><h3>Training</h3><ul class="cs-plainlist">${edu}</ul></section>` : ''}</article>`;
}
function thread(messages, me, { csrf, action, hidden = '', disabled = '' }) {
  const items = messages.map((m) => `<li class="cs-bubble ${m.sender === me ? 'us' : 'them'}"><p>${nl(m.body)}</p><small>${v(day(m.created_at))}</small></li>`).join('');
  return `<section class="cs-thread" aria-label="Messages"><h3>Messages</h3>${items ? `<ul>${items}</ul>` : '<p class="cs-hint">No messages yet.</p>'}
    ${disabled ? `<p class="cs-note">${v(disabled)}</p>` : `<form method="POST" action="${action}" class="cs-reply">${csrfField(csrf)}${hidden}<label class="cs-sr" for="reply">Message</label><textarea id="reply" name="body" rows="3" maxlength="4000" required placeholder="Write a message"></textarea><button class="btn" type="submit">Send</button></form>`}</section>`;
}
function applicationOwnerView({ shop, csrf, app, messages }) {
  const r = app.resume_snapshot || {};
  const statusForm = app.status === 'withdrawn' ? '<p class="cs-note">The applicant withdrew this application.</p>' : `<form method="POST" action="/dashboard/shop/hiring/applications/${Number(app.id)}/status" class="cs-statusform">${csrfField(csrf)}${shopField(shop)}<label for="st">Status</label><select id="st" name="status">${C.OWNER_STATUSES.map((s) => `<option value="${s}"${s === app.status ? ' selected' : ''}>${v(statusLabel(s))}</option>`).join('')}</select><button class="btn secondary small" type="submit">Update</button></form><p class="cs-hint">The applicant sees status changes in their Career Studio.</p>`;
  return `${css}<p><a class="sd-textbtn" href="/dashboard/shop?shop=${Number(shop.id)}&tab=hiring">← Hiring Inbox</a></p>
  <div class="cs-app"><div>${resumeBlock(r, { showEmail: true })}${app.note ? `<section class="cs-cover"><h3>Note from the applicant</h3><p>${nl(app.note)}</p></section>` : ''}</div>
    <aside><div class="cs-side"><p class="cs-kicker">${v(app.job_title || 'General application')}</p><p class="cs-sub">Applied ${v(day(app.created_at))}</p>${statusForm}</div>
    ${thread(messages, 'business', { csrf, action: `/dashboard/shop/hiring/applications/${Number(app.id)}/messages`, hidden: shopField(shop), disabled: app.status === 'withdrawn' ? 'Messaging is closed because the application was withdrawn.' : '' })}</aside></div>`;
}

// ---- professional side --------------------------------------------------------------------------------------------
function resumeForm({ csrf, resume, pro, saved }) {
  const r = resume || { specialties: [], experience: [], licenses: [], education: [], work_types: [] };
  const row = (prefix, i, fields) => `<div class="cs-repeat">${fields.map(([f, label, attrs = '']) => f === 'description' ? `<label class="cs-field cs-wide"><span>${label}</span><textarea name="${prefix}_${i}_${f}" rows="2" maxlength="600">${v(((r[prefix === 'exp' ? 'experience' : prefix === 'lic' ? 'licenses' : 'education'][i]) || {})[f])}</textarea></label>` : `<label class="cs-field"><span>${label}</span><input name="${prefix}_${i}_${f}" value="${v(((r[prefix === 'exp' ? 'experience' : prefix === 'lic' ? 'licenses' : 'education'][i]) || {})[f])}" ${attrs}></label>`).join('')}</div>`;
  const rows = (prefix, list, n, fields) => Array.from({ length: Math.max(1, Math.min(n, list.length + 1)) }, (_, i) => row(prefix, i, fields)).join('');
  return `<form method="POST" action="/dashboard/pro/career/resume" class="cs-resumeform">${csrfField(csrf)}
    <fieldset><legend>Basics</legend>
      <label class="cs-field cs-wide"><span>Headline</span><input name="headline" value="${v(r.headline)}" maxlength="120" required placeholder="Barber with 6 years of fades and beard work"></label>
      <label class="cs-field"><span>Years of experience</span><input name="years_experience" type="number" min="0" max="60" inputmode="numeric" value="${v(r.years_experience)}"></label>
      <label class="cs-field"><span>Areas you’d work in</span><input name="preferred_cities" value="${v(r.preferred_cities)}" maxlength="160" placeholder="Denver, Aurora"></label>
      <label class="cs-field cs-wide"><span>About you</span><textarea name="summary" rows="4" maxlength="1500">${v(r.summary)}</textarea></label>
      <label class="cs-field cs-wide"><span>Specialties <em>comma separated</em></span><input name="specialties" value="${v((r.specialties || []).join(', '))}" maxlength="400"></label></fieldset>
    <fieldset><legend>Open to</legend><div class="cs-checks">${C.WORK_TYPES.map(([k, l]) => `<label><input type="checkbox" name="wt_${k}" value="1"${(r.work_types || []).includes(k) ? ' checked' : ''}> ${v(l)}</label>`).join('')}</div>
      <label class="cs-check"><input type="checkbox" name="open_to_work" value="1"${r.open_to_work ? ' checked' : ''}> I’m open to new opportunities</label><p class="cs-hint">Your résumé is private. Businesses only see it when you apply to them.</p></fieldset>
    <fieldset><legend>Experience</legend>${rows('exp', r.experience || [], 6, [['role', 'Role', 'maxlength="80"'], ['workplace', 'Where', 'maxlength="120"'], ['start', 'Start (YYYY-MM)', 'maxlength="7" placeholder="2021-03"'], ['end', 'End (blank if current)', 'maxlength="7"'], ['description', 'What you did']])}</fieldset>
    <fieldset><legend>Licenses</legend><p class="cs-hint">Shown as self-reported. Never include license numbers.</p>${rows('lic', r.licenses || [], 4, [['name', 'License', 'maxlength="80" placeholder="Barber license"'], ['state', 'State', 'maxlength="2" placeholder="CO"']])}</fieldset>
    <fieldset><legend>Training</legend>${rows('edu', r.education || [], 4, [['program', 'Program', 'maxlength="120"'], ['school', 'School', 'maxlength="120"'], ['year', 'Year', 'maxlength="4"']])}</fieldset>
    <div class="cs-savebar"><button class="btn" type="submit">${saved ? 'Save résumé' : 'Create résumé'}</button><span class="cs-hint">Free for every professional.</span></div></form>`;
}
function careerPage({ csrf, pro, resume, apps, notes, user }) {
  const snap = resume ? { ...C.snapshot(pro, resume, user) } : null;
  const appRows = apps.map((a) => `<li class="cs-row${a.pro_unread === true || a.pro_unread === 't' ? ' is-unread' : ''}"><a class="cs-rowlink" href="/dashboard/pro/career/applications/${Number(a.id)}"><span class="cs-who"><strong>${v(a.shop_name)}</strong><small>${v(a.job_title || 'General application')}</small></span><span class="cs-meta">${v(a.shop_city || '')}</span><span class="cs-status st-${v(a.status)}">${v(statusLabel(a.status))}</span><span class="cs-when">${v(day(a.updated_at))}</span></a></li>`).join('');
  return `${css}<div class="cs-career"><header class="cs-career-head"><div><p class="cs-kicker">Career Studio</p><h1>Your résumé and applications</h1><p>Free for professionals. Your résumé belongs to your GoBookr profile and goes with you wherever you work.</p></div><a class="btn secondary" href="/jobs">Browse openings</a></header>
    ${notes.length ? `<section class="cs-notes"><h2>Updates</h2><ul>${notes.slice(0, 5).map((n) => `<li${n.read_at ? '' : ' class="is-unread"'}><a href="${v(n.url)}">${v(n.title)}</a><small>${v(day(n.created_at))}</small></li>`).join('')}</ul></section>` : ''}
    <section class="cs-myapps"><h2>Applications</h2>${appRows ? `<ul class="cs-rows">${appRows}</ul>` : '<p class="cs-hint">You haven’t applied anywhere yet. Businesses with Business Pro show an Apply button on their page.</p>'}</section>
    <div class="cs-resume-grid"><section><h2>${resume ? 'Edit résumé' : 'Create your résumé'}</h2>${resumeForm({ csrf, resume, pro, saved: Boolean(resume) })}</section><section class="cs-preview"><h2>What businesses see</h2>${snap ? resumeBlock(snap) : '<div class="cs-empty"><p>Your preview appears here after you save.</p></div>'}</section></div></div>`;
}
function proApplicationView({ csrf, app, messages, businessActive }) {
  const withdrawable = !['withdrawn', 'hired'].includes(app.status);
  return `${css}<div class="cs-career"><p><a class="cs-back" href="/dashboard/pro/career">← Career Studio</a></p>
    <header class="cs-career-head"><div><p class="cs-kicker">${v(app.job_title || 'General application')}</p><h1>${v(app.shop_name)}</h1><p><span class="cs-status st-${v(app.status)}">${v(statusLabel(app.status))}</span> Applied ${v(day(app.created_at))}</p></div>
    ${withdrawable ? `<form method="POST" action="/dashboard/pro/career/applications/${Number(app.id)}/withdraw">${csrfField(csrf)}<button class="btn secondary small" type="submit" onclick="return confirm('Withdraw this application?')">Withdraw application</button></form>` : ''}</header>
    <div class="cs-app"><div>${thread(messages, 'pro', { csrf, action: `/dashboard/pro/career/applications/${Number(app.id)}/messages`, disabled: app.status === 'withdrawn' ? 'You withdrew this application.' : !businessActive ? 'This business isn’t receiving messages on GoBookr right now. Your application is saved.' : '' })}</div>
    <aside><h3 class="cs-small-h">Résumé you sent</h3>${resumeBlock(app.resume_snapshot)}</aside></div></div>`;
}

// ---- public -------------------------------------------------------------------------------------------------------
function jobCard(j) { return `<li class="cs-pubjob"><a href="/jobs/${Number(j.id)}"><strong>${v(j.title)}</strong><span>${v(j.shop_name)}</span><small>${v([workTypeLabel(j.work_type), C.categoryLabel(j.category), [j.shop_city, j.shop_state].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</small>${j.compensation ? `<em>${v(j.compensation)}</em>` : ''}</a></li>`; }
function jobsBoard({ jobs, city, category }) {
  return `${css}<section class="section container cs-board"><header class="cs-career-head"><div><p class="cs-kicker">GoBookr Jobs</p><h1>Open chairs, suites and roles</h1><p>Openings posted by businesses on GoBookr. Apply with your free GoBookr résumé.</p></div></header>
  <form method="GET" action="/jobs" class="cs-boardfilter" data-no-radius><label><span>City</span><input name="city" value="${v(city)}" placeholder="Denver"></label><label><span>Specialty</span><select name="category"><option value="">Any</option>${PROFESSIONAL_CATEGORIES.map((c) => `<option value="${v(c.value)}"${c.value === category ? ' selected' : ''}>${v(c.label)}</option>`).join('')}</select></label><button class="btn secondary" type="submit">Filter</button></form>
  ${jobs.length ? `<ul class="cs-pubjobs">${jobs.map(jobCard).join('')}</ul>` : '<div class="cs-empty"><h2>No openings here yet</h2><p>Check back soon, or keep your résumé ready in Career Studio.</p></div>'}</section>`;
}
function applyBox({ shop, job, csrf, viewer }) {
  const target = job ? `/jobs/${Number(job.id)}/apply` : `/shop/${Number(shop.id)}/apply`;
  if (!viewer.user) return `<a class="btn" href="/login?next=${encodeURIComponent(job ? `/jobs/${job.id}` : `/shop/${shop.id}#hiring`)}">Sign in to apply</a><p class="cs-hint">Professionals apply with their free GoBookr résumé.</p>`;
  if (!viewer.pro) return '<p class="cs-hint">Applying is for professionals with a claimed GoBookr profile.</p>';
  if (!viewer.resume) return `<a class="btn" href="/dashboard/pro/career">Create your free résumé to apply</a>`;
  if (viewer.applied) return `<p class="cs-note">You applied. <a href="/dashboard/pro/career/applications/${Number(viewer.applied)}">See your application</a></p>`;
  return `<form method="POST" action="${target}" class="cs-applyform">${csrfField(csrf)}<label class="cs-field cs-wide"><span>Note to ${v(shop.name || shop.shop_name)} <em>optional</em></span><textarea name="note" rows="3" maxlength="1500"></textarea></label><button class="btn" type="submit">Apply with my résumé</button><p class="cs-hint">They’ll see your résumé, GoBookr profile and email. You can withdraw any time.</p></form>`;
}
function jobPage({ job, csrf, viewer }) {
  return `${css}<section class="section container cs-board"><p><a class="cs-back" href="/jobs">← All openings</a></p><div class="cs-app"><article class="cs-jobpage"><p class="cs-kicker"><a href="/shop/${Number(job.shop_id)}">${v(job.shop_name)}</a> · ${v([job.shop_city, job.shop_state].filter(Boolean).join(', '))}</p><h1>${v(job.title)}</h1>
    <ul class="cs-tags">${[workTypeLabel(job.work_type), C.categoryLabel(job.category), job.compensation].filter(Boolean).map((t) => `<li>${v(t)}</li>`).join('')}</ul>
    ${job.description ? `<section><h2>About the role</h2><p>${nl(job.description)}</p></section>` : ''}${job.requirements ? `<section><h2>Requirements</h2><p>${nl(job.requirements)}</p></section>` : ''}<p class="cs-hint">Posted ${v(day(job.published_at))}</p></article>
    <aside class="cs-side">${applyBox({ shop: { id: job.shop_id, name: job.shop_name }, job, csrf, viewer })}</aside></div></section>`;
}
// Shown on the public business page when the business accepts applications.
function shopHiringCard({ shop, jobs, csrf, viewer }) {
  return `${css}<section class="cs-shophiring" id="hiring"><div><h2>${jobs.length ? 'Now hiring' : 'Work here'}</h2><p>${jobs.length ? `${v(shop.name)} is hiring on GoBookr.` : `${v(shop.name)} accepts applications from professionals on GoBookr.`}</p>
    ${jobs.length ? `<ul class="cs-pubjobs compact">${jobs.map(jobCard).join('')}</ul>` : ''}</div><div class="cs-side">${jobs.length ? '<p class="cs-hint">Or send a general application:</p>' : ''}${applyBox({ shop, job: null, csrf, viewer })}</div></section>`;
}

module.exports = { planPanel, hiringPreview, inboxView, jobsSection, applicationOwnerView, careerPage, proApplicationView, jobsBoard, jobPage, shopHiringCard, resumeBlock, statusLabel, EXAMPLES };
