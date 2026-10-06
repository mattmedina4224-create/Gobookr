'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { inspect, audit } = require('../scripts/audit-booking-destinations');
function response(status, location) { return { status, headers: new Headers(location ? { location } : {}), body: null }; }
test('booking audit rejects missing/directory/unsafe URLs without network calls', async () => {
  const fail = () => { throw Error('must not fetch'); };
  assert.equal((await inspect('', fail)).status, 'missing_booking');
  assert.equal((await inspect('https://booksy.com/en-us/s/barber-shop/134761_denver', fail)).status, 'generic_directory');
  for (const url of ['http://127.0.0.1/', 'https://booksy.com.attacker.test/', 'https://user:password@booksy.com/profile', 'javascript:alert(1)']) assert.equal((await inspect(url, fail)).status, 'manual_review_unsupported_or_unsafe_url');
});
test('booking audit records deleted redirects and provider blocks without calling them working/dead', async () => {
  assert.equal((await inspect('https://booksy.com/en-us/123_fixture', async () => response(302, '/en-us/s/massage/134761_denver?do=showBusinessDeletedModal'))).status, 'deleted_business_redirect');
  assert.equal((await inspect('https://booksy.com/en-us/123_fixture', async () => response(403))).status, 'access_blocked_not_dead');
  assert.equal((await inspect('https://booksy.com/en-us/123_fixture', async () => response(200))).status, 'reachable_unverified');
  assert.equal((await inspect('https://booksy.com/en-us/123_fixture', async () => response(302, 'http://127.0.0.1/'))).status, 'manual_review_redirect_outside_approved_hosts');
});
test('booking audit checks shared URLs once, preserves IDs and performs no writes', async () => {
  let calls = 0;
  const result = await audit([{ id: 1, booking_url: 'https://fixture.glossgenius.com/services' }, { id: 2, booking_url: 'https://fixture.glossgenius.com/services' }, { id: 3, booking_url: '' }], async () => { calls++; return response(200); });
  assert.equal(calls, 1); assert.equal(result.counts.reachable_unverified, 2); assert.equal(result.counts.missing_booking, 1); assert.equal(result.production_changes, 0);
});
