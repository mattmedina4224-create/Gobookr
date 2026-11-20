'use strict';

const { escapeHtml } = require('./util');

const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m20 20-4.2-4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

function initialsFor(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'G';
}

function nav(currentUser, session) {
  if (!currentUser) {
    return `
      <nav id="site-navigation" class="nav-links" aria-label="Main navigation">
        <div class="gb-nav-primary">
          <a href="/#find">Find a pro</a>
          <a href="/search?type=businesses">Find a business</a>
          <a href="/specialties">Specialties</a>
        </div>
        <div class="gb-nav-account">
          <a href="/join">Join as a professional</a>
          <a href="/login">Sign in</a>
          <a class="btn" href="/signup">Customer sign up</a>
        </div>
      </nav>`;
  }
  const dashHref = currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer';
  // Owners of a claimed business page get a direct link to their (free) business dashboard.
  let ownsShop = false;
  try { ownsShop = Boolean(require('../db').prepare("SELECT 1 AS ok FROM shops WHERE owner_user_id = ? AND claim_status = 'claimed' LIMIT 1").get(currentUser.id)); } catch (_) { ownsShop = false; }
  const csrf = session ? escapeHtml(session.csrf_token) : '';
  const firstName = escapeHtml(String(currentUser.name || '').split(' ')[0]);
  return `
    <nav id="site-navigation" class="nav-links" aria-label="Main navigation">
      <div class="gb-nav-primary">
        <a href="/#find">Find a pro</a>
        <a href="/search?type=businesses">Find a business</a>
        ${currentUser.role === 'customer' ? '<a href="/following">Following</a>' : ''}
      </div>
      <div class="gb-nav-account">
        ${currentUser.role === 'customer' ? '<a href="/join">Join as a professional</a>' : ''}
        ${process.env.BUSINESS_TEAMS_ENABLED==='1' ? `<a href="${currentUser.role==='pro'?'/dashboard/pro/team':'/dashboard/shop/team'}">Business team</a>` : ''}
        ${ownsShop ? '<a href="/dashboard/shop">Your business</a>' : ''}
        ${process.env.MERCH_STUDIO_ENABLED === '1' && (currentUser.role !== 'customer' || ownsShop) ? '<a href="/merch">Merch Studio</a>' : ''}
        <a class="gb-nav-dashboard" href="${dashHref}">Dashboard</a>
        <span class="gb-nav-user" title="Signed in as ${escapeHtml(String(currentUser.name || ''))}"><span class="gb-avatar-dot" aria-hidden="true">${escapeHtml(initialsFor(currentUser.name))}</span><span class="muted">Hi, ${firstName}</span></span>
        <form method="POST" action="/logout"><input type="hidden" name="_csrf" value="${csrf}" /><button type="submit">Log out</button></form>
      </div>
    </nav>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div class="container gb-footer-grid">
      <div class="gb-footer-brand">
        <a class="brand" href="/" aria-label="GoBookr home page"><img class="brand-mark" src="/gobookr-mark-2026.svg" width="28" height="28" alt="" /><span class="brand-word">GoBookr</span></a>
        <p>Discover personal service professionals and book directly.</p>
      </div>
      <nav class="gb-footer-col" aria-label="Discover"><h2>Discover</h2><a href="/#find">Find a pro</a><a href="/search?type=businesses">Find a business</a><a href="/specialties">Services &amp; specialties</a></nav>
      <nav class="gb-footer-col" aria-label="For professionals"><h2>For professionals</h2><a href="/join">Join GoBookr</a><a href="/search?type=professionals">Claim your profile</a><a href="/login">Sign in</a></nav>
      <nav class="gb-footer-col" aria-label="Company"><h2>Company</h2><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></nav>
    </div>
    <div class="container gb-footer-base"><span>© GoBookr</span><span>Bookings happen on each professional’s own scheduling site.</span></div>
  </footer>`;
}

