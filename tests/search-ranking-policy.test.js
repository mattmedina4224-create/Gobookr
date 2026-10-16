'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSearch}=require('../lib/specialty-search');
test('ranking policy favors services and bio over broad identity/category matches',()=>{
 const order=buildSearch('balayage').order;
 assert.match(order,/THEN 120/);
 assert.match(order,/THEN 85/);
 assert.match(order,/THEN 60/);
 assert.match(order,/THEN 25/);
 assert.match(order,/license_verified/);
 assert.match(order,/profile_photo_url/);
 assert.match(order,/booking_url/);
});
