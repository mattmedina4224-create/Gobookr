'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {layout}=require('../lib/layout');

async function upload({step='',submitter=null,caption='',ok=true}={}) {
 const listeners={};let payload;let fetched=0;
 const element=()=>({style:{},setAttribute(){},removeAttribute(){},addEventListener(){},focus(){},hidden:false});
 const submit=Object.assign(element(),{textContent:'Save & continue'});
 const field=Object.assign(element(),{value:caption});
 const form={action:'/dashboard/pro/portfolio',querySelector:selector=>({
  'button[type="submit"]':submit,'[name="caption"]':field,'[name="_csrf"]':{value:'csrf'},'[name="_setup_step"]':step?{value:step}:null,
 })[selector],addEventListener:(name,fn)=>{listeners[name]=fn;}};
 const parent={querySelector:()=>null,insertBefore(){},appendChild(){}};
 const input=Object.assign(element(),{type:'file',files:[{name:'fixture.png',type:'image/png',size:20}],parentElement:parent,closest:()=>form});
 const document={getElementById:()=>input,querySelector:()=>element(),querySelectorAll:()=>[],createElement:element};
 const window={location:{search:'',href:''}};
 const html=layout({title:'Upload fixture',body:''});
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 vm.runInNewContext(script,{document,window,URLSearchParams,console,
  FileReader:class {readAsDataURL(){this.result='data:image/png;base64,Zml4dHVyZQ==';this.onload();}},
  fetch:async(url,options)=>{fetched++;payload=JSON.parse(options.body);return {ok,status:ok?200:500,redirected:true,url:'https://gobookr.com/dashboard/pro/onboarding?step=booking'};},
 });
 await listeners.submit({preventDefault(){},submitter});
 return {payload,fetched,window,submit,field};
}

test('photo upload carries onboarding context and permits an empty optional caption',async()=>{
 const result=await upload({step:'portfolio'});
 assert.equal(result.fetched,1);
 assert.equal(result.payload.caption,'');
 assert.equal(result.payload._setup_step,'portfolio');
 assert.equal(result.payload._csrf,'csrf');
 assert.match(result.window.location.href,/step=booking/);
});
test('photo upload preserves add-more and save-and-exit submitter intent',async()=>{
 for(const name of ['_setup_add_more','_setup_exit']) {
  const result=await upload({step:'portfolio',submitter:{name,value:'1'},caption:'Saved work'});
  assert.equal(result.payload[name],'1');
  assert.equal(result.payload.caption,'Saved work');
 }
 const standalone=await upload();assert.equal(standalone.payload._setup_step,'');
});
test('failed photo upload keeps the caption and allows retry without advancing',async()=>{
 const result=await upload({step:'portfolio',caption:'Keep my caption',ok:false});
 assert.equal(result.field.value,'Keep my caption');
 assert.equal(result.submit.disabled,false);
 assert.equal(result.window.location.href,'');
});
