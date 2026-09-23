'use strict';

const db = require('../db');
const { send } = require('./http');

// A claim is an existing listing ID, never an arbitrary redirect destination.
function requireClaimProfile(ctx, value) {
  const validId = typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const profile = validId ? db.prepare('SELECT * FROM pro_profiles WHERE id = ?').get(Number(value)) : null;
  if (!profile) {
    send(ctx.res, '<h1>404 — profile not found</h1>', 404);
    return null;
  }
  if (profile.user_id != null || !['unclaimed', 'claim_pending'].includes(profile.claim_status)) {
    send(ctx.res, '<h1>This profile is not available to claim.</h1>', 409);
    return null;
  }
  return profile;
}

module.exports = { requireClaimProfile };
