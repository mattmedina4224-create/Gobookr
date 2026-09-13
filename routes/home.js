'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, slugCategory, avgRating, stars } = require('../lib/util');
const { isProPubliclyVisible } = require('../lib/subscription');

const CATEGORIES = [
  { value: '', label: 'All services' },
  { value: 'barber', label: 'Barbers' },
  { value: 'stylist', label: 'Hairstylists' },
  { value: 'colorist', label: 'Colorists' },
  { value: 'nail_technician', label: 'Nail Technicians' },
  { value: 'eyelash_technician', label: 'Eyelash Technicians' },
  { value: 'eyebrow_technician', label: 'Eyebrow Technicians' },
  { value: 'waxing_specialist', label: 'Waxing Specialists' },
  { value: 'tattoo_artist', label: 'Tattoo Artists' },
];

function categoriesForPro(proId) {
  const rows = db.prepare('SELECT category FROM pro_categories WHERE pro_id = ? ORDER BY category').all(proId);
  return rows.length ? rows.map((row) => row.category) : [];
}

function homepagePro(pro) {
  if (!isProPubliclyVisible(pro.id)) return null;
  const reviews = db.prepare('SELECT rating FROM reviews WHERE pro_id = ?').all(pro.id);
  const categories = categoriesForPro(pro.id);
  const portfolio = db.prepare('SELECT image_url, caption FROM portfolio_items WHERE pro_id = ? AND image_url IS NOT NULL AND image_url != ? ORDER BY id DESC LIMIT 1').get(pro.id, '');
  return {
    ...pro,
    rating: avgRating(reviews),
    reviewCount: reviews.length,
    categories: categories.length ? categories : [pro.category],
    coverPhoto: portfolio || null,
  };
}

function homeCard(pro) {
  const photo = pro.coverPhoto
    ? `<img class="home-pro-photo" src="${escapeHtml(pro.coverPhoto.image_url)}" alt="${escapeHtml(pro.coverPhoto.caption || pro.business_name)}" loading="lazy" />`
    : `<div class="home-pro-photo home-pro-placeholder">${escapeHtml((pro.business_name || 'G').slice(0, 1).toUpperCase())}</div>`;
  const rating = pro.rating != null
    ? `<span class="home-pro-rating">${stars(pro.rating)} <b>${pro.rating}</b> <span>(${pro.reviewCount})</span></span>`
    : `<span class="home-pro-new">New on GoBookr</span>`;
  const category = pro.categories[0] ? slugCategory(pro.categories[0]) : 'Professional';
  return `<a class="home-pro-card" href="/pro/${pro.id}">${photo}<div class="home-pro-info"><h3>${escapeHtml(pro.business_name)}</h3><p>${escapeHtml(category)} · ${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</p>${rating}</div></a>`;
}

