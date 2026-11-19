'use strict';
// GoBookr Colorado Golden List discovery: public DORA licenses + OpenStreetMap.
// Read-only staging. No production inserts, no fabricated websites.
const fs=require('node:fs');
const API='https://data.colorado.gov', ID='7s5z-vewr';
const norm=x=>String(x||'').normalize('NFKD').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim();
const val=(x,keys)=>{for(const k of keys){const p=Object.keys(x).find(z=>norm(z)===norm(k));if(p&&x[p]!=null)return String(x[p]).trim()}return ''};
const map={type:['License Type','Credential Type','license_type'],status:['License Status','Status','license_status'],name:['Business Name','Licensee Name','Name','Full Name','Licensee'],street:['Address','Street Address','Street','Business Address','Address Line 1'],city:['City','Business City','Address City'],zip:['Zip','Zip Code','Postal Code'],number:['License Number','Credential Number','License No']};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url,options={}){
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(options.timeout||120000),
   headers:{'Accept':'application/json','User-Agent':'GoBookr-Public-Shop-Audit/1.0',...(options.headers||{})}});
   if(!r.ok){if([429,502,503,504].includes(r.status)&&attempt<2){await sleep(2500*(attempt+1));continue}throw Error('HTTP '+r.status+' '+url)}
   return await r.json();
  }catch(e){if(attempt===2)throw e;await sleep(2500*(attempt+1))}
 }
}
function kind(name,detail=''){
 const n=norm(name+' '+detail);
 if(/spray tan|airbrush tan|sunless tan|bronzing/.test(n))return 'spray_tanning';
 if(/nail|manicure|pedicure/.test(n))return 'nails';
 if(/barber|fade|shav/.test(n))return 'barber';
 if(/tattoo/.test(n))return 'tattoo';
 if(/massage|bodywork/.test(n))return 'massage';
 if(/lash|eyelash/.test(n))return 'lashes';
 if(/eyebrow|brow/.test(n))return 'brows';
 if(/wax|sugar|threading/.test(n))return 'waxing';
 if(/permanent makeup|microblading|pmu/.test(n))return 'permanent_makeup';
 if(/esthetic|facial|skin care|skincare/.test(n))return 'skincare';
 if(/makeup|bridal/.test(n))return 'makeup';
 if(/salon suite|salon studio/.test(n))return 'salon_suites';
 if(/hair|salon|braid|extension|stylist|beauty/.test(n))return 'hair';
 return detail?'other_beauty':'shop_category_review';
}
function website(v){try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol))return '';if(/(?:instagram|facebook|yelp|tiktok|twitter)\.com$/.test(u.hostname))return '';return u.toString()}catch{return ''}}
async function dora(){
 const metadata=await json(API+'/api/views/'+ID+'.json');
 const cols=(metadata.columns||[]).map(c=>({name:c.name,field:c.fieldName}));
 const field=aliases=>cols.find(x=>aliases.some(a=>norm(a)===norm(x.name)||norm(a)===norm(x.field)))?.field;
 const licenseField=field(map.type),statusField=field(map.status);
 if(!licenseField)throw Error('DORA license type field unavailable');
 const rows=[];let total=0;
 for(let offset=0;offset<150000;offset+=5000){
  const params=new URLSearchParams({'$limit':'5000','$offset':String(offset),'$order':':id',
   '$where':'upper('+licenseField+') like '+ "'%SHOP REGISTRATION%'"});
  const batch=await json(API+'/resource/'+ID+'.json?'+params);
  total+=batch.length;
  for(const raw of batch){
   const status=val(raw,[statusField,...map.status]);
   if(status&&!/active|current|valid/i.test(status))continue;
   const name=val(raw,map.name),city=val(raw,map.city);
   if(!name||!city)continue;
   rows.push({name,city,state:'CO',street_address:val(raw,map.street),zip_code:val(raw,map.zip).match(/\b\d{5}\b/)?.[0]||'',
    category:kind(name),license_number:val(raw,map.number),licensing_status:status||'unknown',
    website_url:'',website_status:'missing',source_name:'Colorado DORA Shop Registration',
    source_url:'https://data.colorado.gov/Regulations/Professional-and-Occupational-Licenses-in-Colorado/'+ID});
  }
  if(batch.length<5000)break;
 }
 return {rows,total,cols};
}
const OVERPASS='[out:json][timeout:180];area["name"="Colorado"]["admin_level"="4"]["boundary"="administrative"]->.a;('+
 'nwr["shop"~"^(hairdresser|beauty|tattoo|massage|cosmetics|nails)$"](area.a);'+
 'nwr["beauty"~"^(nails|tanning|eyelash|eyebrow|waxing|permanent_makeup)$"](area.a);'+
 'nwr["craft"="hairdresser"](area.a);nwr["healthcare"="massage_therapist"](area.a););out center tags;';
