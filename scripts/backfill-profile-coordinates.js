'use strict';

const db = require('../db');

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const CONCURRENCY = Math.max(1, Math.min(Number(process.env.GEOCODE_CONCURRENCY || 4), 8));

function validCoordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function addressFor(profile) {
  const street = String(profile.street_address || '').trim();
  const city = String(profile.city || '').trim();
  const state = String(profile.state || '').trim();
  const zip = String(profile.zip_code || '').trim();
  if (!street || !city || !state) return '';
  return [street, city, state, zip].filter(Boolean).join(', ').slice(0, 160);
}

async function censusGeocode(profile) {
  const address = addressFor(profile);
  if (!address) return { status: 'skipped', reason: 'incomplete_address' };
  try {
    const params = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
    const response = await fetch(`${GEOCODER_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'GoBookr/1.0 (https://gobookr.com)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { status: 'failed', reason: `http_${response.status}` };
    const payload = await response.json();
    const match = payload?.result?.addressMatches?.[0];
    const latitude = validCoordinate(match?.coordinates?.y, -90, 90);
    const longitude = validCoordinate(match?.coordinates?.x, -180, 180);
    if (latitude === null || longitude === null) return { status: 'failed', reason: 'no_match' };
    return { status: 'matched', latitude, longitude, matchedAddress: match.matchedAddress || '' };
  } catch (error) {
    return { status: 'failed', reason: error?.name === 'TimeoutError' ? 'timeout' : 'request_error' };
  }
}

async function main() {
  const profiles = db.prepare(`
    SELECT id, business_name, street_address, city, state, zip_code, latitude, longitude
    FROM pro_profiles
    WHERE (latitude IS NULL OR longitude IS NULL)
    ORDER BY id
  `).all();

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < profiles.length) {
      const profile = profiles[cursor++];
      const result = await censusGeocode(profile);
      if (result.status === 'matched') {
        const update = db.prepare(`
          UPDATE pro_profiles SET latitude = ?, longitude = ?
          WHERE id = ? AND latitude IS NULL AND longitude IS NULL
        `).run(result.latitude, result.longitude, profile.id);
        if (!update.changes) {
          results.push({ id: profile.id, name: profile.business_name, status: 'skipped', reason: 'already_updated' });
          continue;
        }
      }
      results.push({ id: profile.id, name: profile.business_name, ...result });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(profiles.length, 1)) }, worker));
  const counts = results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Geocode backfill complete: ${profiles.length} missing-coordinate profiles checked.`);
  console.log({ matched: counts.matched || 0, failed: counts.failed || 0, skipped: counts.skipped || 0 });
  const unresolved = results.filter((row) => row.status !== 'matched');
  if (unresolved.length) console.table(unresolved);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
