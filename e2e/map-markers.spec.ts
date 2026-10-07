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

// The marker set covers the full national inventory (267 repere), where dense clusters
// (București) overlap; this reper has no neighbour within a pin radius, so its centre is
// a deterministic, unobstructed hit target for the click and keyboard legs.
const MARKER = {label: 'Selectează Biserica Rotondă din Geoagiu', name: 'Biserica Rotondă din Geoagiu', id: 'osm-w780297975'};
async function openMapAtMarker(page: Page) {
  await page.goto('/#view=map');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'map');
  await waitForClientReady(page);
  const marker = page.locator(`.map-workspace .romap g.map-pin[aria-label="${MARKER.label}"]`).first();
  // Keep the marker clear of the sticky header band before clicking.
  await marker.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 260));
  return marker;
}

test.describe('Hartă — reperele navighează la locul lor', () => {
  test('clicking a repere marker opens that place (#view=place&id=...)', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const marker = await openMapAtMarker(page);

    await marker.locator('circle').first().click();

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText(MARKER.name);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#view=place&id=${MARKER.id}`);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('keyboard activation (Enter) on a repere marker opens that place too', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const marker = await openMapAtMarker(page);

    await marker.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText(MARKER.name);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#view=place&id=${MARKER.id}`);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

// The Sinaia cluster stacks three genuinely distinct places within ~0.5 svg units
// (Castelul Peleș ↔ Castelul Pelișor 309 m, ↔ Mănăstirea Sinaia 700 m). At national
// map scale their pin disks (r=11) overlap at every zoom, and the disk painted last
// (Mănăstirea Sinaia) intercepts pointer events aimed at the other two, so a click
// must resolve to the pin nearest to the click point, not to whichever disk is on top.
const CLUSTER = [
  {label: 'Selectează Castelul Peleș', name: 'Castelul Peleș', id: 'peles'},
  {label: 'Selectează Castelul Pelișor', name: 'Castelul Pelișor', id: 'osm-w242580048'},
  {label: 'Selectează Mănăstirea Sinaia', name: 'Mănăstirea Sinaia', id: 'osm-w1076307879'},
];

// Pixel-discriminable overlap: Castelul Corvinilor ↔ Parcul Dendrologic Simeria sit
// 12.1 svg units (~15 px) apart, so their disks overlap while a click at either pin's
// own pixel is unambiguously nearest to that pin. Simeria paints on top, so before
// the fix its disk intercepted the click at Corvinilor's pixel and opened the park.
const OVERLAP_PAIR = [
  {label: 'Selectează Castelul Corvinilor', name: 'Castelul Corvinilor', id: 'osm-w1327914056'},
  {label: 'Selectează Parcul Dendrologic Simeria', name: 'Parcul Dendrologic Simeria', id: 'osm-w445113480'},
];

async function openMapFresh(page: Page) {
  await page.goto('/#view=map');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'map');
  await waitForClientReady(page);
}

async function scrollMapIntoView(page: Page, label: string) {
  const pin = page.locator(`.map-workspace .romap g.map-pin[aria-label="${label}"]`).first();
  await pin.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 160));
  await pin.waitFor();
}

