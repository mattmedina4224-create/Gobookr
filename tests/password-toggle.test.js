'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../routes/auth'), 'utf8');
const helper = source.slice(source.indexOf('function passwordField('), source.indexOf('function resetTokenHash('));
const render = vm.runInNewContext(`${helper}; passwordField`, { escapeHtml: value => value });

test('eye toggles its named password even when autofill inserts a sibling', () => {
  for (const name of ['password', 'confirm_password']) {
    const html = render({ name });
    const handler = html.match(/onclick="([^"]+)"/)[1];
    const input = { type: 'password', value: 'Test-only value' };
    const unrelatedSibling = { type: 'hidden' };
    const attrs = { 'aria-controls': name };
    const icons = { '.eye-open': { style: {} }, '.eye-off': { style: {} } };
    const button = {
      previousElementSibling: unrelatedSibling,
      getAttribute: key => attrs[key],
      setAttribute: (key, value) => { attrs[key] = value; },
      querySelector: selector => icons[selector],
    };
    const click = vm.runInNewContext(`(function(){${handler}})`, {
      document: { getElementById: id => id === name ? input : null },
    });
    click.call(button);
    assert.equal(input.type, 'text');
    assert.equal(attrs['aria-label'], 'Hide password');
    assert.equal(attrs['aria-pressed'], 'true');
    click.call(button);
    assert.equal(input.type, 'password');
    assert.equal(input.value, 'Test-only value');
    assert.equal(unrelatedSibling.type, 'hidden');
    assert.equal(attrs['aria-label'], 'Show password');
    assert.equal(attrs['aria-pressed'], 'false');
  }
});
