'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDirectory, parseProfile, isBookingHost, audit } = require('../scripts/audit-modern-salonstudios');

const directory = '<div id="post-5" class="et_pb_portfolio_item project_category_hair project_category_color">' +
  '<a href="https://modernsalonstudios.com/project/example/">image</a>' +
  '<h2 class="et_pb_module_header"><a href="https://modernsalonstudios.com/project/example/">Casey – Example Studio</a></h2>' +
  '</div>';
const detail = '<h4>Casey Person</h4><p>Indian Tree Location – Suite #121</p>' +
  '<a href="https://casey.glossgenius.com/">Book Now</a>' +
  '<a href="https://www.example.com/">Website</a>';

test('parses actual style of portfolio cards without duplicating links', () => {
  const cards = parseDirectory(directory + directory);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].post_id, '5');
  assert.deepEqual(cards[0].source_tags, ['hair', 'color']);
});
test('maps evidenced professional categories and the studio address', () => {
  const profile = parseProfile(parseDirectory(directory)[0], detail);
  assert.equal(profile.professional_name, 'Casey Person');
  assert.equal(profile.city, 'Arvada');
  assert.equal(profile.suite, 'Suite 121');
  assert.deepEqual(profile.categories, ['colorist', 'stylist']);
  assert.deepEqual(profile.published_booking_links.map((x) => x.url), ['https://casey.glossgenius.com/']);
  assert.equal(profile.review_reason, null);
});
test('does not accept generic websites as booking links', () => {
  assert.equal(isBookingHost('https://salon.example.com/'), false);
  assert.equal(isBookingHost('https://booking.glossgenius.com.evil.example/'), false);
  assert.equal(isBookingHost('http://casey.glossgenius.com/'), false);
  assert.equal(isBookingHost('https://casey.glossgenius.com/'), true);
});
test('never silently creates a booking URL for contact-only profiles', () => {
  const profile = parseProfile(parseDirectory(directory)[0], '<h4>Casey Person</h4><p>DTC Location – Studio #105</p><a href="tel:3035550100">Call</a>');
  assert.deepEqual(profile.published_booking_links, []);
  assert.equal(profile.review_reason, 'no_published_booking_platform_link');
});
test('audit supports a controlled fetcher without production side effects', async () => {
  const report = await audit(async (url) => url.endsWith('/beautypros/') ? directory : detail);
  assert.equal(report.total_professional_pages, 1);
  assert.equal(report.candidates_with_booking_links, 1);
  assert.equal(report.requiring_review, 0);
});
