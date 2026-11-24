'use strict';
// Owner dashboard, guided setup and media/services/team management for claimed business pages, plus the
// professional side of free team invitations. Every write is scoped to "this user owns this claimed shop" in
// the SQL itself, not only in a pre-check. Business pages are free: nothing here touches billing.
const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml: e } = require('../lib/util');
const { SHOP_CATEGORY_LABELS } = require('../lib/shop-categories');
const P = require('../lib/shop-profile');
const View = require('../lib/shop-dashboard-view');
const WorkplacesView = require('../lib/workplaces-view');

const sponsorshipEnabled = () => process.env.BUSINESS_TEAMS_ENABLED === '1';
// Optional paid sponsorship (lib/business-team.js) only exists when its flag is on; loaded lazily so the free
// affiliation never depends on billing code.
function sponsorshipFor(pro) {
  if (!pro || !sponsorshipEnabled()) return null;
  try { return require('../lib/business-team').membership(pro.id) || null; } catch (_) { return null; }
}
const OWNER_SCOPE = "id = ? AND owner_user_id = ? AND claim_status = 'claimed'";

function sendJson(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); }
function owner(ctx, { json = false } = {}) {
  if (!ctx.currentUser) {
    if (json) sendJson(ctx.res, 401, { ok: false, error: 'Sign in again to continue.' });
    else redirect(ctx.res, '/login?next=' + encodeURIComponent(ctx.req?.url || '/dashboard/shop'));
    return null;
  }
  const { shop, shops } = P.ownedShop(ctx.currentUser.id, ctx.body?.shop ?? ctx.query?.shop);
  if (!shop) {
    if (json) sendJson(ctx.res, 403, { ok: false, error: 'You do not manage this business.' });
    else send(ctx.res, layout({ title: 'Business dashboard', currentUser: ctx.currentUser, session: ctx.session, body: '<section class="section container" style="max-width:720px"><div class="panel"><h1>Business dashboard</h1><p>No claimed business is connected to this account yet. Find your business and claim its free page.</p><a class="btn" href="/search?type=businesses">Find your business</a></div></section>' }), 403);
    return null;
  }
  // A submitted shop id that this user does not own is refused outright, never silently swapped.
  const asked = ctx.body?.shop ?? ctx.query?.shop;
  if (asked != null && asked !== '' && Number(asked) !== Number(shop.id)) {
    if (json) sendJson(ctx.res, 403, { ok: false, error: 'You do not manage this business.' });
    else send(ctx.res, layout({ title: 'Not allowed', currentUser: ctx.currentUser, session: ctx.session, body: '<section class="section container"><div class="panel"><h1>Not allowed</h1><p>You do not manage this business.</p></div></section>' }), 403);
    return null;
  }
  return { shop: normalize(shop), shops };
}
function normalize(shop) {
  const j = (v, d) => { if (v == null) return d; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v; };
  return { ...shop, hours: j(shop.hours, {}), social_links: j(shop.social_links, {}), specialties: j(shop.specialties, []), amenities: j(shop.amenities, []) };
}
const back = (ctx, shop, where, message, type = 'success') =>
  redirect(ctx.res, `/dashboard/shop?shop=${Number(shop.id)}&${where}&${type}=${encodeURIComponent(message)}`);
const where = (ctx, fallback) => (/^\/dashboard\/shop\?shop=\d+&(step=[1-6]|tab=[a-z]+)$/.test(String(ctx.body?.next || '')) ? String(ctx.body.next).split('&').slice(1).join('&') : fallback);
const origin = (ctx) => process.env.APP_URL || (ctx.req?.headers?.host ? `https://${ctx.req.headers.host}` : 'https://gobookr.com');

