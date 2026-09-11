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
const worker = new Worker(require.resolve('./postgres-worker'));
worker.unref();
let nextMessageId = 1;

function callWorker(op, sql, args = []) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Add the Supabase Postgres connection string to the deployment environment.');
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
  try { callWorker('close', '', []); } catch (_) {}
  worker.terminate();
}

module.exports = { prepare, exec, close };
