'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

function requirePro(ctx) {
  if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
    redirect(ctx.res, '/login?next=' + encodeURIComponent('/dashboard/pro/onboarding'));
    return null;
  }
  const profile = db.prepare('SELECT * FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if (!profile) {
    send(ctx.res, '<h1>Professional profile missing</h1>', 500);
    return null;
  }
  return profile;
}

function normalizeUrl(value, allowedHosts = []) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  const candidate = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname || !hostname.includes('.')) return null;
    if (allowedHosts.length && !allowedHosts.some((host) => hostname === host || hostname.endsWith('.' + host))) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function onboardingState(profile) {
  const serviceCount = db.prepare('SELECT COUNT(*) AS count FROM services WHERE pro_id = ?').get(profile.id).count;
  const photoCount = db.prepare('SELECT COUNT(*) AS count FROM portfolio_items WHERE pro_id = ?').get(profile.id).count;
  const basicsDone = Boolean(profile.business_name && profile.city && profile.state && profile.workplace_name && profile.street_address && profile.zip_code);
  const detailsDone = Boolean(profile.bio && profile.years_experience > 0 && (profile.price_min > 0 || profile.price_max > 0));
  const servicesDone = serviceCount > 0;
  const photosDone = photoCount > 0;
  const licenseDone = Boolean(profile.license_number && profile.license_state);
  const gpsDone = Number.isFinite(Number(profile.latitude)) && Number.isFinite(Number(profile.longitude));
  const bookingDone = Boolean(profile.booking_url);
  const socialDone = Boolean(profile.instagram_url || profile.tiktok_url || profile.facebook_url || profile.website_url);
  const requiredDone = basicsDone && detailsDone && servicesDone && photosDone && bookingDone;
  const doneCount = [basicsDone, detailsDone, servicesDone, photosDone, licenseDone, gpsDone, bookingDone, socialDone].filter(Boolean).length;
  return { basicsDone, detailsDone, servicesDone, photosDone, licenseDone, gpsDone, bookingDone, socialDone, requiredDone, progress: Math.round((doneCount / 8) * 100) };
}

function stepRow(done, title, detail, href, action) {
  return `
    <div style="display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-bottom:1px solid var(--paper-line);">
      <div style="min-width:48px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:12px;font-weight:800;background:${done ? 'var(--ok-soft)' : 'var(--paper-soft)'};color:${done ? 'var(--ok)' : 'var(--ink-faint)'};border:1px solid ${done ? 'var(--ok)' : 'var(--paper-line)'};">${done ? 'Done' : 'Open'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;">${escapeHtml(title)}</div>
        <div class="muted" style="margin-top:2px;">${escapeHtml(detail)}</div>
      </div>
      ${href ? `<a class="btn secondary small" href="${href}">${escapeHtml(action || (done ? 'Edit' : 'Add'))}</a>` : ''}
    </div>`;
}

