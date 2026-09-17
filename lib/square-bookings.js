'use strict';

const crypto = require('node:crypto');

const SQUARE_API_VERSION = '2026-09-16';
const PROD_API = 'https://connect.squareup.com';
const SANDBOX_API = 'https://connect.squareupsandbox.com';

function isSandbox() {
  return String(process.env.SQUARE_ENVIRONMENT || '').toLowerCase() === 'sandbox';
}

function apiBase() { return isSandbox() ? SANDBOX_API : PROD_API; }
function appId() { return isSandbox() ? process.env.SQUARE_SANDBOX_APPLICATION_ID : process.env.SQUARE_APPLICATION_ID; }
function appSecret() { return isSandbox() ? process.env.SQUARE_SANDBOX_APPLICATION_SECRET : process.env.SQUARE_APPLICATION_SECRET; }
function redirectUri() { return process.env.SQUARE_REDIRECT_URI || '';
}

function configured() { return Boolean(appId() && appSecret() && redirectUri()); }

function authorizationUrl(state) {
  if (!configured()) throw new Error('Square OAuth is not configured.');
  const url = new URL(isSandbox() ? `${SANDBOX_API}/oauth2/authorize` : `${PROD_API}/oauth2/authorize`);
  url.searchParams.set('client_id', appId());
  url.searchParams.set('scope', 'APPOINTMENTS_BUSINESS_SETTINGS_READ MERCHANT_PROFILE_READ');
  url.searchParams.set('state', state);
  url.searchParams.set('session', 'false');
  url.searchParams.set('redirect_uri', redirectUri());
  return url.toString();
}

function makeState() { return crypto.randomBytes(24).toString('hex'); }

async function squareRequest(path, accessToken, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      'Square-Version': SQUARE_API_VERSION,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.errors && data.errors[0] && data.errors[0].detail ? data.errors[0].detail : `Square request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

async function exchangeCode(code) {
  const response = await fetch(`${apiBase()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Square-Version': SQUARE_API_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: appId(), client_secret: appSecret(), code, grant_type: 'authorization_code', redirect_uri: redirectUri() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('Unable to connect Square account.');
  return data;
}

async function listBookableTeamMembers(accessToken, locationId = '') {
  const profiles = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ bookable_only: 'true', limit: '200' });
    if (locationId) params.set('location_id', locationId);
    if (cursor) params.set('cursor', cursor);
    const data = await squareRequest(`/v2/bookings/team-member-booking-profiles?${params.toString()}`, accessToken);
    profiles.push(...(data.team_member_booking_profiles || []));
    cursor = data.cursor || '';
  } while (cursor);
  return profiles.map((profile) => ({
    squareTeamMemberId: profile.team_member_id,
    displayName: profile.display_name || '',
    isBookable: Boolean(profile.is_bookable),
  }));
}

async function listLocationBookingProfiles(accessToken) {
  const profiles = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const data = await squareRequest(`/v2/bookings/location-booking-profiles?${params.toString()}`, accessToken);
    profiles.push(...(data.location_booking_profiles || []));
    cursor = data.cursor || '';
  } while (cursor);
  return profiles;
}

module.exports = { configured, authorizationUrl, makeState, exchangeCode, listBookableTeamMembers, listLocationBookingProfiles };
