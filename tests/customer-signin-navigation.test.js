'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('logged-out navigation exposes an explicit sign-in path',()=>{
  const layout=fs.readFileSync(path.join(__dirname,'..','lib','layout.js'),'utf8');
  const home=fs.readFileSync(path.join(__dirname,'..','routes','home.js'),'utf8');
  assert.match(layout, /href="\/login">Sign in<\/a>/);
  assert.match(home, /href="\/login">Sign in<\/a>/);
});
