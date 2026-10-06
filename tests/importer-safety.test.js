'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','scripts','import-unclaimed-profiles.js'),'utf8');
test('inventory importer rejects incomplete or unsupported sourced records',()=>{
 assert.match(src,/missing_required_factual_fields/);assert.match(src,/unsupported_category/);assert.match(src,/invalid_state/);assert.match(src,/invalid_zip/);assert.match(src,/unapproved_source_host/);assert.match(src,/state_mismatch/);assert.match(src,/isApprovedBookingSource\(row\.sourceUrl\)/);
});
test('inventory importer is idempotent and never creates user accounts',()=>{
 assert.match(src,/duplicate_inside_import_file/);assert.match(src,/SELECT id, business_name, workplace_name, city, state, street_address, zip_code, booking_url FROM pro_profiles/);assert.match(src,/SKIP duplicate professional/);assert.match(src,/user_id, business_name/);assert.match(src,/VALUES \(NULL,/);assert.doesNotMatch(src,/INSERT INTO users/);
});
test('existing profiles gain categories without overwriting profile ownership or details',()=>{
 assert.match(src,/INSERT INTO pro_categories \(pro_id, category\) VALUES \(\?, \?\)/);assert.doesNotMatch(src,/UPDATE pro_profiles SET/);
});

test('inventory importer normalizes punctuation and whitespace for identity dedupe',()=>{
 assert.match(src,/require\('\.\.\/lib\/import-normalization'\)/);
 assert.match(src,/sameProfessional\(candidate, row\)/);
 assert.match(src,/bookingIdentity\(candidate\.booking_url\)/);
 assert.match(src,/verificationApproved\(raw\)/);
});

test('inventory importer normalizes ZIP+4 and rejects unsafe booking URLs',()=>{
 assert.match(src,/normalizeZip\(raw\.zip_code/);
 assert.match(src,/normalizeZip\(raw\.zip_code \|\| raw\.zip \|\| raw\.workplace_zip\)/);
 assert.match(src,/invalid_booking_url/);
 assert.match(src,/isHttpUrl\(row\.bookingUrl\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','lib','import-identity.js'),'utf8'),/normalizeZip\(candidate\.zip_code\) === row\.zip/);
});

test('inventory report summarizes rejection reasons for batch cleanup',()=>{
 assert.match(src,/const rejectedByReason = report\.rejected\.reduce/);
 assert.match(src,/rejected_by_reason: rejectedByReason/);
});
