'use strict';
// Print-file preflight. A file is accepted for a supplier only if it matches that supplier's spec exactly and,
// when it carries a QR code, the code's modules in the actual print pixels match the intended permanent URL.
const png = require('./png');
const qr = require('./qr');
const caps = require('./capabilities');

// QR placement is recorded by the designer in print pixels: { x, y, modulePx, quiet } (x/y = top-left of quiet zone).
function readQrFromPixels(img, placement, expectedMatrix) {
  const n = expectedMatrix.length, { x, y, modulePx, quiet } = placement;
  let mismatches = 0, darkSum = 0, darkN = 0, lightSum = 0, lightN = 0;
  const sample = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= img.width || cy >= img.height) return 255;
    // 3×3 average around module center
    let s = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const px = Math.min(img.width - 1, Math.max(0, cx + dx)), py = Math.min(img.height - 1, Math.max(0, cy + dy)); s += img.lum(px, py); k++; }
    return s / k;
  };
  const total = n + 2 * quiet, read = [];
  for (let r = 0; r < total; r++) {
    const row = [];
    for (let c = 0; c < total; c++) {
      const v = sample(Math.round(x + (c + 0.5) * modulePx), Math.round(y + (r + 0.5) * modulePx));
      const inCode = r >= quiet && c >= quiet && r < quiet + n && c < quiet + n;
      const want = inCode ? expectedMatrix[r - quiet][c - quiet] : 0;
      if (want) { darkSum += v; darkN++; } else { lightSum += v; lightN++; }
      const got = v < 128 ? 1 : 0;
      if (got !== want) mismatches++;
      if (inCode) row.push(got);
    }
    if (r >= quiet && r < quiet + n) read.push(row);
  }
  const contrast = lightN && darkN ? (lightSum / lightN - darkSum / darkN) / 255 : 0;
  return { mismatches, contrast, matrix: read };
}

function preflight({ product, supplier, size, side, file, qrPlacement = null, qrTarget = null }) {
  const issues = [], geo = caps.geometry(product, supplier, size);
  if (!geo) return { ok: false, issues: ['This product is not offered by the selected supplier.'] };
  let info;
  try { info = png.inspect(file); } catch (err) { return { ok: false, issues: ['The print file is not a valid PNG: ' + err.message] }; }
  if (info.width !== geo.canvasPx.w || info.height !== geo.canvasPx.h) issues.push(`The ${side} file is ${info.width}×${info.height}px; ${caps.SUPPLIERS[supplier].name} needs ${geo.canvasPx.w}×${geo.canvasPx.h}px (${(geo.trimIn.w + 2 * geo.bleedIn)}″ × ${(geo.trimIn.h + 2 * geo.bleedIn)}″ at ${geo.dpi} DPI${geo.bleedIn ? ', including bleed' : ''}).`);
  if (info.dpi && info.dpi !== geo.dpi) issues.push(`The ${side} file is tagged ${info.dpi} DPI; it must be ${geo.dpi} DPI.`);
  let qrResult = null;
  if (qrTarget) {
    if (!qrPlacement) issues.push('The QR code position is missing from the print file.');
    else {
      const code = qr.encode(qrTarget);
      const selfCheck = qr.verify(code, qrTarget, { printInches: (code.size * qrPlacement.modulePx) / geo.dpi });
      issues.push(...selfCheck.problems);
      if (qrPlacement.quiet < 4) issues.push('The QR code needs a quiet margin of at least 4 modules.');
      const edge = geo.safePx, totalPx = (code.size + 2 * qrPlacement.quiet) * qrPlacement.modulePx;
      const codeX = qrPlacement.x + qrPlacement.quiet * qrPlacement.modulePx, codeY = qrPlacement.y + qrPlacement.quiet * qrPlacement.modulePx, codePx = code.size * qrPlacement.modulePx;
      if (codeX < edge || codeY < edge || codeX + codePx > geo.canvasPx.w - edge || codeY + codePx > geo.canvasPx.h - edge) issues.push('The QR code must sit fully inside the safe area.');
      if (qrPlacement.modulePx < 3) issues.push('QR modules are too small to print sharply.');
      if (!issues.length || totalPx) {
        try {
          const img = png.decode(file);
          const read = readQrFromPixels(img, qrPlacement, code.modules);
          let decoded = null; try { decoded = qr.decodeMatrix(read.matrix).text; } catch { /* reported below */ }
          qrResult = { decoded, mismatches: read.mismatches, contrast: Number(read.contrast.toFixed(2)), inches: Number(((code.size * qrPlacement.modulePx) / geo.dpi).toFixed(2)) };
          if (read.mismatches > 0) issues.push(`The printed QR code differs from the intended code in ${read.mismatches} module${read.mismatches === 1 ? '' : 's'} (something overlaps it or the colors are too light).`);
          if (read.contrast < 0.6) issues.push('The QR code needs darker modules on a lighter background to scan reliably.');
          if (decoded !== qrTarget) issues.push('The printed QR code does not read back as your permanent GoBookr link.');
        } catch (err) { issues.push('The QR code could not be checked: ' + err.message); }
      }
    }
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)], geometry: geo, file: { width: info.width, height: info.height, dpi: info.dpi, bytes: file.length }, qr: qrResult };
}

module.exports = { preflight, readQrFromPixels };
