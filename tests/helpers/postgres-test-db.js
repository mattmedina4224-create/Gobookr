'use strict';
const path=require('node:path');
const {Worker,MessageChannel,receiveMessageOnPort}=require('node:worker_threads');
function database() {
  const worker = new Worker(path.join(__dirname, 'claim-postgres-worker.js'));
  function call(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4);
    const { port1, port2 } = new MessageChannel();
    worker.postMessage({ op, sql, args, signalBuffer, responsePort: port2 }, [port2]);
    if (Atomics.wait(new Int32Array(signalBuffer), 0, 0, 30000) === 'timed-out') throw Error('Postgres test timed out');
    const result = receiveMessageOnPort(port1).message; port1.close();
    if (result.error) throw Error(result.error);
    return result.value;
  }
  return { exec: sql => call('exec', sql), prepare: sql => ({ get: (...args) => call('get', sql, args), all: (...args) => call('all', sql, args), run: (...args) => call('run', sql, args) }), close: async () => { call('close', ''); await worker.terminate(); } };
}
module.exports = { database };
