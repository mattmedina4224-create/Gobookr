'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, money, slugCategory, avgRating, stars, initialsFrom } = require('../lib/util');

const CATEGORIES = [
  { value: '', label: 'All services' },
  { value: 'barber', label: 'Barbers' },
  { value: 'stylist', label: 'Hairstylists' },
  { value: 'colorist', label: 'Colorists' },
];

function proWithStats(pro) {
  const reviews = db.prepare('SELECT rating FROM reviews WHERE pro_id = ?').all(pro.id);
  const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(pro.id);
  return {
    ...pro,
    reviewCount: reviews.length,
    rating: avgRating(reviews),
    services,
  };
}

function proCard(pro) {
  const priceLine =
    pro.price_min && pro.price_max
      ? `${money(pro.price_min)}${pro.price_min !== pro.price_max ? '–' + money(pro.price_max) : ''}`
      : 'Pricing varies';
  const ratingHtml =
    pro.rating != null
      ? `<span class="rating">${stars(pro.rating)}<span class="count">${pro.rating} (${pro.reviewCount})</span></span>`
      : `<span class="muted">No reviews yet</span>`;
  const serviceNames = pro.services.slice(0, 3).map((s) => escapeHtml(s.name)).join(' · ') || 'Services coming soon';

  return `
  <a class="pro-card" href="/pro/${pro.id}">
    <div class="pro-card-top">
      <div class="avatar accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div>
      <div>
        <h3>
  ${escapeHtml(pro.business_name)}
  ${pro.license_verified ? `
    <span class="verified-badge" title="License verified" aria-label="License verified">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="vertical-align:-3px;">
        <path d="M12 2.5l2.2 2.1 3-.4.9 2.9 2.7 1.4-.9 2.9 1.3 2.7-2.4 1.8-.1 3-3 .5-2 2.3-2.7-1.3-2.7 1.3-2-2.3-3-.5-.1-3-2.4-1.8 1.3-2.7-.9-2.9 2.7-1.4.9-2.9 3 .4L12 2.5z"/>
        <path d="M8.4 12.1l2.2 2.2 5-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  ` : ''}
</h3>
        <p class="muted">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</p>
      </div>
    </div>
    <span class="badge category">${slugCategory(pro.category)}</span>
    <div style="margin-top:10px;">${ratingHtml}</div>
    <div class="services-line">${serviceNames}</div>
    <div style="margin-top:10px;" class="price-tag">${priceLine}</div>
  </a>`;
}

module.exports = function (router) {
  router.get('/', async (ctx) => {
    const featured = db
      .prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 6')
      .all()
      .map(proWithStats)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));

    const body = `
    <section class="hero">
      <div class="container">
        <h1>Book a barber, stylist, or colorist you can actually trust.</h1>
        <p class="lede">GoBookr lists real reviews and real availability from local hair pros — so you know what you're walking into before you sit in the chair.</p>
        <div class="search-card">
          <form method="GET" action="/search">
            <select name="category" aria-label="Service">
              ${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}
            </select>
            <input type="text" name="city" placeholder="City (e.g. Denver)" />
            <input type="text" name="q" placeholder="Search by name" />
            <button class="btn" type="submit">Search</button>
          </form>
        </div>
        <div class="category-pills">
          <a href="/search?category=barber">✂️ Barbers</a>
          <a href="/search?category=stylist">💇 Hairstylists</a>
          <a href="/search?category=colorist">🎨 Colorists</a>
          <a href="/search">Browse everyone</a>
        </div>
      </div>
    </section>

    <section class="section container">
      <div class="section-head">
        <h2>Top-rated pros</h2>
        <a class="btn secondary small" href="/search">See all</a>
      </div>
      <div class="pro-grid">
        ${featured.map(proCard).join('') || '<p class="muted">No pros listed yet.</p>'}
      </div>
    </section>

    <section class="section container">
      <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <h2 style="margin-bottom:4px;">Are you a barber, stylist, or colorist?</h2>
          <p style="margin:0;">List your services, build your reviews, and get booking requests from new clients — free to join.</p>
        </div>
        <a class="btn" href="/signup?role=pro">Join as a pro</a>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Find trusted hair pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/search', async (ctx) => {
    const { category = '', city = '', q = '', minRating = '' } = ctx.query;
    let sql = 'SELECT * FROM pro_profiles WHERE 1=1';
    const args = [];
    if (category) {
      sql += ' AND category = ?';
      args.push(category);
    }
    if (city) {
      sql += ' AND (city LIKE ? OR state LIKE ?)';
      args.push(`%${city}%`, `%${city}%`);
    }
    if (q) {
      sql += ' AND business_name LIKE ?';
      args.push(`%${q}%`);
    }
    sql += ' ORDER BY id DESC';

    let results = db.prepare(sql).all(...args).map(proWithStats);
    if (minRating) {
      const min = Number(minRating);
      results = results.filter((p) => (p.rating || 0) >= min);
    }

    const filterLink = (overrides) => {
      const merged = { category, city, q, minRating, ...overrides };
      const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v));
      return `/search?${qs.toString()}`;
    };

    const body = `
    <section class="section container">
      <div class="section-head">
        <h2>${category ? slugCategory(category) + 's' : 'All pros'}${city ? ' in ' + escapeHtml(city) : ''}</h2>
        <span class="muted">${results.length} result${results.length === 1 ? '' : 's'}</span>
      </div>
      <div class="search-layout">
        <aside class="filters">
          <h4>Service</h4>
          <ul>
            ${CATEGORIES.map(
              (c) =>
                `<li><a href="${filterLink({ category: c.value })}" style="display:block; padding:6px 0; font-weight:${c.value === category ? '800' : '500'}; color:${c.value === category ? 'var(--brand)' : 'inherit'};">${c.label}</a></li>`
            ).join('')}
          </ul>
          <h4 style="margin-top:18px;">City or state</h4>
          <form method="GET" action="/search" class="field" style="margin-bottom:0;">
            <input type="hidden" name="category" value="${escapeHtml(category)}" />
            <input type="text" name="city" value="${escapeHtml(city)}" placeholder="City" />
            <button class="btn secondary small block" type="submit" style="margin-top:8px;">Apply</button>
          </form>
          <h4 style="margin-top:18px;">Minimum rating</h4>
          <ul class="checks">
            ${[4.5, 4, 3].map(
              (r) =>
                `<li><a href="${filterLink({ minRating: String(r) })}" style="font-weight:${minRating == String(r) ? '800' : '500'};">${stars(r)} &amp; up</a></li>`
            ).join('')}
            ${minRating ? `<li style="margin-top:6px;"><a href="${filterLink({ minRating: '' })}" class="muted">Clear</a></li>` : ''}
          </ul>
        </aside>
        <div>
          ${
            results.length
              ? `<div class="pro-grid">${results.map(proCard).join('')}</div>`
              : `<div class="empty-state"><h3>No pros match yet</h3><p>Try a different city or clear a filter.</p></div>`
          }
        </div>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Search hair pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.get('/pro/:id', async (ctx) => {
    const pro = db.prepare('SELECT * FROM pro_profiles WHERE id = ?').get(ctx.params.id);
    if (!pro) return send(ctx.res, '<h1>404 — pro not found</h1>', 404);

    const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY price ASC').all(pro.id);
    const portfolio = db.prepare('SELECT * FROM portfolio_items WHERE pro_id = ?').all(pro.id);
    const reviews = db
      .prepare(
        `SELECT reviews.*, users.name AS customer_name FROM reviews
         JOIN users ON users.id = reviews.customer_id
         WHERE reviews.pro_id = ? ORDER BY reviews.created_at DESC`
      )
      .all(pro.id);
    const rating = avgRating(reviews);

    const isOwnProfile = ctx.currentUser && ctx.currentUser.role === 'pro' &&
      db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id)?.id === pro.id;

    let ctaHtml;
    if (isOwnProfile) {
      ctaHtml = `<a class="btn secondary block" href="/dashboard/pro">Manage your profile</a>`;
    } else if (!ctx.currentUser) {
      ctaHtml = `<a class="btn block" href="/login?next=/pro/${pro.id}">Log in to request a quote</a>
                 <a class="btn secondary block" href="/signup?role=customer">New here? Sign up</a>`;
    } else if (ctx.currentUser.role === 'pro') {
      ctaHtml = `<p class="muted">Pro accounts can't request bookings.</p>`;
    } else {
      ctaHtml = `
      <form method="POST" action="/bookings">
        <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
        <input type="hidden" name="pro_id" value="${pro.id}" />
        <div class="field">
          <label for="service_name">Service</label>
          <select id="service_name" name="service_name" required>
            ${services.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} — ${money(s.price)}</option>`).join('') || '<option value="General appointment">General appointment</option>'}
          </select>
        </div>
        <div class="field">
          <label for="preferred_date">Preferred date</label>
          <input id="preferred_date" type="date" name="preferred_date" />
        </div>
        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" name="message" rows="3" placeholder="Tell them what you're looking for"></textarea>
        </div>
        <button class="btn block" type="submit">Request booking</button>
      </form>`;
    }

    const accentColors = ['#6d3bf0', '#a06bff', '#e8a33d', '#f2c675', '#1c8a8a', '#4fc7c0', '#d13b6f', '#ef7ba0'];
    const gradientFor = (i) => `linear-gradient(135deg, ${accentColors[i % accentColors.length]}, ${accentColors[(i + 3) % accentColors.length]})`;

    const body = `
    <section class="section container">
      <div class="profile-head">
        <div class="avatar lg accent-${escapeHtml(pro.accent)}">${escapeHtml(pro.initials)}</div>
        <div class="meta">
          <span class="badge category">${slugCategory(pro.category)}</span>
          <h1 style="margin-top:8px;">${escapeHtml(pro.business_name)}</h1>
          <p class="muted" style="margin:0;">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</p>
          <div class="stat-row">
            <span class="stat">${rating != null ? `<span class="rating">${stars(rating)}</span> <b>${rating}</b> (${reviews.length} reviews)` : 'No reviews yet'}</span>
            <span class="stat"><b>${pro.years_experience}</b> yrs experience</span>
            <span class="stat"><b>${pro.price_min && pro.price_max ? money(pro.price_min) + '–' + money(pro.price_max) : 'Varies'}</b> typical range</span>
          </div>
        </div>
        <div class="cta-col">${ctaHtml}</div>
      </div>

      <div class="tabs-grid">
        <div>
          <div class="panel">
            <h3>About</h3>
            <p>${escapeHtml(pro.bio) || 'No bio yet.'}</p>
          </div>
          <div class="panel">
            <h3>Portfolio</h3>
            <div class="portfolio-grid">
              ${
                portfolio.length
                  ? portfolio
                      .map(
                        (p, i) =>
                          `<div class="portfolio-item" style="background:${gradientFor(i)};"><span>${escapeHtml(p.caption)}</span></div>`
                      )
                      .join('')
                  : '<p class="muted">No portfolio photos yet.</p>'
              }
            </div>
          </div>
          <div class="panel">
            <h3>Reviews (${reviews.length})</h3>
            ${
              reviews.length
                ? reviews
                    .map(
                      (r) => `
              <div class="review">
                <div class="review-top">
                  <span class="name">${escapeHtml(r.customer_name)}</span>
                  <span class="rating">${stars(r.rating)}</span>
                </div>
                <p style="margin:0;">${escapeHtml(r.comment)}</p>
              </div>`
                    )
                    .join('')
                : '<p class="muted">No reviews yet — be the first to book and leave one.</p>'
            }
          </div>
        </div>
        <div>
          <div class="panel">
            <h3>Services &amp; pricing</h3>
            ${
              services.length
                ? services
                    .map(
                      (s) => `
              <div class="service-row">
                <div>
                  <div class="name">${escapeHtml(s.name)}</div>
                  <div class="duration">${s.duration_minutes} min</div>
                </div>
                <div class="price-tag">${money(s.price)}</div>
              </div>`
                    )
                    .join('')
                : '<p class="muted">No services listed yet.</p>'
            }
          </div>
        </div>
      </div>
    </section>`;

    send(ctx.res, layout({ title: pro.business_name, currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
