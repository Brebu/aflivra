// UI/UX touch-gesture probe v3. Fixes over v2:
//  - coordinates re-measured fresh before EVERY leg (no stale-scroll artifacts);
//  - per-leg event snapshots (target tags, cancel counts) taken immediately;
//  - mouse-drag control leg before touch legs (separates handler vs touch interception);
//  - surface B state dump when leaflet does not mount.
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';

const OUT = new URL('.', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const report = { startedAt: new Date().toISOString(), surfaces: [] };

async function newMobilePage(browser) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') pageErrors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  const tileZs = [];
  await page.route('**/tile.openstreetmap.org/**', route => {
    const m = route.request().url().match(/\/(\d+)\/\d+\/\d+\.png/);
    if (m) tileZs.push(Number(m[1]));
    return route.fulfill({contentType: 'image/png', body: PNG_1x1});
  });
  return {context, page, tileZs, pageErrors};
}
const svgCenter = page => page.evaluate(() => {
  const el = document.querySelector('.romap svg');
  const r = el.getBoundingClientRect();
  return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: Math.round(r.top), inViewport: r.top >= 0 && r.bottom <= innerHeight};
});
const mapCenter = page => page.evaluate(() => {
  const el = document.querySelector('.public-map'); // leaflet attaches its classes TO this div
  const r = el.getBoundingClientRect();
  return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), inViewport: r.top >= 0 && r.bottom <= innerHeight};
});
async function installMonitor(page) {
  await page.evaluate(() => {
    const w = window; w.__t = {ev: [], scroll: []};
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
      window.addEventListener(type, e => w.__t.ev.push({type, pt: e.pointerType, tag: e.target instanceof Element ? e.target.tagName : '', x: Math.round(e.clientX), y: Math.round(e.clientY)}), {capture: true, passive: true});
    window.addEventListener('scroll', () => w.__t.scroll.push(Math.round(scrollY)), {capture: true, passive: true});
  });
}
const readMon = page => page.evaluate(() => (window).__t);
const resetMon = page => page.evaluate(() => { (window).__t = {ev: [], scroll: []}; });
async function cdpDrag(cdp, x, y, dx, dy, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + (dx * i) / steps, y: y + (dy * i) / steps}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await sleep(300);
}
async function cdpPinch(cdp, cx, cy, halfStart, halfEnd, steps = 10) {
  const pts = half => [{x: cx - half, y: cy}, {x: cx + half, y: cy}];
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: pts(halfStart)});
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: pts(halfStart + (halfEnd - halfStart) * i / steps)});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await sleep(400);
}

