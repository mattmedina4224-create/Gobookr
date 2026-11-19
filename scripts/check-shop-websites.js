#!/usr/bin/env node
'use strict';
// Checks whether candidate business websites load, so shop pages only link to working sites.
// Usage: node scripts/check-shop-websites.js tmp/colorado-golden-shop-candidates.json [more.csv|json ...] --out=tmp/colorado-shop-website-checks.json
// One GET per unique URL (homepage or listed page), 4 at a time, 15s timeout, redirects followed.
// Result per URL: live (2xx after redirects), blocked (401/403/429: site exists but refused us), dead (404/410/DNS),
// error (other/timeouts). Only "live" is used to attach a website; nothing else is inferred from a failure.
const fs = require('node:fs');
const path = require('node:path');

const UA = 'Mozilla/5.0 (compatible; GoBookrWebsiteCheck/1.0; +https://gobookr.com)';
const args = process.argv.slice(2);
const out = (args.find((a) => a.startsWith('--out=')) || '--out=tmp/colorado-shop-website-checks.json').slice(6);
const inputs = args.filter((a) => !a.startsWith('--'));

function urlsFrom(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(text).flatMap((r) => [r.website_url, r.website_candidate]).filter(Boolean);
  return [...text.matchAll(/https?:\/\/[^\s",]+/g)].map((m) => m[0]).filter((u) => !/openstreetmap\.org|data\.colorado\.gov/.test(u));
}
function safe(u) { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : ''; } catch { return ''; } }

async function check(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
    try { await res.body?.cancel(); } catch (_) {}
    const status = res.status >= 200 && res.status < 300 ? 'live' : [401, 403, 429].includes(res.status) ? 'blocked' : [404, 410].includes(res.status) ? 'dead' : 'error';
    return { status, http_status: res.status, final_url: res.url !== url ? res.url : undefined, ms: Date.now() - started };
  } catch (e) {
    const code = e.cause?.code || e.name;
    return { status: /ENOTFOUND|EAI_AGAIN/.test(code) ? 'dead' : 'error', error: String(code), ms: Date.now() - started };
  }
}

(async () => {
  const urls = [...new Set(inputs.flatMap(urlsFrom).map(safe).filter(Boolean))];
  const results = {}; let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (i < urls.length) { const u = urls[i++]; results[u] = await check(u); } }));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const counts = Object.values(results).reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log(JSON.stringify({ checked: urls.length, ...counts }));
})().catch((e) => { console.error(e); process.exitCode = 1; });
