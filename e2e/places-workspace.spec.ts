import {test, expect, type Page} from '@playwright/test';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

const km = (a: {lat: number; lon: number}, b: {lat: number; lon: number}) => {
  const rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlon = (b.lon - a.lon) * rad;
  const x = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
};

// The settled gesture helpers proven by the leaflet leg in map-touch-gestures.spec.ts:
// CDP touch events pan/pinch the leaflet container (div.public-map) itself.
async function touchDrag(page: Page, x: number, y: number, dx: number, dy: number, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + (dx * i) / steps, y: y + (dy * i) / steps}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await cdp.detach();
  await page.waitForTimeout(300);
}
async function touchPinch(page: Page, cx: number, cy: number, from: number, to: number, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (half: number) => [{x: cx - half, y: cy}, {x: cx + half, y: cy}];
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: pts(from)});
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: pts(from + (to - from) * i / steps)});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await cdp.detach();
  await page.waitForTimeout(400);
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

  // The map layer renders the pin set of the selected radius: the whole in-radius
  // selection is served in one honest request (view=map), not the nearest page —
  // a nearest-200 slice visually clusters within ~0.5–5 km of the city center
  // once the radius selects more than one page, so the radius selector would
  // change nothing on the map (the reported bug).
  test('the map view serves every in-radius pin, spanning the chosen radius; the cards keep 18', async ({page}) => {
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
    const listPage = await page.waitForResponse(response => response.url().includes('/api/places') && !response.url().includes('view=map') && response.request().method() === 'GET');
    const listBody = await listPage.json();
    expect(listBody.data.pageSize).toBe(18);
    expect(listBody.data.items.length).toBe(Math.min(18, listBody.data.total));

    // Switching to the map view requests the pin set for the selected radius.
    const mapRequest = page.waitForResponse(response => response.url().includes('/api/places') && response.url().includes('view=map'), {timeout: 60_000});
    await workspace.getByRole('button', {name: 'Harta paginii'}).click();
    const mapResponse = await mapRequest;
    const url = new URL(mapResponse.url());
    expect(url.searchParams.get('scope')).toBe('nearby');
    expect(url.searchParams.get('radius')).toBe('100');
    expect(url.searchParams.get('view')).toBe('map');
    // The pin set has no paging cap and no page: every in-radius element is served.
    expect(url.searchParams.has('pageSize'), 'the pin request must not carry a page-size cap').toBe(false);
    expect(url.searchParams.has('page'), 'the pin request must not be paginated').toBe(false);
    const center = {lat: Number(url.searchParams.get('lat')), lon: Number(url.searchParams.get('lon'))};
    expect(Number.isFinite(center.lat) && Number.isFinite(center.lon)).toBe(true);

    const mapBody = await mapResponse.json();
    // The 100 km radius selects far more than one card page, and every element is served.
    expect(mapBody.data.total, 'the 100 km pin set must exceed the old 200-item page').toBeGreaterThan(200);
    expect(mapBody.data.items.length).toBe(mapBody.data.total);
    // The served pins span the radius — not a small dense core around the city center.
    const farthest = Math.max(...mapBody.data.items.map((r: any) => km(center, {lat: r.lat, lon: r.lon})));
    expect(farthest, 'the pin set must reach far beyond the ~2 km the nearest-200 slice covered').toBeGreaterThan(50);

    const map = workspace.locator('.public-map');
    await expect(map).toBeVisible({timeout: 60_000});
    await expect(map.locator('canvas')).toBeVisible();
    // Every served pin renders on the map canvas.
    await expect(map).toHaveAttribute('data-pins', String(mapBody.data.total));

    // Back on the cards view the page size returns to 18.
    const cardsRequest = page.waitForResponse(response => response.url().includes('/api/places') && !response.url().includes('view=map'));
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

  // The pin-set request is a validated boundary contract of its own: pin sets are
  // radius-relative (nearby scope only) and never carry a paging cap — a pin
  // request with page size or page would silently cap the radius again.
  test('the map pin request (view=map) is validated: nearby only, no paging caps, honest rejections', async ({request}) => {
    const base = 'category=cultura&scope=nearby&radius=100&sort=distance&lat=44.4268&lon=26.1025';

    const pins = await request.get(`/api/places?${base}&view=map`);
    expect(pins.status()).toBe(200);
    const pinsBody = await pins.json();
    expect(pinsBody.data.items.length).toBe(pinsBody.data.total);
    expect(pinsBody.data.pages).toBe(1);
    expect(pinsBody.data.items.length, 'the 100 km pin set is bigger than the largest card page').toBeGreaterThan(200);

    // The card page request keeps its own contract (up to 200 per page).
    const cards = await request.get(`/api/places?${base}&pageSize=200`);
    expect(cards.status()).toBe(200);
    const cardsBody = await cards.json();
    expect(cardsBody.data.pageSize).toBe(200);
    expect(cardsBody.data.items.length).toBe(Math.min(200, cardsBody.data.total));
    expect(cardsBody.data.items.length).toBeLessThan(cardsBody.data.total);

    for (const invalid of [
      'category=cultura&scope=all&view=map',
      'category=cultura&scope=nearby&radius=100&sort=distance&lat=44.4268&lon=26.1025&view=map&pageSize=200',
      'category=cultura&scope=nearby&radius=100&sort=distance&lat=44.4268&lon=26.1025&view=map&page=0',
      'category=cultura&scope=nearby&radius=101&sort=distance&lat=44.4268&lon=26.1025&view=map',
      'category=cultura&view=bogus',
    ]) {
      const rejected = await request.get(`/api/places?${invalid}`);
      expect(rejected.status(), `${invalid} must be rejected, never silently honored`).toBe(400);
      expect(await rejected.json()).toEqual({error: 'Alege o localitate și filtre valide.'});
    }
  });
});

