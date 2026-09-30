'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('pros can publish only real opening campaigns with entered times', () => {
  const src = read('routes/pro.js');
  assert.match(src, /\/dashboard\/pro\/marketing\/campaigns\/:id\/publish-openings/);
  assert.match(src, /campaign_type IN \('openings-today','last-minute'\)/);
  assert.match(src, /Add at least one real open appointment time before publishing/);
  assert.match(src, /SET status = 'published'/);
});

test('customers have a same-day openings discovery page', () => {
  const src = read('routes/public.js');
  assert.match(src, /router\.get\('\/openings'/);
  assert.match(src, /mc\.status = 'published'/);
  assert.match(src, /mc\.created_at >= CURRENT_DATE/);
  assert.match(src, /source=openings-today/);
  assert.match(src, /confirm the time on the professional's booking page/);
});

test('Openings Today is linked globally and responsive', () => {
  const layout = read('lib/layout.js');
  const css = read('public/styles.css');
  assert.match(layout, /href="\/openings">Openings Today/);
  assert.match(css, /\.openings-grid/);
  assert.match(css, /@media\(max-width:760px\)\{\.openings-grid\{grid-template-columns:1fr\}/);
});


test('homepage gives same-day intent a direct path into openings', () => {
  const home = read('routes/home.js');
  const css = read('public/styles.css');
  assert.match(home, /Need something today\?/);
  assert.match(home, /See appointments professionals just opened up/);
  assert.match(home, /href="\/openings"/);
  assert.match(css, /\.home-openings-cta/);
});


test('Openings Today is part of the public SEO surface', () => {
  const server = read('server.js');
  assert.match(server, /https:\/\/gobookr\.com\/openings/);
});


test('customers can narrow openings by service and location', () => {
  const src = read('routes/public.js');
  assert.match(src, /name="category"/);
  assert.match(src, /name="city"/);
  assert.match(src, /EXISTS \(SELECT 1 FROM pro_categories pc WHERE pc\.pro_id = p\.id AND pc\.category = \?\)/);
  assert.match(src, /No openings match that search yet/);
});

test('pros can publish and close same-day openings in one tap', () => {
  const src = read('routes/pro.js');
  assert.match(src, /name="publish_now" value="1">Post openings now/);
  assert.match(src, /campaignStatus = publishNow \? 'published'/);
  assert.match(src, /unpublish-openings/);
  assert.match(src, /SET status = 'closed'/);
  assert.match(src, />Mark filled</);
});

test('Story Maker includes opening-time UX', () => {
  const src = read('routes/pro.js');
  const css = read('public/styles.css');
  assert.match(src, /class="quick-slot"/);
  assert.match(src, /id="marketing-story-slots"/);
  assert.match(src, /storySlotsText\.join/);
  assert.match(css, /\.quick-slot-row/);
});


test('pro dashboard makes live availability obvious and closable', () => {
  const src = read('routes/pro.js');
  const css = read('public/styles.css');
  assert.match(src, /Your openings are live today/);
  assert.match(src, /liveOpenings\.available_slots/);
  assert.match(src, /href="\/openings">View live/);
  assert.match(css, /\.live-opening-banner/);
});


test('opening cards lead to a focused tracked booking path', () => {
  const src = read('routes/public.js');
  assert.match(src, /router\.get\('\/pro\/:id\/opening'/);
  assert.match(src, /See today’s openings/);
  assert.match(src, /\/book\/.*source=openings-today/);
  assert.match(src, /Check availability &amp; book/);
  assert.match(src, /Times are posted by the professional and can change/);
});


test('professional profiles surface genuine same-day availability', () => {
  const src = read('routes/public.js');
  const css = read('public/styles.css');
  assert.match(src, /Profile opening lookup failed/);
  assert.match(src, /status = 'published'.*campaign_type IN \('openings-today','last-minute'\).*created_at >= CURRENT_DATE/s);
  assert.match(src, /class="profile-opening-banner"/);
  assert.match(src, /source=profile-opening/);
  assert.match(src, /Confirm availability when you book/);
  assert.match(css, /\.profile-opening-banner/);
});
