'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATES, stateInfo, statesInWave, LICENSE_SOURCES } = require('../lib/shop-states');
const { merge, website, phone, overpassQuery } = require('../scripts/crawl-state-shops');
const { plan, insertSql } = require('../scripts/import-state-shops');
const { coverage } = require('../scripts/shop-coverage');

test('registry covers all 50 states in ten waves of five', () => {
  assert.equal(new Set(STATES.map((s) => s.code)).size, 50);
  for (let w = 1; w <= 10; w++) assert.equal(statesInWave(w).length, 5);
  assert.deepEqual(statesInWave(1), ['CO', 'AZ', 'UT', 'NV', 'NM']);
  assert.equal(stateInfo('az').fips, '04');
  assert.ok(stateInfo('TX').licenseSource && !stateInfo('AZ').licenseSource);
  assert.ok(LICENSE_SOURCES.NY.typeExclude.test('Area Renter'), 'booth/area renters are individuals, not shop locations');
  assert.match(overpassQuery(stateInfo('NM')), /"ISO3166-2"="US-NM"/);
});

test('crawler keeps only stated, safe contact fields', () => {
  assert.equal(website('https://www.instagram.com/x'), '');
  assert.equal(website('javascript:alert(1)'), '');
  assert.equal(website('https://glow.example/'), 'https://glow.example/');
  assert.equal(website('https://map.contact/site/awsumsalon'), '', 'directory pages are not official websites');
  assert.equal(website('https://muse.ai/s/website-x'), '');
  assert.equal(website('https://glossgenius.com/'), '', 'a bare platform homepage is not the business website');
  assert.equal(website('https://finesse.glossgenius.com/'), 'https://finesse.glossgenius.com/', "the business's own platform page is");
  assert.equal(website('https://www.vagaro.com/cbsgfe'), 'https://www.vagaro.com/cbsgfe');
  assert.equal(phone('+1 602-555-0100'), '(602) 555-0100');
  assert.equal(phone('555-0100'), '');
});

const lic = (o) => ({ state: 'TX', zip_code: '78701', street_address: '1 Main St', licensed: true, source_name: LICENSE_SOURCES.TX.sourceName, source_url: LICENSE_SOURCES.TX.pageUrl, ...o });
const map = (o) => ({ state: 'TX', zip_code: '', street_address: '', licensed: false, source_name: 'OpenStreetMap contributors', website_status: 'osm_tag_needs_review', ...o });

