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

// Sub-pixel stacks of genuinely distinct places (Ateneul Român ↔ Muzeul Colecțiilor
// de Artă at ~0.45 svg units, the Sinaia trio's pairs at 0.24–0.54) can never be
// separated by zoom — the separation/disk ratio is scale-invariant — so even the
// deterministic nearest-pick can land on the neighbour when the click pixel is
// owned by rounding luck. The declutter displaces colliding pairs apart along
// their own axis (hairline leaders mark the true position), and the rendered
// (offset) position becomes the click target the resolver resolves against.
const PIN_GEO = [
  {label: 'Selectează Ateneul Român', name: 'Ateneul Român', id: 'ateneu', lat: 44.4413, lon: 26.0972},
  {label: 'Selectează Muzeul Colecțiilor de Artă', name: 'Muzeul Colecțiilor de Artă', id: 'osm-n2634652186', lat: 44.4446375, lon: 26.091422},
  {label: 'Selectează Castelul Peleș', name: 'Castelul Peleș', id: 'peles', lat: 45.359828, lon: 25.54302},
  {label: 'Selectează Castelul Pelișor', name: 'Castelul Pelișor', id: 'osm-w242580048', lat: 45.360563, lon: 25.539208},
  {label: 'Selectează Mănăstirea Sinaia', name: 'Mănăstirea Sinaia', id: 'osm-w1076307879', lat: 45.355321, lon: 25.549244},
  {label: 'Selectează Cetatea romană Adamclisi', name: 'Cetatea romană Adamclisi', id: 'osm-w132318311', lat: 44.09245, lon: 27.943598},
  {label: 'Selectează Tropaeum Traiani', name: 'Tropaeum Traiani', id: 'osm-w228772727', lat: 44.102324, lon: 27.955382},
] as const;
const geoByLabel = (label: string) => {
  const g = PIN_GEO.find(p => p.label === label);
  if (!g) throw new Error(`no known geometry for ${label}`);
  return g;
};
const projectLocal = (lat: number, lon: number): [number, number] => [(lon - 20) * 61, (49.1 - lat) * 84];

// Rendered geometry of named pins, read from the live DOM: the g.map-pin transform
// (offset included once the declutter lands) mapped to css px through the screen CTM.
async function renderedPins(page: Page, labels: string[]) {
  return page.evaluate(({labels}) => {
    const svg = document.querySelector('.map-workspace .romap svg') as unknown as SVGSVGElement | null;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) throw new Error('map svg or screen CTM unavailable');
    return labels.map(label => {
      const g = svg.querySelector(`g.map-pin[aria-label="${label}"]`) as SVGGElement | null;
      if (!g) throw new Error(`pin ${label} missing`);
      const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
      const c = new DOMPoint(tx, ty).matrixTransform(ctm as unknown as DOMMatrix);
      return {label, localX: tx, localY: ty, x: c.x, y: c.y};
    });
  }, {labels});
}

// Distance between the pin's rendered position and its true projected position, in
// svg local units — the leader-line length. Converges to 0 as zoom separates a pair.
async function leaderLengths(page: Page, labels: string[]) {
  const rendered = await renderedPins(page, labels);
  return rendered.map(p => {
    const g = geoByLabel(p.label);
    const [ax, ay] = projectLocal(g.lat, g.lon);
    return {label: p.label, length: Math.hypot(p.localX - ax, p.localY - ay)};
  });
}

