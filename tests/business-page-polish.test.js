'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Rendering behavior is covered end to end in business-profile.test.js; this guards the mobile essentials.
test('business pages are mobile friendly and connect customers to professionals', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'lib', 'shop-profile-view.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'shop-profile.css'), 'utf8');
  assert.match(view, /profile_photo_url/);
  assert.match(view, /href="\/pro\/\$\{Number\(p\.id\)\}"/, 'team cards link to each professional profile');
  assert.match(view, /Book<span class="sp-long"> an appointment/);
  assert.match(view, /class="sp-actionbar"/, 'mobile quick actions');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.sp-actionbar \{ display: flex;/);
  assert.match(css, /\.sp-team \{ grid-template-columns: 1fr; \}/);
});
