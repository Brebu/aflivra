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

// A controlled, Tranzy-shaped payload (the exact Vehicle fields the Opendata
// /vehicles endpoint documents: label/latitude/longitude/timestamp/speed with
// NO bearing and NO occupancy) mapped through the same vehicle-item shape the
// TPBI feed uses, so the same renderers serve both live sources.
const tranzyState = (items: Array<Record<string, unknown>>) => {
  const now = new Date().toISOString();
  return {
    key: 'transport:tranzy:vehicles:1', name: 'Tranzy · CTP Cluj de verificare',
    url: 'https://api.tranzy.ai/v1/opendata/vehicles', adapterVersion: 'tranzy.vehicles.v1',
    status: 'fresh', publishedAt: now, lastSuccessAt: now, lastAttemptAt: now,
    nextAttemptAt: null, error: null, ttlSeconds: 30,
    data: {kind: 'vehicles', observedAt: now, isLive: true, agency: 'CTP Cluj de verificare',
      page: 0, pages: 1, total: items.length, entityCount: items.length, items},
  };
};

test.describe('Tranzy live vehicles outside the TPBI coverage', () => {
  test('stubbed Tranzy vehicles render through the same live shape: markers, records and operator name', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const now = new Date().toISOString();
    await page.route('**/api/tranzy-live*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tranzyState([
          {id: 'tz-1', routeId: '25', tripId: 'tz-trip-25', vehicleName: 'Tramvaiul de verificare', licensePlate: '',
           lat: 46.7712, lon: 23.6236, stopId: '', observedAt: now, bearing: null, speed: 9.7,
           occupancy: null, occupancyPercentage: null, wheelchairAccessible: 'WHEELCHAIR_ACCESSIBLE',
           currentStatus: null, details: {label: 'Tramvaiul de verificare'}},
          {id: 'tz-2', routeId: '30', tripId: 'tz-trip-30', vehicleName: 'Autobuzul fără viteză', licensePlate: '',
           lat: 46.77, lon: 23.6, stopId: '', observedAt: now, bearing: null, speed: null,
           occupancy: null, occupancyPercentage: null, wheelchairAccessible: null,
           currentStatus: null, details: {label: 'Autobuzul fără viteză'}},
        ])),
      });
    });

    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    await switchLocality(page, 'Cluj-Napoca');
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Vehicule în circulație'})).toBeVisible();
    await expect(workspace.getByText(/Tranzy Opendata · CLUJ-NAPOCA/i)).toBeVisible();

    await expect(workspace.locator('.public-map')).toBeVisible({timeout: 60_000});

    // Tranzy publishes no bearing, so no rotated heading marker is invented —
    // every vehicle keeps the circle marker and no [role=img] arrow is created.
    await expect(workspace.locator('.public-map [role="img"]')).toHaveCount(0);
    await expect(workspace.locator('.public-map canvas')).toBeVisible();

    // Each record names its operator-published line id, label and speed (m/s → km/h).
    const records = workspace.locator('.transit-live-record');
    await expect(records).toHaveCount(2);
    await expect(records.filter({hasText: 'Tramvaiul de verificare'})).toContainText('Linia 25');
    await expect(records.filter({hasText: 'Tramvaiul de verificare'})).toContainText('34.9 km/h');
    await expect(records.filter({hasText: 'Autobuzul fără viteză'})).toContainText('Linia 30');
    await expect(records.filter({hasText: 'Autobuzul fără viteză'})).not.toContainText('km/h');

    // The operator resolved for the locality is named at the source, next to the feed moment.
    await expect(workspace.getByText(/operator: CTP Cluj de verificare/)).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The standard environments run without TRANZY_API_KEY (the key registration is
  // pending), so the gated family must surface its honest note and invent nothing.
  test('without a Tranzy key the gated source is noted honestly and no vehicle or map is fabricated', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=transport&tab=vehicles');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    await switchLocality(page, 'Cluj-Napoca');
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Vehicule în circulație'})).toBeVisible();

    await expect(workspace.locator('.live-error', {hasText: /cheia de acces TRANZY_API_KEY/})).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.transit-live-record')).toHaveCount(0);
    await expect(workspace.locator('.public-map')).toHaveCount(0);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
