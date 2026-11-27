// Tovara dashboard shell: mobile navigation drawer. No dependencies.
(() => {
  const root = document.querySelector('[data-gbd]');
  if (!root) return;
  const drawer = root.querySelector('[data-drawer]');
  const openBtn = root.querySelector('[data-drawer-open]');
  const scrim = root.querySelector('.gbd-scrim');
  if (!drawer || !openBtn) return;
  const mobile = window.matchMedia('(max-width: 1023px)');
  const focusables = () => Array.from(drawer.querySelectorAll('a[href], button:not([disabled]), select, input')).filter((el) => el.offsetParent !== null);

  function setOpen(open, { restoreFocus = true } = {}) {
    root.classList.toggle('is-open', open);
    document.body.classList.toggle('gbd-locked', open);
    openBtn.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
    if (mobile.matches) {
      if (open) { drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); }
      else { drawer.removeAttribute('role'); drawer.removeAttribute('aria-modal'); }
    }
    if (open) {
      const current = drawer.querySelector('[aria-current="page"]') || focusables()[0];
      if (current) setTimeout(() => current.focus(), 30);
    } else if (restoreFocus && mobile.matches) {
      openBtn.focus();
    }
  }

  openBtn.addEventListener('click', () => setOpen(true));
  root.querySelectorAll('[data-drawer-close]').forEach((el) => el.addEventListener('click', () => setOpen(false)));
  drawer.addEventListener('click', (ev) => { if (ev.target.closest('a[href]') && mobile.matches) setOpen(false, { restoreFocus: false }); });
  document.addEventListener('keydown', (ev) => {
    if (!root.classList.contains('is-open')) return;
    if (ev.key === 'Escape') { ev.preventDefault(); setOpen(false); return; }
    if (ev.key === 'Tab') {
      const list = focusables(); if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  const onChange = () => { if (!mobile.matches) setOpen(false, { restoreFocus: false }); };
  if (mobile.addEventListener) mobile.addEventListener('change', onChange); else mobile.addListener(onChange);
})();
