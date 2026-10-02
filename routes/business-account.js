'use strict';
const { layout } = require('../lib/layout');
const { send } = require('../lib/http');

module.exports = function (router) {
  router.get('/business-account', async (ctx) => {
    const body = `
      <section class="section container" style="max-width:760px;">
        <div style="margin-bottom:var(--gb-space-4);"><a href="/" style="text-decoration:none;">‹ &nbsp;Back</a></div>
        <h1 style="font-size:var(--gb-text-2xl);line-height:1.02;margin-bottom:var(--gb-space-2);">Choose your GoBookr account</h1>
        <p class="muted" style="font-size:var(--gb-text-base);margin-bottom:var(--gb-space-4);">How will you use GoBookr?</p>

        <div style="display:grid;gap:var(--gb-space-3);">
          <a class="panel" href="/signup?role=pro" style="padding:var(--gb-space-4);text-decoration:none;color:inherit;display:flex;align-items:center;gap:var(--gb-space-3);">
            <div style="width:48px;display:flex;align-items:center;justify-content:center;color:var(--gb-ink);">
              ${icon('user-round')}
            </div>
            <div style="flex:1;">
              <h2 style="margin:0 0 var(--gb-space-1);">Individual</h2>
              <p class="muted" style="margin:0 0 var(--gb-space-2);">For independent professionals offering services directly to clients.</p>
              <strong style="font-size:var(--gb-text-lg);">30 days free, then $20/month</strong>
            </div>
            <span style="font-size:var(--gb-text-2xl);">›</span>
          </a>

          <a class="panel" href="/signup?role=storefront" style="padding:var(--gb-space-4);text-decoration:none;color:inherit;display:flex;align-items:center;gap:var(--gb-space-3);">
            <div style="width:48px;display:flex;align-items:center;justify-content:center;color:var(--gb-ink);">
              ${icon('building-2')}
            </div>
            <div style="flex:1;">
              <h2 style="margin:0 0 var(--gb-space-1);">Business</h2>
              <p class="muted" style="margin:0 0 var(--gb-space-2);">For salons, barbershops, studios, and other service businesses.</p>
              <strong style="font-size:var(--gb-text-lg);">Complimentary</strong>
            </div>
            <span style="font-size:var(--gb-text-2xl);">›</span>
          </a>
        </div>

        <div style="border-top:1px solid var(--gb-border);margin-top:var(--gb-space-5);padding-top:var(--gb-space-4);text-align:center;">
          <p class="muted" style="margin:0 0 var(--gb-space-2);font-size:var(--gb-text-base);">Already have a GoBookr account?</p>
          <a class="btn secondary" href="/login" style="min-width:180px;">Log in</a>
        </div>
      </section>`;
    send(ctx.res, layout({ title: 'Business Account', currentUser: ctx.currentUser, session: ctx.session, body }));
  });
};
