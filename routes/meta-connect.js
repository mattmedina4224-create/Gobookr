'use strict';
const crypto=require('node:crypto');
const db=require('../db');
const meta=require('../lib/meta-connect');
const {layout}=require('../lib/layout');
const {send,redirect,flashFromQuery}=require('../lib/http');
const {escapeHtml:e}=require('../lib/util');
const {dashboardNav}=require('../lib/pro-dashboard-view');
const PATH='/dashboard/pro/social';
function owner(ctx){
  if(!ctx.currentUser){redirect(ctx.res,'/login?next='+encodeURIComponent(PATH));return null;}
  if(ctx.currentUser.role!=='pro'){send(ctx.res,'Professional account required.',403);return null;}
  const profile=db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(ctx.currentUser.id);
  if(!profile)send(ctx.res,'Professional profile not found.',404);return profile;
}
function back(ctx,message,success=false){redirect(ctx.res,PATH+'?'+(success?'success':'error')+'='+encodeURIComponent(message));}
function choices(profile,ctx){
  const row=db.prepare('WITH choices AS (SELECT * FROM meta_connection_choices WHERE pro_id = ? AND user_id = ? AND session_hash = ? AND expires_at > CURRENT_TIMESTAMP) SELECT * FROM choices').get(profile.id,ctx.currentUser.id,meta.sessionHash(ctx));
  return row?meta.decrypt(row.encrypted_choices,`${profile.id}:${row.session_hash}:choices`):null;
}
module.exports=function(router){
  router.get(PATH,async ctx=>{
    const profile=owner(ctx);if(!profile)return;
    const connection=db.prepare('WITH connection AS (SELECT page_id,page_name,instagram_id,expires_at,connected_at FROM meta_connections WHERE pro_id = ? AND user_id = ?) SELECT * FROM connection').get(profile.id,ctx.currentUser.id);
    let available=null; if(meta.canConnect(profile.id))try{available=choices(profile,ctx);}catch(_){/* no raw token errors */}
    const csrf=`<input type="hidden" name="_csrf" value="${e(ctx.session.csrf_token)}">`;
    const nav=dashboardNav('social',[{key:'overview',label:'Overview',href:'/dashboard/pro'},{key:'marketing',label:'Marketing Center',href:'/dashboard/pro/marketing'},{key:'social',label:'Social connections',href:PATH}]);
    const valid=connection&&new Date(connection.expires_at).getTime()>Date.now();
    const body=`<section class="section container pro-dashboard"><div class="dash-layout">${nav}<div class="pro-main"><h1>Facebook &amp; Instagram connections</h1><p>Connect an authorized Facebook Page and its linked Instagram account. Choose the destination yourself; GoBookr never asks for your social password.</p>
      <div class="panel"><h2>Connection foundation · testing only</h2><p>Automatic publishing is not enabled yet. We must finish real-account tests and Meta approval before launch. <a href="/dashboard/pro/marketing">Assisted Story sharing works now.</a></p></div>
      ${connection?`<div class="panel"><h2>${valid?'Authorized test connection':'Reconnect required'}</h2><p>Facebook Page: <strong>${e(connection.page_name)}</strong></p><p>Instagram: ${connection.instagram_id?'Linked account authorized; Story eligibility still needs testing.':'No linked Instagram account authorized.'}</p><p class="muted">This connection does not enable automatic posting.</p><form method="POST" action="${PATH}/disconnect">${csrf}<button class="btn secondary" type="submit">Disconnect from GoBookr</button></form><p class="muted">Disconnect removes GoBookr’s stored credentials. You can also remove GoBookr in Meta’s app settings.</p></div>`:''}
      ${available?`<div class="panel"><h2>Choose your publishing Page</h2><p>Select the Page you intend to use. GoBookr will not publish anything during connection setup.</p>${available.more?'<p class="muted">Showing the first 50 authorized Pages. If yours is missing, reconnect and narrow the Pages you authorize.</p>':''}<form method="POST" action="${PATH}/select">${csrf}<div class="field"><label for="meta-page">Facebook Page</label><select id="meta-page" name="page_id" required>${available.pages.map(p=>`<option value="${e(p.id)}">${e(p.name)}${p.instagramId?' · Instagram linked':''}</option>`).join('')}</select></div><label><input type="checkbox" name="confirm_account" value="1" required style="width:auto"> I manage this Page and want to connect it for GoBookr testing.</label><button class="btn" type="submit">Confirm test connection</button></form></div>`:''}
      <div class="panel"><h2>${meta.canConnect(profile.id)?'Connect your test accounts':'Meta setup in progress'}</h2>${meta.canConnect(profile.id)?`<form method="POST" action="${PATH}/connect">${csrf}<button class="btn" type="submit">Authorize Facebook &amp; linked Instagram</button></form>`:'<p>Connections are not available for this account yet. Assisted sharing remains available.</p>'}<p>Only explicitly selected test professionals can connect. Automatic posting remains off.</p></div>
      <details class="panel"><summary>Launch setup checklist</summary><ol><li>Create the GoBookr Meta developer app and choose its supported Graph API version.</li><li>Configure credentials securely on the server and register the callback URL below.</li><li>Use a Facebook Page linked to an Instagram Business account for Story tests.</li><li>Authorize a designated test professional and confirm the correct Page.</li><li>Finish publishing, reconnect, and disconnect tests; submit required access for Meta review.</li></ol><p>Callback URL: <code>${e(meta.settings().callback||'Set a valid HTTPS APP_URL first')}</code></p><p>Never paste App Secrets, tokens, or passwords into GoBookr forms or chat.</p></details>
      </div></div></section>`;
    send(ctx.res,layout({title:'Social connections',currentUser:ctx.currentUser,session:ctx.session,flash:flashFromQuery(ctx.query),robots:'noindex, nofollow',body}));
  });
  router.post(PATH+'/connect',async ctx=>{
    const profile=owner(ctx);if(!profile)return;if(!meta.canConnect(profile.id))return back(ctx,'Meta test connections are not enabled for this account.');
    const session=meta.sessionHash(ctx),state=crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM meta_connection_choices WHERE pro_id = ? AND user_id = ?').run(profile.id,ctx.currentUser.id);
    db.prepare('DELETE FROM meta_oauth_states WHERE pro_id = ? OR expires_at <= CURRENT_TIMESTAMP').run(profile.id);
    db.prepare("INSERT INTO meta_oauth_states(state_hash,pro_id,user_id,session_hash,expires_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP + INTERVAL '10 minutes')").run(meta.fingerprint(state),profile.id,ctx.currentUser.id,session);
    redirect(ctx.res,meta.authorizationUrl(state));
  });
  router.get('/integrations/meta/callback',async ctx=>{
    ctx.res.setHeader?.('Cache-Control','no-store');ctx.res.setHeader?.('Referrer-Policy','no-referrer');
    const profile=owner(ctx);if(!profile)return;
    if(!meta.canConnect(profile.id))return back(ctx,'Meta test connections are not enabled.');
    const state=typeof ctx.query.state==='string'?ctx.query.state:'';
    if(!/^[a-f0-9]{64}$/.test(state))return back(ctx,'Connection expired. Please start again.');
    const session=meta.sessionHash(ctx);
    const consumed=db.prepare('DELETE FROM meta_oauth_states WHERE state_hash = ? AND pro_id = ? AND user_id = ? AND session_hash = ? AND expires_at > CURRENT_TIMESTAMP RETURNING pro_id').get(meta.fingerprint(state),profile.id,ctx.currentUser.id,session);
    if(!consumed)return back(ctx,'Connection expired. Please start again.');
    if(ctx.query.error||typeof ctx.query.code!=='string'||!ctx.query.code||ctx.query.code.length>4000)return back(ctx,'Meta authorization was cancelled or incomplete. Nothing was connected.');
    try{
      const result=await meta.discoverPages(ctx.query.code);
      const stillOwned=db.prepare('SELECT id FROM pro_profiles WHERE id = ? AND user_id = ?').get(profile.id,ctx.currentUser.id);if(!stillOwned)return back(ctx,'Profile access changed. Nothing was connected.');
      const encrypted=meta.encrypt(result,`${profile.id}:${session}:choices`);
      db.prepare("INSERT INTO meta_connection_choices(pro_id,user_id,session_hash,encrypted_choices,expires_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP + INTERVAL '10 minutes') ON CONFLICT(pro_id) DO UPDATE SET user_id=EXCLUDED.user_id,session_hash=EXCLUDED.session_hash,encrypted_choices=EXCLUDED.encrypted_choices,expires_at=EXCLUDED.expires_at").run(profile.id,ctx.currentUser.id,session,encrypted);
      back(ctx,'Authorization received. Choose the Page you want to connect.',true);
    }catch(_){back(ctx,'Meta authorization could not be completed. Check Page access and permissions, then retry.');}
  });
  router.post(PATH+'/select',async ctx=>{
    const profile=owner(ctx);if(!profile)return;if(!meta.canConnect(profile.id))return back(ctx,'Meta test connections are not enabled.');
    if(ctx.body.confirm_account!=='1')return back(ctx,'Confirm the account you want to connect.');
    const session=meta.sessionHash(ctx);let selected;
    try{selected=choices(profile,ctx)?.pages.find(p=>p.id===String(ctx.body.page_id));}catch(_){}
    if(!selected||new Date(selected.expiresAt).getTime()<=Date.now())return back(ctx,'Choose an authorized Page, or reconnect if authorization expired.');
    try{
      const encrypted=meta.encrypt({token:selected.token},`${profile.id}:${selected.id}:connection`);
      db.exec('BEGIN');
      const consumed=db.prepare('DELETE FROM meta_connection_choices WHERE pro_id = ? AND user_id = ? AND session_hash = ? AND expires_at > CURRENT_TIMESTAMP RETURNING pro_id').get(profile.id,ctx.currentUser.id,session);if(!consumed)throw Error('Choices expired');
      db.prepare('INSERT INTO meta_connections(pro_id,user_id,page_id,page_name,instagram_id,encrypted_token,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(pro_id) DO UPDATE SET user_id=EXCLUDED.user_id,page_id=EXCLUDED.page_id,page_name=EXCLUDED.page_name,instagram_id=EXCLUDED.instagram_id,encrypted_token=EXCLUDED.encrypted_token,expires_at=EXCLUDED.expires_at,connected_at=CURRENT_TIMESTAMP').run(profile.id,ctx.currentUser.id,selected.id,selected.name,selected.instagramId,encrypted,selected.expiresAt);
      db.exec('COMMIT');back(ctx,'Test connection saved. Automatic publishing is still off.',true);
    }catch(_){try{db.exec('ROLLBACK');}catch(_){}back(ctx,'Connection could not be saved. Please reconnect.');}
  });
  router.post(PATH+'/disconnect',async ctx=>{
    const profile=owner(ctx);if(!profile)return;
    db.exec('BEGIN');try{
      db.prepare('DELETE FROM meta_connections WHERE pro_id = ? AND user_id = ?').run(profile.id,ctx.currentUser.id);
      db.prepare('DELETE FROM meta_connection_choices WHERE pro_id = ? AND user_id = ?').run(profile.id,ctx.currentUser.id);
      db.prepare('DELETE FROM meta_oauth_states WHERE pro_id = ? AND user_id = ?').run(profile.id,ctx.currentUser.id);
      db.exec('COMMIT');back(ctx,'GoBookr’s stored connection credentials were removed. Remove the app in Meta settings too if desired.',true);
    }catch(_){db.exec('ROLLBACK');back(ctx,'Could not disconnect. Please try again.');}
  });
};
