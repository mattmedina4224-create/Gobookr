'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('password eye toggles its own field without submitting, changing values or double-binding',()=>{
 const handlers=[];const fields={password:{type:'password',value:'test-only'},confirm_password:{type:'password',value:'other-test'}};
 const document={addEventListener:(name,fn)=>handlers.push(fn),getElementById:id=>fields[id]};
 const context={document,window:{}};vm.createContext(context);
 const source=fs.readFileSync(require('node:path').join(__dirname,'../public/password-toggle.js'),'utf8');
 vm.runInContext(source,context);vm.runInContext(source,context);assert.equal(handlers.length,1);
 for(const id of Object.keys(fields)){
  const attrs={};const icons={'.eye-open':{style:{}},'.eye-off':{style:{}}};
  const button={dataset:{passwordTarget:id},setAttribute:(key,value)=>attrs[key]=value,querySelector:key=>icons[key]};
  const event={target:{closest:()=>button}};
  handlers[0](event);assert.equal(fields[id].type,'text');assert.equal(attrs['aria-label'],'Hide password');assert.equal(attrs['aria-pressed'],'true');assert.equal(icons['.eye-off'].style.display,'block');
  handlers[0](event);assert.equal(fields[id].type,'password');assert.equal(attrs['aria-label'],'Show password');assert.equal(attrs['aria-pressed'],'false');
 }
 assert.equal(fields.password.value,'test-only');assert.equal(fields.confirm_password.value,'other-test');
 handlers[0]({target:{closest:()=>null}});
});
