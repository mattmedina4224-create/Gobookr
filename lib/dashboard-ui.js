'use strict';
// Shared dashboard UI: app shell (sidebar + mobile drawer), page headers, stat tiles, cards and empty states.
// Pure rendering. Styles: public/dashboard-app.css; behavior: public/dashboard-app.js. Use these for every
// owner-facing workspace (business dashboard today; Business Pro, Career Studio and Merch Studio next).
const { escapeHtml: e } = require('./util');

// Lucide icons (ISC License, https://lucide.dev), 24px grid, stroke 2.
const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  briefcase: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  switch: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  account: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  click: '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  verified: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  circle: '<circle cx="12" cy="12" r="10"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};
function icon(name, size = 18) {
  return `<svg class="gbd-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.circle}</svg>`;
}

const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'GB';

// Who is being managed right now, and where the other workspace is. Always two clearly labelled destinations.
function workspaceSwitch({ active, business, pro }) {
  const items = [];
  if (business) items.push({ key: 'business', href: business.href, title: business.name, kind: 'Business dashboard', logo: business.logo });
  if (pro) items.push({ key: 'pro', href: pro.href, title: pro.name, kind: 'Personal pro dashboard', logo: pro.photo });
  const current = items.find((i) => i.key === active) || items[0];
  if (!current) return '';
  const other = items.filter((i) => i !== current);
  const avatar = (i) => `<span class="gbd-ws-avatar gbd-ws-${i.key}">${i.logo ? `<img src="${e(i.logo)}" alt="">` : e(initials(i.title))}</span>`;
  return `<div class="gbd-ws" data-ws>
    <div class="gbd-ws-current">${avatar(current)}<span class="gbd-ws-text"><strong>${e(current.title)}</strong><small>${e(current.kind)}</small></span></div>
    ${other.map((i) => `<a class="gbd-ws-switch" href="${e(i.href)}">${icon('switch', 16)}<span>Switch to <strong>${e(i.title)}</strong><small>${e(i.kind)}</small></span></a>`).join('')}
  </div>`;
}

function navItem(item, active) {
  const current = item.key === active;
  const ext = item.external ? ' target="_blank" rel="noopener"' : '';
  const tag = item.soon ? `<span class="gbd-nav-tag">${e(item.soon)}</span>` : '';
  if (item.form) {
    return `<li><form method="POST" action="${e(item.href)}" class="gbd-nav-form">${item.form}<button type="submit" class="gbd-nav-link">${icon(item.icon)}<span>${e(item.label)}</span></button></form></li>`;
  }
  return `<li><a class="gbd-nav-link${current ? ' is-active' : ''}" href="${e(item.href)}"${current ? ' aria-current="page"' : ''}${ext}>${icon(item.icon)}<span>${e(item.label)}</span>${tag}${item.external ? icon('external', 14) : ''}</a></li>`;
}

// groups: [{ label, items: [{ key, label, href, icon, external?, soon?, form? }] }]
function sidebar({ id = 'gbd-nav', label, switcher = '', groups, active }) {
  return `<aside class="gbd-sidebar" id="${id}" aria-label="${e(label)}" data-drawer>
    <div class="gbd-drawer-head"><span>${e(label)}</span><button type="button" class="gbd-iconbtn" data-drawer-close aria-label="Close menu">${icon('close', 20)}</button></div>
    ${switcher}
    <nav class="gbd-nav" aria-label="${e(label)}">${groups.map((g) => `<div class="gbd-nav-group"><p class="gbd-nav-label">${e(g.label)}</p><ul>${g.items.map((i) => navItem(i, active)).join('')}</ul></div>`).join('')}</nav>
  </aside>`;
}

// The page frame. mobileTitle labels the fixed mobile bar so people always know where they are.
function shell({ sidebarHtml, mobileTitle, mobileContext = '', mobileAction = '', content, navId = 'gbd-nav' }) {
  return `<link rel="stylesheet" href="/dashboard-app.css?v=2">
  <div class="gbd" data-gbd>
    <div class="gbd-mobilebar">
      <button type="button" class="gbd-menubtn" data-drawer-open aria-controls="${navId}" aria-expanded="false">${icon('menu', 20)}<span class="gbd-visually-hidden">Open menu</span></button>
      <div class="gbd-mobilebar-title"><strong>${e(mobileTitle)}</strong>${mobileContext ? `<small>${e(mobileContext)}</small>` : ''}</div>
      ${mobileAction}
    </div>
    <div class="gbd-scrim" data-drawer-close hidden></div>
    ${sidebarHtml}
    <div class="gbd-main" id="gbd-main" tabindex="-1">${content}</div>
  </div>
  <script src="/dashboard-app.js?v=1" defer></script>`;
}

function pageHeader({ title, description = '', actions = '' }) {
  return `<header class="gbd-pagehead"><div><h1>${e(title)}</h1>${description ? `<p>${description}</p>` : ''}</div>${actions ? `<div class="gbd-pagehead-actions">${actions}</div>` : ''}</header>`;
}

// value may be a number or a short string; note explains where the number comes from.
function stat({ label, value, note = '', iconName, href = '' }) {
  const inner = `<div class="gbd-stat-top"><span>${e(label)}</span>${iconName ? icon(iconName, 16) : ''}</div><strong class="gbd-stat-value">${e(String(value))}</strong>${note ? `<p class="gbd-stat-note">${note}</p>` : ''}`;
  return href ? `<a class="gbd-stat gbd-stat-link" href="${e(href)}">${inner}</a>` : `<div class="gbd-stat">${inner}</div>`;
}

function card({ title = '', description = '', action = '', body, className = '' }) {
  const head = title ? `<div class="gbd-card-head"><div><h2>${e(title)}</h2>${description ? `<p>${description}</p>` : ''}</div>${action}</div>` : '';
  return `<section class="gbd-card ${className}">${head}${body}</section>`;
}

function emptyState({ iconName = 'circle', title, text, action = '' }) {
  return `<div class="gbd-empty">${icon(iconName, 22)}<p class="gbd-empty-title">${e(title)}</p><p>${text}</p>${action}</div>`;
}

function badge(text, tone = 'neutral') {
  return `<span class="gbd-badge gbd-badge-${tone}">${e(text)}</span>`;
}

module.exports = { icon, ICONS, initials, workspaceSwitch, sidebar, shell, pageHeader, stat, card, emptyState, badge };
