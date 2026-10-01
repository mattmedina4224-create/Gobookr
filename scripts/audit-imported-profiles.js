'use strict';

const db = require('../db');
const { PROFESSIONAL_CATEGORY_VALUES: supportedCategories } = require('../lib/pro-categories');
const { identity, normalizeZip, isHttpUrl } = require('../lib/import-normalization');
const { isApprovedBookingSource } = require('../lib/booking-platforms');

const profiles = db.prepare(`SELECT id, user_id, business_name, city, state, workplace_name, street_address, zip_code,
  claim_status, source_url, source_name, source_checked_at
  FROM pro_profiles
  WHERE source_url IS NOT NULL OR claim_status = 'unclaimed'
  ORDER BY id`).all();
const categories = db.prepare('SELECT pro_id, category FROM pro_categories ORDER BY pro_id, category').all();
const categoriesByPro = new Map();
for (const row of categories) {
  const id = Number(row.pro_id);
  if (!categoriesByPro.has(id)) categoriesByPro.set(id, []);
  categoriesByPro.get(id).push(row.category);
}

const issues = [];
const duplicateKeys = new Map();
const summary = { total: profiles.length, unclaimed: 0, claim_pending: 0, claimed: 0, cities: new Set(), sources: new Set() };

for (const pro of profiles) {
  const id = Number(pro.id);
  const cats = categoriesByPro.get(id) || [];
  if (pro.claim_status === 'unclaimed') summary.unclaimed++;
  else if (pro.claim_status === 'claim_pending') summary.claim_pending++;
  else if (pro.claim_status === 'claimed') summary.claimed++;
  if (pro.city) summary.cities.add(identity(pro.city));
  if (pro.source_name) summary.sources.add(identity(pro.source_name));
  if (pro.claim_status === 'unclaimed' && pro.user_id != null) issues.push({ id, type: 'unclaimed_has_user', detail: 'Unclaimed imported profile has a user_id.' });
  if (!pro.source_url || !pro.source_name || !pro.source_checked_at) issues.push({ id, type: 'missing_provenance', detail: 'source_url, source_name, and source_checked_at are required.' });
  if (pro.source_url && (!isHttpUrl(pro.source_url) || !isApprovedBookingSource(pro.source_url))) issues.push({ id, type: 'invalid_source_url', detail: 'Source URL must be an approved HTTP(S) booking source.' });
  if (!pro.business_name || !String(pro.business_name).trim()) issues.push({ id, type: 'missing_name', detail: 'Professional name is required.' });
  if (!pro.city || !String(pro.city).trim()) issues.push({ id, type: 'missing_city', detail: 'City is required.' });
  if (!/^[A-Z]{2}$/.test(String(pro.state || '').trim().toUpperCase())) issues.push({ id, type: 'invalid_state', detail: String(pro.state || '') });
  if (pro.zip_code && !/^\d{5}$/.test(normalizeZip(pro.zip_code))) issues.push({ id, type: 'invalid_zip', detail: String(pro.zip_code) });
  if (!cats.length) issues.push({ id, type: 'missing_category', detail: 'No pro_categories row.' });
  for (const category of cats) if (!supportedCategories.has(category)) issues.push({ id, type: 'unsupported_category', detail: category });

  const key = [identity(pro.business_name), identity(pro.workplace_name), identity(pro.city), identity(pro.state)].join('|');
  if (!duplicateKeys.has(key)) duplicateKeys.set(key, []);
  duplicateKeys.get(key).push(id);
}

for (const ids of duplicateKeys.values()) {
  if (ids.length > 1) for (const id of ids) issues.push({ id, type: 'possible_duplicate', detail: `Matching profile IDs: ${ids.join(', ')}` });
}

console.log(`Audited ${profiles.length} imported/unclaimed profiles.`);
console.log(`Inventory: ${summary.unclaimed} unclaimed, ${summary.claim_pending} claim pending, ${summary.claimed} claimed; ${summary.cities.size} cities; ${summary.sources.size} sources.`);
if (!issues.length) {
  console.log('No structural data-quality issues found.');
  process.exit(0);
}
console.table(issues);
console.log(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'}.`);
process.exitCode = 1;
