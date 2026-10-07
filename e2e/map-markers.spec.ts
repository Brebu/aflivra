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

// PORTED 2026-10-07 (feat/national-map-leaflet): the national repere map (#view=map)
// renders on the same Leaflet/OSM surface as the live maps (app/public-map.tsx, the
// user's request: „natural earth map vreau să fie schimbat cu aia unde am și live"),
// where every repere is a real DOM button inside its Leaflet marker — native pan,
// pinch and zoom, true coordinates, real pixel zoom. The SVG-canvas emulation legs
// that existed FOR the constrained Natural Earth surface were retired, not ported:
//   - ownedPixels + nearest-pin-to-click-point resolution (overlap pair & sub-pixel
//     Sinaia trio, ×2 per pixel): hit resolution is now the browser's own hit-testing
//     on real buttons at real zoom; the deterministic-stuck-pin guarantee is the
//     zoom-separation + per-pin-click legs below plus the mobile stack-tap leg.
//   - the declutter/leader legs (offset separation ≥2 css px, offsets recomposing per
//     zoom, hairline leaders anchoring displaced pins): declutter existed because the
//     emulated SVG zoom scaled pin size and map together, so sub-pixel stacks never
//     separated; Leaflet's true zoom changes meters-per-pixel, so separation is native
//     (asserted by the separation leg at deep zoom).
// Retired gauge state (svg transform, screen CTM, map-leaders) exists only on the
// compact .romap mini-maps (home discovery-split, place overview, planner), which
// keep their own machine (app/v2-charts.tsx) untouched.

// Zero external fetches: OSM tiles are stubbed at the network layer, no-store so
// every zoom change produces fresh, observable tile requests (the leaflet-map
// convention from map-touch-gestures.spec.ts / imobiliare-ortho.spec.ts).
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// The marker set covers the full national inventory (267 repere), where dense clusters
// (București, Sinaia) overlap at low zoom; this reper has no neighbour within a pin
// radius, so its button is a deterministic, unobstructed hit target for the click and
// keyboard legs.
const MARKER = {label: 'Selectează Biserica Rotondă din Geoagiu', name: 'Biserica Rotondă din Geoagiu', id: 'osm-w780297975'};

// The Sinaia cluster sits three genuinely distinct places within ~1 km (Castelul
// Peleș ↔ Castelul Pelișor 309 m, ↔ Mănăstirea Sinaia 700 m) — pixel-stacked at the
// national fit, naturally separated by the map's own zoom.
const CLUSTER = [
  {label: 'Selectează Castelul Peleș', name: 'Castelul Peleș', id: 'peles'},
  {label: 'Selectează Castelul Pelișor', name: 'Castelul Pelișor', id: 'osm-w242580048'},
  {label: 'Selectează Mănăstirea Sinaia', name: 'Mănăstirea Sinaia', id: 'osm-w1076307879'},
];

const pinIn = (page: Page, label: string) => page.locator(`.map-workspace .public-map button.repere-pin[aria-label="${label}"]`).first();
const pinsLabeled = (page: Page, label: string) => page.locator(`.map-workspace .public-map button.repere-pin[aria-label="${label}"]`);
const allPins = (page: Page) => page.locator('.map-workspace .public-map button.repere-pin');

async function scrollView(page: Page) {
  // The workspace's 267-entry sidebar is thousands of px tall — scroll the map
  // element itself, never the workspace block.
  await page.locator('.map-workspace .public-map').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 260));
}

async function openMapFresh(page: Page) {
  await page.route('**/tile.openstreetmap.org/**', route =>
    route.fulfill({contentType: 'image/png', body: TINY_PNG, headers: {'Cache-Control': 'no-store'}}));
  await page.goto('/#view=map');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'map');
  await waitForClientReady(page);
  // The map mounts through DeferredMount + the dynamic leaflet import — budget like
  // the other leaflet specs, then wait for actual repere buttons, not just the container.
  await expect(page.locator('.map-workspace .public-map.leaflet-container')).toBeVisible({timeout: 60_000});
  await allPins(page).first().waitFor({timeout: 30_000});
}

