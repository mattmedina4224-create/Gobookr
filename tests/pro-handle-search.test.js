'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {buildSearch,variants}=require('../lib/specialty-search');
test('handles match with or without @',()=>{assert.deepEqual(variants('@fine_ink'),variants('fine_ink'));assert.match(buildSearch('@fine_ink').where,/pro_profiles.professional_handle/);});