test.describe('Places map — pin radius and pan refresh', () => {
  // Mobile context, the reported surface: the same touch emulation the leaflet
  // gesture leg in map-touch-gestures.spec.ts proved against this map.
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  // Panning to another zone must refresh the pins for that zone: the pin request
  // is radius-relative to the map's own settled center, debounced (one drag —
  // one fetch), and a zoom without a center change must not refetch.
  test('panning the map refetches the new zone pins, debounced; zoom alone does not', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await waitForClientReady(page);

    const workspace = page.locator('section.places-workspace').first();
    await workspace.locator('label', {hasText: 'Unde cauți'}).locator('select').selectOption('nearby');
    await workspace.locator('.entity-location label', {hasText: 'Rază'}).locator('select').selectOption('100');

    const pinUrls: string[] = [];
    page.on('request', r => {
      if (r.url().includes('/api/places') && r.url().includes('view=map')) pinUrls.push(r.url());
    });

    const firstMapResponse = page.waitForResponse(r => r.url().includes('/api/places') && r.url().includes('view=map'), {timeout: 60_000});
    await workspace.getByRole('button', {name: 'Harta paginii'}).click();
    const firstResponse = await firstMapResponse;
    const firstUrl = new URL(firstResponse.request().url());
    const firstCenter = {lat: Number(firstUrl.searchParams.get('lat')), lon: Number(firstUrl.searchParams.get('lon'))};
    const firstBody = await firstResponse.json();
    const map = workspace.locator('.public-map');
    await expect(map).toBeVisible({timeout: 60_000});
    await expect(map).toHaveAttribute('data-pins', String(firstBody.data.total));

    // Settle the initial fit before the gesture (the pacing the leaflet gesture leg proved).
    await page.evaluate(() => document.querySelector('.public-map')!.scrollIntoView({block: 'center', behavior: 'instant'}));
    await page.waitForTimeout(1200);

    const {x, y} = await page.evaluate(() => {
      const el = document.querySelector('.public-map')!;
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};
    });

    const before = pinUrls.length;
    await touchDrag(page, x, y, -90, -140);

    // The panned map issues a new pin request from its own settled center.
    const secondResponse = await page.waitForResponse(r => {
      if (!r.url().includes('/api/places') || !r.url().includes('view=map')) return false;
      const p = new URL(r.url()).searchParams;
      return p.get('lat') !== firstUrl.searchParams.get('lat') || p.get('lon') !== firstUrl.searchParams.get('lon');
    }, {timeout: 30_000});
    const secondUrl = new URL(secondResponse.request().url());
    const secondCenter = {lat: Number(secondUrl.searchParams.get('lat')), lon: Number(secondUrl.searchParams.get('lon'))};
    const secondBody = await secondResponse.json();
    expect(km(firstCenter, secondCenter), 'the new pin request must target a meaningfully different zone').toBeGreaterThan(25);
    expect(secondBody.data.items.length).toBe(secondBody.data.total);
    expect(secondBody.data.total, 'the new zone must have its own pins rendered').toBeGreaterThan(0);
    await expect(map).toHaveAttribute('data-pins', String(secondBody.data.total));

    await page.waitForTimeout(1600);
    expect(pinUrls.length, 'one drag must fire exactly one debounced pin fetch').toBe(before + 1);

    // A zoom around the same center keeps the request unchanged: no refetch storm.
    const beforePinch = pinUrls.length;
    await touchPinch(page, x, y, 55, 170);
    await page.waitForTimeout(1600);
    expect(pinUrls.length, 'a zoom without a center change must not refetch the pins').toBe(beforePinch);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
