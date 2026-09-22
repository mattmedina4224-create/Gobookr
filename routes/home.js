'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, slugCategory, stars } = require('../lib/util');
const { hydratePros } = require('../lib/pro-listing-data');

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
    const featured = hydratePros(
      db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 30').all(),
      { includeServices: false }
    )
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 6);

    const body = `
<style>
  .home-shell { background:#fff; color:#11131c; }
  .home-hero {
    background:
      radial-gradient(760px 360px at 12% -10%, rgba(229,238,255,.9) 0%, rgba(255,255,255,0) 62%),
      #fff;
    border-bottom:1px solid #edf0f6;
    padding:64px 0 54px;
  }
  .home-eyebrow {
    margin:0 0 20px;
    color:#627caf;
    font-size:.8rem;
    font-weight:850;
    letter-spacing:.18em;
    text-transform:uppercase;
  }
  .home-hero h1 {
    max-width:800px;
    margin:0 0 22px;
    font-size:clamp(2.8rem,6vw,4.65rem);
    line-height:.98;
    letter-spacing:-.052em;
    color:#11131c;
  }
  .home-hero .lede {
    max-width:750px;
    margin:0;
    color:#50586a;
    font-size:1.15rem;
    line-height:1.58;
  }

  .home-search-card {
    max-width:850px;
    margin-top:34px;
    padding:18px;
    border:1px solid #e2e7f0;
    border-radius:28px;
    background:rgba(255,255,255,.96);
    box-shadow:0 20px 50px -32px rgba(21,44,87,.42);
  }
  .home-search-card form {
    display:grid;
    grid-template-columns:1.15fr 1fr 1fr auto;
    gap:10px;
    align-items:center;
  }
  .home-field {
    min-height:58px;
    display:flex;
    align-items:center;
    gap:12px;
    padding:0 17px;
    border:1px solid #dfe4ed;
    border-radius:999px;
    background:#fff;
  }
  .home-field svg { width:23px; height:23px; flex:0 0 23px; color:#11131c; }
  .home-field select,
  .home-field input {
    width:100%;
    min-width:0;
    height:54px;
    border:0 !important;
    outline:0;
    padding:0 !important;
    background:transparent !important;
    color:#171b26;
    font:inherit;
    box-shadow:none !important;
  }
  .home-field input::placeholder { color:#a0a6b3; }
  .home-field:focus-within {
    border-color:#b7ccf7;
    box-shadow:0 0 0 3px rgba(78,126,214,.09);
  }
  .home-search-card .btn {
    min-height:58px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    padding:0 30px;
    border-radius:999px;
    background:linear-gradient(135deg,#14264c,#123c70);
    color:#fff;
    font-weight:800;
    border:0;
    box-shadow:0 10px 24px -14px rgba(17,49,93,.75);
    white-space:nowrap;
  }
  .home-search-card .btn:hover { transform:translateY(-1px); }

  .home-trust-row {
    max-width:850px;
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:0;
    margin-top:22px;
  }
  .home-trust-item {
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    padding:4px 16px;
    color:#34405b;
    font-size:.89rem;
    font-weight:700;
  }
  .home-trust-item + .home-trust-item { border-left:1px solid #e6eaf1; }
  .home-trust-icon {
    width:38px;
    height:38px;
    display:grid;
    place-items:center;
    border-radius:50%;
    background:#f0f5ff;
    color:#2456a3;
  }
  .home-trust-icon svg { width:21px; height:21px; }

  .home-pills { display:flex; flex-wrap:wrap; gap:10px; margin-top:24px; }
  .home-pills a {
    padding:8px 14px;
    border:1px solid #e3e7ee;
    border-radius:999px;
    background:#fff;
    color:#41495e;
    font-size:.86rem;
    font-weight:700;
  }

  .home-section { padding:52px 0 58px; background:#fff; }
  .home-section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; }
  .home-section-head h2 { margin:0; font-size:1.75rem; letter-spacing:-.03em; }
  .home-see-all { color:#215ca6; font-weight:750; }
  .home-pro-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
  .home-pro-card { overflow:hidden; border:1px solid #e5e8ef; border-radius:22px; background:#fff; box-shadow:0 10px 28px -24px rgba(25,40,80,.45); }
  .home-pro-photo { width:100%; aspect-ratio:1.45; object-fit:cover; background:#eef1f7; }
  .home-pro-placeholder { display:flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#1e2a4a,#38568f); font-size:2rem; font-weight:800; }
  .home-pro-info { padding:15px; }
  .home-pro-info h3 { margin:0 0 4px; font-size:1rem; }
  .home-pro-info p { margin:0 0 8px; font-size:.86rem; }
  .home-pro-rating { color:#d28a20; font-size:.84rem; }
  .home-pro-rating b,.home-pro-rating span { color:#555b6e; }
  .home-pro-new { color:#777f92; font-size:.84rem; }

  .home-mobile-menu-button,.home-mobile-menu { display:none; }

  @media (max-width:900px) {
    .home-search-card form { grid-template-columns:1fr 1fr; }
    .home-search-card .btn { grid-column:1 / -1; }
  }

  @media (max-width:720px) {
    body { background:#fff; }
    .site-header { position:static; }
    .site-header .container {
      height:68px !important;
      min-height:68px !important;
      padding:0 18px !important;
      display:flex !important;
      align-items:center !important;
      justify-content:space-between !important;
      flex-wrap:nowrap !important;
      gap:12px !important;
    }
    .brand {
      width:156px !important;
      height:42px !important;
      flex:0 0 156px !important;
    }
    .site-header .nav-links {
      margin-left:auto !important;
      display:flex !important;
      align-items:center !important;
      justify-content:flex-end !important;
      gap:0 !important;
      flex-wrap:nowrap !important;
      width:auto !important;
      padding:0 !important;
      border-top:0 !important;
    }
    .site-header .nav-links > a,
    .site-header .nav-links > form,
    .site-header .nav-links > span { display:none !important; }
    .home-mobile-menu-button {
      display:inline-flex !important;
      width:42px;
      height:42px;
      border:0;
      border-radius:12px;
      background:#fff;
      padding:7px;
      margin:0;
      align-items:center;
      justify-content:center;
      color:#111b35;
    }
    .home-mobile-menu-button svg { width:27px; height:27px; }
    .home-mobile-menu {
      display:none;
      position:absolute;
      z-index:40;
      top:60px;
      right:14px;
      min-width:210px;
      padding:8px;
      border:1px solid #e4e7ee;
      border-radius:15px;
      background:#fff;
      box-shadow:0 16px 40px -18px rgba(20,32,56,.35);
    }
    .home-mobile-menu.open { display:block; }
    .home-mobile-menu a { display:block; padding:12px 14px; border-radius:10px; font-weight:650; color:#252c40; }
    .home-mobile-menu a:last-child { background:#1e2a4a; color:#fff; text-align:center; margin-top:4px; }

    .home-hero { padding:36px 0 38px; }
    .home-hero .container { padding:0 18px; }
    .home-eyebrow { margin-bottom:16px; font-size:.68rem; letter-spacing:.16em; }
    .home-hero h1 { font-size:2.65rem; line-height:1.01; margin-bottom:20px; max-width:100%; }
    .home-hero .lede { font-size:1rem; line-height:1.52; }

    .home-search-card { margin-top:28px; padding:12px; border-radius:25px; box-shadow:0 16px 34px -28px rgba(25,40,80,.45); }
    .home-search-card form { display:grid !important; grid-template-columns:1fr !important; gap:10px !important; }
    .home-field { min-height:62px; padding:0 18px; }
    .home-field select,.home-field input { height:58px; font-size:1rem; }
    .home-search-card .btn { width:100%; min-height:62px; font-size:1rem; }

    .home-trust-row { margin-top:20px; }
    .home-trust-item { gap:8px; padding:4px 8px; font-size:.76rem; line-height:1.15; }
    .home-trust-icon { width:34px; height:34px; flex:0 0 34px; }
    .home-trust-icon svg { width:18px; height:18px; }

    .home-pills { display:none; }
    .home-section { padding:40px 0 46px; }
    .home-section .container { padding:0 18px; }
    .home-section-head { margin-bottom:16px; }
    .home-section-head h2 { font-size:1.42rem; }
    .home-see-all { font-size:.9rem; }
    .home-pro-grid { display:flex; gap:12px; overflow-x:auto; padding-bottom:6px; scroll-snap-type:x proximity; }
    .home-pro-card { min-width:76vw; scroll-snap-align:start; }
  }

  @media (max-width:390px) {
    .brand { width:148px !important; flex-basis:148px !important; }
    .home-hero h1 { font-size:2.38rem; }
    .home-trust-item { font-size:.72rem; }
  }
</style>
<div class="home-shell">
  <section class="home-hero">
    <div class="container">
      <p class="home-eyebrow">Real people. Real services. Near you.</p>
      <h1>Find a local professional you can actually trust.</h1>
      <p class="lede">Discover barbers, hairstylists, colorists, nail technicians, eyelash technicians, eyebrow technicians, waxing specialists, tattoo artists, and more then book directly with the professional.</p>

      <div class="home-search-card" id="find">
        <form method="GET" action="/search">
          <label class="home-field">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="2"/><rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="2"/><rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="2"/></svg>
            <select name="category" aria-label="Service">${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select>
          </label>
          <label class="home-field">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="2"/></svg>
            <input type="text" name="city" maxlength="100" placeholder="City or ZIP" aria-label="City or ZIP" />
          </label>
          <label class="home-field">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input type="text" name="q" maxlength="100" placeholder="Name or business" aria-label="Name or business" />
          </label>
          <button class="btn" type="submit" aria-label="Search">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span>Search</span>
          </button>
        </form>
      </div>

      <div class="home-trust-row" aria-label="Why use GoBookr">
        <div class="home-trust-item"><span class="home-trust-icon"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.4-2.8 8.2-7 10-4.2-1.8-7-5.6-7-10V6l7-3Z" stroke="currentColor" stroke-width="2"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Verified professionals</span></div>
        <div class="home-trust-item"><span class="home-trust-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span>Easy booking</span></div>
        <div class="home-trust-item"><span class="home-trust-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.3" stroke="currentColor" stroke-width="2"/></svg></span><span>Local results</span></div>
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
      menu.innerHTML = '<a href="/#find">Find a pro</a><a href="/business-account">Business Account</a><a href="/signup">Sign up</a>';
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

    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
