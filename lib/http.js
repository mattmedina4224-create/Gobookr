'use strict';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
};

function redirect(res, location) {
  res.writeHead(302, { ...SECURITY_HEADERS, Location: location });
  res.end();
}

function send(res, html, status = 200) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function flashFromQuery(query) {
  if (query.error) return { type: 'error', message: String(query.error).slice(0, 1000) };
  if (query.success) return { type: 'success', message: String(query.success).slice(0, 1000) };
  return null;
}

module.exports = { redirect, send, flashFromQuery };
