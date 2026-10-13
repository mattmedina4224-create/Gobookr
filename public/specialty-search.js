'use strict';
(() => {
  const dialog = document.getElementById('specialty-search');
  const launch = document.querySelector('[data-specialty-open]');
  if (!dialog || !launch || typeof dialog.showModal !== 'function') return;
  launch.addEventListener('click', (event) => {
    event.preventDefault();
    const home = document.querySelector('.home-search-card form');
    dialog.querySelector('[name="city"]').value = home?.querySelector('[name="city"]')?.value || '';
    dialog.querySelector('[name="q"]').value = home?.querySelector('[name="q"]')?.value || '';
    dialog.showModal();
    dialog.querySelector('[name="q"]').focus();
  });
  dialog.querySelector('.specialty-search-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => launch.focus());
})();
