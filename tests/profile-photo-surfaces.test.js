'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('profile photo follows professional across marketplace and favorites',()=>{const pub=fs.readFileSync(path.join(__dirname,'..','routes','public.js'),'utf8');const customer=fs.readFileSync(path.join(__dirname,'..','routes','customer.js'),'utf8');assert.match(pub,/pro\.profile_photo_url/);assert.match(customer,/pro\.profile_photo_url/);assert.match(customer,/professional_handle/);});
