'use strict';
const {layout}=require('../lib/layout');
const {send,redirect}=require('../lib/http');
const {escapeHtml}=require('../lib/util');
const views=require('../lib/support-views');
const {createSupportStore}=require('../lib/support-store');
module.exports=function(router,{enabled=()=>process.env.GOBOOKR_STAFF_PORTAL_ENABLED==='true',staffStore,store:injectedStore}={}){
 let store=injectedStore;
 function getStore(){if(!store){const {Pool}=require('pg');const {staffConnectionOptions}=require('../lib/staff-tls');store=createSupportStore(new Pool({...staffConnectionOptions(process.env.DATABASE_URL),max:2,connectionTimeoutMillis:5000,statement_timeout:5000}));}return store;}
 const actor=ctx=>({userId:Number(ctx.currentUser?.id),token:ctx.session?.token});
 function page(ctx,body,status=200){ctx.res.setHeader('Cache-Control','no-store');send(ctx.res,layout({title:'Support inbox',currentUser:ctx.currentUser,session:ctx.session,robots:'noindex,nofollow',body}),status);}
 function route(method,path,fn){router[method](path,async ctx=>{
  if(!enabled())return send(ctx.res,'<h1>404 — page not found</h1>',404);
  if(!ctx.currentUser||!ctx.session?.token)return redirect(ctx.res,'/login?next='+encodeURIComponent(path.startsWith('/owner')?'/owner/support':'/staff/support'));
  if(method==='post'&&(typeof ctx.body?._csrf!=='string'||!ctx.session.csrf_token||ctx.body._csrf!==ctx.session.csrf_token))return page(ctx,'<h1>Form expired</h1><p>Reload before trying again.</p>',403);
  try{await fn(ctx,getStore());}catch(err){const expected=/required|not found|Invalid|changed|needs active/.test(err.message);if(!expected)console.error('[support-inbox] request failed');page(ctx,`<section class="section container"><h1>Support inbox</h1><p>${escapeHtml(expected?err.message:'Support inbox is unavailable. No change was completed.')}</p></section>`,/access required/.test(err.message)?403:expected?400:503);}
 });}
 for(const owner of [true,false]){const base=owner?'/owner/support':'/staff/support';
  route('get',base,async(ctx,s)=>page(ctx,views.inbox(await s.list(actor(ctx),owner,ctx.query?.filter||'all'),owner,ctx.query?.filter||'all')));
  route('get',base+'/:id',async(ctx,s)=>{const t=await s.get(actor(ctx),Number(ctx.params.id),owner);const members=owner?await staffStore().list(actor(ctx)):[];const canReply=owner||(await staffStore().self(actor(ctx))).permissions.includes('support.reply');page(ctx,views.detail(t,members,owner,canReply,ctx.session.csrf_token));});
  route('post',base+'/:id/read',async(ctx,s)=>{await s.markRead(actor(ctx),Number(ctx.params.id),owner);redirect(ctx.res,base+'/'+Number(ctx.params.id));});
  route('post',base+'/:id/draft',async(ctx,s)=>{await s.saveDraft(actor(ctx),Number(ctx.params.id),Number(ctx.body.version),ctx.body.body_text,owner);redirect(ctx.res,base+'/'+Number(ctx.params.id));});
  if(owner)route('post',base+'/:id/manage',async(ctx,s)=>{await s.update(actor(ctx),Number(ctx.params.id),Number(ctx.body.version),ctx.body);redirect(ctx.res,base+'/'+Number(ctx.params.id));});
 }
};
