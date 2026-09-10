'use strict';

const db = require('../db');
const { getSubscription, graceDaysRemaining, isWithinGrace, isTrialActive } = require('./subscription');

function billingBannerForUser(currentUser) {
  if (!currentUser || currentUser.role !== 'pro') return '';

  try {
    const profile = db.prepare('SELECT id FROM pro_profiles WHERE user_id = ?').get(currentUser.id);
    if (!profile) return '';
    const subscription = getSubscription(profile.id);
    if (!subscription) return '';

    if (subscription.status === 'trialing' && !isTrialActive(subscription)) {
      return `<div class="container" style="padding-top:16px;"><div class="alert error" role="alert"><strong>Your 30-day free trial has ended.</strong> Your public profile is hidden until billing is activated. <a href="/dashboard/pro/billing" style="font-weight:800;">Set up billing</a></div></div>`;
    }

    if (!['past_due', 'unpaid'].includes(subscription.status)) return '';

    if (isWithinGrace(subscription)) {
      const days = graceDaysRemaining(subscription);
      return `<div class="container" style="padding-top:16px;"><div class="alert error" role="alert"><strong>Payment issue:</strong> We could not process your membership payment. You have ${days} day${days === 1 ? '' : 's'} left in your 7-day grace period before your public profile is temporarily hidden. <a href="/dashboard/pro/billing" style="font-weight:800;">Update billing</a></div></div>`;
    }

    return `<div class="container" style="padding-top:16px;"><div class="alert error" role="alert"><strong>Your public profile is temporarily hidden.</strong> Your payment grace period has ended. Update your payment method to restore your listing. <a href="/dashboard/pro/billing" style="font-weight:800;">Fix billing</a></div></div>`;
  } catch (err) {
    console.error('Could not build billing banner', err);
    return '';
  }
}

function installBillingBanner(layoutModule) {
  if (!layoutModule || typeof layoutModule.layout !== 'function' || layoutModule.__billingBannerInstalled) return;
  const baseLayout = layoutModule.layout;
  layoutModule.layout = (args) => {
    const banner = billingBannerForUser(args && args.currentUser);
    return baseLayout({ ...args, body: banner + String((args && args.body) || '') });
  };
  layoutModule.__billingBannerInstalled = true;
}

module.exports = { billingBannerForUser, installBillingBanner };
