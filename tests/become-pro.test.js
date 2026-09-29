'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('customer to professional conversion asks for and persists a real service category', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'become-pro.js'), 'utf8');
  assert.match(src, /What type of professional are you\?/);
  assert.match(src, /name="category" required/);
  assert.match(src, /CATEGORY_VALUES\.has\(selectedCategory\)/);
  assert.match(src, /INSERT INTO pro_categories/);
  assert.match(src, /LEGACY_CATEGORY\.has\(selectedCategory\) \? selectedCategory : 'barber'/);
  assert.doesNotMatch(src, /businessName,\s*'barber',\s*'',\s*'',\s*'CO'/);
  assert.match(src, /datetime\('now','\+30 days'\)/);
  assert.match(src, /\/dashboard\/pro\/onboarding/);
});