module.exports = function (router) {
  router.get('/dashboard/pro/onboarding', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const state = onboardingState(profile);
    const { basicsDone, detailsDone, servicesDone, photosDone, licenseDone, gpsDone, bookingDone, socialDone, requiredDone, progress } = state;
    const finishHelp = requiredDone
      ? '<p class="helptext" style="margin:8px 0 0;text-align:right;">Your core profile is ready. Optional license, GPS, and social details can still be added later.</p>'
      : '<p class="helptext" style="margin:8px 0 0;text-align:right;">Finish the required profile, pricing, services, portfolio, and booking-link steps first.</p>';

    const body = `
      <section class="section container" style="max-width:920px;">
        <div style="margin-bottom:24px;">
          <span class="badge category">Professional setup</span>
          <h1 style="margin-top:10px;">Build your GoBookr profile</h1>
          <p>Complete the steps below so customers can quickly understand who you are, what you offer, where to find you, and how to book with you.</p>
          <div style="display:flex;align-items:center;gap:12px;margin-top:16px;">
            <div style="height:10px;background:var(--paper-line);border-radius:999px;overflow:hidden;flex:1;">
              <div style="height:100%;width:${progress}%;background:var(--brand);border-radius:999px;"></div>
            </div>
            <strong>${progress}%</strong>
          </div>
        </div>

        <div class="panel">
          <h3>Profile checklist</h3>
          ${stepRow(basicsDone, 'Business basics', 'Business name, workplace address, city and state.', '/dashboard/pro/profile', basicsDone ? 'Edit' : 'Complete')}
          ${stepRow(detailsDone, 'About & pricing', 'Add your bio, experience and typical pricing.', '/dashboard/pro/profile', detailsDone ? 'Edit' : 'Add details')}
          ${stepRow(servicesDone, 'Services', 'List at least one service customers can book.', '/dashboard/pro/profile', servicesDone ? 'Edit' : 'Add service')}
          ${stepRow(photosDone, 'Portfolio', 'Show customers examples of your work.', '/dashboard/pro/portfolio', photosDone ? 'Manage' : 'Add photos')}
          ${stepRow(bookingDone, 'Booking link', 'Connect Square, Booksy, Vagaro, Fresha, GlossGenius, or another scheduling page.', '/dashboard/pro/profile', bookingDone ? 'Update' : 'Add link')}
          ${stepRow(licenseDone, 'License information', 'Add your professional license details if your service requires them.', '/dashboard/pro/profile', licenseDone ? 'Edit' : 'Add license')}
          ${stepRow(gpsDone, 'Business GPS location', 'Set your business location so customers can see how many miles away you are.', '/dashboard/pro/profile', gpsDone ? 'Update' : 'Set location')}
          ${stepRow(socialDone, 'Social links', 'Optional links help customers see more of your work.', '#social-links', socialDone ? 'Update' : 'Add links')}
        </div>

        <div class="panel" id="social-links">
          <h3>Social links</h3>
          <p class="muted">Optional, but helpful. These links can be shown on your public profile so customers can see more of your work.</p>
          <form method="POST" action="/dashboard/pro/onboarding/socials">
            <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
            <div class="field"><label for="instagram_url">Instagram</label><input id="instagram_url" name="instagram_url" value="${escapeHtml(profile.instagram_url || '')}" placeholder="instagram.com/yourname" /></div>
            <div class="field"><label for="tiktok_url">TikTok</label><input id="tiktok_url" name="tiktok_url" value="${escapeHtml(profile.tiktok_url || '')}" placeholder="tiktok.com/@yourname" /></div>
            <div class="field"><label for="facebook_url">Facebook</label><input id="facebook_url" name="facebook_url" value="${escapeHtml(profile.facebook_url || '')}" placeholder="facebook.com/yourpage" /></div>
            <div class="field"><label for="website_url">Website</label><input id="website_url" name="website_url" value="${escapeHtml(profile.website_url || '')}" placeholder="yourwebsite.com" /></div>
            <button class="btn" type="submit">Save social links</button>
          </form>
        </div>

        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <a class="btn secondary" href="/pro/${profile.id}">Preview public profile</a>
          <div>
            <form method="POST" action="/dashboard/pro/onboarding/finish">
              <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
              <button class="btn" type="submit"${requiredDone ? '' : ' disabled aria-disabled="true"'}>Finish setup</button>
            </form>
            ${finishHelp}
          </div>
        </div>
      </section>`;

    send(ctx.res, layout({ title: 'Professional setup', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/dashboard/pro/onboarding/socials', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const instagram = normalizeUrl(ctx.body.instagram_url, ['instagram.com']);
    const tiktok = normalizeUrl(ctx.body.tiktok_url, ['tiktok.com']);
    const facebook = normalizeUrl(ctx.body.facebook_url, ['facebook.com']);
    const website = normalizeUrl(ctx.body.website_url);
    if ([instagram, tiktok, facebook, website].some((value) => value === null)) {
      return redirect(ctx.res, '/dashboard/pro/onboarding?error=' + encodeURIComponent('One of those links is not valid. Use the correct Instagram, TikTok, Facebook, or website address.'));
    }
    db.prepare('UPDATE pro_profiles SET instagram_url = ?, tiktok_url = ?, facebook_url = ?, website_url = ? WHERE id = ?')
      .run(instagram, tiktok, facebook, website, profile.id);
    redirect(ctx.res, '/dashboard/pro/onboarding?success=' + encodeURIComponent('Social links saved.'));
  });

  router.post('/dashboard/pro/onboarding/finish', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    if (!onboardingState(profile).requiredDone) {
      return redirect(ctx.res, '/dashboard/pro/onboarding?error=' + encodeURIComponent('Complete your core profile, pricing, services, portfolio, and booking link before finishing setup.'));
    }
    db.prepare('UPDATE pro_profiles SET onboarding_completed = 1 WHERE id = ?').run(profile.id);
    redirect(ctx.res, '/dashboard/pro?success=' + encodeURIComponent('Profile setup complete.'));
  });
};
