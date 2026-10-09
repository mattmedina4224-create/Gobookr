'use strict';
const db=require('../db');
const {randomUUID}=require('node:crypto');
const stripe=require('./business-team-stripe');
const {isProfessionalPrice,normalizedSubscriptionStatus,unixToSqlite}=require('./stripe');
function enabled() { return process.env.BUSINESS_TEAMS_ENABLED==='1'; }
function email(value) { const v=String(value||'').trim().toLowerCase(); if(v.length>254||!/^\S+@\S+\.\S+$/.test(v)) throw Error('Enter a valid GoBookr email.'); return v; }
function plan(shopId) { return db.prepare('SELECT * FROM business_team_plans WHERE shop_id=?').get(shopId); }
function ensurePlan(shopId) { db.prepare('INSERT INTO business_team_plans(shop_id) VALUES (?) ON CONFLICT DO NOTHING').run(shopId); return plan(shopId); }
function members(shopId) { return db.prepare(`SELECT m.*,p.business_name,p.initials,p.onboarding_completed,s.stripe_subscription_id,s.status AS personal_status FROM business_team_members m LEFT JOIN pro_profiles p ON p.id=m.pro_id LEFT JOIN subscriptions s ON s.pro_id=p.id WHERE m.shop_id=? AND m.status IN ('pending','accepted') ORDER BY m.id`).all(shopId); }
function personalBillingConflict(m) { return Boolean(m.stripe_subscription_id && !['canceled','incomplete_expired'].includes(m.personal_status||m.status)); }
function invite(shopId,value) {
 const target=email(value);
 db.prepare("UPDATE business_team_members SET status='removed',covered=0 WHERE shop_id=? AND email=? AND status='pending' AND expires_at<CURRENT_TIMESTAMP").run(shopId,target);
 const row=db.prepare(`INSERT INTO business_team_members(shop_id,email) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM business_team_members WHERE shop_id=? AND email=? AND status IN ('pending','accepted')) ON CONFLICT DO NOTHING RETURNING id`).get(shopId,target,shopId,target);
 return Boolean(row);
}
function accept(user,id) {
 const target=email(user.email);
 const p=db.prepare("SELECT p.*,s.stripe_subscription_id,s.status AS personal_status FROM pro_profiles p LEFT JOIN subscriptions s ON s.pro_id=p.id WHERE p.user_id=? AND p.claim_status='claimed'").get(user.id);
 if(!p || user.role!=='pro') throw Error('Set up or claim your professional account before accepting this invitation.');
 if(personalBillingConflict(p)) throw Error('Your individual subscription is still connected. Cancel it in Billing and return after it ends to avoid paying twice.');
 try {
 const row=db.prepare(`WITH reserved AS (UPDATE subscriptions SET billing_owner='business' WHERE pro_id=? AND billing_owner='personal' AND (personal_checkout_until IS NULL OR personal_checkout_until<CURRENT_TIMESTAMP) AND (stripe_subscription_id IS NULL OR stripe_subscription_id='' OR status IN ('canceled','incomplete_expired')) AND EXISTS(SELECT 1 FROM business_team_members m JOIN shops s ON s.id=m.shop_id WHERE m.id=? AND m.email=? AND m.status='pending' AND m.expires_at>CURRENT_TIMESTAMP AND s.claim_status='claimed') RETURNING pro_id) UPDATE business_team_members SET status='accepted',pro_id=reserved.pro_id,accepted_at=CURRENT_TIMESTAMP FROM reserved WHERE business_team_members.id=? RETURNING business_team_members.id`).get(p.id,id,target,id);
 if(!row) throw Error('This invitation has expired or is no longer available.');
 } catch(err) { if(err.code==='23505' || /business_team_one_business/.test(err.message)) throw Error('You already belong to a business team. Leave that team before joining another.'); throw err; }
}
function acquire(shopId,action) {
 const key=randomUUID();
 const row=db.prepare(`UPDATE business_team_plans SET operation_key=COALESCE(operation_key,?),operation_payload=COALESCE(operation_payload,?::jsonb),operation_started_at=COALESCE(operation_started_at,CURRENT_TIMESTAMP),operation_until=CURRENT_TIMESTAMP+INTERVAL '60 seconds' WHERE shop_id=? AND (operation_until IS NULL OR operation_until<CURRENT_TIMESTAMP) RETURNING *`).get(key,JSON.stringify(action),shopId);
 if(!row) throw Error('A team billing change is already in progress. Try again shortly.');
 const old=row.operation_payload;
 if(old.kind!==action.kind || old.memberId!==action.memberId) { release(shopId); throw Error('Retry the previous billing change before starting another.'); }
 if(Date.now()-new Date(row.operation_started_at).getTime()>23*3600000) {release(shopId);throw Error('This billing change needs reconciliation before retrying. Your existing team has been preserved.');}
 return row;
}
function release(shopId,complete=false) { db.prepare(`UPDATE business_team_plans SET operation_until=NULL${complete?',operation_key=NULL,operation_payload=NULL,operation_started_at=NULL':''} WHERE shop_id=?`).run(shopId); }
function sync(subscription) {
 const shopId=Number(subscription.metadata?.business_team_shop_id);
 if(!Number.isSafeInteger(shopId)||shopId<1) return false;
 const local=plan(shopId); if(!local) return true;
 if(local.subscription_id && local.subscription_id!==subscription.id) return true;
 if(!local.subscription_id && subscription.metadata?.business_team_key!==local.checkout_key) return true;
 const item=subscription.items?.data?.[0];
 if(subscription.items?.data?.length!==1 || !isProfessionalPrice(item?.price)) throw Error('Invalid team subscription price.');
 const quantity=Number(item.quantity); if(!Number.isInteger(quantity)||quantity<1||quantity>500) throw Error('Invalid team quantity.');
 const status=normalizedSubscriptionStatus(subscription.status);
 const pastDue=['past_due','unpaid'].includes(status)?(local.past_due_since||new Date().toISOString()):null;
 const ids=Array.isArray(local.checkout_members)?local.checkout_members:JSON.parse(local.checkout_members||'[]');
 db.prepare(`WITH updated AS (UPDATE business_team_plans SET subscription_id=?,customer_id=?,quantity=?,status=?,current_period_end=?,trial_ends_at=?,past_due_since=?,cancel_at_period_end=?,updated_at=CURRENT_TIMESTAMP WHERE shop_id=? RETURNING shop_id)
 UPDATE business_team_members SET covered=1 WHERE shop_id IN (SELECT shop_id FROM updated) AND status='accepted' AND id IN (SELECT jsonb_array_elements_text(?::jsonb)::bigint) AND ? IN ('active','trialing') AND ? >= ?`).run(subscription.id,typeof subscription.customer==='object'?subscription.customer.id:subscription.customer,quantity,status,unixToSqlite(subscription.current_period_end||item.current_period_end),unixToSqlite(subscription.trial_end),pastDue,subscription.cancel_at_period_end?1:0,shopId,JSON.stringify(ids),status,quantity,ids.length);
 return true;
}
async function activate(shopId,ownerEmail) {
 let existing=ensurePlan(shopId);
 if(existing.checkout_id && !existing.subscription_id) {
   const session=await stripe.retrieveCheckout(existing.checkout_id);
   if(session.status==='open') return session.url;
   if(session.status==='complete') { sync(await stripe.retrieveSubscription(session.subscription)); existing=plan(shopId); }
 }
 const accepted=members(shopId).filter(m=>m.status==='accepted');
 if(!accepted.length) throw Error('Invite a professional and wait for acceptance first.');
 if(accepted.some(personalBillingConflict)) throw Error('A team member has an individual subscription. Resolve it before sponsoring their membership.');
 const state=acquire(shopId,{kind:'activate',ids:accepted.map(m=>Number(m.id)),quantity:accepted.length,email:ownerEmail,expiresAt:Math.floor(Date.now()/1000)+3600,customerId:existing.customer_id});
 try {
 const action=state.operation_payload,ids=action.ids;
 // Retries use exactly the original parameters and membership snapshot.
 db.prepare('UPDATE business_team_plans SET checkout_members=?::jsonb,checkout_key=? WHERE shop_id=?').run(JSON.stringify(ids),state.operation_key,shopId);
 if(state.subscription_id && !['canceled','incomplete_expired'].includes(state.status)) {
   const sub=await stripe.updateQuantity({subscriptionId:state.subscription_id,quantity:action.quantity,key:state.operation_key});
   sync(sub);release(shopId,true);return null;
 }
 if(state.subscription_id) {
   const previous=await stripe.retrieveSubscription(state.subscription_id);
   if(!['canceled','incomplete_expired'].includes(previous.status)) throw Error('Your previous team subscription is still connected. Refresh billing before restarting.');
   db.prepare('UPDATE business_team_plans SET subscription_id=NULL,checkout_id=NULL,checkout_url=NULL,checkout_expires_at=NULL WHERE shop_id=?').run(shopId);
 }
 if(state.checkout_id && state.checkout_url && new Date(state.checkout_expires_at).getTime()>Date.now()) { release(shopId,true);return state.checkout_url; }
 const session=await stripe.checkout({shopId,email:action.email,quantity:action.quantity,key:state.operation_key,expiresAt:action.expiresAt,customerId:action.customerId});
 if(!session.url||!session.id) throw Error('Secure checkout did not return a session.');
 db.prepare('UPDATE business_team_plans SET checkout_id=?,checkout_url=?,checkout_expires_at=? WHERE shop_id=?').run(session.id,session.url,new Date(session.expires_at*1000).toISOString(),shopId);
 release(shopId,true);return session.url;
 } catch(err) {release(shopId);throw err;}
}
async function remove(shopId,memberId) {
 ensurePlan(shopId);
 const state=acquire(shopId,{kind:'remove',memberId:Number(memberId)});
 try {
 const m=db.prepare("SELECT * FROM business_team_members WHERE id=? AND shop_id=? AND status IN ('pending','accepted')").get(memberId,shopId);
 if(!m) { release(shopId,true);return; }
 if(state.checkout_id && !state.subscription_id && new Date(state.checkout_expires_at).getTime()>Date.now()) {
   await stripe.expireCheckout(state.checkout_id,state.operation_key+'-expire');
   db.prepare('UPDATE business_team_plans SET checkout_id=NULL,checkout_url=NULL,checkout_expires_at=NULL,checkout_key=NULL,checkout_members=\'[]\' WHERE shop_id=?').run(shopId);
 }
 if(m.covered && state.subscription_id && !['canceled','incomplete_expired'].includes(state.status)) {
   const count=db.prepare("SELECT count(*) AS n FROM business_team_members WHERE shop_id=? AND status='accepted' AND covered=1 AND id<>?").get(shopId,memberId).n;
   const action=state.operation_payload;
   const target=action.quantity==null?Number(count):action.quantity;
   if(action.quantity==null) db.prepare("UPDATE business_team_plans SET operation_payload=jsonb_set(operation_payload,'{quantity}',to_jsonb(?::integer)) WHERE shop_id=?").run(target,shopId);
   const sub=await stripe.updateQuantity({subscriptionId:state.subscription_id,quantity:target,key:state.operation_key,decreaseOnly:true});
   sync(sub);
 }
 db.prepare("WITH removed AS (UPDATE business_team_members SET status='removed',covered=0 WHERE id=? AND shop_id=? RETURNING pro_id) UPDATE subscriptions SET billing_owner='personal' WHERE pro_id IN (SELECT pro_id FROM removed)").run(memberId,shopId);
 release(shopId,true);
 } catch(err) { release(shopId);throw err; }
}
// A paid quantity is a hard upper bound even if a Stripe portal reduces seats.
const coverageSql=`SELECT eligible.pro_id,eligible.shop_id,s.name AS business_name,b.status,b.trial_ends_at,b.past_due_since,b.updated_at FROM (SELECT pro_id,shop_id,ROW_NUMBER() OVER(PARTITION BY shop_id ORDER BY id) AS seat FROM business_team_members WHERE status='accepted' AND covered=1) eligible JOIN business_team_plans b ON b.shop_id=eligible.shop_id JOIN shops s ON s.id=eligible.shop_id WHERE s.claim_status='claimed' AND eligible.seat<=b.quantity AND b.subscription_id IS NOT NULL AND (b.status='active' OR (b.status='trialing' AND b.trial_ends_at>CURRENT_TIMESTAMP) OR (b.status IN ('past_due','unpaid') AND b.past_due_since>CURRENT_TIMESTAMP-INTERVAL '7 days'))`;
function coverage(proIds) { if(!enabled()||!proIds.length)return [];return db.prepare(coverageSql+' AND eligible.pro_id IN ('+proIds.map(()=>'?').join(',')+')').all(...proIds); }
function membership(proId) { if(!enabled())return null;return db.prepare("SELECT m.*,s.name AS business_name FROM business_team_members m JOIN shops s ON s.id=m.shop_id WHERE m.pro_id=? AND m.status='accepted'").get(proId); }
function reservePersonalCheckout(proId) { if(!enabled())return;const row=db.prepare("UPDATE subscriptions SET personal_checkout_until=CURRENT_TIMESTAMP+INTERVAL '24 hours' WHERE pro_id=? AND billing_owner='personal' AND (personal_checkout_until IS NULL OR personal_checkout_until<CURRENT_TIMESTAMP) RETURNING pro_id").get(proId);if(!row)throw Error('A business sponsorship or personal checkout is already pending. Review Billing before trying again.'); }
function inbox(user) {return db.prepare(`SELECT m.*,s.name AS business_name FROM business_team_members m JOIN shops s ON s.id=m.shop_id WHERE m.email=? AND m.status IN ('pending','accepted') AND s.claim_status='claimed' AND (m.status='accepted' OR m.expires_at>CURRENT_TIMESTAMP) ORDER BY m.id DESC`).all(email(user.email));}
function inboxBanner(user) { if(!enabled()||user?.role!=='pro')return '';const n=inbox(user).filter(m=>m.status==='pending').length;return n?`<div class="container"><div class="alert" role="status"><strong>${n} business team invitation${n===1?'':'s'}</strong> <a href="/dashboard/pro/team">Review invitations</a></div></div>`:''; }
module.exports={enabled,email,plan,ensurePlan,members,personalBillingConflict,invite,accept,activate,remove,sync,coverage,coverageSql,inbox,inboxBanner,membership,reservePersonalCheckout};
