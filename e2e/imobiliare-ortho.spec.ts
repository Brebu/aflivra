import {test, expect, type Page, type Route} from '@playwright/test';

// The honest-imobiliare layer: the „Imobiliare & locuințe” tab under Bani & economie renders
// the two public layers the research verdict allows — ANL youth-housing reception sites and
// ANCPI mortgage dynamics (market indicators, not private listings) — and every live leaflet
// map carries the AIGA national orthophoto as an opt-in WMS overlay (default off, heavy
// tiles) with its CC-BY-4.0 credit in the map credit area. All legs run fully offline: the
// ANL/ANCPI routes are fixtures, and inspire.geomil.ro is stubbed — zero real tile fetches;
// the fixture payloads mirror the real January-2024 ANCPI export and the 2001–2025 ANL list.

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

const ANL_URL = 'https://data.gov.ro/dataset/04ab4208-d17f-4f9b-ba81-7778f373344d';
const ANCPI_URL = 'https://data.gov.ro/dataset/62410f25-a155-40fd-9aa9-ae54bdc96f42';

type AnlRecord = Record<string, string | number>;

const anlRecords: AnlRecord[] = [
  {'Nr. crt.': 1, 'Judeţ': 'ALBA', 'Localitate': 'Alba Iulia', 'Amplasament': 'Str. Livezii nr. 46-48', 'Nr. u.l.': 45, '2004': 45},
  {'Nr. crt.': 6, 'Judeţ': 'ALBA', 'Localitate': 'Alba Iulia', 'Amplasament': 'Str. Lalelelor nr. 97A, etapa I (MapN), bloc 1 și 2', 'Nr. u.l.': 36, '2007': 20, '2022': 16},
  {'Nr. crt.': 22, 'Judeţ': 'VRANCEA', 'Localitate': 'Coteşti', 'Amplasament': 'UTR, bloc 14', 'Nr. u.l.': 8, '2008': 8},
];

function anlState(records: AnlRecord[]) {
  return {
    key: 'housing:anl', name: 'ANL · locuințe pentru tineri', url: ANL_URL,
    adapterVersion: 'housing.anl-sites.v1', status: 'fresh' as const,
    publishedAt: '2025-03-11', lastSuccessAt: '2026-10-07T06:00:00Z', lastAttemptAt: '2026-10-07T06:00:00Z',
    nextAttemptAt: null, error: null, ttlSeconds: 86400,
    data: {
      title: 'Amplasamente locuințe pentru tineri · ANL', period: '2001–2025', edition: 'ediția 11.03.2025',
      publisher: 'Agenția Națională pentru Locuințe',
      program: 'Programul „Locuințe pentru tineri, destinate închirierii”',
      note: 'Amplasamentele recepționate în programul național de locuințe pentru tineri. Recepția nu înseamnă locuri libere: repartizarea o face ANL.',
      fields: ['Nr. crt.', 'Judeţ', 'Localitate', 'Amplasament', 'Nr. u.l.', '2004', '2007', '2008', '2022'],
      records,
      facets: {'Județele ANL': [...new Set(records.map(r => String(r['Judeţ'])))]},
      total: records.length, page: 0, pages: 1,
      years: [{name: '2001', value: 73}, {name: '2002', value: 2129}, {name: '2003', value: 4937}],
      unitsTotal: 37317,
    },
  };
}

