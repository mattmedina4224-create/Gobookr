'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const categories = require('../lib/pro-categories');
const { entries } = require('../lib/service-catalog');
test('remaining Sola beauty categories are exposed and labeled', () => {
 for (const [value, label] of [
   ['waxing_specialist', 'Waxing Specialist'],
   ['esthetician', 'Esthetician'],
   ['permanent_makeup_artist', 'Permanent Makeup Artist'],
   ['threading_specialist', 'Threading Specialist'],
   ['makeup_artist', 'Makeup Artist']
 ]) {
   assert.ok(categories.PROFESSIONAL_CATEGORY_VALUES.has(value), value);
   assert.equal(categories.categoryLabel(value), label);
 }
});
test('skin care, permanent makeup and threading keywords remain searchable', () => {
 for (const [group, label] of [['esthetician', 'Custom facial'], ['permanent_makeup_artist', 'Lip blush'], ['threading_specialist', 'Facial threading']]) {
  assert.ok(entries.some(entry => entry.category === group && entry.label === label));
 }
});
test('new specialty categories are linked from homepage discovery', () => {
 const html = fs.readFileSync(path.join(__dirname,'../routes/home.js'),'utf8');
 for (const cat of ['esthetician','permanent_makeup_artist','threading_specialist']) {
  assert.ok(html.includes('/search?category='+cat), cat);
 }
});
