'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('homepage gives professionals both claim and create paths', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'home.js'), 'utf8');
  assert.match(source, /Find &amp; claim my profile/);
  assert.match(source, /href="\/signup\?role=pro">Create a new profile — 30 days free<\/a>/);
  assert.match(source, /\$20\/month after your free trial\. Cancel anytime\./);
});

test('new professional signup starts trial and enters onboarding', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
  assert.match(source, /INSERT OR IGNORE INTO subscriptions[\s\S]*'trialing'[\s\S]*\+30 days/);
  assert.match(source, /role === 'pro' \? '\/dashboard\/pro\/onboarding'/);
});
