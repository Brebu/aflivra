// Debugger probe — map marker click → go('place') navigation (ux-friction report #2).
// Legs: A local desktop map-view pin click · B local mobile-touch map-view pin click
//       C local home-view pin click (working-pattern control) · LIVE one polite session.
// Target pin: "Biserica Rotondă din Geoagiu" — nearest neighbouring pin is 12.7 svg
// units away (> pin radius 11), so its center is a deterministic, unobstructed hit.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'ssnc-agent-orch/2026/10/07/ux-friction/probes';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOCAL = 'http://127.0.0.1:5173';
const LIVE = 'https://aflivra.brebu.workers.dev';
const TARGET = 'Selectează Biserica Rotondă din Geoagiu';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function clientReady(page) {
  for (let n = 0; n < 60; n++) {
    if (await page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false)) return true;
    await sleep(500);
  }
  return false;
}

async function leg(browser, { tag, base, hash, mobile = false, control = false }) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ro-RO' }
    : { viewport: { width: 1280, height: 900 }, locale: 'ro-RO' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(() => {
    window.__evts = [];
    window.addEventListener('hashchange', () => window.__evts.push(['hashchange', location.hash]));
  });
  await page.goto(base + '/' + hash, { waitUntil: 'domcontentloaded' });
  const ready = await clientReady(page);
  if (!ready) { await ctx.close(); return { tag, error: 'client never ready (localStorage preferences key not written)' }; }

  const mapRoot = page.locator(control ? '.discovery-split .romap' : '.map-workspace .romap').first();
  if (control) await mapRoot.scrollIntoViewIfNeeded();

  // Non-invasive: what element sits on top at the Bucharest cluster (Ateneul Român)?
  const ateneul = mapRoot.locator('g.map-pin[aria-label="Selectează Ateneul Român"]');
  const ateneulBoxes = await ateneul.evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return { box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, point: [Math.round(cx), Math.round(cy)], topElement: top ? `${top.tagName}.${top.getAttribute('class') || ''} in [${(top.closest('g[aria-label]') || el).getAttribute('aria-label')}]` : null };
  })).catch(e => [{ error: String(e).slice(0, 120) }]);

  const pin = mapRoot.locator(`g.map-pin[aria-label="${TARGET}"]`).first();
  const pinCount = await pin.count();
  if (!pinCount) { const shot = await page.screenshot(); writeFileSync(`${OUT}/${tag}-no-pin.png`, shot); await ctx.close(); return { tag, error: `pin "${TARGET}" not found`, ready, errs }; }

  const before = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view'), evts: [...window.__evts] }));
  const pinClassBefore = await pin.getAttribute('class');

  // Position the map clear of the sticky header, then click the pin's own circle center.
  await pin.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 260));
  await sleep(300);
  await pin.locator('circle').first().click({ timeout: 15_000 });
  await sleep(1200);

  const after = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view'), evts: [...window.__evts] }));
  const pinClassAfter = await pin.getAttribute('class').catch(() => null);
  await page.screenshot({ path: `${OUT}/${tag}-after-click.png` });

  const result = {
    tag, ready, target: TARGET, ateneulStackProbe: ateneulBoxes,
    pinClassBefore, pinClassAfter,
    hashBefore: before.hash, hashAfter: after.hash,
    viewBefore: before.view, viewAfter: after.view,
    hashchangeEventsAfterClick: after.evts.filter(e => e[0] === 'hashchange' && e[1] !== before.hash),
    navigatedToPlace: /#view=place&id=/.test(after.hash) && after.view === 'place',
    pageErrors: errs,
  };
  await ctx.close();
  return result;
}

const browser = await chromium.launch({ headless: true });
const results = [];
results.push(await leg(browser, { tag: 'A-local-desktop-mapview', base: LOCAL, hash: '#view=map' }));
results.push(await leg(browser, { tag: 'B-local-mobile-touch-mapview', base: LOCAL, hash: '#view=map', mobile: true }));
results.push(await leg(browser, { tag: 'C-local-desktop-home-control', base: LOCAL, hash: '#view=home', control: true }));
// One polite live session — the user's reported surface (mobile iPhone Safari).
results.push(await leg(browser, { tag: 'LIVE-mobile-mapview', base: LIVE, hash: '#view=map', mobile: true }));
await browser.close();
writeFileSync(`${OUT}/probe-map-marker.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
