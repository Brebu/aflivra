// Probe: the nearby places map honors the selected radius and refetches on pan.
// Run against the dev server (reused or own; the probe never starts one).
// Records: the captured /api/places pin requests (params + served totals + pin span),
// the rendered data-pins count per radius (5/50/100 km), and a 3-drag pan sequence log.
import {chromium} from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5173';
const km = (a, b) => {const rad = Math.PI/180, dlat = (b.lat-a.lat)*rad, dlon = (b.lon-a.lon)*rad,
  x = Math.sin(dlat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0,1-x)));};

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

const requests = [];
page.on('response', async response => {
  const url = response.url();
  if (!url.includes('/api/places')) return;
  let body = null;
  try { body = await response.json(); } catch {}
  requests.push({url: new URL(url).searchParams.toString(), status: response.status(),
    total: body?.data?.total ?? null, items: body?.data?.items?.length ?? null,
    error: body?.error ?? null});
});

async function touchDrag(x, y, dx, dy, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + (dx*i)/steps, y: y + (dy*i)/steps}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await cdp.detach();
}

await page.goto(BASE + '/#view=explore');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
// The first paint is the home tree (which has its own places-workspace); the hash
// route settles to explore a beat later. Wait for the EXPLORE tree, as the e2e legs do.
await page.waitForFunction(() => document.querySelector('main#vcontent')?.getAttribute('data-view') === 'explore'
  && document.querySelectorAll('section.places-workspace').length > 0, null, {timeout: 30000});
await page.waitForTimeout(1200);
const workspace = page.locator('section.places-workspace').first();
await workspace.locator('label', {hasText: 'Unde cauți'}).locator('select').selectOption('nearby');

const log = {radiusLegs: [], panSequence: [], pinsRequests: requests};
const awaitPinsAttr = async expectedTotal => {
  // The rendered pin count must equal the served total — including an honest 0
  // when the panned zone simply has no corpus elements.
  await page.waitForFunction(expected => {
    const el = document.querySelector('.public-map');
    return el && el.getAttribute('data-pins') !== null && Number(el.getAttribute('data-pins')) === expected;
  }, expectedTotal, {timeout: 60000});
};
const latestServed = async match => {
  for (let i = 0; i < 20; i++) {
    const found = [...requests].reverse().find(match);
    if (found) return found;
    await page.waitForTimeout(300);
  }
  throw new Error('no served pin request found for: ' + String(match));
};
const currentCenter = () => {
  const last = [...requests].reverse().find(r => r.url.includes('view=map'));
  const p = new URLSearchParams(last.url);
  return {lat: Number(p.get('lat')), lon: Number(p.get('lon')), url: last.url, total: last.total};
};

try {

// Enter the map view at the default radius, then walk 5 → 50 → 100 — each select is a
// real change that must fire one radius-relative pin request and render the full set.
const retrySelect = async (select, value) => {
  for (let attempt = 0; attempt < 12; attempt++) {
    try { await select.selectOption(value, {timeout: 4000}); return; }
    catch { await page.waitForTimeout(600); }
  }
  throw new Error('radius select never settled: ' + value);
};
await workspace.getByRole('button', {name: 'Harta paginii'}).click();
await page.waitForFunction(() => document.querySelectorAll('.leaflet-container').length > 0, null, {timeout: 60000});
const radiusSelect = workspace.locator('.entity-location label', {hasText: 'Rază'}).locator('select');
const radiusParamsOf = url => new URLSearchParams(url);
for (const radius of ['5', '50', '100']) {
  await retrySelect(radiusSelect, radius);
  await page.waitForResponse(r => r.url().includes('/api/places') && r.url().includes('view=map') && radiusParamsOf(r.url()).get('radius') === radius, {timeout: 60000});
  const served = await latestServed(r => r.url.includes('view=map') && new URLSearchParams(r.url).get('radius') === radius);
  await awaitPinsAttr(served.total);
  const c = currentCenter();
  let span = null;
  if (served.total) {
    const body = await page.evaluate(async url => await (await fetch(url)).json(), new URL(BASE + '/api/places?' + served.url).toString());
    const pins = body.data.items;
    span = Math.round(Math.max(...pins.map(r => km(c, {lat: r.lat, lon: r.lon}))) * 10) / 10;
  }
  log.radiusLegs.push({radiusKm: Number(radius), requestParams: served.url, servedTotal: served.total,
    dataPins: await page.evaluate(() => document.querySelector('.public-map').getAttribute('data-pins')), pinSpanKm: span});
}

// Pan sequence: three settled drags, each expected to refetch for its own new center
// (vectors kept over Romanian land: NE from Bucharest, then N, then NW).
await page.evaluate(() => document.querySelector('.public-map').scrollIntoView({block: 'center', behavior: 'instant'}));
await page.waitForTimeout(1200);
let step = 0;
for (const [dx, dy] of [[-90, -140], [0, 144], [-90, 140]]) {
  step++;
  const before = currentCenter();
  const requestCount = requests.length;
  const {x, y} = await page.evaluate(() => {
    const el = document.querySelector('.public-map');
    const r = el.getBoundingClientRect();
    return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};
  });
  await touchDrag(x, y, dx, dy);
  await page.waitForResponse(r => {
    if (!r.url().includes('/api/places') || !r.url().includes('view=map')) return false;
    const p = new URLSearchParams(new URL(r.url()).search);
    return Number(p.get('lat')) !== before.lat || Number(p.get('lon')) !== before.lon;
  }, {timeout: 60000});
  const after = await latestServed(r => r.url.includes('view=map')
    && (() => {const p = new URLSearchParams(r.url); return Number(p.get('lat')) !== before.lat || Number(p.get('lon')) !== before.lon;})()
    && requests.indexOf(r) >= requestCount);
  await awaitPinsAttr(after.total);
  log.panSequence.push({step, drag: [dx, dy], from: {lat: before.lat, lon: before.lon},
    to: {lat: Number(new URLSearchParams(after.url).get('lat')), lon: Number(new URLSearchParams(after.url).get('lon'))},
    centerDeltaKm: Math.round(km(before, {lat: Number(new URLSearchParams(after.url).get('lat')), lon: Number(new URLSearchParams(after.url).get('lon'))}) * 10) / 10,
    newPinsRequests: requests.slice(requestCount).filter(r => r.url.includes('view=map')).length,
    pinsRendered: after.total, servedTotal: after.total, requestParams: after.url});
}

await page.screenshot({path: new URL('./nearby-map-pan-after.png', import.meta.url).pathname, fullPage: false});
fs.writeFileSync(new URL('./nearby-map-probe.json', import.meta.url).pathname, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));

} catch (failure) {
  log.domAtFailure = await page.evaluate(() => ({
    view: document.querySelector('main#vcontent')?.getAttribute('data-view'),
    mapPins: document.querySelector('.public-map')?.getAttribute('data-pins'),
    header: document.querySelector('section.places-workspace .entity-results-header p')?.textContent?.slice(0, 100),
    statuses: [...document.querySelectorAll('section.places-workspace [role=status]')].map(e => e.textContent.slice(0, 60)),
  })).catch(() => null);
  log.failure = String(failure).slice(0, 400);
  fs.writeFileSync(new URL('./nearby-map-probe.json', import.meta.url).pathname, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  throw failure;
}
await browser.close();
