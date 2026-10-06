'use strict';

const { escapeHtml } = require('./util');

function safeImageUrl(value) {
  try { const u = new URL(String(value || '').trim()); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}

function licenseIsVerified(pro, now = Date.now()) {
  const evidence = pro && pro.license_verification;
  if (!pro || Number(pro.license_verified) !== 1 || !evidence || typeof evidence !== 'object') return false;
  const number = String(pro.license_number || '').trim();
  const state = String(pro.license_state || '').trim().toUpperCase();
  const checked = Date.parse(evidence.checked_at);
  const expiry = Date.parse(evidence.expires_at);
  return Boolean(number && /^[A-Z]{2}$/.test(state)
    && number === evidence.license_number && state === evidence.license_state
    && String(pro.business_name || '').trim() === evidence.business_name
    && Number.isInteger(Number(evidence.reviewer_user_id)) && Number(evidence.reviewer_user_id) > 0
    && evidence.status === 'active' && evidence.identity_confirmed === true
    && /^https:\/\//.test(safeImageUrl(evidence.source_url))
    && Number.isFinite(checked) && checked <= now && Number.isFinite(expiry) && expiry > now);
}

// Matching is deliberately conservative: a missing address never establishes
// a business relationship, and multiple matches never choose an arbitrary shop.
function matchArgs(entity, name) {
  const fields = [name, entity.city, entity.state, entity.street_address, entity.zip_code];
  if (fields.some(value => !String(value || '').trim())) return null;
  return [...fields.map(value => String(value).trim()), String(entity.suite || '').trim()];
}
const matchSql = (nameColumn) => `LOWER(TRIM(${nameColumn})) = LOWER(?) AND LOWER(TRIM(city)) = LOWER(?) AND UPPER(TRIM(state)) = UPPER(?) AND LOWER(TRIM(street_address)) = LOWER(?) AND TRIM(zip_code) = ? AND LOWER(TRIM(COALESCE(suite,''))) = LOWER(?)`;
function professionalsAtBusiness(db, shop) {
  const args = matchArgs(shop, shop.name);
  return args ? db.prepare(`SELECT * FROM pro_profiles WHERE ${matchSql('workplace_name')} ORDER BY business_name ASC LIMIT 50`).all(...args) : [];
}
function businessForProfessional(db, pro) {
  const args = matchArgs(pro, pro.workplace_name);
  if (!args) return null;
  const matches = db.prepare(`SELECT id, name FROM shops WHERE ${matchSql('name')} AND ((owner_user_id IS NULL AND claim_status IN ('unclaimed','pending') AND COALESCE(source_url,'') <> '' AND COALESCE(source_name,'') <> '') OR (owner_user_id IS NOT NULL AND claim_status='claimed')) LIMIT 2`).all(...args);
  return matches.length === 1 ? matches[0] : null;
}
function businessBanner(value, name) {
  const image = safeImageUrl(value);
  return `<div class="business-banner${image ? '' : ' business-banner--fallback'}"${image ? '' : ' aria-hidden="true"'}>${image ? `<img data-business-banner src="${escapeHtml(image)}" alt="${escapeHtml(name)} business banner">` : ''}</div>`;
}
module.exports = { safeImageUrl, licenseIsVerified, professionalsAtBusiness, businessForProfessional, businessBanner };
