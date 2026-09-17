'use strict';

function installSquareDashboardCard(layoutModule) {
  if (!layoutModule || typeof layoutModule.layout !== 'function' || layoutModule.__squareDashboardCardInstalled) return;
  const baseLayout = layoutModule.layout;
  layoutModule.layout = (args) => {
    let body = String((args && args.body) || '');
    if (args && args.title === 'Pro dashboard' && args.currentUser && args.currentUser.role === 'pro') {
      const card = `<div class="panel" style="margin-top:18px;"><h3>Connect Square</h3><p class="muted">Use Square Appointments? Connect your account to let GoBookr find your bookable team members and automatically add your Square booking link when your profile does not already have one.</p><a class="btn" href="/dashboard/pro/square/connect">Connect Square</a></div>`;
      const marker = '</div></div></section>';
      const index = body.lastIndexOf(marker);
      body = index >= 0 ? body.slice(0, index) + card + body.slice(index) : body + card;
    }
    return baseLayout({ ...args, body });
  };
  layoutModule.__squareDashboardCardInstalled = true;
}

module.exports = { installSquareDashboardCard };
