'use strict';

// Read-only discovery of public Square Appointments booking pages and visible staff.
// Usage: node scripts/audit-square-appointments.js data/source-audits/square-az-booking-seeds.json --output=tmp/square-az.json
// Never invents professional identity, services, booking URLs, availability or licensing.
// Review candidate category evidence before adding to GoBookr; this script never writes to the DB.
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = /^https:\/\/square\.site\/book\/([A-Z0-9]{10,20})\/[a-z0-9-]+\/?$/i;
const STAFF = /^https:\/\/app\.squareup\.com\/appointments\/book\/[^?#\s]+(?:\?[^#\s]*)?$/i;
const UPPER_STATE = /^([A-Z][A-Z ])+$/;
const CATEGORIES = {
  barber: /\bbarber|beard\s*(?:trim|line)|razor\s*(?:shave|fade)|skin\s*fade|men[’']?s\s*(?:cut|haircut)/i,
  stylist: /\bhaircut|hair\s*cut|blowout|blow\s*dry|balayage|highlights?|hair\s*(?:color|extensions?|styling)|perm\b/i,
  colorist: /\b(?:balayage|highlights?|ombre|ombré|color\s*(?:retouch|correction|service|treatment)|root\s*touch|allover\s*color|all\s*over\s*color|bleach\s*and\s*tone)\b/i,
  nail_technician: /\bmanicure|pedicure|acrylic|gel\s*x|gelx|nail\s*(?:art|repair|set|service|fill|polish)/i,
  eyelash_technician: /\b(?:eyelash|lash)\b/i,
  eyebrow_technician: /\b(?:eyebrow|brow)\b/i,
  waxing_specialist: /\b(?:wax|waxing|sugaring)\b/i,
  massage_therapist: /\bmassage|deep\s*tissue|craniosacral/i,
  esthetician: /\bfacial|skincare|skin\s*care|dermaplan|chemical\s*peel/i,
  makeup_artist: /\bmakeup|bridal\s*make[\s-]?up/i,
  tattoo_artist: /\btattoo/i,
  permanent_makeup_artist: /\bmicroblading|permanent\s*make[\s-]?up|powder\s*brow/i,
  threading_specialist: /\bthreading/i,
};
function unescapeHtml(s) {
  return String(s||'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ')
    .replace(/&#39;|&#x27;/gi,"'").replace(/&quot;/gi,'"')
    .replace(/&#8217;/g,'’').replace(/&#8211;/g,'–')
    .replace(/&#(\d+);/g, (_,n)=>String.fromCharCode(Number(n)));
}
function text(s){return unescapeHtml(String(s||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function parsePage(sourceUrl, html) {
  if(!SOURCE.test(sourceUrl)) throw new Error('Not an official Square booking page');
  const body=String(html||'');
  const title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  const titleText=title?text(title[1]):'';
  const place=/^(.*?)\s+in\s+([^,]+),\s*([A-Z]{2})\s*$/i.exec(titleText);
  const workplace=place?place[1].trim():titleText;
  const city=place?place[2].trim():null;
  const state=place?place[3].toUpperCase():null;
  const addr=/<p class="company-brick-and-mortar">([\s\S]*?)<\/p>/i.exec(body);
  const location=addr?text(addr[1]):'';
  const suffix=city&&state?location.toLowerCase().lastIndexOf((city+', '+state).toLowerCase()):-1;
  const after=suffix>=0?location.slice(suffix+city.length+state.length+2):'';
  const zipMatch=/^\s*(\d{5})(?:-\d{4})?\s*$/.exec(after);
  const zip=zipMatch?zipMatch[1]:null;
  const address=zipMatch?location.slice(0,suffix).trim().replace(/,\s*$/,''):null;
  const staffSection=body.indexOf('staff-info');
  const servicesPart=staffSection>0?body.slice(0,staffSection):body;
  const services=[...servicesPart.matchAll(/<h5 class="font--bold m-bottom--8">([\s\S]*?)<\/h5>/gi)]
    .map(x=>text(x[1])).filter(Boolean).filter(x=>x.length<160);
  const candidates=Object.entries(CATEGORIES).filter(([,regex])=>services.some(s=>regex.test(s)))
    .map(([category])=>category);
  const people=[];
  const card=/<a class="card card--interactive w-background-light" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of body.matchAll(card)) {
    const bookingUrl=unescapeHtml(match[1]);
    if(!STAFF.test(bookingUrl)) continue;
    const nameMatch=/<h5 class="font--bold m-bottom--8">([\s\S]*?)<\/h5>/i.exec(match[2]);
    if(!nameMatch) continue;
    const name=text(nameMatch[1]);
    if(!name || /^(?:no preference|any staff|any provider|staff member)$/i.test(name))continue;
    const staffId=new URL(bookingUrl).searchParams.get('staff_id');
    people.push({
      name,staff_booking_url:bookingUrl,staff_id:staffId,
      source_url:sourceUrl,workplace_name:workplace,address,city,state,zip,
      service_names:services,category_candidates:candidates,
      verification_status:
        !staffId?'review_staff_booking_link':
        !name.split(/\s+/).every(Boolean) || name.split(/\s+/).length<2?'review_full_identity':
        !address||!city||!zip?'review_location':
        !candidates.length?'review_service_category':'review_before_import',
    });
  }
  return {source_url:sourceUrl,workplace_name:workplace,address,city,state,zip,
    service_names:services,category_candidates:candidates,
    staff_found:people.length,staff:people};
}
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
async function fetchPage(url){
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; GoBookrPublicDirectoryAudit/1.0)'},
    signal:AbortSignal.timeout(24000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.text();
}
async function audit(urls,get=fetchPage,wait=delay){
  if(!Array.isArray(urls)) throw new Error('Provide an array of official Square /book/ URLs');
  const seen=new Set(),sources=[],errors=[];
  for(const raw of urls){
    if(!SOURCE.test(raw)) {errors.push({url:raw,reason:'unapproved_source_url'});continue;}
    const key=raw.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    if(sources.length || errors.length) await wait(1000);
    try{sources.push(parsePage(raw,await get(raw)));}
    catch(e){errors.push({url:raw,reason:String(e.message||e)});}
  }
  return {source:'Square Appointments',checked_at:new Date().toISOString(),
    pages_attempted:seen.size,pages_loaded:sources.length,
    staff_records:sources.reduce((n,s)=>n+s.staff_found,0),
    note:'Read-only discovery. All category candidates and staff identities require human/source verification; Square may rate-limit staff booking URLs. No production changes.',
    pages:sources,errors};
}
async function main(){
 const args=process.argv.slice(2);
 const file=args.find(a=>!a.startsWith('--'));
 if(!file)throw new Error('Pass a file containing an array of Square booking page URLs');
 const urls=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
 const report=await audit(urls);
 const option=args.find(a=>a.startsWith('--output='));
 const output=path.resolve(option?option.slice(9):'tmp/square-appointments-audit.json');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({pages:report.pages_loaded,staff:report.staff_records,errors:report.errors.length,output}));
 if(report.errors.length)process.exitCode=2;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={parsePage,audit,CATEGORIES,SOURCE,STAFF};
