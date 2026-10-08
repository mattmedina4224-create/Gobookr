'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('logged-out navigation labels the business entry point For Businesses',()=>{
  const layout=fs.readFileSync(path.join(__dirname,'..','lib','layout.js'),'utf8');
  assert.match(layout, /href="\/business-account">For Businesses<\/a>/);
});
