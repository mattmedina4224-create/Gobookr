// Pro dashboard on phones: the page navigation becomes a slide-out menu opened from a ☰ button in the app
// header (same pattern as the business dashboard). Without JavaScript the navigation stays a plain list.
(() => {
  if (document.querySelector('.gbd')) return; // the business dashboard has its own drawer
  const nav = document.querySelector('body.gb-app .dash-layout .dash-nav');
  const head = document.querySelector('.gb-apphead-inner');
  if (!nav || !head) return;
  const mq = window.matchMedia('(max-width: 860px)');
  nav.id = nav.id || 'gb-app-nav';
  document.documentElement.classList.add('gb-has-drawer');

  const svg = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gb-app-menubtn';
  btn.setAttribute('aria-controls', nav.id);
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Open menu');
  btn.innerHTML = svg('<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>');
  head.insertBefore(btn, head.firstChild);

  const top = document.createElement('div');
  top.className = 'gb-app-drawer-head';
  const label = (document.querySelector('.gb-apphead-context') || {}).textContent || 'Menu';
  top.innerHTML = `<span></span><button type="button" class="gb-app-drawer-close" aria-label="Close menu">${svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')}</button>`;
  top.querySelector('span').textContent = label;
  nav.insertBefore(top, nav.firstChild);

  const scrim = document.createElement('div');
  scrim.className = 'gb-app-scrim';
  scrim.hidden = true;
  document.body.appendChild(scrim);

  let open = false;
  const focusables = () => Array.from(nav.querySelectorAll('a[href], button:not([disabled])')).filter((el) => el.offsetParent !== null);
  function setOpen(value) {
    if (value && !mq.matches) return;
    open = value;
    nav.classList.toggle('is-open', value);
    scrim.hidden = !value;
    btn.setAttribute('aria-expanded', String(value));
    document.body.classList.toggle('gb-locked', value);
    if (value) {
      const current = nav.querySelector('[aria-current="page"], a.active') || focusables()[0];
      if (current) setTimeout(() => current.focus(), 30);
    } else {
      btn.focus();
    }
  }
  btn.addEventListener('click', () => setOpen(true));
  top.querySelector('button').addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (ev) => {
    if (!open) return;
    if (ev.key === 'Escape') { ev.preventDefault(); setOpen(false); return; }
    if (ev.key === 'Tab') {
      const list = focusables(); if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  const onChange = () => { if (!mq.matches && open) setOpen(false); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
})();
