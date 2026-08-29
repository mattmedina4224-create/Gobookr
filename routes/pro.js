'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml, money, slugCategory, avgRating, stars, formatDate } = require('../lib/util');

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, `/login?next=${encodeURIComponent('/dashboard/pro')}`);
    return null;
  }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) {
    send(ctx.res, '<h1>500 — pro profile missing</h1>', 500);
    return null;
  }
  return profile;
}

function dashNav(active) {
  const items = [
    { key: 'overview', href: '/dashboard/pro', label: 'Overview' },
    { key: 'requests', href: '/dashboard/pro/requests', label: 'Booking requests' },
    { key: 'profile', href: '/dashboard/pro/profile', label: 'Profile & services' },
    { key: 'portfolio', href: '/dashboard/pro/portfolio', label: 'Portfolio' },
  ];
  return `<nav class="dash-nav">${items
    .map((i) => `<a href="${i.href}" class="${i.key === active ? 'active' : ''}">${i.label}</a>`)
    .join('')}</nav>`;
}

module.exports = function (router) {
  router.get('/dashboard/pro', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;

    const requests = db
      .prepare('SELECT * FROM booking_requests WHERE pro_id = ? ORDER BY created_at DESC')
      .all(profile.id);
    const reviews = db.prepare('SELECT rating FROM reviews WHERE pro_id = ?').all(profile.id);
    const pending = requests.filter((r) => r.status === 'pending').length;

    const body = `
    <section class="section container">
      <div class="dash-layout">
        ${dashNav('overview')}
        <div>
          <h1>Welcome back, ${escapeHtml(ctx.currentUser.name.split(' ')[0])}</h1>
          <div class="stat-cards">
            <div class="stat-card"><div class="num">${pending}</div><div class="label">Pending requests</div></div>
            <div class="stat-card"><div class="num">${requests.length}</div><div class="label">Total requests</div></div>
            <div class="stat-card"><div class="num">${avgRating(reviews) ?? '—'}</div><div class="label">Average rating</div></div>
            <div class="stat-card"><div class="num">${reviews.length}</div><div class="label">Reviews</div></div>
          </div>
          <div class="panel">
            <h3>Your public profile</h3>
            <p>${escapeHtml(profile.business_name)} · ${slugCategory(profile.category)} · ${escapeHtml(profile.city)}, ${escapeHtml(profile.state)}</p>
            <a class="btn secondary" href="/pro/${profile.id}">View public profile</a>
            <a class="btn ghost" href="/dashboard/pro/profile">Edit details</a>
          </div>
          <div class="panel">
            <h3>Recent requests</h3>
            ${
              requests.slice(0, 3).length
                ? requests
                    .slice(0, 3)
                    .map((r) => requestCard(r, profile, ctx))
                    .join('')
                : '<p class="muted">No booking requests yet.</p>'
            }
          </div>
        </div>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Pro dashboard', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/dashboard/pro/requests', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;

    const requests = db
      .prepare(
        `SELECT booking_requests.*, users.name AS customer_name FROM booking_requests
         JOIN users ON users.id = booking_requests.customer_id
         WHERE pro_id = ? ORDER BY created_at DESC`
      )
      .all(profile.id);

    const body = `
    <section class="section container">
      <div class="dash-layout">
        ${dashNav('requests')}
        <div>
          <h1>Booking requests</h1>
          ${
            requests.length
              ? requests.map((r) => requestCard(r, profile, ctx, true)).join('')
              : '<div class="empty-state"><h3>Nothing here yet</h3><p>Booking requests from customers will show up here.</p></div>'
          }
        </div>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Booking requests', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/requests/:id/status', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    const { status } = ctx.body;
    if (!['accepted', 'declined', 'completed'].includes(status)) {
      return redirect(ctx.res, '/dashboard/pro/requests?error=' + encodeURIComponent('Invalid status.'));
    }
    const req_ = db.prepare('SELECT * FROM booking_requests WHERE id = ? AND pro_id = ?').get(ctx.params.id, profile.id);
    if (!req_) return send(ctx.res, '<h1>404</h1>', 404);
    db.prepare('UPDATE booking_requests SET status = ? WHERE id = ?').run(status, req_.id);
    redirect(ctx.res, '/dashboard/pro/requests?success=' + encodeURIComponent('Request updated.'));
  });

  router.get('/dashboard/pro/profile', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(profile.id);

    const body = `
    <section class="section container">
      <div class="dash-layout">
        ${dashNav('profile')}
        <div>
          <h1>Profile &amp; services</h1>
          <div class="panel">
            <h3>Business details</h3>
            <form method="POST" action="/dashboard/pro/profile">
              <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
              <div class="field">
                <label for="business_name">Business name</label>
                <input id="business_name" name="business_name" value="${escapeHtml(profile.business_name)}" required />
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="city">City</label>
                  <input id="city" name="city" value="${escapeHtml(profile.city)}" required />
                </div>
                <div class="field">
                  <label for="state">State</label>
                  <input id="state" name="state" value="${escapeHtml(profile.state)}" maxlength="2" required />
                </div>
              </div>
              <div class="field">
    <label for="license_number">License #</label>
    <input
      id="license_number"
      name="license_number"
      value="${escapeHtml(profile.license_number || '')}"
      placeholder="e.g. BAR.1234567"
    />
  </div>

  <div class="field">
    <label for="license_state">License state</label>
    <input
      id="license_state"
      name="license_state"
      value="${escapeHtml(profile.license_state || profile.state || '')}"
      maxlength="2"
      placeholder="CO"
    />
  </div>
</div>
              <div class="field-row">
                <div class="field">
                  <label for="price_min">Starting price ($)</label>
                  <input id="price_min" type="number" name="price_min" value="${profile.price_min}" min="0" />
                </div>
                <div class="field">
                  <label for="price_max">Top price ($)</label>
                  <input id="price_max" type="number" name="price_max" value="${profile.price_max}" min="0" />
                </div>
              </div>
              <div class="field">
                <label for="years_experience">Years of experience</label>
                <input id="years_experience" type="number" name="years_experience" value="${profile.years_experience}" min="0" />
              </div>
              <div class="field">
                <label for="bio">About / bio</label>
                <textarea id="bio" name="bio" rows="4">${escapeHtml(profile.bio)}</textarea>
              </div>
              <button class="btn" type="submit">Save changes</button>
            </form>
          </div>

          <div class="panel">
            <h3>Services</h3>
            ${services
              .map(
                (s) => `
              <div class="service-row">
                <div>
                  <div class="name">${escapeHtml(s.name)}</div>
                  <div class="duration">${s.duration_minutes} min · ${money(s.price)}</div>
                </div>
                <form method="POST" action="/dashboard/pro/services/${s.id}/delete">
                  <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
                  <button class="btn ghost small" type="submit">Remove</button>
                </form>
              </div>`
              )
              .join('') || '<p class="muted">No services yet — add your first below.</p>'}

            <form method="POST" action="/dashboard/pro/services" style="margin-top:16px; border-top:1px solid var(--paper-line); padding-top:16px;">
              <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
              <div class="field-row">
                <div class="field">
                  <label for="name">Service name</label>
                  <input id="name" name="name" placeholder="e.g. Skin fade" required />
                </div>
                <div class="field">
                  <label for="price">Price ($)</label>
                  <input id="price" type="number" name="price" min="0" required />
                </div>
              </div>
              <div class="field">
                <label for="duration_minutes">Duration (minutes)</label>
                <input id="duration_minutes" type="number" name="duration_minutes" value="30" min="5" />
              </div>
              <button class="btn secondary" type="submit">Add service</button>
            </form>
          </div>
        </div>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Edit profile', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/profile', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    const { business_name, city, state, license_number, license_state, price_min, price_max, years_experience, bio } = ctx.body;
    db.prepare(
  `UPDATE pro_profiles
   SET business_name = ?,
       city = ?,
       state = ?,
       license_number = ?,
       license_state = ?,
       license_verified = 0,
       price_min = ?,
       price_max = ?,
       years_experience = ?,
       bio = ?
   WHERE id = ?`
).run(
  business_name || profile.business_name,
  (city || profile.city)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  state || profile.state,
  license_number || null,
  license_state || profile.state,
  Number(price_min) || 0,
  Number(price_max) || 0,
  Number(years_experience) || 0,
  bio || '',
  profile.id
);

    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent('Profile updated.'));
  });

  router.post('/dashboard/pro/services', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    const { name, price, duration_minutes } = ctx.body;
    if (!name || !price) {
      return redirect(ctx.res, '/dashboard/pro/profile?error=' + encodeURIComponent('Service name and price are required.'));
    }
    db.prepare('INSERT INTO services (pro_id, name, price, duration_minutes) VALUES (?, ?, ?, ?)').run(
      profile.id,
      name,
      Number(price),
      Number(duration_minutes) || 30
    );
    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent('Service added.'));
  });

  router.post('/dashboard/pro/services/:id/delete', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    db.prepare('DELETE FROM services WHERE id = ? AND pro_id = ?').run(ctx.params.id, profile.id);
    redirect(ctx.res, '/dashboard/pro/profile?success=' + encodeURIComponent('Service removed.'));
  });

  router.get('/dashboard/pro/portfolio', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    const items = db.prepare('SELECT * FROM portfolio_items WHERE pro_id = ?').all(profile.id);
    const accentColors = ['#6d3bf0', '#a06bff', '#e8a33d', '#f2c675', '#1c8a8a', '#4fc7c0', '#d13b6f', '#ef7ba0'];
    const gradientFor = (i) => `linear-gradient(135deg, ${accentColors[i % accentColors.length]}, ${accentColors[(i + 3) % accentColors.length]})`;

    const body = `
    <section class="section container">
      <div class="dash-layout">
        ${dashNav('portfolio')}
        <div>
          <h1>Portfolio</h1>
          <p class="helptext" style="margin-top:-4px;">This demo doesn't support photo uploads — add a short caption for each piece and it'll show as a styled placeholder tile on your profile.</p>
          <div class="panel">
            <div class="portfolio-grid">
              ${items
                .map(
                  (p, i) => `
                <div style="position:relative;">
                  <div class="portfolio-item" style="background:${gradientFor(i)};"><span>${escapeHtml(p.caption)}</span></div>
                  <form method="POST" action="/dashboard/pro/portfolio/${p.id}/delete" style="margin-top:6px;">
                    <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
                    <button class="btn ghost small" type="submit">Remove</button>
                  </form>
                </div>`
                )
                .join('') || '<p class="muted">No portfolio items yet.</p>'}
            </div>
            <form method="POST" action="/dashboard/pro/portfolio" style="margin-top:20px; border-top:1px solid var(--paper-line); padding-top:16px; max-width:360px;">
              <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
              <div class="field">
                <label for="caption">Caption</label>
                <input id="caption" name="caption" placeholder="e.g. Balayage transformation" required />
              </div>
              <button class="btn secondary" type="submit">Add portfolio item</button>
            </form>
          </div>
        </div>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Portfolio', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/portfolio', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    const { caption } = ctx.body;
    const accents = ['violet', 'gold', 'teal', 'rose', 'slate'];
    db.prepare('INSERT INTO portfolio_items (pro_id, caption, accent) VALUES (?, ?, ?)').run(
      profile.id,
      caption || 'Untitled',
      accents[Math.floor(Math.random() * accents.length)]
    );
    redirect(ctx.res, '/dashboard/pro/portfolio?success=' + encodeURIComponent('Added to portfolio.'));
  });

  router.post('/dashboard/pro/portfolio/:id/delete', async (ctx) => {
    const profile = requirePro(ctx);
    if (!profile) return;
    db.prepare('DELETE FROM portfolio_items WHERE id = ? AND pro_id = ?').run(ctx.params.id, profile.id);
    redirect(ctx.res, '/dashboard/pro/portfolio?success=' + encodeURIComponent('Removed.'));
  });
};

