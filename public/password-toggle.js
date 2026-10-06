'use strict';
(() => {
  if (window.gobookrPasswordToggleReady) return;
  window.gobookrPasswordToggleReady = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.password-toggle[data-password-target]');
    if (!button) return;
    const input = document.getElementById(button.dataset.passwordTarget);
    if (!input || !['password', 'text'].includes(input.type)) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(show));
    const open = button.querySelector('.eye-open');
    const off = button.querySelector('.eye-off');
    if (open) open.style.display = show ? 'none' : 'block';
    if (off) off.style.display = show ? 'block' : 'none';
  });
})();
