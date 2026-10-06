'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {layout}=require('../lib/layout');
test('homepage shares native disclosure navigation without hiding its links or injecting a second menu',()=>{
 const home=fs.readFileSync(path.join(__dirname,'../routes/home.js'),'utf8');
 assert.ok(!home.includes('home-mobile-menu'));assert.ok(!/\.nav-links\s*>\s*(?:a|form|span)/.test(home));
 for(const currentUser of [null,{id:1,name:'Owner',role:'pro'}]){
  const html=layout({title:'Test',body:'',currentUser,session:{csrf_token:'test'}});
  assert.equal((html.match(/<details class="mobile-navigation">/g)||[]).length,1);
  const mobile=html.split('<details class="mobile-navigation">')[1].split('</details>')[0];
  assert.match(mobile,/Find a pro/);assert.match(mobile,/Find a business/);
  assert.match(mobile,currentUser?/Dashboard/:/Sign in/);assert.ok(!mobile.includes('Openings Today'));
 }
 const css=fs.readFileSync(path.join(__dirname,'../public/navigation.css'),'utf8');
 assert.match(css,/not\(\[open\]\) > nav \{ display:none/);assert.match(css,/\[open\] > nav \{ display:block/);
});
