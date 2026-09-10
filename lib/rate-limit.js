'use strict';

const buckets = new Map();

const RULES = {
  '/login': { limit: 10, windowMs: 10 * 60 * 1000 },
  '/signup': { limit: 10, windowMs: 15 * 60 * 1000 },
  '/forgot-password': { limit: 5, windowMs: 15 * 60 * 1000 },
  '/reset-password': { limit: 10, windowMs: 15 * 60 * 1000 },
  '/auth/google': { limit: 15, windowMs: 10 * 60 * 1000 },
};

function clientAddress(req) {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return String((req.socket && req.socket.remoteAddress) || 'unknown');
}

function checkAuthRateLimit(req, pathname) {
  if (!req || req.method !== 'POST') return { allowed: true };
  const rule = RULES[pathname];
  if (!rule) return { allowed: true };

  const now = Date.now();
  const key = pathname + ':' + clientAddress(req);
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + rule.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= rule.limit) return { allowed: true };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

function pruneRateLimits() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) if (now >= bucket.resetAt) buckets.delete(key);
}

const pruneTimer = setInterval(pruneRateLimits, 15 * 60 * 1000);
if (typeof pruneTimer.unref === 'function') pruneTimer.unref();

module.exports = { checkAuthRateLimit };
