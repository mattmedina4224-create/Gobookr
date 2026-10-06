'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PGlite}=require(process.env.GOBOOKR_PGLITE_MODULE||'@electric-sql/pglite');
const {createStaffStore}=require('../lib/staff-store');
const views=require('../lib/staff-views');
const {permissionForRequest}=require('../lib/staff-route-permissions');
async function fixture(){
  const db=new PGlite();
  await db.exec(`CREATE TABLE public.users(id BIGINT PRIMARY KEY,email TEXT,name TEXT);
    CREATE TABLE public.sessions(token TEXT PRIMARY KEY,user_id BIGINT,expires_at TIMESTAMPTZ);
    CREATE TABLE public.admin_accounts(user_id BIGINT PRIMARY KEY);
    CREATE ROLE anon; CREATE ROLE authenticated;
    INSERT INTO users VALUES(1,'owner@example.test','Owner'),(2,'employee@example.test','Employee'),(3,'other@example.test','Other'),(4,'admin@example.test','Admin');
    INSERT INTO admin_accounts VALUES(4);
    INSERT INTO sessions VALUES('owner',1,CURRENT_TIMESTAMP+INTERVAL '1 day'),('employee',2,CURRENT_TIMESTAMP+INTERVAL '1 day'),('other',3,CURRENT_TIMESTAMP+INTERVAL '1 day');`);
  const sql=fs.readFileSync(path.join(__dirname,'../db/staff-portal/schema.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  await db.exec('INSERT INTO staff_ops.owners(user_id) VALUES(1),(3)');
  let previous=Promise.resolve();
  const pool={query:(s,a)=>db.query(s,a),async connect(){let release;const next=new Promise(r=>release=r);const wait=previous;previous=next;await wait;return{query:(s,a)=>db.query(s,a),release};}};
  return{db,pool,store:createStaffStore(pool)};
}
const actor={userId:1,token:'owner'};
const input={name:'Employee',email:'employee@example.test',job_title:'Support specialist',permissions:['claims.review'],identity_confirmed:'yes'};
test('employee lifecycle is scoped, audited, revocable and protects elevated accounts',async()=>{
  const {db,store}=await fixture();try{
    await assert.rejects(store.add({userId:2,token:'employee'},input),/Owner/);
    await assert.rejects(store.add(actor,{...input,identity_confirmed:''}),/Confirm/);
    await assert.rejects(store.add(actor,{...input,email:'admin@example.test'}),/elevated/);
    await assert.rejects(store.add(actor,{...input,email:'owner@example.test'}),/existing/);
    await assert.rejects(store.add(actor,{...input,permissions:['staff.manage']}),/Invalid/);
    const member=await store.add(actor,input), id=Number(member.id);
    assert.deepEqual(member.permissions,['claims.read','claims.review']);
    assert.equal((await store.list(actor)).length,1);
    assert.equal((await store.list({userId:3,token:'other'})).length,0);
    await assert.rejects(store.get({userId:3,token:'other'},id),/not found/);
    await assert.rejects(store.add(actor,input),/already/);
    assert.equal((await store.self({userId:2,token:'employee'})).name,'Employee');
    await assert.rejects(store.self({userId:2,token:'owner'}),/access/);
    const updated=await store.update(actor,id,1,'personal',{name:'Updated employee',phone:'555-0100'});
    assert.equal(updated.version,2);assert.equal(updated.phone,'555-0100');
    await assert.rejects(store.update(actor,id,1,'personal',{name:'Stale',phone:''}),/reload/);
    await assert.rejects(store.update({userId:3,token:'other'},id,2,'job',{job_title:'Other',department:''}),/reload/);
    const changed=await store.update(actor,id,2,'job',{job_title:'Operations',department:'Support'});
    assert.equal(changed.version,3);
    await store.update(actor,id,3,'access',{status:'revoked',permissions:[]});
    await assert.rejects(store.self({userId:2,token:'employee'}),/access/);
    assert.equal((await store.get(actor,id)).status,'revoked');
    const audit=(await db.query('SELECT action,version FROM staff_ops.audit ORDER BY id')).rows;
    assert.deepEqual(audit.map(x=>x.action),['added','personal_updated','job_updated','access_updated']);
    await db.exec("UPDATE sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE token='owner'");
    await assert.rejects(store.list(actor),/Owner/);
    await assert.rejects(store.update(actor,id,4,'access',{status:'active',permissions:[]}),/Owner/);
    assert.equal((await db.query('SELECT COUNT(*)::INT n FROM staff_ops.audit')).rows[0].n,4);
    assert.equal((await db.query('SELECT COUNT(*)::INT n FROM admin_accounts')).rows[0].n,1);
  }finally{await db.close();}
});
test('audit failure rolls back employee change; client roles cannot read or write staff records',async()=>{
  const {db,pool,store}=await fixture();try{
    const member=await store.add(actor,input),id=Number(member.id);
    const failing=createStaffStore({query:pool.query,async connect(){const c=await pool.connect();return{release:c.release,query(s,a){if(s.startsWith('INSERT INTO staff_ops.audit'))throw new Error('Audit failure');return c.query(s,a);}};}});
    await assert.rejects(failing.update(actor,id,1,'personal',{name:'Should roll back',phone:''}),/Audit failure/);
    assert.equal((await store.get(actor,id)).name,'Employee');
    for(const role of ['anon','authenticated']){
      await db.exec(`SET ROLE ${role}`);
      for(const sql of ['SELECT * FROM staff_ops.members','UPDATE staff_ops.members SET status=\'active\'','DELETE FROM staff_ops.members','SELECT * FROM staff_ops.audit','INSERT INTO staff_ops.owners(user_id) VALUES(2)'])await assert.rejects(db.query(sql),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('GRANT USAGE ON SCHEMA staff_ops TO authenticated; GRANT SELECT ON staff_ops.members TO authenticated; SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM staff_ops.members')).rows.length,0,'RLS denies accidental read grants');
    await db.exec('RESET ROLE');
  }finally{await db.close();}
});
test('Square-style pages escape employee data, label payroll honestly, and distinguish owner and employee controls',()=>{
  const member={id:7,name:'<script>alert(1)</script>',email:'test@example.test',job_title:'Operations',phone:'',department:'Support',status:'active',permissions:['claims.read'],version:1};
  const html=views.employee(member);
  for(const title of ['Personal','Job','Access','Payroll'])assert.match(html,new RegExp('<h2>'+title));
  assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
  assert.match(html,/Not connected/);assert.ok(!html.includes('POS passcode'));
  assert.match(html,/\/owner\/staff\/7\/edit\/access/);
  const own=views.employee(member,{readOnly:true});assert.ok(!own.includes('/owner'));assert.ok(!own.includes('Edit access'));
  assert.match(views.form({member,section:'access',csrf:'safe-token'}),/name="_csrf" value="safe-token"/);
  assert.match(views.form({member,section:'access',csrf:'safe-token'}),/name="version" value="1"/);
  assert.ok(!views.payroll().includes('<button'));
  assert.match(views.roster([]),/Your team starts here/);
  const preview=views.employee({...member,id:0,name:'Employee page preview'},{preview:true});
  assert.match(preview,/Design preview only/);assert.ok(!preview.includes('/owner/staff/0/edit'));assert.ok(!preview.includes('Active access'));
  const css=fs.readFileSync(path.join(__dirname,'../public/staff-portal.css'),'utf8');
  assert.match(css,/min-height:44px/);assert.match(css,/min-width:0/);
});
test('direct admin requests map to narrowly scoped permissions; unknown routes deny',()=>{
  assert.equal(permissionForRequest({method:'GET',url:'/admin/licenses?x=y'}),'licenses.read');
  assert.equal(permissionForRequest({method:'POST',url:'/admin/licenses/7/verify'}),'licenses.review');
  assert.equal(permissionForRequest({method:'POST',url:'/admin/profile-claims/7/approve'}),'claims.review');
  assert.equal(permissionForRequest({method:'GET',url:'/admin/new-pros'}),'inventory.read');
  for(const url of ['/admin/payroll/run','/admin/staff','/admin/licenses/-1/verify','/admin/licenses/7/revoke'])assert.equal(permissionForRequest({method:'POST',url}),null);
});
test('admin guard uses fresh staff grants and rejects read-only write attempts and revoked memberships',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../lib/admin.js'),'utf8');let granted=['claims.read'],queries=[];
  const module={exports:{}};let denied=0;
  vm.runInNewContext(source,{module,process:{env:{GOBOOKR_STAFF_PORTAL_ENABLED:'true'}},require(id){
    if(id==='../db')return{prepare(sql){queries.push(sql);return{get(){return sql.includes('staff_ops.members')?granted?{permissions:granted}:null:null;}};}};
    if(id==='./http')return{send(){denied++;},redirect(){denied++;}};
    if(id==='./staff-route-permissions')return{permissionForRequest};throw new Error(id);
  }});
  const ctx={currentUser:{id:2},session:{token:'employee'},req:{method:'GET',url:'/admin/profile-claims'}};
  assert.equal(module.exports.requireAdmin(ctx),true);
  assert.equal(module.exports.requireAdmin({...ctx,req:{method:'POST',url:'/admin/profile-claims/7/approve'}}),false);
  granted=['claims.read','claims.review'];assert.equal(module.exports.requireAdmin({...ctx,req:{method:'POST',url:'/admin/profile-claims/7/approve'}}),true);
  granted=null;assert.equal(module.exports.requireAdmin(ctx),false);
  assert.ok(queries.every(q=>q.trim().startsWith('WITH')));assert.equal(denied,2);
});
test('portal routes are dormant by default, require owner access and reject forged forms',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../routes/staff.js'),'utf8');
  const module={exports:{}};const routes=new Map();let mutations=0,reads=0;
  const fakeStore={async list(){reads++;return[];},async add(){mutations++;return{id:7};},async get(){throw new Error('Owner access required');}};
  vm.runInNewContext(source,{module,process:{env:{}},require(id){
    if(id==='../lib/layout')return{layout:({body})=>body};
    if(id==='../lib/http')return{send(res,body,status=200){res.status=status;res.body=body;},redirect(res,url){res.status=302;res.url=url;},flashFromQuery(){return null;}};
    if(id==='../lib/util')return{escapeHtml:v=>String(v)};
    if(id==='../lib/staff-views')return views;
    if(id==='../lib/staff-store')return require('../lib/staff-store');
    throw new Error('Unexpected dependency '+id);
  }});
  const router={get(p,h){routes.set('GET '+p,h);},post(p,h){routes.set('POST '+p,h);}};
  module.exports(router,{store:fakeStore});
  const ctx=()=>({res:{setHeader(){}},currentUser:{id:1},session:{token:'owner',csrf_token:'csrf'},params:{id:'7',section:'access'},query:{},body:{email:'employee@example.test'}});
  const disabled=ctx();await routes.get('GET /owner')(disabled);assert.equal(disabled.res.status,404);assert.equal(reads,0);
  module.exports(router,{enabled:()=>true,store:fakeStore});
  const anonymous=ctx();anonymous.currentUser=null;await routes.get('GET /owner')(anonymous);assert.equal(anonymous.res.status,302);assert.equal(reads,0);
  const staffLogin=ctx();staffLogin.currentUser=null;staffLogin.req={url:'/staff'};await routes.get('GET /staff')(staffLogin);assert.equal(staffLogin.res.url,'/login?next=%2Fstaff');
  const home=ctx();await routes.get('GET /owner')(home);assert.equal(home.res.status,200);assert.equal(reads,1);
  const forged=ctx();await routes.get('POST /owner/staff')(forged);assert.equal(forged.res.status,403);assert.equal(mutations,0);
  const good=ctx();good.body._csrf='csrf';await routes.get('POST /owner/staff')(good);assert.equal(good.res.url,'/owner/staff/7');assert.equal(mutations,1);
  for(const endpoint of ['POST /owner/work','POST /staff/work/:id','POST /owner/work/:id']){const attempt=ctx();await routes.get(endpoint)(attempt);assert.equal(attempt.res.status,403);}
  const forbidden=ctx();await routes.get('GET /owner/staff/:id')(forbidden);assert.equal(forbidden.res.status,403);
});
