'use strict';

// GoBookr production database adapter.
//
// The app was originally written against Node's synchronous SQLite API. Production
// now lives in Supabase Postgres. Database calls run on a dedicated worker thread
// that owns the Postgres connection and preserves the existing prepare().get/all/run
// interface while the rest of the application is migrated incrementally.

const {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} = require('node:worker_threads');

const WORKER_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 30000);
const READ_CACHE_TTL_MS = Number(process.env.DB_READ_CACHE_TTL_MS || 30000);
const READ_CACHE_MAX = Number(process.env.DB_READ_CACHE_MAX || 2000);
const worker = new Worker(require.resolve('./postgres-worker'));
worker.unref();
let nextMessageId = 1;
const readCache = new Map();

function cacheKey(op, sql, args) {
  return `${op}|${sql}|${JSON.stringify(args || [])}`;
}

function readCached(op, sql, args) {
  if (READ_CACHE_TTL_MS <= 0) return undefined;
  const key = cacheKey(op, sql, args);
  const item = readCache.get(key);
  if (!item) return undefined;
  if (Date.now() >= item.expiresAt) {
    readCache.delete(key);
    return undefined;
  }
  return item.value;
}

function writeCached(op, sql, args, value) {
  if (READ_CACHE_TTL_MS <= 0) return;
  if (readCache.size >= READ_CACHE_MAX) {
    const oldest = readCache.keys().next().value;
    if (oldest !== undefined) readCache.delete(oldest);
  }
  readCache.set(cacheKey(op, sql, args), {
    value,
    expiresAt: Date.now() + READ_CACHE_TTL_MS,
  });
}

function clearReadCache() {
  readCache.clear();
}

function callWorker(op, sql, args = []) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Add the Supabase Postgres connection string to the deployment environment.');
  }

  const isRead = (op === 'get' || op === 'all') && /^\s*SELECT\b/i.test(String(sql || ''));
  if (isRead) {
    const cached = readCached(op, sql, args);
    if (cached !== undefined) return cached;
  }

  const signalBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const signal = new Int32Array(signalBuffer);
  const { port1, port2 } = new MessageChannel();
  const id = nextMessageId++;

  worker.postMessage(
    { id, op, sql: String(sql || ''), args, signalBuffer, responsePort: port2 },
    [port2]
  );

  const waitResult = Atomics.wait(signal, 0, 0, WORKER_TIMEOUT_MS);
  if (waitResult === 'timed-out') {
    port1.close();
    throw new Error(`Database query timed out after ${WORKER_TIMEOUT_MS}ms.`);
  }

  const packet = receiveMessageOnPort(port1);
  port1.close();
  if (!packet || !packet.message || packet.message.id !== id) {
    throw new Error('Database worker returned an invalid response.');
  }

  const response = packet.message;
  if (response.error) {
    const err = new Error(response.error.message || 'Database query failed.');
    if (response.error.code) err.code = response.error.code;
    if (response.error.detail) err.detail = response.error.detail;
    throw err;
  }

  if (isRead) writeCached(op, sql, args, response.value);
  else if (op === 'run' || op === 'exec') clearReadCache();

  return response.value;
}

function prepare(sql) {
  return {
    get(...args) {
      return callWorker('get', sql, args);
    },
    all(...args) {
      return callWorker('all', sql, args);
    },
    run(...args) {
      return callWorker('run', sql, args);
    },
  };
}

function exec(sql) {
  return callWorker('exec', sql, []);
}

function close() {
  clearReadCache();
  try { callWorker('close', '', []); } catch (_) {}
  worker.terminate();
}

module.exports = { prepare, exec, close };
