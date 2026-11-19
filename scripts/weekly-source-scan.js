'use strict';
// Weekly source monitor. Discovery only; no production writes, login, or access-control bypass.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const registry = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/source-registry/weekly-professional-sources.json'),'utf8'));
const timeoutMs = 12000;
const userAgent = 'GoBookr-Public-Source-Monitor/1.0';
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function http(url) {
  const response = await fetch(url,{headers:{'user-agent':userAgent,'accept':'text/html,application/json;q=0.8,*/*;q=0.5'},
    signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});
  const body = response.ok ? (await response.text()).slice(0,2000000) : '';
  return {status:response.status,finalUrl:response.url,body,contentType:response.headers.get('content-type')||''};
}
const robotsCache = new Map();
async function allowedByRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    try {
      const r=await http(u.origin+'/robots.txt');
      robotsCache.set(u.origin,r.status===200?r.body:r.status===404?'':null);
    } catch { robotsCache.set(u.origin,null); }
  }
  const robots=robotsCache.get(u.origin);
  if (robots===null) return {allowed:false,reason:'robots_unavailable'};
  const groups=robots.split(/\r?\n/);
  let active=false, rules=[],agents=[];
  const flush=()=>{ if(agents.some(a=>a==='*'||a==='gobookr-public-source-monitor'))rules.push(...current);current=[]; };
  let current=[];
  for (const raw of groups) {
    const line=raw.split('#')[0].trim();
    if (!line) { if(agents.length && current.length){flush();agents=[];} continue; }
    const m=line.match(/^([^:]+):\s*(.*)$/); if(!m) continue;
    const k=m[1].trim().toLowerCase(),v=m[2].trim();
    if(k==='user-agent'){
      if(current.length){flush();agents=[];}
      agents.push(v.toLowerCase());
    } else if ((k==='disallow'||k==='allow')&&agents.length) current.push({kind:k,value:v});
  }
  if(current.length)flush();
  const route=u.pathname+(u.search||'');
  const matches=rules.filter(r=>r.value && route.startsWith(r.value.replace(/\*.*$/,'')))
    .sort((a,b)=>b.value.length-a.value.length);
  if(matches.length && matches[0].kind==='disallow')return {allowed:false,reason:'robots_disallow'};
  return {allowed:true,reason:'allowed'};
}
function peopleFromJsonLd(html) {
  const names=new Set();
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try {
      const value=JSON.parse(m[1]); const stack=[value];
      while(stack.length) {
        const item=stack.pop(); if(Array.isArray(item)){stack.push(...item);continue;}
        if (!item||typeof item!=='object')continue;
        const type=item['@type'];
        if((type==='Person'||Array.isArray(type)&&type.includes('Person'))&&typeof item.name==='string') names.add(item.name.trim().slice(0,120));
        for(const value of Object.values(item))if(typeof value==='object'&&value)stack.push(value);
      }
    } catch {}
  }
  return [...names].filter(Boolean).sort();
}
function normalized(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1000000);
}
async function scan(source) {
  const started=Date.now();
  const base={id:source.id,provider:source.provider,city:source.city||null,state:source.state,url:source.url,checked_at:new Date().toISOString()};
  try {
    const check=await allowedByRobots(source.url);
    if(!check.allowed)return {...base,status:check.reason,elapsed_ms:Date.now()-started};
    const response=await http(source.url);
    if(response.status!==200)return {...base,status:'http_'+response.status,http_status:response.status,elapsed_ms:Date.now()-started};
    if(!response.contentType.includes('html')&&!response.contentType.includes('json'))return {...base,status:'unsupported_content',http_status:response.status};
    const text=normalized(response.body), people=peopleFromJsonLd(response.body);
    return {...base,status:'ok',http_status:200,final_url:response.finalUrl,
      content_fingerprint:crypto.createHash('sha256').update(text).digest('hex'),
      schema_person_count:people.length,schema_person_names:people.slice(0,100),
      content_chars:text.length,elapsed_ms:Date.now()-started};
  } catch(e){return {...base,status:'error',error:String(e.message||e).slice(0,180),elapsed_ms:Date.now()-started};}
}
(async()=>{
 const enabled=registry.sources.filter(x=>x.enabled);
 const results=[];
 for(let i=0;i<enabled.length;i+=3){
   const chunk=await Promise.all(enabled.slice(i,i+3).map(scan));results.push(...chunk);
   if(i+3<enabled.length)await pause(350);
 }
 const output={scanned_at:new Date().toISOString(),registry_version:registry.version,sources_total:registry.sources.length,
   sources_enabled:enabled.length,results,note:'Content changes and JSON-LD Person entries are discovery signals only, not validated professionals or production imports.'};
 fs.mkdirSync('tmp',{recursive:true});
 fs.writeFileSync('tmp/weekly-source-scan.json',JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({sources_enabled:enabled.length,ok:results.filter(r=>r.status==='ok').length,
   blocked:results.filter(r=>/http_403|http_429|robots_/.test(r.status)).length,report:'tmp/weekly-source-scan.json'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
