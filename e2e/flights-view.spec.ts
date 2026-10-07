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

// A controlled, adsb.lol-shaped payload (the exact v2 state-vector fields the live
// feed publishes) served through the same SourceState envelope the app's /api/flights
// route renders: callsign, registration, type, lat/lon, track (the movement heading),
// baro altitude, ground speed in knots, timestamps in epoch milliseconds.
const adsbState = (items: Array<Record<string, unknown>>) => {
  const now = new Date();
  const stamp = now.getTime();
  const iso = now.toISOString();
  return {
    key: 'flights:adsb', name: 'adsb.lol · spațiul aerian românesc',
    url: 'https://api.adsb.lol/v2/', adapterVersion: 'flights.adsb.ro.v1',
    status: 'fresh', publishedAt: iso, lastSuccessAt: iso, lastAttemptAt: iso,
    nextAttemptAt: null, error: null, ttlSeconds: 60,
    data: {kind: 'flights', observedAt: iso, items},
  };
};
const adsbItems = () => [
  {hex: '471f55', callsign: 'W6XYZ', registration: 'HA-LMN', typeCode: 'A320', lat: 44.5, lon: 26.1,
   track: 270.5, trueHeading: 268.2, altitudeFt: 30500, onGround: false, groundSpeedKt: 448.1,
   verticalRateFpm: 1152, squawk: '1000', emergency: 'none', observedAt: new Date().toISOString(), details: {hex: '471f55', flight: 'W6XYZ', gs: 448.1}},
  {hex: '89408c', callsign: 'GFA007', registration: 'A9C-FB', typeCode: 'B789', lat: 46.68, lon: 19.33,
   track: 297.94, trueHeading: 294.15, altitudeFt: 39975, onGround: false, groundSpeedKt: 501.5,
   verticalRateFpm: -64, squawk: '5261', emergency: 'none', observedAt: new Date().toISOString(), details: {hex: '89408c', flight: 'GFA007', gs: 501.5}},
  {hex: '4a1b2c', callsign: 'YRABB', registration: 'YR-ABB', typeCode: 'C172', lat: 44.42, lon: 26.05,
   track: null, trueHeading: null, altitudeFt: null, onGround: true, groundSpeedKt: 5,
   verticalRateFpm: null, squawk: '7000', emergency: 'none', observedAt: new Date().toISOString(), details: {hex: '4a1b2c', alt_baro: 'ground'}},
];
const stubAdsb = async (page: Page) => {
  await page.route('**/api/flights*', async route => {
    const state = adsbState(adsbItems());
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({...state, data: {...state.data, isLive: true, page: 0, pages: 1, total: 3, entityCount: 3}})});
  });
};

// A relayed, BIA-shaped board (the shape the /api/seed/bia relay publishes through the
// same parser and setter): arrivals and departures for one airport, with the flight
// number, airline, route, published times and status text kept as the source wrote them.
const biaState = () => {
  const now = new Date().toISOString();
  return {
    key: 'flights:bia:henri-coanda', name: 'Bucharest Airports · Henri Coandă',
    url: 'https://bucharestairports.ro/wp-json/fds/v1/flights', adapterVersion: 'flights.bia.board.v1',
    status: 'fresh', publishedAt: now, lastSuccessAt: now, lastAttemptAt: now,
    nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {
      airport: 'henri-coanda', airportName: 'Henri Coandă', observedAt: now,
      arrivals: [
        {flightNumber: 'W6 3187', airline: 'Wizz Air', route: 'Londra Luton · București', from: 'Londra Luton',
         to: 'București', scheduledTime: '07:45', estimatedTime: '07:52', status: 'Aterizat', details: {gates: 'poarta 04'}},
        {flightNumber: 'OS 899', airline: 'Tarom', route: 'Viena · București', from: 'Viena', to: 'București',
         scheduledTime: '08:10', estimatedTime: null, status: 'Întârziat', details: {}},
      ],
      departures: [
        {flightNumber: 'W6 3189', airline: 'Wizz Air', route: 'București · Londra Luton', from: 'București',
         to: 'Londra Luton', scheduledTime: '09:15', estimatedTime: null, status: 'Programat', details: {}},
      ],
      note: 'Panoul oficial al zilei, publicat de aeroport.',
    },
  };
};

async function openFlightsTab(page: Page) {
  await page.goto('/#view=domain&id=transport&tab=flights');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
  await waitForClientReady(page);
}

