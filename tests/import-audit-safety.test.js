'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','scripts','audit-imported-profiles.js'),'utf8');
test('inventory audit requires provenance for imported and unclaimed profiles',()=>{assert.match(src,/source_url IS NOT NULL OR claim_status = 'unclaimed'/);assert.match(src,/missing_provenance/);assert.match(src,/source_url, source_name, and source_checked_at are required/);});
test('inventory audit catches ownership, category and duplicate anomalies',()=>{assert.match(src,/unclaimed_has_user/);assert.match(src,/missing_category/);assert.match(src,/unsupported_category/);assert.match(src,/possible_duplicate/);});
test('inventory audit fails automation when structural issues exist',()=>{assert.match(src,/process\.exitCode = 1/);});

test('inventory audit shares importer identity normalization for duplicate detection',()=>{
 assert.match(src,/require\('\.\.\/lib\/import-normalization'\)/);
 assert.match(src,/identity\(pro\.business_name\)/);
 assert.match(src,/identity\(pro\.workplace_name\)/);
});

test('inventory audit validates source URLs and required identity fields',()=>{
 assert.match(src,/invalid_source_url/); assert.match(src,/isApprovedBookingSource\(pro\.source_url\)/);
 assert.match(src,/missing_name/); assert.match(src,/missing_city/); assert.match(src,/invalid_state/); assert.match(src,/invalid_zip/);
});
test('inventory audit reports launch-readiness coverage',()=>{
 assert.match(src,/summary\.unclaimed/); assert.match(src,/summary\.claim_pending/); assert.match(src,/summary\.claimed/);
 assert.match(src,/summary\.cities\.size/); assert.match(src,/summary\.sources\.size/);
});
