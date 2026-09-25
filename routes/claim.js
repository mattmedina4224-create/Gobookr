'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { requireClaimProfile } = require('../lib/claims');

function pendingClaim(proId, userId) {
  return db.prepare("SELECT id FROM profile_claims WHERE pro_id = ? AND claimant_user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(proId, userId);
}

module.exports = function (router) {
  router.get('/pro/:id/claim', async (ctx) => {
    const pro = requireClaimProfile(ctx, ctx.params.id);
    if (!pro) return;

    const signedIn = Boolean(ctx.currentUser);
    const alreadyPending = signedIn ? Boolean(pendingClaim(pro.id, ctx.currentUser.id)) : false;
    const actionHtml = alreadyPending
      ? `<div class="panel"><strong>Claim request pending</strong><p class="muted" style="margin:6px 0 0;">We received your request. GoBookr must verify ownership before this profile can be transferred to your account.</p></div>`
      : signedIn
        ? `<form method="POST" action="/pro/${pro.id}/claim"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session?.csrf_token || '')}" /><div class="field"><label for="verification_method">How can we verify you?</label><select id="verification_method" name="verification_method" required><option value="">Choose one</option><option value="booking_profile">Booking profile or website</option><option value="social_account">Professional social account</option><option value="business_contact">Business email or phone</option><option value="license">Professional license</option><option value="other">Other proof</option></select></div><div class="field"><label for="verification_evidence">Verification details</label><textarea id="verification_evidence" name="verification_evidence" rows="4" maxlength="1000" required placeholder="Paste a public link or explain how GoBookr can verify that this profile is yours."></textarea></div><button class="btn" type="submit">Submit claim for review</button></form><p class="muted" style="margin-top:12px;">GoBookr will verify ownership before transferring control of the listing. Your 30-day professional trial starts only after approval.</p>`
        : `<a class="btn" href="/signup?role=pro&claim=${pro.id}">Create an account to claim</a> <a class="btn secondary" href="/login?claim=${pro.id}">Log in</a>`;
    const body = `<section class="section container" style="max-width:720px;"><div class="card"><span class="badge category">Unclaimed profile</span><h1 style="margin-top:12px;">Claim ${escapeHtml(pro.business_name)}</h1><p class="lede">If this is you, claim the profile to manage your information, photos, services and booking link on GoBookr.</p><div class="panel" style="margin:20px 0;"><strong>${escapeHtml(pro.business_name)}</strong>${pro.workplace_name ? `<div>${escapeHtml(pro.workplace_name)}</div>` : ''}<div class="muted">${escapeHtml(pro.city)}, ${escapeHtml(pro.state)}</div></div>${actionHtml}</div></section>`;
    send(ctx.res, layout({ title: `Claim ${pro.business_name}`, currentUser: ctx.currentUser, session: ctx.session, body }));
  });

  router.post('/pro/:id/claim', async (ctx) => {
    const pro = requireClaimProfile(ctx, ctx.params.id);
    if (!pro) return;
    if (!ctx.currentUser) return redirect(ctx.res, `/login?claim=${pro.id}`);

    const verificationMethod = String(ctx.body.verification_method || '').trim();
    const verificationEvidence = String(ctx.body.verification_evidence || '').trim().slice(0, 1000);
    const allowedMethods = new Set(['booking_profile', 'social_account', 'business_contact', 'license', 'other']);
    if (!allowedMethods.has(verificationMethod) || verificationEvidence.length < 3) {
      return redirect(ctx.res, `/pro/${pro.id}/claim?error=` + encodeURIComponent('Please choose a verification method and provide verification details.'));
    }

    // Check ownership in the write itself, not just the potentially cached lookup.
    // The single statement locks the listing and makes repeated requests idempotent.
    const result = db.prepare(`WITH eligible_profile AS (
      UPDATE pro_profiles SET claim_status = 'claim_pending', claim_requested_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id IS NULL AND claim_status IN ('unclaimed', 'claim_pending')
      RETURNING id
    )
    INSERT INTO profile_claims (pro_id, claimant_user_id, status, verification_method, verification_evidence, requested_at)
    SELECT id, ?, 'pending', ?, ?, CURRENT_TIMESTAMP FROM eligible_profile
    ON CONFLICT (pro_id, claimant_user_id) WHERE status = 'pending'
    DO UPDATE SET verification_method = EXCLUDED.verification_method,
                  verification_evidence = EXCLUDED.verification_evidence
    RETURNING id`).run(pro.id, ctx.currentUser.id, verificationMethod, verificationEvidence);
    if (!result.changes) return send(ctx.res, '<h1>This profile is not available to claim.</h1>', 409);
    redirect(ctx.res, `/pro/${pro.id}/claim`);
  });
};
