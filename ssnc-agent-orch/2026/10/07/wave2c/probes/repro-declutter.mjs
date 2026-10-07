// Offline reproduction of declutterPins (verbatim from app/v2-charts.tsx) against the
// real pin corpus, instrumented on the Muzeul Colecții pin whose displacement exceeded
// the cap in the live render.
import fs from 'node:fs';

const pins = JSON.parse(fs.readFileSync('/tmp/alfivra-pins.json', 'utf8'));

function declutterPins(pins, zoom, width) {
  const k = Math.max(width, 1) / 640 * zoom, stack = 2 / k, target = 11.5 / k, cap = 23 / k;
  const pos = pins.map(p => { const x = (p.lon - 20) * 61, y = (49.1 - p.lat) * 84; return {id: p.id, name: p.name, x, y, ox: 0, oy: 0}; });
  const watch = pos.map((q, i) => ({q, i})).filter(w => w.q.name === 'Muzeul Colecțiilor de Artă')[0];
  const trace = [];
  const pairs = [];
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) { const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y); if (d < stack) pairs.push([i, j, d]); }
  pairs.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  const taken = new Array(pos.length).fill(false);
  for (const [i, j, d] of pairs) {
    if (taken[i] || taken[j]) continue;
    taken[i] = taken[j] = true;
    const a = pos[i], b = pos[j], dx = d < 1e-9 ? 1 : (a.x - b.x) / d, dy = d < 1e-9 ? 0 : (a.y - b.y) / d, push = Math.max(0, target - d) / 2;
    a.ox += dx * push; a.oy += dy * push; b.ox -= dx * push; b.oy -= dy * push;
    if (watch && (i === watch.i || j === watch.i)) trace.push({phase: 'match', partner: i === watch.i ? pos[j].name : pos[i].name, d: +d.toFixed(3), push: +push.toFixed(3), b: watch ? [+(watch.q.ox).toFixed(2), +(watch.q.oy).toFixed(2)] : null});
  }
  for (let round = 0; round < 2; round++) {
    const res = [];
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) { const d = Math.hypot(pos[i].x + pos[i].ox - pos[j].x - pos[j].ox, pos[i].y + pos[i].oy - pos[j].y - pos[j].oy); if (d < stack) res.push([i, j, d]); }
    res.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
    for (const [i, j] of res) {
      const b = pos[j], vx = (pos[i].x + pos[i].ox) - (b.x + b.ox), vy = (pos[i].y + pos[i].oy) - (b.y + b.oy), cur = Math.hypot(vx, vy);
      if (cur >= stack) continue;
      const dx = cur < 1e-9 ? 1 : vx / cur, dy = cur < 1e-9 ? 0 : vy / cur;
      const push = Math.min(target - cur, Math.max(0, cap - Math.hypot(b.ox, b.oy)));
      b.ox -= dx * push; b.oy -= dy * push;
      if (watch && j === watch.i) trace.push({phase: 'repair' + round, vs: pos[i].name, d: +cur.toFixed(3), push: +push.toFixed(3), after: [+(b.ox).toFixed(2), +(b.oy).toFixed(2)]});
    }
  }
  const watchOut = watch ? {name: watch.q.name, disp: [+(watch.q.ox).toFixed(3), +(watch.q.oy).toFixed(3)], len: +Math.hypot(watch.q.ox, watch.q.oy).toFixed(3)} : null;
  const maxDisp = Math.max(...pos.map(q => Math.hypot(q.ox, q.oy)));
  const stats = {k, stack: +stack.toFixed(3), target: +target.toFixed(3), cap: +cap.toFixed(3),
    matchedPairs: pairs.filter(([i, j], n) => taken[i] && taken[j]).length, displaced: pos.filter(q => q.ox || q.oy).length,
    maxDispLen: +maxDisp.toFixed(2), overCap: pos.filter(q => Math.hypot(q.ox, q.oy) > cap + 1e-6).map(q => q.name)};
  return {stats, watchOut, trace};
}

console.log(JSON.stringify(declutterPins(pins, 1, 820), null, 1));
