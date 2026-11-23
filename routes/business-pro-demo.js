'use strict';
// /business-pro/demo — a database-free walkthrough of the business dashboard in every Business Pro state, for
// preview deployments. Uses the real dashboard and Business Pro views with fictional demo data, and a REAL Stripe
// test-mode checkout when a test key is configured. Nothing is stored; the demo subscription is remembered in a
// signed cookie and its state is always re-read from Stripe. Live keys are refused (billingMode() must be 'test').
const crypto = require('node:crypto');
const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const BP = require('../lib/business-pro');
const V = require('../lib/career-views');

const DEMO_SHOP = { id: 990001, name: 'Northline Barber Co. (Demo)', city: 'Denver', state: 'CO', claim_status: 'claimed', owner_user_id: 1, profile_published_at: '2026-11-01T00:00:00Z' };
const DEMO_USER = { id: 1, email: 'owner@example.com' };
const STATES = [['free', 'Free'], ['active', 'Business Pro active'], ['canceling', 'Canceling'], ['past_due_grace', 'Payment failed'], ['past_due', 'Paused (payment)'], ['canceled', 'Canceled']];
const COOKIE = 'gb_bp_demo';
const secret = () => String(process.env.SESSION_SECRET || 'preview-demo');
const sign = (v) => `${v}.${crypto.createHmac('sha256', secret()).update(v).digest('base64url')}`;
const unsign = (s) => { const i = String(s || '').lastIndexOf('.'); if (i < 1) return null; const v = s.slice(0, i); return sign(v) === s ? v : null; };
const cookieOf = (req) => { const m = /(?:^|;\s*)gb_bp_demo=([^;]+)/.exec(req.headers.cookie || ''); return m ? unsign(decodeURIComponent(m[1])) : null; };
// The demo returns to the deployment it was opened on (preview URL), never to APP_URL/production.
const origin = (req) => { const h = String(req.headers.host || ''); if (!/^[a-z0-9.\-]+(:\d+)?$/i.test(h)) return ''; const proto = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h) ? 'http' : 'https'; return `${proto}://${h}`; };
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString();

function fakeSub(state) {
  const base = { owner_user_id: 1, livemode: BP.billingMode() === 'live', stripe_customer_id: 'cus_demo', stripe_subscription_id: 'sub_demo', price_cents: BP.priceCents(), current_period_end: iso(24), cancel_at_period_end: false };
  return { free: null, active: { ...base, status: 'active' }, canceling: { ...base, status: 'active', cancel_at_period_end: true }, past_due_grace: { ...base, status: 'past_due', past_due_since: iso(-1) },
    past_due: { ...base, status: 'past_due', past_due_since: iso(-6) }, canceled: { ...base, status: 'canceled', current_period_end: iso(-2) } }[state];
}
const EXAMPLE_APPS = [
  ['Jordan R. (demo)', 'Barber with 6 years of fades and beard work', 'Barber', 'Denver', 'new', 'Barber, full time', 0, true],
  ['Maya L. (demo)', 'Color specialist looking for a booth rental', 'Hairstylist', 'Aurora', 'interview', 'General application', 3, false],
  ['Theo K. (demo)', 'Apprentice barber, finishing school in December', 'Barber', 'Lakewood', 'reviewing', 'Barber, full time', 1, false],
].map(([name, headline, category, city, status, job, msgs, unread], i) => ({ id: i + 1, status, job_title: job, message_count: msgs, business_unread: unread, updated_at: iso(-i), resume_snapshot: { name, headline, category, city } }));
const DEMO_JOBS = [{ id: 1, title: 'Barber, full time', work_type: 'commission', category: 'barber', status: 'open', applicants: 2 }, { id: 2, title: 'Front desk, part time', work_type: 'part_time', category: '', status: 'draft', applicants: 0 }];

async function liveDemoSub(req) {
  const subId = cookieOf(req);
  if (!subId || BP.billingMode() !== 'test') return null;
  try {
    const s = await BP._stripe(`/subscriptions/${encodeURIComponent(subId)}`, { method: 'GET' });
    if (!s || s.livemode || !s.metadata || s.metadata.business_pro_demo !== '1') return null;
    const item = s.items && s.items.data && s.items.data[0];
    return { owner_user_id: 1, livemode: false, status: s.status, stripe_customer_id: s.customer, stripe_subscription_id: s.id, price_cents: item && item.price ? item.price.unit_amount : BP.priceCents(), current_period_end: new Date(((s.current_period_end || (item && item.current_period_end)) || 0) * 1000).toISOString(), cancel_at_period_end: s.cancel_at_period_end, past_due_since: s.status === 'past_due' ? iso(-1) : null };
  } catch (_) { return null; }
}

