'use strict';

const db = require('../db');
const { favoriteIds, favoriteControl } = require('../lib/favorites');
const { layout } = require('../lib/layout');
const { send, flashFromQuery } = require('../lib/http');
const { escapeHtml, slugCategory } = require('../lib/util');
const { hydratePros } = require('../lib/pro-listing-data');
const { PROFESSIONAL_CATEGORIES } = require('../lib/pro-categories');

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m20 20-4.2-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
};

// Photo categories for the "Browse by service" rail. Remaining categories are chips below.
const CATALOG_VALUES = new Set(PROFESSIONAL_CATEGORIES.map((item) => item.value));
const PHOTO_CATEGORIES = [
  { value: 'barber', label: 'Barbers', sub: 'Fades, cuts, beards', img: '/images/category-barber-v1.webp', alt: 'A barber finishing a clean fade haircut' },
  { value: 'stylist', label: 'Hairstylists', sub: 'Cuts, color, styling', img: '/images/category-hair-v1.webp', alt: 'Hair styling in a bright salon' },
  { value: 'nail_technician', label: 'Nails', sub: 'Manicures, nail art', img: '/images/category-nails-stock-v2.webp', alt: 'Close-up of glossy red nails during a professional manicure' },
  { value: 'eyelash_technician', label: 'Lashes & brows', sub: 'Extensions, lifts, shaping', img: '/images/category-lashes-stock-v1.webp', alt: "A beauty professional grooming a client's brows" },
  { value: 'tattoo_artist', label: 'Tattoo artists', sub: 'Fine line to full sleeves', img: '/images/category-tattoos-stock-v1.webp', alt: 'A tattoo artist working with blue gloves' },
  { value: 'massage_therapist', label: 'Massage', sub: 'Deep tissue, relaxation', img: '/images/category-massage-stock-v1.webp', alt: 'A professional providing a neck and shoulder massage in a spa' },
].filter((item) => CATALOG_VALUES.has(item.value)); // only link categories the canonical catalog supports

const POPULAR_SPECIALTIES = ['Skin fade', 'Balayage', 'Russian manicure', 'Lash extensions', 'Brow lamination', 'Silk press', 'Deep tissue massage', 'Fine-line tattoo', 'Bridal makeup', 'Beard trim'];

function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'G';
}

function homeCard(pro, ctx, savedIds) {
  const photoUrl = pro.profile_photo_url || (pro.coverPhoto && pro.coverPhoto.image_url) || '';
  const photo = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(pro.business_name)}" loading="lazy" decoding="async" />`
    : `<span aria-hidden="true">${escapeHtml(initials(pro.business_name))}</span>`;
  const categories = (pro.categories || []).slice(0, 3).map(slugCategory);
  const extraSpecialties = (pro.categories || []).length > 3 ? `<span>+${pro.categories.length - 3}</span>` : '';
  const tags = categories.length ? categories.map((label) => `<span>${escapeHtml(label)}</span>`).join('') + extraSpecialties : '<span>Professional</span>';
  const rating = pro.rating != null
    ? `<span class="gb-rating"><span class="gb-star">${ICON.star}</span>${pro.rating} <span class="muted">(${pro.reviewCount})</span></span>`
    : `<span class="gb-new">New on GoBookr</span>`;
  const place = [pro.city, pro.state].filter(Boolean).join(', ');
  const sub = pro.workplace_name && pro.workplace_name !== pro.business_name ? pro.workplace_name : place;
  return `<div class="favorite-card gb-pro-card-wrap"><a class="gb-pro-card" href="/pro/${pro.id}"><div class="gb-pro-media${photoUrl ? '' : ' gb-monogram'}">${photo}</div><div class="gb-pro-body"><h3>${escapeHtml(pro.business_name)}</h3><p class="gb-pro-sub">${escapeHtml(sub || 'GoBookr professional')}</p><div class="gb-pro-tags">${tags}</div><div class="gb-pro-foot">${rating}${place && sub !== place ? `<span>${escapeHtml(place)}</span>` : ''}</div></div></a>${favoriteControl(pro, ctx, savedIds.has(Number(pro.id)))}</div>`;
}

