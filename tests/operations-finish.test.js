'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const views=require('../lib/staff-views');
test('employee navigation hides unauthorized inbox and guides explain actual delivery limits',()=>{
 const member={name:'Employee',permissions:[]};
 assert.doesNotMatch(views.dashboard(member,[]),/href="\/staff\/support"/);
 assert.match(views.dashboard({...member,permissions:['support.read']},[]),/href="\/staff\/support"/);
 assert.match(views.guides(member),/draft/i);
 assert.match(views.ownerGuides(),/365/);
 assert.match(views.overview(),/href="\/owner\/guides"/);
});
function serverFixture(fail=false){
 let handler;
 const db={prepare(sql){return{all(){if(fail)throw Error('sensitive database error');return sql.includes('SELECT p.id')?[{id:42}]:sql.includes('SELECT id FROM shops')?[{id:7}]:[{city_slug:'denver',category:'barber'}];}};}};
 class Router{}
 const sandbox={require(name){
  if(name==='node:http')return{createServer(fn){handler=fn;return{listen(){}};}};
  if(name.startsWith('node:'))return require(name);
  if(name==='./db')return db;
  if(name==='./lib/router')return Router;
  if(name==='./lib/pro-billing-banner')return{installBillingBanner(){}};
  if(name==='./lib/square-dashboard-card')return{installSquareDashboardCard(){}};
  if(name==='./lib/rate-limit')return{};
  if(name.startsWith('./routes/'))return()=>{};
  return{};
 },__dirname:path.join(__dirname,'..'),process:{env:{}},console:{log(){},error(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'),sandbox);
 return async(url)=>{let status,headers,body;await handler({method:'GET',url},{writeHead(s,h){status=s;headers=h;},end(b){body=b;}});return{status,headers,body};};
}
test('runtime sitemap returns public inventory and a failed lookup returns uncached 503',async()=>{
 const ok=await serverFixture()('/sitemap.xml');
 assert.equal(ok.status,200);for(const loc of ['/pro/42','/shop/7','/discover/denver/barber'])assert.ok(ok.body.includes('https://gobookr.com'+loc));
 assert.doesNotMatch(ok.body,/signup|owner|staff/);
 const failed=await serverFixture(true)('/sitemap.xml');assert.equal(failed.status,503);assert.equal(failed.headers['Cache-Control'],'no-store');assert.doesNotMatch(failed.body,/sensitive/);
 const robots=await serverFixture()('/robots.txt');assert.equal(robots.status,200);assert.ok(robots.body.includes('\nDisallow: /owner\n'));assert.ok(!robots.body.includes('\\n'));
});
test('Google sign-in routes owner and employee with fresh session and preserves explicit next',async()=>{
 let handler,destination='/owner';
 const user={id:2,role:'customer'};const source=fs.readFileSync(path.join(__dirname,'../routes/google.js'),'utf8');
 const sandbox={require(name){
  if(name==='../db')return{prepare(){return{get(){return user;}};}};
  if(name==='../lib/auth')return{createSession(){return'session';},setSessionCookie(){}};
  if(name==='../lib/http')return{redirect(res,to){res.location=to;}};
  if(name==='../lib/dashboard-destination')return{dashboardDestination(u,s){assert.equal(u,user);assert.equal(s.token,'session');return destination;}};
  throw Error(name);
 },module:{exports:{}},process:{env:{GOOGLE_CLIENT_ID:'client'}},AbortController,setTimeout,clearTimeout,URLSearchParams,fetch:async()=>({ok:true,json:async()=>({aud:'client',email_verified:'true',exp:Math.ceil(Date.now()/1000)+100,email:'employee@example.test',sub:'subject'})})};
 vm.runInNewContext(source,sandbox);sandbox.module.exports({post(p,h){handler=h;}});
 for(const expected of ['/owner','/staff']){destination=expected;const res={};await handler({body:{credential:'test'},res});assert.equal(res.location,expected);}
 const res={};await handler({body:{credential:'test',next:'/claim/42'},res});assert.equal(res.location,'/claim/42');
});
