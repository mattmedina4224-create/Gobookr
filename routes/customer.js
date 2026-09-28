'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { favoriteControl, favoriteReturnPath } = require('../lib/favorites');
const { hydratePros } = require('../lib/pro-listing-data');
const { isProPubliclyVisible } = require('../lib/subscription');
const { escapeHtml } = require('../lib/util');

function requireCustomer(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'customer') {
    redirect(ctx.res, `/login?next=${encodeURIComponent('/dashboard/customer')}`);
    return false;
  }
  return true;
}

module.exports = function (router) {
  router.get('/dashboard/customer', async (ctx) => {
    if (!requireCustomer(ctx)) return;

    const savedProfiles = db.prepare(`WITH favorites AS (
      SELECT pro_id, created_at FROM customer_favorites WHERE customer_id = ?
    ) SELECT p.* FROM favorites f JOIN pro_profiles p ON p.id = f.pro_id
      ORDER BY f.created_at DESC, p.id DESC`).all(ctx.currentUser.id);
    const visibleProfiles = hydratePros(savedProfiles, { includeServices: false });
    const visibleIds = new Set(visibleProfiles.map(pro => Number(pro.id)));
    const favorites = savedProfiles.map(pro => `<div class="panel favorite-dashboard-card">
      ${visibleIds.has(Number(pro.id)) ? `<div class="favorite-pro-identity">${pro.profile_photo_url ? `<img class="favorite-pro-photo" src="${escapeHtml(pro.profile_photo_url)}" alt="${escapeHtml(pro.business_name)} profile photo" />` : `<div class="favorite-pro-photo avatar accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials || "GB")}</div>`}<div><h3><a href="/pro/${pro.id}">${escapeHtml(pro.business_name)}</a></h3>${pro.professional_handle ? `<div class="profile-handle">@${escapeHtml(pro.professional_handle)}</div>` : ""}<p class="muted">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</p><a href="/pro/${pro.id}">View profile &amp; booking options</a></div></div>` : '<div><h3>Professional currently unavailable</h3><p class="muted">You can keep this favorite or remove it.</p></div>'}
      ${favoriteControl(pro, ctx, true, '/dashboard/customer')}
    </div>`).join('');
    const body = `
    <section class="section container customer-dashboard">
      <div class="customer-dashboard-hero"><div><p class="muted customer-eyebrow">YOUR GOBOOKR</p><h1>Find your next professional</h1><p class="muted">Discover someone new or jump back to a professional you already trust.</p></div><a class="btn customer-browse-btn" href="/search">Find a professional</a></div>
      <section aria-labelledby="favorites-heading" class="customer-favorites-section">
        <h2 id="favorites-heading">Favorites</h2>
        <p class="muted">Your saved professionals, ready when you are. Favorites are private; professionals only see their total Saves.</p>
        ${favorites || '<div class="panel"><p>No favorites yet. When you find someone you like, tap the heart and they’ll be waiting here for you.</p><a class="btn secondary" href="/search">Find professionals</a></div>'}
      </section>
    </section>`;

    send(ctx.res, layout({
      title: 'Customer dashboard',
      currentUser: ctx.currentUser,
      session: ctx.session,
      flash: flashFromQuery(ctx.query),
      body
    }));
  });

  router.post('/favorites/:id', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=%2Fdashboard%2Fcustomer');
    if (ctx.currentUser.role !== 'customer') return send(ctx.res, 'Favorites are available to customer accounts.', 403);
    const proId = Number(ctx.params.id);
    if (!Number.isSafeInteger(proId) || proId <= 0 || !['0', '1'].includes(ctx.body.saved)) {
      return send(ctx.res, 'Invalid favorite request.', 400);
    }
    const returnTo = favoriteReturnPath(ctx.body.return_to, proId);
    try {
      if (ctx.body.saved === '1') {
        const pro = db.prepare('SELECT id FROM pro_profiles WHERE id = ?').get(proId);
        if (!pro || !isProPubliclyVisible(proId)) return send(ctx.res, 'Professional not found.', 404);
        db.prepare(`INSERT INTO customer_favorites (customer_id, pro_id) VALUES (?, ?)
          ON CONFLICT (customer_id, pro_id) DO NOTHING`).run(ctx.currentUser.id, proId);
      } else {
        db.prepare('DELETE FROM customer_favorites WHERE customer_id = ? AND pro_id = ?').run(ctx.currentUser.id, proId);
      }
    } catch (err) {
      console.error('Favorite update failed', err);
      return redirect(ctx.res, returnTo + (returnTo.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent('Could not update Favorites. Please try again.'));
    }
    redirect(ctx.res, returnTo);
  });

  // Legacy endpoint retained as a safe redirect for old links/forms.
  router.post('/bookings', async (ctx) => {
    if (!requireCustomer(ctx)) return;
    const proId = Number(ctx.body.pro_id);
    if (Number.isInteger(proId) && proId > 0) {
      return redirect(ctx.res, `/pro/${proId}?error=${encodeURIComponent('Bookings are now made directly through each professional’s scheduling link.')}`);
    }
    redirect(ctx.res, '/search');
  });

  router.post('/reviews', async (ctx) => {
    if (!requireCustomer(ctx)) return;

    const { pro_id, rating, comment } = ctx.body;
    const pro = db.prepare('SELECT id FROM pro_profiles WHERE id = ?').get(pro_id);
    const r = Number(rating);

    if (!pro || !Number.isInteger(r) || r < 1 || r > 5) {
      return redirect(ctx.res, '/dashboard/customer?error=' + encodeURIComponent('Invalid review.'));
    }

    const hasCompleted = db.prepare(`SELECT id FROM booking_requests WHERE customer_id = ? AND pro_id = ? AND status = 'completed'`).get(ctx.currentUser.id, pro.id);
    const alreadyReviewed = db.prepare(`SELECT id FROM reviews WHERE customer_id = ? AND pro_id = ?`).get(ctx.currentUser.id, pro.id);

    if (!hasCompleted) {
      return redirect(ctx.res, '/dashboard/customer?error=' + encodeURIComponent('Review verification is being updated for direct bookings.'));
    }

    if (alreadyReviewed) {
      return redirect(ctx.res, '/dashboard/customer?error=' + encodeURIComponent('You already reviewed this professional.'));
    }

    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 1000) : '';
    db.prepare(`INSERT INTO reviews (pro_id, customer_id, rating, comment) VALUES (?, ?, ?, ?)`).run(pro.id, ctx.currentUser.id, r, cleanComment);
    redirect(ctx.res, '/dashboard/customer?success=' + encodeURIComponent('Your review has been posted!'));
  });
};
