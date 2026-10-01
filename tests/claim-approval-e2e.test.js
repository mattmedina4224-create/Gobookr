'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','routes','admin.js'),'utf8');
test('professional claim approval transfers one imported profile and starts one trial',()=>{
  assert.match(src,/UPDATE pro_profiles SET user_id=\?, claim_status='claimed', claimed_at=CURRENT_TIMESTAMP.*user_id IS NULL.*claim_status IN \('unclaimed','claim_pending'\)/s);
  assert.match(src,/SELECT id FROM pro_profiles WHERE user_id=\? AND id != \? LIMIT 1/);
  assert.match(src,/UPDATE users SET role='pro' WHERE id=\?/);
  assert.match(src,/UPDATE profile_claims SET status='approved'.*WHERE id=\? AND status='pending'/s);
  assert.match(src,/UPDATE profile_claims SET status='rejected'.*pro_id=\?.*id != \?.*status='pending'/s);
  assert.match(src,/INSERT INTO subscriptions.*'trialing'.*INTERVAL '30 days'.*NOT EXISTS \(SELECT 1 FROM subscriptions WHERE pro_id = \?\)/s);
});
test('claim approval is transactional and failure rolls ownership back',()=>{
  const start=src.indexOf("router.post('/admin/profile-claims/:id/approve'");
  const end=src.indexOf("router.post('/admin/profile-claims/:id/reject'",start);
  const block=src.slice(start,end);
  assert.match(block,/db\.exec\('BEGIN'\)/);
  assert.match(block,/db\.exec\('COMMIT'\)/);
  assert.match(block,/db\.exec\('ROLLBACK'\)/);
  assert.match(block,/if \(!attached\.changes\) throw new Error/);
});


test('claim rejection only reopens an unowned profile after the final pending claim',()=>{
  assert.match(src,/SELECT id FROM profile_claims WHERE pro_id=\? AND status='pending' LIMIT 1/);
  assert.match(src,/if \(!remaining\) db\.prepare\("UPDATE pro_profiles SET claim_status='unclaimed' WHERE id=\? AND user_id IS NULL AND claim_status='claim_pending'"\)/);
});

test('claim approval rejects competing pending claims and records the reviewer',()=>{
  assert.match(src,/UPDATE profile_claims SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewer_user_id=\? WHERE id=\? AND status='pending'/);
  assert.match(src,/UPDATE profile_claims SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewer_user_id=\? WHERE pro_id=\? AND id != \? AND status='pending'/);
});
