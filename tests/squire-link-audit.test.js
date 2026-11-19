'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditLinks, classify, parseRobots, isAllowed } = require('../scripts/audit-squire-links');

const base = 'https://getsquire.com/discover/barbershop/shop-a/barber/';
const links = ['ok-one', 'gone', 'moved', 'ok-two'].map((s, i) => ({ id: i + 1, url: base + s }));
const noSleep = async () => {};

function fakeFetch(statusFor, robots = { status: 200, text: 'User-agent: *\nDisallow: /admin\n' }) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/robots.txt')) return { status: robots.status, text: async () => robots.text, headers: { get: () => null } };
    const status = statusFor(url);
    if (status instanceof Error) throw status;
    return { status, headers: { get: (h) => (h === 'location' && status >= 300 && status < 400 ? 'https://getsquire.com/elsewhere' : null) }, body: { cancel: async () => {} } };
  };
  fn.calls = calls;
  return fn;
}

test('classifies statuses without treating blocks as broken links', () => {
  assert.equal(classify(200), 'ok');
  assert.equal(classify(301), 'redirected');
  assert.equal(classify(404), 'removed');
  assert.equal(classify(410), 'removed');
  assert.equal(classify(403), 'access_denied');
  assert.equal(classify(429), 'access_denied');
  assert.equal(classify(503), 'error');
});

test('flags removed and redirected links for review and never deletes anything', async () => {
  const f = fakeFetch((u) => (u.endsWith('gone') ? 410 : u.endsWith('moved') ? 301 : 200));
  const r = await auditLinks(links, { fetch: f, sleep: noSleep });
  assert.equal(r.robots, 'honored');
  assert.deepEqual(r.totals, { ok: 2, removed: 1, redirected: 1 });
  assert.deepEqual(r.review.map((x) => x.status).sort(), ['redirected', 'removed']);
  assert.equal(r.review.find((x) => x.status === 'redirected').location, 'https://getsquire.com/elsewhere');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'audit-squire-links.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]\.\.\/db/);
  assert.doesNotMatch(src, /\b(DELETE|UPDATE|INSERT)\s/);
});

test('sends one request at a time with a descriptive user agent and no redirect following', async () => {
  const f = fakeFetch(() => 200);
  const waits = [];
  await auditLinks(links, { fetch: f, sleep: async (ms) => waits.push(ms), delayMs: 2500 });
  const pageCalls = f.calls.filter((c) => !c.url.endsWith('/robots.txt'));
  assert.equal(pageCalls.length, 4);
  assert.ok(pageCalls.every((c) => /GoBookrLinkAudit/.test(c.opts.headers['User-Agent']) && c.opts.redirect === 'manual'));
  assert.deepEqual(waits, [2500, 2500, 2500]);
});

test('stops the run on repeated access denials instead of working around them', async () => {
  const f = fakeFetch(() => 403);
  const r = await auditLinks(links, { fetch: f, sleep: noSleep, stopAfterDenied: 2 });
  assert.equal(f.calls.filter((c) => !c.url.endsWith('/robots.txt')).length, 2);
  assert.equal(r.totals.access_denied, 2);
  assert.equal(r.totals.not_checked, 2);
  assert.match(r.stopped_reason, /consecutive HTTP 403/);
});

test('requests nothing when robots.txt itself is refused', async () => {
  const f = fakeFetch(() => 200, { status: 403, text: '' });
  const r = await auditLinks(links, { fetch: f, sleep: noSleep });
  assert.equal(f.calls.length, 1);
  assert.equal(r.totals.not_checked, 4);
  assert.equal(r.robots, 'access_denied');
});

test('honors robots.txt disallow rules', async () => {
  const f = fakeFetch(() => 200, { status: 200, text: 'User-agent: *\nDisallow: /discover/barbershop/shop-a/barber/gone\n' });
  const r = await auditLinks(links, { fetch: f, sleep: noSleep });
  assert.equal(r.results.find((x) => x.url.endsWith('gone')).status, 'skipped_robots');
  assert.ok(!f.calls.some((c) => c.url.endsWith('gone')));
  const rules = parseRobots('User-agent: *\nDisallow: /discover/\nAllow: /discover/barbershop/\n');
  assert.equal(isAllowed(rules, '/discover/barbershop/x/barber/y'), true);
  assert.equal(isAllowed(rules, '/discover/united-states'), false);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:\n'), '/anything'), true);
});

test('retries a transient error once, then records it for review', async () => {
  let n = 0;
  const f = fakeFetch((u) => (u.endsWith('ok-one') ? (++n === 1 ? new Error('ECONNRESET') : 200) : u.endsWith('gone') ? 503 : 200));
  const r = await auditLinks(links, { fetch: f, sleep: noSleep });
  assert.equal(r.results[0].status, 'ok');
  assert.equal(r.results[0].attempts, 2);
  assert.equal(r.results[1].status, 'error');
  assert.equal(r.results[1].attempts, 2);
});

test('committed seed holds only individual SQUIRE barber links', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'source-audits', 'squire-booking-links.json'), 'utf8'));
  assert.equal(seed.links.length, seed.count);
  assert.ok(seed.links.every((l) => /^https:\/\/getsquire\.com\/(discover\/barbershop|booking\/book)\/[a-z0-9-]+\/barber\//.test(l.url)));
  assert.equal(new Set(seed.links.map((l) => l.url)).size, seed.links.length);
});

test('weekly workflow is scheduled, read-only and separate from the web app', () => {
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'squire-link-audit.yml'), 'utf8');
  assert.match(wf, /schedule:\s*\n\s*- cron:/);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
  assert.match(wf, /scripts\/audit-squire-links\.js/);
  assert.doesNotMatch(wf, /DATABASE_URL|SUPABASE/);
});
