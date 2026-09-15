'use strict';

const { parentPort } = require('node:worker_threads');
const { Client } = require('pg');

let clientPromise = null;
const READ_CACHE_TTL_MS = 15000;
const READ_CACHE_MAX = 500;
const readCache = new Map();

function shouldUseSsl(connectionString) {
  try {
    const url = new URL(connectionString);
    return !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch (_) {
    return true;
  }
}

async function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required.');
    const client = new Client({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
      application_name: 'gobookr-web',
    });
    client.on('error', (err) => {
      console.error('GoBookr Postgres connection error', err);
      clientPromise = null;
      readCache.clear();
    });
    await client.connect();
    return client;
  })();
  return clientPromise;
}

function replaceDateTimeFunctions(sql) {
  return sql
    .replace(
      /datetime\(\s*'now'\s*,\s*'([+-]\d+)\s+(seconds?|minutes?|hours?|days?|months?|years?)'\s*\)/gi,
      (_, amount, unit) => `(CURRENT_TIMESTAMP + INTERVAL '${amount} ${unit}')`
    )
    .replace(/datetime\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
}

function replaceQuestionPlaceholders(sql) {
  let output = '';
  let index = 1;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "'" && !inDouble) {
      output += char;
      if (inSingle && next === "'") {
        output += next;
        i += 1;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }

    if (char === '"' && !inSingle) {
      output += char;
      if (inDouble && next === '"') {
        output += next;
        i += 1;
      } else {
        inDouble = !inDouble;
      }
      continue;
    }

    if (char === '?' && !inSingle && !inDouble) output += `$${index++}`;
    else output += char;
  }

  return output;
}

function normalizeSql(input) {
  let sql = String(input || '').trim();
  if (!sql) return '';

  if (/^BEGIN\s+IMMEDIATE\b/i.test(sql)) sql = sql.replace(/^BEGIN\s+IMMEDIATE\b/i, 'BEGIN');

  const insertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  if (insertOrIgnore) sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO');

  sql = replaceDateTimeFunctions(sql);
  sql = replaceQuestionPlaceholders(sql);
  sql = sql.replace(/\bLIKE\b/gi, 'ILIKE');

  if (insertOrIgnore && !/\bON\s+CONFLICT\b/i.test(sql)) {
    const hadSemicolon = /;\s*$/.test(sql);
    sql = sql.replace(/;\s*$/, '');
    sql += ' ON CONFLICT DO NOTHING';
    if (hadSemicolon) sql += ';';
  }

  return sql;
}

function addReturningId(sql) {
  if (!/^\s*INSERT\s+INTO\s+(users|pro_profiles|services|portfolio_items|reviews|booking_requests|subscriptions|password_reset_tokens)\b/i.test(sql)) return sql;
  if (/\bRETURNING\b/i.test(sql)) return sql;
  const hadSemicolon = /;\s*$/.test(sql);
  let text = sql.replace(/;\s*$/, '');
  text += ' RETURNING id';
  if (hadSemicolon) text += ';';
  return text;
}

function serializeError(err) {
  return {
    message: err && err.message ? String(err.message) : 'Database query failed.',
    code: err && err.code ? String(err.code) : '',
    detail: err && err.detail ? String(err.detail) : '',
  };
}

function isCacheableRead(op, sql) {
  return (op === 'get' || op === 'all') && /^\s*SELECT\b/i.test(sql);
}

function cacheKey(op, sql, args) {
  return op + '\n' + sql + '\n' + JSON.stringify(Array.isArray(args) ? args : []);
}

function getCachedRead(key) {
  const cached = readCache.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.at > READ_CACHE_TTL_MS) {
    readCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function setCachedRead(key, value) {
  if (readCache.size >= READ_CACHE_MAX) {
    const oldestKey = readCache.keys().next().value;
    if (oldestKey !== undefined) readCache.delete(oldestKey);
  }
  readCache.set(key, { at: Date.now(), value });
}

async function execute(op, rawSql, args) {
  if (op === 'close') {
    if (clientPromise) {
      const client = await clientPromise;
      await client.end();
      clientPromise = null;
    }
    readCache.clear();
    return true;
  }

  const client = await getClient();
  let sql = normalizeSql(rawSql);
  if (op === 'run') sql = addReturningId(sql);

  const cacheable = isCacheableRead(op, sql);
  const key = cacheable ? cacheKey(op, sql, args) : '';
  if (cacheable) {
    const cached = getCachedRead(key);
    if (cached !== undefined) return cached;
  } else if (op === 'run') {
    readCache.clear();
  }

  const result = await client.query(sql, Array.isArray(args) ? args : []);
  const finalResult = Array.isArray(result) ? result[result.length - 1] : result;

  let value;
  if (op === 'get') value = (finalResult.rows && finalResult.rows[0]) || undefined;
  else if (op === 'all') value = finalResult.rows || [];
  else if (op === 'run') {
    const first = finalResult.rows && finalResult.rows[0];
    value = {
      changes: Number(finalResult.rowCount || 0),
      lastInsertRowid: first && first.id != null ? first.id : undefined,
    };
  } else value = true;

  if (cacheable) setCachedRead(key, value);
  return value;
}

parentPort.on('message', async (message) => {
  const { id, op, sql, args, signalBuffer, responsePort } = message;
  const signal = new Int32Array(signalBuffer);
  try {
    const value = await execute(op, sql, args);
    responsePort.postMessage({ id, value });
  } catch (err) {
    responsePort.postMessage({ id, error: serializeError(err) });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
    responsePort.close();
  }
});
