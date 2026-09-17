'use strict';

const db = require('../db');
const { redirect, send } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const square = require('../lib/square-bookings');

const pending = new Map();

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/pro'));
    return null;
  }
  return db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
}

module.exports = function (router) {
  router.get('/dashboard/pro/square/connect', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    if (!square.configured()) {
      return redirect(ctx.res, '/dashboard/pro?error=' + encodeURIComponent('Square connection is not configured yet.'));
    }
    const state = square.makeState();
    pending.set(state, { userId: ctx.currentUser.id, proId: profile.id, createdAt: Date.now() });
    redirect(ctx.res, square.authorizationUrl(state));
  });

  router.get('/integrations/square/callback', async (ctx) => {
    const state = String(ctx.query.state || '');
    const code = String(ctx.query.code || '');
    const saved = pending.get(state);
    pending.delete(state);
    if (!saved || !code || Date.now() - saved.createdAt > 10 * 60 * 1000) {
      return redirect(ctx.res, '/dashboard/pro?error=' + encodeURIComponent('Square connection expired. Please try again.'));
    }
    if (!ctx.currentUser || ctx.currentUser.id !== saved.userId) return redirect(ctx.res, '/login');
    try {
      const token = await square.exchangeCode(code);
      const [members, locations] = await Promise.all([
        square.listBookableTeamMembers(token.access_token),
        square.listLocationBookingProfiles(token.access_token),
      ]);
      const names = members.map((m) => m.displayName).filter(Boolean);
      const bookingUrl = locations.map((l) => l.booking_site_url).find(Boolean) || '';
      const summary = `Connected Square. Found ${names.length} bookable professional${names.length === 1 ? '' : 's'}${bookingUrl ? ' and a booking link' : ''}.`;
      return send(ctx.res, `<section class="section container"><div class="panel"><h1>Square connected</h1><p>${escapeHtml(summary)}</p>${names.length ? `<h3>Bookable professionals</h3><ul>${names.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>` : '<p class="muted">No bookable team members were returned.</p>'}${bookingUrl ? `<p><a class="btn secondary" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer">Open Square booking page</a></p>` : ''}<p><a class="btn" href="/dashboard/pro">Back to dashboard</a></p></div></section>`);
    } catch (err) {
      return redirect(ctx.res, '/dashboard/pro?error=' + encodeURIComponent(err.message || 'Unable to connect Square.'));
    }
  });
};
