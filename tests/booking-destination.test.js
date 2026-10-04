'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
test('generic Booksy search cannot redirect or record a booking click', async () => {
  const filename = path.join(__dirname, '../routes/public.js');
  const localRequire = createRequire(filename);
  let writes = 0;
  let booking = 'https://booksy.com/en-us/s/nail-salon/134761_denver';
  const db = { prepare: () => ({ get: () => ({ id: 42, booking_url: booking }), run: () => { writes++; } }) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, URL, URLSearchParams, console, require: name =>
    name === '../db' ? db : name === '../lib/subscription' ? { isProPubliclyVisible: () => true } : localRequire(name) });
  const routes = {};
  module.exports({ get: (p,h) => { routes[p]=h; }, post() {} });
  const res = { writeHead(status,headers) { this.status=status; this.headers=headers; }, end() {} };
  await routes['/book/:id']({ params: {id:'42'}, query:{}, currentUser:null, res });
  assert.match(res.headers.Location, /^\/pro\/42\?error=/);
  assert.equal(writes, 0);
  booking = 'https://booksy.com/en-us/123_real-professional_barber-shop_134761_denver';
  await routes['/book/:id']({ params: {id:'42'}, query:{}, currentUser:null, res });
  assert.equal(res.headers.Location, booking);
  assert.equal(writes, 2);
});
