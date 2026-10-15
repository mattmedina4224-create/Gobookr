'use strict';

const db = require('../db');
const zipcodes = require('zipcodes');

const RADIUS_VALUES = new Set([1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 17, 19]);
const EARTH_RADIUS_MILES = 3958.7613;

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
function boundingBox(latitudeValue, longitudeValue, radiusValue) {
  const latitude = validCoordinate(latitudeValue, -90, 90); const longitude = validCoordinate(longitudeValue, -180, 180); const radius = parseRadius(radiusValue);
  if (latitude === null || longitude === null || radius === null) return null;
  const latDelta = radius / 69; const cosLat = Math.max(Math.cos(radians(latitude)), 0.01); const lonDelta = radius / (69.172 * cosLat);
  return { minLat: Math.max(-90, latitude - latDelta), maxLat: Math.min(90, latitude + latDelta), minLon: Math.max(-180, longitude - lonDelta), maxLon: Math.min(180, longitude + lonDelta) };
}
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
    return match ? { latitude: Number(match.latitude), longitude: Number(match.longitude), city: match.city, state: match.state, zip: text, label: `${match.city}, ${match.state}` } : null;
  }

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts[0];
  let state = parts[1] || '';
  if (!state) {
    const known = db.prepare('SELECT DISTINCT UPPER(state) AS state FROM pro_profiles WHERE LOWER(city) = LOWER(?) AND state IS NOT NULL AND state != ? LIMIT 2').all(city, '');
    // Never silently choose one of two states with the same city name.
    if (known.length > 1) return null;
    state = known.length ? String(known[0].state || '').trim() : '';
  }
  if (!city || !state) return null;
  state = zipcodes.states.normalize(state);
  if (!state || !zipcodes.states.abbr[state]) return null;
  const matches = zipcodes.lookupByName(city, state);
  if (!matches || !matches.length) return null;
  const latitude = matches.reduce((sum, item) => sum + Number(item.latitude), 0) / matches.length;
  const longitude = matches.reduce((sum, item) => sum + Number(item.longitude), 0) / matches.length;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude, city: matches[0].city, state, label: `${matches[0].city}, ${state}` } : null;
}

function cityOnlyFilter(center) {
  if (!center || !center.city || !center.state) return null;
  // This is a separate city/ZIP match, not an approximate distance match.
  const location = center.zip ? 'zip_code = ?' : 'LOWER(city) = LOWER(?)';
  return {
    sql: `(latitude IS NULL OR longitude IS NULL) AND ${location} AND UPPER(state) = ?`,
    args: [center.zip || center.city, center.state],
    label: center.zip || `${center.city}, ${center.state}`,
  };
}

async function filterByRadius(profiles, latitudeValue, longitudeValue, radiusValue) {
  const latitude = validCoordinate(latitudeValue, -90, 90);
  const longitude = validCoordinate(longitudeValue, -180, 180);
  const radius = parseRadius(radiusValue);
  if (latitude === null || longitude === null || radius === null) return { active: false, profiles };

  // Coordinate enrichment belongs in the backfill job, never in a customer request.
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

module.exports = { RADIUS_VALUES, parseRadius, milesBetween, boundingBox, resolveSearchCenter, cityOnlyFilter, filterByRadius, filterBusinessesByRadius };
