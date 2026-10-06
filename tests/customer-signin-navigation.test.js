'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('logged-out navigation exposes an explicit sign-in path',()=>{
  const layout=require('../lib/layout').layout({title:'Navigation',currentUser:null,session:null,body:''});
  const home=fs.readFileSync(path.join(__dirname,'..','routes','home.js'),'utf8');
  assert.match(layout, /href="\/login">Sign in<\/a>/);
  assert.match(home, /layout\(\{[^}]*currentUser: ctx\.currentUser/);
});
