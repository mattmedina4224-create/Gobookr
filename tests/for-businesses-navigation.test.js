'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('navigation has one unified professional join entry instead of a separate business entry',()=>{
  const {layout}=require('../lib/layout');
  for (const currentUser of [null,{role:'customer',name:'Customer'}]) {
    const html=layout({title:'Test',body:'',currentUser,session:null});
    const nav=html.match(/<nav id="site-navigation"[\s\S]*?<\/nav>/)[0];
    assert.equal((nav.match(/href="\/join">Join as a professional<\/a>/g)||[]).length,1);
    assert.doesNotMatch(nav,/For Businesses|href="\/business-account"/);
    assert.match(nav,/Find a business/);
  }
});