// Pointer events land on integer pixels; in a sub-pixel cluster the nearest pin to
// the CLICKED PIXEL is the deterministic outcome. For each pin this finds an integer
// pixel that no other pin in the set is nearer to (mouse events carry the integer
// coordinates exactly, so even a hair's margin is deterministic), so the legs below
// assert the nearest-pin-to-point contract at the exact scale where taps cannot
// discriminate the stack.
async function ownedPixels(page: Page, labels: string[], search = 5) {
  return page.evaluate(({labels, search}) => {
    const svg = document.querySelector('.map-workspace .romap svg') as unknown as SVGSVGElement | null;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) throw new Error('map svg or screen CTM unavailable');
    const all = [...svg.querySelectorAll('g.map-pin')].map(g => {
      const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
      const c = new DOMPoint(tx, ty).matrixTransform(ctm as unknown as DOMMatrix);
      return {label: g.getAttribute('aria-label') || '', x: c.x, y: c.y};
    });
    return labels.map(label => {
      const center = all.find(p => p.label === label);
      if (!center) throw new Error(`pin ${label} missing`);
      let best: {x: number; y: number; own: number} | null = null;
      for (let dx = -search; dx <= search; dx++) for (let dy = -search; dy <= search; dy++) {
        const px = Math.round(center.x) + dx, py = Math.round(center.y) + dy;
        let rival = Infinity;
        for (const o of all) if (o.label !== label) rival = Math.min(rival, Math.hypot(o.x - px, o.y - py));
        const own = Math.hypot(center.x - px, center.y - py);
        if (own < rival - 0.05 && (!best || own < best.own)) best = {x: px, y: py, own};
      }
      if (!best) throw new Error(`no integer pixel owned by ${label}`);
      return {label, x: best.x, y: best.y};
    });
  }, {labels, search});
}

async function expectPlaceOpened(page: Page, expected: {name: string; id: string}) {
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
  await expect(page.locator('.place-hero h1')).toHaveText(expected.name);
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#view=place&id=${expected.id}`);
}

test.describe('Hartă — clusterele de repere rămân selectabile', () => {
  for (const overlapped of OVERLAP_PAIR) {
    test(`a click at its own pixel opens ${overlapped.name} (overlap, nearest-pin resolution)`, async ({page}) => {
      test.setTimeout(60_000);
      const pageErrors = collectPageErrors(page);
      await openMapFresh(page);
      await scrollMapIntoView(page, overlapped.label);
      const owned = (await ownedPixels(page, OVERLAP_PAIR.map(p => p.label))).find(o => o.label === overlapped.label);
      if (!owned) throw new Error(`no owned pixel for ${overlapped.label}`);

      await page.mouse.click(owned.x, owned.y);

      await expectPlaceOpened(page, overlapped);
      expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    });
  }

  test('in the sub-pixel Sinaia cluster, the pixel whose nearest pin is X opens X, every time', async ({page}) => {
    test.setTimeout(90_000);
    const pageErrors = collectPageErrors(page);
    const byLabel = new Map(CLUSTER.map(c => [c.label, c]));
    await openMapFresh(page);
    await scrollMapIntoView(page, CLUSTER[0].label);
    const owned = await ownedPixels(page, CLUSTER.map(c => c.label));
    for (const target of owned) {
      // Twice per pixel: same pixel must always open the same place (deterministic
      // nearest-pin resolution, not paint-order luck).
      for (let attempt = 0; attempt < 2; attempt++) {
        await openMapFresh(page);
        await scrollMapIntoView(page, CLUSTER[0].label);
        await page.mouse.click(target.x, target.y);
        await expectPlaceOpened(page, byLabel.get(target.label)!);
      }
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('keyboard activation reaches a pin covered by its neighbours', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openMapFresh(page);
    const pin = page.locator(`.map-workspace .romap g.map-pin[aria-label="${CLUSTER[0].label}"]`).first();
    await pin.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 160));
    await pin.waitFor();

    await pin.focus();
    await page.keyboard.press('Enter');

    await expectPlaceOpened(page, CLUSTER[0]);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a click landing far from every pin selects nothing', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openMapFresh(page);
    await page.locator('.map-workspace .romap').scrollIntoViewIfNeeded();
    const empty = await page.evaluate(() => {
      const svg = document.querySelector('.map-workspace .romap svg') as unknown as SVGSVGElement | null;
      if (!svg) throw new Error('map svg missing');
      const pins = [...svg.querySelectorAll('g.map-pin')].map(g => {
        const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
        return [tx, ty] as [number, number];
      });
      const ctm = svg.getScreenCTM();
      if (!ctm) throw new Error('screen CTM unavailable');
      let best: {x: number; y: number; d: number} | null = null;
      for (let gx = 0; gx <= 32; gx++) for (let gy = 0; gy <= 24; gy++) {
        const x = (gx / 32) * 640, y = (gy / 24) * 490;
        let d = Infinity;
        for (const [px, py] of pins) d = Math.min(d, Math.hypot(px - x, py - y));
        const c = new DOMPoint(x, y).matrixTransform(ctm as unknown as DOMMatrix);
        const inView = c.x > 40 && c.y > 150 && c.x < innerWidth - 40 && c.y < innerHeight - 40;
        if (inView && (!best || d > best.d)) best = {x: c.x, y: c.y, d};
      }
      if (!best) throw new Error('no in-view pin-free point found');
      return {x: best.x, y: best.y, nearestSvgUnits: Math.round(best.d)};
    });
    expect(empty.nearestSvgUnits).toBeGreaterThan(22);

    await page.mouse.click(empty.x, empty.y);

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'map');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=map');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('one pin per physical place: duplicates collapse, adjacent distinct places stay', async ({page}) => {
    await openMapFresh(page);
    const map = page.locator('.map-workspace .romap');
    // 273 source entries (6 editorial + 267 OSM) minus 6 same-place repeats.
    await expect(map.locator('g.map-pin')).toHaveCount(267);
    for (const label of [
      'Selectează Ateneul Român',
      'Selectează Castelul Bran',
      'Selectează Grădina Botanică',
      'Selectează Salina Praid',
      'Selectează Podul lui Traian',
      'Selectează Cascada Bigăr',
    ]) await expect(map.locator(`g.map-pin[aria-label="${label}"]`)).toHaveCount(1);
    // Izbucul Bigăr is the spring feeding Cascada Bigăr — one visiting site, one pin.
    await expect(map.locator('g.map-pin[aria-label="Selectează Izbucul Bigăr"]')).toHaveCount(0);
    // The sidebar repeats no place either.
    const sidebar = page.locator('.map-workspace .map-sidebar');
    await expect(sidebar.locator('.map-result', {hasText: 'Ateneul Român'})).toHaveCount(1);
    await expect(sidebar.locator('.map-result', {hasText: 'Salina Praid'})).toHaveCount(1);
    // The three stacked neighbouring places of the Sinaia cluster all keep their pin.
    for (const clusterPin of CLUSTER) await expect(map.locator(`g.map-pin[aria-label="${clusterPin.label}"]`)).toHaveCount(1);
  });
});

