#!/usr/bin/env node
'use strict';
// Turns Colorado discovery candidates (scripts/crawl-colorado-golden-shops.js) into audited shop imports.
//
// Usage:
//   node scripts/import-colorado-shops.js <candidates.json> --existing=<shops.json> [--websites=<website-checks.json>]
//        [--out=data/business-inventories/colorado-import] [--batch-size=400] [--checked-at=YYYY-MM-DD]
//
// Writes (dry run; nothing touches a database):
//   publish.json   rows that meet the publishing rules
//   review.json    rows held for a human, each with a reason
//   skipped.json   rows that duplicate an existing shop or another candidate
//   enrich.json    existing UNCLAIMED shops that can gain a ZIP/license/category from a verified match
//   batch-NN.sql   guarded INSERTs (idempotent: NOT EXISTS on source_external_id, license and name+city+zip)
//   enrich.sql     guarded UPDATEs for unclaimed shops only; fills blanks, never overwrites
//   summary.json   counts by decision, reason, category and city
//
// Publishing rules (see docs/colorado-shop-directory.md):
//   * DORA active Barber/Cosmetology Shop Registration + name + city + ZIP + at least one category from the
//     registered name -> publish, operational_status 'verified' (an active state registration).
//   * OpenStreetMap-only place + city + category + a website that loaded in the latest check -> publish
//     'verified'; without a live website it is held (community map data alone does not prove it is open).
//   * Websites are attached only when the website check saw them load; otherwise the field stays blank.
//   * No category evidence, missing city/ZIP, inactive license or conflicting websites -> review.
const fs = require('node:fs');
const path = require('node:path');
const { classifyShop, CRAWLER_KIND_TO_CATEGORY } = require('../lib/shop-categories');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const DORA_URL = 'https://data.colorado.gov/Regulations/Professional-and-Occupational-Licenses-in-Colorado/7s5z-vewr';

const LEGAL_SUFFIX = /[,\s]+(l\.?\s?l\.?\s?c\.?|p\.?l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|llp)$/i;
// Source text sometimes arrives as UTF-8 bytes read as Latin-1 ("Roxyâ\u0080\u0099s"); repair only when that pattern is present.
function repairText(raw) {
  const s = String(raw || '');
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(s)) return s;
  try { const fixed = Buffer.from(s, 'latin1').toString('utf8'); return fixed.includes('\ufffd') ? s : fixed; } catch (_) { return s; }
}
function displayName(raw) {
  let name = repairText(raw).replace(/\s+/g, ' ').trim();
  const dba = name.split(/\s+(?:d\/?b\/?a|dba|doing business as)\s+/i);
  if (dba.length > 1 && dba[dba.length - 1].trim().length >= 3) name = dba[dba.length - 1].trim();
  for (let i = 0; i < 2; i++) name = name.replace(LEGAL_SUFFIX, '').trim();
  name = name.replace(/[,;:\-–]+$/, '').trim();
  if (name === name.toUpperCase() && /[A-Z]{3}/.test(name)) name = name.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Inc)\b/g, (m) => m.toUpperCase());
  return name;
}
const matchKey = (x) => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and')
  .replace(LEGAL_SUFFIX, '').replace(/\b(the|salon|studio|llc|inc)\b/g, '').replace(/[^a-z0-9]+/g, '');
const cityKey = (x) => String(x || '').toLowerCase().replace(/[^a-z]+/g, '');
const titleCity = (x) => String(x || '').trim().toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const sql = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");

