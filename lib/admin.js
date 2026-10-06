'use strict';

const db = require('../db');
const { redirect, send } = require('./http');

function requireAdmin(ctx) {
  if (!ctx.currentUser || !ctx.session?.token) {
    redirect(ctx.res, '/login');
    return false;
  }
  // WITH deliberately bypasses both SELECT-only DB caches. Revoked grants and
  // sessions must take effect even on another running application instance.
  const grant = db.prepare(`WITH admin_access AS (
    SELECT a.user_id FROM public.admin_accounts a
    JOIN public.sessions s ON s.user_id = a.user_id
    WHERE a.user_id = ? AND s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
  ) SELECT user_id FROM admin_access`).get(ctx.currentUser.id, ctx.session.token);
  if (!grant && typeof process !== 'undefined' && process.env.GOBOOKR_STAFF_PORTAL_ENABLED === 'true') {
    const { permissionForRequest } = require('./staff-route-permissions');
    const permission = permissionForRequest(ctx.req);
    if (permission) {
      // WITH bypasses both compatibility caches: revocation takes effect on the
      // next request on every instance, including direct POST requests.
      const staff = db.prepare(`WITH staff_access AS (
        SELECT m.permissions FROM staff_ops.members m
        JOIN public.sessions s ON s.user_id=m.user_id
        WHERE m.user_id=? AND m.status='active' AND s.token=?
          AND s.expires_at>CURRENT_TIMESTAMP
      ) SELECT permissions FROM staff_access`).get(ctx.currentUser.id, ctx.session.token);
      if (staff && Array.isArray(staff.permissions) && staff.permissions.includes(permission)) return true;
    }
  }
  if (!grant) {
    send(ctx.res, '<h1>403 — administrator access required</h1>', 403);
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
