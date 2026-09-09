'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
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

    const body = `
    <section class="section container">
      <h1>Find your next professional</h1>
      <div class="panel" style="max-width:720px;">
        <h3>Book directly with professionals</h3>
        <p>GoBookr helps you discover the right local professional. When a professional has online booking connected, tap <strong>Book Appointment</strong> on their profile to continue to their scheduling site.</p>
        <a class="btn" href="/search">Browse professionals</a>
      </div>
    </section>`;

    send(ctx.res, layout({
      title: 'Customer dashboard',
      currentUser: ctx.currentUser,
      session: ctx.session,
      flash: flashFromQuery(ctx.query),
      body
    }));
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
