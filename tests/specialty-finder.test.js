'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '..');

function load(file, overrides) {
  const filename = path.join(root, file), local = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Buffer, URL, URLSearchParams, process: { env: {} }, console,
    __dirname: path.dirname(filename), require: name => Object.hasOwn(overrides, name) ? overrides[name] : local(name),
  });
  return module.exports;
}

test('specialty selections → finder → search protect ownership, visibility and exact skills', async () => {
  const worker = new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function query(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4), { port1, port2 } = new MessageChannel();
    worker.postMessage({op,sql,args,signalBuffer,responsePort:port2},[port2]);
    if (Atomics.wait(new Int32Array(signalBuffer),0,0,30000)==='timed-out') throw Error('Database timeout');
    const result=receiveMessageOnPort(port1).message;port1.close();if(result.error)throw Error(result.error);return result.value;
  }
  const db={exec:sql=>query('exec',sql),prepare:sql=>({get:(...args)=>query('get',sql,args),all:(...args)=>query('all',sql,args),run:(...args)=>query('run',sql,args)})};
  try {
    db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,name TEXT);
      CREATE TABLE pro_profiles(id BIGINT PRIMARY KEY,user_id BIGINT, business_name TEXT, city TEXT,state TEXT, zip_code TEXT,category TEXT,claim_status TEXT,onboarding_completed INT,source_url TEXT,source_name TEXT,professional_handle TEXT,workplace_name TEXT,latitude DOUBLE PRECISION,longitude DOUBLE PRECISION);
      CREATE TABLE subscriptions(pro_id BIGINT,status TEXT,trial_ends_at TIMESTAMPTZ,past_due_since TIMESTAMPTZ);
      CREATE TABLE pro_categories(pro_id BIGINT,category TEXT);
      CREATE TABLE reviews(pro_id BIGINT,rating INT);
      CREATE TABLE portfolio_items(id BIGINT,pro_id BIGINT,image_url TEXT,caption TEXT);
      CREATE TABLE services(id BIGINT,pro_id BIGINT,name TEXT,price INT);
      CREATE TABLE shops(id BIGINT,name TEXT,city TEXT,state TEXT,zip_code TEXT);
      INSERT INTO users VALUES(1,'pro','Owner'),(2,'pro','Other'),(3,'customer','Customer');
      INSERT INTO pro_profiles(id,user_id,business_name,city,state,zip_code,category,claim_status,onboarding_completed) VALUES
      (10,1,'Razor <Studio>','Denver','CO','80202','barber','claimed',1),(20,2,'Other','Denver','CO','80202','barber','claimed',1),
      (30,30,'Draft','Denver','CO','80202','barber','claimed',0),(40,40,'Canceled','Denver','CO','80202','barber','claimed',1),
      (50,50,'Elsewhere','Boulder','CO','80301','barber','claimed',1);
      INSERT INTO subscriptions(pro_id,status) VALUES(10,'active'),(20,'active'),(30,'active'),(40,'canceled'),(50,'active');
      INSERT INTO pro_categories VALUES(10,'barber'),(20,'barber'),(30,'barber'),(40,'barber'),(50,'barber');
      INSERT INTO portfolio_items VALUES(1,10,'javascript:alert(1)','bad photo');`);
    const migration=fs.readFileSync(path.join(root,'db/migrations/20261013143440_professional_specialties.sql'),'utf8');db.exec(migration);db.exec(migration);
    const team={enabled:()=>false,coverage:()=>[]};
    const subscription=load('lib/subscription.js',{'../db':db,'./business-team':team});
    const hydrate=load('lib/pro-listing-data.js',{'../db':db,'./business-team':team,'./subscription':subscription});
    const search=load('lib/specialty-search.js',{'../db':db,'./business-team':team,'./pro-listing-data':hydrate});
    const finder=load('routes/specialty-finder.js',{'../db':db,'../lib/specialty-search':search,'../lib/layout':{layout:m=>m.body}});
    const publicRoute=load('routes/public.js',{'../db':db,'../lib/specialty-search':search,'../lib/pro-listing-data':hydrate,'../lib/layout':{layout:m=>m.body},'../lib/business-team':team,'../lib/favorites':{favoriteIds:()=>new Set(),favoriteControl:()=>''}});
    let handle;
    const overrides={'./routes/specialty-finder':finder,'./routes/public':publicRoute,'./lib/layout':{layout:m=>m.body},
      './lib/pro-billing-banner':{installBillingBanner(){}},'./lib/square-dashboard-card':{installSquareDashboardCard(){}},
      './lib/rate-limit':{checkAuthRateLimit:()=>({allowed:true})},'./lib/router':load('lib/router.js',{'../routes/home':()=>{}}),
      './lib/auth':{getSessionUser:req=>{const user=db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.headers.cookie));return user?{user,session:{csrf_token:'test-csrf'}}:null;}},
      'node:http':{createServer(fn){handle=fn;return{listen(){}};}}};
    for(const [,name]of fs.readFileSync(path.join(root,'server.js'),'utf8').matchAll(/require\('\.\/routes\/([^']+)'\)/g))if(!['specialty-finder','public'].includes(name))overrides['./routes/'+name]=()=>{};
    load('server.js',overrides);
    async function request(method,url,id,body={}){
      const req=Readable.from(method==='POST'?[Buffer.from(new URLSearchParams(body).toString())]:[]);Object.assign(req,{method,url,headers:{host:'localhost',cookie:String(id||''),'content-type':'application/x-www-form-urlencoded'}});
      const res={status:200,headers:{},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},setHeader(key,value){this.headers[key]=value;},end(body=''){this.body=body;}};await handle(req,res);return res;
    }
    const save={_csrf:'test-csrf','specialty_razor-fade':'1'};
    assert.equal((await request('POST','/dashboard/pro/specialties',1,{})).status,403);
    assert.equal((await request('POST','/dashboard/pro/specialties',3,save)).status,403);
    assert.equal((await request('POST','/dashboard/pro/specialties',1,{...save,'specialty_balayage':'1'})).status,400);
    assert.equal((await request('POST','/dashboard/pro/specialties',1,{...save,'specialty_bad':'1'})).status,400);
    assert.equal((await request('POST','/dashboard/pro/specialties',1,save)).status,302);
    await request('POST','/dashboard/pro/specialties',1,save); // preserving checked values must not lose them
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pro_specialties WHERE pro_id=10').get().n,1);
    const url='/finder/matches?specialty=razor-fade&city=Denver';
    let result=JSON.parse((await request('GET',url)).body);assert.equal(result.results.length,1);assert.equal(result.results[0].id,10);assert.equal(result.results[0].photo,'');
    assert.equal(JSON.parse((await request('GET','/finder/matches?specialty=skin-fade&city=Denver')).body).results.length,0);
    assert.equal((await request('GET','/finder/matches?specialty=bad&city=Denver')).status,400);
    assert.equal((await request('GET','/finder/matches?specialty=razor-fade&city=')).status,400);
    db.exec("INSERT INTO pro_specialties VALUES(30,'razor-fade'),(40,'razor-fade'),(50,'razor-fade')");
    result=JSON.parse((await request('GET',url)).body);assert.deepEqual(result.results.map(x=>x.id),[10]);
    assert.equal(JSON.parse((await request('GET','/finder/matches?specialty=razor-fade&city=80202')).body).results.length,1);
    assert.equal(JSON.parse((await request('GET','/finder/matches?specialty=razor-fade&city=Boulder')).body).results[0].id,50);
    const page=await request('GET','/search?specialty=razor-fade&city=Denver&type=professionals');assert.equal(page.status,200);assert.match(page.body,/Razor &lt;Studio&gt;/);assert.doesNotMatch(page.body,/href="\/pro\/(20|30|40|50)"/);assert.match(page.body,/specialty=razor-fade/);
    assert.equal((await request('GET','/search?specialty=unknown')).status,400);
    await request('POST','/dashboard/pro/specialties',2,save);await request('POST','/dashboard/pro/specialties',1,{_csrf:'test-csrf'});
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pro_specialties WHERE pro_id=10').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pro_specialties WHERE pro_id=20').get().n,1);
    for(const role of ['anon','authenticated','service_role'])assert.equal(db.prepare("SELECT has_table_privilege(?, 'pro_specialties', 'SELECT') AS allowed").get(role).allowed,false);
    assert.match((await request('GET','/finder')).body,/Black &amp; gray realism/);
  } finally {await worker.terminate();}
});

test('finder recognizes concrete aliases without treating every haircut as a razor fade',()=>{
  const catalog=require('../public/specialty-catalog');
  assert.equal(catalog.recognize('I want black & grey realism')[0].id,'black-gray-realism');
  assert.equal(catalog.recognize('razor fade')[0].id,'razor-fade');assert.equal(catalog.recognize('BALAYAGE')[0].id,'balayage');
  assert.equal(catalog.recognize('fade').length,0);assert.equal(catalog.recognize('notbalayage').length,0);
  assert.equal(catalog.recognize('balayage and curly hair').length,2);
});

test('finder dialog runs specialty → location → results and ignores closed-dialog responses', async () => {
  class Element {
    constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.hidden=false;this.value='';this.disabled=false;this.textContent='';}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    addEventListener(name,fn){this.events[name]=fn;}
    focus(){this.focused=true;}
    querySelector(key){return this.lookup[key];}
    showModal(){this.open=true;}
    close(){this.open=false;this.events.close();}
    click(){return this.events.click?.({preventDefault(){}})||this.onclick?.();}
  }
  const dialog=new Element(),launch=new Element('a'),form=new Element('form'),input=new Element('input'),label=new Element('label'),button=new Element('button');
  const conversation=new Element(),suggestions=new Element(),results=new Element(),reset=new Element('button'),close=new Element('button');
  form.lookup={input,label,button};dialog.lookup={'.finder-form':form,'.finder-conversation':conversation,'.finder-suggestions':suggestions,'.finder-results':results,'.finder-reset':reset,'.finder-close':close};
  let resolveFetch,requested;
  const document={getElementById:()=>dialog,querySelector:()=>launch,createElement:tag=>new Element(tag)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'public/specialty-finder.js'),'utf8'),{document,window:{GoBookrSpecialties:require('../public/specialty-catalog')},URLSearchParams,AbortController,fetch:(url)=>{requested=url;return new Promise(resolve=>resolveFetch=resolve);}});
  const submit=()=>form.events.submit({preventDefault(){}});const settle=()=>new Promise(resolve=>setImmediate(resolve));
  launch.click();assert.equal(dialog.open,true);assert.equal(input.focused,true);assert.equal(suggestions.children.length,3);
  input.value='black and grey realism';submit();assert.equal(label.textContent,'City or ZIP code');assert.equal(suggestions.children.length,0);
  input.value='Denver';submit();assert.match(requested,/specialty=black-gray-realism&city=Denver/);assert.equal(button.disabled,true);
  resolveFetch({ok:true,json:async()=>({results:[{id:10,name:'<script>unsafe</script>',city:'Denver',state:'CO',photo:'https://example.test/photo.jpg'}]})});await settle();
  assert.equal(form.hidden,true);assert.equal(results.children[0].href,'/pro/10');assert.equal(results.children[0].children[1].children[0].textContent,'<script>unsafe</script>');assert.match(results.children[1].href,/specialty=black-gray-realism/);
  reset.click();input.value='balayage and curly hair';submit();assert.equal(suggestions.children.length,2);suggestions.children[0].click();input.value='80202';submit();close.click();
  resolveFetch({ok:true,json:async()=>({results:[{id:99,name:'stale'}]})});await settle();assert.equal(results.children.length,0);assert.equal(launch.focused,true);
  launch.click();assert.equal(label.textContent,'Service or specialty');input.value='unknown specialty';submit();assert.ok(conversation.children.at(-1).textContent.includes('exact specialty option'));
});
