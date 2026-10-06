'use strict';

const db = require('../db');
const { favoriteIds, favoriteControl } = require('../lib/favorites');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, slugCategory, stars } = require('../lib/util');
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
<style>
  .home-shell { background:#fff; color:#11131c; }
  .home-hero {
    background:var(--paper);
    border-bottom:1px solid #edf0f6;
    padding:64px 0 48px;
  }
  .home-eyebrow {
    margin:0 0 20px;
    color:var(--ink-soft);
    font-size:.8rem;
    font-weight:700;
    letter-spacing:.18em;
    text-transform:uppercase;
  }
  .home-hero h1 {
    max-width:720px;
    margin:0 0 22px;
    font-size:clamp(2.5rem,5vw,3.75rem);
    line-height:1.08;
    letter-spacing:-.035em;
    color:#11131c;
  }
  .home-hero .lede {
    max-width:620px;
    margin:0;
    color:#50586a;
    font-size:1.08rem;
    line-height:1.58;
  }

  .home-search-card {
    max-width:850px;
    margin-top:34px;
    padding:16px;
    border:1px solid var(--paper-line);
    border-radius:12px;
    background:var(--paper);
    box-shadow:var(--shadow-sm);
  }
  .home-search-mode { display:flex; gap:8px; margin:0 0 14px; padding:4px; width:max-content; max-width:100%; border-radius:999px; background:#f3f5f8; }
  .home-search-mode a { padding:9px 16px; border-radius:999px; color:#596174; font-size:.88rem; font-weight:700; }
  .home-search-mode a.active { background:var(--paper); color:var(--brand); box-shadow:none; }
  .home-pro-claim-entry { max-width:850px; margin-top:22px; padding:16px 18px; border:1px solid #e2e7f0; border-radius:18px; background:#f6f8fc; color:#4c566b; font-size:.9rem; line-height:1.4; }
  .home-pro-claim-entry strong { color:#14264c; }
  .home-claim-form { display:flex; gap:10px; margin-top:12px; }
  .home-claim-input { flex:1; min-width:0; height:48px; padding:0 15px; border:1px solid #d9e0eb; border-radius:12px; background:#fff; color:#171b26; font:inherit; }
  .home-claim-input:focus { outline:0; border-color:#9fbae9; box-shadow:0 0 0 3px rgba(78,126,214,.09); }
  .home-claim-button { min-height:48px; padding:0 20px; border:0; border-radius:12px; background:#14264c; color:#fff; font-weight:700; white-space:nowrap; }
  .home-pro-entry-actions { display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap; }
  .home-create-profile { display:inline-flex; min-height:46px; align-items:center; justify-content:center; padding:0 18px; border:1px solid #b9c8e1; border-radius:12px; background:#fff; color:#14264c; font-weight:700; }
  .home-create-profile:hover { background:#eef4ff; }
  .home-search-card form {
    display:grid;
    grid-template-columns:1.15fr 1.2fr .9fr auto;
    gap:0;
    align-items:center;
  }
  .home-field {
    min-height:58px;
    display:flex;
    align-items:center;
    gap:12px;
    padding:0 17px;
    border:1px solid #dfe4ed;
    border-radius:8px;
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
  .home-field input::placeholder { color:var(--ink-faint); }
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
    border-radius:8px;
    background:var(--brand);
    color:#fff;
    font-weight:700;
    border:0;
    box-shadow:none;
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
    background:var(--paper-soft);
    color:var(--ink-soft);
  }
  .home-trust-icon svg { width:21px; height:21px; }

  .home-search-hint { max-width:980px; margin:10px 0 0; color:var(--ink-faint); font-size:.78rem; }\n\n  .home-pills { display:flex; flex-wrap:wrap; gap:10px; margin-top:24px; }
  .home-pills a {
    padding:8px 14px;
    border:1px solid #e3e7ee;
    border-radius:8px;
    background:#fff;
    color:#41495e;
    font-size:.86rem;
    font-weight:700;
  }

  .home-section { padding:52px 0 58px; background:#fff; }
  .home-section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; }
  .home-section-kicker { margin:0 0 5px; color:var(--ink-faint); font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }\n  .home-section-head h2 { margin:0; font-size:1.75rem; letter-spacing:-.03em; }
  .home-see-all { color:#215ca6; font-weight:750; }
  .home-pro-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
  .home-pro-card { overflow:hidden; transition:transform .16s ease,box-shadow .16s ease; border:1px solid #e5e8ef; border-radius:12px; background:#fff; box-shadow:none; }
  .home-pro-card:hover { transform:translateY(-2px); box-shadow:0 16px 34px -28px rgba(25,40,80,.5); }\n  .home-pro-photo { width:100%; aspect-ratio:1.45; object-fit:cover; background:#eef1f7; }
  .home-pro-placeholder { display:flex; align-items:center; justify-content:center; color:var(--ink-soft); background:var(--paper-soft); font-size:2rem; font-weight:700; }
  .home-pro-info { padding:15px; }
  .home-pro-info h3 { margin:0 0 4px; font-size:1rem; }
  .home-pro-info p { margin:0 0 8px; font-size:.86rem; }
  .home-pro-rating { color:#d28a20; font-size:.84rem; }
  .home-pro-rating b,.home-pro-rating span { color:#555b6e; }
  .home-pro-new { color:var(--ink-faint); font-size:.84rem; }

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
      width:44px;
      height:44px;
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

    .home-hero { padding:42px 0 38px; }
    .home-hero .container { padding:0 18px; }
    .home-eyebrow { margin-bottom:16px; font-size:.68rem; letter-spacing:.16em; }
    .home-hero h1 { font-size:2.25rem; line-height:1.1; margin-bottom:16px; max-width:360px; }
    .home-hero .lede { font-size:1rem; line-height:1.52; }

    .home-search-card { margin-top:26px; padding:10px; border-radius:16px; box-shadow:none; }
    .home-pro-claim-entry { margin-top:24px; padding:15px; border-radius:16px; }
    .home-claim-form { display:grid; grid-template-columns:1fr; gap:9px; }
    .home-claim-input,.home-claim-button { width:100%; }
    .home-pro-entry-actions { display:grid; grid-template-columns:1fr; }
    .home-create-profile { width:100%; }
    .home-search-mode { width:100%; display:grid; grid-template-columns:1fr 1fr; margin-bottom:10px; }
    .home-search-mode a { text-align:center; padding:10px 8px; font-size:.86rem; }
    .home-search-card form { display:grid !important; grid-template-columns:1fr !important; gap:10px !important; }
    .home-field { min-height:58px; padding:0 14px; border-radius:0; }\n    .home-field + .home-field { border-left:0; border-top:1px solid #e8ebf0; }
    .home-field select,.home-field input { height:54px; font-size:.98rem; }
    .home-search-card .btn { width:100%; min-height:52px; margin-top:4px; border-radius:11px; font-size:1rem; }\n    .home-search-hint { display:none; }

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
    .home-hero h1 { font-size:2.125rem; }
    .home-trust-item { font-size:.72rem; }
  }
</style>
<div class="home-shell">
  <section class="home-hero">
    <div class="container">
      <p class="home-eyebrow">Real people. Real services. Near you.</p>
      <h1>Find your next favorite beauty pro.</h1>
      <p class="lede">Search local hairstylists, makeup artists, wedding specialists, barbers, and other beauty and wellness professionals—see their work and book with confidence.</p>

      <div class="home-search-card" id="find">
        <div class="home-search-mode" aria-label="What are you looking for?"><a class="active" href="/#find">Find a professional</a><a href="/search?type=businesses">Find a business</a></div>
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
            <input type="text" name="q" maxlength="100" placeholder="Service, specialty, or name" aria-label="Service, specialty, or professional name" />
          </label>
          <button class="btn" type="submit" aria-label="Search">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span>Search</span>
          </button>
        </form>
      </div>

      <p class="home-search-hint">Try a service or specialty like “Russian manicure,” “skin fade,” or “balayage,” then add your location.</p><a class="home-openings-cta" href="/openings"><strong>Need something today?</strong><span>See appointments professionals just opened up →</span></a>\n      <div class="home-trust-row" aria-label="Why use GoBookr">
        <div class="home-trust-item"><span class="home-trust-icon"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.4-2.8 8.2-7 10-4.2-1.8-7-5.6-7-10V6l7-3Z" stroke="currentColor" stroke-width="2"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Local professionals</span></div>
        <div class="home-trust-item"><span class="home-trust-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span>Easy booking</span></div>
        <div class="home-trust-item"><span class="home-trust-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.3" stroke="currentColor" stroke-width="2"/></svg></span><span>Local results</span></div>
      </div>

      <div class="home-pro-claim-entry">
        <strong>Are you a professional?</strong> Already listed? Find and claim your profile. Not on GoBookr yet? Create a new profile from scratch.
        <form class="home-claim-form" method="GET" action="/search">
          <input type="hidden" name="type" value="professionals" />
          <input class="home-claim-input" type="search" name="q" maxlength="100" placeholder="Search your name or business" aria-label="Search your professional profile" />
          <button class="home-claim-button" type="submit">Find &amp; claim my profile</button>
        </form>
        <div class="home-pro-entry-actions">
          <a class="home-create-profile" href="/signup?role=pro">Create a new profile — 30 days free</a>
          <span class="muted">$20/month after your free trial. Cancel anytime.</span>
        </div>
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
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
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

    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
