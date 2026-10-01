'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','routes','home.js'),'utf8');
test('homepage invites customers to search by service or specialty',()=>{
  assert.match(src,/placeholder="Service, specialty, or name"/);
  assert.match(src,/aria-label="Service, specialty, or professional name"/);
  assert.match(src,/Russian manicure/);
  assert.match(src,/skin fade/);
  assert.match(src,/balayage/);
});
