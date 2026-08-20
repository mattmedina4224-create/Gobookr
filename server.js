'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const Router = require('./lib/router');
const { getSessionUser } = require('./lib/auth');

const router = new Router();
require('./routes/public')(router);
require('./routes/auth')(router);
require('./routes/pro')(router);
require('./routes/customer')(router);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseForm(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (req.method === 'GET' && serveStatic(req, res, pathname)) return;

    const match = router.match(req.method, pathname);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 — page not found</h1><p><a href="/">Back to GoBookr</a></p>');
      return;
    }

    const session = getSessionUser(req);
    const ctx = {
      req,
      res,
      params: match.params,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      currentUser: session ? session.user : null,
      session: session ? session.session : null,
    };

    if (req.method === 'POST') {
      const raw = await readBody(req);
      ctx.body = parseForm(raw);
      // Lightweight CSRF check for logged-in POSTs (login/signup happen pre-session).
      if (ctx.session) {
        const submitted = ctx.body._csrf;
        if (submitted !== ctx.session.csrf_token) {
          res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>403 — form expired, please go back and retry</h1>');
          return;
        }
      }
    }

    await match.handler(ctx);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>500 — something went wrong</h1>');
    }
  }
});

server.listen(PORT, () => {
  console.log(`GoBookr running at http://localhost:${PORT}`);
});
