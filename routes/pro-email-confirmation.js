'use strict';

const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { configured, createConfirmation } = require('../lib/email-confirmation');
const PAGE = '/dashboard/pro/confirm-email';

function renderConfirmation({ email = '', csrf = '', status, message = '' }) {
  const unavailable = status === 'unavailable';
  const confirmed = status === 'confirmed';
  return `<link rel="stylesheet" href="/email-confirmation.css"><section class="email-confirmation container"><div class="email-confirmation-card"><p class="email-confirmation-eyebrow">YOUR GOBOOKR PROFILE</p><h1>${confirmed ? 'Email confirmed' : unavailable ? 'Your profile is published' : 'Confirm your email'}</h1>
    <p>${confirmed ? 'You’re all set. Your professional profile is ready to share.' : unavailable ? 'Email confirmation is temporarily unavailable. You can continue to your dashboard.' : `Your profile is published. Confirm your email to finish this step.<br><strong>${escapeHtml(email)}</strong>`}</p>
    ${message ? `<p class="email-confirmation-message" role="status">${escapeHtml(message)}</p>` : ''}
    ${!confirmed && !unavailable ? `<form method="POST" action="${PAGE}" class="email-confirmation-form"><input type="hidden" name="_csrf" value="${escapeHtml(csrf)}"><label for="confirmation-code">6-digit confirmation code</label><input id="confirmation-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9\\s\\-]{6,12}" maxlength="12" required aria-describedby="code-help" enterkeyhint="done"><p id="code-help" class="helptext">Use your phone’s code suggestion, paste the code, or type it here. Codes expire after 10 minutes.</p><button class="btn primary" type="submit">Confirm email</button></form><form method="POST" action="${PAGE}/resend"><input type="hidden" name="_csrf" value="${escapeHtml(csrf)}"><button class="btn ghost" type="submit">Send a new code</button><p class="helptext">Check your spam folder too. Wait at least 60 seconds between requests.</p></form>` : ''}
    <a class="email-confirmation-dashboard" href="/dashboard/pro">${confirmed || unavailable ? 'Go to my dashboard' : 'Continue to dashboard for now'}</a></div></section>`;
}

function register(router, service) {
  const getService = () => service || (service = createConfirmation({ db: require('../db') }));
  function account(ctx) {
    if (!ctx.currentUser || ctx.currentUser.role !== 'pro') {
      redirect(ctx.res, '/login?next=' + encodeURIComponent(PAGE)); return null;
    }
    const user = getService().identity(ctx.currentUser.id);
    if (!user) { redirect(ctx.res, '/dashboard/pro/onboarding?step=resume'); return null; }
    return user;
  }
  function page(ctx, user, status, message, code = 200) {
    ctx.res.setHeader('Cache-Control', 'no-store');
    send(ctx.res, layout({ title: 'Confirm your email', currentUser: ctx.currentUser, session: ctx.session,
      body: renderConfirmation({ email: user.email, csrf: ctx.session.csrf_token, status, message }) }), code);
  }
  router.get(PAGE, async ctx => {
    const user = account(ctx); if (!user) return;
    if (!getService().enabled()) return page(ctx, user, 'unavailable');
    const state = getService().state(user);
    const message = ctx.query.sent === '1' && state && state.delivered_at ? 'A confirmation code was sent. Use the newest code in your inbox.' : '';
    page(ctx, user, state && state.verified_at ? 'confirmed' : 'pending', message);
  });
  router.post(PAGE, async ctx => {
    const user = account(ctx); if (!user) return;
    if (!getService().enabled()) return page(ctx, user, 'unavailable');
    if (getService().verify(user, ctx.body.code)) return page(ctx, user, 'confirmed');
    if (getService().state(user)?.verified_at) return page(ctx, user, 'confirmed');
    page(ctx, user, 'pending', 'That code is incorrect, expired, or has reached its attempt limit. Use the newest code or request a new one.', 422);
  });
  router.post(PAGE + '/resend', async ctx => {
    const user = account(ctx); if (!user) return;
    if (!getService().enabled()) return page(ctx, user, 'unavailable');
    if (getService().state(user)?.verified_at) return page(ctx, user, 'confirmed');
    const result = await getService().sendCode(user);
    if (result.status === 'sent') return redirect(ctx.res, PAGE + '?sent=1');
    if (result.status === 'unavailable') return page(ctx, user, 'unavailable');
    page(ctx, user, 'pending', result.status === 'limited' ? 'Please wait before requesting another code. You can request up to 5 codes per hour.' : 'We couldn’t send the email. Please wait a minute and try again. Your profile stays published.', result.status === 'limited' ? 429 : 503);
  });
}

async function afterPublish(ctx, service) {
  if (!service && !configured()) return false;
  const api = service || createConfirmation({ db: require('../db') });
  if (!api.enabled()) return false;
  try {
    const user = api.identity(ctx.currentUser.id);
    if (!user) return false;
    if (api.state(user)?.verified_at) return false;
    const result = await api.sendCode(user);
    redirect(ctx.res, PAGE + (result.status === 'sent' ? '?sent=1' : ''));
    return true;
  } catch (_) {
    // Delivery/database trouble must not undo a successful profile publication.
    return false;
  }
}

module.exports = register;
module.exports.afterPublish = afterPublish;
module.exports.renderConfirmation = renderConfirmation;
