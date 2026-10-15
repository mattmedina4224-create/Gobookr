'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');

function database() {
  const worker = new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  const queries = [];
  function call(op, sql, args = []) {
    queries.push({ op, sql, args });
    const signalBuffer = new SharedArrayBuffer(4);
    const { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    assert.notEqual(Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000), 'timed-out');
    const response = receiveMessageOnPort(port1).message;
    port1.close();
    if (response.error) throw Error(response.error);
    return response.value;
  }
  return {
    queries,
    exec: sql => call('exec', sql),
    prepare: sql => ({ get: (...args) => call('get', sql, args), all: (...args) => call('all', sql, args), run: () => { throw Error('Search must not write to the database'); } }),
    close: async () => { call('close', ''); await worker.terminate(); },
  };
}

function load(file, dependencies = {}) {
  const filename = path.join(__dirname, '..', file);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, URL, URLSearchParams, console,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : localRequire(name),
    fetch: () => { throw Error('Search must not geocode on request'); },
  }, { filename });
  return module.exports;
}

const schema = `
CREATE TABLE pro_profiles (
 id INTEGER PRIMARY KEY, user_id INTEGER, claim_status TEXT DEFAULT 'unclaimed',
 business_name TEXT, city TEXT, state TEXT, zip_code TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
 source_url TEXT DEFAULT 'https://booksy.com/test', source_name TEXT DEFAULT 'Booksy',
 onboarding_completed INTEGER DEFAULT 0, professional_handle TEXT, workplace_name TEXT, bio TEXT,
 category TEXT DEFAULT 'barber', accent TEXT DEFAULT 'slate', initials TEXT DEFAULT 'T'
);
CREATE TABLE subscriptions (pro_id INTEGER, status TEXT, trial_ends_at TIMESTAMPTZ, past_due_since TIMESTAMPTZ);
CREATE TABLE pro_categories (pro_id INTEGER, category TEXT);
CREATE TABLE services (id INTEGER, pro_id INTEGER, name TEXT);
CREATE TABLE shops (id INTEGER PRIMARY KEY, name TEXT, city TEXT, state TEXT, zip_code TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, claim_status TEXT);
INSERT INTO pro_profiles (id,business_name,city,state,zip_code,latitude,longitude,bio) VALUES
 (1,'Near fixture','Denver','CO','80202',39.7392,-104.9903,'Razor fades'),
 (2,'Far fixture','Denver','CO','80202',38.8339,-104.8214,'Razor fades'),
 (3,'City fixture','Denver','CO','80202',NULL,NULL,'Razor fades'),
 (4,'Other state fixture','Denver','NC','28037',NULL,NULL,'Razor fades'),
 (5,'Other specialty fixture','Denver','CO','80202',NULL,NULL,'Balayage'),
 (6,'Private fixture','Denver','CO','80202',NULL,NULL,'Razor fades'),
 (7,'No provenance fixture','Denver','CO','80202',NULL,NULL,'Razor fades'),
 (8,'Partial coordinates fixture','Denver','CO','80202',39.73,NULL,'Razor fades'),
 (9,'ZIP fixture','Littleton','CO','80123',NULL,NULL,'Razor fades'),
 (10,'Different ZIP fixture','Littleton','CO','80120',NULL,NULL,'Razor fades');
UPDATE pro_profiles SET user_id=6, claim_status='claimed' WHERE id=6;
UPDATE pro_profiles SET source_url='' WHERE id=7;
INSERT INTO pro_categories SELECT id,'barber' FROM pro_profiles WHERE id<>5;
INSERT INTO pro_categories VALUES (5,'stylist');
INSERT INTO shops VALUES
 (1,'Near business fixture','Denver','CO','80202',39.7392,-104.9903,'unclaimed'),
 (2,'City business fixture','Denver','CO','80202',NULL,NULL,'unclaimed'),
 (3,'Far business fixture','Denver','CO','80202',38.8339,-104.8214,'unclaimed');
`;

