'use strict';

// Opening flow regression suite: customer discovery, pro publishing, Story Maker, and analytics.

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
  assert.match(src, /View customer page/);
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


test('publishing fresh availability replaces stale live opening posts', () => {
  const src = read('routes/pro.js');
  const closePrevious = /UPDATE marketing_campaigns SET status = 'closed' WHERE pro_id = \?[^\n]+campaign_type IN \('openings-today','last-minute'\)/g;
  assert.ok((src.match(closePrevious) || []).length >= 2);
});


test('publishing a fresh opening closes older live opening posts for that pro', () => {
  const src = read('routes/pro.js');
  const closeOld = /UPDATE marketing_campaigns SET status = 'closed' WHERE pro_id = \?[^\n]+status = 'published'[^\n]+campaign_type IN \('openings-today','last-minute'\)/g;
  assert.ok((src.match(closeOld) || []).length >= 2);
  assert.match(src, /id != \?/);
});


test('pro analytics separates tracked Openings Today impact', () => {
  const src = read('routes/pro.js');
  assert.match(src, /source IN \('openings-today','profile-opening'\)/);
  assert.match(src, /Openings Today impact/);
  assert.match(src, /Opening-driven profile views/);
  assert.match(src, /Opening booking clicks/);
});


test('Openings Today reports real posted-time totals', () => {
  const src = read('routes/public.js');
  assert.match(src, /const openingCount = visible\.reduce/);
  assert.match(src, /posted \$\{openingCount === 1 \? 'time' : 'times'\}/);
});

test('dashboard turns a live opening into a sharing action', () => {
  const src = read('routes/pro.js');
  assert.match(src, /else if \(liveOpenings\) nextAction/);
  assert.match(src, /cta: 'Share today’s openings'/);
});


test('analytics measures opening-driven booking intent without claiming completed appointments', () => {
  const src = read('routes/pro.js');
  assert.match(src, /source IN \('openings-today','profile-opening'\)/);
  assert.match(src, /const openingRate = openingViews \?/);
  assert.match(src, /Opening view → click/);
  assert.match(src, /Your openings are creating booking intent/);
  assert.match(src, /A booking click shows intent, not a completed appointment/);
});


test('opening analytics reports booking intent and conversion rate', () => {
  const src = read('routes/pro.js');
  assert.match(src, /openingTotals = db\.prepare/);
  assert.match(src, /source IN \('openings-today','profile-opening'\)/);
  assert.match(src, /Opening view → click/);
  assert.match(src, /Your openings are creating booking intent/);
  assert.match(src, /A booking click shows intent, not a completed appointment/);
});


test('opening detail can be shared natively with a clipboard fallback', () => {
  const src = read('routes/public.js');
  assert.match(src, /Share these openings/);
  assert.match(src, /navigator\.share/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /has openings today on GoBookr/);
});

test('live opening controls stay usable on mobile', () => {
  const css = read('public/styles.css');
  assert.match(css, /\.live-opening-banner>div:last-child/);
  assert.match(css, /\.opening-detail-actions/);
});


test('live opening dashboard control center keeps the main actions together', () => {
  const src = read('routes/pro.js');
  assert.match(src, /View customer page/);
  assert.match(src, /Share Story/);
  assert.match(src, />Mark filled</);
  assert.match(src, /\/pro\/\$\{profile\.id\}\/opening/);
});

test('opening detail pages are shareable and have rich social metadata', () => {
  const src = read('routes/public.js');
  assert.match(src, /Share these openings/);
  assert.match(src, /navigator\.share/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /canonical: shareUrl/);
  assert.match(src, /shareImage: pro\.profile_photo_url/);
});


test('Openings Today uses one explicit marketplace day boundary everywhere', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  const currentDateChecks = source.match(/created_at >= CURRENT_DATE/g) || [];
  assert.equal(currentDateChecks.length, 3, 'listing, opening detail, and profile banner must share the same day rule');
});

test('marketing campaign timestamps are timezone-aware before local-day semantics change', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260925040500_marketing_campaigns.sql'), 'utf8');
  assert.match(migration, /created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.match(migration, /scheduled_for TIMESTAMPTZ/);
});


test('Openings Today date semantics remain centralized for a future timezone-safe cutoff', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'public.js'), 'utf8');
  const currentDateUses = (source.match(/created_at >= CURRENT_DATE/g) || []).length;
  assert.equal(currentDateUses, 3, 'public opening surfaces should stay aligned until the cutoff becomes timezone-aware');
});