async function osm(){
 const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
 const errors=[];
 for(const ep of endpoints){
  try{
   const data=await json(ep,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({data:OVERPASS}).toString(),timeout:230000});
   const rows=[];
   for(const v of data.elements||[]){
    const t=v.tags||{},name=t.name||t['name:en'];if(!name)continue;
    const street=[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ');
    const location=v.center||v;
    rows.push({name,city:t['addr:city']||'',state:'CO',street_address:street,
     zip_code:t['addr:postcode']||'',category:kind(name,[t.shop,t.beauty,t.craft,t.healthcare].filter(Boolean).join(' ')),
     website_url:website(t.website||t['contact:website']||t.url),
     website_status:'osm_tag_needs_review',source_url:'https://www.openstreetmap.org/'+v.type+'/'+v.id,
     source_name:'OpenStreetMap contributors',latitude:location.lat||null,longitude:location.lon||null});
   }
   return {rows,endpoint:ep,errors};
  }catch(e){errors.push(String(e.message||e))}
 }
 return {rows:[],endpoint:null,errors};
}
function merge(a,b){
 const groups=new Map();
 for(const x of b){const k=norm(x.name);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
 const records=[],seen=new Set();
 const key=x=>norm(x.name)+'|'+norm(x.city)+'|'+norm(x.street_address);
 for(const x of a){
  const matches=(groups.get(norm(x.name))||[]).filter(y=>(y.city&&norm(y.city)===norm(x.city))||
   (y.zip_code&&y.zip_code===x.zip_code)||(y.street_address&&x.street_address&&norm(y.street_address)===norm(x.street_address)));
  const sites=[...new Set(matches.map(y=>y.website_url).filter(Boolean))];
  if(sites.length===1){x.website_url=sites[0];x.website_status='osm_match_needs_review';
   x.website_source_url=matches.find(y=>y.website_url===sites[0]).source_url}
  if(sites.length>1)x.website_status='conflicting_websites_review';
  if(!seen.has(key(x))){seen.add(key(x));records.push(x)}
 }
 for(const x of b){if(!x.website_url||(!x.city&&!x.zip_code&&!x.street_address)||seen.has(key(x)))continue;
  seen.add(key(x));records.push({...x,licensing_status:'not_checked'})}
 return records;
}
function csv(rows){
 const fields=['name','category','city','state','street_address','zip_code','website_url','website_status','source_name','source_url','license_number','licensing_status','website_source_url','latitude','longitude'];
 const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
 return [fields.map(q).join(','),...rows.map(r=>fields.map(k=>q(r[k])).join(','))].join('\n')+'\n';
}
(async()=>{
 const errors=[];let a={rows:[],total:0,cols:[]},b={rows:[],errors:[]};
 try{a=await dora()}catch(e){errors.push('DORA '+String(e.message||e))}
 try{b=await osm()}catch(e){errors.push('OSM '+String(e.message||e))}
 if(!a.rows.length&&!b.rows.length)throw Error('Both sources unavailable: '+[...errors,...b.errors].join('; '));
 const rows=merge(a.rows,b.rows),categories={};
 for(const x of rows)categories[x.category]=(categories[x.category]||0)+1;
 const report={created_at:new Date().toISOString(),staging_only:true,licensed_shops_scanned:a.total,
 licensed_active_candidates:a.rows.length,mapped_beauty_places:b.rows.length,
 total_candidates:rows.length,with_websites:rows.filter(x=>x.website_url).length,
 category_counts:categories,errors:[...errors,...b.errors],source_fields:a.cols,overpass_endpoint:b.endpoint,
 note:'License or OSM listing alone is not sufficient to assert current operation. Verify websites, physical location and category before publishing.',
 attribution:'OpenStreetMap data © OpenStreetMap contributors; ODbL applies https://www.openstreetmap.org/copyright'};
 fs.mkdirSync('tmp',{recursive:true});
 fs.writeFileSync('tmp/colorado-golden-shop-candidates.csv',csv(rows));
 fs.writeFileSync('tmp/colorado-golden-shop-candidates.json',JSON.stringify(rows,null,2));
 fs.writeFileSync('tmp/colorado-golden-shop-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,source_fields:undefined}));
})().catch(e=>{console.error(e);process.exitCode=1});
