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

// Fixture read offline from the bundled per-route artifact
// public/transit/routes/75ce47a779c2311fc60ed79e.json.gz (TPBI network route PV1_403):
// two direction variants with disjoint tripIds, so the spec asserts the real
// per-variant headsign grouping without any upstream dependency.
const LINE = {
  id: 'PV1_403',
  name: '403',
  search: '403 STV',
  outbound: {headsign: 'Piata Presei', stops: 59, tripIds: ['PV1_PV1_403_3_153579', 'PV1_PV1_403_3_153581']},
  inbound: {headsign: 'Vadu Anei', stops: 63, tripIds: ['PV1_PV1_403_3_153578', 'PV1_PV1_403_3_153580']},
};
const LINE_LIVE_URL = '/api/transport-live?kind=vehicles&route=' + LINE.id;

// The corridor of the line (real stop coordinates from the same artifact), so the
// stubbed positions sit on the operator's own geography.
const CORRIDOR = {lat: 44.4784, lon: 26.072239};

function stubSourceState(observedAt: string) {
  return {
    status: 'ok', key: 'transport:realtime:vehicles', name: 'TPBI · poziții vehicule',
    url: 'https://gtfs.tpbi.ro/regional/', adapterVersion: 'gtfs.realtime.v1',
    publishedAt: observedAt, lastSuccessAt: observedAt, lastAttemptAt: observedAt,
    error: null, ttlSeconds: 15, data: null,
  };
}

function vehicle(id: string, name: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id, routeId: LINE.id, tripId: '', vehicleName: name, licensePlate: '',
    lat: CORRIDOR.lat, lon: CORRIDOR.lon, stopId: '', observedAt: now,
    bearing: null, speed: 11, occupancy: null, occupancyPercentage: null,
    wheelchairAccessible: null, currentStatus: 'IN_TRANSIT_TO', details: {}, ...extra,
  };
}

function liveBody(items: any[], extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return JSON.stringify({
    ...stubSourceState(now), data: {
      kind: 'vehicles', observedAt: now, isLive: true, page: 0, pages: 1,
      total: items.length, entityCount: items.length, note: 'Poziții și estimări publicate de TPBI. Un vehicul lipsă din flux nu înseamnă că linia nu circulă.',
      items, ...extra,
    },
  });
}