test('merge lends one matching map place its website/phone and keeps unmatched places separate', () => {
  const rows = merge([lic({ name: 'Lone Star Barbers', city: 'Austin', external_id: 'tdlr:1', license_key: 'TX-TDLR.1' })], [
    map({ name: 'Lone Star Barbers', city: 'Austin', website_url: 'https://lsb.example/', phone: '(512) 555-0100', external_id: 'osm:node/1', source_url: 'https://www.openstreetmap.org/node/1', latitude: 30.2, longitude: -97.7 }),
    map({ name: 'Moon Nails', city: 'Austin', website_url: 'https://moon.example/', external_id: 'osm:node/2', source_url: 'https://www.openstreetmap.org/node/2' }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].website_url, 'https://lsb.example/');
  assert.equal(rows[0].phone, '(512) 555-0100');
  assert.equal(rows[1].external_id, 'osm:node/2');
});

test('state import: licensed rows need an active license and ZIP; map rows need a live website', () => {
  const r = plan([
    lic({ name: 'Lone Star Barbers', city: 'Austin', external_id: 'tdlr:1', license_key: 'TX-TDLR.1' }),
    lic({ name: 'Rose Nail Spa', city: 'Austin', external_id: 'tdlr:2', license_key: 'TX-TDLR.2', licensed: false }),
    lic({ name: 'Zip Less Salon', city: 'Austin', zip_code: '', external_id: 'tdlr:3', license_key: 'TX-TDLR.3' }),
    lic({ name: 'Bella', city: 'Austin', external_id: 'tdlr:4', license_key: 'TX-TDLR.4', license_type: 'Eyelash Extension Establishment' }),
    lic({ name: 'Numbers Salon', city: '75006', external_id: 'tdlr:5', license_key: 'TX-TDLR.5' }),
    map({ name: 'Moon Nails', city: 'Austin', category: 'nails', website_url: 'https://moon.example/', external_id: 'osm:node/2', source_url: 'https://www.openstreetmap.org/node/2' }),
    map({ name: 'Sun Nails', city: 'Austin', category: 'nails', website_url: '', external_id: 'osm:node/3', source_url: 'https://www.openstreetmap.org/node/3' }),
  ], { state: 'TX', checks: { 'https://moon.example/': { status: 'live' } }, checkedAt: '2026-11-19' });
  assert.deepEqual(r.publish.map((x) => x.name), ['Lone Star Barbers', 'Bella', 'Moon Nails']);
  assert.deepEqual(r.publish[1].categories, ['eyelash_technician']);
  assert.deepEqual(Object.fromEntries(r.review.map((x) => [x.name, x.reason])), {
    'Rose Nail Spa': 'license_not_confirmed_active', 'Zip Less Salon': 'missing_zip', 'Numbers Salon': 'missing_city', 'Sun Nails': 'map_only_without_website' });
  const sql = insertSql(r.publish, 'TX');
  assert.match(sql, /UPPER\(s\.state\) = 'TX'/);
  assert.match(sql, /SELECT NULL, name/);
  assert.doesNotMatch(sql, /\b(DELETE|DROP|TRUNCATE|UPDATE)\b/);
});

test('a website shared by two different businesses is not attached', () => {
  const r = plan([
    map({ name: 'Active Lashz', city: 'Mesa', category: 'lashes', website_url: 'https://www.vagaro.com/activelashz', external_id: 'osm:node/7', source_url: 'https://www.openstreetmap.org/node/7' }),
    map({ name: 'Touch of Healing Massage', city: 'Mesa', category: 'massage', website_url: 'https://www.vagaro.com/activelashz', external_id: 'osm:node/8', source_url: 'https://www.openstreetmap.org/node/8' }),
  ], { state: 'AZ', checks: { 'https://www.vagaro.com/activelashz': { status: 'live' } }, checkedAt: '2026-11-19' });
  assert.equal(r.publish.length, 0);
  assert.deepEqual(r.review.map((x) => x.reason), ['website_shared_with_other_business', 'website_shared_with_other_business']);
});

test('coverage counts Census places and counties, and lists communities outside places', () => {
  const placeRows = [
    { STATEFP: '35', PLACENAME: 'Albuquerque city', COUNTYNAME: 'Bernalillo County', TYPE: 'INCORPORATED PLACE' },
    { STATEFP: '35', PLACENAME: 'Santa Fe city', COUNTYNAME: 'Santa Fe County', TYPE: 'INCORPORATED PLACE' },
    { STATEFP: '35', PLACENAME: 'Placitas CDP', COUNTYNAME: 'Sandoval County', TYPE: 'CENSUS DESIGNATED PLACE' },
    { STATEFP: '04', PLACENAME: 'Phoenix city', COUNTYNAME: 'Maricopa County' },
  ];
  const countyRows = ['Bernalillo County', 'Santa Fe County', 'Sandoval County', 'Taos County'].map((c) => ({ STATEFP: '35', COUNTYNAME: c }));
  const c = coverage({ state: 'NM', placeRows, countyRows, shops: [{ city: 'Albuquerque' }, { city: 'Albuquerque' }, { city: 'Tijeras Canyon' }], held: [{ city: 'Placitas' }] });
  assert.equal(c.census_places, 3);
  assert.equal(c.places_covered, 1);
  assert.equal(c.counties_covered, 1);
  assert.deepEqual(c.counties_uncovered, ['Sandoval County', 'Santa Fe County', 'Taos County']);
  assert.deepEqual(c.communities_outside_census_places, [{ city: 'Tijeras Canyon', shops: 1 }]);
  assert.deepEqual(c.uncovered_places_with_held_candidates.map((g) => g.name), ['Placitas']);
});

test('expansion dashboard requires an admin before any query runs', async () => {
  const fs = require('node:fs'); const vm = require('node:vm'); const path = require('node:path');
  const queries = []; const routes = {};
  const deps = {
    '../db': { prepare(q) { queries.push(q); return { all: () => [] }; } }, '../lib/layout': { layout: () => '' }, '../lib/http': { send() {} },
    '../lib/util': require('../lib/util'), '../lib/admin': { requireAdmin: () => false }, '../lib/shop-states': require('../lib/shop-states'), '../lib/shop-categories': require('../lib/shop-categories'),
  };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/admin-expansion.js'), 'utf8'), { module: mod, exports: mod.exports, require: (id) => { if (id in deps) return deps[id]; throw new Error('Unexpected dependency ' + id); } });
  mod.exports({ get: (url, fn) => { routes[url] = fn; } });
  await routes['/admin/shop-expansion']({ query: {}, res: {} });
  assert.deepEqual(queries, []);
});
