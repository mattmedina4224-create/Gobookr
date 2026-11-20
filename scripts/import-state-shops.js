#!/usr/bin/env node
'use strict';
// Turns one state's discovery candidates (scripts/crawl-state-shops.js) into audited, idempotent shop imports.
//
// Usage:
//   node scripts/import-state-shops.js <candidates.json> --state=AZ [--existing=<shops.json>] [--websites=<checks.json>]
//        [--out=tmp/shops-AZ/import] [--batch-size=400] [--checked-at=YYYY-MM-DD]
//
// Dry run only: writes publish.json, review.json, skipped.json, enrich.json, batch-NN.sql, enrich.sql and
// summary.json. The SQL is guarded so rerunning a state never creates a second page for the same location.
//
// Publishing rules (same as the Colorado reference implementation):
//   * Active state business license (shop/salon/establishment) + name + city + ZIP + a category named in the
//     business name -> publish as 'verified' (a current state registration).
//   * Map-only place (OpenStreetMap) + city + category + a website that loaded in this run's check -> publish.
//     Without a live website it is held: community map data alone does not prove the business is open.
//   * Websites and phones are attached only from the source that stated them; websites only when they loaded.
//   * Schools, private-facility salons, missing city/ZIP, no category evidence, conflicting websites -> review.
const fs = require('node:fs');
const path = require('node:path');
const { classifyShop, CRAWLER_KIND_TO_CATEGORY } = require('../lib/shop-categories');
const { LICENSE_SOURCES } = require('../lib/shop-states');
const { officialWebsite } = require('../lib/shop-websites');

