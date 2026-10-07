// Probe (Builder-3, wave2c): screenshots of the decluttered stacks at compact zoom —
// the Sinaia trio fan and the Ateneul ↔ Muzeul Colecțiilor pair with their leaders —
// plus the rendered geometry numbers that back the e2e legs.
import {chromium} from '@playwright/test';

const BASE = process.env.AFLIVRA_BASE || 'http://127.0.0.1:5173';
const OUT = 'ssnc-agent-orch/2026/10/07/wave2c/probes/';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(BASE + '/#view=map');
await page.waitForSelector('.map-workspace .romap g.map-pin');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});

const geo = await page.evaluate(() => {
  const svg = document.querySelector('.map-workspace .romap svg');
  const pin = label => {
    const g = svg.querySelector(`g.map-pin[aria-label="Selectează ${label}"]`);
    const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
    const ctm = svg.getScreenCTM();
    const c = new DOMPoint(tx, ty).matrixTransform(ctm);
    const page = {x: c.x + window.scrollX, y: c.y + window.scrollY};
    return {label, local: [tx, ty], css: [c.x, c.y], page: [page.x, page.y]};
  };
  const leaders = [...svg.querySelectorAll('g.map-leaders line')].length;
  return {
    ateneu: pin('Ateneul Român'), muzeul: pin('Muzeul Colecțiilor de Artă'),
    peles: pin('Castelul Peleș'), pelis: pin('Castelul Pelișor'), sinaia: pin('Mănăstirea Sinaia'),
    adam: pin('Cetatea romană Adamclisi'),
    leaders,
  };
});

const pairSep = Math.hypot(geo.ateneu.css[0] - geo.muzeul.css[0], geo.ateneu.css[1] - geo.muzeul.css[1]);
const pps = Math.hypot(geo.peles.css[0] - geo.pelis.css[0], geo.peles.css[1] - geo.pelis.css[1]);
const pss = Math.hypot(geo.peles.css[0] - geo.sinaia.css[0], geo.peles.css[1] - geo.sinaia.css[1]);
const lss = Math.hypot(geo.pelis.css[0] - geo.sinaia.css[0], geo.pelis.css[1] - geo.sinaia.css[1]);

const clipAround = (pts, pad = 70) => {
  const xs = pts.map(p => p.page[0]), ys = pts.map(p => p.page[1]);
  const x = Math.max(0, Math.min(...xs) - pad), y = Math.max(0, Math.min(...ys) - pad);
  const w = Math.max(...xs) + pad - x, h = Math.max(...ys) + pad - y;
  return {x, y, width: Math.max(w, 2 * pad), height: Math.max(h, 2 * pad)};
};

await page.screenshot({fullPage: true, path: OUT + 'decluster-sinaia-compact.png', clip: clipAround([geo.peles, geo.pelis, geo.sinaia])});
await page.screenshot({fullPage: true, path: OUT + 'decluster-ateneu-pair-compact.png', clip: clipAround([geo.ateneu, geo.muzeul])});

// Zoom in one step for the convergence shot (offsets recompose, leaders shrink).
await page.locator('.map-workspace .romap .map-controls button[aria-label="Mărește harta"]').click();
await page.waitForTimeout(200);
await page.screenshot({fullPage: true, path: OUT + 'decluster-sinaia-zoom1.3.png', clip: clipAround([geo.peles, geo.pelis, geo.sinaia])});

const zoomedGeo = await page.evaluate(() => {
  const svg = document.querySelector('.map-workspace .romap svg');
  const g = svg.querySelector('g.map-pin[aria-label="Selectează Castelul Peleș"]');
  const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
  const truth = [(25.54302 - 20) * 61, (49.1 - 45.359828) * 84];
  return {pelesLeaderLocal: Math.hypot(tx - truth[0], ty - truth[1])};
});

console.log(JSON.stringify({
  geometry: {
    ateneuMuzeulSepCss: +pairSep.toFixed(2),
    pelesPelisorSepCss: +pps.toFixed(2), pelesSinaiaSepCss: +pss.toFixed(2), pelisorSinaiaSepCss: +lss.toFixed(2),
    leaderCount: geo.leaders,
  },
  zoom13: zoomedGeo,
}, null, 1));
await browser.close();
