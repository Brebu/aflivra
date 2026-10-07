// Pixel evidence for the padding+shadows pass — objective, since PNGs can't be eyeballed in-session.
// For each before/after pair with identical dims: mean-gray delta in the OUTER band (the 6px ring
// outside the card border inside the 8px bleed crop) — a resting elevation renders there, so
// after must be darker than before by a small, nonzero amount — plus changed-pixel % overall.
// Padding pairs whose crop sizes legitimately differ (snapshot-note reflow) are listed with sizes.
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/uiux/pad-shadow-pixels.mjs
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

const decode = (file) => {
  const buf = readFileSync(file);
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += len + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bytesPP = colorType === 6 ? 4 : 3;
  const stride = w * bytesPP;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPP ? cur[x - bytesPP] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bytesPP && prev ? prev[x - bytesPP] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); v = (v + pred) & 255; }
      cur[x] = v;
    }
  }
  return { w, h, bytesPP, data: out };
};

const gray = (img, x, y) => { const o = (y * img.w + x) * img.bytesPP; return (img.data[o] + img.data[o + 1] + img.data[o + 2]) / 3; };

const pairs = [
  ['insight-story', false], ['recommendation-card', false], ['city-story', false],
  ['visit-card', false], ['vcallout', false], ['map-result', false],
  ['snapshot-note', true],
];

console.log('pair | dims before→after | ring gray Δ (after−before) | changed px %');
for (const [name, sizesDiffer] of pairs) {
  for (const vp of ['desktop', 'mobile']) {
    const b = decode(join(dir, `pad-shadow-${name}-before-${vp}.png`));
    const a = decode(join(dir, `pad-shadow-${name}-after-${vp}.png`));
    if (b.w !== a.w || b.h !== a.h) {
      console.log(`${name} ${vp} | ${b.w}x${b.h} → ${a.w}x${a.h} | size-differs${sizesDiffer ? ' (padding reflow — computed styles assert the fix)' : ' — UNEXPECTED'}`);
      continue;
    }
    // Outer 6px ring (inside the 8px bleed crop): where the resting shadow now renders.
    let ringB = 0, ringA = 0, n = 0;
    const ringBand = (img, cb) => { for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const inRing = x < 6 || y < 6 || x >= img.w - 6 || y >= img.h - 6; if (inRing) cb(gray(img, x, y)); } };
    ringBand(b, g => { ringB += g; n++; }); ringBand(a, g => { ringA += g; });
    // Changed pixels overall (any channel > 6 diff)
    let changed = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const o = (y * a.w + x) * a.bytesPP;
      if (Math.abs(a.data[o] - b.data[o]) > 6 || Math.abs(a.data[o + 1] - b.data[o + 1]) > 6 || Math.abs(a.data[o + 2] - b.data[o + 2]) > 6) changed++;
    }
    console.log(`${name} ${vp} | ${a.w}x${a.h} | ${(ringA / n - ringB / n).toFixed(2)} | ${Math.round(changed * 100 / (a.w * a.h))}%`);
  }
}
