'use strict';
// /account/admin-access — where a signed-in account completes an administrator grant that the project owner already
// authorized for it. There is no way to request or create an authorization here; without one this page is a 404.
const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { createAdminGrant } = require('../lib/admin-grant');

const REASONS = {
  not_configured: 'Verification email is not set up on this site yet. Nothing was granted.',
  wait: 'A code was just sent. Wait a minute before asking for another.',
  too_many_codes: 'Too many codes were sent for this authorization. Ask the project owner to authorize again.',
  send_failed: 'The email could not be sent. Try again in a minute.',
  expired: 'This authorization expired. Ask the project owner to authorize again.',
  email_changed: 'This account’s email changed after it was authorized, so the authorization no longer applies.',
  code_expired: 'That code expired. Send a new one.',
  wrong_code: 'That code is not correct.',
  locked: 'Too many incorrect codes. This authorization is closed; ask the project owner to authorize again.',
  format: 'Enter the 8-digit code from the email.',
  not_found: 'There is no open administrator authorization for this account.',
};

module.exports = function adminAccessRoutes(router) {
  const grant = createAdminGrant({ db });
  const notFound = (ctx) => send(ctx.res, layout({ title: 'Not found', currentUser: ctx.currentUser, session: ctx.session, body: '<section class="section container"><h1>Page not found</h1></section>' }), 404);
  const back = (type, key) => `/account/admin-access?${type}=${encodeURIComponent(REASONS[key] || key)}`;

  router.get('/account/admin-access', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=%2Faccount%2Fadmin-access');
    const req = grant.pending(ctx.currentUser);
    if (!req) return notFound(ctx);
    const csrf = escapeHtml(ctx.session.csrf_token);
    const body = `<section class="section container" style="max-width:640px"><div class="panel">
      <p class="muted">GoBookr administrator access</p><h1>Verify this account</h1>
      <p>The project owner authorized administrator access for <strong>${escapeHtml(req.email)}</strong>. To finish, prove you control that inbox: send a one-time code to it and enter the code below. Nothing is granted until the code is verified.</p>
      <form method="POST" action="/account/admin-access/send"><input type="hidden" name="_csrf" value="${csrf}"><button class="btn secondary" type="submit">${req.codes_sent ? 'Send a new code' : 'Email me a code'}</button></form>
      <form method="POST" action="/account/admin-access/verify" style="margin-top:20px"><input type="hidden" name="_csrf" value="${csrf}">
        <label for="code">8-digit code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required>
        <button class="btn" type="submit" style="margin-top:12px">Verify and finish</button></form>
      <p class="helptext">After verification you are signed out everywhere. Sign in again to use the admin pages. Authorization expires ${escapeHtml(new Date(req.expires_at).toUTCString())}.</p>
    </div></section>`;
    send(ctx.res, layout({ title: 'Administrator verification', currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), robots: 'noindex,nofollow', body }));
  });

  router.post('/account/admin-access/send', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login');
    if (!grant.pending(ctx.currentUser)) return notFound(ctx);
    const r = await grant.sendCode(ctx, ctx.currentUser);
    redirect(ctx.res, r.ok ? `/account/admin-access?success=${encodeURIComponent('Code sent to ' + r.email + '. It expires in 15 minutes.')}` : back('error', r.reason));
  });

  router.post('/account/admin-access/verify', async (ctx) => {
    if (!ctx.currentUser) return redirect(ctx.res, '/login');
    if (!grant.pending(ctx.currentUser)) return notFound(ctx);
    const r = grant.verify(ctx, ctx.currentUser, ctx.body.code);
    if (!r.ok) return redirect(ctx.res, r.reason === 'locked' || r.reason === 'expired' ? '/?error=' + encodeURIComponent(REASONS[r.reason]) : back('error', r.reason));
    // The grant signed this account out everywhere (sessions deleted in the same transaction).
    redirect(ctx.res, '/login?next=%2Fadmin%2Fshop-claims&success=' + encodeURIComponent('Administrator access granted. Sign in again to continue.'));
  });
};
