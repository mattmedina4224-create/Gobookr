'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
test('discovery schema lists only hydrated public results and empty pages omit schema', async () => {
  const filename = path.join(__dirname, '../routes/public.js'), localRequire = createRequire(filename);
  const sourceRows = [{ id: 42, business_name: 'Internal fixture', city: 'Denver', state: 'CO', categories: ['barber'], services: [], initials: 'IF', rating: null }, { id: 43, business_name: 'Private fixture' }];
  let visible = sourceRows.slice(0, 1), rendered;
  const db = { prepare: () => ({ all: () => sourceRows }) }, module = { exports: {} }, routes = {};
  const dependencies = { '../db': db, '../lib/layout': { layout: options => { rendered = options; return options.body; } },
    '../lib/pro-listing-data': { hydratePros: () => visible }, '../lib/favorites': { favoriteIds: () => new Set(), favoriteControl: () => '' } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, URL, URLSearchParams, Date, console, require: name => dependencies[name] || localRequire(name) });
  module.exports({ get: (name, handler) => routes[name] = handler, post() {} });
  const ctx = { params: { city: 'denver', category: 'barber' }, query: {}, res: { writeHead() {}, end() {} } };
  await routes['/discover/:city/:category'](ctx);
  assert.equal(rendered.structuredData['@type'], 'CollectionPage');
  const list = rendered.structuredData.mainEntity;
  assert.equal(list.numberOfItems, 1); assert.equal(list.itemListElement[0].url, 'https://gobookr.com/pro/42');
  assert.doesNotMatch(JSON.stringify(rendered.structuredData), /Private fixture|pro\/43/);
  visible = []; await routes['/discover/:city/:category'](ctx);
  assert.equal(rendered.structuredData, null); assert.equal(rendered.robots, 'noindex,follow');
});
