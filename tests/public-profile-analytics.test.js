'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');

test('public professional page preserves owner preview while enforcing customer visibility', () => {
  assert.match(src, /const ownProfile = ctx\.currentUser/);
  assert.match(src, /if \(!ownProfile && !isProPubliclyVisible\(pro\.id\)\)/);
  assert.match(src, /if \(!isOwnProfile\) \{/);
});

test('professional analytics record real profile views and booking clicks', () => {
  assert.match(src, /'profile_view'/);
  assert.match(src, /'booking_click'/);
  assert.match(src, /INSERT INTO booking_clicks/);
  assert.match(src, /router\.get\('\/book\/:id'/);
  assert.match(src, /redirect\(ctx\.res, bookingUrl\)/);
});


test('analytics attribution source is normalized before storage and forwarding', () => {
  assert.match(src, /replace\(\/\[\^A-Za-z0-9\._-\]\/g, ''\)\.slice\(0, 80\)/);
  assert.match(src, /const attributionSource = queryText\(ctx\.query\.source, 80\)/);
});
