// Cluster-geometry probe for the map-declutter design (Builder-3, wave2c).
// Reads the REAL merged pin set from the running app (#view=map) and reports,
// per tolerance, the connected-component clusters the declutter would fan out:
// membership, local-unit pairwise distances, and the rendered CSS-px scale.
import {chromium} from '@playwright/test';

const TOLS = [24, 12.5, 25, 35]; // candidate collision tolerances, svg units at zoom 1

const BASE = process.env.AFLIVRA_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(BASE + '/#view=map');
await page.waitForSelector('.map-workspace .romap g.map-pin');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});

const data = await page.evaluate(tols => {
  const svg = document.querySelector('.map-workspace .romap svg');
  const ctm = svg.getScreenCTM();
  const pins = [...svg.querySelectorAll('g.map-pin')].map((g, i) => {
    const [x, y] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
    return {i, label: (g.getAttribute('aria-label') || '').replace('Selectează ', ''), x, y};
  });
  const clusters = tols.map(tol => {
    // union-find over pairs within tol
    const parent = pins.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const pairs = [];
    for (let a = 0; a < pins.length; a++) for (let b = a + 1; b < pins.length; b++) {
      const d = Math.hypot(pins[a].x - pins[b].x, pins[a].y - pins[b].y);
      if (d < tol) { parent[find(a)] = find(b); pairs.push({a: pins[a].label, b: pins[b].label, d: +d.toFixed(2)}); }
    }
    const groups = new Map();
    pins.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); });
    const multi = [...groups.values()].filter(g => g.length > 1);
    return {tol, clusterCount: multi.length, sizes: multi.map(g => g.length),
      pairs: pairs.sort((a, b) => a.d - b.d),
      clusters: multi.map(g => ({members: g.map(p => p.label), span: +Math.max(...g.flatMap(p1 => g.map(p2 => Math.hypot(p1.x - p2.x, p1.y - p2.y)))).toFixed(2)}))};
  });
  const scaleInfo = {clientWidth: svg.clientWidth, clientHeight: svg.clientHeight,
    viewBoxToCssScale: +(ctm.a).toFixed(4)};
  return {pinCount: pins.length, ctms: scaleInfo, pairs24: clusters[0].pairs, clusters};
}, TOLS);

console.log(JSON.stringify(data, null, 1));
await browser.close();
