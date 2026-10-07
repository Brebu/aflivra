import {test, expect, type Page, type Route} from '@playwright/test';

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

// The venue registry entry for Cluj (geo-anchored like a cinema site) and a fixture
// response shaped exactly like the tribe-events-v1 calendar the loader will serve:
// operator-published media, official deep-links, ticket deep-link only where the
// venue itself publishes one (the guided-tour fixture carries none — live reality).
const now = () => new Date().toISOString();
const operaclujVenue = {
  id: 'operacluj', name: 'Opera Națională Română Cluj-Napoca', short: 'Opera Cluj',
  city: 'Cluj-Napoca', county: 'Cluj', address: 'Bulevardul Eroilor nr. 27',
  latitude: 46.7694, longitude: 23.5899, url: 'https://operacluj.ro/', kind: 'tribe-events-v1',
};
const operaclujEvent = (over: Record<string, unknown> = {}) => ({
  id: '23317', title: 'BAL MASCAT',
  content: 'Operă în trei acte pe un libret de Antonio Somma.\nSpectacolul este interpretat în limba italiană cu supratitrare în limba română.',
  start: '2026-10-07T18:30', end: '2026-10-07T19:00',
  url: 'https://operacluj.ro/spectacole/stagiunea-2026-2027/balmascat-7-octombrie-2026-18-30/',
  category: 'operă', sourceName: 'Opera Națională Română Cluj-Napoca',
  media: [{kind: 'image', url: 'https://images.operacluj.ro/2023/12/HEADER-site-1920x839-px-2.jpg', caption: 'BAL MASCAT', sourceUrl: 'https://operacluj.ro/spectacole/stagiunea-2026-2027/balmascat-7-octombrie-2026-18-30/', credit: 'Opera Națională Română Cluj-Napoca · materialul publicat de instituție'}],
  ...over,
});
const operaclujState = (items: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => {
  const stamp = now();
  return {
    key: 'events:operacluj', name: 'Opera Națională Română Cluj-Napoca · calendarul public', url: 'https://operacluj.ro/',
    adapterVersion: 'events.tribe-rest.v1', status: 'fresh', publishedAt: null, lastSuccessAt: stamp, lastAttemptAt: stamp,
    nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {venue: operaclujVenue, items, venueCount: 1, sourceUrl: 'https://operacluj.ro/', note: 'Program publicat de instituție.'},
    ...over,
  };
};
const odeonVenue = {
  id: 'odeon', name: 'Teatrul Odeon', short: 'Teatrul Odeon',
  city: 'București', county: 'București', address: 'Str. Aristide Briand nr. 27',
  latitude: 44.43667, longitude: 26.09738, url: 'https://teatrul-odeon.ro/', kind: 'jsonld',
};
const odeonState = () => {
  const stamp = now();
  return {
    key: 'events:odeon', name: 'Teatrul Odeon · calendarul public', url: 'https://teatrul-odeon.ro/',
    adapterVersion: 'events.jsonld.v2', status: 'fresh', publishedAt: null, lastSuccessAt: stamp, lastAttemptAt: stamp,
    nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {venue: odeonVenue, items: [{id: 'https://teatrul-odeon.ro/spectacol-de-verificare', title: 'Spectacol de verificare', content: 'Descrierea spectacolului de verificare.', start: '2026-10-08T19:30', end: '2026-10-08T21:00', url: 'https://teatrul-odeon.ro/spectacol-de-verificare', sourceName: 'Teatrul Odeon', media: []}], venueCount: 1, sourceUrl: 'https://teatrul-odeon.ro/', note: 'Program publicat de Teatrul Odeon.'},
  };
};

// One routed stub per venue id: the fixture-stubbed venue feeds. Requests are captured
// so the spec also pins the workspace→route contract (venue=id on every calendar call).
const venueRoute = (fulfillments: Record<string, (route: Route) => Promise<void>>) => {
  const requests: string[] = [];
  const handler = async (route: Route) => {
    const venue = new URL(route.request().url()).searchParams.get('venue') || 'odeon';
    requests.push(venue);
    const fulfill = fulfillments[venue] || fulfillments.odeon;
    await (fulfill || fulfillments.odeon)(route);
  };
  return {requests, handler};
};

test.describe('Spectacole — venue registry calendars (beyond Odeon)', () => {
  test('a fixture-stubbed Opera Cluj calendar renders its events, images and countText in the venue-anchored workspace', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const {requests, handler} = venueRoute({
      odeon: route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(odeonState())}),
      operacluj: route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(operaclujState([
        operaclujEvent(),
        operaclujEvent({id: '23319', title: 'FÂNTÂNA DIN BAHCISARAI', start: '2026-10-09T18:30', end: '2026-10-09T20:30', category: 'balet', url: 'https://operacluj.ro/spectacole/stagiunea-2026-2027/fantanadinbahcisarai-9-octombrie-2026-18-30/'}),
      ]))}),
    });
    await page.route('**/api/events*', handler);

    await page.goto('/#view=domain&id=cultura&tab=events');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    await switchLocality(page, 'Cluj-Napoca');

    // The auto-selected venue for Cluj is the registry's Cluj institution, not Odeon.
    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Spectacole la Opera Națională Română Cluj-Napoca'})).toBeVisible();
    await expect(requests).toContain('operacluj');

    // The venue's own published events render as cards, with the operator-published image.
    await expect(workspace.getByRole('heading', {level: 3, name: 'BAL MASCAT'})).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 3, name: 'FÂNTÂNA DIN BAHCISARAI'})).toBeVisible();
    await expect(workspace.locator('.record-cover[title="BAL MASCAT"], .record-cover[alt="BAL MASCAT"]')).toBeVisible();

    // countText grammar in Romanian: 2 events → „2 spectacole”.
    await expect(workspace.getByText('2 spectacole')).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a down venue degrades honestly while the registry keeps serving the other institution', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const {handler} = venueRoute({
      operacluj: route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
        key: 'events:operacluj', name: 'Opera Națională Română Cluj-Napoca · calendarul public', url: 'https://operacluj.ro/',
        adapterVersion: 'events.tribe-rest.v1', status: 'unavailable', publishedAt: null, lastSuccessAt: null, lastAttemptAt: now(),
        nextAttemptAt: null, error: 'Calendarul instituției nu poate fi verificat acum.', ttlSeconds: 3600, data: null,
      })}),
      odeon: route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(odeonState())}),
    });
    await page.route('**/api/events*', handler);

    await page.goto('/#view=domain&id=cultura&tab=events');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    await switchLocality(page, 'Cluj-Napoca');

    // The down venue surfaces its honest error and invents no event.
    const workspace = page.locator('section.live-section');
    await expect(workspace.locator('.live-error', {hasText: 'Calendarul instituției nu poate fi verificat acum.'})).toBeVisible({timeout: 30_000});
    await expect(workspace.locator('.news-card')).toHaveCount(0);

    // The registry keeps the other institution available: switch scope to the whole country and pick Odeon.
    await workspace.getByLabel('Locație').selectOption('national');
    await workspace.getByLabel('Instituție').selectOption('odeon');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Spectacole la Teatrul Odeon'})).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 3, name: 'Spectacol de verificare'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the ticket deep-link appears only for the events where the institution publishes one', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const {handler} = venueRoute({
      operacluj: route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(operaclujState([
        operaclujEvent({ticketUrl: 'https://entertix.ro/spectacol/bal-mascat-cluj'}),
        operaclujEvent({id: '23319', title: 'FÂNTÂNA DIN BAHCISARAI', start: '2026-10-09T18:30', end: '2026-10-09T20:30', category: 'balet', url: 'https://operacluj.ro/spectacole/stagiunea-2026-2027/fantanadinbahcisarai-9-octombrie-2026-18-30/'}),
      ]))}),
      odeon: route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(odeonState())}),
    });
    await page.route('**/api/events*', handler);

    await page.goto('/#view=domain&id=cultura&tab=events');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    await switchLocality(page, 'Cluj-Napoca');

    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 3, name: 'BAL MASCAT'})).toBeVisible();

    // The event whose calendar row carries the institution-published ticket URL links out to it.
    await workspace.locator('.news-card', {hasText: 'BAL MASCAT'}).getByRole('button', {name: 'Toate detaliile spectacolului'}).click();
    const tickets = page.locator('.reader-dialog');
    await expect(tickets).toBeVisible();
    await expect(tickets.getByRole('link', {name: 'Bilete la operator'})).toHaveAttribute('href', 'https://entertix.ro/spectacol/bal-mascat-cluj');
    await expect(tickets.getByRole('link', {name: 'Pagina oficială a spectacolului'})).toHaveAttribute('href', 'https://operacluj.ro/spectacole/stagiunea-2026-2027/balmascat-7-octombrie-2026-18-30/');
    await page.keyboard.press('Escape');
    await expect(tickets).toBeHidden();

    // The event whose calendar row publishes no ticket URL keeps only the official page link.
    await workspace.locator('.news-card', {hasText: 'FÂNTÂNA DIN BAHCISARAI'}).getByRole('button', {name: 'Toate detaliile spectacolului'}).click();
    await expect(tickets).toBeVisible();
    await expect(tickets.getByRole('link', {name: 'Bilete la operator'})).toHaveCount(0);
    await expect(tickets.getByRole('link', {name: 'Pagina oficială a spectacolului'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
