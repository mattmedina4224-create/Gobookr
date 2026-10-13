'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {matches,buildSearch}=require('../lib/specialty-search');
test('unlisted specialties match current bio text',()=>{assert.ok(matches('I specialize in scar camouflage.','SCAR CAMOUFLAGE'));assert.ok(!matches('Now specializing in fine line tattoos.','scar camouflage'));assert.match(buildSearch('scar camouflage').where,/pro_profiles.bio/);});
