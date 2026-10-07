// Debugger probe — pin overlap cluster on #view=map (ux-friction raised issue #1).
// Legs: A desktop pin inventory + duplicate labels + Bigăr/Ateneul twins
//       B desktop Peleș/Sinaia cluster: elementFromPoint intercept proof + raw mouse clicks
//         at both pin centers (nearest-pin-to-point should hold for BOTH)
//       C mobile (390×844 touch) tap at the covered Peleș pin center
//       D sticky header band: scrollIntoViewIfNeeded lands pin under .vheader?
// Local dev server only — no external fetches.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'ssnc-agent-orch/2026/10/07/ux-friction/probes';
mkdirSync(OUT, { recursive: true });
const STAGE = process.argv[2] || 'before';
const BASE = 'http://127.0.0.1:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PELES = 'Selectează Castelul Peleș';
const SINAIA = 'Selectează Mănăstirea Sinaia';

async function clientReady(page) {
  for (let n = 0; n < 60; n++) {
    if (await page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false)) return true;
    await sleep(500);
  }
  return false;
}

async function openMap(browser, { mobile = false } = {}) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ro-RO' }
    : { viewport: { width: 1280, height: 900 }, locale: 'ro-RO' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/#view=map', { waitUntil: 'domcontentloaded' });
  const ready = await clientReady(page);
  if (ready) await page.locator('.map-workspace .romap g.map-pin').first().waitFor({ timeout: 20_000 }).catch(() => {});
  return { ctx, page, errs, ready, mobile };
}

// --- Leg A: inventory + duplicates (desktop) ---
async function legA(browser) {
  const { ctx, page, errs, ready } = await openMap(browser);
  if (!ready) { await ctx.close(); return { tag: 'A-inventory', error: 'client never ready' }; }
  const inv = await page.evaluate(() => {
    const pins = [...document.querySelectorAll('.map-workspace .romap g.map-pin')];
    const labels = pins.map(g => g.getAttribute('aria-label'));
    const counts = {};
    for (const l of labels) counts[l] = (counts[l] || 0) + 1;
    const dups = Object.entries(counts).filter(([, n]) => n > 1).map(([l, n]) => ({ label: l, pins: n }));
    const sidebar = document.querySelectorAll('.map-workspace .map-sidebar .map-result').length;
    const pinsOf = label => pins.filter(g => g.getAttribute('aria-label') === label)
      .map(g => ({ transform: g.getAttribute('transform') }));
    return {
      pinCount: pins.length,
      duplicateLabels: dups,
      sidebarRows: sidebar,
      ateneul: pinsOf('Selectează Ateneul Român'),
      peles: pinsOf('Selectează Castelul Peleș'),
      sinaia: pinsOf('Selectează Mănăstirea Sinaia'),
      cascadaBigar: pinsOf('Selectează Cascada Bigăr'),
      izbuculBigar: pinsOf('Selectează Izbucul Bigăr'),
      salinaPraid: pinsOf('Selectează Salina Praid'),
      podulTraian: pinsOf('Selectează Podul lui Traian'),
    };
  });
  await ctx.close();
  return { tag: 'A-inventory', ready, pageErrors: errs, ...inv };
}

// --- Leg B: cluster intercept proof + raw clicks at TRUE pin centres (desktop) ---
async function legB(browser) {
  const { ctx, page, errs, ready } = await openMap(browser);
  if (!ready) { await ctx.close(); return { tag: 'B-desktop-cluster', error: 'client never ready' }; }
  const peles = page.locator(`.map-workspace .romap g.map-pin[aria-label="${PELES}"]`).first();
  await peles.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 160));
  await sleep(250);

  // True circle centres via each pin's transform + the svg CTM (the g bbox is inflated
  // by the selected pin's label). elementFromPoint still reports the paint-order
  // interception; the raw clicks show what the app actually selects.
  const centers = await page.evaluate(([a, b]) => {
    const svg = document.querySelector('.map-workspace .romap svg');
    const ctm = svg && svg.getScreenCTM();
    if (!svg || !ctm) throw new Error('svg or CTM missing');
    const of = label => {
      const g = svg.querySelector(`g.map-pin[aria-label="${label}"]`);
      const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
      const c = new DOMPoint(tx, ty).matrixTransform(ctm);
      const top = document.elementFromPoint(c.x, c.y);
      return {
        transform: g.getAttribute('transform'),
        center: [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10],
        topAtCenter: top ? `${top.tagName} r=${top.getAttribute('r')} in g[${(top.closest('g[aria-label]') || g).getAttribute('aria-label')}]` : null,
      };
    };
    return { peles: of(a), sinaia: of(b) };
  }, [PELES, SINAIA]);

  const dUnits = (() => {
    const pa = centers.peles.transform.match(/[-\d.]+/g).map(Number);
    const pb = centers.sinaia.transform.match(/[-\d.]+/g).map(Number);
    return Math.round(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * 100) / 100;
  })();

  // Raw click at Peleș centre — the resolver must pick the pin nearest to the point.
  await page.mouse.click(centers.peles.center[0], centers.peles.center[1]);
  await sleep(900);
  const afterPeles = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view') }));

  // Back to map, raw click at Sinaia centre — the top-painted pin must keep working.
  await page.evaluate(() => { location.hash = '#view=map'; });
  await sleep(600);
  await peles.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 160));
  await sleep(250);
  await page.mouse.click(centers.sinaia.center[0], centers.sinaia.center[1]);
  await sleep(900);
  const afterSinaia = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view') }));

  await ctx.close();
  return {
    tag: 'B-desktop-cluster', ready, pageErrors: errs,
    pelesPin: centers.peles, sinaiaPin: centers.sinaia, centerDistanceSvgUnits: dUnits,
    clickAtPelesCenter: afterPeles,
    clickAtSinaiaCenter: afterSinaia,
  };
}