// Real counts from the January-2024 ANCPI export (42 counties, 19.023 ipoteci înscrise).
const ancpiState = {
  key: 'housing:ancpi', name: 'ANCPI · dinamica ipotecilor', url: ANCPI_URL,
  adapterVersion: 'housing.ancpi-mortgages.v1', status: 'fresh' as const,
  publishedAt: '2024-02-21', lastSuccessAt: '2026-10-07T06:00:00Z', lastAttemptAt: '2026-10-07T06:00:00Z',
  nextAttemptAt: null, error: null, ttlSeconds: 86400,
  data: {
    title: 'Dinamica ipotecilor imobilelor · ANCPI', monthLabel: 'ianuarie 2024', monthText: '01.01.2024',
    operations: ['inscriere'],
    publisher: 'Agenția Națională de Cadastru și Publicitate Imobiliară',
    note: 'Numărul imobilelor ipotecate, publicat lunar de ANCPI. Indicator de piață, nu anunțuri imobiliare.',
    byType: [
      {name: 'cu constructii', value: 5342}, {name: 'apartamente', value: 5220},
      {name: 'agricol', value: 4665}, {name: 'fara constructii', value: 3576},
      {name: 'neagricol', value: 78}, {name: 'neprecizat', value: 142},
    ],
    byCounty: [
      {county: 'BUCURESTI', apartamente: 1704, agricol: 0, 'cu constructii': 1116, 'fara constructii': 943, neagricol: 0, neprecizat: 1, total: 3764},
      {county: 'ILFOV', apartamente: 300, agricol: 15, 'cu constructii': 538, 'fara constructii': 695, neagricol: 0, neprecizat: 1, total: 1549},
      {county: 'IASI', apartamente: 487, agricol: 65, 'cu constructii': 197, 'fara constructii': 310, neagricol: 3, neprecizat: 4, total: 1066},
      {county: 'TIMIS', apartamente: 438, agricol: 107, 'cu constructii': 369, 'fara constructii': 43, neagricol: 4, neprecizat: 11, total: 972},
    ],
    countyCount: 42, total: 19023, totalByOperation: {'inscriere': 19023},
  },
};

async function serveAnl(route: Route) {
  const url = new URL(route.request().url());
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const county = url.searchParams.get('county') || '';
  const kept = anlRecords.filter(r => {
    const blob = JSON.stringify(r).toLowerCase();
    return (!q || blob.includes(q)) && (!county || String(r['Judeţ']) === county);
  });
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(anlState(kept))});
}

async function openImobiliareTab(page: Page) {
  await page.goto('/#view=domain&id=bani&tab=imobiliare');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
  await waitForClientReady(page);
}

