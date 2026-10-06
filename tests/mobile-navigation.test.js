'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { layout } = require('../lib/layout');
test('mobile menu starts collapsed and preserves navigation for guests and members', () => {
  for (const currentUser of [null, { id: 2, name: 'Preview Owner', role: 'customer' }, { id: 3, name: 'Preview Pro', role: 'pro' }]) {
    const html = layout({title:'Navigation test',currentUser,session:{csrf_token:'fixture'},body:''});
    assert.match(html, /<details class="mobile-navigation">/);
    assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
    assert.match(html, /<summary aria-label="Main menu">/);
    assert.match(html, /<nav class="desktop-navigation" aria-label="Main navigation">/);
    assert.match(html, /aria-label="Mobile navigation"/);
    assert.doesNotMatch(html, /href="\/openings"/);
    if (currentUser) { assert.match(html, /action="\/logout"/); assert.match(html, /name="_csrf" value="fixture"/); }
    else assert.match(html, /href="\/login"/);
  }
});
