'use strict';

// Weekly read-only audit of GoBookr's EXISTING SQUIRE booking links.
// Usage: node scripts/audit-squire-links.js data/source-audits/squire-booking-links.json --output=tmp/squire-link-audit.json
//
// What it does:
//   * Requests each already-imported SQUIRE booking URL once, one at a time, with a pause between requests.
//   * Honors robots.txt, identifies itself with a descriptive User-Agent, and stops the whole run as soon as
//     SQUIRE starts refusing requests (401/403/429) instead of retrying around the block.
//   * Classifies each link and lists anything that needs a human look. It never deletes, edits or hides a
//     profile and never writes to the database; a 403/429 is recorded as "access denied", not as broken.
// What it does not do: discover new professionals, crawl directory pages, or judge appointment availability.
const fs = require('node:fs');
const path = require('node:path');

const USER_AGENT = 'GoBookrLinkAudit/1.0 (+https://gobookr.com; weekly check of existing booking links)';
const ORIGIN = 'https://getsquire.com';
const LINK = /^https:\/\/getsquire\.com\/(?:discover\/barbershop|booking\/book)\/[a-z0-9-]+\/barber\/[a-z0-9-]+(?:\/services)?$/i;

function classify(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirected';
  if (status === 404 || status === 410) return 'removed';
  if (status === 401 || status === 403 || status === 429) return 'access_denied';
  return 'error';
}

// Minimal robots.txt reader: rules for "User-agent: *" (and our own token), longest match wins.
function parseRobots(text) {
  const groups = []; let current = null; let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) continue;
    const field = m[1].toLowerCase(); const value = m[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (current && (field === 'allow' || field === 'disallow')) current.rules.push({ allow: field === 'allow', path: value });
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== '*' && USER_AGENT.toLowerCase().includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== ''); // "Disallow:" with no path allows everything
}
function isAllowed(rules, urlPath) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const pattern = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (pattern.test(urlPath) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

async function request(fetchImpl, url, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
    try { if (res.body && typeof res.body.cancel === 'function') await res.body.cancel(); } catch (_) { /* body not needed */ }
    return { status: res.status, location: res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null };
  } finally { clearTimeout(timer); }
}

async function auditLinks(links, opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const delayMs = opts.delayMs ?? 3000; const timeoutMs = opts.timeoutMs ?? 15000;
  const stopAfterDenied = opts.stopAfterDenied ?? 3; const max = opts.max ?? Infinity;
  const report = { checked_at: (opts.now || new Date()).toISOString(), user_agent: USER_AGENT, robots: 'not_checked', stopped_reason: null, totals: {}, results: [] };
  const finish = () => { for (const r of report.results) report.totals[r.status] = (report.totals[r.status] || 0) + 1; report.review = report.results.filter((r) => !['ok', 'not_checked', 'skipped_robots'].includes(r.status)); return report; };
  const remaining = (from, status) => { for (const l of links.slice(from)) report.results.push({ id: l.id, url: l.url, status }); };

  let rules = [];
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetchImpl(ORIGIN + '/robots.txt', { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': USER_AGENT } }).finally(() => clearTimeout(timer));
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      report.robots = 'access_denied'; report.stopped_reason = `robots.txt returned HTTP ${res.status}; SQUIRE is refusing automated requests from this runner, so no links were requested.`;
      remaining(0, 'not_checked'); return finish();
    }
    if (res.status >= 200 && res.status < 300) { rules = parseRobots(await res.text()); report.robots = 'honored'; }
    else report.robots = `unavailable_http_${res.status}`; // 404 etc.: no rules published
  } catch (e) { report.robots = 'unreachable'; report.stopped_reason = 'robots.txt could not be fetched (' + (e.name || 'error') + '); no links were requested.'; remaining(0, 'not_checked'); return finish(); }

  let denied = 0;
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (i >= max) { remaining(i, 'not_checked'); report.stopped_reason = `stopped after the configured maximum of ${max} links`; break; }
    if (!LINK.test(link.url)) { report.results.push({ id: link.id, url: link.url, status: 'invalid_url' }); continue; }
    if (!isAllowed(rules, new URL(link.url).pathname)) { report.results.push({ id: link.id, url: link.url, status: 'skipped_robots' }); continue; }
    if (i > 0) await sleep(delayMs);
    let outcome; let attempts = 0;
    while (true) {
      attempts += 1;
      try { const r = await request(fetchImpl, link.url, timeoutMs); outcome = { http_status: r.status, status: classify(r.status), location: r.location || undefined }; }
      catch (e) { outcome = { http_status: null, status: 'error', error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) }; }
      if (outcome.status === 'error' && attempts < 2) { await sleep(Math.max(delayMs * 3, 10000)); continue; }
      break;
    }
    report.results.push({ id: link.id, url: link.url, ...outcome, attempts });
    denied = outcome.status === 'access_denied' ? denied + 1 : 0;
    if (denied >= stopAfterDenied) {
      report.stopped_reason = `stopped after ${denied} consecutive HTTP ${outcome.http_status} responses; SQUIRE is refusing automated requests, so the audit did not continue or retry.`;
      remaining(i + 1, 'not_checked'); break;
    }
  }
  return finish();
}

function summaryMarkdown(report) {
  const t = report.totals; const line = (k, label) => `| ${label} | ${t[k] || 0} |`;
  return [
    '## SQUIRE booking link audit', '', `Checked at ${report.checked_at}. robots.txt: ${report.robots}.`, report.stopped_reason ? `\n**Stopped early:** ${report.stopped_reason}\n` : '',
    '| Result | Links |', '|---|---|', line('ok', 'Reachable (2xx)'), line('redirected', 'Redirected (review)'), line('removed', 'Removed 404/410 (review)'),
    line('access_denied', 'Access denied 401/403/429 (not evidence of breakage)'), line('error', 'Errors after one retry (review)'), line('skipped_robots', 'Skipped by robots.txt'), line('not_checked', 'Not checked'), line('invalid_url', 'Not a SQUIRE barber URL (review)'), '',
    'Nothing was deleted or edited. Profiles listed under review need a human decision. A reachable link does not mean an appointment is available.',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const seedPath = args.find((a) => !a.startsWith('--')) || 'data/source-audits/squire-booking-links.json';
  const opt = (name, fallback) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : fallback; };
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const links = Array.isArray(seed) ? seed : seed.links;
  const report = await auditLinks(links, { delayMs: Number(opt('delay-ms', 3000)), max: Number(opt('max', Infinity)), stopAfterDenied: Number(opt('stop-after-denied', 3)) });
  report.seed = { path: seedPath, exported_at: seed.exported_at || null, count: links.length };
  const output = opt('output', 'tmp/squire-link-audit.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 1));
  const md = summaryMarkdown(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log(md);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { auditLinks, classify, parseRobots, isAllowed, summaryMarkdown, USER_AGENT };
