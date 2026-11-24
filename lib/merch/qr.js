'use strict';
// Self-contained QR Code (ISO/IEC 18004) encoder + verifier for printed GoBookr QR codes.
// Byte mode, error correction M or Q, versions 1–10 (up to ~213 bytes at M) — plenty for gobookr.com URLs.
// verify() decodes the finished module matrix back to text (format info, unmasking, codeword order, Reed–Solomon
// syndromes, byte-mode payload), so a code can only be printed if it reads back exactly as the intended URL.

// ---- GF(256) and Reed–Solomon ------------------------------------------------------------------------------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function generator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
function rsRemainder(data, degree) {
  const g = generator(degree), res = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ res.shift(); res.push(0);
    for (let i = 0; i < degree; i++) res[i] ^= mul(g[i + 1], factor);
  }
  return res;
}
function syndromesZero(codewords, degree) {
  for (let i = 0; i < degree; i++) {
    let s = 0; for (const c of codewords) s = mul(s, EXP[i]) ^ c;
    if (s) return false;
  }
  return true;
}

// ---- version tables (ISO 18004 Table 9) --------------------------------------------------------------------------
// [ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords]
const EC = {
  M: [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
  Q: [null, [13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0], [18, 2, 15, 2, 16], [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
};
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
const dataCapacity = (v, ecl) => { const t = EC[ecl][v]; return t[1] * t[2] + t[3] * t[4]; };
const size = (v) => 17 + 4 * v;

function bch(value, poly, polyDegree) {
  let v = value << polyDegree;
  for (let i = 31 - Math.clz32(v); i >= polyDegree; i = 31 - Math.clz32(v)) v ^= poly << (i - polyDegree);
  return v;
}
const formatBits = (ecl, mask) => { const d = (EC_BITS[ecl] << 3) | mask; return ((d << 10) | bch(d, 0x537, 10)) ^ 0x5412; };
const versionBits = (v) => (v << 12) | bch(v, 0x1f25, 12);
const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];

// ---- function patterns -------------------------------------------------------------------------------------------
function baseMatrix(v) {
  const n = size(v);
  const m = Array.from({ length: n }, () => new Array(n).fill(null)); // null = data module
  const set = (r, c, val) => { if (r >= 0 && c >= 0 && r < n && c < n) m[r][c] = val; };
  const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
    set(r0 + r, c0 + c, inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0);
  } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { m[6][i] = i % 2 === 0 ? 1 : 0; m[i][6] = i % 2 === 0 ? 1 : 0; }
  const last = ALIGN[v][ALIGN[v].length - 1];
  for (const r of ALIGN[v]) for (const c of ALIGN[v]) {
    if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue; // finder corners
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
  }
  // reserve format areas (filled later) and the dark module
  for (let i = 0; i < 9; i++) { if (m[8][i] === null) m[8][i] = 0; if (m[i][8] === null) m[i][8] = 0; }
  for (let i = 0; i < 8; i++) { if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = 0; if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = 0; }
  m[n - 8][8] = 1;
  if (v >= 7) for (let i = 0; i < 18; i++) { const a = Math.floor(i / 3), b = n - 11 + (i % 3); m[a][b] = 0; m[b][a] = 0; }
  return m;
}
function dataPositions(m) {
  const n = m.length, out = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((n - 1 - right) >> 1) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const r = upward ? n - 1 - i : i;
      for (const c of [right, right - 1]) if (m[r][c] === null) out.push([r, c]);
    }
  }
  return out;
}
function placeFormat(m, ecl, mask) {
  const n = m.length, bits = formatBits(ecl, mask), bit = (i) => (bits >> i) & 1;
  for (let i = 0; i <= 5; i++) m[8][i] = bit(14 - i);
  m[8][7] = bit(8); m[8][8] = bit(7); m[7][8] = bit(6);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(14 - i);
  for (let i = 0; i <= 7; i++) m[n - 1 - i][8] = bit(14 - i);
  for (let i = 8; i <= 14; i++) m[8][n - 15 + i] = bit(14 - i);
  m[n - 8][8] = 1;
}
function placeVersion(m, v) {
  if (v < 7) return;
  const n = m.length, bits = versionBits(v);
  for (let i = 0; i < 18; i++) { const b = (bits >> i) & 1, a = Math.floor(i / 3), c = n - 11 + (i % 3); m[a][c] = b; m[c][a] = b; }
}
function penalty(m) {
  const n = m.length; let p = 0;
  const line = (get) => {
    for (let i = 0; i < n; i++) {
      let run = 1; const row = [];
      for (let j = 0; j < n; j++) row.push(get(i, j));
      for (let j = 1; j < n; j++) { if (row[j] === row[j - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1; }
      const s = row.join('');
      for (const pat of ['10111010000', '00001011101']) { let k = s.indexOf(pat); while (k !== -1) { p += 40; k = s.indexOf(pat, k + 1); } }
    }
  };
  line((i, j) => m[i][j]); line((i, j) => m[j][i]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3; }
  let dark = 0; for (const row of m) for (const v of row) dark += v;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

// ---- encode ------------------------------------------------------------------------------------------------------
function encode(text, { ecl = 'M' } = {}) {
  const data = Buffer.from(String(text), 'utf8');
  let v = 1;
  while (v <= 10 && dataCapacity(v, ecl) * 8 < 4 + (v < 10 ? 8 : 16) + data.length * 8) v++;
  if (v > 10) throw new Error('QR payload too long');
  const cap = dataCapacity(v, ecl), bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); push(data.length, v < 10 ? 8 : 16); for (const b of data) push(b, 8);
  push(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const bytes = []; for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0; bytes.length < cap; pad++) bytes.push(pad % 2 ? 0x11 : 0xec);
  // split into blocks, add EC, interleave
  const [ecLen, b1, d1, b2, d2] = EC[ecl][v], blocks = []; let k = 0;
  for (let i = 0; i < b1 + b2; i++) { const len = i < b1 ? d1 : d2; const d = bytes.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, ecLen) }); }
  const codewords = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.d.length) codewords.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) codewords.push(b.e[i]);
  const stream = []; for (const c of codewords) for (let i = 7; i >= 0; i--) stream.push((c >> i) & 1);
  // place data, try all masks, keep the lowest penalty
  const base = baseMatrix(v), positions = dataPositions(base);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.map((row) => row.slice());
    positions.forEach(([r, c], i) => { const bit = i < stream.length ? stream[i] : 0; m[r][c] = bit ^ (MASKS[mask](r, c) ? 1 : 0); });
    placeFormat(m, ecl, mask); placeVersion(m, v);
    const score = penalty(m);
    if (!best || score < best.score) best = { m, score, mask };
  }
  return { version: v, ecl, mask: best.mask, size: size(v), modules: best.m };
}