// --- Leg C: mobile touch tap at the Peleș pin centre ---
async function legC(browser) {
  const { ctx, page, errs, ready } = await openMap(browser, { mobile: true });
  if (!ready) { await ctx.close(); return { tag: 'C-mobile-tap', error: 'client never ready' }; }
  const peles = page.locator(`.map-workspace .romap g.map-pin[aria-label="${PELES}"]`).first();
  await peles.scrollIntoViewIfNeeded();
  await sleep(250);
  const center = await peles.evaluate(g => {
    const svg = g.ownerSVGElement;
    const ctm = svg && svg.getScreenCTM();
    if (!ctm) throw new Error('CTM missing');
    const [tx, ty] = ((g.getAttribute('transform') || '').match(/[-\d.]+/g) || []).map(Number);
    const c = new DOMPoint(tx, ty).matrixTransform(ctm);
    return [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10];
  });
  const before = await page.evaluate(() => location.hash);
  await page.touchscreen.tap(center[0], center[1]);
  await sleep(1100);
  const after = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view') }));
  await page.screenshot({ path: `${OUT}/pin-overlap-${STAGE}-mobile-tap.png` });
  await ctx.close();
  return { tag: 'C-mobile-tap', ready, pageErrors: errs, tapAtPelesCenter: center, hashBefore: before, hashAfterTap: after };
}

// --- Leg D: sticky header band over a scrollIntoViewIfNeeded-landed pin ---
async function legD(browser) {
  const { ctx, page, errs, ready } = await openMap(browser);
  if (!ready) { await ctx.close(); return { tag: 'D-header-band', error: 'client never ready' }; }
  const pin = page.locator('.map-workspace .romap g.map-pin[aria-label="Selectează Biserica Rotondă din Geoagiu"]').first();
  const header = page.locator('header').first();
  await pin.scrollIntoViewIfNeeded();
  await sleep(300);
  const probe = await pin.evaluate((g, headerEl) => {
    const r = g.getBoundingClientRect(), h = headerEl.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const css = getComputedStyle(headerEl);
    return {
      pinCenterY: Math.round(cy),
      headerRect: { top: Math.round(h.top), bottom: Math.round(h.bottom), height: h.height },
      pinUnderHeader: r.top < h.bottom,
      pinTop: Math.round(r.top),
      topAtPinCenter: top ? `${top.tagName}.${top.className || ''} [snd=${(top.closest('.vheader') ? 'vheader' : (top.closest('g[aria-label]')?.getAttribute('aria-label') || 'other'))}]` : null,
      headerBackground: css.backgroundColor, headerBackdropFilter: css.backdropFilter, headerPosition: css.position, headerZ: css.zIndex,
      scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
    };
  }, await header.elementHandle());
  // If the pin landed under the header, a raw click there must NOT navigate today.
  const bb = await pin.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await sleep(900);
  const after = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view') }));
  await ctx.close();
  return { tag: 'D-header-band', ready, pageErrors: errs, ...probe, clickAtLandedPinCenter: after };
}

const browser = await chromium.launch({ headless: true });
const results = [];
results.push(await legA(browser));
results.push(await legB(browser));
results.push(await legC(browser));
results.push(await legD(browser));
await browser.close();
writeFileSync(`${OUT}/probe-pin-overlap-${STAGE}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
