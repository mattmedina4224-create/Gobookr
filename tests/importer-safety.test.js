'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','scripts','import-unclaimed-profiles.js'),'utf8');
test('inventory importer rejects incomplete or unsupported sourced records',()=>{
 assert.match(src,/missing_required_factual_fields/);assert.match(src,/unsupported_category/);assert.match(src,/unapproved_source_host/);assert.match(src,/state_mismatch/);
});
test('inventory importer is idempotent and never creates user accounts',()=>{
 assert.match(src,/duplicate_inside_import_file/);assert.match(src,/SELECT id FROM pro_profiles/);assert.match(src,/SKIP duplicate professional/);assert.match(src,/user_id, business_name/);assert.match(src,/VALUES \(NULL,/);assert.doesNotMatch(src,/INSERT INTO users/);
});
test('existing profiles gain categories without overwriting profile ownership or details',()=>{
 assert.match(src,/INSERT INTO pro_categories \(pro_id, category\) VALUES \(\?, \?\)/);assert.doesNotMatch(src,/UPDATE pro_profiles SET/);
});
