'use strict';
// Career Studio + Business Pro routes. Everything is off unless CAREER_STUDIO_ENABLED=1.
//   Professionals (free):  /dashboard/pro/career, résumé save, apply, withdraw, messages
//   Businesses (owner):    dashboard tabs ?tab=hiring and ?tab=pro, job drafts (free), publish/inbox/messages/status (Business Pro)
//   Billing:               /dashboard/shop/business-pro/checkout|portal, /business-pro/stripe/webhook
//   Public:                /jobs, /jobs/:id, apply buttons on business pages
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const BP = require('../lib/business-pro');
const C = require('../lib/career');
const V = require('../lib/career-views');

const on = () => BP.enabled();
const page = (ctx, title, body, status = 200, robots = 'noindex,nofollow') => send(ctx.res, layout({ title, currentUser: ctx.currentUser, session: ctx.session, flash: flashFromQuery(ctx.query), body, robots }), status);
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const msg = (path, type, text) => `${path}${path.includes('?') ? '&' : '?'}${type}=${encodeURIComponent(text)}`;
const shopRoutes = () => require('./shop-profile-routes');
const notFound = (ctx) => page(ctx, 'Not found', '<section class="section container"><h1>Page not found</h1></section>', 404);

// Data the business dashboard needs for the Hiring and Business Pro tabs (called from shop-profile-routes render()).
function dashboardExtras(ctx, shop, tab) {
  const user = ctx.currentUser, ent = BP.entitlement(shop);
  const out = { proActive: ent.entitled, hiringUnread: 0 };
  if (ent.entitled) out.hiringUnread = Number(require('../db').prepare("WITH fresh_read AS (SELECT 1) SELECT COUNT(*) AS n FROM job_applications WHERE shop_id = ? AND business_unread = TRUE AND status <> 'withdrawn'").get(shop.id).n);
  const csrf = ctx.session?.csrf_token || '';
  if (tab === 'pro') {
    let notice = '';
    if (ctx.query.canceled) notice = '<div class="cs-note">Checkout canceled. Nothing was charged.</div>';
    if (ctx.query.checkout && ent.entitled) notice = '<div class="cs-ok">Business Pro is active. Your hiring tools are on.</div>';
    else if (ctx.query.checkout) notice = '<div class="cs-note">Stripe is confirming your payment. This page updates as soon as it does.</div>';
    out.panel = V.planPanel({ shop, csrf, ent, user, notice });
  } else if (tab === 'hiring') {
    const jobs = C.jobsForOwner(shop.id);
    const editId = Number(ctx.query.edit);
    const editing = Number.isInteger(editId) ? jobs.find((j) => Number(j.id) === editId) || null : null;
    const data = C.inbox(user, shop.id, { status: String(ctx.query.status || '') });
    out.panel = data.locked ? V.hiringPreview({ shop, csrf, ent, savedCount: data.savedCount, jobs }) : V.inboxView({ shop, csrf, data, jobs, filter: String(ctx.query.status || '') });
    if (editing) out.panel = out.panel.replace(/<section class="cs-jobs"[\s\S]*<\/section>$/, V.jobsSection({ shop, csrf, jobs, entitled: ent.entitled, editing }));
  }
  return out;
}

// Public business page: hiring card only when the business accepts applications.
function publicShopHiring(ctx, shop) {
  if (!C.acceptsApplications(shop.id)) return '';
  const jobs = C.openJobs({ shopId: shop.id, limit: 10 });
  return V.shopHiringCard({ shop, jobs, csrf: ctx.session?.csrf_token || '', viewer: viewerFor(ctx, shop.id, null) });
}
function viewerFor(ctx, shopId, jobId) {
  const user = ctx.currentUser || null, pro = C.proFor(user), resume = pro ? C.resumeFor(pro.id) : null;
  let applied = null;
  if (pro) { const r = require('../db').prepare("WITH fresh_read AS (SELECT 1) SELECT id FROM job_applications WHERE pro_id = ? AND shop_id = ? AND COALESCE(job_post_id, 0) = ? AND status <> 'withdrawn'").get(pro.id, shopId, jobId || 0); applied = r ? r.id : null; }
  return { user, pro, resume, applied };
}

