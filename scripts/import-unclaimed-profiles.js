'use strict';

// GoBookr national marketplace inventory importer.
// Imports factual public listing data only. It never creates user/login accounts.
//
// Usage:
//   node scripts/import-unclaimed-profiles.js data/imports/co-batch.json
//   node scripts/import-unclaimed-profiles.js data/imports/tx-batch.json --state=TX --dry-run
//   node scripts/import-unclaimed-profiles.js data/imports/fl-batch.json --state=FL --report=tmp/fl-report.json
//
// Input: [{ name, category, workplace_name, city, state, address, zip, booking_url, source_url, source_name }]

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { normalizeSource } = require('../lib/booking-platforms');

const args = process.argv.slice(2);
const inputPath = args.find((x) => !x.startsWith('--'));
if (!inputPath) throw new Error('Pass a JSON file: node scripts/import-unclaimed-profiles.js profiles.json');

const dryRun = args.includes('--dry-run');
const stateArg = args.find((x) => x.startsWith('--state='));
const expectedState = stateArg ? stateArg.split('=')[1].trim().toUpperCase() : '';
const reportArg = args.find((x) => x.startsWith('--report='));
const reportPath = reportArg ? path.resolve(reportArg.slice('--report='.length)) : '';

const rows = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (!Array.isArray(rows)) throw new Error('Import file must contain a JSON array.');

const clean = (v) => String(v || '').trim();
const initials = (name) => clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'GB';
const allowedLegacy = new Set(['barber', 'stylist', 'colorist']);
const supportedCategories = new Set([
  'barber', 'stylist', 'colorist', 'nail_technician', 'eyelash_technician',
  'eyebrow_technician', 'waxing_specialist', 'tattoo_artist', 'massage_therapist',
  'makeup_artist', 'wedding_services',
]);
const approvedHosts = [
  'booksy.com', 'glossgenius.com', 'square.site', 'squareup.com', 'vagaro.com',
  'joinblvd.com', 'boulevard.io', 'mangomint.com', 'zenoti.com', 'booker.com',
  'squire.com', 'getsquire.com',
];

function sourceHost(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return ''; }
}
function isApprovedSource(value) {
  const host = sourceHost(value);
  return approvedHosts.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}
function fingerprint(row) {
  return [row.name, row.workplace, row.city, row.state, row.address, row.zip].map((x) => clean(x).toLowerCase()).join('|');
}

const report = {
  input_file: path.resolve(inputPath),
  expected_state: expectedState || null,
  dry_run: dryRun,
  started_at: new Date().toISOString(),
  input_count: rows.length,
  inserted: [],
  categories_added: [],
  duplicates: [],
  rejected: [],
};
const seen = new Set();

for (const input of rows) {
  const raw = normalizeSource(input);
  const row = {
    name: clean(raw.name || raw.business_name),
    category: clean(raw.category).toLowerCase(),
    workplace: clean(raw.workplace_name || raw.workplace),
    city: clean(raw.city),
    state: clean(raw.state).toUpperCase(),
    address: clean(raw.street_address || raw.address || raw.workplace_address),
    zip: clean(raw.zip_code || raw.zip || raw.workplace_zip),
    bookingUrl: clean(raw.booking_url),
    sourceUrl: clean(raw.source_url),
    sourceName: clean(raw.source_name),
  };

  const reject = (reason) => {
    console.warn('REJECT:', reason, row.name || '(unnamed)');
    report.rejected.push({ name: row.name, reason });
  };

  if (!row.name || !row.city || !row.state || !row.sourceUrl || !row.sourceName || !row.category) {
    reject('missing_required_factual_fields'); continue;
  }
  if (!supportedCategories.has(row.category)) { reject('unsupported_category'); continue; }
  if (expectedState && row.state !== expectedState) { reject('state_mismatch'); continue; }
  if (!isApprovedSource(row.sourceUrl)) { reject('unapproved_source_host'); continue; }

  const key = fingerprint(row);
  if (seen.has(key)) { reject('duplicate_inside_import_file'); continue; }
  seen.add(key);

  const existing = db.prepare(`SELECT id FROM pro_profiles
    WHERE LOWER(business_name) = LOWER(?)
      AND LOWER(COALESCE(workplace_name,'')) = LOWER(?)
      AND LOWER(city) = LOWER(?)
      AND UPPER(state) = UPPER(?)
      AND (? = '' OR COALESCE(street_address,'') = '' OR LOWER(street_address) = LOWER(?))
      AND (? = '' OR COALESCE(zip_code,'') = '' OR zip_code = ?)
    LIMIT 1`).get(row.name, row.workplace, row.city, row.state, row.address, row.address, row.zip, row.zip);

  if (existing) {
    const existingCategory = db.prepare('SELECT 1 AS found FROM pro_categories WHERE pro_id = ? AND category = ?').get(existing.id, row.category);
    if (existingCategory) {
      console.log(`SKIP duplicate professional: ${row.name} (#${existing.id})`);
      report.duplicates.push({ name: row.name, pro_id: existing.id });
    } else if (dryRun) {
      console.log(`DRY RUN category add: ${row.category} -> ${row.name} (#${existing.id})`);
      report.categories_added.push({ name: row.name, pro_id: existing.id, category: row.category, dry_run: true });
    } else {
      db.prepare('INSERT INTO pro_categories (pro_id, category) VALUES (?, ?)').run(existing.id, row.category);
      console.log(`CATEGORY ADDED: ${row.category} -> ${row.name} (#${existing.id})`);
      report.categories_added.push({ name: row.name, pro_id: existing.id, category: row.category });
    }
    continue;
  }

  if (dryRun) {
    console.log(`DRY RUN import: ${row.name} [${row.category}] ${row.city}, ${row.state}`);
    report.inserted.push({ name: row.name, category: row.category, city: row.city, state: row.state, dry_run: true });
    continue;
  }

  const legacyCategory = allowedLegacy.has(row.category) ? row.category : 'barber';
  const result = db.prepare(`INSERT INTO pro_profiles
    (user_id, business_name, category, bio, city, state, workplace_name, street_address, zip_code,
     booking_url, initials, claim_status, source_url, source_name, source_checked_at)
    VALUES (NULL, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 'unclaimed', ?, ?, CURRENT_TIMESTAMP)`)
    .run(row.name, legacyCategory, row.city, row.state, row.workplace, row.address, row.zip,
      row.bookingUrl, initials(row.name), row.sourceUrl, row.sourceName);

  const proId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO pro_categories (pro_id, category) VALUES (?, ?)').run(proId, row.category);
  console.log(`IMPORTED: ${row.name} (#${proId}) from ${row.sourceName}`);
  report.inserted.push({ name: row.name, pro_id: proId, category: row.category, city: row.city, state: row.state });
}

report.finished_at = new Date().toISOString();
report.summary = {
  inserted: report.inserted.length,
  categories_added: report.categories_added.length,
  duplicates: report.duplicates.length,
  rejected: report.rejected.length,
};

if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${reportPath}`);
}

console.log(`Done. ${dryRun ? 'Would import' : 'Imported'} ${report.summary.inserted}; category additions ${report.summary.categories_added}; duplicates ${report.summary.duplicates}; rejected ${report.summary.rejected}. No user accounts were created.`);
if (report.rejected.length) process.exitCode = 2;
