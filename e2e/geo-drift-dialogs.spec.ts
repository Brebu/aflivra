import {test, expect, type Page} from '@playwright/test';

// The geo drift contract: a GPS fix that quantizes into the next ~100 m cell while
// the resolved locality stays the same is a background data refresh, not a context
// change. Open dialogs and readers must survive it; a real locality change (an
// explicit manual city switch) must still close and re-scope them.
const HOME = {lat: 44.4268, lon: 26.1025, accuracy: 65};
// ~220 m north of HOME — the raw coordinates cross one 3-decimal cell boundary
// (44.427 -> 44.429 on the quantized key) while the resolved locality stays
// "București" in both the seed city list and the async cities.json catalog.
const DRIFT = {lat: 44.4288, lon: 26.1025, accuracy: 80};

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

const stripStatus = (page: Page) => page.locator('.location-strip [role="status"]').first();

// A real device delivers watchPosition fixes as success callbacks. Chromium's
// geolocation override machinery injects a transient POSITION_UNAVAILABLE error
// into active watches on every override change, and the app's error handler tears
// the whole location context down before the new fix lands — an emulation
// artifact, not the drift contract under test. The stub replays the current fix
// to every active watch through the same callback shape the browser uses.
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
    getCurrentPosition(success: (position: unknown) => void, error: (error: unknown) => void) { if (current) success({coords: {latitude: current.lat, longitude: current.lon, accuracy: current.accuracy}, timestamp: Date.now()}); else error({code: 2, message: ''}); }
  }});
  (window as unknown as Record<string, unknown>).__devicePosition = (lat: number, lon: number, accuracy: number) => { current = {lat, lon, accuracy}; deliver(); };
}

// The strip accuracy echoes the provider's own state, so it is the direct
// observable for "the drifted fix has landed in the app" — same-locality drift
// keeps the locality label, only the accuracy figure moves.
async function waitForDeviceFix(page: Page) {
  await expect(stripStatus(page)).toContainText('Aproape de București', {timeout: 60_000});
}

async function driftDevicePosition(page: Page) {
  await page.evaluate(fix => {
    (window as unknown as {__devicePosition: (lat: number, lon: number, accuracy: number) => void}).__devicePosition(fix.lat, fix.lon, fix.accuracy);
  }, DRIFT);
  await expect(stripStatus(page)).toContainText('precizie aproximativă 80 m', {timeout: 30_000});
}

