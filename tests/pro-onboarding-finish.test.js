'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('finishing professional setup is server guarded and hands off to the live profile', () => {
  const onboarding = fs.readFileSync(path.join(__dirname, '..', 'routes', 'onboarding.js'), 'utf8');
  const pro = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');

  assert.match(onboarding, /if \(!onboardingState\(profile\)\.requiredDone\)/);
  assert.match(onboarding, /SET onboarding_completed = 1/);
  assert.match(onboarding, /setup=complete/);
  assert.match(pro, /ctx\.query\.setup === 'complete'/);
  assert.match(pro, /Your GoBookr profile is ready for customers/);
  assert.match(pro, /View my public profile/);
  assert.match(pro, /Open Marketing Center/);
});
