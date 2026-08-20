'use strict';

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function send(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// Flash messages are carried as one-shot query params on the redirect target,
// e.g. redirect(res, '/login?error=' + encodeURIComponent('Invalid credentials')).
function flashFromQuery(query) {
  if (query.error) return { type: 'error', message: query.error };
  if (query.success) return { type: 'success', message: query.success };
  return null;
}

module.exports = { redirect, send, flashFromQuery };
