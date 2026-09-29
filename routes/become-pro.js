'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml, initialsFrom } = require('../lib/util');

const PRO_CATEGORIES = [
  ['barber', 'Barber'], ['stylist', 'Hairstylist'], ['colorist', 'Colorist'],
  ['nail_technician', 'Nail Technician'], ['eyelash_technician', 'Lash Technician'],
  ['eyebrow_technician', 'Brow Technician'], ['waxing_specialist', 'Waxing Specialist'],
  ['tattoo_artist', 'Tattoo Artist'], ['massage_therapist', 'Massage Therapist'],
];
const CATEGORY_VALUES = new Set(PRO_CATEGORIES.map(([value]) => value));
const LEGACY_CATEGORY = new Set(['barber', 'stylist', 'colorist']);

module.exports = function (router) {
  router.get('/become-pro', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/become-pro'));
    if (ctx.currentUser.role === 'pro') return redirect(ctx.res, '/dashboard/pro/onboarding');

    const body = `<section class="section container" style="max-width:640px;">
      <div class="panel">
        <span class="badge category">Professional membership</span>
        <h1 style="margin-top:12px;">Turn this account into a professional account</h1>
        <p class="muted">Keep your same email and password. You’ll start a 30-day free trial, then GoBookr Professional is $20/month unless canceled.</p>
        <form method="POST" action="/become-pro">
          <input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />
          <label for="pro-category">What type of professional are you?</label>
          <select id="pro-category" name="category" required>
            <option value="">Choose your service</option>
            ${PRO_CATEGORIES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
          <button class="btn block" type="submit" style="margin-top:14px;">Start my 30-day professional trial</button>
        </form>
      </div>
    </section>`;

    send(ctx.res, layout({ title: 'Become a professional', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/become-pro', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent('/become-pro'));
    if (ctx.currentUser.role === 'pro') return redirect(ctx.res, '/dashboard/pro/onboarding');
    const selectedCategory = String(ctx.body.category || '').trim();
    if (!CATEGORY_VALUES.has(selectedCategory)) return redirect(ctx.res, '/become-pro?error=' + encodeURIComponent('Choose the service that best describes your work.'));

    const existingProfile = db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
    if (existingProfile) {
      db.prepare("UPDATE users SET role = 'pro' WHERE id = ?").run(ctx.currentUser.id);
      db.prepare('INSERT INTO pro_categories (pro_id, category) VALUES (?, ?) ON CONFLICT (pro_id, category) DO NOTHING').run(existingProfile.id, selectedCategory);
      db.prepare(`INSERT OR IGNORE INTO subscriptions (pro_id, status, trial_started_at, trial_ends_at) VALUES (?, 'trialing', datetime('now'), datetime('now','+30 days'))`).run(existingProfile.id);
      return redirect(ctx.res, '/dashboard/pro/onboarding?success=' + encodeURIComponent('Professional account activated.'));
    }

    const businessName = String(ctx.currentUser.name || 'My Business').trim() || 'My Business';
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare("UPDATE users SET role = 'pro' WHERE id = ?").run(ctx.currentUser.id);
      const profileResult = db.prepare(`INSERT INTO pro_profiles (user_id,business_name,category,bio,city,state,workplace_name,street_address,suite,zip_code,price_min,price_max,years_experience,accent,initials) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        ctx.currentUser.id,
        businessName,
        LEGACY_CATEGORY.has(selectedCategory) ? selectedCategory : 'barber',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        0,
        0,
        0,
        'violet',
        initialsFrom(businessName)
      );
      const proId = profileResult.lastInsertRowid;
      db.prepare('INSERT INTO pro_categories (pro_id, category) VALUES (?, ?) ON CONFLICT (pro_id, category) DO NOTHING').run(proId, selectedCategory);
      db.prepare(`INSERT OR IGNORE INTO subscriptions (pro_id, status, trial_started_at, trial_ends_at) VALUES (?, 'trialing', datetime('now'), datetime('now','+30 days'))`).run(proId);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Become-pro conversion failed', err);
      return redirect(ctx.res, '/become-pro?error=' + encodeURIComponent('We could not activate the professional account. Please try again.'));
    }

    redirect(ctx.res, '/dashboard/pro/onboarding?success=' + encodeURIComponent('Professional account activated. Your 30-day free trial has started.'));
  });
};
