'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('makeup and weddings are customer-searchable categories', () => {
  const catalog = require('../lib/pro-categories');
  assert.equal(catalog.categoryPlural('makeup_artist'), 'Makeup Artists');
  assert.equal(catalog.categoryPlural('wedding_services'), 'Weddings');
  for (const file of ['routes/public.js', 'routes/home.js']) {
    assert.match(read(file), /PROFESSIONAL_CATEGORIES/);
  }
});

test('new professionals can select makeup and weddings alongside their main profession', () => {
  const src = read('routes/auth.js');
  const catalog = require('../lib/pro-categories');
  assert.ok(catalog.PROFESSIONAL_CATEGORY_VALUES.has('makeup_artist'));
  assert.ok(catalog.PROFESSIONAL_CATEGORY_VALUES.has('wedding_services'));
  assert.match(src, /PROFESSIONAL_CATEGORIES: PRO_CATEGORIES/);
  assert.match(src, /Hairstylist \+ Makeup Artist \+ Weddings/);
  assert.match(src, /for \(const category of categories\) addCategory\.run\(proId, category\)/);
});

test('existing professionals can manage multiple searchable specialties', () => {
  const src = read('routes/pro.js');
  assert.match(src, /router\.post\('\/dashboard\/pro\/categories'/);
  assert.match(src, /Hairstylist \+ Makeup Artist \+ Weddings/);
  assert.match(src, /DELETE FROM pro_categories WHERE pro_id = \?/);
  assert.match(src, /for \(const category of selected\) addCategory\.run\(profile\.id, category\)/);
  assert.match(src, /Select at least one service or specialty/);
  assert.match(src, /BEGIN IMMEDIATE/);
  assert.match(src, /ROLLBACK/);
});

test('inventory tooling recognizes the canonical marketplace categories', () => {
  const catalog = require('../lib/pro-categories');
  assert.ok(catalog.PROFESSIONAL_CATEGORY_VALUES.has('makeup_artist'));
  assert.ok(catalog.PROFESSIONAL_CATEGORY_VALUES.has('wedding_services'));
  for (const file of ['scripts/import-unclaimed-profiles.js', 'scripts/audit-imported-profiles.js']) {
    assert.match(read(file), /PROFESSIONAL_CATEGORY_VALUES/);
  }
});


test('public profile badges use friendly specialty labels', () => {
  const src = read('lib/util.js');
  assert.match(src, /makeup_artist: 'Makeup Artist'/);
  assert.match(src, /wedding_services: 'Weddings'/);
});


test('specialty editor does not nest forms and remains independently submittable', () => {
  const src = read('routes/pro.js');
  assert.match(src, /id="profile-categories-form" method="POST" action="\/dashboard\/pro\/categories"/);
  assert.match(src, /form="profile-categories-form"/);
  assert.doesNotMatch(src, /<form method="POST" action="\/dashboard\/pro\/categories"><input/);
});

test('professional dashboard uses authoritative multi-category labels instead of legacy category', () => {
  const src = read('routes/pro.js');
  assert.match(src, /dashboardCategories = db\.prepare\('SELECT category FROM pro_categories WHERE pro_id = \? ORDER BY category'\)/);
  assert.match(src, /dashboardCategories\.map\(slugCategory\)\.join\(' · '\)/);
  assert.doesNotMatch(src, /Your public profile<\/h3><p>\$\{escapeHtml\(profile\.business_name\)\} · \$\{slugCategory\(profile\.category\)\}/);
});

test('specialty editor stacks cleanly on phones', () => {
  const src = read('public/styles.css');
  assert.match(src, /\.profile-category-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px\}/);
  assert.match(src, /@media\(max-width:640px\)[\s\S]*\.profile-category-grid\{grid-template-columns:1fr\}/);
  assert.match(src, /\.profile-category-save\{width:100%;min-height:50px\}/);
});


test('marketplace cards show multiple specialties instead of only the legacy category', () => {
  const src = read('routes/public.js');
  assert.match(src, /specialties\.slice\(0, 3\)/);
  assert.match(src, /class="market-specialties"/);
  assert.match(src, /market-specialty-more/);
});

test('homepage exposes makeup weddings and massage as direct discovery paths', () => {
  const src = read('routes/home.js');
  assert.match(src, /search\?category=massage_therapist">Massage Therapists/);
  assert.match(src, /search\?category=makeup_artist">Makeup Artists/);
  assert.match(src, /search\?category=wedding_services">Weddings/);
  assert.match(src, /\(pro\.categories \|\| \[\]\)\.slice\(0, 3\)\.map\(slugCategory\)/);
});

test('multi-specialty discovery remains readable on mobile', () => {
  const src = read('public/styles.css');
  assert.match(src, /\.market-specialties\{[^}]*font-weight:750/);
  assert.match(src, /@media\(max-width:640px\)[\s\S]*\.home-pro-specialties\{white-space:normal;overflow-wrap:anywhere\}/);
});

test('local SEO discovery is category-driven so secondary specialties get their own pages', () => {
  const publicSrc = read('routes/public.js');
  const serverSrc = read('server.js');
  assert.match(publicSrc, /EXISTS \(SELECT 1 FROM pro_categories pc WHERE pc\.pro_id = pro_profiles\.id AND pc\.category = \?\)/);
  assert.match(serverSrc, /JOIN pro_categories pc ON pc\.pro_id=p\.id/);
  assert.match(serverSrc, /pc\.category/);
});


test('all professional flows share one canonical category catalog', () => {
  const catalog = read('lib/pro-categories.js');
  assert.match(catalog, /makeup_artist/);
  assert.match(catalog, /wedding_services/);
  assert.match(catalog, /kind: 'specialty'/);
  for (const file of ['routes/auth.js','routes/public.js','routes/home.js','routes/pro.js','routes/become-pro.js','lib/inventory-discovery.js','scripts/import-unclaimed-profiles.js','scripts/audit-imported-profiles.js']) {
    assert.match(read(file), /pro-categories/);
  }
});

test('inventory docs forbid duplicate profiles for secondary specialties', () => {
  const src = read('docs/state-inventory-imports.md');
  assert.match(src, /makeup_artist/);
  assert.match(src, /wedding_services/);
  assert.match(src, /never create a duplicate profile solely to represent an additional specialty/);
});


test('category catalog has unique slugs and exactly one definition for new specialties', () => {
  const { PROFESSIONAL_CATEGORIES, PROFESSIONAL_CATEGORY_VALUES } = require('../lib/pro-categories');
  assert.equal(PROFESSIONAL_CATEGORIES.length, 11);
  assert.equal(PROFESSIONAL_CATEGORY_VALUES.size, PROFESSIONAL_CATEGORIES.length);
  assert.equal(PROFESSIONAL_CATEGORIES.filter((item) => item.value === 'makeup_artist').length, 1);
  assert.equal(PROFESSIONAL_CATEGORIES.filter((item) => item.value === 'wedding_services').length, 1);
  assert.equal(PROFESSIONAL_CATEGORIES.find((item) => item.value === 'makeup_artist').kind, 'specialty');
  assert.equal(PROFESSIONAL_CATEGORIES.find((item) => item.value === 'wedding_services').kind, 'specialty');
});
