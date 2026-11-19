'use strict';
// Prepare Phenix Salon Suites professional candidates from authorized/public exports.
// This tool does not crawl blocked websites or write to production.
// Usage: node scripts/prepare-phenix-import.js input.json output.json
const fs = require('node:fs');
const { URL } = require('node:url');
const { PROFESSIONAL_CATEGORY_VALUES } = require('../lib/pro-categories');
const { isApprovedBookingSource } = require('../lib/booking-platforms');
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/prepare-phenix-import.js input.json output.json');
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const records = Array.isArray(input) ? input : input.records;
if (!Array.isArray(records)) throw new Error('Expected a JSON array or { records: [...] }');
const bits = [
  [1,'barber'], [2,'stylist'], [4,'colorist'], [8,'nail_technician'],
  [16,'eyelash_technician'], [32,'eyebrow_technician'], [64,'waxing_specialist'],
  [128,'tattoo_artist'], [256,'massage_therapist'], [512,'makeup_artist'],
  [1024,'esthetician'], [2048,'permanent_makeup_artist'], [4096,'threading_specialist']
];
const approvedAdditionalBookings = new Set(['ginasplatform.com','styleseat.com','as.me','heygoldie.com','noterro.com']);
function validHttp(value) {
  try { const u=new URL(value); return ['https:','http:'].includes(u.protocol); } catch { return false; }
}
function hostAllowed(value,hosts) {
  try { const h=new URL(value).hostname.toLowerCase(); return hosts.some(x=>h===x||h.endsWith('.'+x)); } catch { return false; }
}
function approvedBooking(value) {
  return validHttp(value) && (isApprovedBookingSource(value) || hostAllowed(value,[...approvedAdditionalBookings]));
}
const candidates=[], rejected=[], seen=new Set();
for (const [idx,entry] of records.entries()) {
  const record=Array.isArray(entry)
    ? {name:entry[0],workplace_name:entry[1],city:entry[2],street_address:entry[3],
       zip_code:entry[4],suite:entry[5],category_bits:entry[6],booking_url:entry[7],source_url:entry[8]}
    : entry;
  const name=String(record.name||'').trim();
  const city=String(record.city||'').trim();
  const state=String(record.state||input.state||'AZ').toUpperCase().trim();
  const source=String(record.source_url||'').trim();
  const booking=String(record.booking_url||'').trim();
  const categoryList=Array.isArray(record.categories) ? record.categories
    : Number.isInteger(Number(record.category_bits)) ? bits.filter(([bit]) => (Number(record.category_bits)&bit)!==0).map(([,cat])=>cat)
    : [record.category].filter(Boolean);
  const supported=categoryList.filter(c=>PROFESSIONAL_CATEGORY_VALUES.has(c));
  let reason='';
  if (!name||!city||!/^([A-Z]{2})$/.test(state)) reason='missing_identity_or_location';
  else if (!hostAllowed(source,['phenixsalonsuites.com','phenixsalonaz.com'])) reason='unverified_phenix_source';
  else if (!approvedBooking(booking)) reason='missing_or_unapproved_direct_booking';
  else if (!supported.length) reason='no_supported_category';
  if (reason) { rejected.push({index:idx,name,reason}); continue; }
  const key=[name.toLowerCase(), city.toLowerCase(), state, source.toLowerCase()].join('|');
  if (seen.has(key)) { rejected.push({index:idx,name,reason:'duplicate_source_identity'}); continue; }
  seen.add(key);
  candidates.push({
    name,category:supported[0],categories:supported,workplace_name:String(record.workplace_name||'').trim(),
    city,state,street_address:String(record.street_address||'').trim(),
    suite:String(record.suite||'').trim(),zip_code:String(record.zip_code||'').trim(),
    booking_url:booking,source_url:source,source_name:'Phenix Salon Suites'
  });
}
fs.mkdirSync(require('node:path').dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(candidates,null,2)+'\n');
const report={input:inputPath,output:outputPath,input_count:records.length,prepared:candidates.length,
  rejected:rejected.length,reasons:rejected.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),
  note:'Candidates only; cross-check current profiles, reverify links, run dry-run importer before production. No scraping or SQL writes.'};
fs.writeFileSync(outputPath.replace(/\.json$/,'-audit.json'),JSON.stringify({...report,rejected},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
