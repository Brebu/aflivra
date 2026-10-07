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

test.describe('Places workspace', () => {
  test('national inventory renders with locality scope, nearby radius control and entity cards', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');

    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Muzee, teatre și obiective de vizitat'})).toBeVisible();
    await expect(workspace.getByLabel('Caută locuri, servicii, adrese și contacte')).toBeVisible();

    // Locality filter ("Unde cauți") — switching to nearby exposes the radius control
    // and the location city picker for the chosen locality.
    await waitForClientReady(page);
    const scopeSelect = workspace.locator('label', {hasText: 'Unde cauți'}).locator('select');
    await expect(scopeSelect).toBeVisible();
    await scopeSelect.selectOption('nearby');

    const radiusGroup = workspace.locator('.entity-location');
    await expect(radiusGroup).toBeVisible();
    await expect(radiusGroup.getByLabel('Localitate', {exact: true})).toBeVisible();
    await expect(radiusGroup.getByRole('button', {name: 'Aplică localitatea'})).toBeVisible();
    const radiusSelect = radiusGroup.locator('label', {hasText: 'Rază'}).locator('select');
    await expect(radiusSelect).toBeVisible();
    await radiusSelect.selectOption('30');

    // The scope note names the active radius; results then stream from the local API
    // against the bundled national inventory (no upstream network call here).
    await expect(workspace.locator('.field-help').first()).toContainText('raza de 30 km');
    await expect(workspace.locator('.entity-results-header')).toContainText(/rezultate/);
    await expect(workspace.locator('.entity-card').first()).toBeVisible({timeout: 30_000});

    // View chips and filter reset for the inventory.
    await expect(workspace.getByRole('button', {name: 'Fișe', exact: true})).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Harta paginii'})).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Resetează filtrele'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the mediu inventory offers the shelters and rest-area subcategories from the national corpus', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=mediu');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');

    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Natură și locuri în aer liber'})).toBeVisible();

    // The subcategory filter is populated from the national corpus manifest; the
    // OSM shelter/hut/rest-area classes add their own labels to the list.
    const subSelect = workspace.locator('label', {hasText: 'Subcategorie'}).locator('select');
    await expect(subSelect).toBeVisible();
    await expect(subSelect.locator('option', {hasText: 'Adăposturi'})).toBeAttached();
    await expect(subSelect.locator('option', {hasText: 'Spații de odihnă'})).toBeAttached();

    // Filtering to Adăposturi returns shelter records (refuge huts, wilderness
    // huts and amenity=shelter features) tagged with the subcategory in OSM.
    await subSelect.selectOption('Adăposturi');
    await expect(workspace.locator('.entity-results-header')).toContainText(/rezultat/, {timeout: 30_000});
    await expect(workspace.locator('.entity-card').first()).toBeVisible({timeout: 30_000});
    await expect(workspace.locator('.entity-card .kicker').first()).toContainText('Adăposturi');
    await expect(workspace.locator('.entity-results-header')).toContainText('locuri în categoria națională');

    // The rest-area class keeps its own filterable subcategory label.
    await subSelect.selectOption('Spații de odihnă');
    await expect(workspace.locator('.entity-results-header')).toContainText(/rezultat/, {timeout: 30_000});
    await expect(workspace.locator('.entity-card .kicker').first()).toContainText('Spații de odihnă');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The places map layer needs a map-sized page: the cards keep 18 per page while
  // the map view requests the fuller page, so the radius selection visibly changes
  // the pin set instead of always painting the 18 nearest cards.
  test('the map view serves a fuller page (pageSize 200) and the cards keep 18', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await waitForClientReady(page);

    const workspace = page.locator('section.places-workspace').first();
    const scopeSelect = workspace.locator('label', {hasText: 'Unde cauți'}).locator('select');
    await scopeSelect.selectOption('nearby');
    const radiusSelect = workspace.locator('.entity-location label', {hasText: 'Rază'}).locator('select');
    await radiusSelect.selectOption('100');

    // The list page stays 18 per page against the local API.
    const listPage = await page.waitForResponse(response => response.url().includes('/api/places') && !response.url().includes('pageSize=') && response.request().method() === 'GET');
    const listBody = await listPage.json();
    expect(listBody.data.pageSize).toBe(18);
    expect(listBody.data.items.length).toBe(Math.min(18, listBody.data.total));

    // Switching to the map view requests the map-sized page.
    const mapPageRequest = page.waitForResponse(response => response.url().includes('/api/places') && response.url().includes('pageSize=200'), {timeout: 60_000});
    await workspace.getByRole('button', {name: 'Harta paginii'}).click();
    const mapBody = await (await mapPageRequest).json();
    expect(mapBody.data.pageSize).toBe(200);
    expect(mapBody.data.items.length).toBe(Math.min(200, mapBody.data.total));
    expect(mapBody.data.items.length, 'the map page must carry more pins than the card page').toBeGreaterThan(18);

    const map = workspace.locator('.public-map');
    await expect(map).toBeVisible({timeout: 60_000});
    await expect(map.locator('canvas')).toBeVisible();

    // Back on the cards view the page size returns to 18.
    const cardsRequest = page.waitForResponse(response => response.url().includes('/api/places') && !response.url().includes('pageSize='));
    await workspace.getByRole('button', {name: 'Fișe', exact: true}).click();
    const cardsBody = await (await cardsRequest).json();
    expect(cardsBody.data.pageSize).toBe(18);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The page-size contract is validated at the boundary: only bounded integers
  // are served an honest bigger page — everything else is rejected, never clamped.
  test('the places page size is a validated request parameter (1–200), never silently clamped', async ({request}) => {
    const nearby = 'category=cultura&scope=nearby&radius=100&sort=distance&lat=44.4268&lon=26.1025&page=0';

    const oversized = await request.get(`/api/places?${nearby}&pageSize=200`);
    expect(oversized.status()).toBe(200);
    const wideBody = await oversized.json();
    expect(wideBody.data.pageSize).toBe(200);
    expect(wideBody.data.items.length).toBe(Math.min(200, wideBody.data.total));

    const listed = await request.get(`/api/places?${nearby}`);
    expect(listed.status()).toBe(200);
    const listBody = await listed.json();
    expect(listBody.data.pageSize).toBe(18);
    expect(listBody.data.items.length).toBe(Math.min(18, listBody.data.total));

    for (const invalid of ['0', '201', '500', 'abc', '18.5']) {
      const rejected = await request.get(`/api/places?${nearby}&pageSize=${invalid}`);
      expect(rejected.status(), `pageSize=${invalid} must be rejected, not clamped`).toBe(400);
      expect(await rejected.json()).toEqual({error: 'Alege o localitate și filtre valide.'});
    }
  });
});
