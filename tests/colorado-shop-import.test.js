'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { classifyShop, SHOP_CATEGORY_LABELS, CRAWLER_KIND_TO_CATEGORY } = require('../lib/shop-categories');
const { PROFESSIONAL_CATEGORIES } = require('../lib/pro-categories');
const { displayName } = require('../scripts/import-colorado-shops');

test('shop categories use professional category values and business labels', () => {
  const values = new Set(PROFESSIONAL_CATEGORIES.map((c) => c.value));
  for (const v of Object.keys(SHOP_CATEGORY_LABELS)) assert.ok(values.has(v), v);
  for (const v of Object.values(CRAWLER_KIND_TO_CATEGORY)) assert.ok(values.has(v), v);
});

test('classification uses name evidence and never guesses', () => {
  assert.deepEqual(classifyShop('Dapper Barbershop'), ['barber']);
  assert.deepEqual(classifyShop('Polished Nail Salon'), ['nail_technician']);
  assert.deepEqual(classifyShop('AB Nails & Hair').sort(), ['nail_technician', 'stylist']);
  assert.deepEqual(classifyShop('Salon Lash Lounge'), ['eyelash_technician']);
  assert.deepEqual(classifyShop('Heritage Medical Spa LLC'), ['esthetician']);
  assert.deepEqual(classifyShop('Sunless Glow Spray Tan'), ['spray_tan_specialist']);
  assert.deepEqual(classifyShop('Bee Smooth LLC'), []);
  assert.deepEqual(classifyShop('The Factory'), []);
  assert.deepEqual(classifyShop('RAKxa Wellness Spa at The St. Regis Aspen Resort'), []);
  assert.deepEqual(classifyShop('The Polished Blade'), []);
});

test('display names drop legal suffixes, use DBA names and repair mis-encoded apostrophes', () => {
  assert.equal(displayName('GHC Salon LLC'), 'GHC Salon');
  assert.equal(displayName('Fuel Salon & Spa Two,LLC'), 'Fuel Salon & Spa Two');
  assert.equal(displayName('Smith Holdings LLC dba Rose Nail Spa'), 'Rose Nail Spa');
  assert.equal(displayName('BRIGHT NAILS & SPA LLC'), 'Bright Nails & Spa');
  assert.equal(displayName('Annaâ\u0080\u0099s Nail'), 'Anna’s Nail');
});

function runImport(candidates, existing, websites) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'co-import-'));
  fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify(candidates));
  fs.writeFileSync(path.join(dir, 'e.json'), JSON.stringify(existing));
  fs.writeFileSync(path.join(dir, 'w.json'), JSON.stringify(websites || {}));
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'import-colorado-shops.js'), path.join(dir, 'c.json'), '--existing=' + path.join(dir, 'e.json'),
    '--websites=' + path.join(dir, 'w.json'), '--out=' + path.join(dir, 'out'), '--checked-at=2026-11-19'], { stdio: 'pipe' });
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'out', f), 'utf8'));
  return { publish: read('publish.json'), review: read('review.json'), skipped: read('skipped.json'), enrich: read('enrich.json'), sql: fs.existsSync(path.join(dir, 'out', 'batch-01.sql')) ? fs.readFileSync(path.join(dir, 'out', 'batch-01.sql'), 'utf8') : '' };
}
const dora = (o) => ({ source_name: 'Colorado DORA Shop Registration', licensing_status: 'Active', state: 'CO', zip_code: '80202', street_address: '', website_url: '', website_status: 'missing', ...o });
const osm = (o) => ({ source_name: 'OpenStreetMap contributors', state: 'CO', zip_code: '', website_status: 'osm_tag_needs_review', ...o });

test('import publishes verified shops, holds uncertain ones, and dedupes', () => {
  const r = runImport([
    dora({ name: 'Mile High Barbers LLC', city: 'DENVER', license_number: '1' }),
    dora({ name: 'Mile High Barbers', city: 'Denver', license_number: '2' }), // same name+city+ZIP: duplicate candidate
    dora({ name: 'Mile High Barbers', city: 'Denver', zip_code: '80220', license_number: '3' }), // another ZIP: separate branch
    dora({ name: 'Bee Smooth LLC', city: 'Aurora', license_number: '4' }),
    dora({ name: 'Empire Beauty School', city: 'Aurora', license_number: '5' }),
    dora({ name: 'Old Nail Spa', city: 'Aurora', license_number: '6', licensing_status: 'Expired' }),
    dora({ name: 'Polished Nail Salon', city: 'Thornton', license_number: '7', zip_code: '80241' }),
    osm({ name: 'Glow Tattoo', city: 'Pueblo', category: 'tattoo', website_url: 'https://glow.example/', source_url: 'https://www.openstreetmap.org/node/9' }),
    osm({ name: 'Quiet Tattoo', city: 'Pueblo', category: 'tattoo', website_url: 'https://quiet.example/', source_url: 'https://www.openstreetmap.org/node/10' }),
    osm({ name: 'Nowhere Nails', city: '', category: 'nails', website_url: '', source_url: 'https://www.openstreetmap.org/node/11' }),
  ], [{ id: 33, name: 'Polished Nail Salon', city: 'Thornton', state: 'CO', zip_code: '', owner_user_id: null, claim_status: 'unclaimed' }],
  { 'https://glow.example/': { status: 'live' }, 'https://quiet.example/': { status: 'blocked' } });

  assert.deepEqual(r.publish.map((x) => x.name + '|' + x.zip_code).sort(), ['Glow Tattoo|', 'Mile High Barbers|80202', 'Mile High Barbers|80220']);
  assert.equal(r.publish.find((x) => x.name === 'Glow Tattoo').website_url, 'https://glow.example/');
  assert.ok(r.publish.every((x) => x.operational_status === 'verified' && x.categories.length));
  const reasons = Object.fromEntries(r.review.map((x) => [x.name, x.reason]));
  assert.equal(reasons['Bee Smooth'], 'no_category_evidence_in_name');
  assert.equal(reasons['Empire Beauty School'], 'school_or_training_facility');
  assert.equal(reasons['Old Nail Spa'], 'license_not_active');
  assert.equal(reasons['Quiet Tattoo'], 'osm_website_not_confirmed_live');
  assert.equal(reasons['Nowhere Nails'], 'missing_city');
  assert.deepEqual(r.skipped.map((x) => x.reason).sort(), ['duplicate_candidate', 'existing_shop']);
  assert.deepEqual(r.enrich, [{ id: 33, zip_code: '80241', license_number: 'REG.7', website_url: '', categories: ['nail_technician'], source_external_id: 'dora:REG:7' }]);
});

test('generated SQL is unclaimed, ownerless and guarded against duplicates', () => {
  const { sql } = runImport([dora({ name: "O'Neil's Barber Shop", city: 'Denver', license_number: '42' })], []);
  assert.match(sql, /SELECT NULL, name/);
  assert.match(sql, /'unclaimed'/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM shops s WHERE s\.source_external_id = i\.source_external_id\)/);
  assert.match(sql, /s\.license_number = i\.license_number/);
  assert.match(sql, /O''Neil''s Barber Shop/);
  assert.doesNotMatch(sql, /\b(DELETE|DROP|TRUNCATE)\b/);
});

test('search route includes category-tagged shops and hides closed ones', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  assert.match(src, /EXISTS \(SELECT 1 FROM shop_categories sc WHERE sc\.shop_id = shops\.id AND sc\.category = \?\)/);
  assert.match(src, /operational_status,'uncertain'\) <> 'closed'/);
  assert.doesNotMatch(src, /if \(category \|\| resultType === 'professionals'\) businesses = \[\]/);
});
