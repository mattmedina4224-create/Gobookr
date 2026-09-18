'use strict';
const { layout } = require('../lib/layout');
const { send } = require('../lib/http');
module.exports=function(router){
  router.get('/business-account',async(ctx)=>{
    const body=`<section class="section container" style="max-width:900px;"><div class="panel" style="padding:40px;"><span class="badge category">For businesses</span><h1 style="margin-top:14px;">Put your business on GoBookr</h1><p class="muted" style="font-size:18px;">Create an independent GoBookr Business Account for your barbershop, salon, studio, or other personal-service business.</p><h2>$49 <span class="muted" style="font-size:16px;font-weight:500;">/ month</span></h2><p>Your business page is separate from every professional profile. Professionals keep and manage their own GoBookr profiles.</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px;"><a class="btn" href="/login?next=/dashboard/shop">Log in to manage a business</a><a class="btn secondary" href="/search">Find your business</a></div><p class="helptext" style="margin-top:18px;">Already listed? Find your business and use “Claim this business” to request ownership.</p></div></section>`;
    send(ctx.res,layout({title:'Business Account',currentUser:ctx.currentUser,session:ctx.session,body}));
  });
};