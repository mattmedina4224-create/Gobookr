'use strict';

// GoBookr marketplace seeding importer.
// Imports factual public listing data only. It never creates user/login accounts.
// Usage: node scripts/import-unclaimed-profiles.js path/to/profiles.json
// Input: [{ name, category, workplace_name, city, state, address, zip, booking_url, source_url, source_name }]

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Pass a JSON file: node scripts/import-unclaimed-profiles.js profiles.json');
const rows = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (!Array.isArray(rows)) throw new Error('Import file must contain a JSON array.');

const clean = (v) => String(v || '').trim();
const initials = (name) => clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'GB';
const allowedLegacy = new Set(['barber', 'stylist', 'colorist']);

let inserted = 0;
let skipped = 0;

for (const raw of rows) {
  const name = clean(raw.name || raw.business_name);
  const city = clean(raw.city);
  const state = clean(raw.state).toUpperCase();
  const sourceUrl = clean(raw.source_url);
  const sourceName = clean(raw.source_name);
  const actualCategory = clean(raw.category).toLowerCase() || 'barber';
  if (!name || !city || !state || !sourceUrl || !sourceName) {
    console.warn('SKIP missing required factual fields:', { name, city, state, sourceUrl, sourceName });
    skipped += 1;
    continue;
  }

  // Conservative dedupe: same normalized name + workplace + city/state OR exact source URL.
  const workplace = clean(raw.workplace_name);
  const existing = db.prepare(`SELECT id FROM pro_profiles
    WHERE source_url = ?
       OR (LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(workplace_name,'')) = LOWER(?) AND LOWER(city) = LOWER(?) AND UPPER(state) = UPPER(?))
    LIMIT 1`).get(sourceUrl, name, workplace, city, state);
  if (existing) {
    console.log(`SKIP duplicate: ${name} (#${existing.id})`);
    skipped += 1;
    continue;
  }

  const legacyCategory = allowedLegacy.has(actualCategory) ? actualCategory : 'barber';
  const result = db.prepare(`INSERT INTO pro_profiles
    (user_id, business_name, category, bio, city, state, workplace_name, workplace_address, workplace_zip,
     booking_url, initials, claim_status, source_url, source_name, source_checked_at)
    VALUES (NULL, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 'unclaimed', ?, ?, CURRENT_TIMESTAMP)`)
    .run(name, legacyCategory, city, state, workplace, clean(raw.address || raw.workplace_address), clean(raw.zip || raw.workplace_zip), clean(raw.booking_url), initials(name), sourceUrl, sourceName);

  const proId = Number(result.lastInsertRowid);
  if (actualCategory) {
    try { db.prepare('INSERT INTO pro_categories (pro_id, category) VALUES (?, ?)').run(proId, actualCategory); }
    catch (err) { console.warn(`Category '${actualCategory}' not stored for ${name}: ${err.message}`); }
  }
  console.log(`IMPORTED: ${name} (#${proId})`);
  inserted += 1;
}

console.log(`Done. Imported ${inserted}; skipped ${skipped}. No user accounts were created.`);
