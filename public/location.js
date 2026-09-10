'use strict';

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
