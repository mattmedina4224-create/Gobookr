'use strict';
const {layout}=require('../lib/layout');
const {send,redirect,flashFromQuery}=require('../lib/http');
const views=require('../lib/staff-views');
const {createStaffStore,ACTIVE_PERMISSIONS}=require('../lib/staff-store');

module.exports=function(router,{enabled=()=>process.env.GOBOOKR_STAFF_PORTAL_ENABLED==='true',store:injectedStore}={}) {
  let store=injectedStore;
  function getStore() {
    if(!store) {
      const {Pool}=require('pg');
      // Existing server connection settings only. No new secrets or provider calls.
      const connectionString=process.env.DATABASE_URL;
      const {staffConnectionOptions}=require('../lib/staff-tls');
      store=createStaffStore(new Pool({...staffConnectionOptions(connectionString),max:2,connectionTimeoutMillis:5000,statement_timeout:5000}));
    }
    return store;
  }
  const actor=ctx=>({userId:Number(ctx.currentUser?.id),token:ctx.session?.token});
  function available(ctx) {
    if(!enabled()){send(ctx.res,'<h1>404 — page not found</h1>',404);return false;}
    if(!ctx.currentUser || !ctx.session?.token){
      const requested=String(ctx.req?.url||'').split('?')[0];
      const destination=requested==='/staff'||requested==='/owner'||requested.startsWith('/owner/')?requested:'/owner';
      redirect(ctx.res,'/login?next='+encodeURIComponent(destination));return false;
    }
    return true;
  }
  function page(ctx,title,body) {
    ctx.res.setHeader('Cache-Control','no-store');
    send(ctx.res,layout({title,currentUser:ctx.currentUser,session:ctx.session,flash:flashFromQuery(ctx.query||{}),body}));
  }
  function denied(ctx,error) {
    const expected=/access required|not found|unavailable|Invalid|already|existing|Confirm|changed|elevated/.test(error.message);
    const code=/access required/.test(error.message)?403:expected?400:503;
    if (!expected) console.error('[staff-portal] request failed', {code: /^[A-Z0-9_]{1,64}$/.test(String(error.code||'')) ? error.code : 'UNCLASSIFIED'});
    pageError(ctx,code,expected?error.message:'Employee portal is unavailable. No change was completed.');
  }
  function pageError(ctx,status,message) {
    const {escapeHtml}=require('../lib/util');
    ctx.res.setHeader('Cache-Control','no-store');
    send(ctx.res,layout({title:'Employee portal',currentUser:ctx.currentUser,session:ctx.session,body:`<section class="section container"><h1>Employee portal</h1><p>${escapeHtml(message)}</p><a href="/owner/staff">Back to team</a></section>`}),status);
  }
  const route=(method,path,fn)=>router[method](path,async ctx=>{if(!available(ctx))return;try{await fn(ctx,getStore());}catch(error){denied(ctx,error);}});
  route('get','/owner',async(ctx,s)=>{await s.list(actor(ctx));page(ctx,'GoBookr owner',views.overview());});
  route('get','/owner/staff',async(ctx,s)=>page(ctx,'GoBookr team',views.roster(await s.list(actor(ctx)))));
  route('get','/owner/staff/new',async(ctx,s)=>{await s.list(actor(ctx));page(ctx,'Add employee',views.form({csrf:ctx.session.csrf_token}));});
  route('get','/owner/staff/design',async(ctx,s)=>{
    await s.list(actor(ctx));
    page(ctx,'Employee page preview',views.employee({id:0,name:'Employee page preview',email:'',phone:'',job_title:'',department:'',permissions:[],status:'preview'},{preview:true}));
  });
  route('get','/owner/staff/:id',async(ctx,s)=>page(ctx,'Employee',views.employee(await s.get(actor(ctx),Number(ctx.params.id)))));
  route('get','/owner/staff/:id/edit/:section',async(ctx,s)=>{
    const section=ctx.params.section;if(!['personal','job','access'].includes(section))return pageError(ctx,404,'Page not found');
    page(ctx,'Edit employee',views.form({member:await s.get(actor(ctx),Number(ctx.params.id)),section,csrf:ctx.session.csrf_token}));
  });
  function grants(body){return ACTIVE_PERMISSIONS.filter(p=>body['permission_'+p]==='yes');}
  function csrf(ctx) {return typeof ctx.body?._csrf==='string' && Boolean(ctx.session.csrf_token) && ctx.body._csrf===ctx.session.csrf_token;}
  route('post','/owner/staff',async(ctx,s)=>{
    if(!csrf(ctx))return pageError(ctx,403,'Form expired. Reload before trying again.');
    const member=await s.add(actor(ctx),{...ctx.body,permissions:grants(ctx.body)});redirect(ctx.res,'/owner/staff/'+member.id);
  });
  route('post','/owner/staff/:id/edit/:section',async(ctx,s)=>{
    if(!csrf(ctx))return pageError(ctx,403,'Form expired. Reload before trying again.');
    await s.update(actor(ctx),Number(ctx.params.id),Number(ctx.body.version),ctx.params.section,{...ctx.body,permissions:grants(ctx.body)});
    redirect(ctx.res,'/owner/staff/'+Number(ctx.params.id));
  });
  route('get','/owner/payroll',async(ctx,s)=>{await s.list(actor(ctx));page(ctx,'Payroll setup',views.payroll());});
  route('get','/staff',async(ctx,s)=>page(ctx,'My employee profile',views.employee(await s.self(actor(ctx)),{readOnly:true})));
};
