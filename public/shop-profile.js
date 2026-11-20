(() => {
  const root = document.querySelector('.sp');
  if (!root) return;

  // Share: native share sheet on phones, copy link elsewhere.
  const toast = root.querySelector('.sp-toast');
  const flash = (text) => { if (!toast) return; toast.textContent = text; toast.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { toast.hidden = true; }, 2200); };
  root.querySelectorAll('[data-share]').forEach((btn) => btn.addEventListener('click', async () => {
    const url = root.dataset.shopUrl || location.href;
    const title = document.querySelector('.sp-title h1')?.textContent || document.title;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); flash('Link copied');
    } catch (_) { /* dismissed */ }
  }));

  // Today's hours, in the visitor's own week.
  const today = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  root.querySelector(`.sp-hours tr[data-day="${today}"]`)?.classList.add('is-today');

  // Section nav reflects the section in view.
  const links = [...document.querySelectorAll('.sp-tabs a')];
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.filter((en) => en.isIntersecting).forEach((en) => {
        links.forEach((a) => a.removeAttribute('aria-current'));
        byId.get(en.target.id)?.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    // On desktop the Visit card is sticky and always in view, so it is not tracked there.
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el && getComputedStyle(el).position !== 'sticky') io.observe(el); });
  }

  // Gallery lightbox: click, arrows, Escape, swipe.
  const gallery = root.querySelector('[data-gallery]');
  const box = root.querySelector('.sp-lightbox');
  if (!gallery || !box || typeof box.showModal !== 'function') return;
  const items = [...gallery.querySelectorAll('.sp-photo')];
  const img = box.querySelector('img'), cap = box.querySelector('figcaption'), count = box.querySelector('.sp-lb-count');
  let index = 0, lastFocus = null;
  const show = (i) => {
    index = (i + items.length) % items.length;
    const it = items[index];
    img.src = it.dataset.src; img.alt = it.querySelector('img')?.alt || '';
    cap.textContent = it.dataset.caption || '';
    count.textContent = `${index + 1} / ${items.length}`;
  };
  items.forEach((it, i) => it.addEventListener('click', () => { lastFocus = it; show(i); box.showModal(); }));
  box.querySelector('.sp-lb-close').addEventListener('click', () => box.close());
  box.querySelector('.sp-lb-prev').addEventListener('click', () => show(index - 1));
  box.querySelector('.sp-lb-next').addEventListener('click', () => show(index + 1));
  box.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowRight') show(index + 1); if (ev.key === 'ArrowLeft') show(index - 1); });
  box.addEventListener('click', (ev) => { if (ev.target === box) box.close(); });
  box.addEventListener('close', () => { lastFocus?.focus(); });
  let startX = null;
  box.addEventListener('touchstart', (ev) => { startX = ev.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (ev) => {
    if (startX == null) return;
    const dx = ev.changedTouches[0].clientX - startX; startX = null;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
  });
})();
