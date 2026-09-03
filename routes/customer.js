'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml, formatDate, stars } = require('../lib/util');

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

    const requests = db
      .prepare(
        `SELECT booking_requests.*, pro_profiles.business_name, pro_profiles.id AS pro_profile_id
         FROM booking_requests
         JOIN pro_profiles ON pro_profiles.id = booking_requests.pro_id
         WHERE customer_id = ?
         ORDER BY created_at DESC`
      )
      .all(ctx.currentUser.id);

    const myReviews = db
      .prepare('SELECT pro_id FROM reviews WHERE customer_id = ?')
      .all(ctx.currentUser.id);

    const reviewedProIds = new Set(myReviews.map((r) => r.pro_id));

    const body = `
    <section class="section container">
      <h1>Your requests</h1>

      ${
        requests.length
          ? requests
              .map((r) => {
                const canReview =
                  r.status === 'completed' &&
                  !reviewedProIds.has(r.pro_profile_id);

                return `
              <div class="request-card">
                <div class="top">
                  <div>
                    <div style="font-weight:700;">
                      <a
                        href="/pro/${r.pro_profile_id}"
                        style="color:var(--brand);"
                      >
                        ${escapeHtml(r.business_name)}
                      </a>
                      — ${escapeHtml(r.service_name)}
                    </div>

                    <div class="muted">
                      ${
                        r.preferred_date
                          ? 'Requested for ' + escapeHtml(r.preferred_date)
                          : 'No date specified'
                      }
                      · ${formatDate(r.created_at)}
                    </div>
                  </div>

                  <span class="status-pill ${r.status}">
                    ${r.status}
                  </span>
                </div>

                ${
                  r.message
                    ? `<p style="margin-top:8px;">"${escapeHtml(r.message)}"</p>`
                    : ''
                }

                ${
                  canReview
                    ? `
                <form
                  method="POST"
                  action="/reviews"
                  style="
                    margin-top:16px;
                    border-top:1px solid var(--paper-line);
                    padding-top:16px;
                  "
                >
                  <input
                    type="hidden"
                    name="_csrf"
                    value="${escapeHtml(ctx.session.csrf_token)}"
                  />

                  <input
                    type="hidden"
                    name="pro_id"
                    value="${r.pro_profile_id}"
                  />

                  <h3 style="margin:0 0 12px;">
                    Leave a review
                  </h3>

                  <div class="field">
                    <label for="rating-${r.id}">
                      Rating
                    </label>

                    <select
                      id="rating-${r.id}"
                      name="rating"
                      required
                    >
                      <option value="5">
                        ${stars(5)} 5 stars
                      </option>

                      <option value="4">
                        ${stars(4)} 4 stars
                      </option>

                      <option value="3">
                        ${stars(3)} 3 stars
                      </option>

                      <option value="2">
                        ${stars(2)} 2 stars
                      </option>

                      <option value="1">
                        ${stars(1)} 1 star
                      </option>
                    </select>
                  </div>

                  <div class="field">
                    <label for="comment-${r.id}">
                      Tell others about your experience
                      <span class="muted">(optional)</span>
                    </label>

                    <textarea
                      id="comment-${r.id}"
                      name="comment"
                      rows="3"
                      maxlength="1000"
                      placeholder="Share details about your experience..."
                    ></textarea>
                  </div>

                  <button
                    class="btn small"
                    type="submit"
                  >
                    Post review
                  </button>
                </form>
                `
                    : reviewedProIds.has(r.pro_profile_id) &&
                        r.status === 'completed'
                      ? `
                        <p
                          class="muted"
                          style="margin-top:10px;"
                        >
                          ✓ You reviewed this professional.
                        </p>
                      `
                      : ''
                }
              </div>
              `;
              })
              .join('')
          : `
            <div class="empty-state">
              <h3>No requests yet</h3>

              <p>
                Once you request a booking with a pro,
                it'll show up here.
              </p>

              <a
                class="btn"
                href="/search"
              >
                Find a pro
              </a>
            </div>
          `
      }
    </section>
    `;

    send(
      ctx.res,
      layout({
        title: 'Your requests',
        currentUser: ctx.currentUser,
        session: ctx.session,
        flash: flashFromQuery(ctx.query),
        body
      })
    );
  });

  router.post('/bookings', async (ctx) => {
    if (!requireCustomer(ctx)) return;

    const {
      pro_id,
      service_name,
      preferred_date,
      message
    } = ctx.body;

    const pro = db
      .prepare('SELECT id FROM pro_profiles WHERE id = ?')
      .get(pro_id);

    if (!pro || !service_name) {
      return redirect(
        ctx.res,
        `/pro/${pro_id || ''}?error=${encodeURIComponent(
          'Please choose a service.'
        )}`
      );
    }

    db.prepare(
      `INSERT INTO booking_requests
       (customer_id, pro_id, service_name, preferred_date, message)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      ctx.currentUser.id,
      pro.id,
      service_name,
      preferred_date || '',
      message || ''
    );

    redirect(
      ctx.res,
      `/pro/${pro.id}?success=${encodeURIComponent(
        'Request sent! Track it from your dashboard.'
      )}`
    );
  });

  router.post('/reviews', async (ctx) => {
    if (!requireCustomer(ctx)) return;

    const {
      pro_id,
      rating,
      comment
    } = ctx.body;

    const pro = db
      .prepare('SELECT id FROM pro_profiles WHERE id = ?')
      .get(pro_id);

    const r = Number(rating);

    if (
      !pro ||
      !Number.isInteger(r) ||
      r < 1 ||
      r > 5
    ) {
      return redirect(
        ctx.res,
        '/dashboard/customer?error=' +
          encodeURIComponent('Invalid review.')
      );
    }

    // A customer can only review a professional
    // after a completed GoBookr booking.
    const hasCompleted = db
      .prepare(
        `SELECT id
         FROM booking_requests
         WHERE customer_id = ?
         AND pro_id = ?
         AND status = 'completed'`
      )
      .get(
        ctx.currentUser.id,
        pro.id
      );

    // One review per customer per professional.
    const alreadyReviewed = db
      .prepare(
        `SELECT id
         FROM reviews
         WHERE customer_id = ?
         AND pro_id = ?`
      )
      .get(
        ctx.currentUser.id,
        pro.id
      );

    if (!hasCompleted) {
      return redirect(
        ctx.res,
        '/dashboard/customer?error=' +
          encodeURIComponent(
            'You can only review professionals after a completed booking.'
          )
      );
    }

    if (alreadyReviewed) {
      return redirect(
        ctx.res,
        '/dashboard/customer?error=' +
          encodeURIComponent(
            'You already reviewed this professional.'
          )
      );
    }

    const cleanComment =
      typeof comment === 'string'
        ? comment.trim().slice(0, 1000)
        : '';

    db.prepare(
      `INSERT INTO reviews
       (pro_id, customer_id, rating, comment)
       VALUES (?, ?, ?, ?)`
    ).run(
      pro.id,
      ctx.currentUser.id,
      r,
      cleanComment
    );

    redirect(
      ctx.res,
      '/dashboard/customer?success=' +
        encodeURIComponent('Your review has been posted!')
    );
  });
};
