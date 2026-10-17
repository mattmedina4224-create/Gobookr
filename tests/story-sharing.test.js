'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const { storySharingPanel } = require('../lib/story-sharing-view');

function harness(options = {}) {
  const text = [];
  function element(props = {}) { return Object.assign({ dataset: {}, listeners: {}, hidden: false, disabled: false,
    addEventListener(name,fn) { this.listeners[name]=fn; }, setAttribute(name,value) { this[name]=value; }, removeAttribute(name) { delete this[name]; },
    focus() { this.focused=true; }, replaceChildren() { this.children=[]; }, appendChild(el) { (this.children ||= []).push(el); },
  },props); }
  const platforms=['instagram','facebook','snapchat'].map(value=>element({dataset:{storyPlatform:value}}));
  const root=element({dataset:{title:'Test <Studio>',label:'Show My Work',url:'https://gobookr.com/pro/1?source=marketing-show-my-work',style:'classic'},querySelectorAll:()=>platforms});
  const ids=Object.fromEntries(['story-sharing','copy','available_slots','story-ready-status','marketing-share-status','story-ready-preview','story-ready-image','story-download','story-prepare','story-share-ready','story-share-ready-bottom','marketing-share','story-copy-caption','story-copy-url','story-sharing-steps'].map(id=>[id,element({id})]));
  ids['story-sharing']=root;ids.copy.value='Fresh work. Book with me!';ids.available_slots.value='';
  const context={fillRect(){},drawImage(){},createLinearGradient(){return {addColorStop(){}};},measureText(t){return {width:Array.from(t).length*20};},fillText(t,x,y){text.push({t,x,y});}};
  let shares=0,release;const urls=[];
  const document={getElementById:id=>ids[id]||null,querySelector:()=>null,createElement(tag){if(tag==='canvas')return {width:0,height:0,getContext:()=>context,toBlob(cb){if(options.tainted)throw Error('SecurityError');cb(new Blob(['image'],{type:'image/png'}));}};return element();}};
  const navigator={canShare:()=>options.fileSharing!==false,share(){shares++;return new Promise((resolve,reject)=>{release=options.cancel ? ()=>reject(Object.assign(Error('cancel'),{name:'AbortError'})) : resolve;});},clipboard:{writeText:async t=>{urls.push(t);}}};
  const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../public/story-sharing.js'),'utf8'),{window,document,navigator,Blob,File,setTimeout,clearTimeout,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}});
  return {api:window.GoBookrStories,ids,platforms,text,urls,shares:()=>shares,release:()=>release()};
}

test('text-only Story prepares a PNG and preserves a long caption without silently cutting it', async()=>{
  const h=harness();h.ids.copy.value='x'.repeat(500);await h.api.prepare();
  assert.equal(h.ids['story-ready-image'].src,'blob:test');assert.equal(h.ids['story-ready-preview'].hidden,false);
  assert.equal(h.text.filter(row=>/^x+$/.test(row.t)).map(row=>row.t).join('').length,500);
  assert.ok(h.text.filter(row=>/^x+$/.test(row.t)).every(row=>row.y<=1650));
  assert.equal(h.ids['story-share-ready-bottom'].disabled,false);
});
test('sharing requires preparation, runs once per gesture, and handles cancellation without claiming publication',async()=>{
  const h=harness({cancel:true});await h.api.share();assert.equal(h.shares(),0);
  await h.api.prepare();const first=h.api.share();await h.api.share();assert.equal(h.shares(),1);
  h.release();await first;assert.match(h.ids['story-ready-status'].textContent,/cancelled/);
  assert.equal(h.ids['story-share-ready'].disabled,false);assert.equal(h.ids['story-share-ready-bottom'].disabled,false);
});
test('changed copy invalidates every prepared share action and unsupported file sharing offers a save fallback',async()=>{
  const h=harness({fileSharing:false});await h.api.prepare();await h.api.share();assert.equal(h.shares(),0);
  assert.match(h.ids['story-ready-status'].textContent,/Save image/);
  h.ids.copy.value='Changed';h.ids.copy.listeners.input();assert.equal(h.ids['story-ready-preview'].hidden,true);
  assert.equal(h.ids['story-share-ready'].disabled,true);assert.equal(h.ids['story-share-ready-bottom'].disabled,true);await h.api.share();assert.equal(h.shares(),0);
});
test('platform guides and copied GoBookr link match the selected destination',async()=>{
  const h=harness();h.platforms[2].listeners.click();assert.equal(h.platforms[2]['aria-pressed'],'true');
  assert.match(h.ids['story-sharing-steps'].children[1].textContent,/Snapchat/);
  await h.ids['story-copy-url'].listeners.click();assert.equal(h.urls[0],'https://gobookr.com/pro/1?source=marketing-show-my-work');
  assert.match(h.ids['story-ready-status'].textContent,/GoBookr link copied/);
});
test('share panel makes the phone-first social action obvious and escapes user content',async()=>{
  const h=harness({tainted:true});await assert.rejects(h.api.prepare(),/photo/);
  const html=storySharingPanel({title:'"<script>',label:'Test',url:'https://gobookr.com/pro/1',style:'classic'});
  assert.match(html,/Turn these openings into a Story/);assert.match(html,/Share to socials/);assert.match(html,/1080 × 1920/);
  assert.match(html,/&quot;&lt;script&gt;/);assert.doesNotMatch(html,/data-title=""<script>/);
});

test('real Marketing Center renders text-only choice, escaped attributes, and valid inline scripts', async()=>{
  const filename = require.resolve('../routes/pro');
  const local = createRequire(filename), module = {exports:{}};
  const db = {prepare(sql){return {get(){return sql.includes('FROM pro_profiles') ? {id:1,business_name:'Test </script> Studio'} : {scheduled_count:0,live_opening_count:0};},all(){return sql.includes('FROM portfolio_items') ? [{id:42,caption:'Work',image_url:'https://example.test/work.jpg'}] : [];}};}};
  const overrides = {'../db':db,'../lib/favorites':{currentSaves:()=>0},'../lib/layout':{layout:m=>m.body},'./onboarding':{renderSetupPage(){}}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,process:{env:{}},console,URL,URLSearchParams,__dirname:path.dirname(filename),require:name=>Object.hasOwn(overrides,name)?overrides[name]:local(name)});
  const routes=new Map();module.exports({get:(p,fn)=>routes.set(p,fn),post(){}});
  const res={writeHead(status){this.status=status;},end(body){this.body=body;}};
  await routes.get('/dashboard/pro/marketing')({currentUser:{id:3,role:'pro'},session:{csrf_token:'csrf'},query:{campaign:'show-my-work',photo:'none',copy:'Fresh work'},res});
  assert.equal(res.status,200);assert.match(res.body,/Text only · no photo/);
  assert.doesNotMatch(res.body,/<img crossorigin="anonymous"/);
  assert.match(res.body,/data-title="Test &lt;\/script&gt; Studio"/);
  assert.match(res.body,/id="story-prepare"/);
  for (const script of res.body.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  await routes.get('/dashboard/pro/marketing')({currentUser:{id:3,role:'pro'},session:{csrf_token:'csrf'},query:{campaign:'show-my-work',photo:'42'},res});
  assert.match(res.body,/<img crossorigin="anonymous" src="https:\/\/example.test\/work.jpg"/);
});
