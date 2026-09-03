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

function boundaryFromHeader(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  return match ? (match[1] || match[2] || '').trim() : '';
}

function boundaryFromBody(rawBuffer) {
  const lineEnd = rawBuffer.indexOf(Buffer.from('\r\n'));
  if (lineEnd < 2) return '';
  const firstLine = rawBuffer.subarray(0, lineEnd).toString('latin1');
  return firstLine.startsWith('--') ? firstLine.slice(2) : '';
}

function parseMultipart(rawBuffer, contentType) {
  const fields = {};
  const files = {};
  const boundary = boundaryFromHeader(contentType) || boundaryFromBody(rawBuffer);
  if (!boundary) throw new Error('Multipart upload is missing a boundary.');

  const delimiter = Buffer.from(`--${boundary}`, 'latin1');
  const headerSeparator = Buffer.from('\r\n\r\n', 'latin1');
  let cursor = 0;

  while (true) {
    const boundaryStart = rawBuffer.indexOf(delimiter, cursor);
    if (boundaryStart === -1) break;

    let partStart = boundaryStart + delimiter.length;
    if (rawBuffer.subarray(partStart, partStart + 2).toString('latin1') === '--') break;
    if (rawBuffer.subarray(partStart, partStart + 2).toString('latin1') === '\r\n') partStart += 2;

    const nextBoundary = rawBuffer.indexOf(delimiter, partStart);
    if (nextBoundary === -1) break;

    let partEnd = nextBoundary;
    if (rawBuffer.subarray(partEnd - 2, partEnd).toString('latin1') === '\r\n') partEnd -= 2;
    const part = rawBuffer.subarray(partStart, partEnd);
    const headerEnd = part.indexOf(headerSeparator);
    if (headerEnd === -1) {
      cursor = nextBoundary;
      continue;
    }

    const headers = part.subarray(0, headerEnd).toString('latin1');
    const body = part.subarray(headerEnd + headerSeparator.length);
    const disposition = /content-disposition:\s*form-data;[^\r\n]*/i.exec(headers);
    if (!disposition) {
      cursor = nextBoundary;
      continue;
    }

    const nameMatch = /name="([^"]+)"/i.exec(disposition[0]);
    if (!nameMatch) {
      cursor = nextBoundary;
      continue;
    }

    const name = nameMatch[1];
    const filenameMatch = /filename="([^"]*)"/i.exec(disposition[0]);
    if (filenameMatch && filenameMatch[1]) {
      const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
      files[name] = {
        filename: filenameMatch[1],
        contentType: typeMatch ? typeMatch[1].trim().toLowerCase() : 'application/octet-stream',
        data: Buffer.from(body),
      };
    } else {
      fields[name] = body.toString('utf8');
    }

    cursor = nextBoundary;
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
      const isMultipart = contentType.toLowerCase().startsWith('multipart/form-data');

      if (isMultipart) {
        const parsed = parseMultipart(raw, contentType);
        ctx.body = parsed.fields;
        ctx.files = parsed.files;
      } else {
        ctx.body = parseForm(raw);
      }

      if (ctx.session) {
        const submitted = typeof ctx.body._csrf === 'string' ? ctx.body._csrf.trim() : '';
        const expected = typeof ctx.session.csrf_token === 'string' ? ctx.session.csrf_token.trim() : '';
        if (!submitted || submitted !== expected) {
          console.error('CSRF mismatch', {
            path: pathname,
            multipart: isMultipart,
            submittedLength: submitted.length,
            expectedLength: expected.length,
            bodyFields: Object.keys(ctx.body || {}),
          });
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
