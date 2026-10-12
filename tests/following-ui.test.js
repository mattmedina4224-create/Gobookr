'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(require.resolve('../' + file), 'utf8');

test('following is discoverable from customer navigation and dashboard', () => {
  assert.match(read('lib/layout.js'), /href="\/following">Following/);
  assert.match(read('routes/customer.js'), /Open your Following feed/);
  assert.match(read('routes/pro.js'), /href: '\/dashboard\/pro\/updates'/);
});
test('profile follow controls remain accessible on mobile and public updates are escaped', () => {
  assert.match(read('routes/public.js'), /class="profile-follow-mobile">\$\{followHtml\}/);
  assert.match(read('public/following.css'), /max-width:640px/);
  assert.match(read('lib/following.js'), /aria-pressed="\$\{following\}"/);
  assert.match(read('lib/following.js'), /e\(update.message\)/);
  assert.match(read('routes/following.js'), /This does not post to Facebook, Instagram, or Snapchat/);
});
test('feed queries are bounded, cursor-based, and avoid cached personalized reads', () => {
  const source = read('lib/following.js');
  assert.match(source, /LIMIT 21/);
  assert.match(source, /AND u.id < \?/);
  assert.match(source, /WITH follows AS/);
  assert.match(source, /ON pi.id = u.portfolio_item_id AND pi.pro_id = u.pro_id/);
});
