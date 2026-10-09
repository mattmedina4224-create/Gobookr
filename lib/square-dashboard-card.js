'use strict';

function installSquareDashboardCard(layoutModule) {
  if (!layoutModule || typeof layoutModule.layout !== 'function' || layoutModule.__squareDashboardCardInstalled) return;
  const baseLayout = layoutModule.layout;
  layoutModule.layout = (args) => {
    let body = String((args && args.body) || '');
    if (args && args.title === 'Pro dashboard' && args.currentUser && args.currentUser.role === 'pro') {
      const card = `<details class="pro-schedule-extra"><summary>Use Square Appointments?</summary><p>Connect Square to find your bookable team members and add a booking link if your profile needs one.</p><a class="btn secondary" href="/dashboard/pro/square/connect">Connect Square</a></details>`;
      const marker = '</div></div></section>';
      const index = body.lastIndexOf(marker);
      body = index >= 0 ? body.slice(0, index) + card + body.slice(index) : body + card;
    }
    return baseLayout({ ...args, body });
  };
  layoutModule.__squareDashboardCardInstalled = true;
}

module.exports = { installSquareDashboardCard };
