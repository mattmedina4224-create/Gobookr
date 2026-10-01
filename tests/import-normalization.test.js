'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { clean, identity, normalizeZip, isHttpUrl }=require('../lib/import-normalization');

test('import identity ignores punctuation, case and repeated whitespace',()=>{
  assert.equal(identity('  Matt’s   Cuts, LLC '), identity('matts cuts llc'));
  assert.equal(identity('Littleton, CO'), 'littleton co');
});
test('import ZIP normalization treats ZIP+4 as the same five-digit area',()=>{
  assert.equal(normalizeZip('80120-1234'),'80120');
  assert.equal(normalizeZip('80120'),'80120');
  assert.equal(normalizeZip('bad zip'),'bad zip');
});
test('import URL validation accepts only HTTP and HTTPS',()=>{
  assert.equal(isHttpUrl('https://example.com/book'),true);
  assert.equal(isHttpUrl('http://example.com/book'),true);
  assert.equal(isHttpUrl('javascript:alert(1)'),false);
  assert.equal(isHttpUrl('not a url'),false);
});
test('clean safely trims nullish and scalar input',()=>{
  assert.equal(clean(null),'');
  assert.equal(clean('  Denver  '),'Denver');
});
