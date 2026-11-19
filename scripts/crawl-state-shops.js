#!/usr/bin/env node
'use strict';
// GoBookr national Golden List discovery for one state: open licensing data (when the state publishes it)
// + OpenStreetMap. Read-only staging; nothing here writes to a database or invents a field.
//
// Usage: node scripts/crawl-state-shops.js --state=AZ [--out=tmp/shops-AZ] [--skip-license] [--skip-osm]
// Writes <out>/candidates.json, candidates.csv, report.json.
//
// Each candidate keeps: the source it came from, the source URL, a stable external id (license number or
// OSM element), whether it is backed by an active business license, and only the fields the source states.
const fs = require('node:fs');
const path = require('node:path');
const { stateInfo } = require('../lib/shop-states');

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const flag = (n) => args.includes(`--${n}`);

const norm = (x) => String(x || '').normalize('NFKD').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (x) => norm(x).replace(/ /g, '');
const titleCase = (x) => String(x || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, options = {}) {
  const attempts = options.attempts || 4;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout || 120000),
        headers: { Accept: 'application/json', 'User-Agent': 'GoBookr-Public-Shop-Audit/1.1 (+https://gobookr.com)', ...(options.headers || {}) } });
      if (!r.ok) {
        if ([429, 502, 503, 504].includes(r.status) && attempt < attempts - 1) { await sleep(5000 * (attempt + 1)); continue; }
        throw Error('HTTP ' + r.status + ' ' + url.slice(0, 200));
      }
      return await r.json();
    } catch (e) { if (attempt === attempts - 1) throw e; await sleep(5000 * (attempt + 1)); }
  }
}

function kind(name, detail = '') {
  const n = norm(name + ' ' + detail);
  if (/spray tan|airbrush tan|sunless tan|bronzing|tanning/.test(n)) return 'spray_tanning';
  if (/nail|manicure|pedicure/.test(n)) return 'nails';
  if (/barber|fade|shav/.test(n)) return 'barber';
  if (/tattoo/.test(n)) return 'tattoo';
  if (/massage|bodywork/.test(n)) return 'massage';
  if (/lash|eyelash/.test(n)) return 'lashes';
  if (/eyebrow|brow/.test(n)) return 'brows';
  if (/wax|sugar|threading/.test(n)) return 'waxing';
  if (/permanent makeup|permanent_makeup|microblading|pmu/.test(n)) return 'permanent_makeup';
  if (/esthetic|facial|skin care|skincare/.test(n)) return 'skincare';
  if (/makeup|bridal|cosmetics/.test(n)) return 'makeup';
  if (/salon suite|salon studio/.test(n)) return 'salon_suites';
  if (/hair|salon|braid|extension|stylist|beauty|hairdresser/.test(n)) return 'hair';
  return detail ? 'other_beauty' : 'shop_category_review';
}
function website(v) {
  try { const u = new URL(String(v || '').trim()); if (!['http:', 'https:'].includes(u.protocol)) return '';
    if (/(^|\.)(instagram|facebook|yelp|tiktok|twitter|x|google|goo)\.(com|gl)$/.test(u.hostname)) return ''; return u.toString(); } catch { return ''; }
}
function phone(v) { const d = String(v || '').split(/[;,]/)[0].replace(/[^\d+]/g, ''); const ten = d.replace(/^\+?1/, ''); return /^\d{10}$/.test(ten) ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : ''; }

// ---- licensing adapter (Socrata) ---------------------------------------------------------------------------
const FIELDS = {
  type: ['License Type', 'Credential Type', 'license_type', 'licenseType', 'License Subtype', 'Type'],
  status: ['License Status', 'Status', 'license_status', 'licenseStatusDescription', 'License Status Description'],
  name: ['Business Name', 'business_name', 'DBA Name', 'Doing Business As', 'Entity Name', 'entityName', 'Facility Name', 'Licensee Name', 'Name', 'Full Name', 'Licensee', 'Organization Name'],
  street: ['Business Address Line1', 'business_address_line1', 'Business Address 1', 'business_address_1', 'Business Street Address', 'business_street_address', 'Business Address', 'Business Street', 'Address', 'Street Address', 'Street', 'Address Line 1', 'addressLine1', 'Address 1'],
  city: ['Business City', 'business_city', 'City', 'Address City', 'mailCity'],
  cityStateZip: ['Business City State Zip', 'business_city_state_zip', 'City State Zip'],
  zip: ['Business Zip', 'business_zip', 'Zip', 'Zip Code', 'ZIP', 'Postal Code', 'mailZipCode', 'zipcode'],
  state: ['Business State', 'business_state', 'State', 'mailState', 'Address State'],
  county: ['Business County', 'County', 'business_county'],
  number: ['License Number', 'license_number', 'Credential Number', 'License No', 'licenseNumber', 'Credential', 'License'],
  expires: ['License Expiration Date', 'Expiration Date', 'license_expiration_date', 'licenseExpirationDate', 'Expiration'],
};

