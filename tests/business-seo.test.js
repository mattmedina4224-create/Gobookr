'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('business pages publish local business SEO data', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shop-profile-view.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'shops.js'), 'utf8');
  assert.match(view, /'HealthAndBeautyBusiness'/);
  assert.match(view, /'@type': 'PostalAddress'/);
  assert.match(view, /telephone: shop\.phone/);
  assert.match(view, /OpeningHoursSpecification/);
  assert.match(route, /canonical: shopUrl/);
  assert.match(route, /structuredData: structuredData\(shop, profile, full\)/);
});
