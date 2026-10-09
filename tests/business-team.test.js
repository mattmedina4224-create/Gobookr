'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
function database() {
 const worker=new Worker(path.join(__dirname,'helpers/claim-postgres-worker.js'));
 function call(op,sql,args=[]) {const signalBuffer=new SharedArrayBuffer(4),{port1,port2}=new MessageChannel();worker.postMessage({op,sql,args,signalBuffer,responsePort:port2},[port2]);if(Atomics.wait(new Int32Array(signalBuffer),0,0,30000)==='timed-out')throw Error('DB timeout');const result=receiveMessageOnPort(port1).message;port1.close();if(result.error)throw Error(result.error);return result.value;}
 return {exec:sql=>call('exec',sql),prepare:sql=>({get:(...args)=>call('get',sql,args),all:(...args)=>call('all',sql,args),run:(...args)=>call('run',sql,args)}),close:async()=>{call('close','');await worker.terminate();}};
}
function load(file,deps={}) {const filename=path.join(__dirname,'..',file),module={exports:{}};const local=createRequire(filename);vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:n=>Object.hasOwn(deps,n)?deps[n]:local(n),process:{env:{BUSINESS_TEAMS_ENABLED:'1'}},console:{error(){}},Date,Set,URL});return module.exports;}
const schema=[
"CREATE ROLE anon;CREATE ROLE authenticated;",
"CREATE TABLE users(id BIGINT PRIMARY KEY,email TEXT,role TEXT,name TEXT);",
"CREATE TABLE shops(id BIGINT PRIMARY KEY,owner_user_id BIGINT,name TEXT,claim_status TEXT);",
"CREATE TABLE pro_profiles(id BIGINT PRIMARY KEY,user_id BIGINT,business_name TEXT,claim_status TEXT,onboarding_completed INTEGER,initials TEXT);",
"CREATE TABLE subscriptions(id BIGSERIAL PRIMARY KEY,pro_id BIGINT UNIQUE,status TEXT,stripe_subscription_id TEXT,trial_ends_at TIMESTAMPTZ);",
"INSERT INTO users VALUES(1,'owner@example.com','customer','Owner'),(2,'pro@example.com','pro','Pro'),(3,'other@example.com','pro','Other'),(4,'second@example.com','pro','Second');",
"INSERT INTO shops VALUES(10,1,'Fixture Barbers','claimed'),(20,3,'Second Business','claimed');",
"INSERT INTO pro_profiles VALUES(12,2,'First Pro','claimed',1,'FP'),(13,3,'Second Pro','claimed',1,'SP'),(14,4,'Third Pro','claimed',1,'TP');",
"INSERT INTO subscriptions(pro_id,status,trial_ends_at) VALUES(12,'canceled',NULL),(13,'trialing',CURRENT_TIMESTAMP+INTERVAL '30 days'),(14,'canceled',NULL);"
].join('\n');
function harness(db) {
 const calls=[];let failure=false,quantity=0;
 const price={id:'price_20',active:true,currency:'usd',unit_amount:2000,type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 const subscription=()=>({id:'sub_team',metadata:{business_team_shop_id:'10',business_team_key:db.prepare('SELECT checkout_key FROM business_team_plans WHERE shop_id=10').get()?.checkout_key},customer:'cus_team',status:'active',items:{data:[{id:'si_team',quantity,price,current_period_end:Math.floor(Date.now()/1000)+864000}]}});
 const stripe={checkout:async p=>{calls.push({kind:'checkout',...p});if(failure)throw Error('Timeout');quantity=p.quantity;return {id:'cs_team',url:'https://checkout.stripe.com/fixture',expires_at:p.expiresAt};},updateQuantity:async p=>{calls.push({kind:'update',...p});if(failure)throw Error('Timeout');if(p.quantity===0)return {...subscription(),cancel_at_period_end:true};quantity=p.quantity;return subscription();},expireCheckout:async()=>{},retrieveCheckout:async()=>({status:'open',url:'https://checkout.stripe.com/fixture'}),retrieveSubscription:async()=>subscription()};
 const team=load('lib/business-team.js',{'../db':db,'./business-team-stripe':stripe});
 const routes={},router={get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f};
 load('routes/business-team.js',{'../db':db,'../lib/business-team':team,'../lib/layout':{layout:x=>(x.flash?.message||'')+x.body},'../lib/stripe':{businessTeamBillingConfigured:()=>true,createPortalSession:async()=>({url:'https://billing.stripe.com/mock'})}})(router);
 async function request(method,p,userId,body={}) {const user=userId?db.prepare('SELECT * FROM users WHERE id=?').get(userId):null;const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};await routes[method+' '+p]({currentUser:user,session:{csrf_token:'csrf'},res,body,query:{},params:{}});return res;}
 return {team,calls,subscription,request,setFailure:v=>failure=v};
}
function initialize() {const db=database();db.exec(schema);db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/20261009064029_business_sponsored_professionals.sql'),'utf8'));db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/20261009065235_personal_checkout_sponsorship_fencing.sql'),'utf8'));return db;}
test('business teams require ownership, explicit price consent, matching account and a claimed pro',async()=>{
 const db=initialize();try {
 const h=harness(db);
 const denied=await h.request('POST','/dashboard/shop/team/invite',4,{email:'pro@example.com'});assert.equal(denied.status,403);assert.equal(db.prepare('SELECT count(*) AS n FROM business_team_members').get().n,0);
 await h.request('POST','/dashboard/shop/team/invite',1,{email:' PRO@EXAMPLE.COM '});await h.request('POST','/dashboard/shop/team/invite',1,{email:'pro@example.com'});
 assert.equal(db.prepare('SELECT count(*) AS n FROM business_team_members').get().n,1);
 await h.request('POST','/dashboard/pro/team/respond',3,{member_id:1,action:'accept'});assert.equal(db.prepare('SELECT status FROM business_team_members WHERE id=1').get().status,'pending');
 await h.request('POST','/dashboard/pro/team/respond',2,{member_id:1,action:'accept'});
 assert.equal(db.prepare('SELECT pro_id FROM business_team_members WHERE id=1').get().pro_id,12);
 assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=12').get().user_id,2);
 await h.request('POST','/dashboard/shop/team/activate',1,{});assert.equal(h.calls.length,0);
 const accepted=await h.request('POST','/dashboard/shop/team/activate',1,{confirm:'1'});assert.match(accepted.headers.Location,/checkout.stripe.com/);assert.equal(h.calls[0].quantity,1);
 assert.equal(h.team.coverage([12]).length,0);
 h.team.sync(h.subscription());assert.equal(h.team.coverage([12]).length,1);
 assert.match((await h.request('GET','/dashboard/shop/team',1)).body,/Sponsored by your business/);
 assert.match((await h.request('GET','/dashboard/pro/team',2)).body,/Fixture Barbers/);
 assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,4);
 }finally {await db.close();}
});
test('paid team removal reduces renewal, preserves profiles, and final member schedules cancellation',async()=>{
 const db=initialize();try {const h=harness(db);h.team.ensurePlan(10);
 h.team.invite(10,'pro@example.com');h.team.accept(db.prepare('SELECT * FROM users WHERE id=2').get(),1);
 h.team.invite(10,'second@example.com');h.team.accept(db.prepare('SELECT * FROM users WHERE id=4').get(),2);
 await h.team.activate(10,'owner@example.com');h.team.sync(h.subscription());assert.equal(h.team.coverage([12,14]).length,2);
 await h.team.remove(10,1);assert.equal(h.calls.at(-1).quantity,1);assert.equal(h.team.coverage([12,14]).length,1);
 assert.equal(db.prepare('SELECT billing_owner FROM subscriptions WHERE pro_id=12').get().billing_owner,'personal');
 assert.equal(db.prepare('SELECT user_id FROM pro_profiles WHERE id=12').get().user_id,2);
 await h.team.remove(10,2);assert.equal(h.calls.at(-1).quantity,0);assert.equal(h.team.coverage([12,14]).length,0);
 assert.equal(h.team.plan(10).cancel_at_period_end,1);assert.equal(db.prepare('SELECT count(*) AS n FROM pro_profiles').get().n,3);
 }finally{await db.close();}
});
test('failed billing retries reuse the same key and preserve membership until confirmed',async()=>{
 const db=initialize();try {const h=harness(db);h.team.ensurePlan(10);h.team.invite(10,'pro@example.com');h.team.accept(db.prepare('SELECT * FROM users WHERE id=2').get(),1);
 h.setFailure(true);await assert.rejects(h.team.activate(10,'owner@example.com'),/Timeout/);const key=h.calls[0].key;assert.equal(h.team.coverage([12]).length,0);
 h.setFailure(false);await h.team.activate(10,'owner@example.com');assert.equal(h.calls[1].key,key);assert.equal(h.calls[1].expiresAt,h.calls[0].expiresAt);
 h.team.sync(h.subscription());h.setFailure(true);await assert.rejects(h.team.remove(10,1),/Timeout/);assert.equal(db.prepare('SELECT status FROM business_team_members WHERE id=1').get().status,'accepted');
 h.setFailure(false);await h.team.remove(10,1);assert.equal(h.calls.at(-1).key,h.calls.at(-2).key);
 }finally{await db.close();}
});
test('personal checkout, paid personal plans, expired invites and second businesses cannot overlap sponsorship',async()=>{
 const db=initialize();try {const h=harness(db),pro=db.prepare('SELECT * FROM users WHERE id=2').get();
 h.team.ensurePlan(10);h.team.invite(10,'pro@example.com');const checkoutKey=h.team.reservePersonalCheckout(12);assert.equal(h.team.reservePersonalCheckout(12),checkoutKey);
 assert.throws(()=>h.team.accept(pro,1),/expired|no longer/);
 db.exec("UPDATE subscriptions SET personal_checkout_until=NULL,stripe_subscription_id='sub_personal',status='active' WHERE pro_id=12");
 assert.throws(()=>h.team.accept(pro,1),/individual subscription/);
 db.exec("UPDATE subscriptions SET stripe_subscription_id=NULL,status='canceled' WHERE pro_id=12");h.team.accept(pro,1);
 assert.throws(()=>h.team.reservePersonalCheckout(12),/already pending/);
 h.team.invite(20,'pro@example.com');assert.throws(()=>h.team.accept(pro,2));
 assert.equal(db.prepare("SELECT count(*) AS n FROM business_team_members WHERE status='accepted'").get().n,1);
 h.team.invite(10,'second@example.com');db.exec("UPDATE business_team_members SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 day' WHERE id=3");assert.throws(()=>h.team.accept(db.prepare('SELECT * FROM users WHERE id=4').get(),3));
 }finally{await db.close();}
});
test('payment failure grace, delayed old subscriptions and RLS fail closed',async()=>{
 const db=initialize();try {const h=harness(db);h.team.ensurePlan(10);h.team.invite(10,'pro@example.com');h.team.accept(db.prepare('SELECT * FROM users WHERE id=2').get(),1);await h.team.activate(10,'owner@example.com');h.team.sync(h.subscription());
 h.team.sync({...h.subscription(),id:'sub_other',status:'canceled'});assert.equal(h.team.plan(10).status,'active');
 h.team.sync({...h.subscription(),status:'past_due'});assert.equal(h.team.coverage([12]).length,1);
 db.exec("UPDATE business_team_plans SET past_due_since=CURRENT_TIMESTAMP-INTERVAL '8 days'");assert.equal(h.team.coverage([12]).length,0);
 h.team.sync({...h.subscription(),status:'canceled'});assert.equal(h.team.coverage([12]).length,0);
 const checks=db.prepare("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('business_team_members','business_team_plans')").all();assert.ok(checks.every(r=>r.relrowsecurity));
 db.exec('SET ROLE anon');assert.throws(()=>db.prepare('SELECT * FROM business_team_members').all(),/permission denied/);db.exec('RESET ROLE');
 db.exec('SET ROLE authenticated');assert.throws(()=>db.prepare('SELECT * FROM business_team_plans').all(),/permission denied/);db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('20 seats use one $20 monthly price and quantity updates do not trigger prorated charges',async()=>{
 const calls=[];
 const price={id:'price_20',active:true,currency:'usd',unit_amount:2000,type:'recurring',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
 const stripe=load('lib/business-team-stripe.js',{'./stripe':{businessTeamBillingConfigured:()=>true,professionalPriceId:async()=>price.id,cleanBaseUrl:()=> 'https://gobookr.example',isProfessionalPrice:p=>p.unit_amount===2000,retrieveSubscription:async()=>({status:'active',items:{data:[{id:'si_team',quantity:20,price}]}}),stripeRequest:async(...args)=>{calls.push(args);return {};}}});
 await stripe.checkout({shopId:10,email:'owner@example.com',quantity:20,key:'stable-checkout',expiresAt:12345});
 assert.equal(calls[0][1]['line_items[0][quantity]'],20);assert.equal(calls[0][1]['line_items[0][price]'],'price_20');assert.equal(calls[0][3],'stable-checkout');assert.equal(20*price.unit_amount,40000);
 await stripe.updateQuantity({subscriptionId:'sub_team',quantity:19,key:'stable-update'});assert.equal(calls[1][1].proration_behavior,'none');assert.equal(calls[1][1]['items[0][quantity]'],19);
 await stripe.updateQuantity({subscriptionId:'sub_team',quantity:0,key:'stable-cancel'});assert.equal(calls[2][1].cancel_at_period_end,true);
 await assert.rejects(stripe.checkout({shopId:10,email:'owner@example.com',quantity:501,key:'bad'}));assert.equal(calls.length,3);
});
test('sponsored visibility reaches discovery hydration and requires completed onboarding',async()=>{
 const db=initialize();try {const h=harness(db);h.team.ensurePlan(10);h.team.invite(10,'pro@example.com');h.team.accept(db.prepare('SELECT * FROM users WHERE id=2').get(),1);await h.team.activate(10,'owner@example.com');h.team.sync(h.subscription());
 db.exec('CREATE TABLE reviews(pro_id BIGINT,rating INTEGER);CREATE TABLE pro_categories(pro_id BIGINT,category TEXT);CREATE TABLE portfolio_items(id BIGSERIAL,pro_id BIGINT,image_url TEXT,caption TEXT);CREATE TABLE services(id BIGSERIAL,pro_id BIGINT,price INTEGER);');
 const sub=load('lib/subscription.js',{'../db':db,'./business-team':h.team});
 const listing=load('lib/pro-listing-data.js',{'../db':db,'./subscription':sub,'./business-team':h.team});
 const profiles=db.prepare('SELECT * FROM pro_profiles WHERE id=12').all();assert.equal(listing.hydratePros(profiles).length,1);assert.equal(sub.isProPubliclyVisible(12),true);
 db.exec('UPDATE pro_profiles SET onboarding_completed=0 WHERE id=12');assert.equal(sub.isProPubliclyVisible(12),false);assert.equal(listing.hydratePros(db.prepare('SELECT * FROM pro_profiles WHERE id=12').all()).length,0);
 }finally{await db.close();}
});
