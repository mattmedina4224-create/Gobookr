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
require('./routes/admin')(router);
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
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
  const ext = path.extname(filePath).toLowerCase();
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
      if (size > 12 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseForm(rawBuffer) {
  const params = new URLSearchParams(rawBuffer.toString('utf8'));
  const out = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function parseMultipart(rawBuffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) return { fields: {}, files: {} };

  const boundary = (match[1] || match[2] || '').trim();
  const raw = rawBuffer.toString('latin1');
  const parts = raw.split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;

    const cleaned = part.startsWith('\r\n') ? part.slice(2) : part;
    const headerEnd = cleaned.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = cleaned.slice(0, headerEnd);
    let body = cleaned.slice(headerEnd + 4);

    // Each multipart section ends with CRLF before the next boundary.
    // Strip only multipart framing, not characters that are part of the field/file.
    if (body.endsWith('\r\n')) body = body.slice(0, -2);

    const dispositionLine = headers
      .split('\r\n')
      .find((line) => /^content-disposition:/i.test(line));
    if (!dispositionLine) continue;

    const nameMatch = /(?:^|;)\s*name="([^"]+)"/i.exec(dispositionLine);
    if (!nameMatch) continue;

    const filenameMatch = /(?:^|;)\s*filename="([^"]*)"/i.exec(dispositionLine);
    const name = nameMatch[1];
    const filename = filenameMatch ? filenameMatch[1] : undefined;

    if (filename !== undefined && filename !== '') {
      const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
      files[name] = {
        filename,
        contentType: typeMatch ? typeMatch[1].trim().toLowerCase() : 'application/octet-stream',
        data: Buffer.from(body, 'latin1'),
      };
    } else {
      fields[name] = Buffer.from(body, 'latin1').toString('utf8');
    }
  }

  return { fields, files };
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
      files: {},
    };

    if (req.method === 'POST') {
      const raw = await readBody(req);
      const contentType = req.headers['content-type'] || '';
      if (contentType.startsWith('multipart/form-data')) {
        const parsed = parseMultipart(raw, contentType);
        ctx.body = parsed.fields;
        ctx.files = parsed.files;
      } else {
        ctx.body = parseForm(raw);
      }

      // Lightweight CSRF check for logged-in POSTs (login/signup happen pre-session).
      if (ctx.session) {
        const submitted = typeof ctx.body._csrf === 'string' ? ctx.body._csrf.trim() : '';
        const expected = typeof ctx.session.csrf_token === 'string' ? ctx.session.csrf_token.trim() : '';
        if (!submitted || submitted !== expected) {
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
