'use strict';
(() => {
  const header = document.querySelector('.site-header');
  const button = header && header.querySelector('.mobile-menu-toggle');
  const nav = header && header.querySelector('#site-navigation');
  if (button && nav) {
    const mobile = window.matchMedia('(max-width: 720px)');
    function setOpen(open) {
      header.toggleAttribute('data-nav-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    button.hidden = false;
    header.setAttribute('data-nav-ready', '');
    button.addEventListener('click', () => setOpen(!header.hasAttribute('data-nav-open')));
    document.addEventListener('click', (event) => { if (!header.contains(event.target)) setOpen(false); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.hasAttribute('data-nav-open')) { setOpen(false); button.focus(); }
    });
    nav.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
    header.addEventListener('focusout', (event) => { if (!header.contains(event.relatedTarget)) setOpen(false); });
    mobile.addEventListener('change', () => setOpen(false));
  }

  // Customer-facing professional profile V3. This progressively enhances the
  // existing server-rendered profile, so booking, claims, reviews and SEO still
  // work even if JavaScript is unavailable.
  if (/^\/pro\/\d+$/.test(window.location.pathname)) {
    const page = document.querySelector('.profile-page');
    const grid = page && page.querySelector('.tabs-grid');
    if (page && grid) {
      page.classList.add('profile-v3');
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/profile-v3.css'; document.head.appendChild(css);
      const main = grid.querySelector('main');
      const aside = grid.querySelector('aside');
      const panels = [...grid.querySelectorAll('.panel')];
      const findPanel = (label) => panels.find((panel) => (panel.querySelector('h2')?.textContent || '').trim().toLowerCase().startsWith(label));
      const about = findPanel('about');
      const portfolio = findPanel('portfolio');
      const reviews = findPanel('reviews');
      const services = findPanel('services');
      const social = [...panels].find((panel) => (panel.querySelector('h3')?.textContent || '').trim() === 'Around the web');
      const updates = main && main.querySelector('section[aria-labelledby="profile-updates"]');
      const opening = page.querySelector('.profile-opening-banner');
      const booking = page.querySelector('.profile-book-btn, .profile-mobile-actions .btn[href^="/book/"]');
      const panes = {};
      const content = document.createElement('div'); content.className = 'profile-v3-content';
      ['overview','services','availability','reviews','photos'].forEach((name) => { const pane = document.createElement('section'); pane.className = 'profile-v3-pane' + (name === 'overview' ? ' active' : ''); pane.dataset.pane = name; panes[name] = pane; content.appendChild(pane); });
      [updates, about, social].filter(Boolean).forEach((node) => panes.overview.appendChild(node));
      if (services) panes.services.appendChild(services);
      if (reviews) panes.reviews.appendChild(reviews);
      if (portfolio) panes.photos.appendChild(portfolio);
      const availabilityCard = document.createElement('div'); availabilityCard.className = 'profile-v3-card';
      availabilityCard.innerHTML = '<h2>Availability</h2>' + (opening ? '<p class="profile-v3-note">These openings were posted by the professional today. Confirm the final time when booking.</p>' : '<p>Ready to book? View this professional’s current schedule on their connected booking page.</p>') + (booking ? '<a class="btn block" href="' + booking.getAttribute('href') + '">View availability &amp; book →</a>' : '<div class="booking-unavailable"><strong>Online booking not connected yet</strong><p class="muted">Check back soon.</p></div>');
      if (opening) panes.availability.appendChild(opening);
      panes.availability.appendChild(availabilityCard);
      const tabs = document.createElement('nav'); tabs.className = 'profile-v3-tabs'; tabs.setAttribute('aria-label','Profile sections');
      const labels = {overview:'Overview',services:'Services',availability:'Availability',reviews:'Reviews',photos:'Photos'};
      Object.keys(labels).forEach((name) => { const b = document.createElement('button'); b.type='button'; b.className='profile-v3-tab' + (name==='overview'?' active':''); b.dataset.tab=name; b.textContent=labels[name]; b.setAttribute('aria-selected',String(name==='overview')); tabs.appendChild(b); });
      grid.replaceWith(content); page.insertBefore(tabs, content);
      tabs.addEventListener('click', (event) => { const b=event.target.closest('[data-tab]'); if(!b)return; const name=b.dataset.tab; tabs.querySelectorAll('.profile-v3-tab').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));}); Object.entries(panes).forEach(([key,pane])=>pane.classList.toggle('active',key===name)); });
      if (booking) { const sticky=document.createElement('div'); sticky.className='profile-v3-sticky-book'; sticky.innerHTML='<a class="btn" href="'+booking.getAttribute('href')+'">Book Appointment</a>'; page.appendChild(sticky); }
    }
  }

  // Keep claim/pro authentication behavior untouched. The plain /login entry is
  // the customer-facing sign-in experience, so give it a focused discovery UI.
  if (window.location.pathname !== '/login' || new URLSearchParams(window.location.search).has('claim')) return;
  const form = document.querySelector('form[action="/login"]');
  const panel = form && form.closest('.panel');
  const section = panel && panel.closest('.section.container');
  if (!form || !panel || !section) return;

  section.classList.add('customer-login-page');
  panel.classList.add('customer-login-card');
  const heading = panel.querySelector('h1');
  const intro = heading && heading.nextElementSibling;
  if (heading) heading.textContent = 'Sign in to GoBookr';
  if (intro && intro.matches('p')) intro.textContent = 'Save your favorite professionals and find them again anytime.';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'customer-login-eyebrow';
  eyebrow.textContent = 'Welcome back';
  if (heading) panel.insertBefore(eyebrow, heading);

  if (!panel.querySelector('.customer-login-signup')) {
    const signup = document.createElement('div');
    signup.className = 'customer-login-signup';
    signup.innerHTML = '<span>New to GoBookr?</span> <a href="/signup">Create a free account</a>';
    panel.appendChild(signup);
  }

  const style = document.createElement('style');
  style.textContent = `
    .customer-login-page{max-width:520px!important;padding-top:64px;padding-bottom:72px}
    .customer-login-card{border:1px solid #e5e7eb;border-radius:20px;padding:34px 34px 30px;box-shadow:0 12px 34px -24px rgba(15,23,42,.28);margin:0;background:#fff}
    .customer-login-eyebrow{font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:10px}
    .customer-login-card h1{font-size:2rem;letter-spacing:-.035em;margin-bottom:8px;color:#202124}
    .customer-login-card>p{font-size:1rem;line-height:1.55;margin-bottom:28px;max-width:390px}
    .customer-login-card .field{margin-bottom:18px}
    .customer-login-card label{font-size:.9rem;color:#374151}
    .customer-login-card input{min-height:50px;border-radius:10px;padding:12px 14px;background:#fff}
    .customer-login-card .btn.block{min-height:50px;border-radius:10px;font-size:1rem}
    .customer-login-card form+*{margin-top:0}
    .customer-login-signup{border-top:1px solid #e5e7eb;margin-top:26px;padding-top:22px;text-align:center;color:#64748b;font-size:.92rem}
    .customer-login-signup a{color:#2563eb;font-weight:750;margin-left:3px}
    .customer-login-signup a:hover{text-decoration:underline}
    @media(max-width:600px){.customer-login-page{padding:32px 18px 52px!important}.customer-login-card{padding:28px 22px 24px;border-radius:16px}.customer-login-card h1{font-size:1.72rem}}
  `;
  document.head.appendChild(style);
})();