async function openMapAtMarker(page: Page) {
  await openMapFresh(page);
  const marker = pinIn(page, MARKER.label);
  // Keep the marker clear of the sticky header band before clicking.
  await marker.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 260));
  return marker;
}

async function expectPlaceOpened(page: Page, expected: {name: string; id: string}) {
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
  await expect(page.locator('.place-hero h1')).toHaveText(expected.name);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#view=place&id=${expected.id}`);
}

// Rendered centres of the named pins, read from the live DOM.
async function pinCenters(page: Page, labels: string[]) {
  return page.evaluate(labels => {
    const pins = [...document.querySelectorAll('.map-workspace .public-map button.repere-pin')].map(b => {
      const r = b.getBoundingClientRect();
      return {label: b.getAttribute('aria-label') || '', x: r.left + r.width / 2, y: r.top + r.height / 2};
    });
    return labels.map(label => {
      const center = pins.find(p => p.label === label);
      if (!center) throw new Error(`pin ${label} missing`);
      return center;
    });
  }, labels);
}

// Box-zoom (shift-drag, Leaflet's own control) onto the trio's current screen
// bounding box: fitBounds centers on the box, exactly what a user widening the
// view onto Sinaia does. The drag start must land on bare map (not on a repere
// button, whose click would navigate away), so the corner is nudged to the
// nearest pin-free point.
async function boxZoomOnto(page: Page, labels: string[], margin = 14) {
  const box = await page.evaluate(({labels, margin}) => {
    const pins = [...document.querySelectorAll('.map-workspace .public-map button.repere-pin')].map(b => {
      const r = b.getBoundingClientRect();
      return {label: b.getAttribute('aria-label') || '', l: r.left, t: r.top, r: r.right, b: r.bottom};
    });
    const chosen = labels.map(label => pins.find(p => p.label === label) ?? null);
    if (chosen.some(p => !p)) throw new Error('a box-zoom target pin is missing');
    const left = Math.min(...chosen.map(p => p!.l)) - margin, right = Math.max(...chosen.map(p => p!.r)) + margin;
    const top = Math.min(...chosen.map(p => p!.t)) - margin, bottom = Math.max(...chosen.map(p => p!.b)) + margin;
    const blocked = (x: number, y: number) => pins.some(r => x >= r.l && x <= r.r && y >= r.t && y <= r.b);
    let start = {x: left, y: top};
    if (blocked(left, top)) {
      let found: {x: number; y: number} | null = null;
      for (let dx = -64; dx <= 64 && !found; dx += 8) for (let dy = -64; dy <= 64 && !found; dy += 8) {
        const x = left + dx, y = top + dy;
        if (!blocked(x, y)) found = {x, y};
      }
      if (!found) throw new Error('no pin-free box-zoom start near the cluster');
      start = found;
    }
    return {x1: Math.round(start.x), y1: Math.round(start.y), x2: Math.round(right), y2: Math.round(bottom)};
  }, {labels, margin});

  await page.keyboard.down('Shift');
  await page.mouse.move(box.x1, box.y1);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y2, {steps: 6});
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
}

