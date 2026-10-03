'use strict';

const db = require('../db');
const { favoriteIds, favoriteControl } = require('../lib/favorites');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { icon, escapeHtml, slugCategory, stars } = require('../lib/util');
const { hydratePros } = require('../lib/pro-listing-data');
const { PROFESSIONAL_CATEGORIES } = require('../lib/pro-categories');

const CATEGORIES = [{ value: '', label: 'All services' }, ...PROFESSIONAL_CATEGORIES.map((item) => ({ value: item.value, label: item.plural }))];

function homeCard(pro, ctx, savedIds) {
  const photo = pro.coverPhoto
    ? `<img class="home-pro-photo" src="${escapeHtml(pro.coverPhoto.image_url)}" alt="${escapeHtml(pro.coverPhoto.caption || pro.business_name)}" loading="lazy" />`
    : `<div class="home-pro-photo home-pro-placeholder">${escapeHtml((pro.business_name || 'G').slice(0, 1).toUpperCase())}</div>`;
  const rating = pro.rating != null
    ? `<span class="home-pro-rating">${stars(pro.rating)} <b>${pro.rating}</b> <span>(${pro.reviewCount})</span></span>`
    : `<span class="home-pro-new">New on GoBookr</span>`;
  const categories = (pro.categories || []).slice(0, 3).map(slugCategory);
  const specialtyLine = categories.length ? categories.join(' · ') : 'Professional';
  const extraSpecialties = (pro.categories || []).length > 3 ? ` +${pro.categories.length - 3}` : '';
  return `<div class="favorite-card home-favorite-card"><a class="home-pro-card" href="/pro/${pro.id}">${photo}<div class="home-pro-info"><h3>${escapeHtml(pro.business_name)}</h3><p class="home-pro-specialties">${escapeHtml(specialtyLine + extraSpecialties)}</p><p class="home-pro-location">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</p>${rating}</div></a>${favoriteControl(pro, ctx, savedIds.has(Number(pro.id)))}</div>`;
}

module.exports = function (router) {
  router.get('/', async (ctx) => {
    const featured = hydratePros(
      db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 30').all(),
      { includeServices: false }
    )
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 6);

    const savedIds = favoriteIds(ctx, featured);
    const body = `

<div class="home-shell">
  <section class="home-hero gb-hero">
    <div class="container">
      <h1>Find the right pro for you.</h1>\n      <p class="lede">Discover trusted local hairstylists, makeup artists, wedding specialists, barbers, nail artists, lash artists, tattoo artists, massage therapists, and more.</p>

      <div class="home-search-card gb-search" id="find">
        <h2 class="home-search-title">What are you looking for?</h2>
        <form method="GET" action="/search">
          <label class="home-field">
            ${icon('layout-grid')}
            <select name="category" aria-label="Service">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select>
          </label>
          <label class="home-field">
            ${icon('map-pin')}
            <input type="text" name="city" maxlength="100" placeholder="City or ZIP" aria-label="City or ZIP" />
          </label>
          <label class="home-field">
            ${icon('user-round')}
            <input type="text" name="q" maxlength="100" placeholder="Service, specialty, or name" aria-label="Service, specialty, or professional name" />
          </label>
          <button class="btn gb-btn-primary gb-btn-primary--pulse" type="submit" aria-label="Search">
            ${icon('search')}
            <span>Search</span>
          </button>
        </form>
      </div>

      <p class="home-search-hint">Try a service or specialty like “Russian manicure,” “skin fade,” or “balayage,” then add your location.</p>\n      <a class="home-openings-cta" href="/openings"><strong>Need something today?</strong><span>See appointments professionals just opened up →</span></a>\n      <div class="home-trust-row" aria-label="Why use GoBookr">
        <div class="home-trust-item"><span class="home-trust-icon">${icon('shield-check')}</span><span>Verified professionals</span></div>
        <div class="home-trust-item"><span class="home-trust-icon">${icon('calendar')}</span><span>Easy booking</span></div>
        <div class="home-trust-item"><span class="home-trust-icon">${icon('map-pin')}</span><span>Local results</span></div>
      </div>

      <div class="home-pro-claim-entry home-pro-claim-entry--quiet">\n        <strong>Are you a professional?</strong> Already listed on GoBookr?\n        <form class="home-claim-form" method="GET" action="/search">\n          <input type="hidden" name="type" value="professionals" />\n          <input class="home-claim-input" type="search" name="q" maxlength="100" placeholder="Search your name or business" aria-label="Search your professional profile" />\n          <button class="home-claim-button" type="submit">Find &amp; claim my profile</button>\n        </form>\n        <div class="home-pro-entry-actions"><a class="home-create-profile" href="/signup?role=pro">Create a new profile — 30 days free</a><span class="muted">$20/month after your free trial. Cancel anytime.</span></div>\n      </div>\n\n      <div class="home-pills">
        <a href="/search?category=barber">Barbers</a>
        <a href="/search?category=stylist">Hairstylists</a>
        <a href="/search?category=colorist">Colorists</a>
        <a href="/search?category=nail_technician">Nail Technicians</a>
        <a href="/search?category=eyelash_technician">Eyelash Technicians</a>
        <a href="/search?category=eyebrow_technician">Eyebrow Technicians</a>
        <a href="/search?category=waxing_specialist">Waxing Specialists</a>
        <a href="/search?category=tattoo_artist">Tattoo Artists</a>
        <a href="/search?category=massage_therapist">Massage Therapists</a>
        <a href="/search?category=makeup_artist">Makeup Artists</a>
        <a href="/search?category=wedding_services">Weddings</a>
      </div>
    </div>
  </section>

  <section class="home-section">
    <div class="container">
      <div class="home-section-head"><div><p class="home-section-kicker">Discover local talent</p><h2>Professionals worth knowing</h2></div><a class="home-see-all" href="/#find">Search pros →</a></div>
      <div class="home-pro-grid">${featured.map(pro => homeCard(pro, ctx, savedIds)).join('') || '<p class="muted">No professionals listed yet.</p>'}</div>
    </div>
  </section>
</div>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname !== '/') return;

    const nav = document.querySelector('.site-header .nav-links');
    if (nav && !nav.querySelector('.home-mobile-menu-button')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'home-mobile-menu-button';
      button.setAttribute('aria-label', 'Open menu');
      button.innerHTML = ${JSON.stringify(icon('menu'))};
      nav.appendChild(button);

      const menu = document.createElement('div');
      menu.className = 'home-mobile-menu';
      menu.innerHTML = '<a href="/#find">Find a pro</a><a href="/openings">Openings Today</a><a href="/search?type=businesses">Find a business</a><a href="/business-account">For Businesses</a><a href="/login">Sign in</a><a href="/signup">Sign up</a>';
      document.querySelector('.site-header').appendChild(menu);

      button.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && !button.contains(event.target)) menu.classList.remove('open');
      });
    }
  });
</script>`;

    send(ctx.res, layout({ stylesheet: '/home.css', title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
