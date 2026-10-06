import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

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
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2 && colorType !== 3)) throw new Error(`unsupported png ${file}: depth=${bitDepth} color=${colorType}`);
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
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
        v = (v + pred) & 255;
      }
      cur[x] = v;
    }
  }
  return { w, h, bytesPP, data: out };
};

const diffPair = (name) => {
  const A = decode(`ssnc-agent-orch/2026/10/06/design-alignment-pass/screens/${name}-ours.png`);
  const B = decode(`ssnc-agent-orch/2026/10/06/design-alignment-pass/screens/${name}-orig.png`);
  if (A.w !== B.w || A.h !== B.h) return { name, note: `size mismatch ours ${A.w}x${A.h} vs orig ${B.w}x${B.h}` };
  const rowsDiff = [];
  for (let y = 0; y < A.h; y += 40) {
    let cnt = 0;
    const band = Math.min(40, A.h - y);
    for (let yy = 0; yy < band; yy++) for (let x = 0; x < A.w; x++) {
      const o = ((y + yy) * A.w + x) * 4;
      if (Math.abs(A.data[o] - B.data[o]) > 24 || Math.abs(A.data[o + 1] - B.data[o + 1]) > 24 || Math.abs(A.data[o + 2] - B.data[o + 2]) > 24) cnt++;
    }
    rowsDiff.push({ fromPx: y, cssY: Math.round(y / 2), pct: Math.round(cnt * 100 / (band * A.w)) });
  }
  const total = Math.round(rowsDiff.reduce((s, r) => s + r.pct, 0) / rowsDiff.length);
  const hot = rowsDiff.filter(r => r.pct >= 3).slice(0, 8);
  return { name, dims: `${A.w}x${A.h}`, avgDiffPct: total, hotRegions: hot };
};

for (const v of ['home', 'explore', 'place', 'justitie']) console.log(JSON.stringify(diffPair(v)));
