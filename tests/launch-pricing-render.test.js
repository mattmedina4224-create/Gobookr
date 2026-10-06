'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function publicModule(database={}) {
  const filename=path.join(__dirname,'../routes/public.js'),localRequire=createRequire(filename),module={exports:{}};
  const replacements={'../db':database,'../lib/layout':{layout:x=>JSON.stringify(x)},'../lib/favorites':{favoriteControl:()=>'',favoriteIds:()=>new Set()},'../lib/subscription':{},'../lib/pro-listing-data':{hydratePros:x=>x}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8')+'\nmodule.exports.card=proCard;', {module,require:name=>Object.hasOwn(replacements,name)?replacements[name]:localRequire(name),URL,URLSearchParams,Date,console});
  return module.exports;
}
test('public pricing renders real activated billing and complimentary business terms without database access',async()=>{
  const routes={},register=publicModule();register({get:(p,h)=>routes[p]=h,post(){}});
  const res={writeHead(s){this.status=s;},end(body){this.body=body;}};
  await routes['/pricing']({res,currentUser:null,session:null});
  const page=JSON.parse(res.body);
  assert.equal(res.status,200);assert.equal(page.canonical,'https://gobookr.com/pricing');
  assert.match(page.body,/30 days free, then \$20\/month/);assert.match(page.body,/Activate paid billing/);assert.match(page.body,/Complimentary/);
  assert.doesNotMatch(page.body,/\$15/);
});
test('search card renders and grants license badge only with verified flag and license details',()=>{
  const card=publicModule().card,profile={id:1,business_name:'Internal fixture',services:[],categories:['massage_therapist'],license_verified:1};
  assert.doesNotMatch(card(profile,{},new Set()),/License verified by GoBookr/);
  assert.match(card({...profile,license_number:'test',license_state:'CO'},{},new Set()),/License verified by GoBookr/);
  assert.doesNotMatch(card({...profile,license_verified:'0',license_number:'test',license_state:'CO'},{},new Set()),/License verified by GoBookr/);
});

test('search distance selector does not claim a one-mile filter when none was requested',async()=>{
  const routes={},register=publicModule({prepare:()=>({all:()=>[]})});register({get:(p,h)=>routes[p]=h,post(){}});
  const res={writeHead(s){this.status=s;},end(body){this.body=body;}};
  await routes['/search']({res,currentUser:null,session:null,query:{}});
  assert.equal(res.status,200);assert.match(JSON.parse(res.body).body,/<option[^>]+selected>Any distance<\/option>/);
});
