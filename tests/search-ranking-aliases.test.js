'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {variants}=require('../lib/specialty-search');
test('common specialty aliases expand without closing free text',()=>{
 assert.ok(variants('skin fade').length>1);
 assert.ok(variants('black gray realism').length>1);
 assert.deepEqual(variants('custom niche phrase'),['custom niche phrase']);
});
