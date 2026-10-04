'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('launch SEO endpoints use the canonical GoBookr domain', () => {
  assert.match(server, /Sitemap: https:\/\/gobookr\.com\/sitemap\.xml/);
  assert.match(server, /https:\/\/gobookr\.com\/openings/);
  assert.match(server, /https:\/\/gobookr\.com\/pro\//);
  assert.match(server, /https:\/\/gobookr\.com\/shop\//);
  assert.match(server, /https:\/\/gobookr\.com\/discover\//);
  assert.equal(fs.existsSync(path.join(root, 'public', 'sitemap.xml')), false, 'a static asset must not shadow the live inventory sitemap');
});

test('robots keeps private account surfaces out of search', () => {
  assert.match(server, /Disallow: \/dashboard\//);
  assert.match(server, /Disallow: \/admin/);
  assert.match(server, /Disallow: \/login/);
  assert.match(server, /Disallow: \/signup/);
});

test('dynamic sitemap includes public discovery inventory', () => {
  assert.match(server, /claim_status IN \('unclaimed','claim_pending'\)/);
  assert.match(server, /source_url/);
  assert.match(server, /source_name/);
  assert.match(server, /pro_categories/);
  assert.match(server, /LIMIT 5000/);
});
