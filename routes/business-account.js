'use strict';
const { layout } = require('../lib/layout');
const { send } = require('../lib/http');
module.exports=function(router){
  router.get('/business-account',async(ctx)=>{
    const body=`<section class="section container" style="max-width:900px;"><div class="panel" style="padding:40px;"><span class="badge category">Business Account</span><h1 style="margin-top:14px;">How do you work?</h1><p class="muted" style="font-size:18px;">Choose the account that best fits how you offer your services.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:26px;"><a class="panel" style="padding:26px;text-decoration:none;color:inherit;" href="/signup?role=pro"><h2 style="margin-top:0;">Individual</h2><p class="muted">I’m a barber, stylist, tattoo artist, nail tech, massage therapist, or other independent professional.</p><strong>Professional Account · $15/month</strong></a><a class="panel" style="padding:26px;text-decoration:none;color:inherit;" href="/login?next=/dashboard/shop"><h2 style="margin-top:0;">Storefront</h2><p class="muted">I’m listing a barbershop, salon, studio, or other physical service business.</p><strong>Business Account · $49/month</strong></a></div><p class="helptext" style="margin-top:22px;">Already have an account? <a href="/login">Log in</a></p></div></section>`;
    send(ctx.res,layout({title:'Business Account',currentUser:ctx.currentUser,session:ctx.session,body}));
  });
};