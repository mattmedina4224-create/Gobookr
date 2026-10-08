'use strict';

// Dormant policy foundation. Call only with freshly loaded server-side grants
// and a validated session, never request body values or cached memberships.
const PERMISSIONS = Object.freeze({
  platform: Object.freeze(['support.read','support.reply','claims.read','claims.review','licenses.read','licenses.review','inventory.read','inventory.review','marketing.manage','analytics.read','payroll.read','payroll.prepare']),
  business: Object.freeze(['profile.read','profile.edit','team.read','openings.manage','marketing.manage','analytics.read','payroll.read','payroll.prepare']),
});
const validId = value => Number.isSafeInteger(value) && value > 0;
function scopeValid(scope) {
  return Boolean(scope && Object.hasOwn(PERMISSIONS, scope.kind) && validId(scope.id));
}
function sameScope(a, b) {
  return scopeValid(a) && scopeValid(b) && a.kind === b.kind && a.id === b.id;
}
function validatePermissions(scope, values) {
  if (!scopeValid(scope) || !Array.isArray(values) || values.length > PERMISSIONS[scope.kind].length
    || values.some(value => !PERMISSIONS[scope.kind].includes(value))) throw new Error('Invalid staff permissions');
  return [...new Set(values)].sort();
}
function mayPerform({ sessionValid, actorId, ownerId, scope, membership, permission }) {
  if (sessionValid !== true || !validId(actorId) || !validId(ownerId) || !scopeValid(scope)) return false;
  // These operations never belong to an employee, even with fabricated grants.
  if (['staff.manage','payroll.configure'].includes(permission)) return actorId === ownerId;
  // Running payroll requires a separate, reviewed provider command, not this policy.
  if (!PERMISSIONS[scope.kind].includes(permission)) return false;
  if (actorId === ownerId) return true;
  if (!membership || membership.userId !== actorId || membership.ownerId !== ownerId
    || membership.status !== 'active' || !sameScope(scope, membership.scope)) return false;
  try { return validatePermissions(scope, membership.permissions).includes(permission); }
  catch { return false; }
}
module.exports = { PERMISSIONS, validatePermissions, mayPerform };
