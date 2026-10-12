'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {Readable}=require('node:stream');
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
const root=path.join(__dirname,'..');
function load(file,overrides={},globals={}){
 const filename=path.join(root,file),local=createRequire(filename),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,Buffer,URL,URLSearchParams,AbortSignal,console,__dirname:path.dirname(filename),process:{env:{}},require:name=>Object.hasOwn(overrides,name)?overrides[name]:local(name),...globals});return module.exports;
}
const config=()=>({META_APP_ID:'12345',META_APP_SECRET:'test-only-app-secret',META_GRAPH_VERSION:'v99.0',META_TOKEN_ENCRYPTION_KEY:'a'.repeat(64),META_CONNECTIONS_ENABLED:'1',META_TEST_PRO_IDS:'10,20',APP_URL:'https://gobookr.com'});

test('Meta configuration fails closed and encrypted credentials bind to their professional context',()=>{
 const env=config(),meta=load('lib/meta-connect.js',{}, {process:{env}});
 assert.equal(meta.canConnect(10),true);assert.equal(meta.canConnect(30),false);
 const cipher=meta.encrypt({token:'test-only-page-token'},'10:123:connection');assert.ok(!cipher.includes('test-only-page-token'));
 assert.equal(meta.decrypt(cipher,'10:123:connection').token,'test-only-page-token');
 assert.throws(()=>meta.decrypt(cipher,'20:123:connection'));
 assert.throws(()=>meta.decrypt(cipher.slice(0,-1)+(cipher.endsWith('0')?'1':'0'),'10:123:connection'));
 env.META_TOKEN_ENCRYPTION_KEY='';assert.equal(meta.canConnect(10),false);assert.throws(()=>meta.encrypt({},'10'));
});

