'use strict';
(() => {
  const header = document.querySelector('.site-header');
  const button = header && header.querySelector('.mobile-menu-toggle');
  const nav = header && header.querySelector('#site-navigation');
  if (!button || !nav) return;
  const mobile = window.matchMedia('(max-width: 720px)');
  function setOpen(open) {
    header.toggleAttribute('data-nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  button.hidden = false;
  header.setAttribute('data-nav-ready', '');
  button.addEventListener('click', () => setOpen(!header.hasAttribute('data-nav-open')));
  document.addEventListener('click', (event) => {
    if (!header.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.hasAttribute('data-nav-open')) {
      setOpen(false);
      button.focus();
    }
  });
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  header.addEventListener('focusout', (event) => {
    if (!header.contains(event.relatedTarget)) setOpen(false);
  });
  mobile.addEventListener('change', () => setOpen(false));
})();