test.describe('Flights over the Romanian airspace', () => {
  test('the stubbed live feed renders the flights list, counts and rotated track markers on the map', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await stubAdsb(page);
    await openFlightsTab(page);

    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Avioane în spațiul românesc'})).toBeVisible();
    await expect(workspace.getByText(/ADS-B · SPAȚIUL AERIAN ROMÂNESC/i)).toBeVisible();

    // countText grammar on the live aircraft count: 3 → „3 avioane în spațiul aerian românesc”.
    await expect(workspace.getByText(/^3 avioane în spațiul aerian românesc/)).toBeVisible();
    // The genuinely live feed keeps the live claim: „flux publicat acum”.
    await expect(workspace.getByText(/flux publicat acum/)).toBeVisible();

    // Each airborne row names the callsign, the type · registration pair, and the
    // altitude (ft → m) and ground speed (kt → km/h) in the published conversions.
    const records = workspace.locator('.flight-record');
    await expect(records).toHaveCount(3);
    await expect(records.filter({hasText: 'W6XYZ'})).toContainText('HA-LMN');
    await expect(records.filter({hasText: 'W6XYZ'})).toContainText(/9\.296 m/);
    await expect(records.filter({hasText: 'W6XYZ'})).toContainText(/830 km\/h/);
    // The ground aircraft honestly reports „la sol” — no altitude is invented.
    await expect(records.filter({hasText: 'YRABB'})).toContainText('la sol');

    // The map hosts flight positions as vehicle markers: the two aircraft with a
    // published track render rotated arrows (aria-labelled with the movement
    // direction), the ground aircraft keeps the circle marker.
    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.public-map [role="img"]')).toHaveCount(2);
    await expect(workspace.locator('.public-map [role="img"]').first()).toHaveAttribute('aria-label', /W6XYZ.*spre/);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the relayed BIA board renders official arrivals and departures with published times and status', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await stubAdsb(page);
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(biaState())});
    });
    await openFlightsTab(page);

    const board = page.locator('.airport-board');
    await expect(board).toBeVisible();
    await expect(board.getByRole('heading', {level: 3, name: 'Panoul oficial de sosiri și plecări'})).toBeVisible();
    await expect(board.getByText(/AEROPORTUL HENRI COANDĂ · BIA/i)).toBeVisible();

    // Both boards carry their countText totals in the shared count paragraph.
    await expect(board.getByText(/^2 sosiri · 1 plecare/)).toBeVisible();

    const arrival = board.locator('.board-flight').filter({hasText: 'W6 3187'});
    await expect(arrival).toContainText('Wizz Air');
    await expect(arrival).toContainText('Londra Luton · București');
    await expect(arrival).toContainText('07:45');
    await expect(arrival).toContainText('Aterizat');
    await expect(board.locator('.board-flight').filter({hasText: 'W6 3189'})).toContainText('Programat');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('when the relay has not run yet the BIA board degrades honestly and invents no flight', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await stubAdsb(page);
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        key: 'flights:bia:henri-coanda', name: 'Bucharest Airports · Henri Coandă',
        url: 'https://bucharestairports.ro/wp-json/fds/v1/flights', adapterVersion: 'flights.bia.board.v1',
        status: 'unavailable', publishedAt: null, lastSuccessAt: null, lastAttemptAt: null,
        nextAttemptAt: null, data: null,
        error: 'Panoul aeroportului nu a fost încă preluat. Reîmprospătarea o face un intermediar extern, care rulează din afara rețelei serverului; încearcă din nou peste puțin timp.', ttlSeconds: 3600,
      })});
    });
    await openFlightsTab(page);

    const board = page.locator('.airport-board');
    await expect(board).toBeVisible();
    await expect(board.locator('.live-error', {hasText: /nu a fost încă preluat/})).toBeVisible();
    await expect(board.locator('.board-flight')).toHaveCount(0);
    // The live airspace view stays healthy beside the waiting board.
    const workspace = page.locator('section.flights-workspace');
    await expect(workspace.getByText(/^3 avioane în spațiul aerian românesc/)).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the Avioane tab is reachable by a trigger click from the transport domain', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await stubAdsb(page);
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(biaState())});
    });
    await page.goto('/#view=domain&id=transport');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    await page.getByRole('tab', {name: 'Avioane', exact: true}).click();
    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Avioane în spațiul românesc'})).toBeVisible();
    await expect(page.locator('section.transit-workspace')).toHaveCount(0);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the relayed stale copy serves every aircraft honestly labeled „poziții de acum ~12 minute”', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // The exact response shape /api/flights serves between relay tours: the worker
    // egress is rejected by adsb.lol (HTTP 429, the relay class), the copy relayed
    // by the external tour serves with isLive:false + stalenessMinutes from
    // lastSuccessAt — never with the live-60s claim.
    const minutes = 12;
    const lastSuccessAt = new Date(Date.now() - minutes * 60_000).toISOString();
    const observedAt = new Date(Date.now() - minutes * 60_000).toISOString();
    await page.route('**/api/flights*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        key: 'flights:adsb', name: 'adsb.lol · ADS-B comunitar',
        url: 'https://api.adsb.lol/v2/', adapterVersion: 'flights.adsb.ro.v1',
        status: 'stale', publishedAt: observedAt, lastSuccessAt, lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: null,
        error: 'Fluxul public adsb.lol a respins rețeaua serverului (HTTP 429). Pozițiile se reîmprospătează prin tura de intermediar extern, săptămânal; încearcă din nou peste puțin timp.',
        ttlSeconds: 60,
        data: {kind: 'flights', observedAt, items: adsbItems(), page: 0, pages: 1, total: 3, entityCount: 3,
          isLive: false, stalenessMinutes: minutes},
      })});
    });
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(biaState())});
    });
    await openFlightsTab(page);

    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    // The stale copy still counts every aircraft — the count is honest, the age is labeled.
    await expect(workspace.getByText(/^3 avioane în spațiul aerian românesc/)).toBeVisible();
    // The snapshot-age label replaces the live claim: minutes under an hour.
    await expect(workspace.getByText(/poziții de acum ~12 minute/)).toBeVisible();
    await expect(workspace.getByText(/flux publicat acum/)).toHaveCount(0);
    // The relayed positions still render: records list…
    await expect(workspace.locator('.flight-record')).toHaveCount(3);
    // …and the map, honestly aged — the two tracked arrows keep their rotation.
    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.public-map [role="img"]')).toHaveCount(2);
    // The weekly relay cadence is disclosed inside the snapshot-age label itself — the
    // honest weekly word beside the age, never a numeric tour promise.
    await expect(workspace.getByText(/poziții de acum ~12 minute.*intermediar extern.*săptămânal/)).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the hours-old relayed copy is labeled „poziții de acum ~3 ore”, never in raw minutes', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // Between weekly relay tours a copy can sit for hours: minutes from lastSuccessAt
    // must readable-scale to hours — „~180 minute” would be honest arithmetic but a
    // dishonest label for a human reading the map.
    const minutes = 180;
    const lastSuccessAt = new Date(Date.now() - minutes * 60_000).toISOString();
    const observedAt = new Date(Date.now() - minutes * 60_000).toISOString();
    await page.route('**/api/flights*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        key: 'flights:adsb', name: 'adsb.lol · ADS-B comunitar',
        url: 'https://api.adsb.lol/v2/', adapterVersion: 'flights.adsb.ro.v1',
        status: 'stale', publishedAt: observedAt, lastSuccessAt, lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: null,
        error: 'Fluxul public adsb.lol a respins rețeaua serverului (HTTP 429). Pozițiile se reîmprospătează prin tura de intermediar extern, săptămânal; încearcă din nou peste puțin timp.',
        ttlSeconds: 60,
        data: {kind: 'flights', observedAt, items: adsbItems(), page: 0, pages: 1, total: 3, entityCount: 3,
          isLive: false, stalenessMinutes: minutes},
      })});
    });
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(biaState())});
    });
    await openFlightsTab(page);

    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByText(/^3 avioane în spațiul aerian românesc/)).toBeVisible();
    // The age label scales to hours…
    await expect(workspace.getByText(/poziții de acum ~3 ore/)).toBeVisible();
    // …never raw minutes at hours-scale age…
    await expect(workspace.getByText(/180 minute/)).toHaveCount(0);
    await expect(workspace.getByText(/flux publicat acum/)).toHaveCount(0);
    // …and the weekly relay cadence is disclosed inside the same label.
    await expect(workspace.getByText(/poziții de acum ~3 ore.*intermediar extern.*săptămânal/)).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the six-day-old relayed copy stays honest: „poziții de acum ~6 zile” and the map pins carry the snapshot moment', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // The weekly relay tour's worst case: a copy relayed almost a full week ago (or
    // older, if a tour failed). The label must scale to days, and every map position
    // must stay reachable and labeled as the snapshot it is.
    const minutes = 6 * 24 * 60;
    const lastSuccessAt = new Date(Date.now() - minutes * 60_000).toISOString();
    const observedAt = new Date(Date.now() - minutes * 60_000).toISOString();
    await page.route('**/api/flights*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        key: 'flights:adsb', name: 'adsb.lol · ADS-B comunitar',
        url: 'https://api.adsb.lol/v2/', adapterVersion: 'flights.adsb.ro.v1',
        status: 'stale', publishedAt: observedAt, lastSuccessAt, lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: null,
        error: 'Fluxul public adsb.lol a respins rețeaua serverului (HTTP 429). Pozițiile se reîmprospătează prin tura de intermediar extern, săptămânal; încearcă din nou peste puțin timp.',
        ttlSeconds: 60,
        data: {kind: 'flights', observedAt, items: adsbItems(), page: 0, pages: 1, total: 3, entityCount: 3,
          isLive: false, stalenessMinutes: minutes},
      })});
    });
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(biaState())});
    });
    await openFlightsTab(page);

    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByText(/^3 avioane în spațiul aerian românesc/)).toBeVisible();
    // Days-scale age, labeled in days…
    await expect(workspace.getByText(/poziții de acum ~6 zile/)).toBeVisible();
    await expect(workspace.getByText(/flux publicat acum/)).toHaveCount(0);
    // …with the weekly relay cadence disclosed inside the same label.
    await expect(workspace.getByText(/poziții de acum ~6 zile.*intermediar extern.*săptămânal/)).toBeVisible();
    // The stale positions still render as records and map arrows…
    await expect(workspace.locator('.flight-record')).toHaveCount(3);
    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.public-map [role="img"]')).toHaveCount(2);
    // …and each map position names its snapshot moment when opened.
    await workspace.locator('.public-map [role="img"]').first().click();
    await expect(page.locator('.leaflet-popup')).toContainText('poziția observată la');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('when the worker egress is rejected the airspace degrades honestly and invents no aircraft', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.route('**/api/flights*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        key: 'flights:adsb', name: 'adsb.lol · ADS-B comunitar',
        url: 'https://api.adsb.lol/v2/', adapterVersion: 'flights.adsb.ro.v1',
        status: 'unavailable', publishedAt: null, lastSuccessAt: null, lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: null, data: null,
        error: 'Fluxul public adsb.lol a respins rețeaua serverului (HTTP 429). Pozițiile se reîmprospătează prin tura de intermediar extern, săptămânal; încearcă din nou peste puțin timp.',
        ttlSeconds: 60,
      })});
    });
    await page.route('**/api/flight-board*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(biaState())});
    });
    await openFlightsTab(page);

    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.locator('.live-error', {hasText: /a respins rețeaua serverului/})).toBeVisible();
    await expect(workspace.locator('.flight-record')).toHaveCount(0);
    await expect(workspace.locator('.public-map')).toHaveCount(0);
    // The airport board stays healthy beside the degraded airspace.
    await expect(page.locator('.airport-board').getByText(/^2 sosiri · 1 plecare/)).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a federated search term reaches the flights family and clicks through to the seeded tab', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await stubAdsb(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await waitForClientReady(page);

    await page.getByLabel('Caută în locuri și domenii').fill('avion');
    await expect(page.getByTestId('federated-busy')).toHaveCount(0, {timeout: 60_000});

    // The flights family answer joins the transport group with its rows.
    const group = page.locator('[data-testid="federated-group"][data-group="transport"]');
    await expect(group).toBeVisible();
    const flightsRow = group.locator('[data-testid="federated-row"]').filter({hasText: 'W6XYZ'});
    await expect(flightsRow).toBeVisible();

    // The row button itself navigates (the same element the other federated legs click).
    await flightsRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page).toHaveURL(/#view=domain&id=transport&q=W6XYZ&tab=flights$/);
    const workspace = page.locator('section.flights-workspace');
    await expect(workspace).toBeVisible();
    // The search input is seeded with the clicked aircraft's callsign.
    await expect(workspace.getByLabel('Caută avioane după indicativ, imatriculare sau tip')).toHaveValue('W6XYZ');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
