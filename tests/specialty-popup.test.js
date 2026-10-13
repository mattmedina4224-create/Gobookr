'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../public/specialty-search.js'), 'utf8');
function setup(dismissed = false) {
  const handlers = {}; const timers = [];
  const query = { value: '', focus() { this.focused = true; } }; const city = { value: '' };
  const launch = { attrs: {}, setAttribute(k,v) { this.attrs[k]=v; }, addEventListener(k,f) { handlers['launch:'+k]=f; }, focus() { this.focused=true; } };
  const close = { addEventListener(k,f) { handlers['close:'+k]=f; } };
  const dialog = { show() { this.open=true; }, close() { this.open=false; }, querySelector(s) { return s==='[name="q"]'?query:s==='[name="city"]'?city:close; }, addEventListener(k,f) { handlers['dialog:'+k]=f; } };
  const previousFocus = { focus() { this.restored=true; } };
  const home = { querySelector(s) { return { value:s==='[name="city"]'?'Denver':'scar camouflage' }; } };
  const storage = { value:dismissed?'1':null, getItem() { return this.value; }, setItem(k,v) { this.value=v; } };
  vm.runInNewContext(script,{ document:{ activeElement:previousFocus, getElementById(){return dialog;}, querySelector(s){return s==='[data-specialty-open]'?launch:home;} }, sessionStorage:storage, setTimeout(f){timers.push(f);return 1;}, clearTimeout(){} });
  return {handlers,timers,query,city,launch,dialog,storage,previousFocus};
}
test('floating chat opens automatically without focusing input or trapping the page',()=>{
  const s=setup();assert.equal(s.timers.length,1);s.timers[0]();assert.ok(s.dialog.open);assert.ok(s.previousFocus.restored);assert.ok(!s.query.focused);assert.equal(s.launch.attrs['aria-expanded'],'true');
});
test('bubble carries search input, closes, and preserves the customer draft on reopen',()=>{
  const s=setup(true);assert.equal(s.timers.length,0);s.handlers['launch:click']({preventDefault(){}});assert.ok(s.query.focused);assert.equal(s.query.value,'scar camouflage');assert.equal(s.city.value,'Denver');s.query.value='fine line';s.handlers['close:click']();assert.equal(s.dialog.open,false);assert.equal(s.storage.value,'1');assert.ok(s.launch.focused);s.handlers['launch:click']({preventDefault(){}});assert.equal(s.query.value,'fine line');s.handlers['dialog:keydown']({key:'Escape',preventDefault(){}});assert.equal(s.dialog.open,false);
});
test('browsers without dialog support retain a normal search link',()=>{
  vm.runInNewContext(script,{document:{getElementById(){return {};},querySelector(){return {addEventListener(){throw Error('Must retain link fallback');}};}}});
});
