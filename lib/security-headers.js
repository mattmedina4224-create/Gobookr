'use strict';

function applySecurityHeaders(res, { production = process.env.NODE_ENV === 'production' } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

module.exports = { applySecurityHeaders };
