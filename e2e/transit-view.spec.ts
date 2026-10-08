import {test, expect, type Page} from '@playwright/test';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

// SSR markup is visible before React attaches handlers; the mount effect writes the
// preferences key, so a non-null read proves the client app is interactive.
async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

async function switchLocality(page: Page, locality: string) {
  await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Localitate', {exact: true}).fill(locality);
  await sheet.getByRole('button', {name: 'Aplică localitatea'}).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
}

test.describe('Transit network view', () => {
  test('the bundled TPBI network renders lines, stops and filters under the default locality', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=transport');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Linii, stații și orare'})).toBeVisible();

    // The complete network load is a heavy bundled artifact — budget generously
    // rather than weakening the structural assertions on it.
    await expect(workspace.locator('.entity-grid .transit-card').first()).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.entity-grid .transit-card h3').first()).toHaveText(/^Linia /);
    await expect(workspace.getByText(/rezultate? · copia integrală: [\d.]+ (?:de )?(?:linie|linii), [\d.]+ (?:de )?(?:stație|stații), [\d.]+ (?:de )?(?:cursă|curse)/)).toBeVisible();

    // Structure: kind chips, filters and the search control on the network mode.
    await expect(workspace.getByLabel('Caută linii, operatori, stații și informații de transport')).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Linii', exact: true})).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Stații', exact: true})).toBeVisible();
    await expect(workspace.locator('label', {hasText: 'Ordonare'}).first()).toBeVisible();

    // Stops switch renders station cards from the same bundled network.
    await workspace.getByRole('button', {name: 'Stații', exact: true}).click();
    await expect(workspace.locator('.entity-grid .transit-card').first()).toBeVisible({timeout: 30_000});

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a locality outside the TPBI coverage shows the explicit coverage note — not an error state', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();

    // Cluj-Napoca is outside the București–Ilfov TPBI coverage; the degraded
    // structure is an explicit, named message plus the transport inventory,
    // never a live-error block.
    await switchLocality(page, 'Cluj-Napoca');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Transport în Cluj-Napoca'})).toBeVisible();
    await expect(workspace.locator('.field-help').first()).toContainText('Nu avem încă o sursă validată pentru linii și orare în această zonă.');
    await expect(workspace.locator('.live-error')).toHaveCount(0);

    // The nearby transport inventory (stations, railways and transport services)
    // stays available inside the same section.
    await expect(workspace.locator('section.places-workspace').first()).toBeVisible({timeout: 30_000});
    await expect(workspace.locator('section.places-workspace').first().getByRole('heading', {name: 'Stații, gări și servicii de transport'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // A controlled, operator-shaped TPBI payload (same VehiclePosition fields the
  // real feed publishes) so the heading-marker rendering is asserted on the real
  // DOM deterministically — at any hour, with no upstream dependency.
  test('live vehicles render heading markers rotated by bearing, with direction, speed and occupancy', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.route('**/api/transport-live*', async route => {
      const now = new Date().toISOString();
      const vehicle = (id: string, name: string, extra: Record<string, unknown>) => ({
        id, routeId: 'test-route', tripId: 'test-trip', vehicleName: name, licensePlate: '',
        lat: 44.427, lon: 26.103, stopId: '', observedAt: now,
        wheelchairAccessible: null, currentStatus: 'IN_TRANSIT_TO', details: {},
        bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45, ...extra,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: 2, entityCount: 2, items: [
          vehicle('veh-heading-1', 'Autobuzul cu direcție', {}),
          vehicle('veh-no-bearing-2', 'Autobuzul fără direcție', {bearing: null}),
        ]}}),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Vehicule în circulație'})).toBeVisible();

    // The bundled network loads first; the live section then renders the stubbed feed.
    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});

    // Exactly one rotated heading marker: the vehicle with a bearing. The marker
    // SVG arrow is statically rotated by the bearing degrees (0° = north, clockwise).
    const headingMarker = workspace.locator('.public-map [role="img"]');
    await expect(headingMarker).toHaveCount(1);
    await expect(headingMarker).toHaveAttribute('aria-label', 'Transport public · Autobuzul cu direcție · spre est · 45.0 km/h · Puține locuri libere · ocupare 45%');
    await expect(headingMarker.locator('svg g')).toHaveAttribute('transform', 'rotate(87 14 14)');

    // The popup names the same telemetry: direction, speed and occupancy.
    await headingMarker.click();
    const popup = workspace.locator('.leaflet-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('spre est');
    await expect(popup).toContainText('45.0 km/h');
    await expect(popup).toContainText('Puține locuri libere · ocupare 45%');

    // The vehicle without a bearing keeps the canvas circle marker — no heading
    // role is invented for it, and both vehicles stay in the record list.
    await expect(workspace.locator('.public-map canvas')).toBeVisible();
    const records = workspace.locator('.transit-live-record');
    await expect(records).toHaveCount(2);
    await expect(records.filter({hasText: 'Autobuzul cu direcție'})).toContainText('45.0 km/h');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // A stale feed keeps every last-known position on the map, honestly labeled by
  // age (the flights pattern): the map surface must not disappear behind the
  // 120-second freshness rule — the age is the label, the positions stay drawn.
  test('a stale operator copy keeps every vehicle position on the map, labeled „poziții de acum ~7 minute”', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const minutes = 7;
    const observedAt = new Date(Date.now() - minutes * 60_000).toISOString();
    await page.route('**/api/transport-live*', async route => {
      const vehicle = (id: string, name: string, extra: Record<string, unknown>) => ({
        id, routeId: 'test-route', tripId: 'test-trip', vehicleName: name, licensePlate: '',
        lat: 44.427, lon: 26.103, stopId: '', observedAt,
        wheelchairAccessible: null, currentStatus: 'IN_TRANSIT_TO', details: {},
        bearing: 87, speed: 12.5, occupancy: null, occupancyPercentage: null, ...extra,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt, isLive: false, stalenessMinutes: minutes, page: 0, pages: 1, total: 2, entityCount: 2, items: [
          vehicle('veh-stale-1', 'Autobuzul cu direcție', {}),
          vehicle('veh-stale-2', 'Autobuzul fără direcție', {bearing: null}),
        ]}}),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Vehicule în circulație'})).toBeVisible();

    // The record list always kept the stale copy; the map must keep it too.
    await expect(workspace.locator('.transit-live-record')).toHaveCount(2, {timeout: 60_000});
    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});
    // The aged positions stay drawable: the vehicle with a bearing keeps its arrow.
    await expect(workspace.locator('.public-map [role="img"]')).toHaveCount(1);
    await expect(workspace.locator('.public-map canvas')).toBeVisible();

    // The honest age label replaces the live claim — arithmetic stays honest.
    await expect(workspace.getByText(/poziții de acum ~7 minute/)).toBeVisible();
    await expect(workspace.getByText(/Date recente ale operatorului/)).toHaveCount(0);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The radius selector threads its value into the live request; the help copy
  // names the active radius and keeps the honest coverage note — the radius
  // filters, it never invents TPBI coverage beyond București–Ilfov.
  test('the vehicles view threads the chosen radius into the live request and the honest coverage copy', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const requests: string[] = [];
    await page.route('**/api/transport-live*', async route => {
      requests.push(route.request().url());
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: 1, entityCount: 1, items: [
          {id: 'veh-radius', routeId: 'test-route', tripId: 'test-trip', vehicleName: 'Autobuzul de rază', licensePlate: '',
           lat: 44.427, lon: 26.103, stopId: '', observedAt: now, bearing: 87, speed: 11,
           occupancy: null, occupancyPercentage: null, wheelchairAccessible: null, currentStatus: null, details: {}},
        ]}}),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Vehicule în circulație'})).toBeVisible();

    // The selector defaults to 15 km and the request carries it server-side.
    const radiusSelect = workspace.locator('label', {hasText: 'Rază'}).locator('select');
    await expect(radiusSelect).toBeVisible({timeout: 60_000});
    await expect.poll(() => requests.some(url => url.includes('radius=15')), {timeout: 30_000}).toBe(true);
    await expect(workspace.locator('.field-help', {hasText: /raza de 15 km de București/})).toBeVisible();

    await radiusSelect.selectOption('100');
    await expect.poll(() => requests.some(url => url.includes('radius=100')), {timeout: 30_000}).toBe(true);
    await expect(workspace.locator('.field-help', {hasText: /raza de 100 km de București/})).toBeVisible();
    // The honest coverage note stays: a bigger radius never extends the network.
    await expect(workspace.locator('.field-help', {hasText: /nu extinde acoperirea rețelei operatorului/i})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

// The live vehicles list contract: a navigable desktop grid, one column on mobile.
test.describe('Transit live vehicles layout', () => {
  const liveVehiclesRoute = (page: Page, items: () => any[]) =>
    page.route('**/api/transport-live*', async route => {
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: items().length, entityCount: items().length, items: items().map(id => ({
          id, routeId: 'test-route', tripId: 'test-trip', vehicleName: 'Autobuzul de pictură ' + id, licensePlate: '',
          lat: 44.427, lon: 26.103, stopId: '', observedAt: now, bearing: 12, speed: 11,
          occupancy: null, occupancyPercentage: null, wheelchairAccessible: null, currentStatus: null, details: {},
        }))}}),
      });
    });

  test('the vehicles list lays out as a responsive multi-column grid, single column on mobile', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await liveVehiclesRoute(page, () => ['veh-grid-1', 'veh-grid-2', 'veh-grid-3']);

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    const grid = workspace.locator('.transit-vehicle-grid');
    await expect(grid).toBeVisible({timeout: 60_000});
    await expect(grid.locator('.transit-live-record')).toHaveCount(3);

    // Desktop viewport: the grid packs 3–4 compact columns (never one stretched row).
    const columns = () => grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    await expect.poll(columns, {timeout: 10_000}).toBeGreaterThanOrEqual(3);

    // Mobile viewport: one readable column, the .entity-grid house pattern.
    await page.setViewportSize({width: 375, height: 667});
    await expect.poll(columns, {timeout: 10_000}).toBe(1);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

// The identity contract of the live lists: same content, same DOM order — the list
// renders its own deterministic sort (line number, then vehicle), never the feed's
// arrival order, which permutes between fetches.
test.describe('Transit live vehicles order', () => {
  test('the vehicles list keeps one DOM order across permuted data refreshes, sorted by line then vehicle', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // The three vehicles return in a different array order on every request, like a
    // real GTFS-RT feed permutes its entities; the lines are picked so lexicographic
    // order (101 < 33 < 7) differs from natural numeric order (7 < 33 < 101).
    const names: Record<string, string> = {'7': 'Vehiculul liniei 7', '33': 'Vehiculul liniei 33', '101': 'Vehiculul liniei 101'};
    let hits = 0;
    await page.route('**/api/transport-live*', async route => {
      hits++;
      const now = new Date().toISOString();
      const ids = ['veh-101', 'veh-33', 'veh-7'];
      const rotated = [...ids.slice(hits % 3), ...ids.slice(0, hits % 3)];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: 3, entityCount: 3, items: rotated.map(id => ({
          id, routeId: id.replace('veh-', ''), tripId: 'test-trip', vehicleName: names[id.replace('veh-', '')], licensePlate: '',
          lat: 44.427, lon: 26.103, stopId: '', observedAt: now, bearing: null, speed: 9,
          occupancy: null, occupancyPercentage: null, wheelchairAccessible: null, currentStatus: null, details: {},
        }))}}),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    const records = workspace.locator('.transit-live-record');
    await expect(records).toHaveCount(3, {timeout: 60_000});

    const order = () => records.evaluateAll(els => els.map(el => (el.querySelector('h3')?.textContent || '').trim()));
    const expected = [
      expect.stringContaining(names['7']),
      expect.stringContaining(names['33']),
      expect.stringContaining(names['101']),
    ];

    // First load: the natural numeric line order, no matter the payload's own order.
    await expect.poll(order).toEqual(expected);

    // The sort is explained where the list is introduced: the help copy names the
    // ordering and its tiebreaker so the stability is a promise, not a coincidence.
    await expect(workspace.locator('.field-help', {hasText: /ordonată pe numărul liniei/i})).toBeVisible();

    // A data refresh with a permuted payload (the radius change threads a new URL)
    // must keep the exact same DOM order — the polls of real use do the same.
    const radiusSelect = workspace.locator('label', {hasText: 'Rază'}).locator('select');
    const refreshed = page.waitForRequest(/\/api\/transport-live\?.*radius=30/, {timeout: 30_000}).catch(() => null);
    await radiusSelect.selectOption('30');
    expect(await refreshed, 'the radius change refreshes the feed').not.toBeNull();
    await expect.poll(order).toEqual(expected);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

// The drift contract of the open vehicle detail: a GPS fix that crosses the next
// ~100 m cell re-keys the live URL and refetches in the background — the open panel
// must survive it, lifted out of the list remount.
test.describe('Transit live vehicle detail stability', () => {
  const HOME = {lat: 44.4268, lon: 26.1025, accuracy: 65};
  // ~220 m north: the coordinates cross one 3-decimal cell (44.427 -> 44.429) while
  // the resolved locality stays "București" — the same drift the geo-drift spec pins.
  const DRIFT = {lat: 44.4288, lon: 26.1025, accuracy: 80};

  // watchPosition fixes replayed to every active watch, like the geo-drift spec —
  // Chromium's own override machinery injects transient errors into active watches.
  function initMockedDeviceGeolocation(start: typeof HOME) {
    type Fix = {lat: number; lon: number; accuracy: number};
    const watches = new Map<number, {success: (position: unknown) => void; error: (error: unknown) => void}>();
    let seq = 1, current: Fix | null = start;
    const deliver = () => {
      if (!current) return;
      for (const watch of watches.values()) watch.success({coords: {latitude: current.lat, longitude: current.lon, accuracy: current.accuracy}, timestamp: Date.now()});
    };
    Object.defineProperty(navigator, 'geolocation', {configurable: true, value: {
      watchPosition(success: (position: unknown) => void, error: (error: unknown) => void) { const id = seq++; watches.set(id, {success, error}); deliver(); return id; },
      clearWatch(id: number) { watches.delete(id); },
      getCurrentPosition(success: (position: unknown) => void, error: (error: unknown) => void) { if (current) success({coords: {latitude: current.lat, longitude: current.lon, accuracy: current.accuracy}, timestamp: Date.now()}); else error({code: 2, message: ''}); },
    }});
    (window as unknown as Record<string, unknown>).__devicePosition = (lat: number, lon: number, accuracy: number) => { current = {lat, lon, accuracy}; deliver(); };
  }

  test('an open vehicle detail panel survives a same-locality position drift', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.addInitScript(initMockedDeviceGeolocation, HOME);
    await page.route('**/api/transport-live*', async route => {
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: 2, entityCount: 2, items: [
          {id: 'veh-drift-1', routeId: 'test-route', tripId: 'test-trip', vehicleName: 'Autobuzul cu detalii', licensePlate: '',
           lat: 44.427, lon: 26.103, stopId: '', observedAt: now, bearing: 87, speed: 12.5,
           occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45, wheelchairAccessible: null, currentStatus: 'IN_TRANSIT_TO', details: {}},
          {id: 'veh-drift-2', routeId: 'test-route', tripId: 'test-trip', vehicleName: 'Autobuzul secundar', licensePlate: '',
           lat: 44.428, lon: 26.104, stopId: '', observedAt: now, bearing: null, speed: null,
           occupancy: null, occupancyPercentage: null, wheelchairAccessible: null, currentStatus: null, details: {}},
        ]}}),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    const record = workspace.locator('.transit-live-record', {hasText: 'Autobuzul cu detalii'});
    await expect(record).toBeVisible({timeout: 90_000});

    // The redesigned detail panel opens with the readable icon sections.
    const panel = record.locator('details').first();
    await panel.locator('summary').click();
    await expect(panel).toHaveAttribute('open');
    await expect(panel).toContainText('Viteza');
    await expect(panel).toContainText('45.0 km/h');

    // The drift: same locality, next cell — the request legitimately re-keys (the
    // center moved) and the refresh runs in the background.
    const refetched = page.waitForRequest(/\/api\/transport-live\?.*lat=44\.429/, {timeout: 30_000}).catch(() => null);
    await page.evaluate(fix => {
      (window as unknown as {__devicePosition: (lat: number, lon: number, accuracy: number) => void}).__devicePosition(fix.lat, fix.lon, fix.accuracy);
    }, DRIFT);
    expect(await refetched, 'the same-locality drift still refreshes the feed in the background').not.toBeNull();

    // The panel for the same vehicle is still open: the open state lives above the
    // list remount, keyed by the vehicle id.
    await expect(record).toBeVisible();
    await expect(panel).toHaveAttribute('open', '', {timeout: 30_000});
    await expect(panel).toContainText('Viteza');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Transit network view (reduced motion)', () => {
  test('heading markers stay rotated under prefers-reduced-motion', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.route('**/api/transport-live*', async route => {
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', data: {kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1, total: 1, entityCount: 1, items: [{
          id: 'veh-heading-1', routeId: 'test-route', tripId: 'test-trip', vehicleName: 'Autobuzul cu direcție', licensePlate: '',
          lat: 44.427, lon: 26.103, stopId: '', observedAt: now, bearing: 225, speed: 8.3,
          occupancy: 'STANDING_ROOM_ONLY', occupancyPercentage: null,
          wheelchairAccessible: null, currentStatus: 'IN_TRANSIT_TO', details: {},
        }]}}),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});

    const headingMarker = workspace.locator('.public-map [role="img"]');
    await expect(headingMarker).toHaveCount(1);
    await expect(headingMarker).toHaveAttribute('aria-label', 'Transport public · Autobuzul cu direcție · spre sud-vest · 29.9 km/h · Doar în picioare');
    await expect(headingMarker.locator('svg g')).toHaveAttribute('transform', 'rotate(225 14 14)');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
