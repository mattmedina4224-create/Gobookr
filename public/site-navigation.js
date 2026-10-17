'use strict';
(() => {
  const header = document.querySelector('.site-header');
  const button = header && header.querySelector('.mobile-menu-toggle');
  const nav = header && header.querySelector('#site-navigation');
  if (button && nav) {
    const mobile = window.matchMedia('(max-width: 720px)');
    function setOpen(open) {
      header.toggleAttribute('data-nav-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    button.hidden = false;
    header.setAttribute('data-nav-ready', '');
    button.addEventListener('click', () => setOpen(!header.hasAttribute('data-nav-open')));
    document.addEventListener('click', (event) => { if (!header.contains(event.target)) setOpen(false); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.hasAttribute('data-nav-open')) { setOpen(false); button.focus(); }
    });
    nav.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
    header.addEventListener('focusout', (event) => { if (!header.contains(event.relatedTarget)) setOpen(false); });
    mobile.addEventListener('change', () => setOpen(false));
  }

  // Keep claim/pro authentication behavior untouched. The plain /login entry is
  // the customer-facing sign-in experience, so give it a focused discovery UI.
  if (window.location.pathname !== '/login' || new URLSearchParams(window.location.search).has('claim')) return;
  const form = document.querySelector('form[action="/login"]');
  const panel = form && form.closest('.panel');
  const section = panel && panel.closest('.section.container');
  if (!form || !panel || !section) return;

  section.classList.add('customer-login-page');
  panel.classList.add('customer-login-card');
  const heading = panel.querySelector('h1');
  const intro = heading && heading.nextElementSibling;
  if (heading) heading.textContent = 'Sign in to GoBookr';
  if (intro && intro.matches('p')) intro.textContent = 'Save your favorite professionals and find them again anytime.';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'customer-login-eyebrow';
  eyebrow.textContent = 'Welcome back';
  if (heading) panel.insertBefore(eyebrow, heading);

  if (!panel.querySelector('.customer-login-signup')) {
    const signup = document.createElement('div');
    signup.className = 'customer-login-signup';
    signup.innerHTML = '<span>New to GoBookr?</span> <a href="/signup">Create a free account</a>';
    panel.appendChild(signup);
  }

  const style = document.createElement('style');
  style.textContent = `
    .customer-login-page{max-width:520px!important;padding-top:64px;padding-bottom:72px}
    .customer-login-card{border:1px solid #e5e7eb;border-radius:20px;padding:34px 34px 30px;box-shadow:0 12px 34px -24px rgba(15,23,42,.28);margin:0;background:#fff}
    .customer-login-eyebrow{font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:10px}
    .customer-login-card h1{font-size:2rem;letter-spacing:-.035em;margin-bottom:8px;color:#202124}
    .customer-login-card>p{font-size:1rem;line-height:1.55;margin-bottom:28px;max-width:390px}
    .customer-login-card .field{margin-bottom:18px}
    .customer-login-card label{font-size:.9rem;color:#374151}
    .customer-login-card input{min-height:50px;border-radius:10px;padding:12px 14px;background:#fff}
    .customer-login-card .btn.block{min-height:50px;border-radius:10px;font-size:1rem}
    .customer-login-card form+*{margin-top:0}
    .customer-login-signup{border-top:1px solid #e5e7eb;margin-top:26px;padding-top:22px;text-align:center;color:#64748b;font-size:.92rem}
    .customer-login-signup a{color:#2563eb;font-weight:750;margin-left:3px}
    .customer-login-signup a:hover{text-decoration:underline}
    @media(max-width:600px){.customer-login-page{padding:32px 18px 52px!important}.customer-login-card{padding:28px 22px 24px;border-radius:16px}.customer-login-card h1{font-size:1.72rem}}
  `;
  document.head.appendChild(style);
})();
