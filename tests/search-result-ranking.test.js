'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {rank}=require('../lib/search-result-ranking');
test('rank leaves non-text searches stable',()=>{const rows=[{id:1},{id:2}];assert.deepEqual(rank(rows),rows);});
test('rank applies text relevance ordering',()=>{const rows=[{id:1,search_score:85},{id:2,search_score:120}];assert.deepEqual(rank(rows,{textSearch:true}).map(x=>x.id),[2,1]);});
