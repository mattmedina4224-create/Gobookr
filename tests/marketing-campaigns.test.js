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


test('Marketing Center summarizes live and scheduled work before the editor', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /const scheduledCount = Number\(campaignCounts\.scheduled_count/);
  assert.match(source, /const liveOpeningCount = Number\(campaignCounts\.live_opening_count/);
  assert.match(source, /marketingStatusStrip/);
  assert.match(source, /live opening post/);
  assert.match(source, />See results</);
});


test('scheduled campaign save gives a distinct confirmation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /isScheduled \? 'Campaign scheduled\.'/);
  assert.match(source, /nextQuery\.set\('queue', 'scheduled'\)/);
});


test('scheduled summary links pros directly to the campaign queue', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /href="#campaign-queue">View queue/);
  assert.match(source, /id="campaign-queue"/);
});


test('campaign scheduler prevents past picks and explains queue behavior', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /scheduledField\.min=/);
  assert.match(source, /does not auto-post to Instagram/);
  assert.match(source, /aria-describedby="scheduled-for-help"/);
});


test('marketing share actions provide accessible inline feedback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /id="marketing-share-status"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /setShareStatus\('Story image saved\.'\)/);
  assert.match(source, /setShareStatus\('Tracked link copied\.'\)/);
});


test('marketing sharing falls back when Clipboard API is unavailable', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /const copyText=async\(text\)=>/);
  assert.match(source, /document\.execCommand\('copy'\)/);
  assert.match(source, /copyText\(url\)/);
  assert.match(source, /Post copy and link copied\./);
});


test('Marketing Center status counts are not limited to the eight-item queue', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'pro.js'), 'utf8');
  assert.match(source, /COUNT\(\*\) FILTER \(WHERE status = 'scheduled'\) AS scheduled_count/);
  assert.match(source, /AS live_opening_count/);
  assert.match(source, /const scheduledCount = Number\(campaignCounts\.scheduled_count/);
  assert.match(source, /const liveOpeningCount = Number\(campaignCounts\.live_opening_count/);
});


test('scheduled campaign confirmation focuses the queue', () => {
 const source=fs.readFileSync(path.join(__dirname,'..','routes','pro.js'),'utf8');
 assert.match(source,/focusScheduledQueue = ctx\.query\.queue === 'scheduled'/);
 assert.match(source,/Campaign scheduled\. It is at the top of your queue\./);
 assert.match(source,/scrollIntoView/);
 assert.match(source,/panel\.focus/);
});


test('campaign queue uses customer-friendly status labels', () => {
 const source=fs.readFileSync(path.join(__dirname,'..','routes','pro.js'),'utf8');
 assert.match(source,/campaignStatusLabel/);
 assert.match(source,/published: 'Live'/);
 assert.match(source,/closed: 'Filled'/);
 assert.match(source,/escapeHtml\(campaignStatusLabel\(item\.status\)\)/);
});


test('empty campaign queue gives pros a clear next action', () => {
 const source=fs.readFileSync(path.join(__dirname,'..','routes','pro.js'),'utf8');
 assert.match(source,/Nothing queued yet\./);
 assert.match(source,/Post today’s openings/);
 assert.match(source,/campaign=openings-today/);
});
