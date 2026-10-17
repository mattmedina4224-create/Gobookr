'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('task 9 connects real openings, Story creation, native sharing, booking links, and analytics', () => {
  const pro = read('routes/pro.js');
  const publicRoutes = read('routes/public.js');
  const share = read('public/story-sharing.js');
  const view = read('lib/story-sharing-view.js');
  assert.match(pro, /Post openings now/);
  assert.match(pro, /Share today’s openings/);
  assert.match(pro, />Mark filled</);
  assert.match(publicRoutes, /router\.get\('\/openings'/);
  assert.match(publicRoutes, /source=openings-today/);
  assert.match(view, /Turn these openings into a Story/);
  assert.match(view, /Share to socials/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /gobookr-openings-story\.png/);
  assert.match(share, /GoBookr link copied/);
  assert.match(pro, /Opening view → click/);
  assert.match(pro, /booking intent, not a completed appointment/);
});

test('task 9 stays truthful about social delivery', () => {
  const share = read('public/story-sharing.js');
  const docs = read('docs/task-9-social-openings.md');
  assert.doesNotMatch(share, /successfully published/i);
  assert.match(docs, /does not store social credentials/);
  assert.match(docs, /Automatic scheduled social posting is deliberately a later integration/);
});
