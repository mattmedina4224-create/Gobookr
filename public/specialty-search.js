'use strict';
(() => {
  const dialog = document.getElementById('specialty-search');
  const launch = document.querySelector('[data-specialty-open]');
  if (!dialog || !launch || typeof dialog.show !== 'function') return;
  function open() {
    if (dialog.open) return;
    const home = document.querySelector('.home-search-card form');
    const city = dialog.querySelector('[name="city"]');
    const query = dialog.querySelector('[name="q"]');
    if (!city.value) city.value = home?.querySelector('[name="city"]')?.value || '';
    if (!query.value) query.value = home?.querySelector('[name="q"]')?.value || '';
    dialog.show();
    launch.setAttribute('aria-expanded', 'true');
    query.focus();
  }
  function close() {
    dialog.close();
    launch.setAttribute('aria-expanded', 'false');
    launch.focus({ preventScroll: true });
  }
  launch.addEventListener('click', (event) => {
    event.preventDefault();
    if (dialog.open) close(); else open();
  });
  dialog.querySelector('.specialty-search-close').addEventListener('click', close);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
})();