// ---- verify (decode the matrix) ------------------------------------------------------------------------------------
function decodeMatrix(m) {
  const n = m.length, v = (n - 17) / 4;
  if (!Number.isInteger(v) || v < 1 || v > 10) throw new Error('unsupported size');
  let fmt = 0;
  for (let i = 0; i <= 5; i++) fmt |= m[8][i] << (14 - i);
  fmt |= m[8][7] << 8; fmt |= m[8][8] << 7; fmt |= m[7][8] << 6;
  for (let i = 9; i <= 14; i++) fmt |= m[14 - i][8] << (14 - i);
  let match = null;
  for (const ecl of Object.keys(EC_BITS)) for (let mask = 0; mask < 8; mask++) if (formatBits(ecl, mask) === fmt) match = { ecl, mask };
  if (!match || !EC[match.ecl]) throw new Error('format information unreadable');
  const base = baseMatrix(v), stream = [];
  for (const [r, c] of dataPositions(base)) stream.push(m[r][c] ^ (MASKS[match.mask](r, c) ? 1 : 0));
  const [ecLen, b1, d1, b2, d2] = EC[match.ecl][v], total = (b1 * d1 + b2 * d2) + (b1 + b2) * ecLen;
  const cw = []; for (let i = 0; i < total; i++) cw.push(parseInt(stream.slice(i * 8, i * 8 + 8).join(''), 2));
  const blocks = Array.from({ length: b1 + b2 }, (_, i) => ({ d: [], e: [], len: i < b1 ? d1 : d2 }));
  let k = 0;
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.len) b.d.push(cw[k++]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) b.e.push(cw[k++]);
  for (const b of blocks) if (!syndromesZero([...b.d, ...b.e], ecLen)) throw new Error('error-correction check failed');
  const bits = []; for (const b of blocks) for (const c of b.d) for (let i = 7; i >= 0; i--) bits.push((c >> i) & 1);
  const read = (start, len) => parseInt(bits.slice(start, start + len).join(''), 2);
  if (read(0, 4) !== 0b0100) throw new Error('not byte mode');
  const lenBits = v < 10 ? 8 : 16, count = read(4, lenBits), out = [];
  for (let i = 0; i < count; i++) out.push(read(4 + lenBits + i * 8, 8));
  return { text: Buffer.from(out).toString('utf8'), ecl: match.ecl, mask: match.mask, version: v };
}

// A printed code must decode to exactly the intended URL, keep a 4-module quiet zone, and be at least
// 0.75 in (19 mm) wide on the product (≈ phone-camera scannable from arm's length).
const MIN_PRINT_INCHES = 0.75;
function verify(qr, expected, { printInches = null } = {}) {
  const problems = [];
  let decoded = null;
  try { decoded = decodeMatrix(qr.modules).text; } catch (err) { problems.push('Could not read back the code: ' + err.message); }
  if (decoded !== null && decoded !== expected) problems.push('The code reads back as a different link.');
  if (printInches != null && printInches < MIN_PRINT_INCHES) problems.push(`The code is ${printInches.toFixed(2)} in wide; it must be at least ${MIN_PRINT_INCHES} in to scan reliably.`);
  return { ok: problems.length === 0, decoded, problems };
}

function svg(qr, { px = 4, quiet = 4, dark = '#101828', light = '#ffffff' } = {}) {
  const n = qr.size + quiet * 2, w = n * px; let path = '';
  qr.modules.forEach((row, r) => row.forEach((on, c) => { if (on) path += `M${(c + quiet) * px} ${(r + quiet) * px}h${px}v${px}h-${px}z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}" shape-rendering="crispEdges"><rect width="${w}" height="${w}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

module.exports = { encode, decodeMatrix, verify, svg, MIN_PRINT_INCHES };
