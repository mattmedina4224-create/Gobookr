'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduleFromBody, displayDays } = require('../lib/social-schedule');

test('accepts a weekday Instagram Story schedule', () => {
  const schedule = scheduleFromBody({ day_mon:'1', day_tue:'1', day_wed:'1', day_thu:'1', day_fri:'1', post_time:'08:00', timezone:'America/Denver', enabled:'1' });
  assert.deepEqual(schedule, { days:['mon','tue','wed','thu','fri'], time:'08:00', timezone:'America/Denver', destination:'instagram_story', enabled:true });
  assert.equal(displayDays(schedule.days), 'Mon, Tue, Wed, Thu, Fri');
});

test('schedule is safe by default and rejects incomplete settings', () => {
  assert.equal(scheduleFromBody({ post_time:'08:00', timezone:'America/Denver' }).error, 'Choose at least one day to post.');
  assert.equal(scheduleFromBody({ day_mon:'1', post_time:'25:00', timezone:'America/Denver' }).error, 'Choose a valid posting time.');
  assert.equal(scheduleFromBody({ day_mon:'1', post_time:'08:00', timezone:'UTC' }).error, 'Choose a supported time zone.');
  assert.equal(scheduleFromBody({ day_mon:'1', post_time:'08:00', timezone:'America/Denver' }).enabled, false);
});
