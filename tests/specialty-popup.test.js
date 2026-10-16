'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../public/specialty-search.js'), 'utf8');
function setup() {
  const handlers = {};
  const query = { value: '', focus() { this.focused = true; } }; const city = { value: '' };
  const launch = { attrs: {}, setAttribute(k,v) { this.attrs[k]=v; }, addEventListener(k,f) { handlers['launch:'+k]=f; }, focus() { this.focused=true; } };
  const close = { addEventListener(k,f) { handlers['close:'+k]=f; } };
  const dialog = { show() { this.open=true; }, close() { this.open=false; }, querySelector(s) { return s==='[name="q"]'?query:s==='[name="city"]'?city:close; }, addEventListener(k,f) { handlers['dialog:'+k]=f; } };
  const home = { querySelector(s) { return { value:s==='[name="city"]'?'Denver':'scar camouflage' }; } };
  vm.runInNewContext(script,{ document:{ getElementById(){return dialog;}, querySelector(s){return s==='[data-specialty-open]'?launch:home;} } });
  return {handlers,query,city,launch,dialog};
}
test('specialty bot stays quiet until the customer opens it',()=>{
  const s=setup();assert.ok(!s.dialog.open);assert.ok(!s.query.focused);
});
test('launcher carries homepage search context, closes, and preserves the draft on reopen',()=>{
  const s=setup();s.handlers['launch:click']({preventDefault(){}});assert.ok(s.dialog.open);assert.ok(s.query.focused);assert.equal(s.query.value,'scar camouflage');assert.equal(s.city.value,'Denver');assert.equal(s.launch.attrs['aria-expanded'],'true');s.query.value='fine line';s.handlers['close:click']();assert.equal(s.dialog.open,false);assert.ok(s.launch.focused);s.handlers['launch:click']({preventDefault(){}});assert.equal(s.query.value,'fine line');s.handlers['dialog:keydown']({key:'Escape',preventDefault(){}});assert.equal(s.dialog.open,false);
});
test('browsers without dialog support retain a normal search link',()=>{
  vm.runInNewContext(script,{document:{getElementById(){return {};},querySelector(){return {addEventListener(){throw Error('Must retain link fallback');}};}}});
});
