'use strict';
// Minimal PNG reader/writer (8-bit RGB/RGBA, non-interlaced) — enough to preflight print files the designer
// renders in the browser, and to build fixtures in tests. No dependencies.
const zlib = require('node:zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunks(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) throw new Error('Not a PNG file');
  const out = []; let o = 8;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
    if (o + 12 + len > buf.length) throw new Error('Truncated PNG');
    out.push({ type, data: buf.subarray(o + 8, o + 8 + len) }); o += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

function inspect(buf) {
  const cs = chunks(buf), ihdr = cs.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG has no header');
  const info = { width: ihdr.data.readUInt32BE(0), height: ihdr.data.readUInt32BE(4), bitDepth: ihdr.data[8], colorType: ihdr.data[9], interlace: ihdr.data[12], dpi: null };
  const phys = cs.find((c) => c.type === 'pHYs');
  if (phys && phys.data[8] === 1) info.dpi = Math.round(phys.data.readUInt32BE(0) * 0.0254);
  return info;
}

function decode(buf) {
  const info = inspect(buf);
  if (info.bitDepth !== 8 || ![2, 6].includes(info.colorType) || info.interlace) throw new Error('Unsupported PNG layout (need 8-bit RGB/RGBA, non-interlaced)');
  if (info.width * info.height > 40e6) throw new Error('PNG too large');
  const bpp = info.colorType === 6 ? 4 : 3, stride = info.width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(chunks(buf).filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const px = Buffer.alloc(info.height * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < info.height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  // luminance accessor (alpha composited over white, as printed on white stock)
  const lum = (x, y) => {
    const i = y * stride + x * bpp, al = bpp === 4 ? px[i + 3] / 255 : 1;
    const ch = (k) => px[i + k] * al + 255 * (1 - al);
    return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
  };
  return { ...info, bpp, pixels: px, lum };
}

function encode({ width, height, rgba, dpi = null }) {
  const stride = width * 4, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [SIG, chunk('IHDR', ihdr)];
  if (dpi) { const p = Buffer.alloc(9); const ppm = Math.round(dpi / 0.0254); p.writeUInt32BE(ppm, 0); p.writeUInt32BE(ppm, 4); p[8] = 1; parts.push(chunk('pHYs', p)); }
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

module.exports = { inspect, decode, encode, crc32 };
