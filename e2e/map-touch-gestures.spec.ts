import {test, expect, type Page} from '@playwright/test';

// Touch gestures on the two map surfaces (map-compliance-flows, UI/UX wave).
//
// The reporter's complaint: "nu pot face pan și zoom cu degetele pe mobil pe hartă"
// — the Natural Earth SVG map at #view=map could not be panned or pinch-zoomed with
// fingers. The pre-fix probe evidence (probe/uiux/touch-gesture-report.json +
// touch-gesture-report-v3.json, 2026-10-07 16:29–16:31, RED) measured three roots,
// all in RomaniaMap (app/v2-charts.tsx):
//   1. · touch drag started on a PIN never panned — the pan handler only armed when
//       the pointerdown target was the bare svg (`tagName==='svg'`), and pins cover
//       the map (drag at map center hit the Peleș pin: 12 moves delivered, 0 cancels,
//       0 pan);
//   2. · vertical-dominant drag was claimed by the browser for page scroll —
//       `.romap svg` had `touch-action: pan-y`, so the gesture ended in
//       pointercancel after 2 moves and scrolled the page instead (28 scroll events);
//   3. · no two-pointer pinch existed at all (20 two-finger moves delivered,
//       zoom unchanged).
// The fix (same commit): pan arms on any pointerdown inside the svg, the svg owns
// its gestures (`touch-action: none`), a two-pointer pinch zooms around its CTM
// midpoint clamped to the button range (1–2.8), and the pan state updater became
// pure (it previously re-read a mutable `_last` at flush time — deltas collapsed to
// 0, which had also left MOUSE pans at a single frame per drag).
// The leaflet PublicMap surface was verified healthy with fingers (pan + pinch via
// its own Drag/TouchZoom handlers) and is locked here as a guard leg.
test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function svgCenter(page: Page) {
  // Scoped to the map view's own romap: the home view renders a compact romap too,
  // and a bare '.romap' query can catch a transient home render before the hash
  // router switches to the map view (which scrolls a wrong 18k-px target instead).
  return page.evaluate(() => {
    const el = document.querySelector('.map-workspace .romap svg');
    if (!el) throw new Error('map-view romap svg missing');
    const r = el.getBoundingClientRect();
    return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};
  });
}
const svgTransform = (page: Page) => page.evaluate(() => document.querySelector('.map-workspace .romap svg > g')?.getAttribute('transform') ?? '');
async function resetMap(page: Page) {
  await page.locator('.map-workspace .romap button[aria-label="Resetează harta"]').click();
  await page.waitForTimeout(120);
}
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