// Open the line's reader dialog from the network grid: the registry search isolates
// the line (201 routes; the name+operator pair matches exactly one), then its card
// button opens the per-line home view.
async function openLineReader(page: Page) {
  const workspace = page.locator('section.transit-workspace');
  await workspace.getByLabel('Caută linii, operatori, stații și informații de transport').fill(LINE.search);
  // filter({has}) needs the inner locator page-rooted: an ancestor-scoped one matches nothing.
  const card = workspace.locator('.entity-card').filter({has: page.getByRole('heading', {name: 'Linia ' + LINE.name, exact: true})}).first();
  await expect(card).toBeVisible({timeout: 60_000});
  await card.getByRole('button', {name: 'Traseu complet și orar'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Linia ' + LINE.name + ' · ')).toBeVisible({timeout: 30_000});
  return dialog;
}

test.describe('Per-line live map', () => {
  // One map for the whole line: the planned stations and route shape plus the live
  // vehicles layer with heading telemetry, each direction's vehicles grouped by the
  // headsign of the variant their tripId belongs to.
  test('the line reader renders stations, the route shape and live heading vehicles on one map, grouped per direction', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // The payload is frozen for the test: byte-identical polls are the contract's
    // no-redraw path (a moving payload has its own guardrail leg), so the popup
    // opened on a vehicle stays open while the polls keep firing.
    const body = liveBody([
      vehicle('veh-line-1', 'Autobuzul cu direcție', {tripId: LINE.outbound.tripIds[0], bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45}),
      vehicle('veh-line-2', 'Autobuzul fără direcție', {tripId: LINE.inbound.tripIds[0], lon: CORRIDOR.lon + 0.05}),
      vehicle('veh-line-3', 'Autobuzul cu cursă neprecizată', {lat: CORRIDOR.lat + 0.05, speed: null}),
    ]);
    await page.route('**/api/transport-live*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body});
    });

    await page.goto('/#view=domain&id=transport');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const dialog = await openLineReader(page);

    // The live section exists on the line's home view, with the source's Freshness line.
    await expect(dialog.getByRole('heading', {name: 'Vehicule în mișcare pe linie'})).toBeVisible();
    await expect(dialog.locator('.live-freshness')).toContainText('TPBI · poziții vehicule');

    // The one map carries the planned stations and the live vehicles: the pin count is
    // stations + vehicles (59 + 3), and the vehicle with a bearing is the rotated arrow.
    const map = dialog.locator('.public-map');
    await expect(map).toBeVisible({timeout: 60_000});
    await expect(map).toHaveAttribute('data-pins', String(LINE.outbound.stops + 3));
    await expect(map.locator('canvas')).toBeVisible();
    const headingMarker = map.locator('[role="img"]');
    await expect(headingMarker).toHaveCount(1);
    // The marker's telemetry is asserted on the aria-label and the rotated arrow;
    // the popup pathway for these very markers is covered by transit-view.spec.ts
    // ("live vehicles render heading markers"), where it is deterministic.
    await expect(headingMarker).toHaveAttribute('aria-label', 'Linia ' + LINE.name + ' · Autobuzul cu direcție · spre est · 45.0 km/h · Puține locuri libere · ocupare 45%');
    await expect(headingMarker.locator('svg g')).toHaveAttribute('transform', 'rotate(87 14 14)');

    // Every vehicle counted per direction: the variant the tripId belongs to carries
    // the headsign; an unknown tripId is an honest unattributed direction, never a guess.
    await expect(dialog.getByText(/3 vehicule în flux pe linie/)).toBeVisible();
    await expect(dialog.getByText(/1 vehicul spre Piata Presei/)).toBeVisible();
    await expect(dialog.getByText(/1 vehicul spre Vadu Anei/)).toBeVisible();
    await expect(dialog.getByText(/1 vehicul cu direcție neprecizată/)).toBeVisible();
    await expect(dialog.getByText(/date recente ale operatorului/)).toBeVisible();
    await expect(dialog.locator('.live-error')).toHaveCount(0);

    // The ordered station sequence renders for both directions from the same artifact.
    await expect(dialog.getByText('Toate opririle · ' + LINE.outbound.stops)).toBeVisible();
    const variantSelect = dialog.locator('label').filter({hasText: 'Direcție / variantă'}).locator('select');
    await variantSelect.selectOption({index: 1});
    await expect(dialog.getByText('Toate opririle · ' + LINE.inbound.stops)).toBeVisible({timeout: 30_000});
    await expect(map).toHaveAttribute('data-pins', String(LINE.inbound.stops + 3), {timeout: 30_000});

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The seconds tier of the honest age label: a degraded copy fresher than a minute
  // reads in seconds, never as a rounded-up "~1 minut" on a 3-second poll.
  test('a stale-but-recent copy is labeled „poziții de acum ~40 de secunde”, keeping positions and never an error block', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const observedAt = new Date(Date.now() - 150_000).toISOString();
    const stamped = new Date().toISOString();
    const body = JSON.stringify({
      ...stubSourceState(stamped),
      data: {
        kind: 'vehicles', observedAt, isLive: false, stalenessSeconds: 40, stalenessMinutes: 1,
        page: 0, pages: 1, total: 2, entityCount: 2,
        items: [
          vehicle('veh-line-stale-1', 'Autobuzul cu direcție', {bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45}),
          vehicle('veh-line-stale-2', 'Autobuzul fără direcție', {lon: CORRIDOR.lon + 0.05, speed: null}),
        ],
      },
    });
    await page.route('**/api/transport-live*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body});
    });

    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const dialog = await openLineReader(page);

    // The aged copy keeps every position on the line's map, honestly labeled.
    const map = dialog.locator('.public-map');
    await expect(map).toHaveAttribute('data-pins', String(LINE.outbound.stops + 2), {timeout: 60_000});
    await expect(map.locator('[role="img"]')).toHaveCount(1);
    await expect(dialog.getByText(/poziții de acum ~40 de secunde · ultima copie a operatorului/)).toBeVisible();
    await expect(dialog.locator('.live-error')).toHaveCount(0);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // An empty live feed is an honest note, never an error state: the scheduled route
  // and stations stay, and the operator's own absence means no vehicles in the feed
  // right now — not that the line stopped running.
  test('zero vehicles on the line render the honest absence note, keeping stations on the map', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const body = liveBody([]);
    await page.route('**/api/transport-live*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body});
    });

    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const dialog = await openLineReader(page);

    const map = dialog.locator('.public-map');
    await expect(map).toHaveAttribute('data-pins', String(LINE.outbound.stops), {timeout: 60_000});
    await expect(dialog.getByText('Un vehicul lipsă din flux nu înseamnă că linia nu circulă')).toBeVisible();
    await expect(dialog.locator('.live-error')).toHaveCount(0);
    await expect(dialog.getByText(/Toate opririle ·/)).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The vehicles-mode line picker selects the line and opens its live home view:
  // the picker value and the dialog line are set together, from the same registry.
  test('the vehicles-mode line picker opens the per-line live view for the chosen line', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const requests: string[] = [];
    const body = liveBody([
      vehicle('veh-line-picker-1', 'Autobuzul cu direcție', {tripId: LINE.outbound.tripIds[0], bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45}),
    ]);
    await page.route('**/api/transport-live*', async route => {
      requests.push(route.request().url());
      await route.fulfill({status: 200, contentType: 'application/json', body});
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Vehicule în circulație'})).toBeVisible();

    const picker = workspace.locator('label').filter({hasText: 'Linie'}).locator('select');
    await expect(picker).toBeVisible({timeout: 60_000});
    await picker.selectOption(LINE.id);

    // The chosen line's live home view opens with its live vehicles on the map.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Linia ' + LINE.name + ' · ')).toBeVisible({timeout: 30_000});
    await expect(dialog.getByRole('heading', {name: 'Vehicule în mișcare pe linie'})).toBeVisible();
    const map = dialog.locator('.public-map');
    await expect(map).toHaveAttribute('data-pins', String(LINE.outbound.stops + 1), {timeout: 60_000});
    await expect(map.locator('[role="img"]')).toHaveCount(1);

    // The per-line request targets exactly this route, and the picker holds the registry value.
    await expect.poll(() => requests.some(url => url.endsWith(LINE_LIVE_URL)), {timeout: 30_000}).toBe(true);
    await expect(picker).toHaveValue(LINE.id);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The polling guardrails of the per-line view: a ~3s cadence while visible, frozen
  // on a hidden tab, resumed on visible, aborted on dialog close, and the markers
  // move between polls as the positions change.
  test('the per-line poll runs at the 3s cadence while visible, pauses hidden, resumes on visible and aborts on close', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const hits: {url: string; at: number}[] = [];
    await page.route('**/api/transport-live*', async route => {
      hits.push({url: route.request().url(), at: Date.now()});
      const n = hits.length;
      // Each poll serves a slightly different position, so the marker moves between polls.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: liveBody([
          vehicle('veh-line-move-1', 'Autobuzul cu direcție', {lat: CORRIDOR.lat + n * 0.0012, bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45}),
        ]),
      });
    });

    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const dialog = await openLineReader(page);
    const map = dialog.locator('.public-map');
    const headingMarker = map.locator('[role="img"]');
    await expect(headingMarker).toHaveCount(1, {timeout: 60_000});

    // ~3s cadence while the page is visible: consecutive requests 2.5–4s apart.
    await expect.poll(() => hits.length, {timeout: 20_000}).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < hits.length; i++) {
      const delta = hits[i].at - hits[i - 1].at;
      expect(delta, `poll interval ${i}: ${delta}ms`).toBeGreaterThanOrEqual(2500);
      expect(delta, `poll interval ${i}: ${delta}ms`).toBeLessThanOrEqual(4000);
    }
    const perLine = hits.filter(hit => hit.url.endsWith(LINE_LIVE_URL));
    expect(perLine.length).toBeGreaterThanOrEqual(3);

    // The vehicles move between polls: the marker's position changes on refreshed bytes.
    // The heading vehicle's icon is the only DOM marker on the reader map (stations and
    // bearing-less vehicles render to the canvas), so the icon root is the arrow wrapper.
    const markerIcon = map.locator('.leaflet-marker-icon');
    const transformAt = async () => markerIcon.evaluate(node => (node as HTMLElement).style.transform);
    const firstTransform = await transformAt();
    await expect.poll(() => hits.length, {timeout: 20_000}).toBeGreaterThanOrEqual(5);
    await expect.poll(async () => (await transformAt()) !== firstTransform, {timeout: 20_000}).toBe(true);
    const secondTransform = await transformAt();
    expect(secondTransform).not.toEqual(firstTransform);

    // A hidden tab freezes the poll ticks: no new requests over two full intervals.
    // This Chromium build rejects the CDP Emulation.setPageVisibilityState command
    // (probed live), so the hidden-tab state is emulated at the exact boundary the
    // poll gate reads: document.visibilityState plus a real visibilitychange event.
    const setVisibility = (visibility: 'hidden' | 'visible') => page.evaluate(state => {
      if (state === 'hidden') Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
      else delete (document as {visibilityState?: string}).visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    }, visibility);
    await setVisibility('hidden');
    await page.waitForTimeout(3600);
    const frozenAt = hits.length;
    await page.waitForTimeout(6500);
    expect(hits.length, 'no per-line polls while the tab is hidden').toBe(frozenAt);

    // Back to visible: the poll resumes immediately via the visibility listener.
    await setVisibility('visible');
    await expect.poll(() => hits.length, {timeout: 15_000}).toBeGreaterThan(frozenAt);

    // Closing the dialog unmounts the view: the abort stops every further request.
    await dialog.getByRole('button', {name: 'Închide fereastra'}).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(600);
    const closedAt = hits.length;
    await page.waitForTimeout(6500);
    expect(hits.length, 'no further requests after the dialog closes').toBe(closedAt);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // Byte-identical responses never churn the section: the pin count stays stable and
  // neither the loading state nor an error ever reappears while the polls keep firing.
  test('byte-identical polls keep the map and never re-churn loading or error states', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const hits: string[] = [];
    const body = liveBody([
      vehicle('veh-line-same-1', 'Autobuzul cu direcție', {bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45}),
      vehicle('veh-line-same-2', 'Autobuzul fără direcție', {lon: CORRIDOR.lon + 0.05, speed: null}),
    ]);
    await page.route('**/api/transport-live*', async route => {
      hits.push(route.request().url());
      await route.fulfill({status: 200, contentType: 'application/json', body});
    });

    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const dialog = await openLineReader(page);
    const map = dialog.locator('.public-map');
    await expect(map).toHaveAttribute('data-pins', String(LINE.outbound.stops + 2), {timeout: 60_000});

    // At least two more polls of the identical body land inside the window.
    const pollsAtStart = hits.length;
    const deadline = Date.now() + 8000;
    let churn = 0;
    while (Date.now() < deadline) {
      if (await dialog.getByText('Se încarcă fluxul operatorului…').count() > 0) churn++;
      if (await dialog.locator('.live-error').count() > 0) churn++;
      await page.waitForTimeout(250);
    }
    expect(hits.length).toBeGreaterThanOrEqual(pollsAtStart + 2);
    expect(churn, 'no busy or error churn on identical bytes').toBe(0);
    await expect(map).toHaveAttribute('data-pins', String(LINE.outbound.stops + 2));

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The per-line vehicle list: the dialog carries its own compact grid of the line's
  // live vehicles, and an opened detail panel stays open while the 3s polls keep
  // replacing the data — the same identity contract as the main vehicles list.
  test('the per-line vehicle list renders in the dialog grid and an open detail survives the polls', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    let hits = 0;
    // Each request answers with fresh timestamps, so every poll replaces the data
    // object (bytes differ), exactly like the moving payload of the cadence leg.
    await page.route('**/api/transport-live*', async route => {
      hits++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: liveBody([
          vehicle('veh-line-detail-1', 'Autobuzul cu detalii', {bearing: 87, speed: 12.5, occupancy: 'FEW_SEATS_AVAILABLE', occupancyPercentage: 45}),
          vehicle('veh-line-detail-2', 'Autobuzul fără detalii', {speed: null}),
        ]),
      });
    });

    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const dialog = await openLineReader(page);

    // The dialog's own vehicle grid: two compact records, several columns on desktop.
    const grid = dialog.locator('.transit-vehicle-grid');
    await expect(grid).toBeVisible({timeout: 60_000});
    await expect(grid.locator('.transit-live-record')).toHaveCount(2);
    await expect.poll(() => grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), {timeout: 10_000}).toBeGreaterThanOrEqual(2);

    // The redesigned detail panel opens with the readable icon sections.
    const record = grid.locator('.transit-live-record', {hasText: 'Autobuzul cu detalii'});
    const panel = record.locator('details').first();
    await panel.locator('summary').click();
    await expect(panel).toHaveAttribute('open');
    await expect(panel).toContainText('Viteza');
    await expect(panel).toContainText('45.0 km/h');

    // The DOM order stays the same list identity across the poll replacements.
    const order = () => grid.locator('.transit-live-record').evaluateAll(els => els.map(el => (el.querySelector('h3')?.textContent || '').trim()));
    const expected = [expect.stringContaining('Autobuzul cu detalii'), expect.stringContaining('Autobuzul fără detalii')];
    await expect.poll(order).toEqual(expected);

    // At least three further polls land with fresh bytes; the panel never closes.
    await expect.poll(() => hits, {timeout: 20_000}).toBeGreaterThanOrEqual(4);
    await expect(panel).toHaveAttribute('open');
    await expect(panel).toContainText('Viteza');
    await expect.poll(order).toEqual(expected);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