function main() {
  const candidatesPath = args.find((a) => !a.startsWith('--'));
  if (!candidatesPath) throw new Error('candidates.json path required');
  const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  const existing = JSON.parse(fs.readFileSync(opt('existing', ''), 'utf8'));
  const checks = opt('websites', '') ? JSON.parse(fs.readFileSync(opt('websites'), 'utf8')) : {};
  const out = opt('out', 'data/business-inventories/colorado-import');
  const batchSize = Number(opt('batch-size', 400));
  const checkedAt = opt('checked-at', new Date().toISOString().slice(0, 10));
  fs.mkdirSync(out, { recursive: true });

  const live = (url) => { const c = url && checks[url]; return c && c.status === 'live' ? (c.final_url || url) : ''; };
  const existingByLicense = new Map(existing.filter((s) => s.license_number).map((s) => [String(s.license_number), s]));
  const existingByExternal = new Map(existing.filter((s) => s.source_external_id).map((s) => [String(s.source_external_id), s]));
  const existingByNameCity = new Map();
  for (const s of existing) { const k = matchKey(s.name) + '|' + cityKey(s.city); if (!existingByNameCity.has(k)) existingByNameCity.set(k, []); existingByNameCity.get(k).push(s); }

  const publish = []; const review = []; const skipped = []; const enrich = [];
  const seen = new Map();
  for (const c of candidates) {
    const isDora = /DORA/.test(c.source_name || '');
    const name = displayName(c.name);
    const city = titleCity(repairText(c.city));
    const zip = (String(c.zip_code || '').match(/\b\d{5}\b/) || [''])[0];
    let categories = classifyShop(name);
    if (!categories.length && !isDora && CRAWLER_KIND_TO_CATEGORY[c.category]) categories = [CRAWLER_KIND_TO_CATEGORY[c.category]]; // OSM shop/beauty tag evidence
    const website = c.website_status === 'conflicting_websites_review' ? '' : live(c.website_url);
    const externalId = isDora ? (c.license_number ? 'dora:REG:' + c.license_number : '') : (String(c.source_url || '').replace('https://www.openstreetmap.org/', 'osm:'));
    const row = {
      name, city, state: 'CO', street_address: String(c.street_address || '').trim(), zip_code: zip, categories, website_url: website,
      phone: '', source_name: isDora ? 'Colorado DORA Shop Registration' : 'OpenStreetMap contributors',
      source_url: isDora ? DORA_URL : c.source_url, source_external_id: externalId,
      license_number: isDora && c.license_number ? 'REG.' + c.license_number : null,
      latitude: Number.isFinite(c.latitude) ? c.latitude : null, longitude: Number.isFinite(c.longitude) ? c.longitude : null,
      operational_status: 'verified', checked_at: checkedAt, raw_name: c.name,
      website_candidate: c.website_url || '', website_source_url: c.website_source_url || '',
    };
    const hold = (reason) => review.push({ ...row, reason });
    if (!name || name.length < 2) { hold('missing_name'); continue; }
    if (!city) { hold('missing_city'); continue; }
    if (isDora && !/active/i.test(c.licensing_status || '')) { hold('license_not_active'); continue; }
    if (isDora && !zip) { hold('missing_zip'); continue; }
    if (/\b(academy|school|college|institute|university|training)\b/i.test(name)) { hold('school_or_training_facility'); continue; }
    if (/\b(assisted living|senior living|independent living|retirement|nursing|memory care|school district|hospital|correctional)\b/i.test(name)) { hold('private_facility_salon'); continue; }
    if (!categories.length) { hold('no_category_evidence_in_name'); continue; }
    if (!isDora && !website) { hold(c.website_url ? 'osm_website_not_confirmed_live' : 'osm_only_without_website'); continue; }
    if (c.website_status === 'conflicting_websites_review') row.review_note = 'conflicting_websites';

    // Existing shops: a match by license, external id, or name+city (+ZIP when both have one) is the same location.
    const byName = (existingByNameCity.get(matchKey(name) + '|' + cityKey(city)) || []).filter((s) => !s.zip_code || !zip || s.zip_code === zip);
    const match = existingByLicense.get(row.license_number) || existingByExternal.get(externalId) || byName[0];
    if (match) {
      skipped.push({ ...row, reason: 'existing_shop', existing_id: match.id });
      if (!match.owner_user_id && match.claim_status === 'unclaimed') enrich.push({ id: match.id, zip_code: zip, license_number: row.license_number, website_url: website, categories, source_external_id: externalId });
      continue;
    }
    const key = matchKey(name) + '|' + cityKey(city) + '|' + zip;
    if (seen.has(key)) {
      const first = seen.get(key);
      first.categories = [...new Set([...first.categories, ...categories])];
      if (!first.website_url && website) first.website_url = website;
      if (!first.street_address && row.street_address) first.street_address = row.street_address;
      skipped.push({ ...row, reason: 'duplicate_candidate', duplicate_of: first.source_external_id });
      continue;
    }
    seen.set(key, row);
    publish.push(row);
  }

  const write = (file, data) => fs.writeFileSync(path.join(out, file), typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  write('publish.json', publish); write('review.json', review); write('skipped.json', skipped); write('enrich.json', enrich);
  fs.readdirSync(out).filter((f) => /^batch-\d+\.sql$/.test(f)).forEach((f) => fs.unlinkSync(path.join(out, f)));
  for (let i = 0; i < publish.length; i += batchSize) write(`batch-${String(i / batchSize + 1).padStart(2, '0')}.sql`, insertSql(publish.slice(i, i + batchSize)));
  write('enrich.sql', enrichSql(enrich));

  const count = (rows, f) => rows.reduce((m, r) => { for (const k of [].concat(f(r))) m[k] = (m[k] || 0) + 1; return m; }, {});
  const summary = {
    checked_at: checkedAt, candidates: candidates.length, publish: publish.length, review: review.length, skipped: skipped.length, enrich_existing: enrich.length,
    publish_with_website: publish.filter((r) => r.website_url).length, publish_with_street: publish.filter((r) => r.street_address).length,
    review_reasons: count(review, (r) => r.reason), skipped_reasons: count(skipped, (r) => r.reason),
    publish_categories: count(publish, (r) => r.categories), publish_sources: count(publish, (r) => r.source_name),
    publish_cities: Object.fromEntries(Object.entries(count(publish, (r) => r.city)).sort((a, b) => b[1] - a[1])),
    review_cities: Object.fromEntries(Object.entries(count(review, (r) => r.city || '(no city)')).sort((a, b) => b[1] - a[1])),
    batches: Math.ceil(publish.length / batchSize),
  };
  write('summary.json', summary);
  console.log(JSON.stringify({ ...summary, publish_cities: Object.keys(summary.publish_cities).length + ' cities', review_cities: undefined }, null, 1));
}

function insertSql(rows) {
  const values = rows.map((r) => '(' + [r.name, r.city, r.state, r.street_address, r.zip_code, r.website_url, r.source_url, r.source_name, r.checked_at,
    r.source_external_id, r.license_number, r.latitude === null ? 'NULL' : r.latitude, r.longitude === null ? 'NULL' : r.longitude, r.categories.join(',')]
    .map((v, i) => (i === 11 || i === 12) ? v : sql(v)).join(',') + ')').join(',\n  ');
  return `-- Generated by scripts/import-colorado-shops.js. Idempotent: rerunning inserts nothing new.
WITH incoming (name, city, state, street_address, zip_code, website_url, source_url, source_name, checked_at, source_external_id, license_number, latitude, longitude, categories) AS (VALUES
  ${values}
), fresh AS (
  SELECT i.* FROM incoming i
  WHERE NOT EXISTS (SELECT 1 FROM shops s WHERE s.source_external_id = i.source_external_id)
    AND NOT EXISTS (SELECT 1 FROM shops s WHERE i.license_number IS NOT NULL AND s.license_number = i.license_number)
    AND NOT EXISTS (SELECT 1 FROM shops s WHERE UPPER(s.state) = 'CO'
      AND regexp_replace(lower(s.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(i.name), '[^a-z0-9]+', '', 'g')
      AND lower(s.city) = lower(i.city) AND (s.zip_code = '' OR i.zip_code = '' OR s.zip_code = i.zip_code))
), inserted AS (
  INSERT INTO shops (owner_user_id, name, city, state, street_address, zip_code, website_url, claim_status, source_url, source_name,
    source_checked_at, operational_status, source_external_id, license_number, latitude, longitude)
  SELECT NULL, name, city, state, street_address, zip_code, website_url, 'unclaimed', source_url, source_name,
    checked_at::timestamptz, 'verified', source_external_id, license_number, latitude::double precision, longitude::double precision FROM fresh
  RETURNING id, source_external_id
), cats AS (
  INSERT INTO shop_categories (shop_id, category, source)
  SELECT ins.id, c, 'registered_name' FROM inserted ins JOIN incoming i ON i.source_external_id = ins.source_external_id,
    unnest(string_to_array(i.categories, ',')) AS c
  ON CONFLICT DO NOTHING RETURNING shop_id
)
SELECT (SELECT count(*) FROM incoming) AS submitted, (SELECT count(*) FROM inserted) AS inserted,
  (SELECT count(*) FROM cats) AS category_rows, (SELECT min(id) FROM inserted) AS min_id, (SELECT max(id) FROM inserted) AS max_id;
`;
}

function enrichSql(rows) {
  if (!rows.length) return '-- nothing to enrich\n';
  return `-- Fill blanks on existing UNCLAIMED shops from a verified match. Never overwrites a value or touches claimed shops.
WITH incoming (id, zip_code, license_number, website_url, source_external_id, categories) AS (VALUES
  ${rows.map((r) => '(' + [r.id, sql(r.zip_code), sql(r.license_number), sql(r.website_url), sql(r.source_external_id), sql(r.categories.join(','))].join(',') + ')').join(',\n  ')}
), updated AS (
  UPDATE shops s SET
    zip_code = CASE WHEN s.zip_code = '' THEN i.zip_code ELSE s.zip_code END,
    license_number = COALESCE(s.license_number, CASE WHEN NOT EXISTS (SELECT 1 FROM shops x WHERE x.license_number = i.license_number) THEN i.license_number END),
    website_url = CASE WHEN s.website_url = '' THEN i.website_url ELSE s.website_url END,
    operational_status = CASE WHEN i.license_number IS NOT NULL THEN 'verified' ELSE s.operational_status END,
    updated_at = CURRENT_TIMESTAMP
  FROM incoming i WHERE s.id = i.id AND s.owner_user_id IS NULL AND s.claim_status = 'unclaimed'
  RETURNING s.id
), cats AS (
  INSERT INTO shop_categories (shop_id, category, source)
  SELECT i.id, c, 'registered_name' FROM incoming i, unnest(string_to_array(i.categories, ',')) AS c
  WHERE EXISTS (SELECT 1 FROM shops s WHERE s.id = i.id)
  ON CONFLICT DO NOTHING RETURNING shop_id
)
SELECT (SELECT count(*) FROM updated) AS updated, (SELECT count(*) FROM cats) AS category_rows;
`;
}

if (require.main === module) main();
module.exports = { displayName, matchKey };
