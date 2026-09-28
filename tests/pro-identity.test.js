'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('professional identity supports profile photo and handle',()=>{
 const pro=fs.readFileSync(path.join(__dirname,'..','routes','pro.js'),'utf8');
 const pub=fs.readFileSync(path.join(__dirname,'..','routes','public.js'),'utf8');
 const migration=fs.readFileSync(path.join(__dirname,'..','db','migrations','20260928171500_pro_identity_photo.sql'),'utf8');
 assert.match(pro,/dashboard\/pro\/profile-photo/);
 assert.match(pro,/professional_handle/);
 assert.match(pro,/5 \* 1024 \* 1024/);
 assert.match(pub,/profile_photo_url/);
 assert.match(pub,/professional_handle/);
 assert.match(migration,/profile-photos/);
});