function owner(ctx) { return shopRoutes().owner(ctx); }
function renderShop(ctx, o, opts) { return shopRoutes().render(ctx, o.shop, o.shops, opts); }
function fail(ctx, err, back) {
  if (!(err instanceof C.CareerError) && !err.code) throw err;
  if (!(err instanceof C.CareerError)) console.error('Career/Business Pro error', err);
  redirect(ctx.res, msg(back, 'error', err instanceof C.CareerError || ['LIVE_BLOCKED', 'BILLING_OFF', 'ALREADY', 'NOT_OWNER', 'NO_CUSTOMER'].includes(err.code) ? err.message : 'Something went wrong with billing. Nothing was charged.'));
}

module.exports = function careerRoutes(router) {
  // ---- business: billing ----------------------------------------------------------------------------------------
  router.get('/dashboard/shop/business-pro', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    if (ctx.query.checkout) { try { await BP.confirmCheckout(o.shop, String(ctx.query.checkout)); } catch (err) { console.error('Business Pro checkout confirm failed', err.message); } }
    const q = new URLSearchParams({ shop: String(o.shop.id), tab: 'pro', ...(ctx.query.checkout ? { checkout: '1' } : {}), ...(ctx.query.canceled ? { canceled: '1' } : {}) });
    redirect(ctx.res, '/dashboard/shop?' + q.toString());
  });
  router.post('/dashboard/shop/business-pro/checkout', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    const back = `/dashboard/shop?shop=${o.shop.id}&tab=pro`;
    try { const session = await BP.startCheckout({ shop: o.shop, user: ctx.currentUser }); redirect(ctx.res, session.url); }
    catch (err) { fail(ctx, err, back); }
  });
  router.post('/dashboard/shop/business-pro/portal', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    const back = `/dashboard/shop?shop=${o.shop.id}&tab=pro`;
    try { const p = await BP.portal(o.shop, ctx.currentUser); redirect(ctx.res, p.url); }
    catch (err) { fail(ctx, err, back); }
  });
  router.post('/business-pro/stripe/webhook', async (ctx) => {
    if (!BP.webhookSecret()) return json(ctx.res, 503, { error: 'not configured' });
    if (!BP.verifySignature(ctx.rawBody, ctx.req.headers['stripe-signature'])) return json(ctx.res, 400, { error: 'invalid signature' });
    const event = ctx.body || {};
    try {
      if (event.id && !BP.claimEvent(event.id)) return json(ctx.res, 200, { duplicate: true });
      const r = await BP.handleEvent(event);
      json(ctx.res, 200, { received: true, ignored: Boolean(r.ignored) });
    } catch (err) {
      console.error('Business Pro webhook failed', err);
      if (event.id) require('../db').prepare('DELETE FROM business_pro_events WHERE event_id = ?').run(String(event.id)); // let Stripe retry
      json(ctx.res, 500, { error: 'processing failed' });
    }
  });

  // ---- business: hiring -------------------------------------------------------------------------------------------
  router.post('/dashboard/shop/jobs', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    const back = `/dashboard/shop?shop=${o.shop.id}&tab=hiring`;
    try { C.saveJob(ctx.currentUser, o.shop.id, null, C.parseJob(ctx.body || {})); redirect(ctx.res, msg(back, 'success', BP.entitlement(o.shop).entitled ? 'Draft saved. Publish it when you’re ready.' : 'Draft saved. Publishing needs Business Pro.')); }
    catch (err) { fail(ctx, err, back); }
  });
  router.post('/dashboard/shop/jobs/:id', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    const back = `/dashboard/shop?shop=${o.shop.id}&tab=hiring`;
    try { C.saveJob(ctx.currentUser, o.shop.id, Number(ctx.params.id), C.parseJob(ctx.body || {})); redirect(ctx.res, msg(back, 'success', 'Opening saved.')); }
    catch (err) { fail(ctx, err, back); }
  });
  for (const [action, status, done] of [['publish', 'open', 'Opening published.'], ['close', 'closed', 'Opening closed.']]) {
    router.post(`/dashboard/shop/jobs/:id/${action}`, async (ctx) => {
      if (!on()) return notFound(ctx);
      const o = owner(ctx); if (!o) return;
      const back = `/dashboard/shop?shop=${o.shop.id}&tab=hiring`;
      try { C.setJobStatus(ctx.currentUser, o.shop.id, Number(ctx.params.id), status); redirect(ctx.res, msg(back, 'success', done)); }
      catch (err) { fail(ctx, err, back); }
    });
  }
  router.get('/dashboard/shop/hiring/applications/:id', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    try {
      const { app, messages } = C.applicationForOwner(ctx.currentUser, o.shop.id, Number(ctx.params.id));
      renderShop(ctx, o, { tab: 'hiring', extra: { panel: V.applicationOwnerView({ shop: o.shop, csrf: ctx.session.csrf_token, app, messages }) } });
    } catch (err) {
      if (!(err instanceof C.CareerError)) throw err;
      if (err.code === 402) return redirect(ctx.res, msg(`/dashboard/shop?shop=${o.shop.id}&tab=hiring`, 'error', err.message));
      page(ctx, 'Not found', `<section class="section container"><h1>${err.code === 403 ? 'Not allowed' : 'Application not found'}</h1></section>`, err.code === 403 ? 403 : 404);
    }
  });
  router.post('/dashboard/shop/hiring/applications/:id/status', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    const back = `/dashboard/shop/hiring/applications/${Number(ctx.params.id)}?shop=${o.shop.id}`;
    try { C.setStatus(ctx.currentUser, o.shop.id, Number(ctx.params.id), String(ctx.body.status || '')); redirect(ctx.res, msg(back, 'success', 'Status updated.')); }
    catch (err) { fail(ctx, err, back); }
  });
  router.post('/dashboard/shop/hiring/applications/:id/messages', async (ctx) => {
    if (!on()) return notFound(ctx);
    const o = owner(ctx); if (!o) return;
    const back = `/dashboard/shop/hiring/applications/${Number(ctx.params.id)}?shop=${o.shop.id}`;
    try { C.sendMessage({ user: ctx.currentUser, appId: Number(ctx.params.id), body: ctx.body.body, as: 'business', shopId: o.shop.id }); redirect(ctx.res, back + '#reply'); }
    catch (err) { fail(ctx, err, back); }
  });

  // ---- professionals (free) -----------------------------------------------------------------------------------------
  function requirePro(ctx) {
    if (!ctx.currentUser) { redirect(ctx.res, '/login?next=' + encodeURIComponent(ctx.req.url)); return null; }
    const pro = C.proFor(ctx.currentUser);
    if (!pro) { page(ctx, 'Career Studio', '<section class="section container" style="max-width:720px"><div class="panel"><h1>Career Studio is for professionals</h1><p>Claim or create your GoBookr professional profile to build a free résumé.</p><a class="btn" href="/join">Join as a professional</a></div></section>', 403); return null; }
    return pro;
  }
  function proShell(ctx, inner) {
    const { dashboardNav, PRO_NAV_ITEMS } = require('../lib/pro-dashboard-view');
    return `<section class="section container"><div class="dash-layout">${dashboardNav('career', PRO_NAV_ITEMS)}<div>${inner}</div></div></section>`;
  }
  router.get('/dashboard/pro/career', async (ctx) => {
    if (!on()) return notFound(ctx);
    const pro = requirePro(ctx); if (!pro) return;
    const notes = C.notifications(ctx.currentUser, 10);
    const body = proShell(ctx, V.careerPage({ csrf: ctx.session.csrf_token, pro, resume: C.resumeFor(pro.id), apps: C.applicationsForPro(ctx.currentUser), notes, user: ctx.currentUser }));
    C.markRead(ctx.currentUser);
    page(ctx, 'Career Studio', body);
  });
  router.post('/dashboard/pro/career/resume', async (ctx) => {
    if (!on()) return notFound(ctx);
    const pro = requirePro(ctx); if (!pro) return;
    try { C.saveResume(pro.id, C.parseResume(ctx.body || {})); redirect(ctx.res, msg('/dashboard/pro/career', 'success', 'Résumé saved.')); }
    catch (err) { fail(ctx, err, '/dashboard/pro/career'); }
  });
  router.get('/dashboard/pro/career/applications/:id', async (ctx) => {
    if (!on()) return notFound(ctx);
    const pro = requirePro(ctx); if (!pro) return;
    try { const d = C.applicationForPro(ctx.currentUser, Number(ctx.params.id)); page(ctx, 'Application', proShell(ctx, V.proApplicationView({ csrf: ctx.session.csrf_token, ...d }))); }
    catch (err) { if (!(err instanceof C.CareerError)) throw err; notFound(ctx); }
  });
  router.post('/dashboard/pro/career/applications/:id/messages', async (ctx) => {
    if (!on()) return notFound(ctx);
    const pro = requirePro(ctx); if (!pro) return;
    const back = `/dashboard/pro/career/applications/${Number(ctx.params.id)}`;
    try { C.sendMessage({ user: ctx.currentUser, appId: Number(ctx.params.id), body: ctx.body.body, as: 'pro' }); redirect(ctx.res, back + '#reply'); }
    catch (err) { fail(ctx, err, back); }
  });
  router.post('/dashboard/pro/career/applications/:id/withdraw', async (ctx) => {
    if (!on()) return notFound(ctx);
    const pro = requirePro(ctx); if (!pro) return;
    try { C.withdraw(ctx.currentUser, Number(ctx.params.id)); redirect(ctx.res, msg('/dashboard/pro/career', 'success', 'Application withdrawn.')); }
    catch (err) { fail(ctx, err, '/dashboard/pro/career'); }
  });

  // ---- public jobs + applying -------------------------------------------------------------------------------------
  router.get('/jobs', async (ctx) => {
    if (!on()) return notFound(ctx);
    const city = String(ctx.query.city || '').slice(0, 80), category = String(ctx.query.category || '');
    page(ctx, 'GoBookr Jobs', V.jobsBoard({ jobs: C.openJobs({ city, category }), city, category }), 200, '');
  });
  router.get('/jobs/:id', async (ctx) => {
    if (!on()) return notFound(ctx);
    const job = C.publicJob(Number(ctx.params.id)); if (!job) return page(ctx, 'Opening closed', '<section class="section container"><h1>This opening is closed</h1><p><a href="/jobs">See other openings</a></p></section>', 404);
    page(ctx, `${job.title} at ${job.shop_name}`, V.jobPage({ job, csrf: ctx.session?.csrf_token || '', viewer: viewerFor(ctx, job.shop_id, job.id) }), 200, '');
  });
  const applyRoute = (getTarget) => async (ctx) => {
    if (!on()) return notFound(ctx);
    const target = getTarget(ctx); if (!target) return notFound(ctx);
    if (!ctx.currentUser) return redirect(ctx.res, '/login?next=' + encodeURIComponent(target.back));
    try { const id = C.apply({ user: ctx.currentUser, shopId: target.shopId, jobId: target.jobId, note: ctx.body.note }); redirect(ctx.res, msg(`/dashboard/pro/career/applications/${id}`, 'success', 'Application sent. You can message the business here.')); }
    catch (err) { if (err instanceof C.CareerError && err.code === 409 && /résumé/.test(err.message)) return redirect(ctx.res, msg('/dashboard/pro/career', 'error', err.message)); fail(ctx, err, target.back); }
  };
  router.post('/jobs/:id/apply', applyRoute((ctx) => { const job = C.publicJob(Number(ctx.params.id)); return job ? { shopId: Number(job.shop_id), jobId: Number(job.id), back: `/jobs/${job.id}` } : null; }));
  router.post('/shop/:id/apply', applyRoute((ctx) => { const id = Number(ctx.params.id); return Number.isInteger(id) && id > 0 ? { shopId: id, jobId: null, back: `/shop/${id}#hiring` } : null; }));
};
module.exports.dashboardExtras = dashboardExtras;
module.exports.publicShopHiring = publicShopHiring;
