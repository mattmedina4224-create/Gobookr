'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {PGlite}=require(process.env.GOBOOKR_PGLITE_MODULE||'@electric-sql/pglite');
const {createSupportStore}=require('../lib/support-store');const views=require('../lib/support-views');const {permissions}=require('../lib/staff-store');
test('support inbox enforces tenant, assignment, fresh sessions, separate reply access and atomic audit',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE users(id BIGINT PRIMARY KEY,email TEXT);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id BIGINT,expires_at TIMESTAMPTZ);CREATE TABLE admin_accounts(user_id BIGINT PRIMARY KEY);
   INSERT INTO users VALUES(1,'owner@test.invalid'),(2,'staff@test.invalid'),(3,'other@test.invalid'),(4,'otherstaff@test.invalid');INSERT INTO sessions VALUES('owner',1,CURRENT_TIMESTAMP+INTERVAL '1 day'),('staff',2,CURRENT_TIMESTAMP+INTERVAL '1 day'),('other',3,CURRENT_TIMESTAMP+INTERVAL '1 day'),('otherstaff',4,CURRENT_TIMESTAMP+INTERVAL '1 day');`);
  for(const name of ['schema.sql','support.sql','support.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../db/staff-portal',name),'utf8'));
  await db.exec(`INSERT INTO staff_ops.owners(user_id) VALUES(1),(3);INSERT INTO staff_ops.members(user_id,owner_id,name,permissions) VALUES(2,1,'Staff',ARRAY['support.read']),(4,3,'Other staff',ARRAY['support.read']);
   INSERT INTO staff_ops.support_tickets(owner_id,provider_thread_key,subject) VALUES(1,'test-thread','Test only'),(3,'other-thread','Other team');INSERT INTO staff_ops.support_messages(ticket_id,provider_message_key,sender,body_text,received_at) VALUES(1,'test-message','customer@test.invalid','Test body',CURRENT_TIMESTAMP);`);
  const pool={query:(q,a)=>db.query(q,a),async connect(){return{query:(q,a)=>db.query(q,a),release(){}};}};const s=createSupportStore(pool);
  const owner={userId:1,token:'owner'},staff={userId:2,token:'staff'},other={userId:3,token:'other'},otherStaff={userId:4,token:'otherstaff'};
  assert.equal((await s.list(staff)).length,0);assert.equal((await s.list(owner,true))[0].unread,true);
  await assert.rejects(s.get(staff,1),/not found/);await assert.rejects(s.get(other,1,true),/not found/);await assert.rejects(s.get(otherStaff,1),/not found/);
  await assert.rejects(s.update(owner,1,1,{assignee_id:'2',status:'open'}),/needs active/);
  await s.update(owner,1,1,{assignee_id:'1',status:'open'});assert.equal((await s.list(staff))[0].unread,true);
  await assert.rejects(s.update(owner,1,1,{assignee_id:'1',status:'resolved'}),/changed/);
  await s.markRead(staff,1);assert.equal((await s.list(staff))[0].unread,false);assert.equal((await s.list(owner,true))[0].unread,true);
  await assert.rejects(s.saveDraft(staff,1,0,'Reply'),/access required/);
  assert.deepEqual(permissions(['support.reply']),['support.read','support.reply']);
  await db.exec("UPDATE staff_ops.members SET permissions=ARRAY['support.read','support.reply'] WHERE id=1");
  await s.saveDraft(staff,1,0,'Reply');await assert.rejects(s.saveDraft(staff,1,0,'Conflict'),/changed/);
  assert.equal((await s.get(staff,1)).draft.body_text,'Reply');assert.equal((await s.get(owner,1,true)).draft,undefined);
  await db.exec("CREATE FUNCTION staff_ops.break_support_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable';END $$;CREATE TRIGGER break_history BEFORE INSERT ON staff_ops.support_events FOR EACH ROW EXECUTE FUNCTION staff_ops.break_support_history()");
  await assert.rejects(s.update(owner,1,2,{assignee_id:'1',status:'resolved'}),/audit unavailable/);assert.equal((await s.get(owner,1,true)).status,'open');
  await assert.rejects(s.saveDraft(staff,1,1,'Should roll back'),/audit unavailable/);assert.equal((await s.get(staff,1)).draft.body_text,'Reply');
  await db.exec("UPDATE staff_ops.members SET status='revoked' WHERE id=1");await assert.rejects(s.list(staff),/access required/);await assert.rejects(s.get(staff,1),/access required/);
  await assert.rejects(s.list({...owner,token:'bad'},true),/access required/);
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM staff_ops.support_messages'),/permission denied/);await db.exec('RESET ROLE');}
 }finally{await db.close();}
});
test('support views block active email content and distinguish drafts from sending',()=>{
 const t={id:1,subject:'<script>bad</script>',status:'open',version:1,messages:[{sender:'<img src=x>',body_text:'<img src="https://evil.invalid/pixel"><a href="javascript:bad">bad</a>'}],events:[],draft:{body_text:'</textarea><script>bad</script>',version:1}};
 const html=views.detail(t,[],false,true,'csrf');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript'));assert.match(html,/No email will be sent/);assert.match(html,/name="_csrf" value="csrf"/);assert.ok(!html.includes('/owner'));assert.match(html,/&lt;\/textarea&gt;/);
 const readOnly=views.detail(t,[],false,false,'csrf');assert.ok(!readOnly.includes('/draft'));assert.ok(!readOnly.includes('/manage'));
 assert.match(views.inbox([],true),/No support tickets yet/);assert.match(views.inbox([],false),/Microsoft 365 is not connected/);
});
test('support routes reject anonymous, disabled and forged requests before invoking store',async()=>{
 const module={exports:{}};const source=fs.readFileSync(path.join(__dirname,'../routes/support.js'),'utf8');let calls=0;
 const http={send(r,body,status=200){r.status=status;r.body=body;},redirect(r,url){r.status=302;r.url=url;}};
 vm.runInNewContext(source,{module,process:{env:{}},console:{error(){}},require(id){if(id==='../lib/layout')return{layout:({body})=>body};if(id==='../lib/http')return http;if(id==='../lib/util')return require('../lib/util');if(id==='../lib/support-views')return views;if(id==='../lib/support-store')return{createSupportStore};throw Error(id);}});
 const handlers=new Map(),router={get(p,h){handlers.set('get '+p,h);},post(p,h){handlers.set('post '+p,h);}};
 const s={async list(){calls++;return[];},async markRead(){calls++;},async saveDraft(){calls++;},async update(){calls++;}};
 const ctx=()=>({res:{setHeader(){}},currentUser:{id:1},session:{token:'owner',csrf_token:'csrf'},params:{id:'1'},body:{},query:{}});
 module.exports(router,{store:s,staffStore:()=>({})});let c=ctx();await handlers.get('get /owner/support')(c);assert.equal(c.res.status,404);
 module.exports(router,{enabled:()=>true,store:s,staffStore:()=>({})});c=ctx();c.currentUser=null;await handlers.get('get /staff/support')(c);assert.equal(c.res.url,'/login?next=%2Fstaff%2Fsupport');
 for(const url of ['/owner/support/:id/read','/owner/support/:id/manage','/owner/support/:id/draft','/staff/support/:id/read','/staff/support/:id/draft']){c=ctx();await handlers.get('post '+url)(c);assert.equal(c.res.status,403);}
 assert.equal(calls,0);c=ctx();c.body._csrf='csrf';await handlers.get('post /owner/support/:id/read')(c);assert.equal(calls,1);assert.equal(c.res.url,'/owner/support/1');assert.equal(handlers.has('post /staff/support/:id/manage'),false);
});