test.describe('Geo drift dialogs', () => {
  test.beforeEach(async ({page}) => { await page.addInitScript(initMockedDeviceGeolocation, HOME); });

  test('a registry record dialog survives a same-locality position drift', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=sanatate&tab=health');
    await waitForDeviceFix(page);

    const recordHeading = page.locator('.record-heading').first();
    await expect(recordHeading).toBeVisible({timeout: 90_000});
    await recordHeading.click();
    const fields = page.locator('#record-health-0');
    await expect(recordHeading).toHaveAttribute('aria-expanded', 'true');
    await expect(fields).toBeVisible();
    const firstField = await fields.locator('dt').first().textContent();

    // The drifted fix legitimately re-keys the registry URL (the center moved);
    // the refresh must happen in the background, without closing the record.
    const driftRefetch = page.waitForRequest(/\/api\/directory\?.*lat=44\.429/, {timeout: 60_000}).catch(() => null);
    await driftDevicePosition(page);
    expect(await driftRefetch, 'the same-locality drift still refreshes the registry in the background').not.toBeNull();

    await expect(fields).toBeVisible();
    await expect(fields.locator('dt').first()).toHaveText(firstField ?? '');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the transit line reader survives a same-locality position drift', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=transport');
    await waitForDeviceFix(page);

    const openReader = page.getByRole('button', {name: 'Traseu complet și orar'}).first();
    await expect(openReader).toBeVisible({timeout: 90_000});
    const routeSnapshots: string[] = [];
    page.on('request', request => {
      if (/\/transit\/.+\.json/.test(new URL(request.url()).pathname)) routeSnapshots.push(request.url());
    });
    await openReader.click();
    const dialog = page.locator('.transit-dialog');
    await expect(dialog).toBeVisible({timeout: 30_000});
    await expect(dialog).toContainText('Toate opririle', {timeout: 60_000});
    const snapshotsBefore = routeSnapshots.length;
    expect(snapshotsBefore).toBeGreaterThan(0);

    // Requirement 2 wiring: the own-position dot renders on the per-line map
    // while positioning is on, from the raw reported fix (not the quantized cell).
    await expect(dialog.locator('.public-map div[role="img"][aria-label="Ești aici · precizie aproximativă 65 m"]')).toBeVisible();

    await driftDevicePosition(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Toate opririle');

    // The dot follows the live fix (accuracy 65 -> 80), stays a single layer, and
    // never churns the map: the route snapshot is not re-read while live polls continue.
    await expect(dialog.locator('.public-map div[role="img"][aria-label="Ești aici · precizie aproximativă 80 m"]')).toBeVisible();
    await expect(page.locator('.public-map div[role="img"][aria-label^="Ești aici"]')).toHaveCount(1);
    await page.waitForTimeout(7_000);
    expect(routeSnapshots.length, `route snapshot re-reads across the drift: ${routeSnapshots.slice(snapshotsBefore).join(' | ')}`).toBe(snapshotsBefore);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a cinema film dialog survives a same-locality position drift', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=filme');
    await waitForDeviceFix(page);

    const filmDetail = page.getByRole('button', {name: 'Detalii, trailer și toate proiecțiile'}).first();
    await expect(filmDetail).toBeVisible({timeout: 90_000});
    // The "Cinematograf" label wraps the select, so its text content also carries
    // every option; and while the film dialog is open Radix aria-hides the page
    // behind it, hiding the combobox from role queries — the scoped CSS selector
    // reads the same field through both states.
    const cinemaSelect = page.locator('.cinema-workspace select').nth(1);
    await expect(cinemaSelect).toBeVisible();
    const chosenCinema = await cinemaSelect.inputValue();
    await filmDetail.click();
    const dialog = page.locator('.reader-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', {level: 3, name: 'Toate proiecțiile'})).toBeVisible();

    await driftDevicePosition(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', {level: 3, name: 'Toate proiecțiile'})).toBeVisible();
    // The cinema choice outlives the drift too: distance re-sorts the list (the
    // nearest cinema flips at these coordinates), but the chosen venue stays.
    await expect(cinemaSelect).toHaveValue(chosenCinema);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a real locality change closes and rescopes the open record', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=sanatate&tab=health');
    await waitForDeviceFix(page);

    const recordHeading = page.locator('.record-heading').first();
    await expect(recordHeading).toBeVisible({timeout: 90_000});
    await recordHeading.click();
    const fields = page.locator('#record-health-0');
    await expect(fields).toBeVisible();

    const clujRefetch = page.waitForRequest(/\/api\/directory\?.*locality=Cluj-Napoca&county=Cluj/, {timeout: 60_000}).catch(() => null);
    await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
    const cityField = page.getByLabel('Localitate', {exact: true});
    await expect(cityField).toBeVisible();
    await cityField.fill('Cluj-Napoca · Cluj');
    const apply = page.getByRole('button', {name: 'Aplică localitatea'});
    await expect(apply).toBeEnabled();
    await apply.click();
    await page.keyboard.press('Escape');

    // A real locality change is an honest re-scope: the open record closes and
    // the registry re-fetches for the new locality.
    await expect(fields).toBeHidden();
    expect(await clujRefetch, 'the manual city switch must re-scope the registry fetch').not.toBeNull();
    await expect(stripStatus(page)).toContainText(/Cluj-Napoca\./, {timeout: 10_000});
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the own position layer renders on the national map and follows the live fix', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=map');
    await waitForDeviceFix(page);

    await expect(page.locator('.public-map div[role="img"][aria-label="Ești aici · precizie aproximativă 65 m"]')).toBeVisible({timeout: 60_000});

    await driftDevicePosition(page);
    // The dot re-renders from the new fix (accuracy 65 -> 80) and stays one layer,
    // separate from the repere pin corpus.
    await expect(page.locator('.public-map div[role="img"][aria-label="Ești aici · precizie aproximativă 80 m"]')).toBeVisible();
    await expect(page.locator('.public-map div[role="img"][aria-label^="Ești aici"]')).toHaveCount(1);

    // Positioning off removes the layer: the dot is on-device only.
    await page.getByRole('button', {name: 'Oprește localizarea · revino la România'}).click();
    await expect(page.locator('.public-map div[role="img"][aria-label^="Ești aici"]')).toHaveCount(0);
    await expect(stripStatus(page)).toContainText('România · oraș implicit București');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the own position layer renders on the places map view', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=cultura&tab=places');
    await waitForDeviceFix(page);

    await page.getByRole('button', {name: 'Harta paginii'}).click({timeout: 60_000});
    await expect(page.locator('.public-map div[role="img"][aria-label="Ești aici · precizie aproximativă 65 m"]')).toBeVisible({timeout: 60_000});
    await expect(page.locator('.public-map div[role="img"][aria-label^="Ești aici"]')).toHaveCount(1);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