function dashboardData(ctx, shop, extra = {}) {
  const profile = P.loadProfile(shop.id, { fresh: true });
  const team = P.teamForOwner(shop.id);
  const pendingInvites = team.filter((m) => m.status === 'pending').length;
  const completion = P.completion(shop, { services: profile.services.length, photos: profile.photos.length, team: profile.team.length, pendingInvites });
  const suggestedStep = (completion.next[0] && completion.next[0].step) || 6;
  return { csrf: ctx.session?.csrf_token || '', profile, team, pendingInvites, completion, suggestedStep, sponsorship: sponsorshipEnabled(), inviteLinks: [], ...extra };
}
function render(ctx, shop, shops, { tab, step, flash, status = 200, extra } = {}) {
  const data = dashboardData(ctx, shop, extra);
  const t = View.TABS.some(([id]) => id === tab) ? tab : 'overview';
  const s = Number(step) >= 1 && Number(step) <= 6 ? Number(step) : null;
  send(ctx.res, layout({ title: `${shop.name} · Business dashboard`, currentUser: ctx.currentUser, session: ctx.session, robots: 'noindex,nofollow',
    flash: flash || flashFromQuery(ctx.query), body: View.page({ shop, shops, tab: t, step: s, data }) }), status);
}

// ---- profile fields --------------------------------------------------------------------------------------------
const SECTIONS = {
  setup1: ['name', 'tagline', 'categories', 'location', 'hours'],
  about: ['about'],
  profile: ['name', 'tagline', 'categories', 'about'],
  settings: ['location', 'hours', 'social'],
};
function readProfile(body, parts) {
  const set = {}; let categories = null;
  if (parts.includes('name')) {
    set.name = P.clean(body.name, 160);
    if (set.name.length < 2) throw new P.InputError('Enter your business name.');
  }
  if (parts.includes('tagline')) set.tagline = P.clean(body.tagline, 120);
  if (parts.includes('categories')) {
    categories = Object.keys(SHOP_CATEGORY_LABELS).filter((c) => body['category_' + c] === '1' || body['category_' + c] === 'on');
    if (!categories.length) throw new P.InputError('Choose at least one service you offer.');
  }
  if (parts.includes('about')) {
    set.description = P.cleanBlock(body.description, 3000);
    set.specialties = JSON.stringify(P.parseSpecialties(body.specialties));
    set.amenities = JSON.stringify(P.AMENITIES.filter((a, i) => body['amenity_' + i] === '1' || body['amenity_' + i] === 'on'));
  }
  if (parts.includes('location')) {
    set.street_address = P.clean(body.street_address, 200);
    set.suite = P.clean(body.suite, 80);
    set.neighborhood = P.clean(body.neighborhood, 80);
    set.city = P.clean(body.city, 100).toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());
    set.state = P.clean(body.state, 2).toUpperCase();
    set.zip_code = P.clean(body.zip_code, 10);
    set.phone = P.clean(body.phone, 40);
    if (!set.city) throw new P.InputError('Enter your city.');
    if (!/^[A-Z]{2}$/.test(set.state)) throw new P.InputError('Enter your two-letter state, like CO.');
    if (set.zip_code && !/^\d{5}(-\d{4})?$/.test(set.zip_code)) throw new P.InputError('Enter a 5-digit ZIP code.');
    if (set.phone && set.phone.replace(/\D/g, '').length < 10) throw new P.InputError('Enter a phone number with area code.');
    const website = P.safeUrl(body.website_url), booking = P.safeUrl(body.booking_url);
    if (website === null) throw new P.InputError('Enter a valid website address, like yourbusiness.com.');
    if (booking === null) throw new P.InputError('Enter a valid booking link starting with https://.');
    set.website_url = website; set.booking_url = booking;
  }
  if (parts.includes('hours')) set.hours = JSON.stringify(P.parseHours(body));
  if (parts.includes('social')) set.social_links = JSON.stringify(P.parseSocial(body));
  return { set, categories };
}
function saveProfile(shop, userId, { set, categories }) {
  const cols = Object.keys(set);
  const jsonCols = new Set(['hours', 'social_links', 'specialties', 'amenities']);
  const sql = `UPDATE shops SET ${cols.map((c) => `${c} = ?${jsonCols.has(c) ? '::jsonb' : ''}`).join(', ')}, profile_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE ${OWNER_SCOPE} RETURNING id`;
  const row = db.prepare(sql).get(...cols.map((c) => set[c]), shop.id, userId);
  if (!row) throw new P.InputError('You do not manage this business.');
  if (categories) {
    // The database layer serializes array parameters, so lists travel as comma-separated strings.
    const list = categories.join(',');
    db.prepare("DELETE FROM shop_categories WHERE shop_id = ? AND category <> ALL(string_to_array(?, ',')) AND EXISTS (SELECT 1 FROM shops WHERE " + OWNER_SCOPE + ')').run(shop.id, list, shop.id, userId);
    db.prepare("INSERT INTO shop_categories (shop_id, category, source) SELECT ?, c, 'owner' FROM unnest(string_to_array(?, ',')) AS c WHERE EXISTS (SELECT 1 FROM shops WHERE " + OWNER_SCOPE + ') ON CONFLICT DO NOTHING').run(shop.id, list, shop.id, userId);
  }
}

