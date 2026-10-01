'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeSource, isApprovedBookingSource } = require('../lib/booking-platforms');
const { clean, identity, normalizeZip, isHttpUrl } = require('../lib/import-normalization');
const { PROFESSIONAL_CATEGORY_VALUES } = require('../lib/pro-categories');

const dir = path.resolve(process.argv[2] || path.join('data','imports'));
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
const seen = new Map();
const issues = [];
const stats = { files: files.length, rows: 0, unique_fingerprints: 0, duplicates: 0, rejected: 0, by_source: {}, by_category: {}, by_city: {} };

function fingerprint(row) {
  return [row.name, row.workplace, row.city, row.state, row.address, row.zip].map(identity).join('|');
}
function addCount(bucket, value) {
  const key = clean(value) || '(missing)';
  bucket[key] = (bucket[key] || 0) + 1;
}

for (const file of files) {
  const fullPath = path.join(dir, file);
  let rows;
  try { rows = JSON.parse(fs.readFileSync(fullPath, 'utf8')); }
  catch (err) { issues.push({ file, row: null, type: 'invalid_json', detail: err.message }); continue; }
  if (!Array.isArray(rows)) { issues.push({ file, row: null, type: 'not_array' }); continue; }

  rows.forEach((input, index) => {
    stats.rows++;
    const raw = normalizeSource(input);
    const row = {
      name: clean(raw.name || raw.business_name),
      category: clean(raw.category).toLowerCase(),
      workplace: clean(raw.workplace_name || raw.workplace),
      city: clean(raw.city),
      state: clean(raw.state).toUpperCase(),
      address: clean(raw.street_address || raw.address || raw.workplace_address),
      zip: normalizeZip(raw.zip_code || raw.zip || raw.workplace_zip),
      bookingUrl: clean(raw.booking_url),
      sourceUrl: clean(raw.source_url),
      sourceName: clean(raw.source_name),
    };
    const reject = (type, detail = '') => issues.push({ file, row: index + 1, name: row.name, type, detail });
    if (!row.name || !row.city || !row.state || !row.sourceUrl || !row.sourceName || !row.category) reject('missing_required_factual_fields');
    if (row.category && !PROFESSIONAL_CATEGORY_VALUES.has(row.category)) reject('unsupported_category', row.category);
    if (row.state && !/^[A-Z]{2}$/.test(row.state)) reject('invalid_state', row.state);
    if (row.zip && !/^\d{5}$/.test(row.zip)) reject('invalid_zip', row.zip);
    if (row.sourceUrl && !isApprovedBookingSource(row.sourceUrl)) reject('unapproved_source_host', row.sourceUrl);
    if (row.bookingUrl && !isHttpUrl(row.bookingUrl)) reject('invalid_booking_url', row.bookingUrl);

    addCount(stats.by_source, row.sourceName);
    addCount(stats.by_category, row.category);
    addCount(stats.by_city, row.city);

    const key = fingerprint(row);
    if (seen.has(key)) {
      stats.duplicates++;
      issues.push({ file, row: index + 1, name: row.name, type: 'duplicate_across_import_files', detail: seen.get(key) });
    } else {
      seen.set(key, file + ':' + (index + 1));
    }
  });
}

stats.unique_fingerprints = seen.size;
stats.rejected = issues.filter((issue) => issue.type !== 'duplicate_across_import_files').length;
console.log(JSON.stringify({ stats, issues }, null, 2));
if (stats.rejected) process.exitCode = 1;
