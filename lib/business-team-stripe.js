'use strict';
const { stripeRequest, professionalPriceId, cleanBaseUrl, retrieveSubscription, isProfessionalPrice, businessTeamBillingConfigured } = require('./stripe');
function seats(n) { if (!Number.isInteger(n) || n < 1 || n > 500) throw Error('Choose between 1 and 500 professionals.'); return n; }
async function checkout({shopId,email,quantity,key,expiresAt,customerId}) {
  if(!businessTeamBillingConfigured()) throw Error('Team payment setup is unavailable. Your team information is saved.');
  seats(quantity);
  if (/\.test$/i.test(String(email))) throw Error('Demo accounts cannot start paid billing.');
  const base=cleanBaseUrl(); if (!base) throw Error('Secure billing is unavailable.');
  return stripeRequest('/checkout/sessions', {mode:'subscription', ...(customerId?{customer:customerId}:{customer_email:email}),
    'line_items[0][price]':await professionalPriceId(),'line_items[0][quantity]':quantity,
    'metadata[business_team_shop_id]':shopId,'subscription_data[metadata][business_team_shop_id]':shopId,
    'subscription_data[metadata][business_team_key]':key,
    success_url:base+'/dashboard/shop/team?success='+encodeURIComponent('Checkout received. Your team plan activates after Stripe confirms payment.'),
    cancel_url:base+'/dashboard/shop/team?message='+encodeURIComponent('Checkout canceled. No sponsorship was activated.'),
    expires_at:expiresAt,
  },'POST',key);
}
async function updateQuantity({subscriptionId,quantity,key,decreaseOnly=false}) {
  if(!businessTeamBillingConfigured()) throw Error('Team payment setup is unavailable. Your existing team is preserved.');
  if (!Number.isInteger(quantity) || quantity<0 || quantity>500) throw Error('Invalid team size.');
  const subscription=await retrieveSubscription(subscriptionId);
  const items=subscription.items?.data || [];
  if(items.length!==1 || !isProfessionalPrice(items[0].price)) throw Error('The team plan must use the $20 monthly professional price.');
  if(!['active','trialing'].includes(subscription.status) && !(decreaseOnly && quantity<=Number(items[0].quantity) && ['past_due','unpaid','paused'].includes(subscription.status))) throw Error('Resolve the team payment issue before changing paid seats.');
  if(quantity===0) return stripeRequest('/subscriptions/'+subscriptionId,{cancel_at_period_end:true},'POST',key);
  return stripeRequest('/subscriptions/'+subscriptionId,{'items[0][id]':items[0].id,'items[0][quantity]':seats(quantity),proration_behavior:'none',cancel_at_period_end:false},'POST',key);
}
async function expireCheckout(id,key) { if(id) await stripeRequest('/checkout/sessions/'+encodeURIComponent(id)+'/expire',{},'POST',key); }
async function retrieveCheckout(id) { return stripeRequest('/checkout/sessions/'+encodeURIComponent(id),{},'GET'); }
module.exports={checkout,updateQuantity,expireCheckout,retrieveCheckout,retrieveSubscription};
