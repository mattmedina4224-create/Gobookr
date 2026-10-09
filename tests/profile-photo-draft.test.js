'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../public/profile-photo-crop.js'),'utf8');

function runUpload(response) {
  const handlers={};
  const elements={};
  for(const id of ['profile_photo','profile-photo-crop','profile-crop-dialog','profile-crop-canvas','profile-crop-zoom','profile-crop-save','profile-photo-form']) {
    elements[id]={addEventListener:(name,fn)=>handlers[id+':'+name]=fn,disabled:false};
  }
  const form=elements['profile-photo-form'];
  form.action='https://preview.example/dashboard/pro/profile-photo';
  form.appendChild=node=>elements.status=node;
  form.submit=()=>assert.fail('Photo upload must not navigate away');
  elements['profile-crop-canvas'].getContext=()=>({});
  elements['profile-crop-canvas'].toBlob=fn=>fn({});
  elements['profile-crop-dialog'].close=()=>{};
  let photoReplaced=false;
  const context={document:{getElementById:id=>elements[id],createElement:()=>({style:{},setAttribute:()=>{}}),querySelector:()=>({replaceChildren:()=>photoReplaced=true})},window:{addEventListener:()=>{},location:{href:'https://preview.example/dashboard/pro/profile'}},URL,FormData:class{set(){}},fetch:async()=>response,DOMParser:class{parseFromString(){return {querySelector:()=>({})};}}};
  vm.runInNewContext(script,context);
  handlers['profile-crop-save:click']();
  return {elements,photoReplaced:()=>photoReplaced};
}

test('photo storage error is shown inline without discarding profile input',async()=>{
  const result=runUpload({ok:true,url:'https://preview.example/dashboard/pro/profile?error=Photo%20storage%20is%20not%20configured.'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(result.elements.status.textContent,/Photo storage is not configured/);
  assert.match(result.elements.status.textContent,/unsaved profile details have been kept/);
  assert.equal(result.photoReplaced(),false);
  assert.equal(result.elements['profile-crop-save'].disabled,false);
});

test('successful photo upload updates only the photo without navigating',async()=>{
  const result=runUpload({ok:true,url:'https://preview.example/dashboard/pro/profile?success=Profile%20photo%20updated.',text:async()=>'<img>'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(result.photoReplaced(),true);
  assert.match(result.elements.status.textContent,/Photo saved/);
});

test('expired session preserves the page and gives a retry explanation',async()=>{
  const result=runUpload({ok:false,status:403,url:'https://preview.example/dashboard/pro/profile-photo'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(result.elements.status.textContent,/session expired/);
  assert.equal(result.photoReplaced(),false);
  assert.equal(result.elements['profile-crop-save'].disabled,false);
});
