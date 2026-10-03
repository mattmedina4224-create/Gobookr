'use strict';

const { escapeHtml, icon } = require('./util');

function nav(currentUser, session) {
  if (!currentUser) {
    return `
      <div class="nav-links">
        <a href="/#find">Find a pro</a>
        <a href="/openings">Openings Today</a>
        <a href="/search?type=businesses">Find a business</a>
        <a href="/business-account">For Businesses</a>
        <a href="/login">Sign in</a>
        <a class="btn" href="/signup">Sign up</a>
      </div>`;
  }
  const dashHref = currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer';
  const csrf = session ? escapeHtml(session.csrf_token) : '';
  return `
    <div class="nav-links">
      <a href="/#find">Find a pro</a>
      <a href="/openings">Openings Today</a>
        <a href="/search?type=businesses">Find a business</a>
      <a href="${dashHref}">Dashboard</a>
      <span class="muted" style="padding:0 var(--gb-space-1);">Hi, ${escapeHtml(currentUser.name.split(' ')[0])}</span>
      <form method="POST" action="/logout"><input type="hidden" name="_csrf" value="${csrf}" /><button type="submit">Log out</button></form>
    </div>`;
}

function layout({ title, currentUser, session, flash, body, activeNav = '', description = 'Find trusted personal-service professionals near you on GoBookr.', canonical = '', robots = '', structuredData = null, shareImage = '', stylesheet = '' }) {
  const flashHtml = flash
    ? `<div class="container" style="padding-top:var(--gb-space-3);"><div class="alert ${flash.type}">${escapeHtml(flash.message)}</div></div>`
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
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/discovery.css" />
  ${stylesheet === '/home.css' ? '<link rel="stylesheet" href="/home.css" />' : ''}
  <link rel="stylesheet" href="/design-system.css" />
  <script src="/location.js" defer></script>
  <link rel="icon" type="image/svg+xml" sizes="any" href="/gobookr-favicon-navy-20260910-v2.svg?v=navy-2" />
  <link rel="shortcut icon" type="image/svg+xml" href="/gobookr-favicon-navy-20260910-v2.svg?v=navy-2" />
</head>
<body>
  <header class="site-header gb-nav">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <div class="container">
      <a class="brand" href="/" aria-label="GoBookr home"><span class="mark" aria-hidden="true">G</span><span class="gb-wordmark">gobookr</span></a>
      ${nav(currentUser, session)}
    </div>
  </header>
  ${flashHtml}
  <main id="main-content">${body}</main>
  <footer class="site-footer gb-footer">
    <div class="container">
      <div>© ${new Date().getUTCFullYear()} GoBookr. Discover personal-service professionals and book directly.</div>
      <div style="display:flex; gap:var(--gb-space-3); flex-wrap:wrap;"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></div>
    </div>
  </footer>
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
      selected.style.marginTop = 'var(--gb-space-2)';
      selected.textContent = 'No photo selected';

      const error = document.createElement('div');
      error.className = 'helptext';
      error.setAttribute('role', 'alert');
      error.style.marginTop = 'var(--gb-space-2)';
      error.style.color = 'var(--gb-error)';
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
        const captionInput = form.querySelector('[name="caption"]');
        const csrfInput = form.querySelector('[name="_csrf"]');

        form.addEventListener('submit', async (event) => {
          event.preventDefault();

          if (!input.files || !input.files.length) {
            error.textContent = 'Please add a photo first.';
            error.hidden = false;
            button.focus();
            return;
          }

          if (captionInput && !captionInput.value.trim()) {
            error.textContent = 'Please add a caption.';
            error.hidden = false;
            captionInput.focus();
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
              submitButton.textContent = 'Upload photo';
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
          confirmation.style.margin = 'var(--gb-space-2) 0 var(--gb-space-3)';
          confirmation.style.padding = 'var(--gb-space-2) var(--gb-space-3)';
          confirmation.style.borderRadius = 'var(--gb-radius-sm)';
          confirmation.style.background = 'var(--gb-bg)';
          confirmation.style.border = '1px solid var(--gb-border)';
          confirmation.style.color = 'var(--gb-body)';
          confirmation.style.fontWeight = '700';
          confirmation.textContent = '✓ Photo uploaded successfully';
          heading.insertAdjacentElement('afterend', confirmation);
        }
      }
    })();

    (() => {
      const cityInputs = Array.from(document.querySelectorAll('form[action="/search"] input[name="city"]'));
      if (!cityInputs.length) return;

      const pinSvg = ${JSON.stringify(icon('map-pin'))};
      const searchSvg = ${JSON.stringify(icon('search'))};

      cityInputs.forEach((cityInput) => {
        if (cityInput.dataset.gpsReady === '1') return;
        cityInput.dataset.gpsReady = '1';

        const form = cityInput.closest('form');
        if (!form) return;
        const isHeroSearch = !!form.closest('.search-card');

        const locationWrap = document.createElement('div');
        locationWrap.style.display = 'flex';
        locationWrap.style.alignItems = 'center';
        locationWrap.style.minWidth = '0';
        locationWrap.style.position = 'relative';
        if (isHeroSearch) {
          locationWrap.style.borderLeft = '1px solid var(--paper-line)';
          locationWrap.style.paddingLeft = '10px';
        }

        const pinButton = document.createElement('button');
        pinButton.type = 'button';
        pinButton.setAttribute('aria-label', 'Use my location');
        pinButton.title = 'Use my location';
        pinButton.innerHTML = pinSvg;
        pinButton.style.border = '0';
        pinButton.style.background = 'transparent';
        pinButton.style.padding = 'var(--gb-space-2)';
        pinButton.style.color = 'var(--ink)';
        pinButton.style.display = 'inline-flex';
        pinButton.style.alignItems = 'center';
        pinButton.style.justifyContent = 'center';
        pinButton.style.flex = '0 0 auto';

        const originalParent = cityInput.parentNode;
        originalParent.insertBefore(locationWrap, cityInput);
        locationWrap.appendChild(pinButton);
        locationWrap.appendChild(cityInput);

        cityInput.placeholder = 'City or ZIP';
        if (isHeroSearch) {
          cityInput.style.border = '0';
          cityInput.style.outline = '0';
          cityInput.style.boxShadow = 'none';
          cityInput.style.background = 'transparent';
          cityInput.style.paddingLeft = '2px';
        }

        const status = document.createElement('div');
        status.className = 'helptext';
        status.style.marginTop = 'var(--gb-space-1)';
        status.style.gridColumn = '1 / -1';
        status.style.minHeight = '0';
        if (isHeroSearch) form.insertAdjacentElement('afterend', status);
        else locationWrap.insertAdjacentElement('afterend', status);

        if (isHeroSearch) {
          form.style.display = 'grid';
          form.style.gridTemplateColumns = '1.15fr 1fr 1fr 56px';
          form.style.alignItems = 'center';
          form.style.gap = '0';
          form.style.background = 'var(--paper)';
          form.style.border = '1px solid var(--paper-line)';
          form.style.borderRadius = 'var(--gb-radius-pill)';
          form.style.padding = 'var(--gb-space-1)';
          form.style.overflow = 'hidden';

          const directFields = Array.from(form.children);
          directFields.forEach((el) => {
            if (el === locationWrap) return;
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
              el.style.border = '0';
              el.style.outline = '0';
              el.style.boxShadow = 'none';
              el.style.background = 'transparent';
              el.style.borderRadius = '0';
              el.style.minWidth = '0';
            }
          });

          const submit = form.querySelector('button[type="submit"]');
          if (submit) {
            submit.innerHTML = searchSvg;
            submit.setAttribute('aria-label', 'Search');
            submit.title = 'Search';
            submit.style.width = '48px';
            submit.style.height = '48px';
            submit.style.padding = '0';
            submit.style.borderRadius = '50%';
            submit.style.justifySelf = 'center';
          }

          const media = window.matchMedia('(max-width: 720px)');
          const applyMobile = () => {
            if (media.matches) {
              form.style.gridTemplateColumns = '1fr';
              form.style.borderRadius = 'var(--gb-radius-lg)';
              form.style.gap = '6px';
              locationWrap.style.borderLeft = '0';
              locationWrap.style.borderTop = '1px solid var(--paper-line)';
              locationWrap.style.paddingLeft = '0';
              locationWrap.style.paddingTop = '4px';
              const submit = form.querySelector('button[type="submit"]');
              if (submit) { submit.style.width = '100%'; submit.style.borderRadius = 'var(--gb-radius-pill)'; }
            } else {
              form.style.gridTemplateColumns = '1.15fr 1fr 1fr 56px';
              form.style.borderRadius = 'var(--gb-radius-pill)';
              form.style.gap = '0';
              locationWrap.style.borderTop = '0';
              locationWrap.style.borderLeft = '1px solid var(--paper-line)';
              locationWrap.style.paddingTop = '0';
              locationWrap.style.paddingLeft = '10px';
              const submit = form.querySelector('button[type="submit"]');
              if (submit) { submit.style.width = '48px'; submit.style.borderRadius = '50%'; }
            }
          };
          applyMobile();
          media.addEventListener && media.addEventListener('change', applyMobile);
        }

        pinButton.addEventListener('click', () => {
          if (!navigator.geolocation) {
            status.textContent = 'Location is not supported on this device.';
            return;
          }

          pinButton.disabled = true;
          pinButton.style.opacity = '0.55';
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
              pinButton.style.opacity = '1';
              form.submit();
            } catch (err) {
              status.textContent = err && err.message ? err.message : 'Could not use your location.';
              pinButton.disabled = false;
              pinButton.style.opacity = '1';
            }
          }, (err) => {
            if (err && err.code === 1) status.textContent = 'Location permission was denied. You can still enter your city or ZIP.';
            else status.textContent = 'Could not get your location. Try again or enter your city or ZIP.';
            pinButton.disabled = false;
            pinButton.style.opacity = '1';
          }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
        });
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { layout };
