'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, mayPerform, validatePermissions } = require('../lib/staff-permissions');
const scope = { kind:'platform', id:1 };
const membership = { userId:2, ownerId:1, scope, status:'active', permissions:['support.read'] };
const request = { sessionValid:true, actorId:2, ownerId:1, scope, membership, permission:'support.read' };
test('staff grants are narrow and sensitive commands cannot be delegated', () => {
  assert.equal(mayPerform(request),true);
  for (const permission of ['support.reply','claims.review','staff.manage','payroll.configure','payroll.run','owner.transfer','unknown']) {
    assert.equal(mayPerform({...request,permission}),false,permission);
  }
  assert.equal(mayPerform({...request,actorId:1,permission:'staff.manage'}),true);
  assert.equal(mayPerform({...request,actorId:1,permission:'payroll.run'}),false);
});
test('invalid sessions, inactive grants and cross-tenant access fail closed', () => {
  for (const sessionValid of [false,undefined,'true',1]) assert.equal(mayPerform({...request,sessionValid}),false);
  for (const status of ['invited','suspended','revoked',undefined]) assert.equal(mayPerform({...request,membership:{...membership,status}}),false);
  for (const patch of [{userId:3},{ownerId:3},{scope:{kind:'platform',id:2}},{scope:{kind:'business',id:1}},{permissions:['support.read','staff.manage']}]) {
    assert.equal(mayPerform({...request,membership:{...membership,...patch}}),false);
  }
  for (const actorId of [0,-1,'2',NaN]) assert.equal(mayPerform({...request,actorId}),false);
  assert.equal(mayPerform({...request,membership:null}),false);
  assert.equal(mayPerform({...request,scope:{kind:'__proto__',id:1}}),false);
});
test('permission catalogs cannot leak business access into platform administration', () => {
  const business = {kind:'business',id:7};
  const member = {...membership,scope:business,permissions:['profile.edit']};
  assert.equal(mayPerform({...request,scope:business,membership:member,permission:'profile.edit'}),true);
  assert.equal(mayPerform({...request,scope:business,membership:member,permission:'licenses.review'}),false);
  assert.throws(()=>validatePermissions(business,['claims.review']),/Invalid/);
  assert.deepEqual(validatePermissions(scope,['support.read','support.read']),['support.read']);
  assert.throws(()=>validatePermissions(scope,['payroll.run']),/Invalid/);
  assert.throws(()=>validatePermissions(scope,'support.read'),/Invalid/);
  assert.ok(Object.isFrozen(PERMISSIONS.platform));
});
