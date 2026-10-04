'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { installPublicAnalytics } = require('../lib/public-analytics');
function exercise(pathname, overrides = {}) {
  const res = new EventEmitter(); res.statusCode = overrides.status || 200;
  res.getHeader = () => overrides.contentType || 'text/html; charset=utf-8';
  const ctx = { req: { method: overrides.method || 'GET', headers: overrides.headers || {} }, res,
    query: overrides.query || {}, analyticsSearchResults: overrides.count };
  const events = [];
  installPublicAnalytics(ctx, pathname, { log: value => events.push(JSON.parse(value)), environment: 'preview' });
  assert.equal(events.length, 0, 'no event before successful response finishes');
  res.emit('finish'); res.emit('finish');
  return events;
}
test('visit/search events fire once, carry actual result count and omit private inputs', () => {
  const events = exercise('/search', { count: 2, query: { category: 'massage_therapist', type: 'professionals', city: 'private-location', q: 'private-name', lat: '39.12345', lon: '-104.12345', token: 'secret-token' } });
  assert.deepEqual(events.map(x => x.event), ['visit', 'search']);
  assert.equal(events[1].result_count, 2); assert.equal(events[1].category, 'massage_therapist');
  assert.equal(events[0].request_id, events[1].request_id); assert.equal(events[1].environment, 'preview');
  assert.doesNotMatch(JSON.stringify(events), /private-location|private-name|39\.12345|104\.12345|secret-token/);
});
test('opt-out, prefetch, obvious bots, errors, non-HTML, private routes and POST do not count', () => {
  for (const overrides of [{ headers: { dnt: '1' } }, { headers: { 'sec-gpc': '1' } }, { headers: { purpose: 'prefetch' } }, { headers: { 'user-agent': 'Googlebot' } }, { status: 404 }, { status: 500 }, { contentType: 'application/json' }, { method: 'POST' }]) assert.deepEqual(exercise('/search', overrides), []);
  for (const route of ['/login', '/signup', '/admin', '/dashboard/pro', '/pro/522/claim', '/__launch-preview']) assert.deepEqual(exercise(route), []);
});
test('zero-results search is recorded, unknown categories normalized and public ids are omitted', () => {
  const search = exercise('/search', { count: 0, query: { category: 'untrusted\nvalue', type: 'invalid' } })[1];
  assert.equal(search.result_count, 0); assert.equal(search.category, 'all'); assert.equal(search.result_type, 'all');
  assert.equal(exercise('/pro/522')[0].route, '/pro/:id');
});
