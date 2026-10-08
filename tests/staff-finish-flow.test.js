'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/staff-flow-fixture');
const owner={userId:1,token:'owner'};
test('owner totals cover all assignments, remain team-scoped and deny employees',async()=>{
 const f=await fixture();try{
  await f.db.exec(`INSERT INTO staff_ops.work_items(owner_id,member_id,title,status) SELECT 1,1,'Task '||n,CASE WHEN n<=200 THEN 'done' WHEN n=201 THEN 'blocked' ELSE 'in_progress' END FROM generate_series(1,202) n;
   INSERT INTO users VALUES(5,'otherstaff@example.test','Other Staff','customer');
   INSERT INTO staff_ops.members(user_id,owner_id,name) VALUES(5,3,'Other Staff');
   INSERT INTO staff_ops.work_items(owner_id,member_id,title,status) VALUES(3,3,'Other owner task','blocked');`);
  assert.deepEqual(await f.staff.workSummary(owner),{total:202,open:2,blocked:1,in_progress:1,done:200});
  assert.equal((await f.staff.workList(owner,true)).length,200);
  await assert.rejects(f.staff.workSummary({userId:2,token:'staff'}),/Owner access required/);
  const r=await f.request('/owner');assert.equal(r.status,200);assert.match(r.body,/Across all 202 assignments/);assert.match(r.body,/<dt>Blocked<\/dt><dd>1<\/dd>/);
  assert.equal((await f.request('/owner',{token:'staff'})).status,403);
 }finally{await f.close();}
});
test('real route and SQL flow supports assignments, support status, private drafts and immediate revocation',async()=>{
 const f=await fixture();try{
  let r=await f.request('/owner/work',{method:'POST',body:{_csrf:'wrong',member_id:'1',title:'Denied'}});assert.equal(r.status,403);
  r=await f.request('/owner/work',{method:'POST',body:{_csrf:'csrf',member_id:'1',title:'Review support',instructions:'Escalate uncertain evidence'}});assert.equal(r.status,302);assert.equal(r.headers.Location,'/owner/work/1');
  r=await f.request('/staff/work/1',{token:'staff'});assert.equal(r.status,200);assert.match(r.body,/href="\/staff\/support"/);assert.doesNotMatch(r.body,/href="\/owner/);assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers['X-Robots-Tag'],'noindex, nofollow');
  r=await f.request('/staff/work/1',{token:'reader'});assert.equal(r.status,400);assert.match(r.body,/Back to my work/);assert.doesNotMatch(r.body,/href="\/owner/);
  r=await f.request('/staff/work/1',{token:'staff',method:'POST',body:{_csrf:'csrf',version:'1',status:'blocked',note:'Need owner review'}});assert.equal(r.status,302);
  assert.equal((await f.staff.workSummary(owner)).blocked,1);
  r=await f.request('/owner/support/1/manage',{method:'POST',body:{_csrf:'csrf',version:'1',assignee_id:'1',status:'in_progress'}});assert.equal(r.headers.Location,'/owner/support/1?saved=ticket');
  r=await f.request('/staff/support?filter=in_progress',{token:'staff'});assert.match(r.body,/Test support request/);assert.match(r.body,/In progress/);
  r=await f.request('/staff/support/1/draft',{token:'staff',method:'POST',body:{_csrf:'csrf',version:'0',body_text:'Private draft'}});assert.equal(r.headers.Location,'/staff/support/1?saved=draft');
  r=await f.request('/staff/support/1?saved=draft',{token:'staff'});assert.match(r.body,/Draft saved. No email was sent/);assert.match(r.body,/Private draft/);
  assert.doesNotMatch((await f.request('/owner/support/1')).body,/Private draft/);
  r=await f.request('/staff/support/1/draft',{token:'staff',method:'POST',body:{_csrf:'csrf',version:'0',body_text:'Stale draft'}});assert.equal(r.status,400);
  assert.equal((await f.support.get({userId:2,token:'staff'},1)).draft.body_text,'Private draft');
  r=await f.request('/owner/support/1/manage',{method:'POST',body:{_csrf:'csrf',version:'2',assignee_id:'2',status:'resolved'}});assert.equal(r.status,302);
  assert.equal((await f.request('/staff/support/1',{token:'staff'})).status,400);
  r=await f.request('/staff/support/1',{token:'reader'});assert.equal(r.status,200);assert.doesNotMatch(r.body,/Save draft/);
  assert.equal((await f.request('/staff/support/1/draft',{token:'reader',method:'POST',body:{_csrf:'csrf',version:'0',body_text:'Forbidden'}})).status,403);
  assert.equal((await f.request('/owner/support/1',{token:'other'})).status,400);
  await f.staff.update(owner,1,1,'access',{status:'revoked',permissions:[]});
  for(const url of ['/staff','/staff/profile','/staff/guides','/staff/work/1','/staff/support'])assert.equal((await f.request(url,{token:'staff'})).status,403,url);
  await f.db.exec("UPDATE sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE token='owner'");
  r=await f.request('/owner');assert.equal(r.status,302);assert.match(r.headers.Location,/login/);assert.equal(r.headers['Cache-Control'],'no-store');
 }finally{await f.close();}
});

test('isolated HTTP server follows actual form redirects and keeps private responses uncached',async()=>{
 const f=await fixture();try{
  const url=await f.listen();
  const response=await fetch(url+'/owner/work',{method:'POST',headers:{Cookie:'test_session=owner','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:'csrf',member_id:'1',title:'HTTP task'}),redirect:'manual'});
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/owner/work/1');assert.equal(response.headers.get('cache-control'),'no-store');
  const page=await fetch(url+'/staff/work/1',{headers:{Cookie:'test_session=staff'}});assert.equal(page.status,200);assert.match(await page.text(),/HTTP task/);
  const anonymous=await fetch(url+'/owner',{redirect:'manual'});assert.equal(anonymous.status,302);assert.equal(anonymous.headers.get('location'),'/login?next=%2Fowner');
 }finally{await f.close();}
});
