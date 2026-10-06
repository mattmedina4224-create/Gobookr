'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require(process.env.GOBOOKR_PGLITE_MODULE||'@electric-sql/pglite');
const {createStaffStore}=require('../lib/staff-store');const views=require('../lib/staff-views');
test('work queue scopes assignments, revokes access, detects conflicts and rolls back when history fails',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE users(id BIGINT PRIMARY KEY,email TEXT);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id BIGINT,expires_at TIMESTAMPTZ);CREATE TABLE admin_accounts(user_id BIGINT PRIMARY KEY);
   INSERT INTO users VALUES(1,'owner@test.invalid'),(2,'staff@test.invalid'),(3,'other@test.invalid'),(4,'otherstaff@test.invalid');
   INSERT INTO sessions VALUES('owner',1,CURRENT_TIMESTAMP+INTERVAL '1 day'),('staff',2,CURRENT_TIMESTAMP+INTERVAL '1 day'),('other',3,CURRENT_TIMESTAMP+INTERVAL '1 day'),('otherstaff',4,CURRENT_TIMESTAMP+INTERVAL '1 day');`);
  for(const name of ['schema.sql','work.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../db/staff-portal',name),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../db/staff-portal/work.sql'),'utf8'));
  await db.exec("INSERT INTO staff_ops.owners(user_id) VALUES(1),(3);INSERT INTO staff_ops.members(user_id,owner_id,name) VALUES(2,1,'Staff'),(4,3,'Other staff')");
  const pool={query:(q,a)=>db.query(q,a),async connect(){return{query:(q,a)=>db.query(q,a),release(){}};}};const s=createStaffStore(pool);
  const owner={userId:1,token:'owner'},staff={userId:2,token:'staff'},other={userId:3,token:'other'},otherStaff={userId:4,token:'otherstaff'};
  await assert.rejects(s.workAdd(staff,{member_id:1,title:'Bad'}),/Owner access required/);
  await assert.rejects(s.workAdd(owner,{member_id:2,title:'Other team'}),/not found/);
  const w=await s.workAdd(owner,{member_id:1,title:'Review evidence',instructions:'Ask owner if uncertain'});
  assert.equal((await s.workList(staff)).length,1);assert.equal((await s.workList(other,true)).length,0);assert.equal((await s.workList(otherStaff)).length,0);
  await assert.rejects(s.workGet(otherStaff,w.id),/not found/);await assert.rejects(s.workUpdate(other,w.id,1,{status:'done'},true),/unavailable/);
  await s.workUpdate(staff,w.id,1,{status:'in_progress',note:'Checking'});
  await assert.rejects(s.workUpdate(staff,w.id,1,{status:'done'}),/changed/);
  assert.equal((await s.workGet(owner,w.id,true)).events.length,2);
  assert.deepEqual((await db.query('SELECT permissions FROM staff_ops.members WHERE id=1')).rows[0].permissions,[]);
  await db.exec("CREATE FUNCTION staff_ops.break_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history unavailable';END $$;CREATE TRIGGER break_history BEFORE INSERT ON staff_ops.work_events FOR EACH ROW EXECUTE FUNCTION staff_ops.break_history()");
  await assert.rejects(s.workUpdate(staff,w.id,2,{status:'done'}),/history unavailable/);
  assert.equal((await s.workGet(staff,w.id)).status,'in_progress');
  await db.exec("UPDATE staff_ops.members SET status='revoked' WHERE id=1");
  await assert.rejects(s.workList(staff),/Staff access required/);await assert.rejects(s.workUpdate(staff,w.id,2,{status:'done'}),/Staff access required/);
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM staff_ops.work_items'),/permission denied/);await db.exec('RESET ROLE');}
 }finally{await db.close();}
});
test('employee workspace escapes untrusted task text and never exposes owner controls or email links',()=>{
 const m={name:'Staff',permissions:['claims.read']};const html=views.dashboard(m,[{id:1,title:'<img src=x onerror=alert(1)>',status:'blocked'}]);
 assert.match(html,/My work/);assert.match(html,/&lt;img/);assert.ok(!html.includes('<img'));assert.ok(!html.includes('/owner'));assert.ok(!html.includes('/admin/licenses'));assert.match(html,/Not connected yet/);
 const task=views.workDetail({id:1,title:'Task',instructions:'<script>x</script>',status:'blocked',version:2,events:[{status:'blocked',note:'<a href="javascript:x">X</a>',created_at:'now'}]},'csrf');
 assert.ok(!task.includes('<script>'));assert.ok(!task.includes('href="javascript'));assert.match(task,/name="version" value="2"/);assert.match(task,/name="_csrf" value="csrf"/);
});
