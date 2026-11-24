(() => {
  // Keep the current tab/step visible on narrow screens.
  document.querySelector('.sd-tabs [aria-current], .sd-steps [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  // Dialogs (e.g. Leave business): open, close, Escape, backdrop click.
  document.querySelectorAll('[data-open-dialog]').forEach((btn) => btn.addEventListener('click', () => {
    const d = document.getElementById(btn.dataset.openDialog);
    if (d && typeof d.showModal === 'function') { d.showModal(); d.querySelector('[data-close-dialog]')?.focus(); }
    else if (d) d.setAttribute('open', '');
  }));
  document.querySelectorAll('dialog').forEach((d) => {
    d.querySelectorAll('[data-close-dialog]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); });
  });
  document.querySelector('.wp-departed')?.focus();

  // Confirm destructive actions.
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-confirm]');
    if (btn && !window.confirm(btn.dataset.confirm)) ev.preventDefault();
  });

  // Copy buttons next to read-only inputs.
  document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const input = btn.parentElement.querySelector('input');
    try { await navigator.clipboard.writeText(input.value); } catch (_) { input.select(); document.execCommand('copy'); }
    const label = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = label; }, 1600);
  }));

  // Hours: "Closed" disables that day's times; copy Monday to weekdays.
  document.querySelectorAll('[data-closed-toggle]').forEach((box) => box.addEventListener('change', () => {
    box.closest('.sd-hours-row').querySelectorAll('input[type="time"]').forEach((t) => { t.disabled = box.checked; });
  }));
  document.querySelector('[data-copy-weekday-hours]')?.addEventListener('click', () => {
    const get = (d, k) => document.querySelector(`[name="hours_${d}_${k}"]`);
    ['tue', 'wed', 'thu', 'fri'].forEach((d) => {
      get(d, 'open').value = get('mon', 'open').value; get(d, 'close').value = get('mon', 'close').value;
      get(d, 'closed').checked = get('mon', 'closed').checked; get(d, 'closed').dispatchEvent(new Event('change'));
    });
  });

  // Description length hint.
  const desc = document.querySelector('textarea[name="description"]'), counter = document.querySelector('[data-count="description"]');
  if (desc && counter) { const upd = () => { const n = desc.value.trim().length; counter.textContent = n >= 80 ? `${n} characters` : `${n} characters · aim for at least 80`; }; desc.addEventListener('input', upd); upd(); }

  // Cover reposition: live preview of the focal point.
  const range = document.querySelector('[data-cover-range]'), cover = document.querySelector('[data-cover-preview]');
  if (range && cover) range.addEventListener('input', () => { cover.style.objectPosition = `50% ${range.value}%`; });

  // Uploads: resize in the browser, then send as JSON (CSRF token included).
  const LIMITS = { logo: 600, cover: 2400, photo: 1800 };
  const webp = (() => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch (_) { return false; } })();
  async function decode(file) {
    if ('createImageBitmap' in window) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall through */ } }
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('This photo format is not supported. Try a JPG or PNG.')); img.src = URL.createObjectURL(file); });
  }
  async function prepare(file, max) {
    const img = await decode(file);
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    const scale = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const c = canvas.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.86, data = canvas.toDataURL(webp ? 'image/webp' : 'image/jpeg', quality);
    while (data.length > 3.9e6 && quality > 0.5) { quality -= 0.12; data = canvas.toDataURL(webp ? 'image/webp' : 'image/jpeg', quality); }
    return { data: data.slice(data.indexOf(',') + 1), width: canvas.width, height: canvas.height };
  }
  document.querySelectorAll('[data-uploader]').forEach((box) => {
    const input = box.querySelector('input[type="file"]'), status = box.querySelector('.sd-upload-status'), label = box.querySelector('.sd-upload-btn');
    input.addEventListener('change', async () => {
      const files = [...input.files]; if (!files.length) return;
      const purpose = box.dataset.purpose; let done = 0, failed = '';
      label.classList.add('is-busy');
      for (const file of files) {
        status.textContent = files.length > 1 ? `Uploading ${done + 1} of ${files.length}…` : 'Uploading…';
        try {
          if (file.size > 40 * 1024 * 1024) throw new Error('That photo is too large. Choose one under 40 MB.');
          const img = await prepare(file, LIMITS[purpose] || 1800);
          const res = await fetch('/dashboard/shop/media', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _csrf: box.dataset.csrf, shop: box.dataset.shop, purpose, image_data: img.data, width: img.width, height: img.height }) });
          const out = await res.json().catch(() => ({}));
          if (!res.ok || !out.ok) throw new Error(out.error || (res.status === 403 ? 'Your session expired. Refresh the page and try again.' : 'Upload failed. Please try again.'));
          done++;
        } catch (err) { failed = err.message || 'Upload failed.'; break; }
      }
      label.classList.remove('is-busy');
      if (failed && !done) { status.textContent = failed; status.classList.add('is-error'); input.value = ''; return; }
      const msg = purpose === 'photo' ? `${done} photo${done === 1 ? '' : 's'} added.` + (failed ? ' ' + failed : '') : purpose === 'logo' ? 'Logo updated.' : 'Cover photo updated. Drag the slider to reposition it.';
      const url = new URL(location.href); url.searchParams.delete('error'); url.searchParams.set('success', msg);
      location.href = url.toString();
    });
  });
})();
