'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml: e } = require('../lib/util');
const { isProPubliclyVisible } = require('../lib/subscription');
const { hydratePros } = require('../lib/pro-listing-data');
const { dashboardNav } = require('../lib/pro-dashboard-view');
const { followReturnPath, followControl, currentFollowers, followedUpdates, renderUpdate } = require('../lib/following');

function customer(ctx) {
  if (!ctx.currentUser) { redirect(ctx.res, '/login?next=%2Ffollowing'); return false; }
  if (ctx.currentUser.role !== 'customer') { send(ctx.res, 'Following is available to customer accounts.', 403); return false; }
  return true;
}
function owner(ctx) {
  if (!ctx.currentUser) { redirect(ctx.res, '/login?next=%2Fdashboard%2Fpro%2Fupdates'); return null; }
  if (ctx.currentUser.role !== 'pro') { send(ctx.res, 'Professional account required.', 403); return null; }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) send(ctx.res, 'Professional profile not found.', 404);
  return profile;
}

module.exports = function(router) {
  router.get('/following', async ctx => {
    if (!customer(ctx)) return;
    const rawBefore = ctx.query.before;
    const before = rawBefore === undefined ? null : Number(rawBefore);
    if (rawBefore !== undefined && (!Number.isSafeInteger(before) || before <= 0)) return send(ctx.res, 'Invalid feed page.', 400);
    const { updates, next } = followedUpdates(ctx.currentUser.id, before);
    const followed = db.prepare(`WITH follows AS (SELECT pro_id, created_at FROM customer_follows WHERE customer_id = ?)
      SELECT p.*, f.created_at AS followed_at FROM follows f JOIN pro_profiles p ON p.id = f.pro_id
      ORDER BY f.created_at DESC, p.id DESC LIMIT 100`).all(ctx.currentUser.id);
    const visibleIds = new Set(hydratePros(followed, { includeServices: false }).map(p => Number(p.id)));
    const total = Number(db.prepare('WITH follows AS (SELECT COUNT(*) AS total FROM customer_follows WHERE customer_id = ?) SELECT total FROM follows').get(ctx.currentUser.id).total);
    const body = `<link rel="stylesheet" href="/following.css"><section class="section container following-page">
      <header class="following-hero"><div><p class="muted">YOUR GOBOOKR</p><h1>Following</h1><p>Fresh work and updates from professionals you follow.</p></div><a class="btn secondary" href="/search">Find professionals</a></header>
      <nav class="following-tabs" aria-label="Customer workspace"><a href="/dashboard/customer">Favorites &amp; account</a><a href="/following" aria-current="page">Following</a></nav>
      <div class="following-layout"><main><h2>Latest updates</h2>${updates.map(p => renderUpdate(p, p)).join('') || `<div class="panel"><h3>${total ? 'You’re all caught up' : 'Make this feed yours'}</h3><p>${total ? 'No updates on this page. New posts from your followed professionals will appear here.' : 'Open a professional’s profile and choose Follow for updates. Favorites stay separate for quick access.'}</p><a class="btn secondary" href="/search">Browse professionals</a></div>`}
      ${next ? `<a class="btn secondary" href="/following?before=${next}">Older updates</a>` : ''}${before ? '<p><a href="/following">Back to newest updates</a></p>' : ''}</main>
      <aside><div class="panel"><h2>Professionals you follow</h2><p class="muted">${total} following · private to you. Professionals see only their follower total.</p>${followed.map(p => `<div class="following-person">${visibleIds.has(Number(p.id)) ? `<h3><a href="/pro/${p.id}">${e(p.business_name)}</a></h3><p class="muted">${e(p.city)}, ${e(p.state)}</p>` : '<h3>Professional currently unavailable</h3>'}${followControl(visibleIds.has(Number(p.id)) ? p : { ...p, business_name: 'this professional' }, ctx, true, '/following')}</div>`).join('') || '<p>Not following anyone yet.</p>'}${total > 100 ? '<p class="muted">Showing your 100 most recently followed professionals.</p>' : ''}</div></aside></div></section>`;
    send(ctx.res, layout({ title: 'Following', robots: 'noindex, nofollow', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/following/:id', async ctx => {
    if (!customer(ctx)) return;
    const id = Number(ctx.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !['0', '1'].includes(ctx.body.following)) return send(ctx.res, 'Invalid follow request.', 400);
    if (ctx.body.following === '1') {
      if (!isProPubliclyVisible(id)) return send(ctx.res, 'Professional not found.', 404);
      db.prepare('INSERT INTO customer_follows(customer_id, pro_id) VALUES (?, ?) ON CONFLICT(customer_id, pro_id) DO NOTHING').run(ctx.currentUser.id, id);
    } else db.prepare('DELETE FROM customer_follows WHERE customer_id = ? AND pro_id = ?').run(ctx.currentUser.id, id);
    redirect(ctx.res, followReturnPath(ctx.body.return_to, id));
  });

  router.get('/dashboard/pro/updates', async ctx => {
    const profile = owner(ctx); if (!profile) return;
    const photos = db.prepare("SELECT id, caption FROM portfolio_items WHERE pro_id = ? AND image_url IS NOT NULL AND image_url <> '' ORDER BY id DESC LIMIT 50").all(profile.id);
    const updates = db.prepare(`WITH updates AS (SELECT * FROM pro_updates WHERE pro_id = ? ORDER BY id DESC LIMIT 30)
      SELECT u.*, pi.image_url FROM updates u LEFT JOIN portfolio_items pi ON pi.id = u.portfolio_item_id AND pi.pro_id = u.pro_id ORDER BY u.id DESC`).all(profile.id);
    const publishable = isProPubliclyVisible(profile.id);
    const nav = dashboardNav('updates', [{key:'overview',label:'Overview',href:'/dashboard/pro'}, {key:'updates',label:'Updates',href:'/dashboard/pro/updates'}, {key:'marketing',label:'Marketing Center',href:'/dashboard/pro/marketing'}, {key:'portfolio',label:'Portfolio',href:'/dashboard/pro/portfolio'}]);
    const body = `<link rel="stylesheet" href="/following.css"><section class="section container pro-dashboard"><div class="dash-layout">${nav}<div class="pro-main">
      <h1>Updates for your followers</h1><p>Share fresh work, news, or a reason to book. Posts appear on your GoBookr profile and in your followers’ feed.</p><p class="muted">${currentFollowers(profile.id)} followers · follower identities stay private.</p>
      ${publishable ? '' : '<div class="panel"><p>Your profile must be public before you can publish updates.</p><a href="/dashboard/pro/onboarding?step=resume">Review your setup</a> · <a href="/dashboard/pro/billing">Review your plan</a></div>'}
      <div class="panel"><h2>Publish an update</h2><form method="POST" action="/dashboard/pro/updates"><input type="hidden" name="_csrf" value="${e(ctx.session.csrf_token)}">
      <div class="field"><label for="update-message">Your message</label><textarea id="update-message" name="message" rows="5" maxlength="1000" required placeholder="Share something your customers will want to know…"></textarea><p class="helptext">Up to 1,000 characters. Publish only content and photos you have permission to share.</p></div>
      <div class="field"><label for="update-photo">Portfolio photo (optional)</label><select id="update-photo" name="photo"><option value="">Text only</option>${photos.map(p=>`<option value="${p.id}">${e(p.caption || 'Portfolio photo #' + p.id)}</option>`).join('')}</select><a href="/dashboard/pro/portfolio">Add a new portfolio photo</a></div>
      <button class="btn" type="submit"${publishable ? '' : ' disabled'}>Publish on GoBookr</button></form><p class="muted">This does not post to Facebook, Instagram, or Snapchat. Use <a href="/dashboard/pro/marketing">Marketing Center</a> to prepare and share a social Story.</p></div>
      <h2>Your latest updates</h2>${updates.map(u=>`${renderUpdate(u)}<div class="update-actions"><a class="btn secondary small" href="/dashboard/pro/marketing?campaign=portfolio&copy=${encodeURIComponent(u.message.slice(0,500))}${u.portfolio_item_id ? '&photo=' + u.portfolio_item_id : ''}">Prepare a social Story</a>${u.status === 'published' ? `<form method="POST" action="/dashboard/pro/updates/${u.id}/hide"><input type="hidden" name="_csrf" value="${e(ctx.session.csrf_token)}"><button class="btn secondary small" type="submit">Hide update</button></form>` : '<span class="muted">Hidden from customers</span>'}</div>`).join('') || '<div class="panel"><p>No updates yet. Your first post can be text only.</p></div>'}
      </div></div></section>`;
    send(ctx.res, layout({ title: 'Professional updates', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/updates', async ctx => {
    const profile = owner(ctx); if (!profile) return;
    if (!isProPubliclyVisible(profile.id)) return redirect(ctx.res, '/dashboard/pro/updates?error=' + encodeURIComponent('Publish your profile and confirm your plan before posting updates.'));
    const message = typeof ctx.body.message === 'string' ? ctx.body.message.trim() : '';
    if (!message || message.length > 1000) return redirect(ctx.res, '/dashboard/pro/updates?error=' + encodeURIComponent('Add a message of 1 to 1,000 characters.'));
    const photo = ctx.body.photo ? Number(ctx.body.photo) : null;
    if (photo !== null && (!Number.isSafeInteger(photo) || photo <= 0 || !db.prepare("SELECT id FROM portfolio_items WHERE id = ? AND pro_id = ? AND image_url IS NOT NULL AND image_url <> ''").get(photo, profile.id))) return send(ctx.res, 'Choose a photo from your own portfolio.', 400);
    const posted = db.prepare("WITH recent AS (SELECT COUNT(*) AS total FROM pro_updates WHERE pro_id = ? AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 day') SELECT total FROM recent").get(profile.id);
    if (Number(posted.total) >= 20) return redirect(ctx.res, '/dashboard/pro/updates?error=' + encodeURIComponent('You can publish up to 20 updates per day. Try again later.'));
    db.prepare('INSERT INTO pro_updates(pro_id, message, portfolio_item_id) VALUES (?, ?, ?)').run(profile.id, message, photo);
    redirect(ctx.res, '/dashboard/pro/updates?success=' + encodeURIComponent('Your update is live on GoBookr.'));
  });

  router.post('/dashboard/pro/updates/:id/hide', async ctx => {
    const profile = owner(ctx); if (!profile) return;
    const id = Number(ctx.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return send(ctx.res, 'Invalid update.', 400);
    const result = db.prepare("UPDATE pro_updates SET status = 'hidden' WHERE id = ? AND pro_id = ? AND status = 'published'").run(id, profile.id);
    if (!result.changes) return send(ctx.res, 'Published update not found.', 404);
    redirect(ctx.res, '/dashboard/pro/updates?success=' + encodeURIComponent('Update hidden from your profile and followers.'));
  });
};
