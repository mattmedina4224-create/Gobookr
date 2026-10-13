'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {suggest}=require('../public/specialty-suggestions');const catalog=require('../lib/service-catalog');
test('suggestions match prefixes and aliases, deduplicate professions and preserve unknown input',()=>{
  assert.ok(suggest(catalog.entries,'bala').includes('Balayage'));
  assert.ok(suggest(catalog.entries,'bald').includes('Skin fade'));
  assert.ok(suggest(catalog.entries,'fineline').includes('Fine line tattoo'));
  assert.ok(suggest(catalog.entries,'black grey').includes('Black and gray realism'));
  assert.deepEqual(suggest(catalog.entries,'gelx'),['Gel X']);
  const bridal=suggest(catalog.entries,'bridal');assert.equal(bridal.length,new Set(bridal).size);assert.ok(bridal.length<=5);
  assert.deepEqual(suggest(catalog.entries,'bespoke obscure specialty'),[]);assert.deepEqual(suggest(catalog.entries,'b'),[]);
});
function setup(fetcher=async()=>({ok:true,json:async()=>catalog})) {
  const handlers={};let calls=0;
  const input={value:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(k,v){handlers[k]=v;},focus(){document.activeElement=this;},form:{addEventListener(k,v){handlers['form:'+k]=v;}}};
  const list={hidden:true,children:[],replaceChildren(){this.children=[];},append(el){this.children.push(el);}};
  const status={textContent:''};
  const document={activeElement:input,getElementById(id){return id==='specialty-query'?input:id==='specialty-suggestions'?list:status;},createElement(){return {attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.events[k]=v;}};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/specialty-autocomplete.js'),'utf8'),{document,window:{SpecialtySuggestions:{suggest}},fetch:async()=>{calls++;return fetcher();}});
  const key=key=>{const e={key,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};handlers.keydown(e);return e;};
  return {input,list,status,handlers,key,document,calls:()=>calls};
}
test('keyboard selection fills canonical label, free text submits and catalog loads once',async()=>{
  const s=setup();s.input.value='bald';await s.handlers.input();assert.equal(s.input.attrs['aria-expanded'],'true');assert.equal(s.list.children[0].textContent,'Skin fade');
  s.key('ArrowUp');assert.equal(s.input.attrs['aria-activedescendant'],'specialty-option-0');assert.ok(s.key('Enter').prevented);assert.equal(s.input.value,'Skin fade');assert.ok(s.list.hidden);
  s.input.value='bala';await s.handlers.input();assert.equal(s.calls(),1);const e=s.key('Escape');assert.ok(e.stopped);assert.ok(s.list.hidden);
  s.input.value='totally custom';await s.handlers.input();assert.ok(s.list.hidden);assert.ok(!s.key('Enter').prevented);assert.equal(s.input.value,'totally custom');
});
test('tap selects suggestion without submitting or replacing free text prematurely',async()=>{
  const s=setup();s.input.value='fineline';await s.handlers.input();const button=s.list.children[0];button.events.click();assert.equal(s.input.value,'Fine line tattoo');assert.ok(s.list.hidden);
});
test('catalog failure keeps manual search usable',async()=>{
  const s=setup(async()=>{throw Error('offline');});s.input.value='balayage';await s.handlers.input();assert.equal(s.input.value,'balayage');assert.ok(s.list.hidden);
});
test('late catalog response does not reopen suggestions after blur',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const s=setup(()=>pending);s.input.value='bala';const render=s.handlers.input();s.handlers.blur();s.document.activeElement=null;resolve({ok:true,json:async()=>catalog});await render;assert.ok(s.list.hidden);
});
