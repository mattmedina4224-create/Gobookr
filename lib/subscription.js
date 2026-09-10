'use strict';

const db = require('../db');

const GRACE_DAYS = 7;

function getSubscription(proId) {
  return db.prepare('SELECT * FROM subscriptions WHERE pro_id = ?').get(proId) || null;
}

function isWithinGrace(subscription) {
  if (!subscription || !['past_due', 'unpaid'].includes(subscription.status)) return false;
  const startValue = subscription.past_due_since || subscription.updated_at;
  if (!startValue) return false;
  const started = new Date(String(startValue).replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(started)) return false;
  return Date.now() < started + GRACE_DAYS * 86400000;
}

function isPubliclyVisibleSubscription(subscription) {
  if (!subscription) return true;
  if (subscription.status === 'trialing' || subscription.status === 'active') return true;
  if (subscription.status === 'past_due' || subscription.status === 'unpaid') return isWithinGrace(subscription);
  return false;
}

function isProPubliclyVisible(proId) {
  return isPubliclyVisibleSubscription(getSubscription(proId));
}

function graceDaysRemaining(subscription) {
  if (!subscription || !['past_due', 'unpaid'].includes(subscription.status)) return 0;
  const startValue = subscription.past_due_since || subscription.updated_at;
  const started = new Date(String(startValue || '').replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.ceil((started + GRACE_DAYS * 86400000 - Date.now()) / 86400000));
}

module.exports = { GRACE_DAYS, getSubscription, isWithinGrace, isPubliclyVisibleSubscription, isProPubliclyVisible, graceDaysRemaining };