module.exports = function (router) {
  router.get('/', async (ctx) => {
    const featured = db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 30').all()
      .map(homepagePro)
      .filter(Boolean)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 6);

    const body = `
<style>
  .home-shell { background:#fff; }
  .home-hero {
    background: radial-gradient(900px 420px at 12% -10%, #eef3ff 0%, transparent 58%), #fff;
    border-bottom:1px solid var(--paper-line);
    padding:54px 0 46px;
  }
  .home-eyebrow { margin:0 0 18px; color:#6077aa; font-size:.79rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
  .home-hero h1 { max-width:760px; margin:0 0 18px; font-size:clamp(2.5rem,6vw,4.2rem); line-height:1.03; letter-spacing:-.045em; }
  .home-hero .lede { max-width:700px; margin:0; font-size:1.12rem; line-height:1.55; color:#4a5063; }
  .home-search-card { max-width:800px; margin-top:30px; padding:14px; border:1px solid #e3e7ef; border-radius:24px; background:#fff; box-shadow:0 14px 40px -28px rgba(25,40,80,.35); }
  .home-search-card form { display:grid; grid-template-columns:1.15fr 1fr 1fr auto; align-items:center; gap:8px; }
  .home-search-card select,
  .home-search-card input { min-height:54px; border:1px solid #e5e8ef; border-radius:999px; padding:0 18px; background:#fff; }
  .home-search-card .btn { min-height:54px; padding:0 26px; white-space:nowrap; }
  .home-pills { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
  .home-pills a { padding:8px 15px; border:1px solid #e1e5ed; border-radius:999px; background:#fff; color:#394057; font-size:.87rem; font-weight:650; }
  .home-section { padding:48px 0 54px; background:#fff; }
  .home-section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; }
  .home-section-head h2 { margin:0; font-size:1.75rem; letter-spacing:-.025em; }
  .home-see-all { color:#1967d2; font-weight:700; }
  .home-pro-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
  .home-pro-card { overflow:hidden; border:1px solid #e5e8ef; border-radius:20px; background:#fff; box-shadow:0 8px 28px -22px rgba(25,40,80,.4); }
  .home-pro-photo { width:100%; aspect-ratio:1.45; object-fit:cover; background:#eef1f7; }
  .home-pro-placeholder { display:flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#1e2a4a,#38568f); font-size:2rem; font-weight:800; }
  .home-pro-info { padding:15px; }
  .home-pro-info h3 { margin:0 0 4px; font-size:1rem; }
  .home-pro-info p { margin:0 0 8px; font-size:.86rem; }
  .home-pro-rating { color:#d28a20; font-size:.84rem; }
  .home-pro-rating b,.home-pro-rating span { color:#555b6e; }
  .home-pro-new { color:#777f92; font-size:.84rem; }
  .home-mobile-menu-button,.home-mobile-menu { display:none; }

  @media (max-width:720px) {
    body { background:#fff; }
    .site-header { position:static; }
    .site-header .container { height:78px !important; padding:0 18px !important; gap:12px !important; }
    .brand { width:156px !important; height:42px !important; flex:0 0 156px !important; }
    .site-header .nav-links { margin-left:auto !important; display:flex !important; align-items:center !important; gap:2px !important; flex-wrap:nowrap !important; width:auto !important; }
    .site-header .nav-links > a { display:none !important; }
    .site-header .nav-links > a:nth-child(1),
    .site-header .nav-links > a:nth-child(2) { display:inline-flex !important; padding:8px 7px !important; font-size:.78rem !important; white-space:nowrap !important; background:transparent !important; color:#26304c !important; }
    .site-header .nav-links > form,
    .site-header .nav-links > span { display:none !important; }
    .home-mobile-menu-button { display:inline-flex; width:38px; height:38px; border:0; background:transparent; padding:5px; margin-left:1px; align-items:center; justify-content:center; color:#111b35; }
    .home-mobile-menu-button svg { width:27px; height:27px; }
    .home-mobile-menu { display:none; position:absolute; z-index:40; top:70px; right:14px; min-width:190px; padding:8px; border:1px solid #e4e7ee; border-radius:15px; background:#fff; box-shadow:0 16px 40px -18px rgba(20,32,56,.35); }
    .home-mobile-menu.open { display:block; }
    .home-mobile-menu a { display:block; padding:12px 14px; border-radius:10px; font-weight:650; color:#252c40; }
    .home-mobile-menu a:last-child { background:#1e2a4a; color:#fff; text-align:center; margin-top:4px; }

    .home-hero { padding:34px 0 34px; }
    .home-hero .container { padding:0 18px; }
    .home-eyebrow { margin-bottom:14px; font-size:.68rem; letter-spacing:.14em; }
    .home-hero h1 { font-size:2.55rem; line-height:1.02; margin-bottom:18px; max-width:100%; }
    .home-hero .lede { font-size:1rem; line-height:1.48; }
    .home-search-card { margin-top:26px; padding:12px; border-radius:22px; }
    .home-search-card form { display:grid !important; grid-template-columns:1fr !important; gap:9px !important; padding:0 !important; border:0 !important; border-radius:0 !important; overflow:visible !important; background:transparent !important; }
    .home-search-card form > select,
    .home-search-card form > input,
    .home-search-card form > div { width:100% !important; min-height:58px !important; border:1px solid #e1e5ed !important; border-radius:999px !important; padding:0 16px !important; background:#fff !important; }
    .home-search-card form > div { display:flex !important; align-items:center !important; border-top:1px solid #e1e5ed !important; }
    .home-search-card form > div input { min-height:54px !important; padding:0 8px !important; }
    .home-search-card form button[type="submit"] { width:100% !important; height:58px !important; min-height:58px !important; border-radius:999px !important; justify-self:stretch !important; font-size:1rem !important; gap:9px !important; }
    .home-pills { gap:8px; margin-top:16px; }
    .home-pills a { padding:7px 12px; font-size:.8rem; }
    .home-section { padding:38px 0 44px; }
    .home-section .container { padding:0 18px; }
    .home-section-head { margin-bottom:16px; }
    .home-section-head h2 { font-size:1.42rem; }
    .home-see-all { font-size:.9rem; }
    .home-pro-grid { display:flex; gap:12px; overflow-x:auto; padding-bottom:6px; scroll-snap-type:x proximity; }
    .home-pro-card { min-width:76vw; scroll-snap-align:start; }
  }

  @media (max-width:390px) {
    .site-header .nav-links > a:nth-child(2) { display:none !important; }
    .brand { width:148px !important; flex-basis:148px !important; }
    .home-hero h1 { font-size:2.3rem; }
  }
</style>
<div class="home-shell">
  <section class="home-hero">
    <div class="container">
      <p class="home-eyebrow">Real people. Real services. Near you.</p>
      <h1>Find a local professional you can actually trust.</h1>
      <p class="lede">Discover barbers, hairstylists, colorists, nail technicians, eyelash technicians, eyebrow technicians, waxing specialists, tattoo artists, and more then book directly with the professional.</p>
      <div class="home-search-card">
        <form method="GET" action="/search">
          <select name="category" aria-label="Service">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select>
          <input type="text" name="city" maxlength="100" placeholder="City or ZIP" />
          <input type="text" name="q" maxlength="100" placeholder="Name or business" />
          <button class="btn" type="submit">Search</button>
        </form>
      </div>
      <div class="home-pills">
        <a href="/search?category=barber">Barbers</a>
        <a href="/search?category=stylist">Hairstylists</a>
        <a href="/search?category=colorist">Colorists</a>
        <a href="/search?category=nail_technician">Nail Technicians</a>
        <a href="/search?category=eyelash_technician">Eyelash Technicians</a>
        <a href="/search?category=eyebrow_technician">Eyebrow Technicians</a>
        <a href="/search?category=waxing_specialist">Waxing Specialists</a>
        <a href="/search?category=tattoo_artist">Tattoo Artists</a>
        <a href="/search">More⌄</a>
      </div>
    </div>
  </section>

  <section class="home-section">
    <div class="container">
      <div class="home-section-head"><h2>Top-rated professionals</h2><a class="home-see-all" href="/search">See all →</a></div>
      <div class="home-pro-grid">${featured.map(homeCard).join('') || '<p class="muted">No professionals listed yet.</p>'}</div>
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
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      nav.appendChild(button);

      const menu = document.createElement('div');
      menu.className = 'home-mobile-menu';
      menu.innerHTML = '<a href="/login">Log in</a><a href="/signup">Sign up</a>';
      document.querySelector('.site-header').appendChild(menu);

      button.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && !button.contains(event.target)) menu.classList.remove('open');
      });
    }

    const form = document.querySelector('.home-search-card form');
    const submit = form && form.querySelector('button[type="submit"]');
    if (submit) {
      submit.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Search</span>';
      submit.setAttribute('aria-label', 'Search');
      submit.title = 'Search';
    }
  });
</script>`;

    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
