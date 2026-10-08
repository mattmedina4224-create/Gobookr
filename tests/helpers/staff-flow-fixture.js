'use strict';
// Isolated synthetic test users and sessions. Never connects to a hosted database.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const {createRequire}=require('node:module');
const {PGlite}=require(process.env.GOBOOKR_PGLITE_MODULE||'@electric-sql/pglite');
const {createStaffStore}=require('../../lib/staff-store');
const {createSupportStore}=require('../../lib/support-store');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE users(id BIGINT PRIMARY KEY,email TEXT,name TEXT,role TEXT);
 CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id BIGINT,expires_at TIMESTAMPTZ,csrf_token TEXT);
 CREATE TABLE admin_accounts(user_id BIGINT PRIMARY KEY);
 INSERT INTO users VALUES(1,'owner@example.test','Owner','customer'),(2,'staff@example.test','Staff','customer'),(3,'other@example.test','Other','customer'),(4,'reader@example.test','Reader','customer');
 INSERT INTO sessions SELECT CASE id WHEN 1 THEN 'owner' WHEN 2 THEN 'staff' WHEN 3 THEN 'other' ELSE 'reader' END,id,CURRENT_TIMESTAMP+INTERVAL '1 day','csrf' FROM users;`);
 for(const name of ['schema.sql','work.sql','support.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../../db/staff-portal',name),'utf8'));
 await db.exec(`INSERT INTO staff_ops.owners(user_id) VALUES(1),(3);
 INSERT INTO staff_ops.members(user_id,owner_id,name,permissions) VALUES(2,1,'Staff',ARRAY['support.read','support.reply']),(4,1,'Reader',ARRAY['support.read']);
 INSERT INTO staff_ops.support_tickets(owner_id,provider_thread_key,subject,assignee_id) VALUES(1,'isolated-test-thread','Test support request',1);
 INSERT INTO staff_ops.support_messages(ticket_id,provider_message_key,sender,body_text,received_at) VALUES(1,'isolated-test-message','test@example.test','Plain text test message',CURRENT_TIMESTAMP);`);
 const pool={query:(q,a)=>db.query(q,a),async connect(){return{query:(q,a)=>db.query(q,a),release(){}};}};
 const staff=createStaffStore(pool),support=createSupportStore(pool);
 function load(file,overrides){const abs=path.join(__dirname,'../..',file),realRequire=createRequire(abs),mod={exports:{}};vm.runInNewContext(fs.readFileSync(abs,'utf8'),{module:mod,process:{env:{}},console,require:id=>Object.hasOwn(overrides,id)?overrides[id]:realRequire(id)});return mod.exports;}
 const layout=load('lib/layout.js',{'./dashboard-destination':{dashboardDestination:user=>user.id===1||user.id===3?'/owner':'/staff'}});
 const supportRoutes=load('routes/support.js',{'../lib/layout':layout});
 const staffRoutes=load('routes/staff.js',{'../lib/layout':layout,'./support':(router,options)=>supportRoutes(router,{...options,store:support})});
 const routes=[];const router={};
 for(const method of ['get','post'])router[method]=(pattern,handler)=>{const names=[];const re=new RegExp('^'+pattern.split('/').map(s=>s.startsWith(':')?(names.push(s.slice(1)),'([^/]+)'):s).join('/')+'$');routes.push({method:method.toUpperCase(),re,names,handler});};
 staffRoutes(router,{enabled:()=>true,store:staff});
 async function request(url,{token='owner',method='GET',body={}}={}){
  const parsed=new URL(url,'http://fixture.invalid'),route=routes.find(r=>r.method===method&&r.re.test(parsed.pathname));
  const res={status:200,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(value){this.body=value||'';}};
  if(!route){res.status=404;return res;}
  const match=route.re.exec(parsed.pathname),params=Object.fromEntries(route.names.map((n,i)=>[n,match[i+1]]));
  const session=(await db.query('SELECT * FROM sessions WHERE token=$1 AND expires_at>CURRENT_TIMESTAMP',[token])).rows[0];
  const currentUser=session?(await db.query('SELECT * FROM users WHERE id=$1',[session.user_id])).rows[0]:null;
  await route.handler({req:{url,method},res,session,currentUser,params,query:Object.fromEntries(parsed.searchParams),body});return res;
 }
 let server;
 async function listen(){
  let pending=Promise.resolve();
  server=http.createServer((req,res)=>{
   const asset=path.basename(new URL(req.url,'http://fixture.invalid').pathname);
   if(['styles.css','discovery.css','navigation.css','staff-portal.css','location.js','gobookr-favicon-navy-20260910-v2.svg'].includes(asset)){res.setHeader('Content-Type',asset.endsWith('.css')?'text/css':asset.endsWith('.js')?'application/javascript':'image/svg+xml');res.end(fs.readFileSync(path.join(__dirname,'../../public',asset)));return;}
   pending=pending.then(async()=>{let raw='';for await(const chunk of req)raw+=chunk;const token=/test_session=([^;]+)/.exec(req.headers.cookie||'')?.[1]||'';const r=await request(req.url,{token,method:req.method,body:Object.fromEntries(new URLSearchParams(raw))});res.writeHead(r.status,r.headers);res.end(r.body);}).catch(err=>{res.writeHead(500);res.end('Test fixture failure');console.error(err);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;
 }
 return{db,staff,support,request,listen,async close(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.close();}};
}
module.exports={fixture};
