'use strict';
// Same protocol as claim-postgres-worker.js, but against a real Postgres (TEST_PG_URL) instead of PGlite.
// Each worker gets its own throwaway database so tests never touch other data.
const { parentPort, workerData } = require('node:worker_threads');
const { Client } = require('pg');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../db/postgres-worker'), 'utf8');
const moduleShim = { exports: {} };
vm.runInNewContext(source + '\nmodule.exports = { normalizeSql, addReturningId };', { module: moduleShim, process, console, require: (name) => name === 'node:worker_threads' ? { parentPort: { on() {} } } : require(name) });
const { normalizeSql, addReturningId } = moduleShim.exports;
const schema = 'gb_test_' + process.pid + '_' + Date.now();
const scratchUrl = (() => { const u = new URL(workerData.url); u.pathname = '/' + schema; return u.toString(); })();
const ready = (async () => {
  const admin = new Client({ connectionString: workerData.url });
  await admin.connect(); await admin.query(`CREATE DATABASE ${schema}`); await admin.end();
  const c = new Client({ connectionString: scratchUrl });
  await c.connect();
  return c;
})();
parentPort.on('message', async ({ op, sql, args, signalBuffer, responsePort }) => {
  const signal = new Int32Array(signalBuffer);
  try {
    const db = await ready;
    let value;
    if (op === 'close') { await db.end(); const admin = new Client({ connectionString: workerData.url }); await admin.connect(); await admin.query(`DROP DATABASE IF EXISTS ${schema}`); await admin.end(); value = true; }
    else if (op === 'exec') { await db.query(normalizeSql(sql)); value = true; }
    else {
      const result = await db.query(op === 'run' ? addReturningId(normalizeSql(sql)) : normalizeSql(sql), args);
      const r = Array.isArray(result) ? result[result.length - 1] : result;
      value = op === 'get' ? r.rows[0] : op === 'all' ? r.rows : { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
    }
    responsePort.postMessage({ value });
  } catch (error) { responsePort.postMessage({ error: error.message, code: error.code }); }
  finally { Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); responsePort.close(); }
});