function app(db) {
  const geo = load('lib/geo-search.js', { '../db': db });
  const handlers = {};
  let hydrations = 0;
  const util = require('../lib/util');
  load('routes/public.js', {
    '../db': db,
    '../lib/geo-search': geo,
    '../lib/favorites': { favoriteIds: () => new Set(), favoriteControl: () => '' },
    '../lib/following': {},
    '../lib/layout': { layout: ({ body }) => body },
    '../lib/http': { send: (res, html) => { res.body = html; }, flashFromQuery: () => null },
    '../lib/util': util,
    '../lib/subscription': {},
    '../lib/business-team': { enabled: () => false },
    '../lib/pro-listing-data': { hydratePros: rows => { hydrations++; return rows.map(pro => ({ ...pro, services: [], categories: [pro.category], reviewCount: 0, rating: null })); } },
  })({ get: (route, fn) => { handlers[route] = fn; }, post() {} });
  return {
    geo,
    hydrations: () => hydrations,
    search: async query => {
      const res = {};
      await handlers['/search']({ query, res, currentUser: null, session: null });
      return res.body;
    },
  };
}

test('nearby search uses real Postgres predicates, separates city-only rows, and preserves filters', async () => {
  const db = database();
  try {
    db.exec(schema);
    const request = app(db);
    const html = await request.search({ city: 'Denver, CO', category: 'barber', type: 'professionals', q: 'razor fades' });
    const split = html.indexOf('id="city-only-heading"');
    assert.ok(split > 0);
    assert.match(html.slice(0, split), /Near fixture/);
    assert.doesNotMatch(html.slice(0, split), /City fixture|Partial coordinates fixture/);
    assert.match(html.slice(split), /City fixture/);
    assert.match(html.slice(split), /Partial coordinates fixture/);
    assert.match(html, /Distance unavailable/);
    assert.match(html, /may be outside your 5-mile radius/);
    assert.doesNotMatch(html, /Far fixture|Other state fixture|Other specialty fixture|Private fixture|No provenance fixture|business fixture/);
    assert.match(html, /1 result · within 5 miles/);
    assert.match(html, /category=barber/);
    assert.match(html, /q=razor\+fades/);
    assert.equal(request.hydrations(), 1);
    assert.equal(db.queries.filter(q => q.op === 'all' && q.sql.startsWith('SELECT pro_profiles.')).length, 2);

    const zipHtml = await request.search({ city: '80123', type: 'professionals' });
    assert.match(zipHtml, /ZIP fixture/);
    assert.doesNotMatch(zipHtml, /Different ZIP fixture|City fixture/);
    assert.match(zipHtml, /Also listed in 80123/);
    assert.match(zipHtml, /0 results · within 5 miles/);
    assert.doesNotMatch(zipHtml, /0\.0 mi away/);

    const gpsHtml = await request.search({ lat: '39.7392', lon: '-104.9903', city: 'Littleton', type: 'professionals' });
    assert.match(gpsHtml, /Near fixture/);
    assert.doesNotMatch(gpsHtml, /City fixture|ZIP fixture|city-only-heading|Far fixture/);

    const shops = await request.search({ city: 'Denver, Colorado', type: 'businesses', radius: '7' });
    assert.match(shops, /Near business fixture/);
    assert.match(shops, /City business fixture/);
    assert.match(shops, /Distance unavailable/);
    assert.doesNotMatch(shops, /Far business fixture|City fixture/);
    assert.match(shops, /selected>7 mi/);

    const ambiguous = await request.search({ city: 'Denver', type: 'professionals' });
    assert.match(ambiguous, /distance filter has not been applied/);
    assert.doesNotMatch(ambiguous, /within 5 miles/);

    const malicious = await request.search({ city: "Denver' OR 1=1 --, CO", type: 'professionals', q: "' OR 1=1 --" });
    assert.doesNotMatch(malicious, /City fixture|ZIP fixture|Near fixture/);

    // The radius filter must not make network calls or persist anything, even for incomplete addresses.
    const filtered = await request.geo.filterByRadius([{ latitude: null, longitude: null, street_address: '123 test' }],39.7392,-104.9903,5);
    assert.equal(filtered.profiles.length, 0);
  } finally { await db.close(); }
});

test('bounded fallback cannot crowd out distance-confirmed matches', async () => {
  const db = database();
  try {
    db.exec(schema);
    db.exec("INSERT INTO pro_profiles (id,business_name,city,state) SELECT 100+n,'Bulk fixture '||n,'Denver','CO' FROM generate_series(1,60) n;");
    const request = app(db);
    const html = await request.search({ city: 'Denver, CO', type: 'professionals' });
    assert.match(html, /Near fixture/);
    assert.equal((html.match(/<h3>Bulk fixture/g) || []).length, 50);
    assert.match(html, /50 city\/ZIP-only matches shown/);
  } finally { await db.close(); }
});