async function licenses(st, src) {
  const API = 'https://' + src.domain;
  const meta = await json(API + '/api/views/' + src.dataset + '.json');
  const cols = (meta.columns || []).filter((c) => c.fieldName && !c.fieldName.startsWith(':')).map((c) => ({ name: c.name, field: c.fieldName }));
  // Exact name/field matches first (in alias order), then a containment match.
  const field = (aliases) => {
    for (const a of aliases) { const hit = cols.find((x) => compact(a) === compact(x.name) || compact(a) === compact(x.field)); if (hit) return hit.field; }
    return '';
  };
  const F = Object.fromEntries(Object.entries(FIELDS).map(([k, a]) => [k, field(a)]));
  // Portals name address columns inconsistently (NY: business_address_1 style); fall back to the first business
  // street/address column that is not a second line, city, state or ZIP.
  const fallback = (re, not) => cols.find((x) => re.test(x.name + ' ' + x.field) && !not.test(x.name + ' ' + x.field))?.field || '';
  if (!F.street) F.street = fallback(/(business|location|physical|site).*(addr|street)|^(addr|street)/i, /city|state|zip|postal|line ?2|_2\b|address 2|mail/i);
  if (!F.county) F.county = fallback(/county/i, /code|fips/i);
  if (!F.type) F.type = cols.find((x) => /licen|credential/i.test(x.name + x.field) && /type/i.test(x.name + x.field))?.field || '';
  if (!F.type || !F.name) throw Error(st.code + ' license dataset lacks a type or name column; columns: ' + cols.map((c) => c.field).join(','));

  const isShop = (t) => src.typeInclude.test(t) && (!src.typeRequire || src.typeRequire.test(t)) && !src.typeExclude.test(t);
  // Some portals store the license type as a short code (CO "REG", CT "COS"). Try the detected type column
  // first, then the dataset's lookup table, then every other credential/type/description column, and use the
  // first column whose values actually name shop or salon licenses.
  const typeCandidates = [F.type, ...cols.filter((c) => c.field !== F.type && /type|credential|licen|profession|desc|category|class/i.test(c.name + ' ' + c.field)).map((c) => c.field)];
  let typeRows = []; let values = new Set(); let described = []; let shopTypes = []; const tried = [];
  for (const candidate of typeCandidates.slice(0, 8)) {
    let rowsForField;
    try { rowsForField = await json(API + '/resource/' + src.dataset + '.json?' + new URLSearchParams({ $select: candidate + ', count(*) AS n', $group: candidate, $limit: '5000' })); }
    catch (e) { tried.push(candidate + ' (error)'); continue; }
    const vals = new Set(rowsForField.map((t) => t[candidate]).filter(Boolean));
    const desc = [];
    if (src.typeLookup && candidate === F.type) {
      let lookup = []; try { lookup = await json(API + '/resource/' + src.typeLookup + '.json?$limit=5000'); } catch (_) {}
      for (const row of lookup) { const text = Object.values(row).map(String).join(' '); const code = Object.values(row).map(String).find((v) => vals.has(v)); if (code) desc.push({ code, text }); }
    }
    const picked = [...new Set([...desc.filter((d) => isShop(d.text)).map((d) => d.code), ...[...vals].filter(isShop)])];
    tried.push(candidate + ' (' + vals.size + ' values, ' + picked.length + ' shop types)');
    if (picked.length) { F.type = candidate; typeRows = rowsForField; values = vals; described = desc; shopTypes = picked; break; }
  }
  if (!shopTypes.length) throw Error(st.code + ' no shop/salon license types; tried ' + tried.join(', ') + '; columns: ' + cols.map((c) => c.name + '=' + c.field).join(', ').slice(0, 1500));

  const inList = shopTypes.map((t) => "'" + t.replace(/'/g, "''") + "'").join(',');
  const today = new Date().toISOString().slice(0, 10);
  const rows = []; let total = 0; const dropped = { inactive: 0, expired: 0, out_of_state: 0, no_name_or_city: 0 };
  for (let offset = 0; offset < 500000; offset += 5000) {
    const batch = await json(API + '/resource/' + src.dataset + '.json?' + new URLSearchParams({ $limit: '5000', $offset: String(offset), $order: ':id', $where: F.type + ' in(' + inList + ')' }));
    total += batch.length;
    for (const raw of batch) {
      const get = (k) => (F[k] && raw[F[k]] != null ? String(raw[F[k]]).trim() : '');
      const status = get('status');
      if (status && !/active|current|valid|issued|licensed/i.test(status)) { dropped.inactive++; continue; }
      if (!status && !src.allActive && !/data\.texas\.gov/.test(src.domain)) { /* unknown status: kept but flagged below */ }
      const expires = get('expires').slice(0, 10);
      if (expires && /^\d{4}-\d{2}-\d{2}$/.test(expires) && expires < today) { dropped.expired++; continue; }
      let city = get('city'), stateValue = get('state'), zip = get('zip');
      const csz = get('cityStateZip').match(/^(.*?)[,\s]+([A-Z]{2})\s+(\d{5})/i);
      if (csz) { city = city || csz[1]; stateValue = stateValue || csz[2]; zip = zip || csz[3]; }
      if (stateValue && !new RegExp('^(' + st.code + '|' + st.name + ')$', 'i').test(stateValue)) { dropped.out_of_state++; continue; }
      const name = get('name');
      if (!name || !city) { dropped.no_name_or_city++; continue; }
      const number = get('number');
      rows.push({
        name, city: titleCase(city), state: st.code, street_address: titleCase(get('street')), zip_code: (zip.match(/\b\d{5}\b/) || [''])[0], county: titleCase(get('county')),
        category: kind(name), license_type: get('type'), licensing_status: status || (src.allActive || /texas/.test(src.domain) ? 'active (current-licenses dataset)' : 'unknown'),
        license_expires: expires, licensed: Boolean(number) && (Boolean(status) || src.allActive || /texas/.test(src.domain)),
        license_number: number, license_key: number ? src.licensePrefix + number : null, external_id: number ? src.externalPrefix + number : '',
        website_url: '', website_status: 'missing', phone: '', source_name: src.sourceName, source_url: src.pageUrl,
      });
    }
    if (batch.length < 5000) break;
  }
  return { rows, total, fields: F, shopTypes, typeCounts: typeRows.filter((t) => shopTypes.includes(t[F.type])), dropped,
    typeLookup: described.filter((d) => /barber|cosmet|massage|tattoo|esthet|nail|salon|shop/i.test(d.text)) };
}

// ---- OpenStreetMap ---------------------------------------------------------------------------------------
// Four lighter queries per state instead of one: statewide union queries time out at the public gateways (504).
const OSM_PARTS = [
  'nwr["shop"="hairdresser"](area.a);nwr["craft"="hairdresser"](area.a);',
  'nwr["shop"~"^(beauty|nails|barber|cosmetics)$"](area.a);',
  'nwr["shop"~"^(tattoo|massage)$"](area.a);nwr["healthcare"="massage_therapist"](area.a);',
  'nwr["beauty"~"^(nails|tanning|eyelash|eyebrow|waxing|permanent_makeup|hair_removal|skin_care|threading)$"](area.a);',
];
const overpassQuery = (st, part = OSM_PARTS.join('')) => '[out:json][timeout:240];area["ISO3166-2"="US-' + st.code + '"]["admin_level"="4"]->.a;(' + part + ');out center tags;';

async function osm(st) {
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const errors = []; const elements = new Map(); let okParts = 0; let endpointUsed = null;
  for (const part of OSM_PARTS) {
    let done = false;
    for (let round = 0; round < 2 && !done; round++) {
      for (const ep of endpoints) {
        try {
          const data = await json(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: overpassQuery(st, part) }).toString(), timeout: 300000, attempts: 1 });
          if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) throw Error('Overpass: ' + data.remark);
          for (const v of data.elements || []) elements.set(v.type + '/' + v.id, v);
          okParts++; endpointUsed = endpointUsed || ep; done = true; break;
        } catch (e) { errors.push(ep + ' [' + part.slice(0, 40) + ']: ' + String(e.message || e).slice(0, 160)); }
      }
      if (!done) await sleep(30000);
    }
    await sleep(3000);
  }
  if (okParts === OSM_PARTS.length) errors.length = 0; // every part eventually succeeded; earlier retries are not errors
  const rows = [];
      for (const v of elements.values()) {
        const t = v.tags || {}; const name = t.name || t['name:en'] || t.brand; if (!name) continue;
        if (t.disused || t['disused:shop'] || t.opening_hours === 'closed') continue;
        if (t['addr:state'] && !new RegExp('^(' + st.code + '|' + st.name + ')$', 'i').test(t['addr:state'])) continue;
        const loc = v.center || v;
        rows.push({
          name, city: t['addr:city'] || '', state: st.code, street_address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '),
          zip_code: (String(t['addr:postcode'] || '').match(/\b\d{5}\b/) || [''])[0], county: '',
          category: kind(name, [t.shop, t.beauty, t.craft, t.healthcare].filter(Boolean).join(' ')),
          website_url: website(t.website || t['contact:website'] || t.url), phone: phone(t.phone || t['contact:phone']),
          website_status: 'osm_tag_needs_review', source_url: 'https://www.openstreetmap.org/' + v.type + '/' + v.id, external_id: 'osm:' + v.type + '/' + v.id,
          source_name: 'OpenStreetMap contributors', licensed: false, licensing_status: 'not_checked',
          latitude: loc.lat || null, longitude: loc.lon || null,
        });
      }
      return { rows, endpoint: endpointUsed, errors, parts_ok: okParts, parts_total: OSM_PARTS.length };
}