async function surfaceA(browser) {
  const {context, page, pageErrors} = await newMobilePage(browser);
  const cdp = await context.newCDPSession(page);
  const out = {surface: 'A: #view=map — RomaniaMap (SVG, Natural Earth)', pageErrors};
  const transform = () => page.evaluate(() => document.querySelector('.romap svg > g').getAttribute('transform'));
  try {
    await page.goto(BASE + '/#view=map');
    await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});
    await page.waitForFunction(() => document.querySelector('.romap svg > g')?.getAttribute('transform'), null, {timeout: 15_000});
    await sleep(600);
    await page.evaluate(() => document.querySelector('.romap').scrollIntoView({block: 'center',behavior:'instant'}));
    await sleep(400);
    out.static = await page.evaluate(() => ({
      touchAction: getComputedStyle(document.querySelector('.romap svg')).touchAction,
      hasTouchZoomHandler: false, // no pinch handler exists in RomaniaMap (verified in source)
      romapTouchAction: getComputedStyle(document.querySelector('.romap')).touchAction,
    }));
    await installMonitor(page);

    // leg 0 (control): MOUSE drag — proves the React pan handler itself works.
    const c0 = await svgCenter(page); await resetMon(page);
    const t0 = await transform();
    await page.mouse.move(c0.x, c0.y); await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(c0.x + (96 * i) / 12, c0.y + (72 * i) / 12);
    await page.mouse.up();
    let mon = await readMon(page);
    out.mouseControl = {transformBefore: t0, transformAfter: await transform(), panRegistered: (await transform()) !== t0, pointerMoves: mon.ev.filter(e => e.pt === 'mouse' && e.type === 'pointermove').length, targetTags: [...new Set(mon.ev.filter(e => e.type === 'pointerdown').map(e => e.tag))]};
    await page.evaluate(() => document.querySelector('.romap button[aria-label="Resetează harta"]').click()); // reset zoom/pan
    await sleep(150);

    // leg 1: touch drag, diagonal (horizontal-dominant) — fresh coords.
    const c1 = await svgCenter(page); await resetMon(page);
    const t1 = await transform();
    await cdpDrag(cdp, c1.x, c1.y, 110, 85);
    mon = await readMon(page);
    const t1b = await transform();
    out.touchDragDiagonal = {coords: c1, transformBefore: t1, transformAfter: t1b, panRegistered: t1b !== t1, touchMovesDisp: 12, pointerMovesDelivered: mon.ev.filter(e => e.pt === 'touch' && e.type === 'pointermove').length, pointerCancel: mon.ev.filter(e => e.type === 'pointercancel').length, targetTags: [...new Set(mon.ev.filter(e => e.type === 'pointerdown').map(e => e.tag))], scrollEvents: mon.scroll.length};
    await page.evaluate(() => document.querySelector('.romap button[aria-label="Resetează harta"]').click()); await sleep(150);

    // leg 2: touch drag, vertical-dominant (the scroll-chuck direction under pan-y).
    const c2 = await svgCenter(page); await resetMon(page);
    const t2 = await transform();
    await cdpDrag(cdp, c2.x, c2.y, 8, 150);
    mon = await readMon(page);
    const t2b = await transform();
    out.touchDragVertical = {transformBefore: t2, transformAfter: t2b, panRegistered: t2b !== t2, pointerMovesDelivered: mon.ev.filter(e => e.pt === 'touch' && e.type === 'pointermove').length, pointerCancel: mon.ev.filter(e => e.type === 'pointercancel').length, scrollEvents: mon.scroll.length};
    await page.evaluate(() => document.querySelector('.romap button[aria-label="Resetează harta"]').click()); await sleep(150);

    // leg 3: two-finger pinch out — fresh coords.
    const c3 = await svgCenter(page); await resetMon(page);
    const t3 = await transform();
    await cdpPinch(cdp, c3.x, c3.y, 55, 125);
    mon = await readMon(page);
    const t3b = await transform();
    const scale = t => parseFloat((t.match(/scale\(([\d.]+)\)/) || [0, '1'])[1]);
    out.touchPinch = {transformBefore: t3, transformAfter: t3b, zoomBefore: scale(t3), zoomAfter: scale(t3b), zoomRegistered: scale(t3b) !== scale(t3), pointerCancel: mon.ev.filter(e => e.type === 'pointercancel').length, movesDelivered: mon.ev.filter(e => e.pt === 'touch' && e.type === 'pointermove').length};
    out.centerHitFresh = await page.evaluate(({x, y}) => { const el = document.elementFromPoint(x, y); const chain = []; let n = el; while (n && chain.length < 5) { chain.push(n.tagName); n = n.parentElement; } return {chain: chain.join('>'), text: (el?.textContent ?? '').slice(0, 40)}; }, await svgCenter(page));
  } catch (e) { out.error = String(e).slice(0, 400); }
  await context.close();
  return out;
}

