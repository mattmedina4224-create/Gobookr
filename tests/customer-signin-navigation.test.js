'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {layout}=require('../lib/layout');
test('shared logged-out navigation exposes Sign in',()=>{
 const html=layout({title:'Test',body:'',currentUser:null});
 const mobile=html.split('<details class="mobile-navigation">')[1].split('</details>')[0];
 assert.ok(mobile.includes('href="/login">Sign in</a>'));
 const home=fs.readFileSync(path.join(__dirname,'../routes/home.js'),'utf8');
 assert.ok(home.includes('layout('));
 assert.ok(!home.includes('home-mobile-menu'));
});
