'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('marketing campaign design-state migration preserves reusable style and slot foundations', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260928043000_marketing_campaign_design_state.sql'), 'utf8');
  assert.match(sql, /story_style TEXT NOT NULL DEFAULT 'classic'/);
  assert.match(sql, /CHECK \(story_style IN \('classic', 'clean', 'bold'\)\)/);
  assert.match(sql, /available_slots JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(sql, /Professional-entered availability snapshots/);
});

test('Marketing Center saves and reopens the selected Story style', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /name="style" value="\$\{escapeHtml\(storyStyle\)\}"/);
  assert.ok(source.includes("status, story_style, available_slots) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)"));
  assert.match(source, /query\.set\('style', campaign\.story_style\)/);
  assert.match(source, /item\.story_style \? '&style='/);
});
