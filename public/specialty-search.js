'use strict';
(() => {
  const dialog = document.getElementById('specialty-search');
  const launch = document.querySelector('[data-specialty-open]');
  if (!dialog || !launch || typeof dialog.show !== 'function') return;
  const dismissalKey = 'gobookr-specialty-chat-dismissed';
  let timer;
  function open(focusInput) {
    if (dialog.open) return;
    const home = document.querySelector('.home-search-card form');
    const city = dialog.querySelector('[name="city"]');
    const query = dialog.querySelector('[name="q"]');
    if (!city.value) city.value = home?.querySelector('[name="city"]')?.value || '';
    if (!query.value) query.value = home?.querySelector('[name="q"]')?.value || '';
    const previousFocus = document.activeElement;
    dialog.show();
    launch.setAttribute('aria-expanded', 'true');
    if (focusInput) query.focus();
    else previousFocus?.focus({ preventScroll: true });
  }
  function close() {
    clearTimeout(timer);
    dialog.close();
    launch.setAttribute('aria-expanded', 'false');
    try { sessionStorage.setItem(dismissalKey, '1'); } catch (_) {}
    launch.focus({ preventScroll: true });
  }
  launch.addEventListener('click', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    if (dialog.open) close(); else open(true);
  });
  dialog.querySelector('.specialty-search-close').addEventListener('click', close);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(dismissalKey) === '1'; } catch (_) {}
  if (!dismissed) timer = setTimeout(() => open(false), 2500);
})();
