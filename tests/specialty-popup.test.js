'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../public/specialty-search.js'), 'utf8');

test('specialty popup carries customer input and restores focus when closed', () => {
  const handlers = {};
  const query = { value: '', focus() { this.focused = true; } };
  const city = { value: '' };
  const launch = { addEventListener(name, fn) { handlers['launch:' + name] = fn; }, focus() { this.focused = true; } };
  const close = { addEventListener(name, fn) { handlers['close:' + name] = fn; } };
  const dialog = {
    showModal() { this.open = true; }, close() { this.open = false; handlers['dialog:close'](); },
    querySelector(selector) { return selector === '[name="q"]' ? query : selector === '[name="city"]' ? city : close; },
    addEventListener(name, fn) { handlers['dialog:' + name] = fn; },
  };
  const home = { querySelector(selector) { return { value: selector === '[name="city"]' ? 'Denver' : 'scar camouflage' }; } };
  vm.runInNewContext(script, { document: { getElementById() { return dialog; }, querySelector(selector) { return selector === '[data-specialty-open]' ? launch : home; } } });
  let prevented = false;
  handlers['launch:click']({ preventDefault() { prevented = true; } });
  assert.ok(prevented && dialog.open && query.focused);
  assert.equal(query.value, 'scar camouflage');
  assert.equal(city.value, 'Denver');
  handlers['close:click']();
  assert.equal(dialog.open, false);
  assert.ok(launch.focused);
});

test('browsers without modal support retain the normal search link', () => {
  vm.runInNewContext(script, { document: { getElementById() { return {}; }, querySelector() { return { addEventListener() { throw new Error('Must retain link fallback'); } }; } } });
});
