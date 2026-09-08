'use strict';

(() => {
  // Keep the browser-tab icon in sync with GoBookr's navy calendar brand mark.
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = '/gobookr-favicon.svg?v=2';

  const STORAGE_LAT = 'gobookr_user_lat';
  const STORAGE_LON = 'gobookr_user_lon';

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function milesBetween(lat1, lon1, lat2, lon2) {
    const earthRadiusMiles = 3958.7613;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distanceLabel(miles) {
    if (miles < 0.1) return 'Less than 0.1 miles away';
    if (miles < 10) return miles.toFixed(1) + ' miles away';
    return Math.round(miles) + ' miles away';
  }

  function setStoredLocation(lat, lon) {
    try {
      sessionStorage.setItem(STORAGE_LAT, String(lat));
      sessionStorage.setItem(STORAGE_LON, String(lon));
    } catch (_) {}
  }

  function getStoredLocation() {
    try {
      const lat = Number(sessionStorage.getItem(STORAGE_LAT));
      const lon = Number(sessionStorage.getItem(STORAGE_LON));
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    } catch (_) {}
    return null;
  }

  function updateDistances(userLat, userLon) {
    const cards = Array.from(document.querySelectorAll('.pro-card[data-lat][data-lon]'));
    cards.forEach((card) => {
      const proLat = Number(card.dataset.lat);
      const proLon = Number(card.dataset.lon);
      if (!Number.isFinite(proLat) || !Number.isFinite(proLon)) return;
      const miles = milesBetween(userLat, userLon, proLat, proLon);
      card.dataset.distanceMiles = String(miles);
      const label = card.querySelector('.distance-away');
      if (label) {
        label.textContent = distanceLabel(miles);
        label.style.color = 'var(--brand-dark)';
      }
    });

    const grids = Array.from(document.querySelectorAll('.pro-grid'));
    grids.forEach((grid) => {
      const locatedCards = Array.from(grid.children).filter((el) => el.matches && el.matches('.pro-card[data-distance-miles]'));
      if (!locatedCards.length) return;
      locatedCards
        .sort((a, b) => Number(a.dataset.distanceMiles) - Number(b.dataset.distanceMiles))
        .forEach((card) => grid.appendChild(card));
    });

    const profile = document.querySelector('.profile-head[data-lat][data-lon]');
    if (profile) {
      const proLat = Number(profile.dataset.lat);
      const proLon = Number(profile.dataset.lon);
      const label = profile.querySelector('.profile-distance');
      if (label && Number.isFinite(proLat) && Number.isFinite(proLon)) {
        label.textContent = distanceLabel(milesBetween(userLat, userLon, proLat, proLon));
        label.style.color = 'var(--brand-dark)';
      }
    }
  }

  function requestCustomerLocation() {
    const needsDistance = document.querySelector('.pro-card[data-lat][data-lon], .profile-head[data-lat][data-lon]');
    if (!needsDistance || !navigator.geolocation) return;

    const stored = getStoredLocation();
    if (stored) {
      updateDistances(stored.lat, stored.lon);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setStoredLocation(lat, lon);
        updateDistances(lat, lon);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function setupBusinessLocationButton() {
    if (window.location.pathname !== '/dashboard/pro/profile') return;
    const profileForm = document.querySelector('form[action="/dashboard/pro/profile"]');
    if (!profileForm || !navigator.geolocation) return;

    const csrf = profileForm.querySelector('input[name="_csrf"]');
    const block = document.createElement('div');
    block.style.margin = '4px 0 18px';
    block.style.padding = '14px';
    block.style.border = '1px solid var(--paper-line)';
    block.style.borderRadius = '12px';
    block.style.background = 'var(--paper-soft)';

    const title = document.createElement('div');
    title.style.fontWeight = '800';
    title.textContent = 'Business GPS location';

    const help = document.createElement('p');
    help.style.margin = '4px 0 10px';
    help.style.fontSize = '0.9rem';
    help.textContent = 'Set this while you are physically at your shop. Customers can then see how many miles away you are.';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary small';
    button.textContent = 'Set business location';

    const status = document.createElement('div');
    status.className = 'helptext';
    status.style.marginTop = '8px';

    block.appendChild(title);
    block.appendChild(help);
    block.appendChild(button);
    block.appendChild(status);

    const firstField = profileForm.querySelector('.field');
    if (firstField) profileForm.insertBefore(block, firstField);
    else profileForm.prepend(block);

    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = 'Finding location...';
      status.textContent = 'Allow location access when your browser asks.';

      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const body = new URLSearchParams({
            _csrf: csrf ? csrf.value : '',
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
          });
          const response = await fetch('/dashboard/pro/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'same-origin',
            body: body.toString(),
          });
          if (!response.ok) throw new Error('Could not save this location.');
          status.textContent = 'Business location saved. Customers can now see their distance from you.';
          status.style.color = 'var(--ok)';
          button.textContent = 'Location saved';
        } catch (err) {
          status.textContent = err && err.message ? err.message : 'Could not save this location.';
          status.style.color = 'var(--danger)';
          button.disabled = false;
          button.textContent = 'Set business location';
        }
      }, (err) => {
        status.textContent = err && err.code === 1
          ? 'Location permission was denied.'
          : 'Could not get your current location.';
        status.style.color = 'var(--danger)';
        button.disabled = false;
        button.textContent = 'Set business location';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }

  setupBusinessLocationButton();
  requestCustomerLocation();
})();
