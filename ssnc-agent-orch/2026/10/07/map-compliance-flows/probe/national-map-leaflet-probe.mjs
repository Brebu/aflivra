// Session probe (feat/national-map-leaflet, 2026-10-08): the national repere map on the
// shared Leaflet/OSM surface, at the initial fit (zoom ~6) and after real zooming to 12
// via the map's own + control. Real OSM tiles load client-side in this dev browser (the
// probe is not a test); evidence is DOM-measured: pin census, visible-pin geometry,
// displayed tile zoom (from the loaded tiles' own URLs), page-error capture — plus the
// two screenshots next to this file.
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto('http://127.0.0.1:5173/#view=map');
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'map', null, {timeout: 30000});
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForSelector('.map-workspace .public-map.leaflet-container', {timeout: 60000});
await page.waitForSelector('.map-workspace .public-map button.repere-pin', {timeout: 30000});
await page.locator('.map-workspace .public-map').scrollIntoViewIfNeeded();
await page.waitForTimeout(2500); // settle the initial fitBounds + the first tile round

const measure = () => page.evaluate(() => {
  const map = document.querySelector('.map-workspace .public-map');
  const mr = map.getBoundingClientRect();
  const buttons = [...map.querySelectorAll('button.repere-pin')];
  const visible = buttons.filter(b => {
    const r = b.getBoundingClientRect();
    return r.top >= mr.top - 40 && r.bottom <= mr.bottom + 40 && r.left >= mr.left - 40 && r.right <= mr.right + 40;
  });
  const zs = [...map.querySelectorAll('img.leaflet-tile.leaflet-tile-loaded')]
    .map(img => Number(new URL(img.src).pathname.split('/')[1]))
    .filter(z => Number.isFinite(z));
  return {
    pins: buttons.length,
    visiblePins: visible.length,
    chosen: map.querySelectorAll('button.repere-pin.chosen').length,
    loadedTiles: zs.length,
    displayedTileZoom: Math.max(0, ...zs),
    attribution: (map.querySelector('.leaflet-control-attribution')?.textContent || '').trim(),
  };
});

const atFit = await measure();
// The initial fit lands z7 on this 1280×800 viewport; the national overview shot is the
// asked-for zoom 6 — one real zoom-out click on the map's own − control.
await page.locator('.map-workspace .public-map .leaflet-control-zoom-out').click();
await page.waitForTimeout(1500);
const at6 = await measure();
await page.screenshot({path: 'ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/national-map-zoom6.png'});

// Real zoom to level 12 centered on the Sinaia repere cluster: Leaflet's dblclick zoom
// (+1 per dblclick, anchored on the clicked point), re-aimed beside the Peleș pin at
// every step (14 px at the current scale, never ON a pin — its single click opens the
// place). Each dblclick recenters the map onto the cluster it is zooming into.
for (let i = 0; i < 6; i++) {
  const anchor = await page.evaluate(() => {
    const pin = document.querySelector('.map-workspace .public-map button.repere-pin[aria-label="Selectează Castelul Peleș"]');
    if (!pin) throw new Error('the Peleș pin is missing');
    const r = pin.getBoundingClientRect();
    const map = document.querySelector('.map-workspace .public-map');
    const mr = map.getBoundingClientRect();
    const blocked = (px, py) => [...map.querySelectorAll('button.repere-pin')].some(b => {
      const q = b.getBoundingClientRect();
      return px >= q.left && px <= q.right && py >= q.top && py <= q.bottom;
    });
    let x = r.left + r.width / 2 + 14, y = r.top + r.height / 2;
    for (let s = 14; blocked(x, y); s += 14) { x = r.left + r.width / 2 + s; }
    if (x < mr.left || x > mr.right || y < mr.top || y > mr.bottom) throw new Error('anchor left the visible map');
    return {x: Math.round(x), y: Math.round(y)};
  });
  await page.mouse.dblclick(anchor.x, anchor.y);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(2500); // let the tile rounds settle
const at12 = await measure();
await page.screenshot({path: 'ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/national-map-zoom12.png'});

const report = {
  initialFit: atFit,
  atZoom6: at6,
  afterDblclickZoomTo12: at12,
  zoomSteps: {zoomOutClicks: 1, dblclicksBesideAPin: 6},
  pageErrors: errors,
};
writeFileSync('ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/national-map-leaflet-probe.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