test.describe('Hartă — deziglomerarea stivelor sub-pixel (offseturi + linii ghid)', () => {
  test('the Ateneul ↔ Muzeul Colecțiilor stack separates and each rendered position opens its own place', async ({page}) => {
    test.setTimeout(120_000);
    const pageErrors = collectPageErrors(page);
    const labels = [PIN_GEO[0].label, PIN_GEO[1].label];
    for (let attempt = 0; attempt < 2; attempt++) {
      await openMapFresh(page);
      await scrollMapIntoView(page, PIN_GEO[0].label);
      const rendered = await renderedPins(page, labels);
      const [a, b] = rendered;
      const sepCss = Math.hypot(a.x - b.x, a.y - b.y);
      // Before the declutter the pair renders ~0.58 css px apart — one rounding-owned
      // pixel for both centres. Two css px is the pixel-ownership floor the repair
      // pass enforces; a matched pair reaches ~11.5.
      expect(sepCss, `Ateneul ↔ Muzeul Colecțiilor rendered ${sepCss.toFixed(2)} css px apart`).toBeGreaterThanOrEqual(2);

      // Clicking each pin's own RENDERED (offset) centre must open that place, and
      // the same pixel must keep resolving the same way (deterministic, not luck).
      for (const pin of rendered) {
        await page.mouse.click(Math.round(pin.x), Math.round(pin.y));
        const expected = {name: geoByLabel(pin.label).name, id: geoByLabel(pin.label).id};
        await expectPlaceOpened(page, expected);
        await openMapFresh(page);
        await scrollMapIntoView(page, PIN_GEO[0].label);
        const again = (await renderedPins(page, [pin.label]))[0];
        await page.mouse.click(Math.round(again.x), Math.round(again.y));
        await expectPlaceOpened(page, expected);
        await openMapFresh(page);
        await scrollMapIntoView(page, PIN_GEO[0].label);
      }
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('all three Sinaia-trio places are reachable at their rendered positions at compact zoom', async ({page}) => {
    test.setTimeout(120_000);
    const pageErrors = collectPageErrors(page);
    const trio = [PIN_GEO[2].label, PIN_GEO[3].label, PIN_GEO[4].label];
    await openMapFresh(page);
    await scrollMapIntoView(page, trio[0]);
    const rendered = await renderedPins(page, trio);
    for (let i = 0; i < rendered.length; i++) for (let j = i + 1; j < rendered.length; j++) {
      const sepCss = Math.hypot(rendered[i].x - rendered[j].x, rendered[i].y - rendered[j].y);
      expect(sepCss, `${rendered[i].label} ↔ ${rendered[j].label} rendered ${sepCss.toFixed(2)} css px apart`).toBeGreaterThanOrEqual(2);
    }
    // Keyboard focus targets and aria labels are untouched by the offsets.
    for (const g of PIN_GEO.slice(2, 5)) {
      const pin = page.locator(`.map-workspace .romap g.map-pin[aria-label="${g.label}"]`).first();
      await expect(pin).toHaveAttribute('role', 'button');
      await expect(pin).toHaveAttribute('tabindex', '0');
    }
    for (const pin of rendered) {
      await page.mouse.click(Math.round(pin.x), Math.round(pin.y));
      await expectPlaceOpened(page, {name: geoByLabel(pin.label).name, id: geoByLabel(pin.label).id});
      await openMapFresh(page);
      await scrollMapIntoView(page, trio[0]);
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('offsets recompose per zoom and converge toward the true positions', async ({page}) => {
    test.setTimeout(120_000);
    const pageErrors = collectPageErrors(page);
    const trioPair = [PIN_GEO[2].label, PIN_GEO[3].label];
    const convergePair = [PIN_GEO[5].label, PIN_GEO[6].label];
    await openMapFresh(page);
    await scrollMapIntoView(page, trioPair[0]);

    // Compact zoom: the permanently-stacked trio pair is displaced; the Dobrogea
    // pair (1.1 svg units apart, mutual-nearest in open country) collides too.
    const trioAt1 = await leaderLengths(page, trioPair);
    for (const p of trioAt1) expect(p.length, `${p.label} must carry an offset at compact zoom`).toBeGreaterThan(0.5);
    const pairAt1 = await leaderLengths(page, convergePair);
    for (const p of pairAt1) expect(p.length, `${p.label} must carry an offset at compact zoom`).toBeGreaterThan(0.5);

    // Zoom in one step (1.3): the offsets recompose — the trio's geographic
    // deviation shrinks (layout follows the zoom transform, not the mount), and
    // the Dobrogea pair is closer to leaving the collision set.
    await page.locator('.map-workspace .romap .map-controls button[aria-label="Mărește harta"]').click();
    const trioAt13 = await leaderLengths(page, trioPair);
    const pairAt13 = await leaderLengths(page, convergePair);
    for (let i = 0; i < 2; i++) {
      expect(trioAt13[i].length, `trio offset must shrink with zoom (${trioAt13[i].label})`).toBeLessThan(trioAt1[i].length);
      expect(pairAt13[i].length, `Dobrogea pair offset must shrink with zoom (${pairAt13[i].label})`).toBeLessThan(pairAt1[i].length);
    }

    // One more step (1.6): the Dobrogea pair's true separation exceeds the stack
    // threshold — its offsets converge fully to the truth (leaders withdrawn).
    await page.locator('.map-workspace .romap .map-controls button[aria-label="Mărește harta"]').click();
    const pairAt16 = await leaderLengths(page, convergePair);
    for (const p of pairAt16) expect(p.length, `${p.label} must be back at its true position at zoom 1.6`).toBe(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('hairline leaders anchor every displaced pin to its true position', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openMapFresh(page);
    await scrollMapIntoView(page, PIN_GEO[5].label);
    const leaders = await page.evaluate(() => {
      const g = document.querySelector('.map-workspace .romap g.map-leaders');
      if (!g) return null;
      return [...g.querySelectorAll('line')].map(line => ({
        x1: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')), y2: Number(line.getAttribute('y2')),
        stroke: line.getAttribute('stroke-width'), effect: line.getAttribute('vector-effect'),
      }));
    });
    expect(leaders, 'a displaced map must render a map-leaders group').not.toBeNull();
    expect(leaders!.length).toBeGreaterThanOrEqual(4);
    for (const line of leaders!) {
      expect(line.stroke, 'leaders must be 0.5 hairlines').toBe('0.5');
      expect(line.effect, 'leaders must not scale with the zoom transform').toBe('non-scaling-stroke');
      // Repair pushes are capped at twice the target separation (~18 svg units at
      // this width), so no fan can wander a pin far from its true position.
      const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
      expect(length, `leader length ${length.toFixed(1)} exceeds the displacement cap`).toBeLessThanOrEqual(19);
    }
    // The Adamclisi leader runs from the true position to the rendered (offset) pin.
    const converge = await renderedPins(page, [PIN_GEO[5].label]);
    const [ax, ay] = projectLocal(PIN_GEO[5].lat, PIN_GEO[5].lon);
    const anchored = leaders!.some(l =>
      Math.hypot(l.x1 - ax, l.y1 - ay) < 0.05 && Math.hypot(l.x2 - converge[0].localX, l.y2 - converge[0].localY) < 0.05);
    expect(anchored, 'a leader must anchor the displaced Adamclisi pin to its true position').toBe(true);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
