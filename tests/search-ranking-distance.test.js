'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareResults}=require('../lib/specialty-search');
test('closer pro wins only after relevance is equal',()=>{
 assert.ok(compareResults({id:1,search_score:120,distanceMiles:10},{id:2,search_score:85,distanceMiles:1})<0);
 assert.ok(compareResults({id:1,search_score:120,distanceMiles:1},{id:2,search_score:120,distanceMiles:10})<0);
});
