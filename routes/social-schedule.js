'use strict';
const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml: e } = require('../lib/util');
const { dashboardNav } = require('../lib/pro-dashboard-view');
const { DAYS, ZONES, scheduleFromBody, displayDays } = require('../lib/social-schedule');
const PATH = '/dashboard/pro/social/schedule';

function owner(ctx) {
  if (!ctx.currentUser) { redirect(ctx.res, '/login?next=' + encodeURIComponent(PATH)); return null; }
  if (ctx.currentUser.role !== 'pro') { send(ctx.res, 'Professional account required.', 403); return null; }
  const profile = db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) { send(ctx.res, 'Professional profile not found.', 404); return null; }
  return profile;
}
function back(ctx, message, success = false) {
  redirect(ctx.res, PATH + '?' + (success ? 'success' : 'error') + '=' + encodeURIComponent(message));
}
function checked(value) { return value ? ' checked' : ''; }

module.exports = function (router) {
  router.get(PATH, async (ctx) => {
    const profile = owner(ctx); if (!profile) return;
    const schedule = db.prepare("SELECT weekdays, local_time, timezone, enabled FROM social_post_schedules WHERE pro_id = ? AND destination = 'instagram_story'").get(profile.id);
    const connection = db.prepare('SELECT instagram_id, expires_at FROM meta_connections WHERE pro_id = ? AND user_id = ?').get(profile.id, ctx.currentUser.id);
    const connected = Boolean(connection && connection.instagram_id && new Date(connection.expires_at).getTime() > Date.now());
    const days = schedule?.weekdays || ['mon','tue','wed','thu','fri'];
    const time = String(schedule?.local_time || '08:00').slice(0,5);
    const timezone = schedule?.timezone || 'America/Denver';
    const nav = dashboardNav('social', [
      { key:'overview', label:'Overview', href:'/dashboard/pro' },
      { key:'marketing', label:'Marketing Center', href:'/dashboard/pro/marketing' },
      { key:'social', label:'Social connections', href:'/dashboard/pro/social' },
    ]);
    const csrf = `<input type="hidden" name="_csrf" value="${e(ctx.session.csrf_token)}">`;
    const dayBoxes = DAYS.map(([key,label]) => `<label class="social-schedule-day"><input type="checkbox" name="day_${key}" value="1"${checked(days.includes(key))}> ${e(label.slice(0,3))}</label>`).join('');
    const zones = ZONES.map(zone => `<option value="${e(zone)}"${zone===timezone?' selected':''}>${e(zone.replace('America/','').replace('_',' '))}</option>`).join('');
    const status = schedule ? `<p><strong>${schedule.enabled ? 'Scheduled' : 'Saved, not active'}</strong> · ${e(displayDays(schedule.weekdays))} at ${e(time)} · ${e(timezone)}</p>` : '<p><strong>Not scheduled yet.</strong> Start with weekdays at 8:00 AM, or choose your own schedule.</p>';
    const body = `<section class="section container pro-dashboard"><div class="dash-layout">${nav}<main class="pro-main"><p><a href="/dashboard/pro/marketing">← Marketing Center</a></p><h1>Automatic Instagram Stories</h1><p>Choose when GoBookr should post your openings Story. Your schedule is saved here; publishing only runs after your Instagram Business account is connected and GoBookr enables the approved publishing worker.</p>
      <div class="panel"><h2>Your schedule</h2>${status}<form method="POST" action="${PATH}">${csrf}<fieldset><legend>Days</legend><div class="social-schedule-days">${dayBoxes}</div></fieldset><div class="grid two"><div class="field"><label for="post-time">Post time</label><input id="post-time" name="post_time" type="time" value="${e(time)}" required></div><div class="field"><label for="timezone">Time zone</label><select id="timezone" name="timezone" required>${zones}</select></div></div><label class="social-schedule-toggle"><input type="checkbox" name="enabled" value="1"${checked(Boolean(schedule?.enabled))}${connected?'':' disabled'}> Turn on automatic posting</label>${connected?'':'<p class="muted">Connect an eligible Instagram Business account before automatic posting can be turned on.</p>'}<button class="btn" type="submit">Save schedule</button></form></div>
      <div class="panel"><h2>Instagram connection</h2><p>${connected?'Instagram Business account connected. GoBookr will still verify publishing eligibility before every automatic post.':'Instagram is not connected yet.'}</p><a class="btn secondary" href="/dashboard/pro/social">${connected?'Manage connection':'Connect Instagram'}</a></div>
      <div class="panel"><h2>What GoBookr will post</h2><p>The same clean 1080 × 1920 Openings Today Story you can already prepare in Marketing Center, using your current opening times and GoBookr booking link.</p><p class="muted">Automatic Story publishing is being rolled out safely. Saving this schedule does not publish anything by itself.</p></div>
    </main></div></section>`;
    send(ctx.res, layout({ title:'Automatic Instagram Stories', currentUser:ctx.currentUser, session:ctx.session, flash:flashFromQuery(ctx.query), robots:'noindex, nofollow', body }));
  });

  router.post(PATH, async (ctx) => {
    const profile = owner(ctx); if (!profile) return;
    const parsed = scheduleFromBody(ctx.body);
    if (parsed.error) return back(ctx, parsed.error);
    const connection = db.prepare('SELECT instagram_id, expires_at FROM meta_connections WHERE pro_id = ? AND user_id = ?').get(profile.id, ctx.currentUser.id);
    const connected = Boolean(connection && connection.instagram_id && new Date(connection.expires_at).getTime() > Date.now());
    if (parsed.enabled && !connected) return back(ctx, 'Connect an eligible Instagram Business account before turning on automatic posting.');
    db.prepare(`INSERT INTO social_post_schedules(pro_id,user_id,destination,weekdays,local_time,timezone,enabled)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(pro_id,destination) DO UPDATE SET user_id=EXCLUDED.user_id,weekdays=EXCLUDED.weekdays,local_time=EXCLUDED.local_time,timezone=EXCLUDED.timezone,enabled=EXCLUDED.enabled,updated_at=CURRENT_TIMESTAMP`)
      .run(profile.id, ctx.currentUser.id, parsed.destination, parsed.days, parsed.time, parsed.timezone, parsed.enabled);
    back(ctx, parsed.enabled ? 'Instagram Story schedule saved and enabled.' : 'Instagram Story schedule saved.', true);
  });
};