const LEGAL_SUFFIX = /[,\s]+(l\.?\s?l\.?\s?c\.?|p\.?l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|llp)$/i;
function repairText(raw) {
  const s = String(raw || '');
  if (!/[Â-ô][\u0080-¿]/.test(s)) return s;
  try { const fixed = Buffer.from(s, 'latin1').toString('utf8'); return fixed.includes('�') ? s : fixed; } catch (_) { return s; }
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
const LICENSE_TYPE_CATEGORIES = [[/eyelash/i, 'eyelash_technician'], [/hair weav|braid/i, 'stylist'], [/manicur|nail/i, 'nail_technician'], [/esthetic|facial/i, 'esthetician'], [/barber/i, 'barber']];
const sql = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");

// Candidates from the original Colorado crawler carry DORA fields without external ids; derive them the same way.
function normalizeCandidate(c, state) {
  if (c.external_id !== undefined) return c;
  const isDora = /DORA/.test(c.source_name || '');
  const co = LICENSE_SOURCES.CO;
  return { ...c, licensed: isDora && /active/i.test(c.licensing_status || ''), license_rejected: isDora && !/active/i.test(c.licensing_status || ''),
    external_id: isDora ? (c.license_number ? co.externalPrefix + c.license_number : '') : String(c.source_url || '').replace('https://www.openstreetmap.org/', 'osm:'),
    license_key: isDora && c.license_number ? co.licensePrefix + c.license_number : null,
    source_name: isDora ? co.sourceName : (c.source_name || 'OpenStreetMap contributors'), source_url: isDora ? co.pageUrl : c.source_url, state };
}

function plan(candidates, { state, existing = [], checks = {}, checkedAt }) {
  const live = (url) => { const c = url && officialWebsite(url) && checks[url]; return c && c.status === 'live' ? officialWebsite(c.final_url || url) : ''; };
  const existingByLicense = new Map(existing.filter((s) => s.license_number).map((s) => [String(s.license_number), s]));
  const existingByExternal = new Map(existing.filter((s) => s.source_external_id).map((s) => [String(s.source_external_id), s]));
  const existingByNameCity = new Map();
  for (const s of existing) { const k = matchKey(s.name) + '|' + cityKey(s.city); if (!existingByNameCity.has(k)) existingByNameCity.set(k, []); existingByNameCity.get(k).push(s); }

  const publish = []; const review = []; const skipped = []; const enrich = []; const seen = new Map();
  for (const raw of candidates) {
    const c = normalizeCandidate(raw, state);
    const licensedSource = Boolean(c.license_key) || /licen|registration|DORA|TDLR|DOS|DCP/i.test(c.source_name || '');
    const name = displayName(c.name);
    const city = titleCity(repairText(c.city));
    const zip = (String(c.zip_code || '').match(/\b\d{5}\b/) || [''])[0];
    let categories = classifyShop(name);
    if (!categories.length && !licensedSource && CRAWLER_KIND_TO_CATEGORY[c.category]) categories = [CRAWLER_KIND_TO_CATEGORY[c.category]]; // map shop/beauty tag evidence
    // A specialty license names the service itself (e.g. TDLR "Eyelash Extension Establishment").
    for (const [re, cat] of LICENSE_TYPE_CATEGORIES) if (re.test(c.license_type || '') && !categories.includes(cat)) categories.push(cat);
    const website = c.website_status === 'conflicting_websites_review' ? '' : live(c.website_url);
    const row = {
      name, city, state, street_address: String(c.street_address || '').trim(), zip_code: zip, county: c.county || '', categories, website_url: website,
      phone: c.phone || '', source_name: c.source_name, source_url: c.source_url, source_external_id: c.external_id || '',
      license_number: c.license_key || null,
      latitude: Number.isFinite(c.latitude) ? c.latitude : null, longitude: Number.isFinite(c.longitude) ? c.longitude : null,
      operational_status: 'verified', checked_at: checkedAt, raw_name: c.name, website_candidate: c.website_url || '', website_source_url: c.website_source_url || '',
    };
    const hold = (reason) => review.push({ ...row, reason });
    if (!name || name.length < 2) { hold('missing_name'); continue; }
    if (!row.source_external_id) { hold('missing_source_identifier'); continue; }
    if (!city || !/[a-z]/i.test(city)) { hold('missing_city'); continue; }
    if (licensedSource && (c.license_rejected || !c.licensed)) { hold('license_not_confirmed_active'); continue; }
    if (licensedSource && !zip) { hold('missing_zip'); continue; }
    if (/\b(academy|school|college|institute|university|training)\b/i.test(name)) { hold('school_or_training_facility'); continue; }
    if (/\b(assisted living|senior living|independent living|retirement|nursing|memory care|school district|hospital|correctional|rehabilitation)\b/i.test(name)) { hold('private_facility_salon'); continue; }
    if (!categories.length) { hold('no_category_evidence_in_name'); continue; }
    if (!licensedSource && !website) { hold(c.website_url ? 'map_website_not_confirmed_live' : 'map_only_without_website'); continue; }
    if (c.website_status === 'conflicting_websites_review') row.review_note = 'conflicting_websites';

    const byName = (existingByNameCity.get(matchKey(name) + '|' + cityKey(city)) || []).filter((s) => !s.zip_code || !zip || s.zip_code === zip);
    const match = (row.license_number && existingByLicense.get(row.license_number)) || existingByExternal.get(row.source_external_id) || byName[0];
    if (match) {
      skipped.push({ ...row, reason: 'existing_shop', existing_id: match.id });
      if (!match.owner_user_id && match.claim_status === 'unclaimed') enrich.push({ id: match.id, zip_code: zip, license_number: row.license_number, website_url: website, phone: row.phone, categories, source_external_id: row.source_external_id });
      continue;
    }
    const key = matchKey(name) + '|' + cityKey(city) + '|' + zip;
    if (seen.has(key)) {
      const first = seen.get(key);
      first.categories = [...new Set([...first.categories, ...categories])];
      if (!first.website_url && website) first.website_url = website;
      if (!first.phone && row.phone) first.phone = row.phone;
      if (!first.street_address && row.street_address) first.street_address = row.street_address;
      skipped.push({ ...row, reason: 'duplicate_candidate', duplicate_of: first.source_external_id });
      continue;
    }
    seen.set(key, row);
    publish.push(row);
  }
  // One website on two differently named businesses is a source error (e.g. a copied booking link): drop it.
  const owners = new Map();
  for (const r of publish) if (r.website_url) { const k = r.website_url.replace(/\/+$/, '').toLowerCase(); if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(matchKey(r.name)); }
  const finalPublish = [];
  for (const r of publish) {
    const k = r.website_url && r.website_url.replace(/\/+$/, '').toLowerCase();
    if (k && owners.get(k).size > 1) {
      const licensed = Boolean(r.license_number);
      if (licensed) { finalPublish.push({ ...r, website_url: '', review_note: 'website_shared_with_other_business' }); continue; }
      review.push({ ...r, website_url: '', reason: 'website_shared_with_other_business' }); continue;
    }
    finalPublish.push(r);
  }
  return { publish: finalPublish, review, skipped, enrich };
}

function insertSql(rows, state) {
  const values = rows.map((r) => '(' + [r.name, r.city, r.state, r.street_address, r.zip_code, r.website_url, r.phone, r.source_url, r.source_name, r.checked_at,
    r.source_external_id, r.license_number, r.latitude === null ? 'NULL' : r.latitude, r.longitude === null ? 'NULL' : r.longitude, r.categories.join(',')]
    .map((v, i) => (i === 12 || i === 13) ? v : sql(v)).join(',') + ')').join(',\n  ');
  return `-- Generated by scripts/import-state-shops.js (${state}). Idempotent: rerunning inserts nothing new.
WITH incoming (name, city, state, street_address, zip_code, website_url, phone, source_url, source_name, checked_at, source_external_id, license_number, latitude, longitude, categories) AS (VALUES
  ${values}
), fresh AS (
  SELECT DISTINCT ON (i.source_external_id) i.* FROM incoming i
  WHERE NOT EXISTS (SELECT 1 FROM shops s WHERE s.source_external_id = i.source_external_id)
    AND NOT EXISTS (SELECT 1 FROM shops s WHERE i.license_number IS NOT NULL AND s.license_number = i.license_number)
    AND NOT EXISTS (SELECT 1 FROM shops s WHERE UPPER(s.state) = ${sql(state)}
      AND regexp_replace(lower(s.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(i.name), '[^a-z0-9]+', '', 'g')
      AND lower(s.city) = lower(i.city) AND (s.zip_code = '' OR i.zip_code = '' OR s.zip_code = i.zip_code))
), inserted AS (
  INSERT INTO shops (owner_user_id, name, city, state, street_address, zip_code, website_url, phone, claim_status, source_url, source_name,
    source_checked_at, operational_status, source_external_id, license_number, latitude, longitude)
  SELECT NULL, name, city, state, street_address, zip_code, website_url, phone, 'unclaimed', source_url, source_name,
    checked_at::timestamptz, 'verified', source_external_id, license_number, latitude::double precision, longitude::double precision FROM fresh
  RETURNING id, source_external_id
), cats AS (
  INSERT INTO shop_categories (shop_id, category, source)
  SELECT ins.id, c, CASE WHEN i.license_number IS NULL THEN 'map_tag_or_name' ELSE 'registered_name' END
  FROM inserted ins JOIN incoming i ON i.source_external_id = ins.source_external_id, unnest(string_to_array(i.categories, ',')) AS c
  ON CONFLICT DO NOTHING RETURNING shop_id
)
SELECT (SELECT count(*) FROM incoming) AS submitted, (SELECT count(*) FROM inserted) AS inserted,
  (SELECT count(*) FROM cats) AS category_rows, (SELECT min(id) FROM inserted) AS min_id, (SELECT max(id) FROM inserted) AS max_id;
`;
}

function enrichSql(rows) {
  if (!rows.length) return '-- nothing to enrich\n';
  return `-- Fill blanks on existing UNCLAIMED shops from a verified match. Never overwrites a value or touches claimed shops.
WITH incoming (id, zip_code, license_number, website_url, phone, source_external_id, categories) AS (VALUES
  ${rows.map((r) => '(' + [r.id, sql(r.zip_code), sql(r.license_number), sql(r.website_url), sql(r.phone || ''), sql(r.source_external_id), sql(r.categories.join(','))].join(',') + ')').join(',\n  ')}
), updated AS (
  UPDATE shops s SET
    zip_code = CASE WHEN s.zip_code = '' THEN i.zip_code ELSE s.zip_code END,
    license_number = COALESCE(s.license_number, CASE WHEN NOT EXISTS (SELECT 1 FROM shops x WHERE x.license_number = i.license_number) THEN i.license_number END),
    website_url = CASE WHEN s.website_url = '' THEN i.website_url ELSE s.website_url END,
    phone = CASE WHEN s.phone = '' THEN i.phone ELSE s.phone END,
    operational_status = CASE WHEN i.license_number IS NOT NULL THEN 'verified' ELSE s.operational_status END,
    updated_at = CURRENT_TIMESTAMP
  FROM incoming i WHERE s.id = i.id AND s.owner_user_id IS NULL AND s.claim_status = 'unclaimed'
  RETURNING s.id
), cats AS (
  INSERT INTO shop_categories (shop_id, category, source)
  SELECT i.id, c, 'registered_name' FROM incoming i, unnest(string_to_array(i.categories, ',')) AS c
  WHERE EXISTS (SELECT 1 FROM shops s WHERE s.id = i.id AND s.owner_user_id IS NULL)
  ON CONFLICT DO NOTHING RETURNING shop_id
)
SELECT (SELECT count(*) FROM updated) AS updated, (SELECT count(*) FROM cats) AS category_rows;
`;
}

function main(argv = process.argv.slice(2), defaults = {}) {
  const opt = (name, fallback) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
  const candidatesPath = argv.find((a) => !a.startsWith('--'));
  if (!candidatesPath) throw new Error('candidates.json path required');
  const state = String(opt('state', defaults.state || '')).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error('--state=XX required');
  const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  const existingPath = opt('existing', '');
  const existing = existingPath && fs.existsSync(existingPath) ? JSON.parse(fs.readFileSync(existingPath, 'utf8')).filter((s) => !s.state || String(s.state).toUpperCase() === state) : [];
  const checks = opt('websites', '') && fs.existsSync(opt('websites')) ? JSON.parse(fs.readFileSync(opt('websites'), 'utf8')) : {};
  const out = opt('out', defaults.out || `tmp/shops-${state}/import`);
  const batchSize = Number(opt('batch-size', 400));
  const checkedAt = opt('checked-at', new Date().toISOString().slice(0, 10));
  fs.mkdirSync(out, { recursive: true });

  const { publish, review, skipped, enrich } = plan(candidates, { state, existing, checks, checkedAt });
  const write = (file, data) => fs.writeFileSync(path.join(out, file), typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  write('publish.json', publish); write('review.json', review); write('skipped.json', skipped); write('enrich.json', enrich);
  fs.readdirSync(out).filter((f) => /^batch-\d+\.sql$/.test(f)).forEach((f) => fs.unlinkSync(path.join(out, f)));
  for (let i = 0; i < publish.length; i += batchSize) write(`batch-${String(i / batchSize + 1).padStart(2, '0')}.sql`, insertSql(publish.slice(i, i + batchSize), state));
  write('enrich.sql', enrichSql(enrich));

  const count = (rows, f) => rows.reduce((m, r) => { for (const k of [].concat(f(r))) m[k] = (m[k] || 0) + 1; return m; }, {});
  const summary = {
    state, checked_at: checkedAt, candidates: candidates.length, existing_compared: existing.length, publish: publish.length, review: review.length, skipped: skipped.length, enrich_existing: enrich.length,
    publish_with_website: publish.filter((r) => r.website_url).length, publish_with_street: publish.filter((r) => r.street_address).length, publish_with_phone: publish.filter((r) => r.phone).length,
    review_reasons: count(review, (r) => r.reason), skipped_reasons: count(skipped, (r) => r.reason),
    publish_categories: count(publish, (r) => r.categories), publish_sources: count(publish, (r) => r.source_name),
    publish_cities: Object.fromEntries(Object.entries(count(publish, (r) => r.city)).sort((a, b) => b[1] - a[1])),
    review_cities: Object.fromEntries(Object.entries(count(review, (r) => r.city || '(no city)')).sort((a, b) => b[1] - a[1])),
    batches: Math.ceil(publish.length / batchSize),
  };
  write('summary.json', summary);
  console.log(JSON.stringify({ ...summary, publish_cities: Object.keys(summary.publish_cities).length + ' cities', review_cities: undefined }, null, 1));
  return summary;
}

if (require.main === module) main();
module.exports = { displayName, matchKey, repairText, plan, insertSql, enrichSql, main };
