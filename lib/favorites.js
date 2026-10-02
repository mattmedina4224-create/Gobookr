'use strict';

const db = require('../db');
const { escapeHtml, icon } = require('./util');

// These queries deliberately bypass the adapter's SELECT cache: saves must reflect
// writes made by other server instances as well as this process.
function favoriteIds(ctx, profiles) {
  if (ctx.currentUser?.role !== 'customer' || !profiles.length) return new Set();
  const ids = profiles.map(pro => Number(pro.id));
  const rows = db.prepare(`WITH favorites AS (
    SELECT pro_id FROM customer_favorites WHERE customer_id = ?
      AND pro_id IN (${ids.map(() => '?').join(',')})
  ) SELECT pro_id FROM favorites`).all(ctx.currentUser.id, ...ids);
  return new Set(rows.map(row => Number(row.pro_id)));
}

function favoriteControl(pro, ctx, saved = false, returnTo = '') {
  if (ctx.currentUser && ctx.currentUser.role !== 'customer') return '';
  const label = `${saved ? 'Remove' : 'Save'} ${pro.business_name} ${saved ? 'from' : 'to'} Favorites`;
  const heart = icon('heart',saved?'is-saved':'');
  if (!ctx.currentUser) return `<a class="favorite-control" href="/login?next=${encodeURIComponent('/pro/' + pro.id)}" aria-label="${escapeHtml(label)}">${heart} Save</a>`;
  return `<form class="favorite-form" method="POST" action="/favorites/${pro.id}">
    <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
    <input type="hidden" name="saved" value="${saved ? '0' : '1'}" />
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo || ctx.req?.url || '/pro/' + pro.id)}" />
    <button class="favorite-control" type="submit" aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${heart} ${saved ? 'Saved' : 'Save'}</button>
  </form>`;
}

function currentSaves(proId) {
  return Number(db.prepare(`WITH saves AS (
    SELECT COUNT(*) AS total FROM customer_favorites WHERE pro_id = ?
  ) SELECT total FROM saves`).get(proId).total);
}

function favoriteReturnPath(value, proId) {
  // Restrict redirects to known local discovery pages; never trust Referer.
  if (typeof value !== 'string' || value.length > 2048 || /[\\\r\n]/.test(value)) return `/pro/${proId}`;
  try {
    const url = new URL(value, 'https://gobookr.com');
    if (!value.startsWith('/') || url.origin !== 'https://gobookr.com' ||
      !/^(\/|\/search|\/dashboard\/customer|\/pro\/\d+)$/.test(url.pathname)) return `/pro/${proId}`;
    return url.pathname + url.search;
  } catch (_) { return `/pro/${proId}`; }
}

module.exports = { favoriteIds, favoriteControl, currentSaves, favoriteReturnPath };
