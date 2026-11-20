#!/usr/bin/env node
'use strict';
// Builds the shop_expansion_states upsert for one or more states from their latest discovery results
// (runs/<ST>/latest on the data/national-shop-discovery branch).
// Usage: node scripts/expansion-status-sql.js <runs-dir> AZ UT ... [--run-id=123] [--status=discovery|importing|verification|live|maintenance]
//        [--imported] [--verified-note="..."]
// Never lowers a state's status: a state already 'live' stays live when a new discovery run is recorded.
const fs = require('node:fs');
const path = require('node:path');
const { stateInfo } = require('../lib/shop-states');

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const [dir, ...codes] = args.filter((a) => !a.startsWith('--'));
const q = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");
const ORDER = ['discovery', 'importing', 'verification', 'live', 'maintenance'];
const status = opt('status', 'discovery');
if (!ORDER.includes(status)) throw new Error('bad --status');

const values = codes.map((code) => {
  const st = stateInfo(code);
  const base = path.join(dir, st.code, 'latest');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
  const report = read('report.json'); const summary = read('import/summary.json'); const cov = read('coverage.json');
  const sources = report.sources || [];
  const gaps = [
    cov.counties_uncovered.length ? `${cov.counties_uncovered.length} counties without a published shop` : '',
    summary.review_reasons.no_category_evidence_in_name ? `${summary.review_reasons.no_category_evidence_in_name} licensed shops need a category` : '',
    summary.review_reasons.map_only_without_website ? `${summary.review_reasons.map_only_without_website} mapped places lack a website` : '',
    !st.licenseSource ? 'no open state shop-license dataset; licensing board data not yet available' : '',
  ].filter(Boolean).join('; ');
  return '(' + [q(st.code), st.wave, q(status), sources.length, sources.filter((s) => s.status === 'processed').length, summary.candidates, summary.publish,
    summary.review, summary.skipped, cov.census_places, cov.places_covered, cov.census_counties, cov.counties_covered,
    q(JSON.stringify(summary.review_reasons)) + '::jsonb', q(JSON.stringify(sources.map((s) => ({ name: s.name, status: s.status, records: s.records || 0 })))) + '::jsonb',
    q((report.errors || []).join(' | ').slice(0, 2000)), q(gaps), q(report.created_at) + '::timestamptz', q(opt('run-id', '')),
    args.includes('--imported') ? 'CURRENT_TIMESTAMP' : 'NULL', q(opt('verified-note', ''))].join(', ') + ')';
});

console.log(`INSERT INTO shop_expansion_states (state, wave, status, sources_discovered, sources_processed, candidates, verified_unique,
  held_for_review, duplicates_skipped, census_places, places_covered, census_counties, counties_covered, review_reasons, sources,
  importer_errors, coverage_gaps, last_discovery_run_at, last_discovery_run_id, last_import_at, verification_notes)
VALUES ${values.join(',\n  ')}
ON CONFLICT (state) DO UPDATE SET
  status = CASE WHEN array_position(ARRAY['discovery','importing','verification','live','maintenance'], EXCLUDED.status)
                  > array_position(ARRAY['discovery','importing','verification','live','maintenance'], shop_expansion_states.status)
             THEN EXCLUDED.status ELSE shop_expansion_states.status END,
  sources_discovered = EXCLUDED.sources_discovered, sources_processed = EXCLUDED.sources_processed, candidates = EXCLUDED.candidates,
  verified_unique = EXCLUDED.verified_unique, held_for_review = EXCLUDED.held_for_review, duplicates_skipped = EXCLUDED.duplicates_skipped,
  census_places = EXCLUDED.census_places, places_covered = EXCLUDED.places_covered, census_counties = EXCLUDED.census_counties,
  counties_covered = EXCLUDED.counties_covered, review_reasons = EXCLUDED.review_reasons, sources = EXCLUDED.sources,
  importer_errors = EXCLUDED.importer_errors, coverage_gaps = EXCLUDED.coverage_gaps, last_discovery_run_at = EXCLUDED.last_discovery_run_at,
  last_discovery_run_id = EXCLUDED.last_discovery_run_id, last_import_at = COALESCE(EXCLUDED.last_import_at, shop_expansion_states.last_import_at),
  verification_notes = CASE WHEN EXCLUDED.verification_notes <> '' THEN EXCLUDED.verification_notes ELSE shop_expansion_states.verification_notes END,
  updated_at = CURRENT_TIMESTAMP;`);