test('session-bound single-use Meta authorization and explicit target selection use HTTP CSRF guards and real Postgres',async()=>{
 const worker=new Worker(path.join(__dirname,'helpers/claim-postgres-worker.js'));
 function query(op,sql,args=[]){const signalBuffer=new SharedArrayBuffer(4),{port1,port2}=new MessageChannel();worker.postMessage({op,sql,args,signalBuffer,responsePort:port2},[port2]);if(Atomics.wait(new Int32Array(signalBuffer),0,0,30000)==='timed-out')throw Error('Database timeout');const result=receiveMessageOnPort(port1).message;port1.close();if(result.error)throw Error(result.error);return result.value;}
 const db={exec:sql=>query('exec',sql),prepare:sql=>({get:(...args)=>query('get',sql,args),all:(...args)=>query('all',sql,args),run:(...args)=>query('run',sql,args)})};
 try{
  db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT);CREATE TABLE pro_profiles(id BIGINT PRIMARY KEY,user_id BIGINT REFERENCES users(id));INSERT INTO users VALUES(1,'customer'),(3,'pro'),(4,'pro'),(5,'pro');INSERT INTO pro_profiles VALUES(10,3),(20,4),(30,5);`);
  const migration=fs.readFileSync(path.join(root,'db/migrations/20261012230002_meta_connection_foundation.sql'),'utf8');db.exec(migration);db.exec(migration);
  const env=config();let calls=0,deny=false;
  const meta=load('lib/meta-connect.js',{}, {process:{env},fetch:async url=>{calls++;const pathname=new URL(url).pathname;
   if(deny)return {ok:false,json:async()=>({error:{message:'PRIVATE test-only-token'}})};
   const data=pathname.endsWith('/oauth/access_token')?{access_token:'test-only-user-token',expires_in:3600}:pathname.endsWith('/me/permissions')?{data:['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'].map(permission=>({permission,status:'granted'}))}:{data:[{id:'123',name:'Test <Page>',access_token:'test-only-page-token',tasks:['CREATE_CONTENT'],instagram_business_account:{id:'456'}},{id:'789',name:'Analytics only',access_token:'test-only-denied-token',tasks:['ANALYZE']}]};
   return {ok:true,json:async()=>data};}});
  const route=load('routes/meta-connect.js',{'../db':db,'../lib/meta-connect':meta,'../lib/layout':{layout:m=>m.body}});
  let handle;const overrides={'./routes/meta-connect':route,'./lib/layout':{layout:m=>m.body},'./lib/pro-billing-banner':{installBillingBanner(){}},'./lib/square-dashboard-card':{installSquareDashboardCard(){}},'./lib/rate-limit':{checkAuthRateLimit:()=>({allowed:true})},'./lib/router':load('lib/router.js',{'../routes/home':()=>{}}),'node:http':{createServer(fn){handle=fn;return {listen(){}};}},'./lib/auth':{getSessionUser:req=>{const id=Number(String(req.headers.cookie).split(':')[0]),user=db.prepare('SELECT * FROM users WHERE id = ?').get(id);return user?{user,session:{token:req.headers.cookie,csrf_token:'csrf'}}:null;}}};
  for(const [,name] of fs.readFileSync(path.join(root,'server.js'),'utf8').matchAll(/require\('\.\/routes\/([^']+)'\)/g))if(name!=='meta-connect')overrides['./routes/'+name]=()=>{};
  load('server.js',overrides);
  async function request(method,url,session,body={}){const req=Readable.from(method==='POST'?[Buffer.from(new URLSearchParams(body).toString())]:[]);Object.assign(req,{method,url,headers:{host:'localhost',cookie:session||'','content-type':'application/x-www-form-urlencoded'}});const res={status:200,headers:{},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},setHeader(k,v){this.headers[k]=v;},end(body=''){this.body=body;}};await handle(req,res);return res;}
  const PATH='/dashboard/pro/social',csrf={_csrf:'csrf'};
  assert.equal((await request('POST',PATH+'/connect','3:one')).status,403);
  assert.equal((await request('GET',PATH,'1:one')).status,403);
  env.META_CONNECTIONS_ENABLED='';assert.match((await request('POST',PATH+'/connect','3:one',csrf)).headers.Location,/error=/);assert.equal(calls,0);env.META_CONNECTIONS_ENABLED='1';
  assert.match((await request('POST',PATH+'/connect','5:one',csrf)).headers.Location,/error=/);assert.equal(calls,0);
  const start=await request('POST',PATH+'/connect','3:one',csrf);const authUrl=new URL(start.headers.Location),state=authUrl.searchParams.get('state');
  assert.equal(authUrl.origin,'https://www.facebook.com');assert.equal(authUrl.searchParams.get('redirect_uri'),'https://gobookr.com/integrations/meta/callback');
  assert.ok(!start.headers.Location.includes('test-only-app-secret'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_oauth_states').get().n,1);
  const callback='/integrations/meta/callback?state='+state+'&code=test-code';
  await request('GET',callback,'3:other');await request('GET',callback,'4:one');assert.equal(calls,0);
  const complete=await request('GET',callback,'3:one');assert.match(complete.headers.Location,/success=/);assert.equal(calls,3);
  await request('GET',callback,'3:one');assert.equal(calls,3);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_oauth_states').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_connections').get().n,0);
  const choices=await request('GET',PATH,'3:one');assert.match(choices.body,/Test &lt;Page&gt;/);assert.ok(!choices.body.includes('test-only-page-token'));assert.ok(!choices.body.includes('Analytics only'));
  await request('POST',PATH+'/select','3:other',{...csrf,page_id:'123',confirm_account:'1'});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_connections').get().n,0);
  await request('POST',PATH+'/select','3:one',{...csrf,page_id:'999',confirm_account:'1'});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_connections').get().n,0);
  const selected=await request('POST',PATH+'/select','3:one',{...csrf,page_id:'123',confirm_account:'1'});assert.match(selected.headers.Location,/success=/);
  const connection=db.prepare('SELECT * FROM meta_connections').get();assert.equal(connection.page_id,'123');assert.equal(connection.instagram_id,'456');assert.ok(!connection.encrypted_token.includes('test-only-page-token'));
  assert.equal(meta.decrypt(connection.encrypted_token,'10:123:connection').token,'test-only-page-token');
  const page=await request('GET',PATH,'3:one');assert.match(page.body,/Automatic publishing is not enabled/);assert.ok(!page.body.includes('test-only-page-token'));
  await request('POST',PATH+'/disconnect','4:one',csrf);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_connections').get().n,1);
  await request('POST',PATH+'/disconnect','3:one',csrf);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta_connections').get().n,0);
  const cancelled=await request('POST',PATH+'/connect','3:one',csrf),cancelState=new URL(cancelled.headers.Location).searchParams.get('state');await request('GET','/integrations/meta/callback?state='+cancelState+'&error=access_denied','3:one');assert.equal(calls,3);
  const fail=await request('POST',PATH+'/connect','3:one',csrf),failState=new URL(fail.headers.Location).searchParams.get('state');deny=true;const failed=await request('GET','/integrations/meta/callback?state='+failState+'&code=test-code','3:one');assert.ok(!failed.headers.Location.includes('PRIVATE'));
  assert.equal(db.prepare("SELECT has_table_privilege('anon','meta_connections','SELECT') AS allowed").get().allowed,false);
  assert.equal(db.prepare("SELECT has_table_privilege('service_role','meta_connections','SELECT') AS allowed").get().allowed,false);
 }finally{query('close','');await worker.terminate();}
});
