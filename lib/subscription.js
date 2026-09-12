'use strict';

const db = require('../db');

const GRACE_DAYS = 7;

function getSubscription(proId) {
  return db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(proId) || null;
}

function sqliteTime(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  if (!raw) return NaN;

  // Postgres commonly returns ISO timestamps with a timezone already attached.
  // Only add UTC when the value is the old SQLite-style `YYYY-MM-DD HH:mm:ss` format.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone
    ? raw
    : (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw);

  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function isTrialActive(subscription) {
  if (!subscription || subscription.status !== 'trialing') return false;
  const endsAt = sqliteTime(subscription.trial_ends_at);
  return Number.isFinite(endsAt) && Date.now() < endsAt;
}

function trialDaysRemaining(subscription) {
  if (!subscription || subscription.status !== 'trialing') return 0;
  const endsAt = sqliteTime(subscription.trial_ends_at);
  if (!Number.isFinite(endsAt)) return 0;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000));
}

function isWithinGrace(subscription) {
  if (!subscription || !['past_due', 'unpaid'].includes(subscription.status)) return false;
  const startValue = subscription.past_due_since || subscription.updated_at;
  if (!startValue) return false;
  const started = sqliteTime(startValue);
  if (!Number.isFinite(started)) return false;
  return Date.now() < started + GRACE_DAYS * 86400000;
}

function isPubliclyVisibleSubscription(subscription) {
  if (!subscription) return true;
  if (subscription.status === 'active') return true;
  if (subscription.status === 'trialing') return isTrialActive(subscription);
  if (subscription.status === 'past_due' || subscription.status === 'unpaid') return isWithinGrace(subscription);
  return false;
}

function isProPubliclyVisible(proId) {
  return isPubliclyVisibleSubscription(getSubscription(proId));
}

function graceDaysRemaining(subscription) {
  if (!subscription || !['past_due', 'unpaid'].includes(subscription.status)) return 0;
  const startValue = subscription.past_due_since || subscription.updated_at;
  const started = sqliteTime(startValue);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.ceil((started + GRACE_DAYS * 86400000 - Date.now()) / 86400000));
}

module.exports = {
  GRACE_DAYS,
  getSubscription,
  isTrialActive,
  trialDaysRemaining,
  isWithinGrace,
  isPubliclyVisibleSubscription,
  isProPubliclyVisible,
  graceDaysRemaining,
};