test.describe('Harta Natural Earth (#view=map) — pan și zoom cu degetele', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/#view=map');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
    // Wait for the router to actually present the map view before addressing its
    // map — the initial render briefly shows home, whose compact romap satisfies
    // unscoped '.romap' queries.
    await expect.poll(() => page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? ''), {timeout: 15_000}).toBe('map');
    await expect.poll(() => page.evaluate(() => document.querySelector('.map-workspace .romap svg > g')?.getAttribute('transform') ?? ''), {timeout: 15_000}).toContain('scale');
    await page.evaluate(() => document.querySelector('.map-workspace .romap')!.scrollIntoView({block: 'center', behavior: 'instant'}));
    await page.waitForTimeout(400);
  });

  test('un drag cu degetul pornit pe un reper panănează harta', async ({page}) => {
    // The map center is covered by the Peleș pin — the drag may start on a pin.
    const {x, y} = await svgCenter(page);
    const before = await svgTransform(page);
    await touchDrag(page, x, y, 100, 80);
    const after = await svgTransform(page);
    expect(after, `pan must register (${before} -> ${after})`).not.toBe(before);
    expect(after).toContain('scale(1)');
  });

  test('un drag vertical rămâne al hărții: zero pointercancel, pagina nu se derulează', async ({page}) => {
    await page.evaluate(() => {
      const w = window as any;
      w.__touchAudit = {cancels: 0, scrolls: 0};
      window.addEventListener('pointercancel', () => { (w.__touchAudit.cancels as number)++; }, {capture: true, passive: true});
      window.addEventListener('scroll', () => { (w.__touchAudit.scrolls as number)++; }, {capture: true, passive: true});
    });
    const {x, y} = await svgCenter(page);
    const scrollBefore = page.evaluate(() => scrollY);
    const before = await svgTransform(page);
    await touchDrag(page, x, y, 6, 130);
    const after = await svgTransform(page);
    expect(after, 'vertical drag must pan the map').not.toBe(before);
    const audit = page.evaluate(() => (window as any).__touchAudit);
    expect(await audit).toEqual({cancels: 0, scrolls: 0});
    expect(await scrollBefore).toBe(await page.evaluate(() => scrollY));
  });

  test('un pinch cu două degete mărește harta în jurul punctului de prindere', async ({page}) => {
    const {x, y} = await svgCenter(page);
    const before = await svgTransform(page);
    await touchPinch(page, x, y, 55, 125);
    const after = await svgTransform(page);
    const scale = (t: string) => parseFloat((t.match(/scale\(([\d.]+)\)/) ?? ['0', '1'])[1]);
    expect(scale(after), `pinch must zoom (${before} -> ${after})`).toBeGreaterThan(1.3);
  });

  test('un tap pe un reper rămâne o selecție: navighează la profilul locului', async ({page}) => {
    // Tap a rendered pin at its measured position — no guessed coordinates.
    const pin = await page.evaluate(() => {
      const el = document.querySelector('.map-workspace .romap .map-pin') as SVGGElement | null;
      if (!el) throw new Error('map pin missing');
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), name: el.getAttribute('aria-label')};
    });
    await page.touchscreen.tap(pin.x, pin.y);
    await expect.poll(() => page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? ''), {timeout: 12_000}).toBe('place');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('#view=place');
  });

  test('harta revine la vedere completă cu butonul de reset după pinch', async ({page}) => {
    const {x, y} = await svgCenter(page);
    await touchPinch(page, x, y, 55, 125);
    await resetMap(page);
    await expect.poll(() => svgTransform(page)).toBe('translate(0 0) scale(1)');
  });
});

test.describe('Harta leaflet (PublicMap, locuri) — pan și pinch cu degetele rămân funcționale', () => {
  test.beforeEach(async ({page}) => {
    // Zero external fetches: OSM tiles are stubbed at the network layer, no-store so
    // every zoom level change produces fresh, observable tile requests.
    await page.route('**/tile.openstreetmap.org/**', route =>
      route.fulfill({contentType: 'image/png', body: TINY_PNG, headers: {'Cache-Control': 'no-store'}}));
  });

  test('drag cu degetul mută harta leaflet și pinch-ul mărește nivelul de zoom', async ({page}) => {
    const tileZs: number[] = [];
    page.on('request', request => {
      const m = request.url().match(/tile\.openstreetmap\.org\/(\d+)\/\d+\/\d+\.png/);
      if (m) tileZs.push(Number(m[1]));
    });
    await page.goto('/#view=domain&id=mediu');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
    await page.getByRole('button', {name: 'Harta paginii'}).click({timeout: 45_000});
    await expect(page.locator('.public-map .leaflet-map-pane')).toHaveCount(1, {timeout: 45_000});
    await page.evaluate(() => document.querySelector('.public-map')!.scrollIntoView({block: 'center',behavior:'instant'}));
    await page.waitForTimeout(1200);

    const center = () => page.evaluate(() => {
      const el = document.querySelector('.public-map')!;
      const r = el.getBoundingClientRect();
      return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};
    });
    const pane = () => page.evaluate(() => (document.querySelector('.public-map .leaflet-map-pane') as HTMLElement | null)?.style.transform ?? '');

    // Pan: the pane transform must follow the finger.
    const {x, y} = await center();
    const beforePane = await pane();
    await touchDrag(page, x, y, 90, 70);
    expect(await pane(), 'leaflet finger pan must move the pane').not.toBe(beforePane);

    // Pinch: a wider spread (ratio ≈ 3) must snap past the levels the init/fitBounds
    // round already requested, so fresh zoom levels land on the network.
    const maxBefore = Math.max(0, ...tileZs);
    tileZs.length = 0;
    const {x: px, y: py} = await center();
    await touchPinch(page, px, py, 55, 170);
    const maxAfter = Math.max(0, ...tileZs);
    expect(maxAfter, `pinch must raise the zoom level (${maxBefore} -> ${maxAfter})`).toBeGreaterThan(maxBefore);
  });
});