function demoize(html, state, tab) {
  return html
    .replace(/action="\/dashboard\/shop\/business-pro\/checkout"/g, 'action="/business-pro/demo/checkout"')
    .replace(/action="\/dashboard\/shop\/business-pro\/portal"/g, 'action="/business-pro/demo/portal"')
    .replace(/href="\/dashboard\/shop\?shop=\d+&(?:amp;)?tab=([a-z]+)[^"]*"/g, (_, t) => `href="/business-pro/demo?state=${state}&tab=${t}"`)
    .replace(/<form (?![^>]*\/business-pro\/demo\/)/g, '<form onsubmit="return false" data-demo-disabled ')
    .replace(/formaction="[^"]*"/g, '')
    .replace(/href="\/shop\/990001[^"]*"/g, 'href="#" aria-disabled="true"')
    .replace(/href="\/dashboard\/shop\/hiring\/applications\/\d+[^"]*"/g, `href="/business-pro/demo?state=${state}&tab=${tab}"`);
}

// Available on previews and local runs; on production only if Career Studio itself is switched on.
const demoOn = () => process.env.VERCEL_ENV !== 'production' || process.env.CAREER_STUDIO_ENABLED === '1';
module.exports = function demoRoutes(router) {
  router.get('/business-pro/demo', async (ctx) => {
    if (!demoOn()) return send(ctx.res, layout({ title: 'Not found', body: '<section class="section container"><h1>Page not found</h1></section>' }), 404);
    const live = await liveDemoSub(ctx.req);
    let state = STATES.some(([k]) => k === ctx.query.state) ? ctx.query.state : 'free';
    const sub = live || fakeSub(state);
    const shop = { ...DEMO_SHOP };
    const ent = BP.evaluate(sub, shop, { mode: BP.billingMode() === 'off' ? 'test' : BP.billingMode() === 'blocked' ? 'test' : BP.billingMode() });
    if (live) state = ent.state;
    const tab = ctx.query.tab === 'hiring' ? 'hiring' : 'pro';
    let panel;
    if (tab === 'pro') panel = V.planPanel({ shop, csrf: '', ent, user: DEMO_USER, notice: live ? '<div class="cs-ok">This is your real Stripe test-mode subscription. Change it in Manage billing and reload.</div>' : '' });
    else if (ent.entitled) panel = V.inboxView({ shop, csrf: '', data: { items: EXAMPLE_APPS, counts: { new: 1, reviewing: 1, interview: 1 }, entitlement: ent }, jobs: DEMO_JOBS, filter: '' });
    else panel = V.hiringPreview({ shop, csrf: '', ent, savedCount: state === 'free' ? 0 : 3, jobs: DEMO_JOBS.map((j) => ({ ...j })) });
    const View = require('../lib/shop-dashboard-view');
    const data = { csrf: '', profile: { services: [], photos: [], team: [], categories: ['barber'] }, team: [], pendingInvites: 0, completion: { percent: 90, next: [], items: [] }, suggestedStep: 6, sponsorship: false, inviteLinks: [], panel, proActive: ent.entitled, hiringUnread: ent.entitled ? 1 : 0 };
    const prev = process.env.CAREER_STUDIO_ENABLED; process.env.CAREER_STUDIO_ENABLED = '1';
    let dash; try { dash = View.page({ shop, shops: [shop], tab, step: null, data }); } finally { if (prev === undefined) delete process.env.CAREER_STUDIO_ENABLED; else process.env.CAREER_STUDIO_ENABLED = prev; }
    const mode = BP.billingMode();
    const switcher = `<div class="cs-demo"><div><strong>Business Pro demo — fictional business and applicants.</strong> ${live ? 'Showing your Stripe test-mode subscription.' : 'Pick a state to see the dashboard:'}</div>
      ${live ? `<form method="POST" action="/business-pro/demo/reset"><button class="btn secondary small" type="submit">Forget test subscription</button></form>` : `<nav aria-label="Demo states">${STATES.map(([k, l]) => `<a href="/business-pro/demo?state=${k}&tab=${tab}"${k === state ? ' aria-current="true"' : ''}>${l}</a>`).join('')}</nav>`}
      <p class="cs-hint">${mode === 'test' ? 'Upgrade runs a real Stripe test-mode checkout (card 4242 4242 4242 4242). Nothing is charged.' : mode === 'blocked' ? 'This deployment only has a live Stripe key, so checkout is turned off. Add BUSINESS_PRO_STRIPE_SECRET_KEY (a sk_test_ key) to enable test checkout.' : 'No Stripe key on this deployment, so checkout is turned off.'} Other buttons are disabled in the demo.</p></div>`;
    send(ctx.res, layout({ title: 'Business Pro demo', currentUser: null, session: null, robots: 'noindex,nofollow', body: `<link rel="stylesheet" href="/career.css?v=4">${demoize(dash.replace('<section class="section container sd">', `<section class="section container sd">${switcher}`), state, tab)}` }));
  });

  router.post('/business-pro/demo/checkout', async (ctx) => {
    if (!demoOn()) return redirect(ctx.res, '/');
    if (BP.billingMode() !== 'test') return redirect(ctx.res, '/business-pro/demo?state=free&tab=pro');
    const host = origin(ctx.req); if (!host) return redirect(ctx.res, '/business-pro/demo');
    const meta = { kind: 'business_pro', business_pro_demo: '1' };
    try {
      const session = await BP._stripe('/checkout/sessions', { params: {
        mode: 'subscription', line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: BP.priceCents(), recurring: { interval: 'month' }, product_data: { name: 'GoBookr Business Pro (preview demo)' } } }],
        success_url: `${host}/business-pro/demo/return?session={CHECKOUT_SESSION_ID}`, cancel_url: `${host}/business-pro/demo?state=free&tab=pro`, metadata: meta, subscription_data: { metadata: meta },
      }, idempotencyKey: `bizpro-demo-${crypto.randomBytes(8).toString('hex')}` });
      redirect(ctx.res, session.url);
    } catch (err) { console.error('Business Pro demo checkout failed', err.message); redirect(ctx.res, '/business-pro/demo?state=free&tab=pro'); }
  });
  router.get('/business-pro/demo/return', async (ctx) => {
    if (BP.billingMode() !== 'test' || !/^cs_test_[A-Za-z0-9]+$/.test(String(ctx.query.session || ''))) return redirect(ctx.res, '/business-pro/demo');
    try {
      const s = await BP._stripe(`/checkout/sessions/${encodeURIComponent(ctx.query.session)}`, { method: 'GET' });
      if (s.livemode || !s.metadata || s.metadata.business_pro_demo !== '1' || !s.subscription) return redirect(ctx.res, '/business-pro/demo');
      const subId = typeof s.subscription === 'object' ? s.subscription.id : s.subscription;
      ctx.res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(sign(subId))}; Path=/business-pro; HttpOnly;${/^https:/.test(origin(ctx.req)) ? ' Secure;' : ''} SameSite=Lax; Max-Age=86400`);
      redirect(ctx.res, '/business-pro/demo?tab=pro');
    } catch (err) { console.error('Business Pro demo return failed', err.message); redirect(ctx.res, '/business-pro/demo'); }
  });
  router.post('/business-pro/demo/portal', async (ctx) => {
    if (!demoOn()) return redirect(ctx.res, '/');
    const live = await liveDemoSub(ctx.req);
    if (!live) return redirect(ctx.res, '/business-pro/demo?tab=pro');
    const host = origin(ctx.req);
    try { const p = await BP._stripe('/billing_portal/sessions', { params: { customer: live.stripe_customer_id, return_url: `${host}/business-pro/demo?tab=pro` } }); redirect(ctx.res, p.url); }
    catch (err) { console.error('Business Pro demo portal failed', err.message); redirect(ctx.res, '/business-pro/demo?tab=pro'); }
  });
  router.post('/business-pro/demo/reset', async (ctx) => { ctx.res.setHeader('Set-Cookie', `${COOKIE}=; Path=/business-pro; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); redirect(ctx.res, '/business-pro/demo'); });
};
