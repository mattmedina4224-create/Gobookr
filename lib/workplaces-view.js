'use strict';
// "My workplaces" for professionals: every business they are connected to, invitations and requests, and the
// record of where they have left. The professional owns all of these decisions; nothing here touches billing.
const { escapeHtml: e } = require('./util');

const STATUS = {
  accepted: ['Connected', 'live'], pending: ['Invitation', 'invite'], requested: ['Request sent', 'wait'],
  left: ['You left', 'ended'], removed: ['Removed by business', 'ended'], rejected: ['Request declined', 'ended'],
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const safeLogo = (url) => { try { const u = new URL(String(url || '')); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; } };

function mark(w) {
  const logo = w.profile_published_at && safeLogo(w.logo_url);
  const initial = (String(w.name || 'B').match(/[A-Za-z0-9]/) || ['B'])[0].toUpperCase();
  return logo ? `<img class="wp-logo" src="${e(logo)}" alt="" width="56" height="56" loading="lazy">` : `<span class="wp-logo wp-logo-fallback" aria-hidden="true">${e(initial)}</span>`;
}
function place(w) { return [w.neighborhood, w.city, w.state].filter(Boolean).map(e).join(', '); }

function leaveDialog(w, { csrf, sponsored }) {
  const id = `leave-${Number(w.id)}`;
  return `<dialog class="wp-dialog" id="${id}" aria-labelledby="${id}-h">
    <form method="POST" action="/dashboard/pro/businesses/${Number(w.id)}/leave">
      <input type="hidden" name="_csrf" value="${e(csrf)}">
      <h2 id="${id}-h">Leave ${e(w.name)}?</h2>
      <p>Are you sure you want to leave ${e(w.name)}? Your professional profile, portfolio, booking links, and individual subscription will remain active.</p>
      ${sponsored ? `<p class="wp-note"><strong>${e(w.name)} currently sponsors your GoBookr membership.</strong> Leaving ends that sponsorship. Your account and profile stay exactly as they are, and nothing is charged automatically: you can choose individual billing from <a href="/dashboard/pro/billing">Billing</a> whenever you are ready.</p>` : ''}
      <label class="wp-check"><input type="checkbox" name="block_invites" value="1"><span>Don’t let ${e(w.name)} invite me again</span></label>
      <div class="wp-dialog-actions"><button type="button" class="btn secondary" data-close-dialog>Stay</button><button type="submit" class="btn wp-danger-btn">Leave ${e(w.name)}</button></div>
      <p class="wp-fine">You don’t need the owner’s permission. They’ll be told you left.</p>
    </form>
  </dialog>`;
}

function card(w, ctx) {
  const [label, tone] = STATUS[w.status] || [w.status, 'ended'];
  const view = `<a class="btn secondary small" href="/shop/${Number(w.shop_id)}">View business</a>`;
  let meta = '', actions = '';
  const csrfField = `<input type="hidden" name="_csrf" value="${e(ctx.csrf)}">`;
  if (w.status === 'accepted') {
    meta = `Joined ${fmtDate(w.accepted_at)}`;
    actions = `${view}<button type="button" class="wp-leave" data-open-dialog="leave-${Number(w.id)}">Leave business</button>${leaveDialog(w, { csrf: ctx.csrf, sponsored: ctx.sponsoredShopId === Number(w.shop_id) })}
      <noscript><form method="POST" action="/dashboard/pro/businesses/${Number(w.id)}/leave">${csrfField}<button class="wp-leave" type="submit">Leave business now</button></form></noscript>`;
  } else if (w.status === 'pending') {
    meta = `Invited ${fmtDate(w.invited_at)} · expires ${fmtDate(w.expires_at)}`;
    actions = `${view}<form method="POST" action="/dashboard/pro/businesses/invites/${Number(w.id)}/accept" class="wp-inline">${csrfField}<button class="btn small" type="submit">Accept</button></form>
      <form method="POST" action="/dashboard/pro/businesses/invites/${Number(w.id)}/decline" class="wp-inline">${csrfField}<button class="wp-textbtn" type="submit">Decline</button><button class="wp-textbtn" type="submit" name="block_invites" value="1">Decline and block</button></form>`;
  } else if (w.status === 'requested') {
    meta = `Requested ${fmtDate(w.invited_at)} · waiting for the owner`;
    actions = `${view}<form method="POST" action="/dashboard/pro/businesses/requests/${Number(w.id)}/cancel" class="wp-inline">${csrfField}<button class="wp-textbtn" type="submit">Cancel request</button></form>`;
  } else {
    meta = `${w.status === 'rejected' ? 'Declined' : w.status === 'removed' ? 'Removed' : 'Left'} ${fmtDate(w.ended_at)}${w.invites_blocked ? ' · invitations blocked' : ''}`;
    actions = `${view}${w.invites_blocked ? `<form method="POST" action="/dashboard/pro/businesses/${Number(w.id)}/allow-invites" class="wp-inline">${csrfField}<button class="wp-textbtn" type="submit">Allow invitations again</button></form>` : ''}`;
  }
  return `<li class="wp-card${ctx.highlight === Number(w.id) ? ' is-highlight' : ''}" id="workplace-${Number(w.id)}">
    ${mark(w)}
    <div class="wp-main"><div class="wp-title"><a href="/shop/${Number(w.shop_id)}">${e(w.name)}</a><span class="wp-pill wp-pill-${tone}">${e(label)}</span></div>
      <p class="wp-meta">${place(w)}${meta ? ` · ${e(meta)}` : ''}</p></div>
    <div class="wp-actions">${actions}</div>
  </li>`;
}

function departure(w) {
  return `<div class="wp-departed" role="status" tabindex="-1">
    <h2>You left ${e(w.name)}</h2>
    <p>You’re no longer listed on their business page. Nothing else changed:</p>
    <ul class="wp-kept"><li>Your professional profile is live</li><li>Your portfolio and services are unchanged</li><li>Your booking links still work</li><li>Your subscription and billing are unchanged</li></ul>
    <div class="wp-actions"><a class="btn small" href="/search?type=businesses">Find another business</a><a class="btn secondary small" href="/dashboard/pro/profile">View your profile</a></div>
  </div>`;
}

function page({ rows, csrf, nav, sponsoredShopId = null, departedId = null, notice = '' }) {
  const ctx = { csrf, sponsoredShopId, highlight: departedId };
  const invitations = rows.filter((w) => w.status === 'pending');
  const current = rows.filter((w) => w.status === 'accepted');
  const requests = rows.filter((w) => w.status === 'requested');
  const past = rows.filter((w) => ['left', 'removed', 'rejected', 'declined', 'canceled'].includes(w.status) && (w.status !== 'declined' && w.status !== 'canceled' || w.invites_blocked));
  const departed = departedId ? rows.find((w) => Number(w.id) === Number(departedId) && w.status === 'left') : null;
  const list = (items) => `<ul class="wp-list">${items.map((w) => card(w, ctx)).join('')}</ul>`;
  // Same shell as other professional dashboard pages: section > .dash-layout > nav + content.
  return `<link rel="stylesheet" href="/shop-dashboard.css?v=3"><section class="section container"><div class="dash-layout">${nav}<div class="sd wp">
    <header class="wp-head"><div><h1>My workplaces</h1><p class="sd-help">The businesses that show you on their GoBookr page. Your professional profile is yours: you can join, leave or change workplaces at any time, and none of it affects your profile or your own subscription.</p></div></header>
    ${notice}
    ${departed ? departure(departed) : ''}
    ${invitations.length ? `<h2 class="wp-h">Invitations</h2>${list(invitations)}` : ''}
    <h2 class="wp-h">Connected</h2>
    ${current.length ? list(current) : '<div class="sd-empty"><p>You’re not connected to a business yet. Accept an invitation, or find your shop and ask to join.</p></div>'}
    ${requests.length ? `<h2 class="wp-h">Your requests</h2>${list(requests)}` : ''}
    <div class="sd-card sd-card-quiet wp-join"><h2>Join a business</h2><p class="sd-help">Find the shop or salon you work at and open its page. If it has claimed its GoBookr page, you’ll see <strong>Request to join</strong>. The owner approves, and you can belong to more than one business if you work at several.</p>
      <form method="GET" action="/search" class="wp-search" data-no-radius><input type="hidden" name="type" value="businesses"><label class="sr-only" for="wp-q">Business name</label><input id="wp-q" name="q" placeholder="Business name" maxlength="100" autocomplete="off"><button class="btn" type="submit">Find business</button></form></div>
    ${past.length ? `<h2 class="wp-h">History</h2>${list(past)}` : ''}
  </div></div></section><script src="/shop-dashboard.js?v=2" defer></script>`;
}

module.exports = { page, leaveDialog, STATUS };
