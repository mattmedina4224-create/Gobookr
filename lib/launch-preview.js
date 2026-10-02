'use strict';
const { escapeHtml } = require('./util');
// Preview-only, same-origin frame: the embedded document really lays out at 375px.
// No authenticated routes, external frame URLs, or production endpoint.
function serveLaunchPreview(req, res) {
  if (process.env.VERCEL_ENV !== 'preview' || req.method !== 'GET') return false;
  const url = new URL(req.url, 'https://preview.invalid');
  if (url.pathname !== '/__launch-preview') return false;
  const requested = url.searchParams.get('page') || '/';
  const allowed = /^\/(?:$|search(?:\?|$)|pricing$|openings$|pro\/\d+(?:\/claim)?(?:\?|$)|shop\/\d+$|discover\/[a-z-]+\/[a-z_]+$)/.test(requested) && !requested.includes('\\');
  const page = allowed ? requested : '/';
  const width = url.searchParams.get('width') === '1024' ? 1024 : 375;
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow', 'X-Frame-Options':'DENY'});
  res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GoBookr preview verification</title></head><body style="margin:0;padding:16px;font-family:system-ui;background:#edf2f7"><h1>Preview verification</h1><form><label>Page <input name="page" value="${escapeHtml(page)}"></label> <label>Width <select name="width"><option value="375"${width===375?' selected':''}>Mobile 375px</option><option value="1024"${width===1024?' selected':''}>Desktop 1024px</option></select></label> <button>Open page</button></form><p>Actual document viewport: ${width}px. This tool exists only on preview deployments.</p><iframe title="GoBookr test page" src="${escapeHtml(page)}" style="display:block;width:${width}px;height:812px;border:0;background:white;margin-top:16px"></iframe></body></html>`);
  return true;
}
module.exports = { serveLaunchPreview };
