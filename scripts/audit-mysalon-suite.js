'use strict';

// MY SALON Suite public sitemap discovery.  Read-only: does NOT publish profiles.
// node scripts/audit-mysalon-suite.js --output=tmp/mysalon-suite
// Respects the site's published 10-second crawl delay.
// All fields except canonical profile URL and last-modified sitemap date are unverified.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = 'https://www.mysalonsuite.com/sitemap.xml';
const PROFESSIONAL_SITEMAP = /^https:\/\/www\.mysalonsuite\.com\/app_professional-sitemap\d*\.xml$/;
const PROFILE_URL = /^https:\/\/www\.mysalonsuite\.com\/members\/[^/?#]+\/?$/;
const WAIT_MS = 10500;

function decodeXml(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function parseSitemapIndex(xml) {
  const result = [];
  for (const match of String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const url = decodeXml(match[1]).trim();
    if (PROFESSIONAL_SITEMAP.test(url)) result.push(url);
  }
  return [...new Set(result)];
}
function parseProfessionalSitemap(xml) {
  const records = [];
  for (const m of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const link = /<loc>([\s\S]*?)<\/loc>/i.exec(m[1]);
    if (!link) continue;
    const url = decodeXml(link[1]).trim();
    if (!PROFILE_URL.test(url)) continue;
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(m[1]);
    const slug = new URL(url).pathname.split('/').filter(Boolean)[1] || '';
    records.push({
      source_url: url,
      source_slug: slug,
      lastmod: lastmod ? decodeXml(lastmod[1]).trim() : '',
      name_hint_unverified: slug.replace(/^[a-z0-9]{6,40}-/i, '').replace(/-/g, ' '),
      category: null,
      booking_url: null,
      verification_status: 'awaiting_member_profile_verification',
    });
  }
  return records;
}
function escapeCsv(value) {
  const s = String(value === null || value === undefined ? '' : value);
  return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csv(records) {
  const keys = ['source_url','source_slug','lastmod','name_hint_unverified','category','booking_url','verification_status'];
  return [keys.join(','), ...records.map((r) => keys.map((key) => escapeCsv(r[key])).join(','))].join('\n') + '\n';
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function getXml(url) {
  const response = await fetch(url, {
    headers: {'User-Agent':'Mozilla/5.0 (compatible; GoBookrInventoryAudit/1.0; +https://gobookr.com/)'},
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
  return await response.text();
}
async function audit(get = getXml, wait = pause) {
  const maps = parseSitemapIndex(await get(ROOT));
  if (!maps.length) throw new Error('No MY SALON Suite professional sitemaps were found');
  const seen = new Map();
  const stats = [];
  for (let i = 0; i < maps.length; i++) {
    if (i) await wait(WAIT_MS);
    const entries = parseProfessionalSitemap(await get(maps[i]));
    stats.push({ sitemap: maps[i], records: entries.length });
    for (const e of entries) {
      const key = e.source_url.replace(/\/$/, '').toLowerCase();
      if (!seen.has(key)) seen.set(key, e);
    }
  }
  return {
    source: 'MY SALON Suite',
    root_sitemap: ROOT,
    checked_at: new Date().toISOString(),
    sitemap_count: maps.length,
    distinct_professional_urls: seen.size,
    sitemaps: stats,
    warning: 'Sitemap URLs alone do not verify current professional identity, salon address, service classification, or external booking destinations. Do not import these as booked/available profiles.',
    profiles: [...seen.values()],
  };
}
function save(result, directory) {
  fs.mkdirSync(directory, {recursive:true});
  fs.writeFileSync(path.join(directory,'mysalonsuite-national-inventory.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(directory,'mysalonsuite-national-professionals.csv'),csv(result.profiles));
  return { json: path.join(directory,'mysalonsuite-national-inventory.json'),
    csv: path.join(directory,'mysalonsuite-national-professionals.csv') };
}
async function main() {
  const opt=process.argv.find((x)=>x.startsWith('--output='));
  const output=path.resolve(opt? opt.slice('--output='.length):'tmp/mysalonsuite-source-audit');
  const result=await audit();
  const files=save(result,output);
  console.log(JSON.stringify({count:result.distinct_professional_urls,sitemaps:result.sitemap_count,files},null,2));
}
if(require.main===module) main().catch((err)=>{console.error(err);process.exitCode=1;});
module.exports={parseSitemapIndex,parseProfessionalSitemap,escapeCsv,csv,audit,save};
