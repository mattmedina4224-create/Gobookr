'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rows = require('../data/imports/co-sola-castle-rock-hair-20261117.json');
const { isApprovedBookingSource, identifyBookingPlatform } = require('../lib/booking-platforms');

test('Sola hair/barber intake is sourced, distinct and safe', () => {
  assert.equal(rows.length, 26);
  assert.equal(new Set(rows.map(row => row.booking_url)).size, rows.length);
  for (const row of rows) {
    assert.ok(row.name && row.workplace_name);
    assert.equal(row.city, 'Castle Rock');
    assert.equal(row.state, 'CO');
    assert.equal(row.zip, '80108');
    assert.ok(['stylist', 'barber'].includes(row.category));
    assert.equal(row.source_url, row.booking_url);
    assert.match(row.booking_url, /^https:\/\/book\.solasalonstudios\.com\/[a-z0-9-]+\/pro$/);
    assert.ok(isApprovedBookingSource(row.source_url));
    assert.equal(identifyBookingPlatform(row.source_url).id, 'sola-vagaro');
  }
  assert.equal(rows.filter(row => row.category === 'barber' || row.additional_categories?.includes('barber')).length, 6);
});

test('Sola import does not fabricate account or license fields', () => {
  for (const row of rows) {
    assert.equal(Object.hasOwn(row, 'user_id'), false);
    assert.equal(Object.hasOwn(row, 'license_verified'), false);
    assert.equal(Object.hasOwn(row, 'rating'), false);
    assert.equal(Object.hasOwn(row, 'profile_photo_url'), false);
  }
});
