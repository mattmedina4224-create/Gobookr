'use strict';
const { identity, normalizeZip } = require('./import-normalization');
function bookingIdentity(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid','gclid'].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch { return ''; }
}
function sameProfessional(candidate, row) {
  return identity(candidate.business_name) === identity(row.name)
    && identity(candidate.workplace_name) === identity(row.workplace)
    && normalizeZip(candidate.zip_code) === row.zip
    && Boolean(row.zip);
}
function verificationApproved(raw) {
  return raw._verification_tier === 'page_opened'
    || (raw._verification_tier === 'snippet' && Boolean(raw._reverified_at)
      && raw._source_page_opened === true && raw._booking_page_opened === true);
}
module.exports = { bookingIdentity, sameProfessional, verificationApproved };
