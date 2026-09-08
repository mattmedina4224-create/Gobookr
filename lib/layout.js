'use strict';

const { escapeHtml } = require('./util');

function nav(currentUser, session) {
  if (!currentUser) {
    return `
      <div class="nav-links">
        <a href="/search">Find a pro</a>
        <a href="/signup?role=pro">For professionals</a>
        <a href="/login">Log in</a>
        <a class="cta" href="/signup?role=customer">Sign up</a>
      </div>`;
  }
  const dashHref = currentUser.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer';
  const csrf = session ? escapeHtml(session.csrf_token) : '';
  return `
    <div class="nav-links">
      <a href="/search">Find a pro</a>
      <a href="${dashHref}">Dashboard</a>
      <span class="muted" style="padding: 0 6px;">Hi, ${escapeHtml(currentUser.name.split(' ')[0])}</span>
      <form method="POST" action="/logout"><input type="hidden" name="_csrf" value="${csrf}" /><button type="submit">Log out</button></form>
    </div>`;
}

function layout({ title, currentUser, session, flash, body, activeNav = '' }) {
  const flashHtml = flash
    ? `<div class="container" style="padding-top:20px;"><div class="alert ${flash.type}">${escapeHtml(flash.message)}</div></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · GoBookr</title>
  <meta name="description" content="GoBookr connects you with trusted, reviewed barbers, hairstylists, and colorists near you." />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✂️</text></svg>" />
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a class="brand" href="/"><span class="mark">G</span>GoBookr<span class="dot">.</span></a>
      ${nav(currentUser, session)}
    </div>
  </header>
  ${flashHtml}
  ${body}
  <footer class="site-footer">
    <div class="container">
      <div>© ${new Date().getUTCFullYear()} GoBookr. Find and book barbers, hairstylists &amp; colorists you can trust.</div>
      <div>Built for demo purposes — sample data, not real businesses.</div>
    </div>
  </footer>
  <script>
    (() => {
      const input = document.getElementById('image');
      if (!input || input.type !== 'file') return;

      input.setAttribute('accept', 'image/*');
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
      button.textContent = 'Add Photos';
      button.addEventListener('click', () => input.click());

      const selected = document.createElement('div');
      selected.className = 'helptext';
      selected.style.marginTop = '8px';
      selected.textContent = 'No photo selected';

      const error = document.createElement('div');
      error.className = 'helptext';
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
          if (file.size > 10 * 1024 * 1024) {
            error.textContent = 'Photo must be 10 MB or smaller.';
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

      const pinSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/></svg>';
      const searchSvg = '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
        pinButton.style.padding = '8px';
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
        status.style.marginTop = '6px';
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
          form.style.borderRadius = '999px';
          form.style.padding = '6px';
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
              form.style.borderRadius = '20px';
              form.style.gap = '6px';
              locationWrap.style.borderLeft = '0';
              locationWrap.style.borderTop = '1px solid var(--paper-line)';
              locationWrap.style.paddingLeft = '0';
              locationWrap.style.paddingTop = '4px';
              const submit = form.querySelector('button[type="submit"]');
              if (submit) { submit.style.width = '100%'; submit.style.borderRadius = '999px'; }
            } else {
              form.style.gridTemplateColumns = '1.15fr 1fr 1fr 56px';
              form.style.borderRadius = '999px';
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
            else status.textContent = 'Could not get your location. Please try again.';
            pinButton.disabled = false;
            pinButton.style.opacity = '1';
          }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        });
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { layout };