// Licensed rows are the base; a mapped place with the same name in the same city/ZIP/street lends its website,
// phone and coordinates. Mapped places with no licensed match are kept as separate (unlicensed) candidates.
function merge(a, b) {
  const groups = new Map();
  for (const x of b) { const k = norm(x.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const records = []; const used = new Set();
  const key = (x) => norm(x.name) + '|' + norm(x.city) + '|' + norm(x.street_address) + '|' + x.zip_code;
  const seen = new Set();
  for (const x of a) {
    const matches = (groups.get(norm(x.name)) || []).filter((y) => (y.zip_code && y.zip_code === x.zip_code) || (y.city && norm(y.city) === norm(x.city)) ||
      (y.street_address && x.street_address && norm(y.street_address) === norm(x.street_address)));
    if (matches.length === 1) {
      const y = matches[0]; used.add(y.external_id);
      if (y.website_url) { x.website_url = y.website_url; x.website_status = 'osm_match_needs_review'; x.website_source_url = y.source_url; }
      if (y.phone) { x.phone = y.phone; x.phone_source_url = y.source_url; }
      if (y.latitude && !x.street_address && y.street_address) x.street_address = y.street_address;
      if (y.latitude && (!x.street_address || norm(x.street_address) === norm(y.street_address))) { x.latitude = y.latitude; x.longitude = y.longitude; }
      x.osm_id = y.external_id;
    } else if (matches.length > 1) {
      const sites = [...new Set(matches.map((y) => y.website_url).filter(Boolean))];
      if (sites.length > 1) x.website_status = 'conflicting_websites_review';
      else if (sites.length === 1) { x.website_url = sites[0]; x.website_status = 'osm_chain_match_needs_review'; }
    }
    if (!seen.has(key(x))) { seen.add(key(x)); records.push(x); }
  }
  for (const y of b) {
    if (used.has(y.external_id) || seen.has(key(y))) continue;
    if (!y.city && !y.zip_code && !y.street_address && !y.latitude) continue;
    seen.add(key(y)); records.push(y);
  }
  return records;
}

// Map places often lack addr:city. The Census Geocoder returns the incorporated place or census-designated
// place whose boundary contains the point (and its county); we use that only when the point is inside one.
// Points outside every place keep a blank city and stay held for review.
async function censusPlaces(rows, limit = 4000) {
  const todo = rows.filter((r) => !r.city && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).slice(0, limit);
  let filled = 0; let failed = 0; let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < todo.length) {
      const r = todo[i++];
      try {
        const u = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates?' + new URLSearchParams({ x: String(r.longitude), y: String(r.latitude), benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'all', format: 'json' });
        const g = (await json(u, { timeout: 30000, attempts: 2 })).result?.geographies || {};
        const place = (g['Incorporated Places'] || [])[0] || (g['Census Designated Places'] || [])[0];
        const county = (g.Counties || [])[0];
        if (county && !r.county) r.county = county.BASENAME || county.NAME || '';
        if (place && (place.BASENAME || place.NAME)) { r.city = place.BASENAME || String(place.NAME).replace(/\s+(city|town|village|CDP|borough)$/i, ''); r.city_source = 'census_place_containing_point'; filled++; }
      } catch (_) { failed++; }
    }
  }));
  return { attempted: todo.length, filled, failed };
}

