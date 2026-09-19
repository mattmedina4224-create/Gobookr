'use strict';
const { layout } = require('../lib/layout');
const { send } = require('../lib/http');

module.exports = function (router) {
  router.get('/business-account', async (ctx) => {
    const body = `
      <section class="section container" style="max-width:760px;">
        <div style="margin-bottom:22px;"><a href="/" style="text-decoration:none;">‹ &nbsp;Back</a></div>
        <h1 style="font-size:clamp(34px,6vw,52px);line-height:1.02;margin-bottom:10px;">What type of business account are you creating?</h1>
        <p class="muted" style="font-size:18px;margin-bottom:28px;">Choose the option that best describes you.</p>

        <div style="display:grid;gap:16px;">
          <a class="panel" href="/signup?role=pro" style="padding:24px;text-decoration:none;color:inherit;display:flex;align-items:center;gap:18px;">
            <div style="font-size:30px;width:48px;text-align:center;">♙</div>
            <div style="flex:1;">
              <h2 style="margin:0 0 6px;">Individual</h2>
              <p class="muted" style="margin:0 0 8px;">Barber, stylist, tattoo artist, nail tech, massage therapist, or other independent professional.</p>
              <strong style="font-size:20px;">$15/month</strong>
            </div>
            <span style="font-size:32px;">›</span>
          </a>

          <a class="panel" href="/signup?role=storefront" style="padding:24px;text-decoration:none;color:inherit;display:flex;align-items:center;gap:18px;">
            <div style="font-size:30px;width:48px;text-align:center;">▣</div>
            <div style="flex:1;">
              <h2 style="margin:0 0 6px;">Storefront</h2>
              <p class="muted" style="margin:0 0 8px;">Barbershop, salon, studio, or other physical service business.</p>
              <strong style="font-size:20px;">$49/month</strong>
            </div>
            <span style="font-size:32px;">›</span>
          </a>
        </div>

        <div style="border-top:1px solid #e4e7ee;margin-top:30px;padding-top:24px;text-align:center;">
          <span class="muted">Already have an account?</span><br />
          <a href="/login" style="font-size:18px;">Log in</a>
        </div>
      </section>`;
    send(ctx.res, layout({ title: 'Business Account', currentUser: ctx.currentUser, session: ctx.session, body }));
  });
};
