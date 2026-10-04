'use strict';

// Read-only link reachability audit. Never inserts/updates marketplace data,
// retries provider blocks, submits appointments or certifies factual identity.
const fs = require('node:fs');
const PROVIDERS = ['booksy.com', 'glossgenius.com', 'vagaro.com', 'getsquire.com', 'square.site', 'squareup.com', 'joinblvd.com', 'blvd.com', 'mangomint.com', 'zenoti.com', 'booker.com'];
function approvedUrl(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return null;
    if (!PROVIDERS.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) return null;
    url.hash = ''; return url;
  } catch (_) { return null; }
}
function destinationProblem(url) {
  if (/(^|\.)booksy\.com$/i.test(url.hostname)) {
    if (url.searchParams.get('do') === 'showBusinessDeletedModal') return 'deleted_business_redirect';
    if (/^\/en-us\/s\//i.test(url.pathname)) return 'generic_directory';
  }
  return null;
}
async function inspect(raw, fetcher = fetch) {
  if (!String(raw || '').trim()) return { status: 'missing_booking' };
  let url = approvedUrl(raw);
  if (!url) return { status: 'manual_review_unsupported_or_unsafe_url' };
  const initialProblem = destinationProblem(url);
  if (initialProblem) return { status: initialProblem, final_url: url.href };
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetcher(url.href, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'GoBookr-read-only-link-audit/1.0', accept: 'text/html' } });
      if (response.body) await response.body.cancel();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { status: 'redirect_missing_location', http_status: response.status, final_url: url.href };
        const next = approvedUrl(new URL(location, url).href);
        if (!next) return { status: 'manual_review_redirect_outside_approved_hosts', http_status: response.status, final_url: url.href };
        url = next;
        const problem = destinationProblem(url);
        if (problem) return { status: problem, final_url: url.href };
        continue;
      }
      const status = response.status === 200 ? 'reachable_unverified'
        : [403, 429].includes(response.status) ? 'access_blocked_not_dead'
        : [404, 410].includes(response.status) ? 'http_not_found'
        : 'http_response_requires_review';
      return { status, http_status: response.status, final_url: url.href };
    }
    return { status: 'redirect_limit', final_url: url.href };
  } catch (error) {
    return { status: 'network_unverified', reason: error.name === 'AbortError' ? '12_second_timeout' : 'fetch_failed' };
  } finally { clearTimeout(timeout); }
}
async function audit(rows, fetcher = fetch) {
  const unique = new Map();
  for (const row of rows) {
    const key = String(row.booking_url || '').trim();
    if (!unique.has(key)) unique.set(key, []);
    unique.get(key).push(row.id);
  }
  const entries = [...unique.entries()], results = new Array(entries.length); let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < entries.length) {
      const index = cursor++, [url, profileIds] = entries[index];
      results[index] = { profile_ids: profileIds, ...await inspect(url, fetcher) };
    }
  }));
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + result.profile_ids.length;
  return { checked_at: new Date().toISOString(), profile_rows: rows.length, unique_populated_urls: entries.filter(([url]) => url).length,
    production_changes: 0, scope: 'HTTP reachability only; no identity/service/address verification or mobile booking-flow certification', counts, results };
}
if (require.main === module) {
  if (process.argv.length !== 3) { console.error('Usage: node scripts/audit-booking-destinations.js public-listings.json'); process.exitCode = 2; }
  else audit(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))).then(result => console.log(JSON.stringify(result, null, 2))).catch(() => { console.error('Audit failed'); process.exitCode = 1; });
}
module.exports = { approvedUrl, destinationProblem, inspect, audit };
