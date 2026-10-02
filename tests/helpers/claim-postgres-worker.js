'use strict';
const { parentPort } = require('node:worker_threads');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../db/postgres-worker'), 'utf8');
const moduleShim = { exports: {} };
vm.runInNewContext(source + '\nmodule.exports = { normalizeSql, addReturningId };', { module: moduleShim, process, console, require: name => name === 'node:worker_threads' ? { parentPort: { on() {} } } : require(name) });
const { normalizeSql, addReturningId } = moduleShim.exports;
const db = new PGlite();
parentPort.on('message', async ({ op, sql, args, signalBuffer, responsePort }) => {
  const signal = new Int32Array(signalBuffer);
  try {
    let value;
    if (op === 'close') { await db.close(); value = true; }
    else if (op === 'exec') { await db.exec(normalizeSql(sql)); value = true; }
    else {
      const result = await db.query(op === 'run' ? addReturningId(normalizeSql(sql)) : normalizeSql(sql), args);
      value = op === 'get' ? result.rows[0] : op === 'all' ? result.rows : { changes: result.affectedRows, lastInsertRowid: result.rows[0]?.id };
    }
    responsePort.postMessage({ value });
  } catch (error) { responsePort.postMessage({ error: error.message }); }
  finally { Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); responsePort.close(); }
});
