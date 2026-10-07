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

  // Rotation is static orientation, not animation: under prefers-reduced-motion the
  // heading marker must still render with its bearing rotation.
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
