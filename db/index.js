'use strict';

// GoBookr production database adapter.
//
// The app was originally written against Node's synchronous SQLite API. Production
// now lives in Supabase Postgres. Database calls run on a dedicated worker thread
// that owns the Postgres connection and preserves the existing prepare().get/all/run
// interface while the rest of the application is migrated incrementally.

const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');

const WORKER_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 30000);
const READ_CACHE_TTL_MS = Number(process.env.DB_READ_CACHE_TTL_MS || 30000);
const READ_CACHE_MAX = Number(process.env.DB_READ_CACHE_MAX || 2000);
const SNAPSHOT_TTL_MS = 15000;
const worker = new Worker(require.resolve('./postgres-worker'));
worker.unref();
let nextMessageId = 1;
const readCache = new Map();
const snapshots = new Map();

function cacheKey(op, sql, args) { return `${op}|${sql}|${JSON.stringify(args || [])}`; }
function readCached(op, sql, args) {
  if (READ_CACHE_TTL_MS <= 0) return undefined;
  const key = cacheKey(op, sql, args); const item = readCache.get(key);
  if (!item) return undefined;
  if (Date.now() >= item.expiresAt) { readCache.delete(key); return undefined; }
  return item.value;
}
function writeCached(op, sql, args, value) {
  if (READ_CACHE_TTL_MS <= 0) return;
  if (readCache.size >= READ_CACHE_MAX) { const oldest = readCache.keys().next().value; if (oldest !== undefined) readCache.delete(oldest); }
  readCache.set(cacheKey(op, sql, args), { value, expiresAt: Date.now() + READ_CACHE_TTL_MS });
}
function clearReadCache() { readCache.clear(); snapshots.clear(); }

function callWorker(op, sql, args = []) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Add the Supabase Postgres connection string to the deployment environment.');
  const isRead = (op === 'get' || op === 'all') && /^\s*SELECT\b/i.test(String(sql || ''));
  if (isRead) { const cached = readCached(op, sql, args); if (cached !== undefined) return cached; }

  const signalBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT); const signal = new Int32Array(signalBuffer);
  const { port1, port2 } = new MessageChannel(); const id = nextMessageId++;
  worker.postMessage({ id, op, sql: String(sql || ''), args, signalBuffer, responsePort: port2 }, [port2]);
  const waitResult = Atomics.wait(signal, 0, 0, WORKER_TIMEOUT_MS);
  if (waitResult === 'timed-out') { port1.close(); throw new Error(`Database query timed out after ${WORKER_TIMEOUT_MS}ms.`); }
  const packet = receiveMessageOnPort(port1); port1.close();
  if (!packet || !packet.message || packet.message.id !== id) throw new Error('Database worker returned an invalid response.');
  const response = packet.message;
  if (response.error) { const err = new Error(response.error.message || 'Database query failed.'); if (response.error.code) err.code = response.error.code; if (response.error.detail) err.detail = response.error.detail; throw err; }
  if (isRead) writeCached(op, sql, args, response.value); else if (op === 'run' || op === 'exec') clearReadCache();
  return response.value;
}

function snapshot(table) {
  const cached = snapshots.get(table);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.rows;
  const rows = callWorker('all', `SELECT * FROM ${table}`, []);
  snapshots.set(table, { at: Date.now(), rows });
  return rows;
}

// Discovery cards used to make several Supabase round trips for every professional.
// Match those exact hot reads and serve them from one table snapshot per request window.
function hotPathRead(op, sql, args) {
  const text = String(sql || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const proId = Number(args[0]);
  if (!Number.isFinite(proId)) return { matched: false };

  if (text === 'select * from subscriptions where pro_id = ?') {
    const row = snapshot('subscriptions').find((x) => Number(x.pro_id) === proId);
    return { matched: true, value: op === 'all' ? (row ? [row] : []) : row };
  }
  if (text === 'select rating from reviews where pro_id = ?') {
    const rows = snapshot('reviews').filter((x) => Number(x.pro_id) === proId).map((x) => ({ rating: x.rating }));
    return { matched: true, value: op === 'get' ? rows[0] : rows };
  }
  if (text === 'select * from services where pro_id = ? order by price asc') {
    const rows = snapshot('services').filter((x) => Number(x.pro_id) === proId).sort((a,b) => Number(a.price || 0) - Number(b.price || 0));
    return { matched: true, value: op === 'get' ? rows[0] : rows };
  }
  if (text === 'select category from pro_categories where pro_id = ? order by category') {
    const rows = snapshot('pro_categories').filter((x) => Number(x.pro_id) === proId).sort((a,b) => String(a.category).localeCompare(String(b.category))).map((x) => ({ category: x.category }));
    return { matched: true, value: op === 'get' ? rows[0] : rows };
  }
  if (text === 'select image_url, caption from portfolio_items where pro_id = ? and image_url is not null and image_url != ? order by id desc limit 1') {
    const excluded = String(args[1] == null ? '' : args[1]);
    const row = snapshot('portfolio_items').filter((x) => Number(x.pro_id) === proId && x.image_url != null && String(x.image_url) !== excluded).sort((a,b) => Number(b.id) - Number(a.id))[0];
    const value = row ? { image_url: row.image_url, caption: row.caption } : undefined;
    return { matched: true, value: op === 'all' ? (value ? [value] : []) : value };
  }
  return { matched: false };
}

function prepare(sql) {
  return {
    get(...args) { const fast = hotPathRead('get', sql, args); return fast.matched ? fast.value : callWorker('get', sql, args); },
    all(...args) { const fast = hotPathRead('all', sql, args); return fast.matched ? fast.value : callWorker('all', sql, args); },
    run(...args) { clearReadCache(); return callWorker('run', sql, args); },
  };
}
function exec(sql) { clearReadCache(); return callWorker('exec', sql, []); }
function close() { clearReadCache(); try { callWorker('close', '', []); } catch (_) {} worker.terminate(); }

module.exports = { prepare, exec, close };
