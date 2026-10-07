// Seeded-star clustering probe (Builder-3, wave2c): the candidate declutter groups a
// pin with the pins within the stack threshold OF THE SEED (array order), never
// transitively — the Bucharest old-town density must decompose into pairs/trios,
// not an 80-arm octopus. Reports histograms + the named clusters + fan-arm collisions.
import {chromium} from '@playwright/test';

const BASE = process.env.AFLIVRA_BASE || 'http://127.0.0.1:5173';

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

// Seeded star clusters: sweep pins in array order; an unclustered pin seeds a group
// with all still-unclustered pins within tol of the seed. No transitive chaining.
function seeded(pins, tol) {
  const taken = new Set();
  const clusters = [];
  for (const p of pins) {
    if (taken.has(p.label)) continue;
    const members = [p];
    taken.add(p.label);
    for (const q of pins) if (!taken.has(q.label) && Math.hypot(p.x - q.x, p.y - q.y) < tol) { members.push(q); taken.add(q.label); }
    if (members.length > 1) clusters.push(members);
  }
  return clusters;
}

const TARGET = 11.5; // css px between adjacent fan arms
const report = {widths: {}};
for (const width of [820, 354]) {
  const wRep = {};
  for (const [zoom, tag] of [[1, 'zoom1'], [2.8, 'zoom2.8']]) {
    const tol = 2 * 640 / (width * zoom); // 2 css px stack threshold, svg local units
    const cl = seeded(pins, tol);
    const sizes = cl.map(g => g.length);
    const hist = {};
    for (const s of sizes) hist[s] = (hist[s] || 0) + 1;
    // named clusters
    const named = {};
    for (const want of ['Ateneul Român', 'Muzeul Colecțiilor de Artă', 'Castelul Peleș', 'Castelul Pelișor', 'Mănăstirea Sinaia'])
      for (const g of cl) if (g.some(m => m.label === want)) { (named[want] ||= []).push(...g.map(m => m.label)); break; }
    // fan-arm collision check: does any displaced arm land within tol of an outsider pin?
    // fan: members in array order at angles (N=2: 0/180deg, else -90+k*360/N), r = TARGET/(2 sin(pi/N))
    const pos = new Map(pins.map(p => [p.label, [p.x, p.y]]));
    const displaced = new Set(cl.flat().map(m => m.label));
    const off = new Map();
    for (const g of cl) {
      const n = g.length;
      const r = (TARGET / (2 * Math.sin(Math.PI / n))) * 640 / width / zoom; // local units
      const cx = g.reduce((a, m) => a + m.x, 0) / n, cy = g.reduce((a, m) => a + m.y, 0) / n;
      g.forEach((m, k) => {
        const ang = (n === 2 ? [0, Math.PI] : [-Math.PI / 2 + k * 2 * Math.PI / n])[k] ?? 0;
        off.set(m.label, [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
      });
    }
    let armCollisions = 0;
    const collisionDetail = [];
    for (const g of cl) for (const m of g) {
      const [ox, oy] = off.get(m.label);
      for (const q of pins) {
        if (g.some(x => x.label === q.label)) continue;
        if (Math.hypot(pos.get(q.label)[0] - ox, pos.get(q.label)[1] - oy) < tol) { armCollisions++; if (collisionDetail.length < 6) collisionDetail.push(m.label + ' ~ ' + q.label); }
      }
    }
    wRep[tag] = {tol: +tol.toFixed(3), clusters: cl.length, members: sizes.reduce((a, b) => a + b, 0),
      histogram: hist, largest: Math.max(...sizes),
      maxMembers: sizes.reduce((a, b) => Math.max(a, b)),
      named, armCollisions, collisionDetail};
  }
  report.widths[width] = wRep;
}
console.log(JSON.stringify(report, null, 1));
