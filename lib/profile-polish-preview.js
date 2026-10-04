'use strict';
// Public-page viewport harness only. No account or authentication bypass.
function serveProfilePolishPreview(req, res) {
  if (process.env.VERCEL_ENV !== 'preview' || req.method !== 'GET') return false;
  const url = new URL(req.url, 'https://preview.invalid');
  if (url.pathname !== '/__profile-polish-preview') return false;
  const requested = url.searchParams.get('page') || '/shop/1';
  const page = /^\/(shop|pro)\/\d+$/.test(requested) ? requested : '/shop/1';
  const width = url.searchParams.get('width') === '1024' ? 1024 : 390;
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'});
  res.end(`<!doctype html><html lang="en"><head><title>Profile polish preview test</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;background:#f7f8fa;font-family:system-ui"><p>Preview-only public page test: ${width}px viewport.</p><iframe title="Public profile test" src="${page}" style="display:block;width:${width}px;height:812px;border:0;background:white"></iframe></body></html>`);
  return true;
}
module.exports = { serveProfilePolishPreview };
