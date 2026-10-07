// Cluster-size probe (Builder-3, wave2c): for CSS-px stack thresholds, how many
// connected-component clusters exist, their size histogram, and the biggest ones.
// Decides whether fixed-angle star fan-out is tasteful at compact zoom.
import {chromium} from '@playwright/test';

const BASE = process.env.AFLIVRA_BASE || 'http://127.0.0.1:5173';
const WIDTH = Number(process.env.PROBE_WIDTH || 820);

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(BASE + '/#view=map');
await page.waitForSelector('.map-workspace .romap g.map-pin');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});

const out = await page.evaluate(() => {
  const svg = document.querySelector('.map-workspace .romap svg');
  return [...svg.querySelectorAll('g.map-pin')].map(g => {
    const [x, y] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
    return {label: (g.getAttribute('aria-label') || '').replace('Selectează ', ''), x, y};
  });
}, {WIDTH});

function clusters(pins, tol) {
  const parent = pins.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < pins.length; a++) for (let b = a + 1; b < pins.length; b++)
    if (Math.hypot(pins[a].x - pins[b].x, pins[a].y - pins[b].y) < tol) parent[find(a)] = find(b);
  const groups = new Map();
  pins.forEach((p, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p.label); });
  return [...groups.values()].filter(g => g.length > 1);
}

const report = {pins: out.length, width: WIDTH, thresholds: {}};
for (const css of [1.5, 2, 2.5, 3]) {
  const u1 = css * 640 / WIDTH;             // zoom 1
  const u28 = css * 640 / (WIDTH * 2.8);    // max zoom
  for (const [tag, u] of [['zoom1', u1], ['zoom2.8', u28]]) {
    const cl = clusters(out, u);
    const sizes = cl.map(g => g.length);
    const hist = {};
    for (const s of sizes) hist[s] = (hist[s] || 0) + 1;
    report.thresholds[`${css}px@${tag}`] = {
      unitThreshold: +u.toFixed(3), clusterCount: cl.length, members: sizes.reduce((a, b) => a + b, 0),
      histogram: hist,
      biggest: [...cl].sort((a, b) => b.length - a.length).slice(0, 4).map(g => ({n: g.length, members: g.slice(0, 14)})),
    };
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