function businessCard(shop) {
  const place = [shop.city, shop.state].filter(Boolean).join(', ');
  return `<a class="gb-biz-card" href="/shop/${shop.id}"><span class="gb-monogram" aria-hidden="true">${escapeHtml(initials(shop.name))}</span><h3>${escapeHtml(shop.name)}</h3><p>${escapeHtml(place)}</p></a>`;
}

function safeAll(sql, ...args) {
  try { return db.prepare(sql).all(...args); } catch (err) { console.error('Homepage section unavailable', err && err.message); return []; }
}

module.exports = function (router) {
  router.get('/', async (ctx) => {
    const featured = hydratePros(
      db.prepare('SELECT * FROM pro_profiles ORDER BY id DESC LIMIT 30').all(),
      { includeServices: false }
    )
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 6);
    const businesses = safeAll('SELECT id, name, city, state FROM shops ORDER BY id DESC LIMIT 4');
    const cities = safeAll("SELECT city, state, COUNT(*) AS total FROM pro_profiles WHERE city <> '' GROUP BY city, state ORDER BY total DESC, city ASC LIMIT 10");

    const savedIds = favoriteIds(ctx, featured);
    const body = `
<div class="gb-home home-shell">
  <section class="gb-hero home-hero" aria-labelledby="home-title">
    <div class="container">
      <div class="gb-hero-copy">
        <h1 id="home-title">Find the pro you’ll keep going back to.</h1>
        <p class="lede">Compare local hairstylists, makeup artists, wedding specialists, barbers, nail and lash artists, and more. See their work, then book on the scheduling site they already use.</p>

        <div class="gb-search home-search-card" id="find">
          <form class="gb-search-form" method="GET" action="/search" role="search">
            <div class="gb-search-field">
              <label for="home-q">What</label>
              <input id="home-q" type="text" name="q" maxlength="100" placeholder="Service, specialty, or name" aria-label="Service, specialty, or professional name" autocomplete="off" />
            </div>
            <div class="gb-search-field">
              <label for="home-city">Where</label>
              <input id="home-city" type="text" name="city" maxlength="100" placeholder="City or ZIP" aria-label="City or ZIP" autocomplete="address-level2" />
            </div>
            <button class="btn gb-search-submit" type="submit">${ICON.search}<span>Search</span></button>
          </form>
        </div>
        <p class="gb-search-hint home-search-hint">Try a service or specialty like <a href="/search?q=Russian%20manicure">Russian manicure</a>, <a href="/search?q=skin%20fade">skin fade</a>, or <a href="/search?q=balayage">balayage</a>, then add your location.</p>
        <a class="home-openings-cta gb-openings" href="/openings"><span class="gb-live-dot" aria-hidden="true"></span><strong>Need something today?</strong><span>See appointments professionals just opened up</span></a>

        <ul class="gb-hero-proof" aria-label="Why use GoBookr">
          <li>${ICON.check}Real local professionals</li>
          <li>${ICON.check}Book on their own scheduling site</li>
          <li>${ICON.check}Free for customers</li>
        </ul>
      </div>

      <div class="gb-mosaic" aria-hidden="true">
        <div class="gb-mosaic-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span></div>
        <div class="gb-mosaic-grid">
          <div class="gb-mosaic-cell m-a"><img src="/images/category-barber-v1.webp" alt="" width="720" height="720" fetchpriority="high" decoding="async" /><span class="gb-mosaic-label">Barbers</span></div>
          <div class="gb-mosaic-cell is-day m-b">2</div>
          <div class="gb-mosaic-cell m-c"><img src="/images/category-nails-stock-v2.webp" alt="" width="720" height="480" decoding="async" /><span class="gb-mosaic-label">Nails</span></div>
          <div class="gb-mosaic-cell is-booked m-d"><span class="gb-day">9</span><div><strong>Skin fade</strong><span class="gb-booked-time">Booked, 2:30 PM</span></div></div>
          <div class="gb-mosaic-cell is-day m-e">10</div>
          <div class="gb-mosaic-cell m-f"><img src="/images/category-lashes-stock-v1.webp" alt="" width="720" height="720" decoding="async" /><span class="gb-mosaic-label">Brows</span></div>
          <div class="gb-mosaic-cell m-g"><img src="/images/category-hair-v1.webp" alt="" width="720" height="720" decoding="async" /><span class="gb-mosaic-label">Color</span></div>
          <div class="gb-mosaic-cell is-day m-h">17</div>
          <div class="gb-mosaic-cell is-day m-i">22</div>
          <div class="gb-mosaic-cell m-j"><img src="/images/category-massage-stock-v1.webp" alt="" width="720" height="480" decoding="async" /><span class="gb-mosaic-label">Massage</span></div>
          <div class="gb-mosaic-cell m-k"><img src="/images/category-tattoos-stock-v1.webp" alt="" width="720" height="481" decoding="async" /><span class="gb-mosaic-label">Tattoo</span></div>
        </div>
      </div>
    </div>
  </section>

  <link rel="stylesheet" href="/specialty-search.css"><a class="specialty-search-launch" href="/search?type=professionals" data-specialty-open aria-label="Open specialty search" aria-controls="specialty-search" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.5 14L3 21l4.3-1.3A9 9 0 1 0 12 3Z" fill="currentColor"/><circle cx="8" cy="12" r="1" fill="white"/><circle cx="12" cy="12" r="1" fill="white"/><circle cx="16" cy="12" r="1" fill="white"/></svg></a><dialog id="specialty-search" aria-labelledby="specialty-search-title"><header class="specialty-chat-header"><span class="specialty-chat-avatar" aria-hidden="true">G</span><span>GoBookr<span class="specialty-chat-subtitle">Your specialty finder</span></span><button class="specialty-search-close" type="button" aria-label="Close specialty search">×</button></header><div class="specialty-chat-body"><h2 id="specialty-search-title">What specialty are you looking for?</h2><p>Tell us what you have in mind—razor fades, balayage, black and gray realism, or something else.</p><form method="GET" action="/search"><input type="hidden" name="type" value="professionals"><label class="specialty-input-label" for="specialty-query">Your specialty</label><input id="specialty-query" role="combobox" aria-autocomplete="list" aria-controls="specialty-suggestions" aria-expanded="false" autocomplete="off" name="q" type="search" maxlength="100" required placeholder="Type your specialty…"><div id="specialty-suggestions" class="specialty-suggestions" role="listbox" aria-label="Specialty suggestions" hidden></div><span id="specialty-suggestions-status" class="specialty-suggestions-status" role="status" aria-live="polite"></span><label class="specialty-input-label" for="specialty-city">City or ZIP</label><input id="specialty-city" name="city" maxlength="100" placeholder="Where are you looking?"><button class="btn" type="submit">Show matching pros <span aria-hidden="true">→</span></button></form><p class="specialty-chat-note">Find someone who specializes in your style.</p></div></dialog><script src="/specialty-search.js" defer></script><script src="/specialty-suggestions.js" defer></script><script src="/specialty-autocomplete.js" defer></script>

  <section class="gb-section" aria-labelledby="home-cats-title">
    <div class="container">
      <div class="gb-section-head"><div><h2 id="home-cats-title">Browse by service</h2><p>Start with what you need. Every result is a real, local professional.</p></div><a class="gb-link" href="/specialties">All services &amp; specialties ${ICON.arrow}</a></div>
      <div class="gb-cat-rail">
        ${PHOTO_CATEGORIES.map((c) => `<a class="gb-cat home-photo-card" href="/search?type=professionals&amp;category=${c.value}"><img src="${c.img}" width="720" height="720" alt="${escapeHtml(c.alt)}" loading="lazy" decoding="async" /><span class="gb-cat-name">${escapeHtml(c.label)}<span class="gb-cat-sub">${escapeHtml(c.sub)}</span></span></a>`).join('')}
      </div>
      <div class="gb-cat-more home-pills gb-chips" aria-label="More services">
        <a href="/search?category=colorist">Colorists</a>
        <a href="/search?category=eyebrow_technician">Eyebrow Technicians</a>
        <a href="/search?category=waxing_specialist">Waxing Specialists</a>
        <a href="/search?category=massage_therapist">Massage Therapists</a>
        <a href="/search?category=makeup_artist">Makeup Artists</a>
        <a href="/search?category=wedding_services">Weddings</a>
      </div>
    </div>
  </section>

  <section class="gb-section is-tinted" aria-labelledby="home-pros-title">
    <div class="container">
      <div class="gb-section-head"><div><h2 id="home-pros-title">Professionals worth knowing</h2><p>Recently added to GoBookr. Open a profile to see services, location, and where to book.</p></div><a class="gb-link" href="/search?type=professionals">Browse all professionals ${ICON.arrow}</a></div>
      <div class="gb-pro-grid">${featured.map((pro) => homeCard(pro, ctx, savedIds)).join('') || '<div class="empty-state"><h3>No professionals listed yet</h3><p>Check back soon, or search a nearby city.</p></div>'}</div>
    </div>
  </section>

  ${businesses.length ? `<section class="gb-section" aria-labelledby="home-biz-title">
    <div class="container">
      <div class="gb-section-head"><div><h2 id="home-biz-title">Shops and studios</h2><p>See who works where, then pick the professional who fits.</p></div><a class="gb-link" href="/search?type=businesses">Find a business ${ICON.arrow}</a></div>
      <div class="gb-biz-grid">${businesses.map(businessCard).join('')}</div>
    </div>
  </section>` : ''}

  <section class="gb-section${businesses.length ? ' is-tinted' : ''}" aria-label="Popular specialties and cities">
    <div class="container gb-split">
      <div>
        <h2>Popular specialties</h2>
        <div class="gb-chips">${POPULAR_SPECIALTIES.map((term) => `<a href="/search?q=${encodeURIComponent(term)}">${escapeHtml(term)}</a>`).join('')}</div>
      </div>
      ${cities.length ? `<div>
        <h2>Explore by city</h2>
        <ul class="gb-city-list">${cities.map((row) => `<li><a href="/search?city=${encodeURIComponent(row.city)}">${escapeHtml(row.city)}, ${escapeHtml(row.state)}<span>${Number(row.total)} ${Number(row.total) === 1 ? 'pro' : 'pros'}</span></a></li>`).join('')}</ul>
      </div>` : ''}
    </div>
  </section>

  <section class="gb-section" aria-labelledby="home-how-title">
    <div class="container">
      <div class="gb-section-head"><div><h2 id="home-how-title">How booking works</h2></div></div>
      <ol class="gb-steps">
        <li><h3>Search by service and city</h3><p>Look for a service, a specialty like balayage, or a professional by name.</p></li>
        <li><h3>Compare profiles</h3><p>Check where they work, what they offer, and whether their license is verified.</p></li>
        <li><h3>Book on their site</h3><p>Booking opens the scheduling page the professional already uses, like Booksy or Vagaro.</p></li>
      </ol>
    </div>
  </section>

  <section class="gb-section" aria-labelledby="home-pro-title" style="padding-top:0">
    <div class="container">
      <div class="gb-pro-band home-pro-claim-entry">
        <div>
          <h2 id="home-pro-title">Get found by clients searching near you.</h2>
          <p>Already listed? Find and claim your profile. Not on GoBookr yet? Create a new profile from scratch.</p>
          <ul>
            <li>${ICON.check}Keep your profile accurate and up to date</li>
            <li>${ICON.check}Send clients to the booking site you already use</li>
            <li>${ICON.check}Post same-day openings when you have time to fill</li>
          </ul>
        </div>
        <div class="gb-claim-card">
          <strong>Are you a professional?</strong>
          <p>Search your name or business to see if you’re already on GoBookr.</p>
          <form class="home-claim-form" method="GET" action="/search" data-no-radius>
            <input type="hidden" name="type" value="professionals" />
            <input class="home-claim-input" type="search" name="q" maxlength="100" placeholder="Search your name or business" aria-label="Search your professional profile" />
            <button class="home-claim-button btn gb-dark" type="submit">Find &amp; claim my profile</button>
          </form>
          <div class="gb-claim-divider">or</div>
          <div class="home-pro-entry-actions">
            <a class="home-create-profile btn secondary gb-lg" href="/join">Create a new profile — 30 days free</a>
            <span class="muted gb-fine">$20/month after your free trial. Cancel anytime.</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
`;

    send(ctx.res, layout({ title: 'Find trusted local pros', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });
};