function requestCard(r, profile, ctx, withActions) {
  return `
  <div class="request-card">
    <div class="top">
      <div>
        <div class="name" style="font-weight:700;">${escapeHtml(r.customer_name || 'Customer')} — ${escapeHtml(r.service_name)}</div>
        <div class="muted">${r.preferred_date ? 'Requested for ' + escapeHtml(r.preferred_date) : 'No date specified'} · ${formatDate(r.created_at)}</div>
      </div>
      <span class="status-pill ${r.status}">${r.status}</span>
    </div>
    ${r.message ? `<p style="margin-top:8px;">"${escapeHtml(r.message)}"</p>` : ''}
    ${
      withActions && r.status === 'pending'
        ? `<div class="request-actions">
            <form method="POST" action="/dashboard/pro/requests/${r.id}/status"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><input type="hidden" name="status" value="accepted" /><button class="btn small" type="submit">Accept</button></form>
            <form method="POST" action="/dashboard/pro/requests/${r.id}/status"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><input type="hidden" name="status" value="declined" /><button class="btn secondary small" type="submit">Decline</button></form>
          </div>`
        : ''
    }
    ${
      withActions && r.status === 'accepted'
        ? `<div class="request-actions">
            <form method="POST" action="/dashboard/pro/requests/${r.id}/status"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><input type="hidden" name="status" value="completed" /><button class="btn small" type="submit">Mark completed</button></form>
          </div>`
        : ''
    }
  </div>`;
}
