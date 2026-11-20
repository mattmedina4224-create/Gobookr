#!/usr/bin/env node
'use strict';
// Geographic coverage audit for one state, against the U.S. Census Bureau's 2020 place and county code files
// (every incorporated place and census-designated place, plus every county).
//
// Usage: node scripts/shop-coverage.js --state=AZ --places=national_place_by_county2020.txt --counties=national_county2020.txt \
//          --shops=tmp/shops-AZ/import/publish.json [--held=tmp/shops-AZ/import/review.json] [--out=tmp/shops-AZ/coverage.json]
// A place is "covered" when at least one publishable shop names it as its city. Counties are covered through
// their places. Shop cities that match no Census place (unincorporated communities, postal names) are listed
// separately instead of being forced onto a place.
const fs = require('node:fs');
const { stateInfo } = require('../lib/shop-states');

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const key = (x) => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(st\.?|saint)\s+/, 'saint ').replace(/^(ft\.?|fort)\s+/, 'fort ').replace(/^(mt\.?|mount)\s+/, 'mount ').replace(/[^a-z0-9]+/g, '');
const SUFFIX = /\s+(city and borough|city and county|consolidated government|metropolitan government|unified government|urban county|city|town|village|borough|municipality|CDP|comunidad|zona urbana|plantation|township)(\s*\(.*\))?$/i;

function readPipe(file) {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const cols = head.split('|');
  return lines.map((l) => Object.fromEntries(l.split('|').map((v, i) => [cols[i], v])));
}

function coverage({ state, placeRows, countyRows, shops, held = [] }) {
  const st = stateInfo(state);
  const places = new Map();
  for (const r of placeRows.filter((x) => x.STATEFP === st.fips)) {
    const name = String(r.PLACENAME || '').replace(SUFFIX, '').trim();
    const k = key(name);
    if (!places.has(k)) places.set(k, { name, type: r.TYPE || '', counties: new Set() });
    places.get(k).counties.add(r.COUNTYNAME);
  }
  const counties = new Set(countyRows.filter((x) => x.STATEFP === st.fips).map((x) => x.COUNTYNAME));
  const byCity = new Map();
  for (const s of shops) { const k = key(s.city); if (k) byCity.set(k, (byCity.get(k) || 0) + 1); }
  const heldByCity = new Map();
  for (const s of held) { const k = key(s.city); if (k) heldByCity.set(k, (heldByCity.get(k) || 0) + 1); }
  const coveredCounties = new Set(); const coveredPlaces = []; const unmatched = [];
  for (const [k, n] of byCity) {
    const p = places.get(k);
    if (p) { coveredPlaces.push({ name: p.name, shops: n }); p.counties.forEach((c) => coveredCounties.add(c)); }
    else unmatched.push({ city: shops.find((s) => key(s.city) === k).city, shops: n });
  }
  const gaps = [...places.entries()].filter(([k]) => !byCity.has(k)).map(([k, p]) => ({ name: p.name, type: p.type, held_candidates: heldByCity.get(k) || 0 }))
    .sort((a, b) => b.held_candidates - a.held_candidates || a.name.localeCompare(b.name));
  return {
    state: st.code, census_places: places.size, places_covered: coveredPlaces.length, place_coverage_pct: places.size ? Math.round(1000 * coveredPlaces.length / places.size) / 10 : 0,
    census_counties: counties.size, counties_covered: coveredCounties.size, counties_uncovered: [...counties].filter((c) => !coveredCounties.has(c)).sort(),
    communities_outside_census_places: unmatched.sort((a, b) => b.shops - a.shops),
    top_covered_places: coveredPlaces.sort((a, b) => b.shops - a.shops).slice(0, 40),
    uncovered_places_with_held_candidates: gaps.filter((g) => g.held_candidates).slice(0, 200),
    uncovered_places_without_candidates: gaps.filter((g) => !g.held_candidates).length,
    source: 'U.S. Census Bureau 2020 place-by-county and county code files',
  };
}

if (require.main === module) {
  const state = opt('state', '');
  const read = (p) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []);
  const result = coverage({ state, placeRows: readPipe(opt('places')), countyRows: readPipe(opt('counties')), shops: read(opt('shops')), held: read(opt('held')) });
  const out = opt('out', `tmp/shops-${state.toUpperCase()}/coverage.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ ...result, top_covered_places: undefined, uncovered_places_with_held_candidates: result.uncovered_places_with_held_candidates.length, communities_outside_census_places: result.communities_outside_census_places.length, counties_uncovered: result.counties_uncovered.length }));
}
module.exports = { coverage, readPipe, key };
