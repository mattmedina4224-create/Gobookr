'use strict';

const { randomUUID } = require('node:crypto');
const { PROFESSIONAL_CATEGORY_VALUES } = require('./pro-categories');
const categories = new Set(PROFESSIONAL_CATEGORY_VALUES);

// Request events, not unique visitors. No cookies, identity, search text,
// IP addresses, referrers or precise location are collected here.
// Runtime-log retention is provider-dependent; this is not a metrics warehouse.
function installPublicAnalytics(ctx, pathname, { log = console.log, environment = process.env.VERCEL_ENV || 'development' } = {}) {
  const { req, res } = ctx;
  const headers = req.headers || {};
  if (req.method !== 'GET' || headers.dnt === '1' || headers['sec-gpc'] === '1') return;
  if (/prefetch/i.test(String(headers.purpose || headers['sec-purpose'] || ''))) return;
  if (/(?:bot|crawler|spider|headless)/i.test(String(headers['user-agent'] || ''))) return;
  let route = null;
  if (['/', '/search', '/openings', '/pricing', '/business-account'].includes(pathname)) route = pathname;
  else if (/^\/pro\/\d+$/.test(pathname)) route = '/pro/:id';
  else if (/^\/shop\/\d+$/.test(pathname)) route = '/shop/:id';
  else if (/^\/discover\/[a-z0-9-]+\/[a-z_]+$/.test(pathname)) route = '/discover/:city/:category';
  if (!route) return;
  const requestId = randomUUID();
  res.once('finish', () => {
    if (res.statusCode !== 200 || !String(res.getHeader('Content-Type') || '').startsWith('text/html')) return;
    const base = { message: 'gobookr_analytics', version: 1, environment, request_id: requestId, route, timestamp: new Date().toISOString() };
    try {
      log(JSON.stringify({ ...base, event: 'visit' }));
      if (route === '/search') {
        const query = ctx.query || {};
        const count = ctx.analyticsSearchResults;
        log(JSON.stringify({ ...base, event: 'search', category: categories.has(query.category) ? query.category : 'all',
          result_type: ['all', 'professionals', 'businesses'].includes(query.type) ? query.type : 'all',
          has_location_filter: Boolean(query.city || (query.lat && query.lon)), has_text_filter: Boolean(query.q),
          ...(Number.isInteger(count) && count >= 0 ? { result_count: count } : {}) }));
      }
    } catch (_) { /* Analytics must never prevent a page response. */ }
  });
}

module.exports = { installPublicAnalytics };
