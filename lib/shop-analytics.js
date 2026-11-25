'use strict';
// Business page analytics: records public page views and booking-link clicks, and summarizes them for owners.
// Only real recorded events are ever reported; nothing is estimated or back-filled.
const db = require('../db');

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|curl|wget|python|node-fetch|axios|headless|lighthouse|pingdom|uptime|monitor/i;
const FRESH = 'WITH fresh_read AS (SELECT 1) ';

function isLikelyHuman(req) {
  const ua = String(req?.headers?.['user-agent'] || '');
  if (!ua || ua.length < 20 || BOT.test(ua)) return false;
  const purpose = String(req?.headers?.purpose || req?.headers?.['sec-purpose'] || '');
  return !/prefetch|prerender/i.test(purpose);
}

function record(shopId, type, { req, isOwner = false } = {}) {
  if (isOwner || !isLikelyHuman(req)) return false;
  if (!['profile_view', 'booking_click'].includes(type)) return false;
  try {
    db.prepare('INSERT INTO shop_events (shop_id, event_type) VALUES (?, ?)').run(Number(shopId), type);
    return true;
  } catch (err) {
    console.error('[shop-analytics] record failed', String(err && err.code || err && err.name || 'Error'));
    return false;
  }
}

// One query: totals for 7/30 days, all-time, daily counts for the last 30 days, and when tracking began.
function summary(shopId) {
  try {
    const rows = db.prepare(FRESH + `SELECT event_type, (created_at AT TIME ZONE 'America/Denver')::date AS day, COUNT(*)::int AS n, MIN(created_at) AS first_at
      FROM shop_events WHERE shop_id = ? AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days' GROUP BY 1, 2`).all(Number(shopId));
    const all = db.prepare(FRESH + `SELECT COUNT(*) FILTER (WHERE event_type = 'profile_view')::int AS views, COUNT(*) FILTER (WHERE event_type = 'booking_click')::int AS clicks,
      MIN(created_at) AS first_at FROM shop_events WHERE shop_id = ?`).get(Number(shopId)) || {};
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 86400000);
      days.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(d));
    }
    const byDay = Object.fromEntries(days.map((d) => [d, { views: 0, clicks: 0 }]));
    for (const r of rows) {
      const key = typeof r.day === 'string' ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10);
      if (!byDay[key]) continue;
      byDay[key][r.event_type === 'profile_view' ? 'views' : 'clicks'] += Number(r.n);
    }
    const series = days.map((d) => ({ day: d, ...byDay[d] }));
    const sum = (list, k) => list.reduce((t, x) => t + x[k], 0);
    return {
      ok: true,
      views30: sum(series, 'views'), clicks30: sum(series, 'clicks'),
      views7: sum(series.slice(-7), 'views'), clicks7: sum(series.slice(-7), 'clicks'),
      viewsAll: Number(all.views || 0), clicksAll: Number(all.clicks || 0),
      firstAt: all.first_at ? new Date(all.first_at) : null, series,
    };
  } catch (err) {
    console.error('[shop-analytics] summary failed', String(err && err.code || err && err.name || 'Error'));
    return { ok: false, views30: 0, clicks30: 0, views7: 0, clicks7: 0, viewsAll: 0, clicksAll: 0, firstAt: null, series: [] };
  }
}

module.exports = { record, summary, isLikelyHuman, TRACKING_STARTED: '2026-11-25' };
