// Final-design probe (Builder-3, wave2c): greedy tightest-pair-first clique grouping.
// Pairs within the stack threshold (2 css px at current zoom, device-scaled) enter a
// queue sorted by distance; the tightest unassigned pair seeds a group that grows only
// with pins stacked on ALL current members (mutual = renders as one dot); cap N arms.
// Verifies: group-size histograms per width/zoom, the named clusters (Ateneul↔Muzeul,
// Peleș trio), leader counts, and that members' rendered arms separate >= ~6 css px.
import {chromium} from '@playwright/test';

const BASE = process.env.AFLIVRA_BASE || 'http://127.0.0.1:5173';
const TARGET = 11.5; // css px between adjacent fan arms
const STACK_CSS = 2; // stack threshold in css px
const CAP = 6;       // max arms per fan group

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(BASE + '/#view=map');
await page.waitForSelector('.map-workspace .romap g.map-pin');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});
const pins = await page.evaluate(() => {
  const svg = document.querySelector('.map-workspace .romap svg');
  return [...svg.querySelectorAll('g.map-pin')].map(g => {
    const [x, y] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
    return {label: (g.getAttribute('aria-label') || '').replace('Selectează ', ''), x, y};
  });
});
await browser.close();

// Greedy tightest-first grouping. Deterministic: distance-sorted pairs with
// array-order tiebreak; groups grow only with mutual-stacked unassigned pins.
function declutter(pins, tol, targetCss, width) {
  const idx = new Map(pins.map((p, i) => [p.label, i]));
  const pairs = [];
  for (let a = 0; a < pins.length; a++) for (let b = a + 1; b < pins.length; b++) {
    const d = Math.hypot(pins[a].x - pins[b].x, pins[a].y - pins[b].y);
    if (d < tol) pairs.push({a, b, d});
  }
  pairs.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  const assigned = new Set();
  const groups = [];
  for (const seed of pairs) {
    if (assigned.has(seed.a) || assigned.has(seed.b)) continue;
    const g = [seed.a, seed.b];
    assigned.add(seed.a); assigned.add(seed.b);
    // clique-extension: pins stacked on ALL group members, in array order
    for (let c = 0; c < pins.length && g.length < CAP; c++) {
      if (assigned.has(c)) continue;
      if (g.every(m => Math.hypot(pins[m].x - pins[c].x, pins[m].y - pins[c].y) < tol)) { g.push(c); assigned.add(c); }
    }
    groups.push(g.map(i => pins[i]));
  }
  // fan geometry: centroid + fixed angles by array order; radius scaled by need
  const off = new Map();
  for (const g of groups) {
    const n = g.length;
    const cx = g.reduce((a, m) => a + m.x, 0) / n, cy = g.reduce((a, m) => a + m.y, 0) / n;
    let sep = 0;
    for (const m of g) for (const q of g) sep = Math.max(sep, Math.hypot(m.x - q.x, m.y - q.y));
    const sepCss = sep * (width / 640); // local -> css at zoom 1 (probe basis)
    const rCss = (targetCss / (2 * Math.sin(Math.PI / n))) * Math.max(0, (targetCss - sepCss) / targetCss);
    const rLocal = rCss * 640 / width;
    g.forEach((m, k) => {
      const ang = n === 2 ? (k === 0 ? 0 : Math.PI) : -Math.PI / 2 + k * 2 * Math.PI / n;
      off.set(m.label, {x: cx + rLocal * Math.cos(ang), y: cy + rLocal * Math.sin(ang)});
    });
  }
  return {groups, off};
}

const report = {widths: {}};
for (const width of [820, 354]) {
  const wRep = {};
  for (const [zoom, tag] of [[1, 'zoom1'], [2.8, 'zoom2.8']]) {
    const tol = STACK_CSS * 640 / (width * zoom);
    const {groups, off} = declutter(pins, tol, TARGET, width);
    const sizes = groups.map(g => g.length);
    const hist = {};
    for (const s of sizes) hist[s] = (hist[s] || 0) + 1;
    // rendered pairwise css separation inside each group + cross-group stacked leftovers
    let minSep = Infinity, worst = '';
    for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const A = off.get(g[i].label), B = off.get(g[j].label);
      const sepCss = Math.hypot(A.x - B.x, A.y - B.y) * (width / 640);
      if (sepCss < minSep) { minSep = sepCss; worst = g[i].label + ' ~ ' + g[j].label; }
    }
    const named = {};
    for (const want of ['Ateneul Român', 'Muzeul Colecțiilor de Artă', 'Castelul Peleș', 'Castelul Pelișor', 'Mănăstirea Sinaia'])
      for (const g of groups) if (g.some(m => m.label === want)) { (named[want] ||= []).push(g.map(m => m.label)); break; }
    // the cluster the task names by name must actually fan
    const ateneuSep = (off.get('Ateneul Român') && off.get('Muzeul Colecțiilor de Artă'))
      ? Math.hypot(off.get('Ateneul Român').x - off.get('Muzeul Colecțiilor de Artă').x, off.get('Ateneul Român').y - off.get('Muzeul Colecțiilor de Artă').y) * (width / 640) : null;
    wRep[tag] = {tol: +tol.toFixed(3), groups: groups.length, members: sizes.reduce((a, b) => a + b, 0),
      histogram: hist, largest: Math.max(...sizes, 0), minPairSepCss: +minSep.toFixed(2), worstPair: worst,
      ateneuMuzeulRenderedSepCss: ateneuSep != null ? +ateneuSep.toFixed(2) : null, named};
  }
  report.widths[width] = wRep;
}
console.log(JSON.stringify(report, null, 1));
