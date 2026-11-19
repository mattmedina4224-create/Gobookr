#!/usr/bin/env node
'use strict';
// Builds the per-city SQUIRE discovery inventory from the wave-2 audit files.
// Usage: node scripts/squire-inventory.js [data/source-audits/squire-wave2]
// Reads pages.jsonl (every first-party page read) plus each bNN-import.json /
// bNN-rejected.json, and writes inventory.json + inventory.csv next to them.
// Pass --imported=<json file of booking_url strings> to mark which accepted
// rows are confirmed in production (export it from Supabase after a batch).

const fs = require('fs');
const path = require('path');

const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'data/source-audits/squire-wave2';
const importedArg = process.argv.find((a) => a.startsWith('--imported='));
const inProduction = importedArg
  ? new Set(JSON.parse(fs.readFileSync(importedArg.split('=')[1], 'utf8')).map((u) => u.toLowerCase()))
  : null;

const pages = fs.readFileSync(path.join(dir, 'pages.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const files = fs.readdirSync(dir);
const accepted = files.filter((f) => /^b\d+-import\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const rejected = files.filter((f) => /^b\d+-rejected\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

const cityOf = (line) => {
  const parts = String(line || '').split(',').map((s) => s.trim());
  return parts.length >= 4 ? { city: parts[parts.length - 3], state: parts[parts.length - 2].toUpperCase() } : { city: '(unparsed)', state: '' };
};
const key = (c) => `${c.state}|${c.city.toLowerCase()}`;
const inv = new Map();
const bucket = (c, metro) => {
  const k = key(c);
  if (!inv.has(k)) inv.set(k, { state: c.state, city: c.city, metro, shops: new Set(), pages_read: 0, verified: 0, rejected: 0, in_production: 0, last_scan: '', reject_reasons: {} });
  return inv.get(k);
};

for (const p of pages) {
  const b = bucket(cityOf(p.address_line), p.metro);
  b.pages_read += 1;
  b.shops.add(String(p.url).split('/barber/')[0]);
  if (p.checked_at > b.last_scan) b.last_scan = p.checked_at;
}
for (const r of accepted) {
  const b = bucket({ city: r.city, state: r.state }, r.metro);
  b.verified += 1;
  if (inProduction && inProduction.has(r.booking_url.toLowerCase())) b.in_production += 1;
}
for (const r of rejected) {
  const page = pages.find((p) => p.url === r.url) || {};
  const b = bucket(cityOf(page.address_line), page.metro);
  b.rejected += 1;
  b.reject_reasons[r.reason] = (b.reject_reasons[r.reason] || 0) + 1;
}

const rows = [...inv.values()].map((b) => ({ ...b, shops: b.shops.size, in_production: inProduction ? b.in_production : null }))
  .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify(rows, null, 1));
const csv = ['state,city,metro,shops,pages_read,verified,rejected,in_production,last_scan,reject_reasons']
  .concat(rows.map((r) => [r.state, r.city, r.metro, r.shops, r.pages_read, r.verified, r.rejected, r.in_production ?? '', r.last_scan,
    Object.entries(r.reject_reasons).map(([k, v]) => `${k}:${v}`).join(' ')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')));
fs.writeFileSync(path.join(dir, 'inventory.csv'), csv.join('\n') + '\n');
console.log(JSON.stringify({ cities: rows.length, states: new Set(rows.map((r) => r.state)).size, shops: rows.reduce((s, r) => s + r.shops, 0), pages: pages.length, verified: accepted.length, rejected: rejected.length }, null, 1));
