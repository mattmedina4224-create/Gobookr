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
  if (clean.length > 2048) return null;
  const candidate = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname || !hostname.includes('.')) return null;
    if (allowedHosts.length && !allowedHosts.some((host) => hostname === host || hostname.endsWith('.' + host))) return null;
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function onboardingState(profile) {
  const serviceCount = Number(db.prepare('SELECT COUNT(*) AS count FROM services WHERE pro_id = ?').get(profile.id).count) || 0;
  const photoCount = Number(db.prepare("SELECT COUNT(*) AS count FROM portfolio_items WHERE pro_id = ? AND image_url IS NOT NULL AND image_url != ''").get(profile.id).count) || 0;
  const basicsDone = Boolean(profile.business_name && profile.city && /^[A-Za-z]{2}$/.test(String(profile.state || '').trim()) && profile.workplace_name && profile.street_address && /^\d{5}(?:-\d{4})?$/.test(String(profile.zip_code || '').trim()));
  const hasExperienceValue = profile.years_experience !== null && profile.years_experience !== undefined && String(profile.years_experience).trim() !== '';
  const detailsDone = Boolean(profile.bio && hasExperienceValue && Number.isFinite(Number(profile.years_experience)) && Number(profile.years_experience) >= 0 && (profile.price_min > 0 || profile.price_max > 0));
  const servicesDone = serviceCount > 0;
  const photosDone = photoCount > 0;
  const licenseDone = Boolean(profile.license_number && profile.license_state);
  const gpsDone = Number.isFinite(Number(profile.latitude)) && Number.isFinite(Number(profile.longitude));
  const bookingDone = Boolean(profile.booking_url);
  const socialDone = Boolean(profile.instagram_url || profile.tiktok_url || profile.facebook_url || profile.website_url);
  const requiredSteps = [basicsDone, detailsDone, servicesDone, photosDone, bookingDone];
  const requiredDone = requiredSteps.every(Boolean);
  const coreDoneCount = requiredSteps.filter(Boolean).length;
  return { basicsDone, detailsDone, servicesDone, photosDone, licenseDone, gpsDone, bookingDone, socialDone, requiredDone, progress: Math.round((coreDoneCount / requiredSteps.length) * 100) };
}

function renderSetupPage(ctx, profile, error, requestedStep, selected) {
  const { STEPS } = require('../lib/pro-setup');
  const state = onboardingState(profile);
  let categories = db.prepare('SELECT category FROM pro_categories WHERE pro_id = ?').all(profile.id).map(row => row.category);
  if (selected) categories = Object.keys(selected).filter(key => selected[key]);
  const services = db.prepare('SELECT * FROM services WHERE pro_id = ? ORDER BY id').all(profile.id);
  const photos = db.prepare("SELECT * FROM portfolio_items WHERE pro_id = ? AND image_url IS NOT NULL AND image_url != '' ORDER BY id DESC").all(profile.id);
  const checks = [state.basicsDone, state.detailsDone, categories.length > 0, state.servicesDone, state.photosDone, state.bookingDone];
  const resume = STEPS[checks.findIndex(done => !done)] || 'review';
  const candidate = requestedStep || ctx.query.step;
  const step = candidate === 'resume' ? resume : STEPS.includes(candidate) ? candidate : 'basics';
  const body = require('../lib/pro-setup-view').renderSetup({
    profile, step, resume, state, categories, services, photos, error,
    values: error ? ctx.body : null,
    csrf: ctx.session.csrf_token,
    storageReady: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
  send(ctx.res, layout({ title: 'Professional setup', currentUser: ctx.currentUser, session: ctx.session, flash: error ? null : flashFromQuery(ctx.query), body }), error ? 422 : 200);
}

module.exports = function (router) {
  router.get('/dashboard/pro/onboarding', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    renderSetupPage(ctx, profile);
  });

  router.post('/dashboard/pro/onboarding/socials', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    const instagram = normalizeUrl(ctx.body.instagram_url, ['instagram.com']);
    const tiktok = normalizeUrl(ctx.body.tiktok_url, ['tiktok.com']);
    const facebook = normalizeUrl(ctx.body.facebook_url, ['facebook.com']);
    const website = normalizeUrl(ctx.body.website_url);
    if ([instagram, tiktok, facebook, website].some((value) => value === null)) {
      return renderSetupPage(ctx, { ...profile, instagram_url: ctx.body.instagram_url, tiktok_url: ctx.body.tiktok_url, facebook_url: ctx.body.facebook_url, website_url: ctx.body.website_url }, 'One of those links is not valid. Use the correct Instagram, TikTok, Facebook, or website address.', 'extras');
    }
    db.prepare('UPDATE pro_profiles SET instagram_url = ?, tiktok_url = ?, facebook_url = ?, website_url = ? WHERE id = ?')
      .run(instagram, tiktok, facebook, website, profile.id);
    redirect(ctx.res, ctx.body._setup_exit === '1' ? '/dashboard/pro?setup=saved' : '/dashboard/pro/onboarding?step=review&success=' + encodeURIComponent('Social links saved.'));
  });

  router.post('/dashboard/pro/onboarding/finish', async (ctx) => {
    const profile = requirePro(ctx); if (!profile) return;
    if (!onboardingState(profile).requiredDone) {
      return redirect(ctx.res, '/dashboard/pro/onboarding?step=review&error=' + encodeURIComponent('Complete your core profile, pricing, services, portfolio, and booking link before finishing setup.'));
    }
    const categories = db.prepare('SELECT category FROM pro_categories WHERE pro_id = ?').all(profile.id);
    if (!categories.length) return redirect(ctx.res, '/dashboard/pro/onboarding?step=categories&error=' + encodeURIComponent('Choose at least one specialty.'));
    db.prepare('UPDATE pro_profiles SET onboarding_completed = 1 WHERE id = ?').run(profile.id);
    redirect(ctx.res, `/dashboard/pro?success=${encodeURIComponent('Your GoBookr profile is ready for customers.')}&setup=complete`);
  });
};

module.exports.renderSetupPage = renderSetupPage;
