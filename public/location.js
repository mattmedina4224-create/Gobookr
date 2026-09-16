'use strict';

(() => {
  // Keep one GoBookr brand icon everywhere: browser tabs and the site header.
  const brandHref = '/gobookr-brand-20260912.svg?v=brand-20260912-1';
  document.querySelectorAll('link[rel*="icon"]').forEach((link) => link.remove());

  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.sizes = 'any';
  icon.href = brandHref;
  document.head.appendChild(icon);

  const shortcut = document.createElement('link');
  shortcut.rel = 'shortcut icon';
  shortcut.type = 'image/svg+xml';
  shortcut.href = brandHref;
  document.head.appendChild(shortcut);

  const brand = document.querySelector('.site-header .brand');
  if (brand) {
    const oldMark = brand.querySelector('.mark, .brand-mark');
    if (oldMark) {
      const logo = document.createElement('img');
      logo.src = brandHref;
      logo.alt = '';
      logo.className = 'brand-mark';
      logo.width = 36;
      logo.height = 36;
      logo.style.width = '36px';
      logo.style.height = '36px';
      logo.style.borderRadius = '9px';
      logo.style.flex = '0 0 auto';
      oldMark.replaceWith(logo);
    }
  }
})();

(() => {
  // Load public discovery/profile polish without disturbing the base stylesheet.
  if (!document.querySelector('link[href="/discovery.css"]')) {
    const discoveryStyles = document.createElement('link');
    discoveryStyles.rel = 'stylesheet';
    discoveryStyles.href = '/discovery.css';
    document.head.appendChild(discoveryStyles);
  }

  const STORAGE_LAT = 'gobookr_user_lat';
  const STORAGE_LON = 'gobookr_user_lon';

  function toRadians(value) { return (value * Math.PI) / 180; }
  function milesBetween(lat1, lon1, lat2, lon2) {
    const earthRadiusMiles = 3958.7613;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function storedLocation() {
    try {
      const lat = Number(sessionStorage.getItem(STORAGE_LAT));
      const lon = Number(sessionStorage.getItem(STORAGE_LON));
      return Number.isFinite(lat) && Number.isFinite(lon) && sessionStorage.getItem(STORAGE_LAT) !== null ? { lat, lon } : null;
    } catch (_) { return null; }
  }

  function saveLocation(lat, lon) {
    try { sessionStorage.setItem(STORAGE_LAT, String(lat)); sessionStorage.setItem(STORAGE_LON, String(lon)); } catch (_) {}
  }

  function updateDistances(lat, lon) {
    const cards = Array.from(document.querySelectorAll('[data-lat][data-lon]'));
    cards.forEach((card) => {
      const targetLat = Number(card.dataset.lat);
      const targetLon = Number(card.dataset.lon);
      if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return;
      const miles = milesBetween(lat, lon, targetLat, targetLon);
      const target = card.querySelector('.distance-away, .profile-distance');
      if (target) target.textContent = miles.toFixed(1) + ' miles away';
    });

    const cardParents = new Map();
    cards.forEach((card) => {
      if (!card.classList.contains('pro-card') || !card.parentElement) return;
      if (!cardParents.has(card.parentElement)) cardParents.set(card.parentElement, []);
      cardParents.get(card.parentElement).push(card);
    });
    cardParents.forEach((group, parent) => {
      group.sort((a, b) => milesBetween(lat, lon, Number(a.dataset.lat), Number(a.dataset.lon)) - milesBetween(lat, lon, Number(b.dataset.lat), Number(b.dataset.lon)));
      group.forEach((card) => parent.appendChild(card));
    });
  }

  function requestLocation(onSuccess, onError) {
    if (!navigator.geolocation) return onError && onError('Location is not supported on this device.');
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      saveLocation(lat, lon);
      updateDistances(lat, lon);
      onSuccess && onSuccess(lat, lon);
    }, () => onError && onError('Could not get your location. Try again or enter your city or ZIP.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  }

  function addBusinessGpsHelper() {
    if (window.location.pathname !== '/dashboard/pro/profile') return;
    const form = document.querySelector('form[action="/dashboard/pro/profile"]');
    if (!form || document.querySelector('[data-business-gps]')) return;
    const csrf = form.querySelector('input[name="_csrf"]');
    if (!csrf) return;

    const block = document.createElement('div');
    block.setAttribute('data-business-gps', '1');
    block.style.margin = '0 0 18px';
    block.style.padding = '14px';
    block.style.border = '1px solid var(--paper-line)';
    block.style.borderRadius = '12px';
    block.innerHTML = '<strong>Business GPS location</strong><p class="helptext" style="margin:5px 0 10px;">If you are physically at your workplace, you can save this device location for more precise mileage.</p><button class="btn secondary small" type="button" data-save-business-location>Use my current location</button><div class="helptext" data-business-location-status style="margin-top:8px;"></div>';

    const workplaceHeading = Array.from(form.querySelectorAll('h3')).find((el) => el.textContent.trim() === 'Where do you work?');
    const anchor = workplaceHeading ? workplaceHeading.parentElement : form.querySelector('#workplace_name')?.closest('.field');
    if (anchor) anchor.insertAdjacentElement('afterend', block); else form.insertBefore(block, form.firstChild);

    const button = block.querySelector('[data-save-business-location]');
    const status = block.querySelector('[data-business-location-status]');
    button.addEventListener('click', () => {
      button.disabled = true;
      status.textContent = 'Finding your workplace location...';
      requestLocation(async (lat, lon) => {
        try {
          const body = new URLSearchParams({ _csrf: csrf.value, latitude: String(lat), longitude: String(lon) });
          const response = await fetch('/dashboard/pro/location', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, credentials: 'same-origin', body });
          if (!response.ok) throw new Error('Could not save this location.');
          status.textContent = 'Business GPS location saved.';
        } catch (err) {
          status.textContent = err && err.message ? err.message : 'Could not save this location.';
        } finally {
          button.disabled = false;
        }
      }, (message) => { status.textContent = message; button.disabled = false; });
    });
  }

  function polishProfessionalProfile() {
    if (window.location.pathname !== '/dashboard/pro/profile') return;
    const form = document.querySelector('form[action="/dashboard/pro/profile"]');
    if (!form) return;

    // Professional location comes from the saved business address, not device GPS.
    document.querySelectorAll('[data-business-gps]').forEach((el) => el.remove());

    const bookingInput = form.querySelector('#booking_url');
    if (bookingInput) {
      bookingInput.type = 'text';
      bookingInput.inputMode = 'url';
      bookingInput.autocomplete = 'url';
      bookingInput.placeholder = 'novobarbers.com or your booking link';
      const field = bookingInput.closest('.field');
      const help = field && field.querySelector('.helptext');
      if (field) field.style.marginBottom = '28px';
      if (help) {
        help.style.display = 'block';
        help.style.position = 'static';
        help.style.marginTop = '8px';
        help.style.lineHeight = '1.45';
      }
    }

    const workplaceHeading = Array.from(form.querySelectorAll('h3')).find((el) => el.textContent.trim() === 'Where do you work?');
    if (workplaceHeading && workplaceHeading.parentElement) {
      const detail = workplaceHeading.parentElement.querySelector('p');
      if (detail) detail.textContent = 'Enter the business address below. GoBookr uses it to calculate distance for nearby customers.';
    }
  }

  // Keep business location address-based for professionals.
  polishProfessionalProfile();

  const existing = storedLocation();
  if (existing) updateDistances(existing.lat, existing.lon);
  else if (document.querySelector('.distance-away, .profile-distance')) requestLocation();

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-use-location]');
    if (!button) return;
    event.preventDefault();
    const cityInput = document.querySelector('form[action="/search"] input[name="city"]');
    const status = document.querySelector('[data-location-status]');
    button.disabled = true;
    if (status) status.textContent = 'Finding your location...';
    requestLocation(async (lat, lon) => {
      try {
        const response = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) + '&localityLanguage=en');
        const place = await response.json();
        const city = place.city || place.locality || place.principalSubdivision || '';
        if (cityInput && city) {
          cityInput.value = city;
          cityInput.form.submit();
        }
      } catch (_) { if (status) status.textContent = 'Could not identify your city.'; button.disabled = false; }
    }, (message) => { if (status) status.textContent = message; button.disabled = false; });
  });
})();