async function surfaceB(browser) {
  const {context, page, tileZs, pageErrors} = await newMobilePage(browser);
  const cdp = await context.newCDPSession(page);
  const out = {surface: 'B: #view=domain&id=mediu — leaflet PublicMap (OSM stubbed)', pageErrors, tileZs};
  const pane = () => page.evaluate(() => document.querySelector('.leaflet-map-pane')?.style.transform ?? null);
  try {
    await page.goto(BASE + '/#view=domain&id=mediu');
    await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});
    await page.getByRole('button', {name: 'Harta paginii'}).click({timeout: 45_000});
    try {
      await page.waitForSelector('.public-map .leaflet-map-pane', {timeout: 45_000, state: 'attached'});
    } catch {
      out.mountFailDump = await page.evaluate(() => ({
        publicMapCount: document.querySelectorAll('.public-map').length,
        publicMapClasses: document.querySelector('.public-map')?.className ?? null,
        mapWrapCount: document.querySelectorAll('.public-map-wrap').length,
        chips: [...document.querySelectorAll('.places-workspace .chip-row button')].map(b => ({t: b.textContent.trim(), pressed: b.getAttribute('aria-pressed')})),
        liveStatuses: [...document.querySelectorAll('.places-workspace p[role=status]')].map(x => x.textContent.trim().slice(0, 60)),
        url: location.hash,
      }));
      throw new Error('leaflet pane never attached (dump above)');
    }
    await page.waitForFunction(() => document.querySelector('.leaflet-map-pane')?.style?.transform, null, {timeout: 30_000});
    await page.evaluate(() => document.querySelector('.public-map').scrollIntoView({block: 'center',behavior:'instant'}));
    await sleep(1500);
    out.static = await page.evaluate(() => {
      const el = document.querySelector('.public-map'); // this div IS the leaflet container
      return {touchAction: getComputedStyle(el).touchAction, classes: el.className, tilePaneChild: !!el.querySelector('.leaflet-tile-pane')};
    });
    await installMonitor(page);

    const c1 = await mapCenter(page); await resetMon(page);
    const t1 = await pane();
    await cdpDrag(cdp, c1.x, c1.y, 100, 80);
    let mon = await readMon(page);
    const t1b = await pane();
    out.touchDrag = {coords: c1, paneBefore: t1, paneAfter: t1b, panRegistered: t1b !== t1, pointerMovesDelivered: mon.ev.filter(e => e.pt === 'touch' && e.type === 'pointermove').length, pointerCancel: mon.ev.filter(e => e.type === 'pointercancel').length, targetTags: [...new Set(mon.ev.filter(e => e.type === 'pointerdown').map(e => e.tag))], scrollEvents: mon.scroll.length, tileZsSoFar: [...new Set(tileZs)]};

    const c2 = await mapCenter(page); await resetMon(page); tileZs.length = 0;
    const t2 = await pane();
    await cdpPinch(cdp, c2.x, c2.y, 55, 125);
    mon = await readMon(page);
    const t2b = await pane();
    out.touchPinch = {paneBefore: t2, paneAfter: t2b, changed: t2b !== t2, pointerCancel: mon.ev.filter(e => e.type === 'pointercancel').length, tileZsDuringPinch: [...new Set(tileZs)], maxZ: tileZs.length ? Math.max(...tileZs) : null, zoomRegistered: tileZs.length ? Math.max(...tileZs) > 6 : false};
    out.centerHitFresh = await page.evaluate(({x, y}) => { const el = document.elementFromPoint(x, y); const chain = []; let n = el; while (n && chain.length < 5) { chain.push(n.tagName + '.' + String(n.className?.baseVal ?? n.className ?? '').split(' ')[0]); n = n.parentElement; } return {chain: chain.join(' > ')}; }, await mapCenter(page));
  } catch (e) { out.error = String(e).slice(0, 400); }
  await context.close();
  return out;
}

const browser = await chromium.launch();
try {
  report.surfaces.push(await surfaceA(browser));
  report.surfaces.push(await surfaceB(browser));
} finally { await browser.close(); }
report.finishedAt = new Date().toISOString();
writeFileSync(OUT + 'touch-gesture-report-v3.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
