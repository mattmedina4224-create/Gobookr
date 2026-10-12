'use strict';

const db = require('../db');
const { escapeHtml: e } = require('./util');
const { hydratePros } = require('./pro-listing-data');

function safeImage(value) {
  try { const url = new URL(String(value || '')); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch (_) { return ''; }
}

function followReturnPath(value, proId) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\r\n]/.test(value)) return `/pro/${proId}`;
  try {
    const url = new URL(value, 'https://gobookr.com');
    if (!value.startsWith('/') || url.origin !== 'https://gobookr.com' || !/^(\/following|\/dashboard\/customer|\/pro\/\d+)$/.test(url.pathname)) return `/pro/${proId}`;
    return url.pathname + url.search;
  } catch (_) { return `/pro/${proId}`; }
}

function followIds(ctx, profiles) {
  if (ctx.currentUser?.role !== 'customer' || !profiles.length) return new Set();
  const ids = [...new Set(profiles.map(p => Number(p.id)))];
  const rows = db.prepare(`WITH follows AS (SELECT pro_id FROM customer_follows WHERE customer_id = ?
    AND pro_id IN (${ids.map(() => '?').join(',')})) SELECT pro_id FROM follows`).all(ctx.currentUser.id, ...ids);
  return new Set(rows.map(row => Number(row.pro_id)));
}

function followControl(pro, ctx, following = false, returnTo = '') {
  if (ctx.currentUser && ctx.currentUser.role !== 'customer') return '';
  const label = `${following ? 'Unfollow' : 'Follow'} ${pro.business_name}`;
  if (!ctx.currentUser) return `<a class="btn secondary follow-control" href="/login?next=${encodeURIComponent('/pro/' + pro.id)}">Follow for updates</a>`;
  return `<form method="POST" action="/following/${pro.id}" class="follow-form">
    <input type="hidden" name="_csrf" value="${e(ctx.session.csrf_token)}">
    <input type="hidden" name="following" value="${following ? '0' : '1'}">
    <input type="hidden" name="return_to" value="${e(returnTo || '/pro/' + pro.id)}">
    <button class="btn secondary follow-control" type="submit" aria-label="${e(label)}" aria-pressed="${following}">${following ? 'Following · Unfollow' : 'Follow for updates'}</button>
  </form>`;
}

function currentFollowers(proId) {
  return Number(db.prepare('WITH followers AS (SELECT COUNT(*) AS total FROM customer_follows WHERE pro_id = ?) SELECT total FROM followers').get(proId).total);
}

function publicUpdates(proId, limit = 5) {
  return db.prepare(`WITH updates AS (SELECT * FROM pro_updates WHERE pro_id = ? AND status = 'published'
    ORDER BY id DESC LIMIT ?) SELECT u.*, pi.image_url FROM updates u LEFT JOIN portfolio_items pi
    ON pi.id = u.portfolio_item_id AND pi.pro_id = u.pro_id ORDER BY u.id DESC`).all(proId, limit);
}

function followedUpdates(customerId, before = null) {
  // Keyset pagination and one bounded query; visibility is bulk-checked, never N+1.
  const rows = db.prepare(`WITH updates AS (
    SELECT u.* FROM pro_updates u JOIN customer_follows f ON f.pro_id = u.pro_id
    WHERE f.customer_id = ? AND u.status = 'published' ${before ? 'AND u.id < ?' : ''}
    ORDER BY u.id DESC LIMIT 21
  ) SELECT p.*, u.id AS update_id, u.message, u.created_at AS update_created_at, pi.image_url AS update_image
    FROM updates u JOIN pro_profiles p ON p.id = u.pro_id
    LEFT JOIN portfolio_items pi ON pi.id = u.portfolio_item_id AND pi.pro_id = u.pro_id
    ORDER BY u.id DESC`).all(customerId, ...(before ? [before] : []));
  const page = rows.slice(0, 20);
  const pros = [...new Map(page.map(p => [Number(p.id), p])).values()];
  const visibleIds = new Set(hydratePros(pros, { includeServices: false }).map(p => Number(p.id)));
  return { updates: page.filter(p => visibleIds.has(Number(p.id)) && p.user_id != null),
    next: rows.length > 20 ? Number(page[page.length - 1].update_id) : null };
}

function renderUpdate(update, pro = null) {
  const image = safeImage(update.update_image || update.image_url);
  const timestamp = update.update_created_at || update.created_at;
  const date = new Date(timestamp);
  const time = Number.isNaN(date.getTime()) ? '' : `<time datetime="${e(date.toISOString())}">${e(date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }))}</time>`;
  return `<article class="panel update-card">${pro ? `<header class="update-heading"><div><h2><a href="/pro/${pro.id}?source=following">${e(pro.business_name)}</a></h2><p class="muted">${e(pro.city)}, ${e(pro.state)}</p></div>${time}</header>` : `<header class="update-heading">${time}</header>`}
    <p class="update-message">${e(update.message)}</p>${image ? `<img class="update-image" src="${e(image)}" alt="Work shared by ${e(pro?.business_name || 'this professional')}" loading="lazy">` : ''}
    ${pro ? `<a class="btn secondary" href="/pro/${pro.id}?source=following">View profile &amp; book</a>` : ''}</article>`;
}

module.exports = { safeImage, followReturnPath, followIds, followControl, currentFollowers, publicUpdates, followedUpdates, renderUpdate };
