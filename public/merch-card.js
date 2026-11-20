/* GoBookr Merch Studio — card/sticker/apparel renderer and designer.
   One drawing function produces both the on-screen preview and the exact print file, so what you see is what the
   supplier receives. All geometry comes from the server (supplier print spec). */
(function () {
  'use strict';
  var FONTS = { inter: '"Inter", system-ui, sans-serif', display: '"Inter Display", "Inter", system-ui, sans-serif', serif: 'Georgia, "Times New Roman", serif' };
  var QR_DARK = '#101828', QR_LIGHT = '#ffffff';

  function fit(ctx, text, maxW, size, weight, family) {
    var s = size;
    do { ctx.font = weight + ' ' + s + 'px ' + family; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > 10);
    return s;
  }
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 1;
    var n = parseInt(m[1], 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function inkOn(bg) { return luminance(bg) > 0.35 ? '#101828' : '#ffffff'; }
  function softInkOn(bg) { return luminance(bg) > 0.35 ? '#3B4459' : 'rgba(255,255,255,.78)'; }

  function drawQr(ctx, matrix, x, y, modulePx) {
    var n = matrix.length, quiet = 4, total = (n + 2 * quiet) * modulePx;
    ctx.fillStyle = QR_LIGHT; ctx.fillRect(x, y, total, total);
    ctx.fillStyle = QR_DARK;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (matrix[r][c]) ctx.fillRect(x + (c + quiet) * modulePx, y + (r + quiet) * modulePx, modulePx, modulePx);
    return { x: x, y: y, modulePx: modulePx, quiet: quiet, total: total };
  }
  function drawLogo(ctx, img, x, y, maxW, maxH) {
    if (!img || !img.width) return 0;
    var k = Math.min(maxW / img.width, maxH / img.height), w = img.width * k, h = img.height * k;
    ctx.drawImage(img, x, y + (maxH - h) / 2, w, h); return w;
  }

  // ---- card (business + appointment) ---------------------------------------------------------------------------
  function drawCard(ctx, geo, d, side, assets) {
    var W = geo.canvasPx.w, H = geo.canvasPx.h, S = geo.safePx, dpi = geo.dpi, fam = FONTS[d.font] || FONTS.inter;
    var bg = side === 'front' ? d.frontBg : d.backBg, ink = inkOn(bg), soft = softInkOn(bg), accent = d.accent || '#6558F5';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); // full bleed
    var placement = null;
    ctx.textBaseline = 'alphabetic';
    if (side === 'front') {
      var layout = d.layout || 'classic';
      if (layout === 'centered') {
        var lh = Math.round(H * 0.26), lw = assets.logo ? drawLogo(ctx, assets.logo, W / 2 - lh, H * 0.22, lh * 2, lh) : 0;
        ctx.textAlign = 'center'; ctx.fillStyle = ink;
        var s1 = fit(ctx, d.business, W - 2 * S, Math.round(dpi * 0.2), '700', fam);
        ctx.fillText(d.business, W / 2, lw ? H * 0.68 : H * 0.52);
        ctx.fillStyle = soft; fit(ctx, d.tagline || '', W - 2 * S, Math.round(dpi * 0.085), '500', fam); ctx.fillText(d.tagline || '', W / 2, (lw ? H * 0.68 : H * 0.52) + s1 * 0.9);
        ctx.fillStyle = accent; ctx.fillRect(W / 2 - dpi * 0.15, H - S - dpi * 0.12, dpi * 0.3, Math.max(4, dpi * 0.02));
      } else {
        ctx.textAlign = 'left';
        ctx.fillStyle = accent; ctx.fillRect(0, 0, Math.round(geo.bleedPx + dpi * 0.09), H);
        var x0 = S + dpi * 0.12, lh2 = Math.round(dpi * 0.42);
        var lw2 = assets.logo ? drawLogo(ctx, assets.logo, x0, S + dpi * 0.04, lh2 * 2.2, lh2) : 0;
        ctx.fillStyle = ink;
        var s2 = fit(ctx, d.business, W - x0 - S, Math.round(dpi * (layout === 'bold' ? 0.26 : 0.2)), layout === 'bold' ? '800' : '700', fam);
        var by = H - S - dpi * 0.42;
        ctx.fillText(d.business, x0, by);
        ctx.fillStyle = soft; fit(ctx, d.tagline || '', W - x0 - S, Math.round(dpi * 0.085), '500', fam); ctx.fillText(d.tagline || '', x0, by + s2 * 0.8);
        void lw2;
      }
    } else {
      ctx.textAlign = 'left';
      var qrMod = Math.floor((H - 2 * S - dpi * 0.12) / (assets.qr.length + 8));
      var qrTotal = (assets.qr.length + 8) * qrMod, qx = W - S - qrTotal, qy = S + Math.round((H - 2 * S - qrTotal - dpi * 0.1) / 2);
      placement = drawQr(ctx, assets.qr, qx, qy, qrMod);
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = '600 ' + Math.round(dpi * 0.06) + 'px ' + fam;
      ctx.fillText(d.qrCaption || 'Scan to book', qx + qrTotal / 2, qy + qrTotal + dpi * 0.08);
      ctx.textAlign = 'left';
      var x = S + Math.round(dpi * 0.04), maxW = qx - x - dpi * 0.12, y = S + dpi * 0.24;
      if (d.appointment) {
        ctx.fillStyle = ink; fit(ctx, d.name || d.business, maxW, Math.round(dpi * 0.11), '700', fam); ctx.fillText(d.name || d.business, x, y);
        ctx.fillStyle = soft; ctx.font = '500 ' + Math.round(dpi * 0.06) + 'px ' + fam; ctx.fillText('Your next appointment', x, y + dpi * 0.14);
        var rows = ['Date', 'Time', 'With'];
        ctx.strokeStyle = soft; ctx.lineWidth = Math.max(2, dpi * 0.006);
        rows.forEach(function (label, i) { var ry = y + dpi * (0.42 + i * 0.27); ctx.fillStyle = soft; ctx.font = '500 ' + Math.round(dpi * 0.055) + 'px ' + fam; ctx.fillText(label, x, ry); ctx.beginPath(); ctx.moveTo(x + dpi * 0.33, ry + 4); ctx.lineTo(x + maxW, ry + 4); ctx.stroke(); });
        ctx.fillStyle = soft; ctx.font = '500 ' + Math.round(dpi * 0.05) + 'px ' + fam; ctx.fillText([d.phone, d.website].filter(Boolean).join('  ·  '), x, H - S);
      } else {
        ctx.fillStyle = ink; fit(ctx, d.name || d.business, maxW, Math.round(dpi * 0.13), '700', fam); ctx.fillText(d.name || d.business, x, y);
        ctx.fillStyle = accent === bg ? soft : (luminance(bg) > 0.35 ? accent : '#C9C4FF');
        ctx.font = '600 ' + Math.round(dpi * 0.072) + 'px ' + fam; ctx.fillText(d.title || '', x, y + dpi * 0.15);
        var lines = [d.phone, d.email, d.website, d.address, d.social].filter(Boolean);
        ctx.fillStyle = soft;
        lines.forEach(function (t, i) { fit(ctx, t, maxW, Math.round(dpi * 0.07), '500', fam); ctx.fillText(t, x, y + dpi * (0.44 + i * 0.18)); });
      }
    }
    return placement;
  }

  function drawSticker(ctx, geo, d, assets) {
    var W = geo.canvasPx.w, H = geo.canvasPx.h, S = geo.safePx, fam = FONTS[d.font] || FONTS.inter, bg = d.frontBg, ink = inkOn(bg);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); // sticker stock is white vinyl
    var r = Math.min(W, H) * 0.12; ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(S + r, S); ctx.arcTo(W - S, S, W - S, H - S, r); ctx.arcTo(W - S, H - S, S, H - S, r); ctx.arcTo(S, H - S, S, S, r); ctx.arcTo(S, S, W - S, S, r); ctx.closePath(); ctx.fill();
    var inner = Math.min(W, H) - 2 * S, placement = null;
    ctx.textAlign = 'center'; ctx.fillStyle = ink;
    if (d.stickerQr && assets.qr) {
      var mod = Math.floor((inner * 0.55) / (assets.qr.length + 8)), tot = (assets.qr.length + 8) * mod;
      placement = drawQr(ctx, assets.qr, Math.round(W / 2 - tot / 2), Math.round(S + inner * 0.08), mod);
      fit(ctx, d.business, inner * 0.84, Math.round(inner * 0.11), '800', fam); ctx.fillText(d.business, W / 2, S + inner * 0.08 + tot + inner * 0.14);
      ctx.font = '500 ' + Math.round(inner * 0.06) + 'px ' + fam; ctx.fillText(d.tagline || 'Book on GoBookr', W / 2, S + inner * 0.08 + tot + inner * 0.23);
    } else {
      if (assets.logo) drawLogo(ctx, assets.logo, W / 2 - inner * 0.3, S + inner * 0.12, inner * 0.6, inner * 0.36);
      fit(ctx, d.business, inner * 0.84, Math.round(inner * 0.13), '800', fam); ctx.fillText(d.business, W / 2, S + inner * (assets.logo ? 0.68 : 0.55));
      ctx.font = '500 ' + Math.round(inner * 0.065) + 'px ' + fam; ctx.fillText(d.tagline || '', W / 2, S + inner * (assets.logo ? 0.8 : 0.67));
    }
    return placement;
  }

  function drawTee(ctx, geo, d, assets) {
    var W = geo.canvasPx.w, H = geo.canvasPx.h, fam = FONTS[d.font] || FONTS.inter;
    ctx.clearRect(0, 0, W, H); // transparent: DTG prints only the artwork
    var y = H * 0.12;
    if (assets.logo) { drawLogo(ctx, assets.logo, W * 0.2, y, W * 0.6, H * 0.36); y += H * 0.44; }
    ctx.textAlign = 'center'; ctx.fillStyle = d.teeInk || '#ffffff';
    fit(ctx, d.business, W * 0.86, Math.round(W * 0.11), '800', fam); ctx.fillText(d.business, W / 2, y + W * 0.06);
    if (d.tagline) { ctx.font = '600 ' + Math.round(W * 0.045) + 'px ' + fam; ctx.fillText(d.tagline, W / 2, y + W * 0.14); }
    return null;
  }

  function render(canvas, spec, d, side, assets) {
    var geo = spec.geometry; canvas.width = geo.canvasPx.w; canvas.height = geo.canvasPx.h;
    var ctx = canvas.getContext('2d');
    if (spec.product === 'sticker_kiss_cut') return drawSticker(ctx, geo, d, assets);
    if (spec.product === 'tshirt') return drawTee(ctx, geo, d, assets);
    return drawCard(ctx, geo, Object.assign({}, d, { appointment: spec.product === 'appointment_card' }), side, assets);
  }
  function guides(canvas, geo) {
    var ctx = canvas.getContext('2d'), b = geo.bleedPx, s = geo.safePx, W = geo.canvasPx.w, H = geo.canvasPx.h;
    canvas.width = W; canvas.height = H; ctx.clearRect(0, 0, W, H);
    if (b) { ctx.fillStyle = 'rgba(196,32,58,.14)'; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); ctx.fillRect(0, b, b, H - 2 * b); ctx.fillRect(W - b, b, b, H - 2 * b); }
    ctx.setLineDash([12, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(101,88,245,.9)'; ctx.strokeRect(s, s, W - 2 * s, H - 2 * s);
    if (b) { ctx.setLineDash([]); ctx.strokeStyle = 'rgba(16,24,40,.55)'; ctx.lineWidth = 2; ctx.strokeRect(b, b, W - 2 * b, H - 2 * b); }
  }

  function loadImage(src) { return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }

  // ---- static previews (demo, order pages): <canvas data-merch-render='{"spec":..,"design":..,"side":"front"}'> --
  function renderStatic() {
    var nodes = document.querySelectorAll('canvas[data-merch-render]');
    Array.prototype.forEach.call(nodes, function (c) {
      var cfg = JSON.parse(c.getAttribute('data-merch-render'));
      loadImage(cfg.design.logo).then(function (logo) { render(c, cfg.spec, cfg.design, cfg.side, { logo: logo, qr: cfg.qr }); c.classList.add('is-ready'); });
    });
  }

  // ---- designer ------------------------------------------------------------------------------------------------
  function designer(root) {
    var cfg = JSON.parse(document.getElementById('merch-config').textContent);
    var form = root.querySelector('form.mx-controls'), state = Object.assign({}, cfg.design), assets = { qr: cfg.qr, logo: null }, side = 'front';
    var front = root.querySelector('#mx-front'), back = root.querySelector('#mx-back'), gF = root.querySelector('#mx-guides-front'), gB = root.querySelector('#mx-guides-back');
    var status = root.querySelector('[data-mx-status]'), saveBtn = root.querySelector('[data-mx-save]');
    function read() {
      Array.prototype.forEach.call(form.elements, function (el) { if (!el.name || el.type === 'file') return; if (el.type === 'radio') { if (el.checked) state[el.name] = el.value; } else if (el.type === 'checkbox') state[el.name] = el.checked; else state[el.name] = el.value.trim(); });
    }
    function draw() {
      read();
      render(front, cfg.spec, state, 'front', assets);
      if (back) render(back, cfg.spec, state, 'back', assets);
      guides(gF, cfg.spec.geometry); if (gB) guides(gB, cfg.spec.geometry);
      root.classList.toggle('show-guides', !!state.showGuides);
      setStatus('', '');
    }
    function setStatus(kind, msg) { if (!status) return; status.className = 'mx-status' + (kind ? ' is-' + kind : ''); status.textContent = msg; }
    form.addEventListener('input', draw); form.addEventListener('change', draw);
    var logoInput = form.querySelector('input[type=file][name=logo]');
    if (logoInput) logoInput.addEventListener('change', function () {
      var f = logoInput.files && logoInput.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setStatus('error', 'Use a PNG, JPG or WebP logo.'); return; }
      var r = new FileReader(); r.onload = function () {
        loadImage(r.result).then(function (img) {
          if (!img) return setStatus('error', 'That image could not be read.');
          var k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); state.logo = c.toDataURL('image/png');
          loadImage(state.logo).then(function (i2) { assets.logo = i2; draw(); });
        });
      }; r.readAsDataURL(f);
    });
    var removeLogo = form.querySelector('[data-mx-remove-logo]');
    if (removeLogo) removeLogo.addEventListener('click', function () { state.logo = ''; assets.logo = null; if (logoInput) logoInput.value = ''; draw(); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-mx-side]'), function (b) {
      b.addEventListener('click', function () { side = b.getAttribute('data-mx-side'); root.setAttribute('data-side', side); Array.prototype.forEach.call(root.querySelectorAll('[data-mx-side]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-swatch]'), function (b) {
      b.addEventListener('click', function () { var t = form.elements[b.getAttribute('data-target')]; t.value = b.getAttribute('data-swatch'); draw(); });
    });
    if (saveBtn) saveBtn.addEventListener('click', function () {
      draw(); saveBtn.disabled = true; setStatus('busy', 'Checking print files and QR code…');
      var files = {}, placement = null;
      placement = render(front, cfg.spec, state, 'front', assets) || null; files.front = front.toDataURL('image/png');
      if (back) { var p2 = render(back, cfg.spec, state, 'back', assets); placement = p2 || placement; files.back = back.toDataURL('image/png'); }
      var qrSide = cfg.spec.product === 'sticker_kiss_cut' ? 'front' : 'back';
      var body = { _csrf: cfg.csrf, id: cfg.designId || null, owner: cfg.owner, product: cfg.spec.product, size: cfg.spec.size, design: state, files: files, qr: placement ? { side: qrSide, placement: placement } : null };
      var native = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      var check = native && placement ? native.detect(qrSide === 'front' ? front : back).then(function (r) { body.browserScan = r.map(function (x) { return x.rawValue; }); }).catch(function () {}) : Promise.resolve();
      check.then(function () { return fetch(cfg.saveUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' }); })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          saveBtn.disabled = false;
          if (!res.ok || !res.j.ok) { setStatus('error', (res.j.issues || [res.j.error || 'Could not save.']).join(' ')); return; }
          cfg.designId = res.j.id; setStatus('ok', res.j.message);
          var next = root.querySelector('[data-mx-next]'); if (next && res.j.orderUrl) { next.href = res.j.orderUrl; next.hidden = false; }
        })
        .catch(function () { saveBtn.disabled = false; setStatus('error', 'Could not reach GoBookr. Check your connection and try again.'); });
    });
    fontsReady().then(function () { return loadImage(state.logo); }).then(function (img) { assets.logo = img; draw(); });
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var want = ['500 40px "Inter"', '600 40px "Inter"', '700 40px "Inter"', '800 40px "Inter"', '700 40px "Inter Display"', '800 40px "Inter Display"'];
    return Promise.all(want.map(function (f) { return document.fonts.load(f).catch(function () {}); }));
  }
  function boot() {
    var root = document.querySelector('[data-merch-designer]'); if (root) designer(root);
    fontsReady().then(renderStatic);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.GoBookrMerch = { render: render };
})();
