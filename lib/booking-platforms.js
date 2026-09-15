'use strict';

// Central registry for public booking sources used to seed GoBookr's marketplace.
// We store factual public listing data + source attribution only; never create login accounts.
const PLATFORMS = [
  { id: 'square', name: 'Square Appointments', hosts: ['square.site', 'squareup.com'] },
  { id: 'booksy', name: 'Booksy', hosts: ['booksy.com'] },
  { id: 'squire', name: 'SQUIRE', hosts: ['getsquire.com'] },
  { id: 'vagaro', name: 'Vagaro', hosts: ['vagaro.com'] },
  { id: 'glossgenius', name: 'GlossGenius', hosts: ['glossgenius.com'] },
  { id: 'boulevard', name: 'Boulevard', hosts: ['joinblvd.com'] },
  { id: 'mangomint', name: 'Mangomint', hosts: ['mangomint.com'] },
  { id: 'zenoti', name: 'Zenoti', hosts: ['zenoti.com'] },
  { id: 'booker', name: 'Booker', hosts: ['booker.com'] },
];

function hostFor(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, ''); }
  catch (_) { return ''; }
}

function identifyBookingPlatform(url) {
  const host = hostFor(url);
  if (!host) return null;
  return PLATFORMS.find((platform) => platform.hosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) || null;
}

function normalizeSource(row = {}) {
  const sourceUrl = String(row.source_url || row.booking_url || '').trim();
  const detected = identifyBookingPlatform(sourceUrl) || identifyBookingPlatform(row.booking_url);
  return {
    ...row,
    source_url: sourceUrl,
    source_name: String(row.source_name || detected?.name || 'Public booking page').trim(),
    source_platform: detected?.id || String(row.source_platform || 'other').trim().toLowerCase(),
  };
}

module.exports = { PLATFORMS, identifyBookingPlatform, normalizeSource };
