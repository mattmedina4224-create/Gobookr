'use strict';

const db = require('../db');
const zipcodes = require('zipcodes');

const RADIUS_VALUES = new Set([1, 2, 3, 4, 5, 10, 15, 20]);
const EARTH_RADIUS_MILES = 3958.7613;
const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

function validCoordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function parseRadius(value) {
  const radius = Number(value);
  return RADIUS_VALUES.has(radius) ? radius : null;
}

function radians(value) { return (value * Math.PI) / 180; }
function milesBetween(lat1, lon1, lat2, lon2) {
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveSearchCenter(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{5}$/.test(text)) {
    const match = zipcodes.lookup(text);
    return match ? { latitude: Number(match.latitude), longitude: Number(match.longitude), label: `${match.city}, ${match.state}` } : null;
  }

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts[0];
  let state = parts[1] || '';
  if (!state) {
    const known = db.prepare('SELECT state FROM pro_profiles WHERE LOWER(city) = LOWER(?) AND state IS NOT NULL AND state != ? LIMIT 1').get(city, '');
    state = known ? String(known.state || '').trim() : '';
  }
  if (!city || !state) return null;
  const matches = zipcodes.lookupByName(city, state);
  if (!matches || !matches.length) return null;
  const latitude = matches.reduce((sum, item) => sum + Number(item.latitude), 0) / matches.length;
  const longitude = matches.reduce((sum, item) => sum + Number(item.longitude), 0) / matches.length;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude, label: `${city}, ${state.toUpperCase()}` } : null;
}

function profileAddress(profile) {
  const street = String(profile.street_address || '').trim();
  const city = String(profile.city || '').trim();
  const state = String(profile.state || '').trim();
  const zip = String(profile.zip_code || '').trim();
  if (!street || !city || !state) return '';
  return [street, city, state, zip].filter(Boolean).join(', ').slice(0, 100);
}

async function geocodeRecord(profile, table) {
  const currentLat = validCoordinate(profile.latitude, -90, 90);
  const currentLon = validCoordinate(profile.longitude, -180, 180);
  if (currentLat !== null && currentLon !== null) return { latitude: currentLat, longitude: currentLon };

  const address = profileAddress(profile);
  if (!address) return null;
  try {
    const params = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
    const response = await fetch(`${GEOCODER_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'GoBookr/1.0 (https://gobookr.com)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const match = payload && payload.result && Array.isArray(payload.result.addressMatches) ? payload.result.addressMatches[0] : null;
    const latitude = match ? validCoordinate(match.coordinates && match.coordinates.y, -90, 90) : null;
    const longitude = match ? validCoordinate(match.coordinates && match.coordinates.x, -180, 180) : null;
    if (latitude === null || longitude === null) return null;
    db.prepare('UPDATE ' + table + ' SET latitude = ?, longitude = ? WHERE id = ? AND latitude IS NULL AND longitude IS NULL').run(latitude, longitude, profile.id);
    profile.latitude = latitude;
    profile.longitude = longitude;
    return { latitude, longitude };
  } catch (_) {
    return null;
  }
}

async function geocodeMissing(profiles, table, concurrency = 6) {
  const queue = profiles.filter((profile) => validCoordinate(profile.latitude, -90, 90) === null || validCoordinate(profile.longitude, -180, 180) === null);
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const index = cursor++;
      await geocodeRecord(queue[index], table);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
}

async function filterByRadius(profiles, latitudeValue, longitudeValue, radiusValue) {
  const latitude = validCoordinate(latitudeValue, -90, 90);
  const longitude = validCoordinate(longitudeValue, -180, 180);
  const radius = parseRadius(radiusValue);
  if (latitude === null || longitude === null || radius === null) return { active: false, profiles };

  await geocodeMissing(profiles, 'pro_profiles');
  const filtered = profiles
    .map((profile) => {
      const proLat = validCoordinate(profile.latitude, -90, 90);
      const proLon = validCoordinate(profile.longitude, -180, 180);
      if (proLat === null || proLon === null) return null;
      const distanceMiles = milesBetween(latitude, longitude, proLat, proLon);
      return distanceMiles <= radius ? { ...profile, distanceMiles } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  return { active: true, profiles: filtered, latitude, longitude, radius };
}

async function filterBusinessesByRadius(businesses, latitudeValue, longitudeValue, radiusValue) {
  const latitude = validCoordinate(latitudeValue, -90, 90);
  const longitude = validCoordinate(longitudeValue, -180, 180);
  const radius = parseRadius(radiusValue);
  if (latitude === null || longitude === null || radius === null) return { active: false, businesses };

  await geocodeMissing(businesses, 'shops');
  const filtered = businesses
    .map((business) => {
      const itemLat = validCoordinate(business.latitude, -90, 90);
      const itemLon = validCoordinate(business.longitude, -180, 180);
      if (itemLat === null || itemLon === null) return null;
      const distanceMiles = milesBetween(latitude, longitude, itemLat, itemLon);
      return distanceMiles <= radius ? { ...business, distanceMiles } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  return { active: true, businesses: filtered, latitude, longitude, radius };
}

module.exports = { RADIUS_VALUES, parseRadius, milesBetween, resolveSearchCenter, filterByRadius, filterBusinessesByRadius };
