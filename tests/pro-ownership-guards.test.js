'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=(file)=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function postBlocks(src){return [...src.matchAll(/router\.post\('([^']+)'[\s\S]*?(?=\n\s*router\.(?:get|post)\(|\n};?\s*$)/g)].map(m=>({route:m[1],body:m[0]}));}
test('professional dashboard mutations resolve the signed-in owner profile',()=>{
  for(const file of ['routes/pro.js','routes/onboarding.js']){
    const blocks=postBlocks(read(file)); assert.ok(blocks.length>1, file+' should expose protected mutations');
    for(const block of blocks) assert.match(block.body,/const profile = requirePro\(ctx\); if \(!profile\) return;/,block.route+' must resolve ownership');
  }
});
test('billing dashboard mutations resolve the signed-in professional before account actions',()=>{
  for(const file of ['routes/billing.js','routes/embedded-billing.js']){
    for(const block of postBlocks(read(file)).filter(x=>x.route.startsWith('/dashboard/pro/'))) assert.match(block.body,/const profile = requirePro\(ctx\)/,block.route+' must resolve ownership');
  }
});
