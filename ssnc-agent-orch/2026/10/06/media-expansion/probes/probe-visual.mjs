// Visual probe — evidence screenshots for the media-expansion builder-B change set:
// 1) the live-map vehicle heading marker (rotated SVG arrow + aria + popup telemetry),
//    rendered from a controlled operator-shaped TPBI payload (deterministic at any hour);
// 2) the same view against the REAL un-stubbed operator feed (honest live state record);
// 3) the mediu places workspace filtered to the new corpus subcategories
//    (Adăposturi, Spații de odihnă) rendering shelter record cards.
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, 'screenshots');
mkdirSync(out, {recursive: true});
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();

// Part 1 + 2: the transport live vehicles map.
{
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // Controlled, operator-shaped payload: bearing 87° (spre est), 45 km/h, few seats
  // + 45% occupancy, plus one vehicle without bearing (circle-marker fallback).
  await page.route('**/api/transport-live*', route => {
    const now = new Date().toISOString();
    const vehicle = (id, name, extra) => ({
      id, routeId: 'test-route', tripId: 'test-trip', vehicleName: name, licensePlate: '',
      lat: 44.427, lon: 26.103, stopId: '', observedAt: now,
      wheelchairAccessible: null, currentStatus: 'IN_TRANSIT_TO', details: {},
      bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45, ...extra,
    });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: 2, entityCount: 2, items: [
        vehicle('veh-heading-1', 'Autobuzul cu direcție', {}),
        vehicle('veh-no-bearing-2', 'Autobuzul fără direcție', {bearing: null}),
      ]}}),
    });
  });

  await page.goto(base + '/#view=domain&id=transport&tab=vehicles');
  await page.waitForSelector('section.transit-workspace .public-map [role="img"]', {timeout: 90_000});
  const marker = page.locator('.public-map [role="img"]').first();
  console.log('heading marker aria-label:', await marker.getAttribute('aria-label'));
  console.log('heading marker svg rotation:', await marker.locator('svg g').getAttribute('transform'));
  await marker.click();
  await page.waitForSelector('.leaflet-popup', {timeout: 15_000});
  console.log('popup text:', (await page.locator('.leaflet-popup').innerText()).replace(/\s+/g, ' '));
  await page.screenshot({path: path.join(out, 'vehicle-heading-marker.png'), fullPage: false});
  await context.close();

  // Honest live record: no interception — whatever TPBI publishes at this hour.
  const liveContext = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const livePage = await liveContext.newPage();
  await livePage.goto(base + '/#view=domain&id=transport&tab=vehicles');
  await livePage.waitForSelector('section.transit-workspace', {timeout: 60_000});
  await livePage.waitForTimeout(20_000);
  const liveMarkers = await livePage.locator('.public-map [role="img"]').count();
  const liveNote = (await livePage.locator('section.transit-workspace').innerText()).replace(/\s+/g, ' ').slice(0, 400);
  console.log('REAL feed at probe time — rotated markers on map:', liveMarkers);
  console.log('REAL feed section text head:', liveNote);
  await livePage.screenshot({path: path.join(out, 'vehicle-live-real-feed.png'), fullPage: false});
  await liveContext.close();
}

// Part 3: the shelters subcategories in the mediu corpus workspace.
{
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(base + '/#view=domain&id=mediu');
  await page.waitForSelector('section.places-workspace', {timeout: 60_000});
  const sub = page.locator('section.places-workspace label', {hasText: 'Subcategorie'}).locator('select');
  await page.waitForSelector('section.places-workspace label[...] select option'.replace('[...]',''), {timeout: 30_000}).catch(() => {});
  await sub.locator('option', {hasText: 'Adăposturi'}).waitFor({state: 'attached', timeout: 30_000});

  await sub.selectOption('Adăposturi');
  const header = page.locator('.entity-results-header');
  await header.waitFor({timeout: 60_000});
  await page.waitForSelector('.entity-card', {timeout: 60_000});
  await page.waitForTimeout(1_500);
  console.log('Adăposturi results line:', (await header.innerText()).replace(/\s+/g, ' '));
  await page.screenshot({path: path.join(out, 'shelters-adăposturi.png'), fullPage: false});

  await sub.selectOption('Spații de odihnă');
  await page.waitForTimeout(2_500);
  console.log('Spații de odihnă results line:', (await header.innerText()).replace(/\s+/g, ' '));
  await page.screenshot({path: path.join(out, 'shelters-spatii-de-odihna.png'), fullPage: false});

  console.log('probe page errors:', errors);
  await context.close();
}

await browser.close();
console.log('probe screenshots written to', out);