(() => {
  // Radius search controls: 1,2,3,4,5,10,15,20 miles. GPS coordinates are kept
  // in the search request only when the customer uses their current location.
  const allowed = ['1', '2', '3', '4', '5', '10', '15', '20'];
  const params = new URLSearchParams(window.location.search);
  const requestedRadius = allowed.includes(params.get('radius')) ? params.get('radius') : '5';
  const style = document.createElement('style');
  style.textContent = '.search-card form.gobookr-radius-search{grid-template-columns:1.05fr 1fr .72fr 1fr 56px !important}.gobookr-radius-select{min-width:0}@media(max-width:720px){.search-card form.gobookr-radius-search{grid-template-columns:1fr !important}.gobookr-radius-select{width:100%;min-height:58px}}';
  document.head.appendChild(style);

  function storedLocation() {
    try {
      const lat = Number(sessionStorage.getItem('gobookr_user_lat'));
      const lon = Number(sessionStorage.getItem('gobookr_user_lon'));
      return Number.isFinite(lat) && Number.isFinite(lon) && sessionStorage.getItem('gobookr_user_lat') !== null ? { lat, lon } : null;
    } catch (_) { return null; }
  }

  document.querySelectorAll('form[action="/search"]').forEach((form) => {
    form.classList.add('gobookr-radius-search');
    let radius = form.querySelector('select[name="radius"]');
    if (!radius) {
      radius = document.createElement('select');
      radius.name = 'radius';
      radius.setAttribute('aria-label', 'Search radius');
      radius.innerHTML = allowed.map((value) => `<option value="${value}">${value} mile${value === '1' ? '' : 's'}</option>`).join('');
      const q = form.querySelector('input[name="q"]');
      if (q) form.insertBefore(radius, q); else form.appendChild(radius);
    }
    radius.classList.add('gobookr-radius-select');
    if (allowed.includes(requestedRadius)) radius.value = requestedRadius;

    let latInput = form.querySelector('input[name="lat"]');
    let lonInput = form.querySelector('input[name="lon"]');
    if (!latInput) { latInput = document.createElement('input'); latInput.type = 'hidden'; latInput.name = 'lat'; form.appendChild(latInput); }
    if (!lonInput) { lonInput = document.createElement('input'); lonInput.type = 'hidden'; lonInput.name = 'lon'; form.appendChild(lonInput); }

    const cityInput = form.querySelector('input[name="city"]');
    if (cityInput) {
      cityInput.addEventListener('input', () => {
        form.dataset.manualCity = '1';
        latInput.value = '';
        lonInput.value = '';
      });
    }

    const syncGps = () => {
      if (form.dataset.manualCity === '1') return;
      const location = storedLocation();
      if (!location) return;
      latInput.value = String(location.lat);
      lonInput.value = String(location.lon);
    };

    // The existing location-pin code uses form.submit(), which bypasses submit events.
    // Shadow it for search forms so the GPS coordinates are attached before navigation.
    const nativeSubmit = HTMLFormElement.prototype.submit;
    form.submit = function () { syncGps(); nativeSubmit.call(form); };
    form.addEventListener('submit', () => syncGps());
  });
})();

(() => {
  const NAV_VERSION = 'gobookr-brand-20260912-1';
  document.querySelectorAll('a[href]').forEach((link) => {
    const raw = link.getAttribute('href');
    if (!raw || !raw.startsWith('/')) return;
    if (raw.startsWith('//') || raw.startsWith('/logout')) return;

    try {
      const url = new URL(raw, window.location.origin);
      if (url.pathname === '/' || url.pathname === '/search' || url.pathname === '/signup') {
        url.searchParams.set('_gb', NAV_VERSION);
        link.setAttribute('href', url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  });
})();