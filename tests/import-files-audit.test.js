'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','scripts','audit-import-files.js'),'utf8');

test('repository import audit scans every JSON batch and validates factual fields',()=>{
  assert.match(src,/readdirSync\(dir\).*endsWith\('\.json'\)/);
  assert.match(src,/missing_required_factual_fields/);
  assert.match(src,/unsupported_category/);
  assert.match(src,/invalid_state/);
  assert.match(src,/invalid_zip/);
  assert.match(src,/unapproved_source_host/);
  assert.match(src,/invalid_booking_url/);
});
test('repository import audit detects duplicates across separate files',()=>{
  assert.match(src,/duplicate_across_import_files/);
  assert.match(src,/seen\.has\(key\)/);
  assert.match(src,/unique_fingerprints/);
});
test('repository import audit reports launch inventory composition',()=>{
  assert.match(src,/by_source/);
  assert.match(src,/by_category/);
  assert.match(src,/by_city/);
  assert.match(src,/stats\.rows/);
});
test('repository import audit fails only structural rejects, not duplicate review candidates',()=>{
  assert.match(src,/issue\.type !== 'duplicate_across_import_files'/);
  assert.match(src,/if \(stats\.rejected\) process\.exitCode = 1/);
});
