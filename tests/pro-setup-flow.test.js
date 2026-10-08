'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { mergeSetupProfile, setupDestination } = require('../lib/pro-setup');
const { renderSetup } = require('../lib/pro-setup-view');
function app() {
  const profile = { id: 5, user_id: 7, business_name: 'Test professional', workplace_name: 'Test studio', street_address: '1 Test St', city: 'Denver', state: 'CO', zip_code: '80202', bio: 'Saved biography', years_experience: 3, price_min: 30, price_max: 80, booking_url: 'https://example.com/book', latitude: 39.7, longitude: -105, license_verified: 0, onboarding_completed: 0 };
  const services = []; const photos = []; let categories = ['barber'];
  const db = { exec() {}, prepare(sql) { return {
    get(id) { if (sql.includes('FROM pro_profiles')) return id === 7 ? profile : null; if (sql.includes('COUNT(*)')) return {count:sql.includes('portfolio_items')?photos.length:services.length}; throw Error(sql); },
    all() { if(sql.includes('pro_categories')) return categories.map(category=>({category})); if(sql.includes('services')) return services; if(sql.includes('portfolio_items')) return photos; throw Error(sql); },
    run(...args) { if(sql.startsWith('UPDATE pro_profiles SET business_name')) { const names = ['business_name','professional_handle','booking_url','workplace_name','street_address','suite','city','state','zip_code','latitude','longitude','license_number','license_state','license_verified','price_min','price_max','years_experience','bio']; names.forEach((n,i)=>profile[n]=args[i]); }
      else if(sql.startsWith('INSERT INTO services')) services.push({id:1,name:args[1],price:args[2],duration_minutes:args[3]});
      else if(sql.startsWith('DELETE FROM pro_categories')) categories=[];
      else if(sql.startsWith('INSERT INTO pro_categories')) categories.push(args[1]);
      else if(sql.startsWith('UPDATE pro_profiles SET onboarding_completed')) profile.onboarding_completed=1;
      return {changes:1}; }
  }; } };
  const http = require('../lib/http');
  const routes = new Map(); const router={get:(url,handler)=>routes.set('GET '+url,handler),post:(url,handler)=>routes.set('POST '+url,handler)};
  const load = (file, dependencies={}) => {const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{module,exports:module.exports,URL,Buffer,console,process:{env:{}},AbortController,setTimeout,clearTimeout,require(id){if(id==='../db')return db;if(id==='../lib/layout')return {layout:({body})=>body};if(id==='../lib/favorites')return {currentSaves:()=>0};if(dependencies[id])return dependencies[id];if(id.startsWith('node:'))return require(id);return require(path.resolve(path.dirname(path.join(__dirname,'..',file)),id));}});return module.exports;};
  const onboarding=load('routes/onboarding.js');onboarding(router);load('routes/pro.js',{'./onboarding':onboarding})(router);
  async function request(method,url,body={},query={},user={id:7,role:'pro'}) {const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(html){this.html=html;}};await routes.get(method+' '+url)({res,body,query,currentUser:user,session:{csrf_token:'test-csrf'},params:{}});return res;}
  return {request,profile,photos,services};
}
test('setup starts with basics and successful saves advance without clearing other fields',async()=>{
 const a=app(); const first=await a.request('GET','/dashboard/pro/onboarding'); assert.match(first.html,/<h1>Business basics<\/h1>/);assert.match(first.html,/Save &amp; continue/);assert.doesNotMatch(first.html,/id="bio"/);
 const body={_setup_step:'basics',business_name:'Updated name',workplace_name:'Test studio',street_address:'1 Test St',city:'Denver',state:'CO',zip_code:'80202'};
 const saved=await a.request('POST','/dashboard/pro/profile',body);assert.match(saved.headers.Location,/step=details/);assert.equal(a.profile.bio,'Saved biography');assert.equal(a.profile.booking_url,'https://example.com/book');
 const details=await a.request('POST','/dashboard/pro/profile',{_setup_step:'details',bio:'New biography',years_experience:'0',price_min:'25',price_max:'75',street_address:'malicious change'});assert.match(details.headers.Location,/step=categories/);assert.equal(a.profile.years_experience,0);assert.equal(a.profile.street_address,'1 Test St');
 const cats=await a.request('POST','/dashboard/pro/categories',{_setup_step:'categories',category_makeup_artist:'1'});assert.match(cats.headers.Location,/step=services/);
 const service=await a.request('POST','/dashboard/pro/services',{_setup_step:'services',name:'Consultation',price:'25',duration_minutes:'30'});assert.match(service.headers.Location,/step=portfolio/);assert.equal(a.services.length,1);
 const booking=await a.request('POST','/dashboard/pro/profile',{_setup_step:'booking',booking_url:'https://example.org/book'});assert.match(booking.headers.Location,/step=extras/);assert.equal(a.profile.bio,'New biography');
});
test('validation errors keep entries visible and stay on the current step',async()=>{
 const a=app();const response=await a.request('POST','/dashboard/pro/profile',{_setup_step:'details',bio:'Keep my draft',years_experience:'',price_min:'25',price_max:'70'});assert.equal(response.status,422);assert.match(response.html,/Keep my draft/);assert.match(response.html,/<h1>About &amp; pricing<\/h1>|<h1>About & pricing<\/h1>/);assert.equal(a.profile.bio,'Saved biography');
 const service=await a.request('POST','/dashboard/pro/services',{_setup_step:'services',name:'Keep my service',price:'bad',duration_minutes:'30'});assert.equal(service.status,422);assert.match(service.html,/Keep my service/);
});
test('missing photo storage offers a clear next step but never completes setup',async()=>{
 const a=app();const page=await a.request('GET','/dashboard/pro/onboarding',{}, {step:'portfolio'});assert.match(page.html,/temporarily unavailable/);assert.match(page.html,/Continue for now/);assert.doesNotMatch(page.html,/type="file"/);
 const finish=await a.request('POST','/dashboard/pro/onboarding/finish');assert.match(finish.headers.Location,/step=review&error=/);assert.equal(a.profile.onboarding_completed,0);
 a.services.push({id:1,name:'Test',price:30,duration_minutes:30});a.photos.push({image_url:'https://example.com/photo.jpg',caption:'Test'});const completed=await a.request('POST','/dashboard/pro/onboarding/finish');assert.match(completed.headers.Location,/setup=complete/);assert.equal(a.profile.onboarding_completed,1);
});
test('incomplete accounts resume, save and exit is explicit, and unauthorized users cannot save',async()=>{
 const a=app();const dashboard=await a.request('GET','/dashboard/pro');assert.match(dashboard.headers.Location,/step=resume/);const resume=await a.request('GET','/dashboard/pro/onboarding',{}, {step:'resume'});assert.match(resume.html,/<h1>Your services<\/h1>/);
 const exit=await a.request('POST','/dashboard/pro/profile',{_setup_step:'booking',booking_url:'https://example.com/new',_setup_exit:'1'});assert.match(exit.headers.Location,/setup=saved/);assert.equal(a.profile.booking_url,'https://example.com/new');
 const denied=await a.request('POST','/dashboard/pro/profile',{_setup_step:'booking',booking_url:'https://example.com/denied'},{},{id:9,role:'customer'});assert.match(denied.headers.Location,/login/);assert.equal(a.profile.booking_url,'https://example.com/new');
});
test('step routing never accepts an external destination and saved values are escaped',()=>{
 assert.equal(setupDestination('https://evil.example',null,false),null);const profile={bio:'Saved',id:1};assert.equal(mergeSetupProfile(profile,{_setup_step:'booking',bio:'Overwrite',booking_url:'https://example.com'}).bio,'Saved');
 const html=renderSetup({profile:{business_name:'<script>alert(1)</script>'},step:'basics',csrf:'csrf',state:{},categories:[],services:[],photos:[],resume:'basics'});assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
