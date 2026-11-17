'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { suggest } = require('../public/specialty-suggestions');
const catalog = require('../lib/service-catalog');

test('homepage suggestions include razor fade and existing catalog specialties', () => {
  assert.ok(suggest(catalog.entries, 'Razor', 8).includes('Razor fade'));
  assert.ok(suggest(catalog.entries, 'balay', 8).includes('Balayage'));
  assert.ok(suggest(catalog.entries, 'Russian', 8).includes('Russian manicure'));
  assert.ok(suggest(catalog.entries, 'fine line', 8).includes('Fine line tattoo'));
});

test('homepage What search renders clickable, keyboard accessible suggestions', async () => {
  const handlers = {};
  const input = {
    value: '', attrs: {}, form: { addEventListener() {} },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(k, v) { handlers[k] = v; },
    focus() { document.activeElement = this; }
  };
  const list = {
    hidden: true, children: [],
    replaceChildren() { this.children = []; },
    append(element) { this.children.push(element); }
  };
  const status = { textContent: '' };
  const document = {
    activeElement: input,
    getElementById(id) {
      return {
        'home-q': input,
        'home-specialty-suggestions': list,
        'home-specialty-status': status
      }[id];
    },
    createElement() {
      return {
        events: {}, attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(k, v) { this.events[k] = v; }
      };
    }
  };
  let fetches = 0;
  const script = fs.readFileSync(path.join(__dirname, '../public/home-specialty-autocomplete.js'), 'utf8');
  vm.runInNewContext(script, {
    document,
    window: { SpecialtySuggestions: { suggest } },
    fetch: async () => { fetches++; return { ok: true, json: async () => catalog }; }
  });

  input.value = 'Razor';
  await handlers.input();
  assert.equal(list.hidden, false);
  assert.equal(input.attrs['aria-expanded'], 'true');
  assert.ok(list.children.some(item => item.textContent === 'Razor fade'));
  const index = list.children.findIndex(item => item.textContent === 'Razor fade');
  list.children[index].events.click();
  assert.equal(input.value, 'Razor fade');
  assert.equal(list.hidden, true);

  input.value = 'Russian';
  await handlers.input();
  assert.equal(fetches, 1);
  const down = { key: 'ArrowDown', preventDefault() { this.prevented = true; } };
  handlers.keydown(down);
  assert.equal(down.prevented, true);
  const enter = { key: 'Enter', preventDefault() { this.prevented = true; } };
  handlers.keydown(enter);
  assert.equal(enter.prevented, true);
  assert.ok(input.value.toLowerCase().includes('russian'));
});

test('homepage markup connects search field, scripts and accessible dropdown', () => {
  const file = fs.readFileSync(path.join(__dirname, '../routes/home.js'), 'utf8');
  assert.match(file, /id="home-q"[^\n]*role="combobox"/);
  assert.match(file, /id="home-specialty-suggestions"[^\n]*role="listbox"/);
  assert.match(file, /home-specialty-autocomplete\.js/);
  assert.match(file, /home-specialty-autocomplete\.css/);
});
