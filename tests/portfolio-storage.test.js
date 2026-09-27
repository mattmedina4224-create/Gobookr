'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function loadStorage() {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'https://example.supabase.co/';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '  sb_secret_test_key  ';
  delete require.cache[require.resolve('../routes/pro')];
  return require('../routes/pro')._portfolioStorage;
}

test('portfolio storage config sanitizes production environment values', () => {
  const { storageConfig } = loadStorage();
  assert.deepEqual(storageConfig(), {
    baseUrl: 'https://example.supabase.co',
    serviceKey: 'sb_secret_test_key',
    bucket: 'portfolio',
  });
});

test('new Supabase secret keys upload with apikey and no legacy bearer header', async (t) => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };
  t.after(() => { global.fetch = originalFetch; });

  const { uploadPortfolioObject } = loadStorage();
  const url = await uploadPortfolioObject(42, 'my photo.jpg', { contentType: 'image/jpeg', data: Buffer.from([0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0]) });
  assert.equal(request.url, 'https://example.supabase.co/storage/v1/object/portfolio/42/my%20photo.jpg');
  assert.equal(request.options.headers.apikey, 'sb_secret_test_key');
  assert.equal(request.options.headers.authorization, undefined);
  assert.equal(request.options.headers['x-upsert'], 'false');
  assert.equal(url, 'https://example.supabase.co/storage/v1/object/public/portfolio/42/my%20photo.jpg');
});

test('legacy service role keys retain bearer authorization for upload and delete', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-key';
  delete require.cache[require.resolve('../routes/pro')];
  const storage = require('../routes/pro')._portfolioStorage;
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200 }; };
  t.after(() => { global.fetch = originalFetch; });

  const publicUrl = await storage.uploadPortfolioObject(7, 'photo.png', { contentType: 'image/png', data: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]) });
  await storage.deletePortfolioObject(publicUrl);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.options.headers.apikey, 'legacy-key');
    assert.equal(request.options.headers.authorization, 'Bearer legacy-key');
  }
  assert.equal(requests[1].options.method, 'DELETE');
});

test('portfolio upload surfaces Storage failures without leaking beyond bounded detail', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403, text: async () => 'denied' });
  t.after(() => { global.fetch = originalFetch; });
  const { uploadPortfolioObject } = loadStorage();
  await assert.rejects(
    uploadPortfolioObject(42, 'photo.jpg', { contentType: 'image/jpeg', data: Buffer.alloc(12) }),
    /Supabase Storage upload failed: 403 denied/
  );
});