// Real zoom must separate the trio: keep box-zooming onto it until every pair of
// centres is twice a pin button apart, then work at that scale.
async function openMapZoomedOntoSinaia(page: Page) {
  await openMapFresh(page);
  await scrollView(page);
  const labels = CLUSTER.map(c => c.label);
  for (let attempt = 0; attempt < 4; attempt++) {
    const centers = await pinCenters(page, labels);
    const minPair = Math.min(
      Math.hypot(centers[0].x - centers[1].x, centers[0].y - centers[1].y),
      Math.hypot(centers[0].x - centers[2].x, centers[0].y - centers[2].y),
      Math.hypot(centers[1].x - centers[2].x, centers[1].y - centers[2].y),
    );
    if (minPair >= 40) return centers;
    await boxZoomOnto(page, labels);
  }
  const centers = await pinCenters(page, labels);
  const minPair = Math.min(
    Math.hypot(centers[0].x - centers[1].x, centers[0].y - centers[1].y),
    Math.hypot(centers[0].x - centers[2].x, centers[0].y - centers[2].y),
    Math.hypot(centers[1].x - centers[2].x, centers[1].y - centers[2].y),
  );
  throw new Error(`real zoom never separated the Sinaia trio (min pair ${minPair.toFixed(1)} css px)`);
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

test.describe('Hartă — reperele navighează la locul lor', () => {
  test('clicking a repere pin opens that place (#view=place&id=...)', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const marker = await openMapAtMarker(page);

    await marker.click();

    await expectPlaceOpened(page, MARKER);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('keyboard activation (Enter) on a repere pin opens that place too', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const marker = await openMapAtMarker(page);

    // Every repere is a real <button aria-label="Selectează …"> inside its Leaflet
    // marker — the map's pins are reachable and activatable by keyboard alone.
    await marker.focus();
    await page.keyboard.press('Enter');

    await expectPlaceOpened(page, MARKER);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the „Vezi ca listă" toggle swaps the map for the exploration list', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openMapFresh(page);

    await page.locator('.page-intro', {hasText: 'România, dintr-o privire.'}).getByRole('button', {name: 'Vezi ca listă'}).click();

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=explore');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Hartă — reperele rămân selectabile la orice scară', () => {
  test('a click landing far from every pin selects nothing', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openMapFresh(page);
    await scrollView(page);
    await allPins(page).first().waitFor();
    const empty = await page.evaluate(() => {
      const container = document.querySelector('.map-workspace .public-map')!;
      const cr = container.getBoundingClientRect();
      const pins = [...container.querySelectorAll('button.repere-pin')].map(b => b.getBoundingClientRect());
      // The zoom control band and the attribution corner are avoided too — a click
      // there does something of its own (zoom, open a page).
      const reserved = [...container.querySelectorAll('.leaflet-control, .map-credit')].map(el => el.getBoundingClientRect());
      const blocked = (x: number, y: number) =>
        pins.some(r => x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3) ||
        reserved.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
      for (let gx = 0.06; gx < 0.95; gx += 0.03) for (let gy = 0.06; gy < 0.95; gy += 0.03) {
        const x = cr.left + cr.width * gx, y = cr.top + cr.height * gy;
        if (!blocked(x, y)) return {x: Math.round(x), y: Math.round(y)};
      }
      throw new Error('no pin-free point found in the map viewport');
    });

    await page.mouse.click(empty.x, empty.y);

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'map');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=map');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('one pin per physical place: duplicates collapse, adjacent distinct places stay', async ({page}) => {
    await openMapFresh(page);
    // 273 source entries (6 editorial + 267 OSM) minus 6 same-place repeats.
    await expect(allPins(page)).toHaveCount(267);
    for (const label of [
      'Selectează Ateneul Român',
      'Selectează Castelul Bran',
      'Selectează Grădina Botanică',
      'Selectează Salina Praid',
      'Selectează Podul lui Traian',
      'Selectează Cascada Bigăr',
    ]) await expect(pinsLabeled(page, label)).toHaveCount(1);
    // Izbucul Bigăr is the spring feeding Cascada Bigăr — one visiting site, one pin.
    await expect(pinsLabeled(page, 'Selectează Izbucul Bigăr')).toHaveCount(0);
    // The sidebar repeats no place either.
    const sidebar = page.locator('.map-workspace .map-sidebar');
    await expect(sidebar.locator('.map-result', {hasText: 'Ateneul Român'})).toHaveCount(1);
    await expect(sidebar.locator('.map-result', {hasText: 'Salina Praid'})).toHaveCount(1);
    // The three stacked neighbouring places of the Sinaia cluster all keep their pin.
    for (const clusterPin of CLUSTER) await expect(pinsLabeled(page, clusterPin.label)).toHaveCount(1);
  });

  // With an active locality the repere layer obeys the chosen radius: the same
  // selector family as the places inventory. Brașov's editorial set is small at
  // 15 km (3 repere) and grows to 47 at 100 km — deterministic corpus counts with
  // the nearest place 60 m inside the 100 km line and the next 5 km outside it.
  test('the repere map obeys the chosen radius around the active locality', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openMapFresh(page);
    await switchLocality(page, 'Brașov');

    const sidebar = page.locator('.map-workspace .map-sidebar');
    // 15 km is the resting radius and its copy names it.
    await expect(allPins(page)).toHaveCount(3);
    await expect(sidebar.locator('.map-result')).toHaveCount(3);
    await expect(sidebar.getByText(/raza de 15 km/)).toBeVisible();

    const radiusSelect = sidebar.locator('label', {hasText: 'Rază'}).locator('select');
    await expect(radiusSelect).toBeVisible();
    await radiusSelect.selectOption('100');

    // The repere layer grows with the radius, on the map and in the sidebar alike.
    await expect(allPins(page)).toHaveCount(47);
    await expect(sidebar.locator('.map-result')).toHaveCount(47);
    await expect(sidebar.getByText(/raza de 100 km/)).toBeVisible();

    // The selector exists only with an active locality; the national default keeps
    // the full editorial set (asserted by the one-pin-per-place leg above).
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  // The ported cluster contract: at the national fit the Sinaia trio is
  // pixel-stacked; the map's own zoom must separate them onto distinct hit
  // targets, and at that scale each pin opens its own place.
  test('the Sinaia trio separates at real zoom and each pin opens its own place', async ({page}) => {
    test.setTimeout(120_000);
    const pageErrors = collectPageErrors(page);
    await openMapZoomedOntoSinaia(page);
    for (const clusterPin of CLUSTER) {
      await pinIn(page, clusterPin.label).click();
      await expectPlaceOpened(page, clusterPin);
      await openMapZoomedOntoSinaia(page);
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Hartă — tap pe cluster, pe mobil', () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  test('a tap on the Sinaia cluster deterministically opens the pin that owns the pixel', async ({page}) => {
    test.setTimeout(90_000);
    const pageErrors = collectPageErrors(page);
    const opened: string[] = [];
    for (let tapIndex = 0; tapIndex < 3; tapIndex++) {
      await openMapFresh(page);
      await page.locator('.map-workspace .public-map').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 200));
      await allPins(page).first().waitFor();
      // At phone scale the Sinaia stack (the trio plus Sinaia-town repere) covers the
      // same ~26 px hit target — no tap can discriminate its members. Hit-testing is
      // the browser's own now, so the honest deterministic claim is: the tap opens
      // EXACTLY the topmost pin owning the pixel (what elementFromPoint reports),
      // the same one every time — picking out one specific sibling is what the
      // real-zoom separation leg above is for.
      const tapTarget = await page.evaluate(() => {
        const el = document.querySelector('.map-workspace .public-map button.repere-pin[aria-label="Selectează Castelul Peleș"]') as HTMLElement | null;
        if (!el) throw new Error('the Sinaia cluster pin is missing');
        const r = el.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const owner = document.elementFromPoint(x, y)?.closest('button.repere-pin') as HTMLButtonElement | null;
        if (!owner) throw new Error('the tap pixel is owned by no repere pin');
        return {x, y, name: String(owner.getAttribute('aria-label')).replace('Selectează ', '')};
      });

      await page.touchscreen.tap(tapTarget.x, tapTarget.y);
      await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
      await expect(page.locator('.place-hero h1')).toHaveText(tapTarget.name);
      await expect.poll(() => page.evaluate(() => location.hash)).toContain('#view=place');
      opened.push(tapTarget.name);
    }
    expect(new Set(opened).size, `same tap pixel must always open the same place, got ${opened.join(', ')}`).toBe(1);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