// Reorders one row up or down by rewriting a bounded list's sort_order in a single statement.
function move(table, shopId, id, dir) {
  const rows = db.prepare(P.FRESH + `SELECT id FROM ${table} WHERE shop_id = ? ORDER BY sort_order, id`).all(shopId).map((r) => Number(r.id));
  const i = rows.indexOf(Number(id)), j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  db.prepare(`UPDATE ${table} t SET sort_order = x.ord - 1 FROM unnest(string_to_array(?, ',')::bigint[]) WITH ORDINALITY AS x(id, ord) WHERE t.id = x.id AND t.shop_id = ?`).run(rows.join(','), shopId);
}

module.exports = function (router) {
  router.get('/dashboard/shop', async (ctx) => {
    if (sponsorshipEnabled() && ['basics', 'profile'].includes(ctx.query?.setup)) {
      const o = owner(ctx); if (!o) return;
      const { setupView } = require('../lib/business-setup-view');
      return send(ctx.res, layout({ title: 'Business setup', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body: setupView(o.shop, ctx, ctx.query.setup) }));
    }
    const o = owner(ctx); if (!o) return;
    render(ctx, o.shop, o.shops, { tab: ctx.query?.tab, step: ctx.query?.step });
  });

  router.post('/dashboard/shop/profile', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const parts = SECTIONS[ctx.body.section];
    if (!parts) return back(ctx, o.shop, 'tab=overview', 'Unknown form.', 'error');
    try {
      saveProfile(o.shop, ctx.currentUser.id, readProfile(ctx.body, parts));
      return back(ctx, o.shop, where(ctx, ctx.body.section === 'settings' ? 'tab=settings' : ctx.body.section === 'about' ? 'step=3' : ctx.body.section === 'setup1' ? 'step=2' : 'tab=profile'), 'Saved.');
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      // Re-render with what the owner typed so nothing is lost.
      const typed = { ...o.shop, ...Object.fromEntries(Object.entries(ctx.body).filter(([k]) => !k.startsWith('_') && k !== 'shop')) };
      try { typed.hours = P.parseHours(ctx.body); } catch { typed.hours = o.shop.hours; }
      typed.specialties = P.parseSpecialties(ctx.body.specialties ?? (o.shop.specialties || []).join(','));
      const stepMatch = /step=(\d)/.exec(String(ctx.body.next || ''));
      const step = ctx.body.section === 'setup1' ? 1 : ctx.body.section === 'about' && stepMatch ? 2 : null;
      return render(ctx, typed, o.shops, { tab: ctx.body.section === 'settings' ? 'settings' : 'profile', step, flash: { type: 'error', message: err.message }, status: 422 });
    }
  });

  router.post('/dashboard/shop/media', async (ctx) => {
    const o = owner(ctx, { json: true }); if (!o) return;
    const reply = (status, body) => sendJson(ctx.res, status, body);
    const purpose = ['logo', 'cover', 'photo'].includes(ctx.body.purpose) ? ctx.body.purpose : null;
    if (!purpose) return reply(400, { ok: false, error: 'Unknown upload.' });
    let image;
    try { image = P.decodeImage(ctx.body.image_data); } catch (err) { return reply(422, { ok: false, error: err.message }); }
    if (purpose === 'photo') {
      const n = Number(db.prepare(P.FRESH + 'SELECT count(*) AS n FROM shop_photos WHERE shop_id = ?').get(o.shop.id).n);
      if (n >= P.MAX_PHOTOS) return reply(422, { ok: false, error: `You can show up to ${P.MAX_PHOTOS} photos. Remove one to add another.` });
    }
    let url;
    try { url = await P.uploadShopImage(o.shop.id, purpose, image); } catch (err) { return reply(err instanceof P.InputError ? 503 : 502, { ok: false, error: err instanceof P.InputError ? err.message : 'Upload failed. Please try again.' }); }
    const dim = (x) => (Number.isInteger(Number(x)) && Number(x) > 0 && Number(x) < 20000 ? Number(x) : null);
    if (purpose === 'photo') {
      const kind = P.PHOTO_KINDS[ctx.body.kind] ? ctx.body.kind : 'other';
      const row = db.prepare(`INSERT INTO shop_photos (shop_id, image_url, caption, kind, width, height, sort_order, uploaded_by)
        SELECT s.id, ?, ?, ?, ?, ?, COALESCE((SELECT max(sort_order) + 1 FROM shop_photos WHERE shop_id = s.id), 0), ? FROM shops s WHERE ${OWNER_SCOPE.replace(/(\w+) =/g, 's.$1 =')} RETURNING id`)
        .get(url, P.clean(ctx.body.caption, 140), kind, dim(ctx.body.width), dim(ctx.body.height), ctx.currentUser.id, o.shop.id, ctx.currentUser.id);
      if (!row) { await P.deleteShopImage(o.shop.id, url); return reply(403, { ok: false, error: 'You do not manage this business.' }); }
      return reply(200, { ok: true, id: row.id, url });
    }
    const column = purpose === 'logo' ? 'logo_url' : 'cover_url';
    const row = db.prepare(`UPDATE shops SET ${column} = ?, ${purpose === 'cover' ? 'cover_position = 50, ' : ''}profile_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE ${OWNER_SCOPE} RETURNING id`).get(url, o.shop.id, ctx.currentUser.id);
    if (!row) { await P.deleteShopImage(o.shop.id, url); return reply(403, { ok: false, error: 'You do not manage this business.' }); }
    await P.deleteShopImage(o.shop.id, o.shop[column]);
    return reply(200, { ok: true, url });
  });

  router.post('/dashboard/shop/media/remove', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const column = ctx.body.purpose === 'logo' ? 'logo_url' : ctx.body.purpose === 'cover' ? 'cover_url' : null;
    if (!column) return back(ctx, o.shop, 'tab=profile', 'Unknown image.', 'error');
    db.prepare(`UPDATE shops SET ${column} = '', profile_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE ${OWNER_SCOPE}`).run(o.shop.id, ctx.currentUser.id);
    await P.deleteShopImage(o.shop.id, o.shop[column]);
    back(ctx, o.shop, where(ctx, 'tab=profile'), column === 'logo_url' ? 'Logo removed.' : 'Cover photo removed.');
  });

  router.post('/dashboard/shop/cover-position', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const pos = Math.max(0, Math.min(100, Math.round(Number(ctx.body.cover_position))));
    if (!Number.isFinite(pos)) return back(ctx, o.shop, 'tab=profile', 'Choose a position.', 'error');
    db.prepare(`UPDATE shops SET cover_position = ?, profile_updated_at = CURRENT_TIMESTAMP WHERE ${OWNER_SCOPE}`).run(pos, o.shop.id, ctx.currentUser.id);
    back(ctx, o.shop, where(ctx, 'tab=profile'), 'Cover position saved.');
  });

  // Photos: caption/type, delete, reorder. All scoped by shop_id of a shop this user owns.
  router.post('/dashboard/shop/photos/:id', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const kind = P.PHOTO_KINDS[ctx.body.kind] ? ctx.body.kind : 'other';
    const row = db.prepare('UPDATE shop_photos SET caption = ?, kind = ? WHERE id = ? AND shop_id = ? RETURNING id').get(P.clean(ctx.body.caption, 140), kind, Number(ctx.params.id), o.shop.id);
    back(ctx, o.shop, 'tab=photos', row ? 'Photo updated.' : 'Photo not found.', row ? 'success' : 'error');
  });
  router.post('/dashboard/shop/photos/:id/delete', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const row = db.prepare('DELETE FROM shop_photos WHERE id = ? AND shop_id = ? RETURNING image_url').get(Number(ctx.params.id), o.shop.id);
    if (row) await P.deleteShopImage(o.shop.id, row.image_url);
    back(ctx, o.shop, 'tab=photos', row ? 'Photo deleted.' : 'Photo not found.', row ? 'success' : 'error');
  });
  router.post('/dashboard/shop/photos/:id/move', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    move('shop_photos', o.shop.id, ctx.params.id, ctx.query?.dir === 'up' ? 'up' : 'down');
    back(ctx, o.shop, 'tab=photos', 'Order updated.');
  });

  // Services.
  router.post('/dashboard/shop/services', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    try {
      const s = P.parseService(ctx.body);
      const n = Number(db.prepare(P.FRESH + 'SELECT count(*) AS n FROM shop_services WHERE shop_id = ?').get(o.shop.id).n);
      if (n >= P.MAX_SERVICES) throw new P.InputError(`You can list up to ${P.MAX_SERVICES} services.`);
      db.prepare(`INSERT INTO shop_services (shop_id, category, name, description, price_cents, price_type, duration_minutes, sort_order)
        SELECT id, ?, ?, ?, ?, ?, ?, ? FROM shops WHERE ${OWNER_SCOPE}`).run(s.category, s.name, s.description, s.price_cents, s.price_type, s.duration_minutes, n, o.shop.id, ctx.currentUser.id);
      back(ctx, o.shop, ctx.query?.step || /step=3/.test(String(ctx.req?.headers?.referer || '')) ? 'step=3' : 'tab=services', `Added ${s.name}.`);
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      back(ctx, o.shop, /step=3/.test(String(ctx.req?.headers?.referer || '')) ? 'step=3' : 'tab=services', err.message, 'error');
    }
  });
  router.post('/dashboard/shop/services/:id', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    try {
      const s = P.parseService(ctx.body);
      const row = db.prepare(`UPDATE shop_services SET category = ?, name = ?, description = ?, price_cents = ?, price_type = ?, duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND shop_id = ? RETURNING id`).get(s.category, s.name, s.description, s.price_cents, s.price_type, s.duration_minutes, Number(ctx.params.id), o.shop.id);
      back(ctx, o.shop, 'tab=services', row ? 'Service updated.' : 'Service not found.', row ? 'success' : 'error');
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      back(ctx, o.shop, 'tab=services', err.message, 'error');
    }
  });
  router.post('/dashboard/shop/services/:id/delete', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const row = db.prepare('DELETE FROM shop_services WHERE id = ? AND shop_id = ? RETURNING name').get(Number(ctx.params.id), o.shop.id);
    back(ctx, o.shop, 'tab=services', row ? `Deleted ${row.name}.` : 'Service not found.', row ? 'success' : 'error');
  });
  router.post('/dashboard/shop/services/:id/move', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    move('shop_services', o.shop.id, ctx.params.id, ctx.query?.dir === 'up' ? 'up' : 'down');
    back(ctx, o.shop, 'tab=services', 'Order updated.');
  });

  // Free team invitations.
  router.post('/dashboard/shop/invites', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const step = /step=5/.test(String(ctx.req?.headers?.referer || '')) ? 5 : null;
    try {
      const { valid, invalid } = P.parseEmails(ctx.body.emails);
      if (!valid.length) throw new P.InputError(invalid.length ? `Check these addresses: ${invalid.slice(0, 3).join(', ')}` : 'Enter at least one email address.');
      const results = P.createInvites(o.shop.id, valid, ctx.currentUser.id);
      const links = [];
      for (const r of results.filter((x) => x.token)) {
        const link = `${origin(ctx)}/team/invite/${r.token}`;
        const delivery = await P.sendInviteEmail({ to: r.email, shopName: o.shop.name, link });
        links.push({ email: r.email, link, emailed: delivery === 'sent' });
      }
      const why = { already_member: 'already on your team', already_invited: 'already invited', request_approved: 'they had asked to join, so they are now on your team', declines_invitations: 'they have chosen not to receive invitations from your business', team_full: 'team is full' };
      const skipped = results.filter((x) => !x.token).map((x) => `${x.email} (${why[x.status] || x.status})`);
      const message = [links.length ? `${links.length} invitation${links.length === 1 ? '' : 's'} created.` : '', skipped.length ? `Skipped ${skipped.join(', ')}.` : '', invalid.length ? `Not valid: ${invalid.join(', ')}.` : ''].filter(Boolean).join(' ');
      render(ctx, o.shop, o.shops, { tab: 'team', step, flash: { type: links.length ? 'success' : 'error', message }, extra: { inviteLinks: links } });
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      render(ctx, o.shop, o.shops, { tab: 'team', step, flash: { type: 'error', message: err.message }, status: 422 });
    }
  });
  router.post('/dashboard/shop/invites/:id/resend', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    try {
      const { email, token } = P.refreshInvite(o.shop.id, Number(ctx.params.id));
      const link = `${origin(ctx)}/team/invite/${token}`;
      const delivery = await P.sendInviteEmail({ to: email, shopName: o.shop.name, link });
      render(ctx, o.shop, o.shops, { tab: 'team', flash: { type: 'success', message: `New invitation link for ${email}. The previous link no longer works.` }, extra: { inviteLinks: [{ email, link, emailed: delivery === 'sent' }] } });
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      back(ctx, o.shop, 'tab=team', err.message, 'error');
    }
  });
  router.post('/dashboard/shop/invites/:id/cancel', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const row = P.cancelInvite(o.shop.id, Number(ctx.params.id));
    back(ctx, o.shop, 'tab=team', row ? 'Invitation canceled.' : 'Invitation not found.', row ? 'success' : 'error');
  });
  router.post('/dashboard/shop/members/:id/remove', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const row = P.removeMember(o.shop.id, Number(ctx.params.id));
    back(ctx, o.shop, 'tab=team', row ? 'Removed from your page.' : 'Team member not found.', row ? 'success' : 'error');
  });

  router.post('/dashboard/shop/publish', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    db.prepare(`UPDATE shops SET profile_published_at = COALESCE(profile_published_at, CURRENT_TIMESTAMP), profile_updated_at = CURRENT_TIMESTAMP WHERE ${OWNER_SCOPE}`).run(o.shop.id, ctx.currentUser.id);
    redirect(ctx.res, `/shop/${Number(o.shop.id)}?success=${encodeURIComponent('Your page is published.')}`);
  });
  router.post('/dashboard/shop/unpublish', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    db.prepare(`UPDATE shops SET profile_published_at = NULL WHERE ${OWNER_SCOPE}`).run(o.shop.id, ctx.currentUser.id);
    back(ctx, o.shop, 'tab=settings', 'Your page is unpublished. Customers now see your basic listing.');
  });

  router.post('/dashboard/shop/requests/:id/approve', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const row = P.approveRequest(o.shop.id, Number(ctx.params.id));
    back(ctx, o.shop, 'tab=team', row ? 'Request approved. They now appear on your page.' : 'That request is no longer waiting, or they have reached their workplace limit.', row ? 'success' : 'error');
  });
  router.post('/dashboard/shop/requests/:id/decline', async (ctx) => {
    const o = owner(ctx); if (!o) return;
    const row = P.rejectRequest(o.shop.id, Number(ctx.params.id));
    back(ctx, o.shop, 'tab=team', row ? 'Request declined.' : 'That request is no longer waiting.', row ? 'success' : 'error');
  });

  // ---- professional side ---------------------------------------------------------------------------------------
  function invitePage(ctx, invite, { status = 200, flash } = {}) {
    const token = String(ctx.params.token);
    const next = encodeURIComponent('/team/invite/' + token);
    const user = ctx.currentUser;
    const valid = invite && invite.status === 'pending' && new Date(invite.expires_at) > new Date() && invite.claim_status === 'claimed';
    let action;
    if (!valid) action = '<p>This invitation has expired or is no longer available. Ask the business to send you a new one.</p>';
    else if (!user) action = `<p>Sign in with <strong>${e(invite.email)}</strong> to accept.</p><div class="sd-actions"><a class="btn" href="/login?next=${next}">Sign in</a><a class="btn secondary" href="/signup?role=pro&next=${next}">Create a professional account</a></div><p class="sd-help">Already listed on GoBookr? <a href="/search?type=professionals">Find and claim your profile</a>, then return to this link.</p>`;
    else if (String(user.email || '').toLowerCase() !== String(invite.email).toLowerCase()) action = `<p>This invitation was sent to <strong>${e(invite.email)}</strong>, but you are signed in as ${e(user.email)}. Sign in with the invited email to accept.</p>`;
    else action = `<form method="POST" action="/team/invite/${e(token)}/accept"><input type="hidden" name="_csrf" value="${e(ctx.session?.csrf_token || '')}"><button class="btn" type="submit">Join ${e(invite.shop_name)}</button></form>
      <form method="POST" action="/team/invite/${e(token)}/decline" class="sd-inline-form"><input type="hidden" name="_csrf" value="${e(ctx.session?.csrf_token || '')}"><button class="sd-textbtn" type="submit">Decline</button></form>
      ${user.role !== 'pro' ? '<p class="sd-help">You need a GoBookr professional profile to join. <a href="/signup?role=pro">Set one up</a> or <a href="/search?type=professionals">claim yours</a>.</p>' : ''}`;
    send(ctx.res, layout({ title: invite ? `Join ${invite.shop_name} on GoBookr` : 'Team invitation', currentUser: user, session: ctx.session, robots: 'noindex,nofollow', flash,
      body: `<link rel="stylesheet" href="/shop-dashboard.css?v=1"><section class="section container sd sd-narrow"><div class="sd-card sd-invite-card"><p class="sd-crumb">Team invitation</p>
        <h1>${invite ? `Join ${e(invite.shop_name)}` : 'Team invitation'}</h1>${invite ? `<p class="sd-sub"><span>${e(invite.shop_city)}, ${e(invite.shop_state)}</span></p>` : ''}
        <p>Joining adds you to the business’s GoBookr page, linking to your own profile and booking. It is free and does not change your GoBookr plan or billing.</p>${action}</div></section>` }), status);
  }
  router.get('/team/invite/:token', async (ctx) => invitePage(ctx, P.findInvite(ctx.params.token), { status: P.findInvite(ctx.params.token) ? 200 : 404 }));
  router.post('/team/invite/:token/accept', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/team/invite/' + ctx.params.token));
    try {
      const shopId = P.acceptInvite(ctx.currentUser, ctx.params.token);
      redirect(ctx.res, `/dashboard/pro/businesses?success=${encodeURIComponent('You joined the team. You now appear on their business page.')}&shop=${Number(shopId)}`);
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      invitePage(ctx, P.findInvite(ctx.params.token), { status: 422, flash: { type: 'error', message: err.message } });
    }
  });
  router.post('/team/invite/:token/decline', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/team/invite/' + ctx.params.token));
    try { P.declineInvite(ctx.currentUser, ctx.params.token); } catch (err) { if (!(err instanceof P.InputError)) throw err; }
    redirect(ctx.res, '/?success=' + encodeURIComponent('Invitation declined.'));
  });
  router.get('/dashboard/pro/businesses', async (ctx) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') return redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/pro/businesses'));
    const pro = db.prepare(P.FRESH + 'SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
    const rows = pro ? P.proWorkplaces(pro.id, ctx.currentUser.email) : [];
    const sponsored = sponsorshipFor(pro);
    let nav = '';
    try { const { dashboardNav, PRO_NAV_ITEMS } = require('../lib/pro-dashboard-view'); nav = dashboardNav('workplaces', PRO_NAV_ITEMS); } catch (_) { nav = ''; }
    const notice = ctx.query?.sponsorship_ended ? `<div class="sd-card wp-sponsor-note" role="status"><h2>Your sponsored membership ended</h2><p class="sd-help">The business you left was paying for your GoBookr membership. Your account, profile and portfolio are unchanged and nothing has been charged. To keep Pro features after the current period, choose individual billing.</p><a class="btn small" href="/dashboard/pro/billing">Choose individual billing</a></div>` : '';
    send(ctx.res, layout({ title: 'My workplaces', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), robots: 'noindex,nofollow',
      body: WorkplacesView.page({ rows, csrf: ctx.session?.csrf_token || '', nav, sponsoredShopId: sponsored ? Number(sponsored.shop_id) : null, departedId: Number(ctx.query?.left) || null, notice }) }));
  });

  // Leave: authenticated POST (CSRF is enforced globally), only for the professional's own accepted connection.
  // No owner approval. Ends the affiliation only; the owner is notified afterwards.
  router.post('/dashboard/pro/businesses/:id/leave', async (ctx) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') return redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/pro/businesses'));
    const pro = db.prepare(P.FRESH + 'SELECT id, business_name FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
    const row = pro ? P.leaveShop(pro.id, Number(ctx.params.id), { blockInvites: ctx.body.block_invites === '1' }) : null;
    if (!row) return redirect(ctx.res, '/dashboard/pro/businesses?error=' + encodeURIComponent('That connection was not found or has already ended.'));
    // Optional paid sponsorship (flag-gated) ends with the affiliation; the professional's own billing is never started.
    let sponsorshipEnded = false;
    const sponsored = sponsorshipFor(pro);
    if (sponsored && Number(sponsored.shop_id) === Number(row.shop_id)) {
      try { await require('../lib/business-team').remove(row.shop_id, sponsored.id); sponsorshipEnded = true; }
      catch (err) { console.error('sponsorship end after leave failed', row.shop_id, err.message); sponsorshipEnded = true; }
    }
    await P.notifyOwnerOfDeparture({ memberId: row.id, shopId: row.shop_id, shopName: row.shop_name, ownerUserId: row.owner_user_id, proName: pro.business_name, origin: origin(ctx) });
    redirect(ctx.res, `/dashboard/pro/businesses?left=${Number(row.id)}${sponsorshipEnded ? '&sponsorship_ended=1' : ''}#workplace-${Number(row.id)}`);
  });
  router.post('/dashboard/pro/businesses/:id/allow-invites', async (ctx) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') return redirect(ctx.res, '/login');
    const pro = db.prepare(P.FRESH + 'SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
    const row = pro ? P.allowInvitesAgain(pro.id, Number(ctx.params.id)) : null;
    redirect(ctx.res, '/dashboard/pro/businesses?' + (row ? 'success=' + encodeURIComponent('That business can invite you again.') : 'error=' + encodeURIComponent('Not found.')));
  });
  router.post('/dashboard/pro/businesses/invites/:id/accept', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/pro/businesses'));
    try { P.acceptInviteById(ctx.currentUser, Number(ctx.params.id)); redirect(ctx.res, '/dashboard/pro/businesses?success=' + encodeURIComponent('You joined the team. You now appear on their business page.')); }
    catch (err) { if (!(err instanceof P.InputError)) throw err; redirect(ctx.res, '/dashboard/pro/businesses?error=' + encodeURIComponent(err.message)); }
  });
  router.post('/dashboard/pro/businesses/invites/:id/decline', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/pro/businesses'));
    try { P.declineInviteById(ctx.currentUser, Number(ctx.params.id), { block: ctx.body.block_invites === '1' }); redirect(ctx.res, '/dashboard/pro/businesses?success=' + encodeURIComponent(ctx.body.block_invites === '1' ? 'Invitation declined. That business can’t invite you again unless you allow it.' : 'Invitation declined.')); }
    catch (err) { if (!(err instanceof P.InputError)) throw err; redirect(ctx.res, '/dashboard/pro/businesses?error=' + encodeURIComponent(err.message)); }
  });
  router.post('/dashboard/pro/businesses/requests/:id/cancel', async (ctx) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') return redirect(ctx.res, '/login');
    const pro = db.prepare(P.FRESH + 'SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
    const row = pro ? P.cancelRequest(pro.id, Number(ctx.params.id)) : null;
    redirect(ctx.res, '/dashboard/pro/businesses?' + (row ? 'success=' + encodeURIComponent('Request canceled.') : 'error=' + encodeURIComponent('That request was not found.')));
  });
  // Ask to join a claimed business (from its public page). The owner approves from their Team tab.
  router.post('/shop/:id/join', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/shop/' + id));
    try {
      const r = P.requestToJoin(ctx.currentUser, id);
      redirect(ctx.res, `/shop/${id}?success=` + encodeURIComponent(r.status === 'joined' ? `You joined ${r.shop.name}. You now appear on their page.` : `Request sent. ${r.shop.name} will see it on their dashboard.`));
    } catch (err) {
      if (!(err instanceof P.InputError)) throw err;
      redirect(ctx.res, `/shop/${id}?error=` + encodeURIComponent(err.message));
    }
  });
};
