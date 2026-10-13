'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {buildSearch}=require('../lib/specialty-search');
test('search includes services, categories and bio in parameterized SQL',()=>{const s=buildSearch('scar camouflage');assert.match(s.where,/FROM services qs/);assert.match(s.where,/FROM pro_categories qc/);assert.match(s.where,/pro_profiles.bio/);assert.equal((s.where.match(/\?/g)||[]).length,s.args.length);assert.equal((s.order.match(/\?/g)||[]).length,s.orderArgs.length);});