test.describe('Hartă — tap pe cluster, pe mobil', () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

  test('a tap on the Sinaia cluster deterministically opens one of the stacked places', async ({page}) => {
    test.setTimeout(90_000);
    const pageErrors = collectPageErrors(page);
    const trioIds = new Set(CLUSTER.map(c => c.id));
    const opened: string[] = [];
    for (let tapIndex = 0; tapIndex < 3; tapIndex++) {
      await openMapFresh(page);
      const pin = page.locator(`.map-workspace .romap g.map-pin[aria-label="${CLUSTER[0].label}"]`).first();
      await pin.scrollIntoViewIfNeeded();
      await pin.waitFor();
      // At phone scale the three stacked pins sit ~0.15 css px apart — no tap can
      // discriminate them; the resolution must still be a deterministic nearest-pin.
      const center = await pin.evaluate(g => {
        const svg = (g as SVGGElement).ownerSVGElement;
        const ctm = svg?.getScreenCTM();
        if (!ctm) throw new Error('screen CTM unavailable');
        const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
        const c = new DOMPoint(tx, ty).matrixTransform(ctm as unknown as DOMMatrix);
        return {x: c.x, y: c.y};
      });
      const tapPixel = {x: Math.round(center.x), y: Math.round(center.y)};

      await page.touchscreen.tap(tapPixel.x, tapPixel.y);
      await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
      const hash = await page.evaluate(() => location.hash);
      const id = hash.replace('#view=place&id=', '');
      expect(trioIds, `tap must open one of the stacked trio, got ${id}`).toContain(id);
      opened.push(id);
    }
    expect(new Set(opened).size, `same tap pixel must always open the same place, got ${opened.join(', ')}`).toBe(1);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