function layout({ title, currentUser, session, flash, body, activeNav = '', description = 'Find trusted personal-service professionals near you on GoBookr.', canonical = '', robots = '', structuredData = null, shareImage = '' }) {
  const flashHtml = flash
    ? `<div class="container gb-flash"><div class="alert ${flash.type}" role="status">${escapeHtml(flash.message)}</div></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · GoBookr</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:site_name" content="GoBookr" />
  <meta property="og:title" content="${escapeHtml(title)} · GoBookr" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : ''}
  ${shareImage ? `<meta property="og:image" content="${escapeHtml(shareImage)}" />` : ''}
  <meta name="twitter:card" content="${shareImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeHtml(title)} · GoBookr" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${shareImage ? `<meta name="twitter:image" content="${escapeHtml(shareImage)}" />` : ''}
  ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : ''}
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}" />` : ''}
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>` : ''}
  <link rel="preload" href="/fonts/Inter-Regular.woff" as="font" type="font/woff" crossorigin />
  <link rel="preload" href="/fonts/InterDisplay-SemiBold.woff" as="font" type="font/woff" crossorigin />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/discovery.css" />
  <link rel="stylesheet" href="/gobookr-ui.css?v=2026-11" />
  <meta name="theme-color" content="#ffffff" />
  <script src="/location.js" defer></script>
  <script src="/site-navigation.js" defer></script>
  <link rel="icon" type="image/svg+xml" sizes="any" href="/gobookr-mark-2026.svg?v=iris-1" />
  <link rel="shortcut icon" type="image/svg+xml" href="/gobookr-mark-2026.svg?v=iris-1" />
</head>
<body>
  <header class="site-header">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <div class="container gb-header-inner">
      <a class="brand" href="/" aria-label="GoBookr home"><img class="brand-mark" src="/gobookr-mark-2026.svg" width="30" height="30" alt="" /><span class="brand-word">GoBookr</span></a>
      <a class="gb-header-search" href="/search"><span class="gb-icon">${ICONS.search}</span><span>Search services, pros, or cities</span></a>
      <a class="gb-header-search-mobile" href="/search" aria-label="Search">${ICONS.search}</a>
      <button class="mobile-menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-navigation" hidden>${ICONS.menu}</button>
      ${nav(currentUser, session)}
    </div>
  </header>
  ${flashHtml}
  <main id="main-content">${body}</main>
  ${footer()}
  <script>
    (() => {
      const input = document.getElementById('image');
      if (!input || input.type !== 'file') return;

      input.setAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif');
      input.removeAttribute('required');

      const label = document.querySelector('label[for="image"]');
      if (label) label.textContent = 'Add from Photos or Files';

      const help = input.parentElement && input.parentElement.querySelector('.helptext');
      if (help) help.textContent = 'Choose a photo from your photo library, camera, or computer files.';

      input.style.position = 'absolute';
      input.style.width = '1px';
      input.style.height = '1px';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary';
      button.textContent = 'Add Photo';
      button.addEventListener('click', () => input.click());
      button.setAttribute('aria-describedby', 'portfolio-upload-status');

      const selected = document.createElement('div');
      selected.className = 'helptext';
      selected.id = 'portfolio-upload-status';
      selected.setAttribute('aria-live', 'polite');
      selected.style.marginTop = '8px';
      selected.textContent = 'No photo selected';

      const error = document.createElement('div');
      error.className = 'helptext';
      error.setAttribute('role', 'alert');
      error.style.marginTop = '8px';
      error.style.color = '#b42318';
      error.style.fontWeight = '600';
      error.hidden = true;

      input.addEventListener('change', () => {
        if (input.files && input.files.length) {
          selected.textContent = input.files[0].name + ' ready to upload';
          selected.style.fontWeight = '600';
          error.hidden = true;
          error.textContent = '';
        } else {
          selected.textContent = 'No photo selected';
          selected.style.fontWeight = '400';
        }
      });

      input.parentElement.insertBefore(button, input);
      input.parentElement.insertBefore(selected, help || input.nextSibling);
      input.parentElement.appendChild(error);

      const form = input.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        const submitLabel = submitButton ? submitButton.textContent : '';
        const captionInput = form.querySelector('[name="caption"]');
        const csrfInput = form.querySelector('[name="_csrf"]');
        const setupStepInput = form.querySelector('[name="_setup_step"]');

        form.addEventListener('submit', async (event) => {
          event.preventDefault();

          if (!input.files || !input.files.length) {
            error.textContent = 'Please add a photo first.';
            error.hidden = false;
            button.focus();
            return;
          }

          const file = input.files[0];
          if (file.size > 3 * 1024 * 1024) {
            error.textContent = 'Photo must be 3 MB or smaller.';
            error.hidden = false;
            return;
          }

          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Uploading...';
          }
          button.disabled = true;
          selected.textContent = 'Uploading photo...';
          error.hidden = true;

          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Could not read that photo.'));
              reader.readAsDataURL(file);
            });
            const comma = dataUrl.indexOf(',');
            if (comma === -1) throw new Error('Could not prepare that photo.');

            const response = await fetch(form.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                _csrf: csrfInput ? csrfInput.value : '',
                _setup_step: setupStepInput ? setupStepInput.value : '',
                _setup_exit: event.submitter && event.submitter.name === '_setup_exit' ? event.submitter.value : '',
                _setup_add_more: event.submitter && event.submitter.name === '_setup_add_more' ? event.submitter.value : '',
                caption: captionInput ? captionInput.value.trim() : '',
                image_name: file.name,
                image_type: file.type,
                image_data: dataUrl.slice(comma + 1),
              }),
            });

            if (!response.ok) {
              throw new Error(response.status === 403 ? 'Your session expired. Refresh the page and try again.' : 'Upload failed. Please try again.');
            }

            window.location.href = response.redirected
              ? response.url
              : '/dashboard/pro/portfolio?success=' + encodeURIComponent('Photo uploaded.');
          } catch (err) {
            error.textContent = err && err.message ? err.message : 'Upload failed. Please try again.';
            error.hidden = false;
            selected.textContent = file.name + ' ready to upload';
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = submitLabel;
            }
            button.disabled = false;
          }
        });
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('success') === 'Photo uploaded.') {
        const heading = Array.from(document.querySelectorAll('h1')).find((el) => el.textContent.trim() === 'Portfolio');
        if (heading) {
          const confirmation = document.createElement('div');
          confirmation.setAttribute('role', 'status');
          confirmation.style.margin = '10px 0 16px';
          confirmation.style.padding = '12px 14px';
          confirmation.style.borderRadius = '10px';
          confirmation.style.background = '#ecfdf3';
          confirmation.style.border = '1px solid #abefc6';
          confirmation.style.color = '#067647';
          confirmation.style.fontWeight = '700';
          confirmation.textContent = '✓ Photo uploaded successfully';
          heading.insertAdjacentElement('afterend', confirmation);
        }
      }
    })();

    (() => {
      const cityInputs = Array.from(document.querySelectorAll('form[action="/search"] input[name="city"]'));
      if (!cityInputs.length) return;

      const pinSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>';

      cityInputs.forEach((cityInput) => {
        if (cityInput.dataset.gpsReady === '1') return;
        cityInput.dataset.gpsReady = '1';

        const form = cityInput.closest('form');
        if (!form) return;

        // Wrap the city field with a "use my location" button. Visual treatment lives in
        // gobookr-ui.css (.gb-loc-*) so every search form shares one design.
        const locationWrap = document.createElement('div');
        locationWrap.className = 'gb-loc-wrap';

        const pinButton = document.createElement('button');
        pinButton.type = 'button';
        pinButton.className = 'gb-loc-pin';
        pinButton.setAttribute('aria-label', 'Use my location');
        pinButton.title = 'Use my location';
        pinButton.innerHTML = pinSvg;

        const originalParent = cityInput.parentNode;
        originalParent.insertBefore(locationWrap, cityInput);
        locationWrap.appendChild(pinButton);
        locationWrap.appendChild(cityInput);

        cityInput.placeholder = 'City or ZIP';

        const status = document.createElement('div');
        status.className = 'helptext gb-loc-status';
        status.setAttribute('aria-live', 'polite');
        if (form.closest('.gb-search')) form.insertAdjacentElement('afterend', status);
        else locationWrap.insertAdjacentElement('afterend', status);

        pinButton.addEventListener('click', () => {
          if (!navigator.geolocation) {
            status.textContent = 'Location is not supported on this device.';
            return;
          }

          pinButton.disabled = true;
          status.textContent = 'Finding your location...';

          navigator.geolocation.getCurrentPosition(async (position) => {
            try {
              const lat = position.coords.latitude;
              const lon = position.coords.longitude;
              try {
                sessionStorage.setItem('gobookr_user_lat', String(lat));
                sessionStorage.setItem('gobookr_user_lon', String(lon));
              } catch (_) {}
              const response = await fetch(
                'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
                  encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) + '&localityLanguage=en'
              );
              if (!response.ok) throw new Error('Could not identify your city.');
              const place = await response.json();
              const city = place.city || place.locality || place.principalSubdivision || '';
              if (!city) throw new Error('Could not identify your city.');

              cityInput.value = city;
              status.textContent = 'Location found: ' + city;
              form.submit();
            } catch (err) {
              status.textContent = err && err.message ? err.message : 'Could not use your location.';
              pinButton.disabled = false;
            }
          }, (err) => {
            if (err && err.code === 1) status.textContent = 'Location permission was denied. You can still enter your city or ZIP.';
            else status.textContent = 'Could not get your location. Try again or enter your city or ZIP.';
            pinButton.disabled = false;
          }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
        });
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { layout };
