'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml: e } = require('../lib/util');

module.exports = function (router) {
  router.get('/join/individual', async (ctx) => {
    if (ctx.currentUser?.role === 'pro') return redirect(ctx.res, '/dashboard/pro/onboarding?step=resume');
    const q = String(ctx.query.q || '').trim().slice(0, 100);
    const city = String(ctx.query.city || '').trim().slice(0, 100);
    // Search only public, unclaimed listings. Never attach ownership by name alone.
    const matches = q.length >= 2 ? db.prepare(`SELECT id, business_name, workplace_name, city, state
      FROM pro_profiles WHERE user_id IS NULL AND claim_status='unclaimed'
      AND COALESCE(source_url,'') <> '' AND COALESCE(source_name,'') <> ''
      AND (LOWER(business_name) LIKE ? OR LOWER(workplace_name) LIKE ?)
      AND LOWER(city) LIKE ? ORDER BY business_name, id LIMIT 20`)
      .all('%' + q.toLowerCase() + '%', '%' + q.toLowerCase() + '%', '%' + city.toLowerCase() + '%') : [];
    const results = q ? `<section aria-label="Matching profiles"><h2>${matches.length ? 'Is one of these you?' : 'No matching profiles found'}</h2>${q.length < 2 ? '<p>Enter at least two characters to search.</p>' : ''}${matches.map(p => `<article class="setup-entry-result"><div><strong>${e(p.business_name)}</strong><p>${e([p.workplace_name,p.city,p.state].filter(Boolean).join(' · '))}</p></div><a class="btn secondary" href="/pro/${p.id}/claim">Claim this profile</a></article>`).join('')}${matches.length === 20 ? '<p>Showing the first 20 matches. Add your city to narrow the results.</p>' : ''}</section>` : '';
    const createAction = ctx.currentUser ? `<form method="POST" action="/join/create"><input type="hidden" name="_csrf" value="${e(ctx.session.csrf_token)}"><button class="btn" type="submit">Create my professional profile</button></form><p class="helptext">Keep your existing email and password. Your 30-day free trial starts when you create your professional profile.</p>` : '<a class="btn" href="/signup?role=pro">Create a new profile</a><p class="helptext">Already have a GoBookr account? <a href="/login?next=%2Fjoin%2Findividual">Sign in to use it</a>.</p>';
    const body = `<link rel="stylesheet" href="/pro-setup.css"><section class="section container pro-setup"><a href="/join" class="back-link">‹ Change account type</a><header><p class="pro-eyebrow">GOBOOKR FOR PROFESSIONALS</p><h1>Let’s get you discovered.</h1><p>Keep your current booking system. Build a profile so local customers can find your work and book with you.</p></header><div class="panel"><h2>First, check if you’re already listed</h2><p>Find and claim your existing profile to keep everything in one place. Ownership verification is required.</p><form method="GET" action="/join/individual"><div class="field"><label for="pro-name">Your professional or business name</label><input id="pro-name" name="q" value="${e(q)}" maxlength="100" minlength="2" required placeholder="Name or business"></div><div class="field"><label for="pro-city">City (optional)</label><input id="pro-city" name="city" value="${e(city)}" maxlength="100" placeholder="City"></div><button class="btn secondary" type="submit">Find my profile</button></form>${results}</div><div class="panel" style="margin-top:20px;"><h2>Not listed yet?</h2><p>Create a private draft, add your details one step at a time, then preview and publish.</p>${createAction}<p class="helptext">30 days free, then $20/month. Setup progress stays saved.</p></div></section>`;
    send(ctx.res, layout({ title: 'Join as a professional', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body }));
  });

  router.post('/join/create', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=%2Fjoin%2Findividual');
    if (ctx.currentUser.role === 'pro') return redirect(ctx.res, '/dashboard/pro/onboarding?step=resume');
    if (ctx.currentUser.role !== 'customer') return send(ctx.res, 'This account cannot create a professional profile.', 403);
    try {
      db.exec('BEGIN IMMEDIATE');
      // The unique user_id prevents duplicate profiles across repeated submissions.
      db.prepare(`INSERT INTO pro_profiles (user_id,business_name,category,city,state)
        VALUES (?, '', 'barber', '', '') ON CONFLICT (user_id) DO NOTHING`).run(ctx.currentUser.id);
      const profile = db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
      db.prepare(`INSERT OR IGNORE INTO subscriptions (pro_id,status,trial_started_at,trial_ends_at)
        VALUES (?, 'trialing', datetime('now'), datetime('now','+30 days'))`).run(profile.id);
      db.prepare("UPDATE users SET role='pro' WHERE id = ? AND role='customer'").run(ctx.currentUser.id);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Professional account setup failed', err);
      return redirect(ctx.res, '/join/individual?error=' + encodeURIComponent('Could not start setup. Your account is safe. Please try again.'));
    }
    redirect(ctx.res, '/dashboard/pro/onboarding?step=basics');
  });
};