function csv(rows) {
  const fields = ['name', 'category', 'city', 'county', 'state', 'street_address', 'zip_code', 'website_url', 'phone', 'website_status', 'source_name', 'source_url', 'external_id', 'license_type', 'license_number', 'licensing_status', 'license_expires', 'latitude', 'longitude'];
  const q = (x) => '"' + String(x ?? '').replace(/"/g, '""') + '"';
  return [fields.map(q).join(','), ...rows.map((r) => fields.map((k) => q(r[k])).join(','))].join('\n') + '\n';
}

async function main() {
  const st = stateInfo(opt('state', ''));
  const out = opt('out', 'tmp/shops-' + st.code);
  const errors = []; const sources = [];
  let lic = { rows: [], total: 0 }; let map = { rows: [], errors: [] };
  if (st.licenseSource && !flag('skip-license')) {
    try { lic = await licenses(st, st.licenseSource); sources.push({ name: st.licenseSource.sourceName, url: st.licenseSource.pageUrl, status: 'processed', records: lic.rows.length }); }
    catch (e) { errors.push('license: ' + String(e.message || e)); sources.push({ name: st.licenseSource.sourceName, url: st.licenseSource.pageUrl, status: 'failed', error: String(e.message || e).slice(0, 500) }); }
  }
  if (!flag('skip-osm')) {
    map = await osm(st);
    const osmStatus = map.parts_ok === map.parts_total ? 'processed' : map.parts_ok ? 'partial' : 'failed';
    sources.push({ name: 'OpenStreetMap (Overpass)', url: map.endpoint, status: osmStatus, records: map.rows.length, parts_ok: map.parts_ok, parts_total: map.parts_total, error: map.errors.join(' | ').slice(0, 2000) || undefined });
    errors.push(...map.errors.map((e) => 'osm: ' + e));
  }
  if (!lic.rows.length && !map.rows.length) throw Error(st.code + ': every source failed: ' + errors.join('; '));
  const rows = merge(lic.rows, map.rows);
  let census = { attempted: 0, filled: 0, failed: 0 };
  if (!flag('skip-census')) { census = await censusPlaces(rows); sources.push({ name: 'U.S. Census Geocoder (place containing map point)', url: 'https://geocoding.geo.census.gov/', status: census.attempted && census.failed === census.attempted ? 'failed' : 'processed', records: census.filled }); }
  const categories = rows.reduce((m, x) => ((m[x.category] = (m[x.category] || 0) + 1), m), {});
  const report = {
    state: st.code, state_name: st.name, wave: st.wave, created_at: new Date().toISOString(), staging_only: true, sources,
    license_records_scanned: lic.total, licensed_active_candidates: lic.rows.length, license_dropped: lic.dropped || null,
    license_fields: lic.fields || null, license_shop_types: lic.shopTypes || [], license_type_counts: lic.typeCounts || [], license_type_lookup: lic.typeLookup || [],
    census_city_lookup: census, mapped_beauty_places: map.rows.length, overpass_endpoint: map.endpoint, total_candidates: rows.length,
    with_websites: rows.filter((x) => x.website_url).length, category_counts: categories, errors,
    note: 'A license record or map listing alone does not prove a business is open. The importer publishes only rows that meet its rules; the rest are held.',
    attribution: 'OpenStreetMap data © OpenStreetMap contributors (ODbL, https://www.openstreetmap.org/copyright). Licensing data from the listed state open-data portals.',
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'candidates.json'), JSON.stringify(rows));
  fs.writeFileSync(path.join(out, 'candidates.csv'), csv(rows));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, license_type_lookup: undefined, license_type_counts: undefined, license_fields: undefined }));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { censusPlaces, kind, merge, website, phone, overpassQuery };
