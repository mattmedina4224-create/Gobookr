'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {matches}=require('../lib/specialty-search');
test('niche specialties require real textual evidence',()=>{
 assert.equal(matches('barber','skin fade'),false);
 assert.equal(matches('I specialize in razor fades and beard work','razor fade'),true);
 assert.equal(matches('Black & grey realism tattoos','black gray realism'),true);
});
