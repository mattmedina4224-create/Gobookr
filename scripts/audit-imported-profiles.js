'use strict';

const db = require('../db');

const supportedCategories = new Set([
  'barber', 'stylist', 'colorist', 'nail_technician', 'eyelash_technician',
  'eyebrow_technician', 'waxing_specialist', 'tattoo_artist', 'massage_therapist',
]);

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
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

for (const pro of profiles) {
  const id = Number(pro.id);
  const cats = categoriesByPro.get(id) || [];
  if (pro.claim_status === 'unclaimed' && pro.user_id != null) issues.push({ id, type: 'unclaimed_has_user', detail: 'Unclaimed imported profile has a user_id.' });
  if (!pro.source_url || !pro.source_name || !pro.source_checked_at) issues.push({ id, type: 'missing_provenance', detail: 'source_url, source_name, and source_checked_at are required.' });
  if (!cats.length) issues.push({ id, type: 'missing_category', detail: 'No pro_categories row.' });
  for (const category of cats) if (!supportedCategories.has(category)) issues.push({ id, type: 'unsupported_category', detail: category });

  const key = [norm(pro.business_name), norm(pro.workplace_name), norm(pro.city), norm(pro.state)].join('|');
  if (!duplicateKeys.has(key)) duplicateKeys.set(key, []);
  duplicateKeys.get(key).push(id);
}

for (const ids of duplicateKeys.values()) {
  if (ids.length > 1) for (const id of ids) issues.push({ id, type: 'possible_duplicate', detail: `Matching profile IDs: ${ids.join(', ')}` });
}

console.log(`Audited ${profiles.length} imported/unclaimed profiles.`);
if (!issues.length) {
  console.log('No structural data-quality issues found.');
  process.exit(0);
}
console.table(issues);
console.log(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'}.`);
process.exitCode = 1;
