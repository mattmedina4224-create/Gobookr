'use strict';
const { layout } = require('../lib/layout');
const { send } = require('../lib/http');

module.exports = function (router) {
  router.get('/business-account', async (ctx) => {
    const body = `
      <section class="section container" style="max-width:760px;">
        <div style="margin-bottom:22px;"><a href="/" style="text-decoration:none;">‹ &nbsp;Back</a></div>
        <h1 style="font-size:clamp(34px,6vw,52px);line-height:1.02;margin-bottom:10px;">Choose your GoBookr account</h1>
        <p class="muted" style="font-size:18px;margin-bottom:28px;">How will you use GoBookr?</p>

        <div style="display:grid;gap:16px;">
          <a class="panel" href="/signup?role=pro" style="padding:24px;text-decoration:none;color:inherit;display:flex;align-items:center;gap:18px;">
            <div style="width:48px;display:flex;align-items:center;justify-content:center;color:#111827;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/>
                <path d="M5.5 20c.6-4.2 2.8-6.3 6.5-6.3s5.9 2.1 6.5 6.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div style="flex:1;">
              <h2 style="margin:0 0 6px;">Individual</h2>
              <p class="muted" style="margin:0 0 8px;">For independent professionals offering services directly to clients.</p>
              <strong style="font-size:20px;">$20/month</strong>
            </div>
            <span style="font-size:32px;">›</span>
          </a>

          <a class="panel" href="/signup?role=storefront" style="padding:24px;text-decoration:none;color:inherit;display:flex;align-items:center;gap:18px;">
            <div style="width:48px;display:flex;align-items:center;justify-content:center;color:#111827;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 10v9h16v-9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M3 9l2-5h14l2 5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M3 9c0 1.4 1 2.5 2.3 2.5S7.7 10.4 7.7 9c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.3 2.5S17 10.4 17 9c0 1.4 1 2.5 2.3 2.5S21.7 10.4 21.7 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M9 19v-5h6v5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </div>
            <div style="flex:1;">
              <h2 style="margin:0 0 6px;">Business</h2>
              <p class="muted" style="margin:0 0 8px;">For salons, barbershops, studios, and other service businesses.</p>
              <strong style="font-size:20px;">Complimentary</strong>
            </div>
            <span style="font-size:32px;">›</span>
          </a>
        </div>

        <div style="border-top:1px solid #e4e7ee;margin-top:30px;padding-top:24px;text-align:center;">
          <p class="muted" style="margin:0 0 12px;font-size:16px;">Already have a GoBookr account?</p>
          <a class="btn secondary" href="/login" style="min-width:180px;">Log in</a>
        </div>
      </section>`;
    send(ctx.res, layout({ title: 'Business Account', currentUser: ctx.currentUser, session: ctx.session, body }));
  });
};
