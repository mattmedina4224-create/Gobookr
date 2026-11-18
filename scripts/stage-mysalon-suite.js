'use strict';

// Stages MY SALON Suite's first-party sitemap URLs WITHOUT making public listings.
// Input must be the unmodified output of scripts/audit-mysalon-suite.js.
// Examples:
// node scripts/stage-mysalon-suite.js tmp/mysalon-suite/mysalonsuite-national-inventory.json
// DATABASE_URL=... node scripts/stage-mysalon-suite.js tmp/.../mysalonsuite-national-inventory.json --apply
// Requires the protected db/migrations/20261118_mysalonsuite_private_staging.sql table.
// This script never creates pro_profiles, accounts, categories, or fake booking links.
const fs=require('node:fs');
const path=require('node:path');
const SOURCE_RE=/^https:\/\/www\.mysalonsuite\.com\/members\/([a-zA-Z0-9-]+)\/$/;

function validate(source){
  if(!source || source.source!=='MY SALON Suite' || !Array.isArray(source.profiles)) {
    throw new Error('Expected an audit-mysalon-suite.js JSON inventory');
  }
  if(source.distinct_professional_urls !== source.profiles.length) {
    throw new Error('Source declared count differs from actual URL rows');
  }
  const seen=new Set();
  return source.profiles.map((item,index)=>{
    if(!item || typeof item.source_url!=='string') throw new Error('Missing member URL at row '+index);
    const m=SOURCE_RE.exec(item.source_url);
    if(!m) throw new Error('Non-official MY SALON Suite member URL: '+item.source_url);
    const key=item.source_url.toLowerCase();
    if(seen.has(key)) throw new Error('Duplicate member URL: '+item.source_url);
    seen.add(key);
    if(item.source_slug && item.source_slug!==m[1]) throw new Error('Source URL/slug mismatch at row '+index);
    if(item.booking_url || item.category) throw new Error('Refuse unverified booking/category data at row '+index);
    return [item.source_url,m[1],String(item.name_hint_unverified||'')];
  });
}
function externalSsl(connectionString){
  try {
    const hostname=new URL(connectionString).hostname;
    return !['localhost','127.0.0.1','::1'].includes(hostname);
  } catch (_) {return true;}
}
async function run(file,{apply=false,connectClient=null}={}){
  const inventory=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
  const entries=validate(inventory);
  if(!apply) return {source_rows:entries.length,mode:'dry_run',public_profiles_created:0};
  const url=process.env.DATABASE_URL;
  if(!connectClient && !url) throw new Error('DATABASE_URL required to apply');
  const {Client}=connectClient?{Client:null}:require('pg');
  const client=connectClient||new Client({
    connectionString:url,
    ssl:externalSsl(url)?{rejectUnauthorized:false}:false,
    application_name:'gobookr-mysalonsuite-source-staging',
  });
  if(!connectClient) await client.connect();
  try{
    await client.query('BEGIN');
    let staged=0;
    for(let i=0;i<entries.length;i+=250){
      const batch=entries.slice(i,i+250);
      const {rows}=await client.query(
        "WITH incoming AS (SELECT value->>0 source_url, value->>1 source_slug, value->>2 name_hint FROM jsonb_array_elements($1::jsonb)) "+
        "INSERT INTO import_staging.mysalon_suite_members(source_url,source_slug,name_hint_unverified) "+
        "SELECT source_url,source_slug,name_hint FROM incoming "+
        "ON CONFLICT (source_url) DO UPDATE SET last_seen_at=now() "+
        "RETURNING source_url",
        [JSON.stringify(batch)]
      );
      staged+=rows.length;
    }
    if(staged!==entries.length)throw new Error('Staged count mismatch; rolling back');
    await client.query('COMMIT');
    return {source_rows:entries.length,staged,mode:'applied',public_profiles_created:0};
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{
    if(!connectClient)await client.end();
  }
}
async function main(){
  const args=process.argv.slice(2);
  const file=args.find((x)=>!x.startsWith('--'));
  if(!file)throw new Error('Pass the full JSON inventory created by audit-mysalon-suite.js');
  console.log(JSON.stringify(await run(file,{apply:args.includes('--apply')}),null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={validate,run,externalSsl};
