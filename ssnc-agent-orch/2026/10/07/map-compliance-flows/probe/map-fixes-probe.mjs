// Probe evidence for the map-compliance fixes — runs against the local dev server.
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/map-fixes-probe.mjs
// Leg 1: Tranzy transit map at Cluj-Napoca (non-București locality) with a stale
//        labeled copy and the radius selector at 100 km — fixtures only.
// Leg 2: places map layer at 100 km radius serving the fuller page (real local API).
import {chromium} from '@playwright/test';

const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 940}});
const page = await context.newPage();

async function switchLocality(locality) {
  await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Localitate', {exact: true}).fill(locality);
  await sheet.getByRole('button', {name: 'Aplică localitatea'}).click();
  await page.keyboard.press('Escape');
  await sheet.waitFor({state: 'hidden', timeout: 20_000});
}

// ── Leg 1: stale Tranzy vehicles at Cluj-Napoca, radius selector at 100 km ──
const minutes = 7;
const observedAt = new Date(Date.now() - minutes * 60_000).toISOString();
const at = (name, routeId, lat, lon) => ({id: 'tz-' + routeId + '-' + name, routeId, tripId: 't-' + routeId,
  vehicleName: name, licensePlate: '', lat, lon, stopId: '', observedAt, bearing: null, speed: 9.1,
  occupancy: null, occupancyPercentage: null, wheelchairAccessible: null, currentStatus: null, details: {}});
const items = [
  at('Tramvaiul din centru', '25', 46.7712, 23.6236),
  at('Autobuzul de lângă gară', '30', 46.78, 23.59),
  at('Troleibuzul de la Florești', '41', 46.73, 23.51),
  at('Autobuzul de la Apahida', '42', 46.81, 23.78),
  at('Tramvaiul de la Gilău', '43', 46.73, 23.38),
  at('Autobuzul de la Cojocna', '44', 46.75, 23.85),
];
let tranzyUrls = [];
await page.route('**/api/tranzy-live*', async route => {
  tranzyUrls.push(route.request().url());
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
    key: 'transport:tranzy:vehicles:probe', name: 'Tranzy · CTP Cluj-Napoca', url: 'https://api.tranzy.ai/v1/opendata/vehicles',
    adapterVersion: 'tranzy.vehicles.v1', status: 'fresh', publishedAt: observedAt, lastSuccessAt: observedAt,
    lastAttemptAt: new Date().toISOString(), nextAttemptAt: null, error: null, ttlSeconds: 30,
    data: {kind: 'vehicles', observedAt, isLive: false, stalenessMinutes: minutes, agency: 'CTP Cluj-Napoca',
      page: 0, pages: 1, total: items.length, entityCount: items.length, items},
  })});
});
await page.goto(base + '/#view=domain&id=transport&tab=vehicles');
await page.waitForSelector('section.transit-workspace h2', {timeout: 40_000});
await switchLocality('Cluj-Napoca');
const workspace = page.locator('section.transit-workspace');
await workspace.locator('.public-map').waitFor({state: 'visible', timeout: 60_000});
const radiusSelect = workspace.locator('label', {hasText: 'Rază'}).locator('select');
await radiusSelect.selectOption('100');
await page.waitForTimeout(1_500);
const caption = await workspace.locator('p.small-muted, p.source-warning').first().innerText();
console.log('tranzy caption:', caption.replace(/\s+/g, ' '));
console.log('tranzy request carries radius=100:', tranzyUrls.some(url => url.includes('radius=100')));
await workspace.locator('.public-map').scrollIntoViewIfNeeded();
await page.waitForTimeout(1_200);
await page.screenshot({path: outDir + 'transit-cluj-stale-radius100.png', fullPage: false});

// ── Leg 2: places map layer at 100 km radius serving the fuller page ──
await page.goto(base + '/#view=domain&id=cultura&tab=places');
const places = page.locator('section.places-workspace').first();
await places.waitFor({state: 'visible', timeout: 40_000});
await places.locator('label', {hasText: 'Unde cauți'}).locator('select').selectOption('nearby');
const radiusPicker = places.locator('.entity-location label', {hasText: 'Rază'}).locator('select');
await radiusPicker.waitFor({state: 'visible', timeout: 20_000});
await radiusPicker.selectOption('100');
await places.getByRole('button', {name: 'Resetează filtrele'}).waitFor({state: 'visible'});
const mapRequest = page.waitForResponse(response => response.url().includes('/api/places') && response.url().includes('pageSize=200'), {timeout: 60_000});
await places.getByRole('button', {name: 'Harta paginii'}).click();
const mapBody = await (await mapRequest).json();
console.log('places map pageSize:', mapBody.data.pageSize, 'items:', mapBody.data.items.length, 'of total:', mapBody.data.total);
await places.locator('.public-map').waitFor({state: 'visible', timeout: 60_000});
await page.waitForTimeout(2_500);
await places.locator('.public-map').scrollIntoViewIfNeeded();
await page.screenshot({path: outDir + 'places-map-radius100.png', fullPage: false});

await browser.close();
console.log('probe done');
