'use strict';
const db = require('../db');
// This chooses navigation only; destination routes still enforce authorization.
function dashboardDestination(user, session) {
  const fallback = user?.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer';
  if (process.env.GOBOOKR_STAFF_PORTAL_ENABLED !== 'true' || !user?.id || !session?.token) return fallback;
  try {
    // WITH bypasses compatibility SELECT caches so revoked access is fresh.
    const access = db.prepare(`WITH portal_access AS (
      SELECT 'owner' AS kind FROM staff_ops.owners o JOIN public.sessions s ON s.user_id=o.user_id
      WHERE o.user_id=? AND s.token=? AND s.expires_at>CURRENT_TIMESTAMP
      UNION ALL
      SELECT 'employee' AS kind FROM staff_ops.members m JOIN public.sessions s ON s.user_id=m.user_id
      WHERE m.user_id=? AND m.status='active' AND s.token=? AND s.expires_at>CURRENT_TIMESTAMP
    ) SELECT kind FROM portal_access ORDER BY kind DESC LIMIT 1`).get(user.id,session.token,user.id,session.token);
    if (access?.kind === 'owner') return '/owner';
    if (access?.kind === 'employee') return '/staff';
  } catch {
    console.error('[dashboard-routing] portal lookup unavailable');
  }
  return fallback;
}
module.exports = {dashboardDestination};
