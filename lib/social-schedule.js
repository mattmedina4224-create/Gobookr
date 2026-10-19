'use strict';

const DAYS = [
  ['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'],
  ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'],
];
const ZONES = ['America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York'];

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : null;
}
function normalizeDays(body = {}) {
  return DAYS.filter(([key]) => body['day_' + key] === '1').map(([key]) => key);
}
function normalizeZone(value) {
  const zone = String(value || '').trim();
  return ZONES.includes(zone) ? zone : null;
}
function scheduleFromBody(body = {}) {
  const days = normalizeDays(body), time = normalizeTime(body.post_time), timezone = normalizeZone(body.timezone);
  if (!days.length) return { error: 'Choose at least one day to post.' };
  if (!time) return { error: 'Choose a valid posting time.' };
  if (!timezone) return { error: 'Choose a supported time zone.' };
  return { days, time, timezone, destination: 'instagram_story', enabled: body.enabled === '1' };
}
function displayDays(days = []) {
  if (days.length === 7) return 'Every day';
  return DAYS.filter(([key]) => days.includes(key)).map(([, label]) => label.slice(0, 3)).join(', ');
}
module.exports = { DAYS, ZONES, normalizeTime, normalizeDays, normalizeZone, scheduleFromBody, displayDays };