test.describe('Imobiliare & locuințe — straturile publice (ANL + ANCPI)', () => {
  test('the tab renders ANL reception sites from the fixture and the honest no-listings disclosure', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.route('**/api/anl*', serveAnl);
    await page.route('**/api/ancpi*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(ancpiState)});
    });

    await openImobiliareTab(page);
    const workspace = page.locator('section.live-section.imobiliare-workspace');
    await expect(workspace).toBeVisible({timeout: 30_000});
    await expect(workspace.getByRole('heading', {level: 2, name: /Locuințe și ipoteci, pe surse publice/})).toBeVisible();

    // The user-accepted honest framing: no private-listings layer exists; these are public layers.
    await expect(workspace.getByText(/Nu există o sursă publică liberă pentru anunțurile imobiliare/)).toBeVisible();
    await expect(workspace.getByText(/indicatori de piață, nu anunțuri/i)).toBeVisible();

    // ANL program listings: what public data honestly offers — programs, localities, units.
    await expect(workspace.getByRole('heading', {level: 3, name: /Amplasamente locuințe pentru tineri/})).toBeVisible();
    await expect(workspace.getByText(/3 amplasamente ANL găsite/)).toBeVisible({timeout: 30_000});
    await expect(workspace.locator('.record-list article .record-heading', {hasText: 'Str. Livezii nr. 46-48'}).first()).toBeVisible();
    await expect(workspace.getByText(/ediția 11\.03\.2025/)).toBeVisible();
    await expect(workspace.getByRole('link', {name: /Setul ANL pe data\.gov\.ro/})).toHaveAttribute('href', ANL_URL);

    // Browsing filters and opens the full published record.
    await workspace.locator('.record-list article .record-heading', {hasText: 'Str. Livezii nr. 46-48'}).first().click();
    await expect(workspace.locator('.record-fields dt', {hasText: 'Localitate'})).toBeVisible();
    await expect(workspace.locator('.record-fields dt', {hasText: 'Nr. u.l.'})).toBeVisible();

    await workspace.getByLabel('Caută amplasament, localitate sau județ').fill('coteşti');
    await workspace.getByLabel('Caută amplasament, localitate sau județ').press('Enter');
    await expect(workspace.getByText(/1 amplasament ANL găsit/)).toBeVisible({timeout: 30_000});
    await expect(workspace.locator('.record-list article .record-heading', {hasText: 'UTR, bloc 14'}).first()).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the ANL years chart and the ANCPI mortgage stats chart render published values', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.route('**/api/anl*', serveAnl);
    await page.route('**/api/ancpi*', async route => {
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(ancpiState)});
    });

    await openImobiliareTab(page);
    const workspace = page.locator('section.live-section.imobiliare-workspace');
    await expect(workspace).toBeVisible({timeout: 30_000});

    // National program trajectory (the ANL total row), charted following the existing chart pattern.
    const anlChart = workspace.locator('.data-chart:has(.chart-canvas[aria-label="Grafic: Locuințe recepționate pe an. Unitate: unități de locuit"])');
    await expect(anlChart).toBeVisible({timeout: 30_000});
    await anlChart.locator('summary', {hasText: 'Vezi valorile din grafic'}).click();
    await expect(anlChart.locator('.chart-table tbody tr', {hasText: '2002'}).first()).toContainText('2.129');

    // ANCPI monthly mortgage dynamics with its own chart and per-county table.
    await expect(workspace.getByRole('heading', {level: 3, name: /Dinamica ipotecilor · ANCPI/})).toBeVisible();
    await expect(workspace.getByText(/ianuarie 2024/).first()).toBeVisible();
    await expect(workspace.getByText(/19\.023 de ipoteci înscrise/)).toBeVisible({timeout: 30_000});
    const ancpiChart = workspace.locator('.data-chart:has(.chart-canvas[aria-label="Grafic: Ipoteci înscrise, după tipul imobilului. Unitate: ipoteci"])');
    await expect(ancpiChart).toBeVisible();
    await ancpiChart.locator('summary', {hasText: 'Vezi valorile din grafic'}).click();
    await expect(ancpiChart.locator('.chart-table tbody tr', {hasText: 'apartamente'}).first()).toContainText('5.220');
    await expect(workspace.locator('.facts-table tbody tr', {hasText: 'BUCURESTI'}).first()).toContainText('1.704');
    await expect(workspace.getByRole('link', {name: /Setul ANCPI pe data\.gov\.ro/})).toHaveAttribute('href', ANCPI_URL);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Harta live — stratul orto AIGA (WMS, implicit oprit)', () => {
  const AIGA_CAPABILITIES = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<WMS_Capabilities version="1.1.1"><Service><Name>WMS</Name><Title>AIGA Ortoimagini</Title></Service>'
    + '<Capability><Layer><Name>INSPIRE_OI_Orthoimagery</Name><Title>Ortoimagini la scara 1:5000</Title></Layer></Capability>'
    + '</WMS_Capabilities>';
  const TILE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );

  async function stubAiga(page: Page, capabilitiesBroken: () => boolean = () => false) {
    await page.route('**://inspire.geomil.ro/**', async route => {
      const url = route.request().url();
      if (url.includes('GetCapabilities')) {
        if (capabilitiesBroken()) {
          await route.abort('connectionrefused');
          return;
        }
        await route.fulfill({status: 200, contentType: 'text/xml', body: AIGA_CAPABILITIES});
      } else if (url.includes('GetMap')) {
        await route.fulfill({status: 200, contentType: 'image/png', body: TILE_PNG});
      } else {
        await route.fulfill({status: 404, body: 'not found'});
      }
    });
  }

  async function openPlacesLeafletMap(page: Page) {
    await stubAiga(page);
    await page.route('**://tile.openstreetmap.org/**', async route => {
      await route.fulfill({status: 200, contentType: 'image/png', body: TILE_PNG});
    });
    await page.goto('/#view=domain&id=mediu&tab=places');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible();
    await workspace.getByRole('button', {name: 'Harta paginii'}).click();
    await expect(workspace.locator('.public-map-wrap')).toBeVisible();
    await expect(workspace.locator('.public-map.leaflet-container')).toBeVisible({timeout: 60_000});
    return workspace;
  }

  test('toggling the ortho layer renders the AIGA WMS tiles and the CC BY 4.0 credit', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const workspace = await openPlacesLeafletMap(page);
    const mapWrap = workspace.locator('.public-map-wrap').first();

    // Default OFF: the heavy layer mounts only at the user's request.
    const orthoToggle = mapWrap.getByRole('button', {name: 'Ortoimagini AIGA 1:5000'});
    await expect(orthoToggle).toBeVisible();
    await expect(orthoToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(mapWrap.locator('a.map-credit')).toHaveCount(0);
    await expect(mapWrap.locator('img.leaflet-tile[src*="inspire.geomil.ro"]')).toHaveCount(0);

    await orthoToggle.click();
    await expect(orthoToggle).toHaveAttribute('aria-pressed', 'true');
    // Leaflet tiles the viewport; at least one WMS GetMap tile of the ortho layer renders.
    await expect(mapWrap.locator('img.leaflet-tile[src*="inspire.geomil.ro"]').first()).toBeVisible({timeout: 30_000});
    // The stubbed tile actually decodes — the layer renders, not just requests.
    await expect(mapWrap.locator('img.leaflet-tile.leaflet-tile-loaded[src*="inspire.geomil.ro"]').first()).toBeVisible({timeout: 30_000});

    // The source attribution line, where the Natural Earth credit renders.
    await expect(mapWrap.locator('a.map-credit', {hasText: 'Ortoimagini 1:5000 · AIGA / MApN · CC BY 4.0'})).toBeVisible();

    await orthoToggle.click();
    await expect(orthoToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(mapWrap.locator('img.leaflet-tile[src*="inspire.geomil.ro"]')).toHaveCount(0);
    await expect(mapWrap.locator('a.map-credit')).toHaveCount(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('when the AIGA service does not answer, the map stays honest: error and retry, no tiles', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    let capabilitiesFail = true;
    await stubAiga(page, () => capabilitiesFail);
    await page.route('**://tile.openstreetmap.org/**', async route => {
      await route.fulfill({status: 200, contentType: 'image/png', body: TILE_PNG});
    });

    await page.goto('/#view=domain&id=mediu&tab=places');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);
    const workspace = page.locator('section.places-workspace').first();
    await workspace.getByRole('button', {name: 'Harta paginii'}).click();
    await expect(workspace.locator('.public-map.leaflet-container')).toBeVisible({timeout: 60_000});
    const mapWrap = workspace.locator('.public-map-wrap').first();
    const orthoToggle = mapWrap.getByRole('button', {name: 'Ortoimagini AIGA 1:5000'});

    await orthoToggle.click();
    await expect(mapWrap.getByText(/Stratul orto AIGA nu poate fi încărcat acum/)).toBeVisible({timeout: 40_000});
    await expect(mapWrap.locator('img.leaflet-tile[src*="inspire.geomil.ro"]')).toHaveCount(0);
    await expect(mapWrap.locator('a.map-credit')).toHaveCount(0);

    // Recovery: the service answers on retry and the layer mounts with its credit.
    capabilitiesFail = false;
    await mapWrap.getByRole('button', {name: 'Reîncearcă stratul orto'}).click();
    await expect(mapWrap.locator('img.leaflet-tile[src*="inspire.geomil.ro"]').first()).toBeVisible({timeout: 30_000});
    await expect(mapWrap.locator('a.map-credit', {hasText: 'Ortoimagini 1:5000 · AIGA / MApN · CC BY 4.0'})).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
