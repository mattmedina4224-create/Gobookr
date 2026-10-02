'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('owned profiles require completed onboarding before public discovery', () => {
  const subscription = fs.readFileSync(path.join(__dirname, '..', 'lib', 'subscription.js'), 'utf8');
  const listings = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pro-listing-data.js'), 'utf8');
  assert.match(subscription, /onboarding_completed/);
  assert.match(subscription, /if \(!profile\.onboarding_completed\) return false/);
  assert.match(subscription, /importedListing/);
  assert.match(listings, /if \(!pro\.onboarding_completed\) return null/);
  assert.match(listings, /if \(!subscription \|\| !isPubliclyVisibleSubscription\(subscription\)\) return null/);
  assert.match(listings, /importedListing/);
});

test('imported listings require core identity and provenance before discovery', () => {
  const listings = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pro-listing-data.js'), 'utf8');
  assert.match(listings, /if \(importedListing\)/);
  assert.match(listings, /!pro\.business_name \|\| !pro\.city \|\| !pro\.state \|\| !pro\.source_url \|\| !pro\.source_name/);
});


test('sitemap only advertises structurally ready imported profiles', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /p\.claim_status IN \('unclaimed','claim_pending'\)/);
  assert.match(server, /COALESCE\(p\.business_name,''\) <> ''/);
  assert.match(server, /COALESCE\(p\.source_url,''\) <> ''/);
  assert.match(server, /COALESCE\(p\.source_name,''\) <> ''/);
});
