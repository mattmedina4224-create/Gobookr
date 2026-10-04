'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { database } = require('./helpers/postgres-test-db');
const polish = require('../lib/profile-polish');
const evidence = { business_name:'Internal test fixture', license_number:'TEST', license_state:'CO', reviewer_user_id:9, status:'active', identity_confirmed:true, source_url:'https://registry.example.test/result', checked_at:'2026-01-01T00:00:00Z', expires_at:'2099-01-01T00:00:00Z' };
const pro = { business_name:evidence.business_name, license_number:'TEST', license_state:'CO', license_verified:1, license_verification:evidence };
test('viewport harness is preview-only and cannot open authenticated or external routes', () => {
  const { serveProfilePolishPreview }=require('../lib/profile-polish-preview');
  const previous=process.env.VERCEL_ENV, res={writeHead(){},end(b){this.body=b;}};
  try {
    process.env.VERCEL_ENV='production';assert.equal(serveProfilePolishPreview({method:'GET',url:'/__profile-polish-preview'},res),false);
    process.env.VERCEL_ENV='preview';assert.equal(serveProfilePolishPreview({method:'POST',url:'/__profile-polish-preview'},res),false);
    assert.equal(serveProfilePolishPreview({method:'GET',url:'/__profile-polish-preview?page=/admin/licenses&width=1024'},res),true);
    assert.match(res.body,/width:1024px/);assert.match(res.body,/src="\/shop\/1"/);assert.doesNotMatch(res.body,/src="\/admin/);
  } finally {if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('license badge fails closed on legacy flags, changed identities/licenses, expired or incomplete reviews', () => {
  assert.equal(polish.licenseIsVerified(pro),true);
  for (const value of [{...pro,license_verification:null},{...pro,license_verified:0},{...pro,business_name:'Changed'},{...pro,license_number:'CHANGED'}, {...pro,license_state:'WY'}, {...pro,license_verification:{...evidence,identity_confirmed:false}}, {...pro,license_verification:{...evidence,source_url:'javascript:alert(1)'}}, {...pro,license_verification:{...evidence,expires_at:'2020-01-01'}}, {...pro,license_verification:{...evidence,checked_at:'2099-01-01'}}]) assert.equal(polish.licenseIsVerified(value),false);
});
test('business banners reject unsafe URLs and provide a real neutral empty state',()=>{
  assert.match(polish.businessBanner('', 'Fixture'),/business-banner--fallback/);
  assert.doesNotMatch(polish.businessBanner('javascript:alert(1)','Fixture'),/<img/);
  assert.doesNotMatch(polish.businessBanner('https://user:password@example.test/x','Fixture'),/<img/);
  assert.match(polish.businessBanner('https://example.test/photo.png','A & B'),/alt="A &amp; B business banner"/);
  assert.match(fs.readFileSync(path.join(__dirname,'../public/business-banner.js'),'utf8'),/image\.addEventListener\('error', fallback\)/);
});
function load(file, replacements) {
  const filename=path.join(__dirname,'..',file), module={exports:{}}, local=createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:n=>Object.hasOwn(replacements,n)?replacements[n]:local(n),URL,Date,console,process,Buffer});return module.exports;
}
function routes(db) {
  const result={}, http=require('../lib/http'), replacements={'../db':db,'../lib/layout':{layout:x=>x.body},'../lib/admin':{requireAdmin:ctx=>Boolean(ctx.currentUser?.isAdmin)},'../lib/pro-listing-data':{hydratePros:rows=>rows.filter(p=>p.claim_status==='unclaimed')}};
  const router={get:(p,h)=>result['GET '+p]=h,post:(p,h)=>result['POST '+p]=h};
  for(const file of ['routes/admin.js','routes/shops.js','routes/shop-dashboard.js']) load(file,replacements)(router);
  return async(method,route,{id=1,user=null,body={}}={})=>{
    const res={writeHead(s,h){this.status=s;this.headers=h;},end(b){this.body=b;}};
    await result[method+' '+route]({params:{id:String(id)},currentUser:user,session:{csrf_token:'fixture'},query:{},body,res});return res;
  };
}
test('Postgres business matching, bidirectional links, owner edits and license evidence work without unrelated changes',async()=>{
  const db=database();
  try {
    db.exec(`CREATE TABLE users (id BIGINT PRIMARY KEY);
      CREATE TABLE pro_profiles (id BIGINT PRIMARY KEY,business_name TEXT,workplace_name TEXT,city TEXT,state TEXT,street_address TEXT,zip_code TEXT,suite TEXT,claim_status TEXT,license_number TEXT,license_state TEXT,license_verified INTEGER DEFAULT 0,professional_handle TEXT,profile_photo_url TEXT,category TEXT);
      CREATE TABLE shops (id BIGINT PRIMARY KEY,owner_user_id BIGINT,name TEXT,city TEXT,state TEXT,street_address TEXT,zip_code TEXT,suite TEXT,claim_status TEXT,description TEXT,phone TEXT,booking_url TEXT,logo_url TEXT,cover_url TEXT,source_url TEXT,source_name TEXT,updated_at TIMESTAMPTZ);
      INSERT INTO users VALUES(9),(10);
      INSERT INTO shops VALUES(1,9,'Internal QA Business','Denver','CO','123 Test Street','80202','','claimed','','','','','','','','2026-01-01');
      INSERT INTO pro_profiles VALUES(1,'Internal test fixture','Internal QA Business','Denver','CO','123 Test Street','80202','','unclaimed','TEST','CO',0,'','','barber'),(2,'Other branch','Internal QA Business','Denver','CO','999 Other Street','80202','','unclaimed',NULL,NULL,0,'','','barber'),(3,'Missing street','Internal QA Business','Denver','CO','','80202','','unclaimed',NULL,NULL,0,'','','barber'),(4,'Other suite','Internal QA Business','Denver','CO','123 Test Street','80202','22','unclaimed',NULL,NULL,0,'','','barber');`);
    db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/20261004234147_profile_license_evidence.sql'),'utf8'));
    const shop=db.prepare('SELECT * FROM shops WHERE id=1').get();
    assert.deepEqual(polish.professionalsAtBusiness(db,shop).map(p=>p.id),[1]);
    const matched=db.prepare('SELECT * FROM pro_profiles WHERE id=1').get();
    assert.equal(polish.businessForProfessional(db,matched).id,1);
    assert.deepEqual(polish.professionalsAtBusiness(db,{...shop,street_address:''}),[]);
    db.exec("INSERT INTO shops SELECT 2,owner_user_id,name,city,state,street_address,zip_code,suite,claim_status,description,phone,booking_url,logo_url,cover_url,source_url,source_name,updated_at FROM shops WHERE id=1;");
    assert.equal(polish.businessForProfessional(db,matched),null);
    db.exec('DELETE FROM shops WHERE id=2;'); // Disposable local fixture only.
    const request=routes(db);
    const page=await request('GET','/shop/:id');
    assert.match(page.body,/href="\/pro\/1"/);assert.doesNotMatch(page.body,/href="\/pro\/[234]"/);assert.match(page.body,/business-banner--fallback/);assert.doesNotMatch(page.body,/License verified/);
    const owner={id:9}, stranger={id:10};
    const editor=await request('GET','/dashboard/shop',{user:owner});assert.match(editor.body,/Banner photo URL/);
    const denied=await request('POST','/dashboard/shop',{user:stranger,body:{name:'Hijack'}});assert.equal(denied.status,403);
    const form={name:shop.name,city:'Denver',state:'CO',street_address:shop.street_address,zip_code:'80202',suite:'',cover_url:'https://images.example.test/banner.png',logo_url:'',booking_url:''};
    await request('POST','/dashboard/shop',{user:owner,body:form});assert.equal(db.prepare('SELECT cover_url FROM shops WHERE id=1').get().cover_url,form.cover_url);
    assert.match((await request('GET','/shop/:id')).body,/data-business-banner/);
    await request('POST','/dashboard/shop',{user:owner,body:{...form,cover_url:'javascript:alert(1)'}});assert.equal(db.prepare('SELECT cover_url FROM shops WHERE id=1').get().cover_url,form.cover_url);
    await request('POST','/dashboard/shop',{user:owner,body:{...form,cover_url:''}});assert.match((await request('GET','/shop/:id')).body,/business-banner--fallback/);
    const admin={id:9,isAdmin:true}, review={license_number:'TEST',license_state:'CO',source_url:'https://registry.example.test/result',expires_at:'2099-01-01',identity_confirmed:'1'};
    await request('POST','/admin/licenses/:id/verify',{user:stranger,body:review});assert.equal(db.prepare('SELECT license_verified FROM pro_profiles WHERE id=1').get().license_verified,0);
    for(const invalid of [{...review,identity_confirmed:''},{...review,license_number:'WRONG'},{...review,expires_at:'2000-01-01'},{...review,expires_at:'2099-02-31'},{...review,source_url:'javascript:alert(1)'}]) {await request('POST','/admin/licenses/:id/verify',{user:admin,body:invalid});assert.equal(db.prepare('SELECT license_verified FROM pro_profiles WHERE id=1').get().license_verified,0);}
    await request('POST','/admin/licenses/:id/verify',{user:admin,body:review});
    assert.equal(polish.licenseIsVerified(db.prepare('SELECT * FROM pro_profiles WHERE id=1').get()),true);
    assert.match((await request('GET','/shop/:id')).body,/License verified/);
    await request('POST','/admin/licenses/:id/revoke',{user:admin});assert.equal(polish.licenseIsVerified(db.prepare('SELECT * FROM pro_profiles WHERE id=1').get()),false);
    assert.equal(db.prepare('SELECT count(*) AS n FROM pro_profiles').get().n,4);
  } finally {await db.close();}
});
