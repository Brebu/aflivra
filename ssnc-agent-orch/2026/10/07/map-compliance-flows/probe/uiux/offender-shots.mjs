// BEFORE/AFTER screenshots — top offenders of the padding+shadows pass (both viewports).
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/uiux/offender-shots.mjs before|after
//
// BEFORE = the pre-change rendering, reconstructed in-browser by re-injecting the exact
// literal values the fix replaced (snapshot-note padding 18px 0 / no elevation on the five
// card families / map-result mobile 9px 7px). AFTER = the live tree as edited.
// Crops are tight around each offender's bounding box (+8px bleed).
import {chromium} from '@playwright/test';

const phase = process.argv[2] ?? 'after';
const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;

const OLD_STATE = `
.v2 .city-story,.v2 .insight-story,.v2 .recommendation-card,.v2 .visit-card,.v2 .vcallout{box-shadow:none!important}
@media(max-width:640px){.v2 .snapshot-note{padding:15px 0 18px!important}.v2 .map-result{padding:9px 7px!important}}
@media(min-width:641px){.v2 .snapshot-note{padding:18px 0!important}}`;

const shots = [
  ['dashboard', '.snapshot-note', 'snapshot-note'],
  ['home', '.home-analytics .insight-story', 'insight-story'],
  ['home', '.home-analytics .recommendation-card', 'recommendation-card'],
  ['home', '.city-story', 'city-story'],
  ['place', '.visit-card', 'visit-card'],
  ['saved', '.vcallout', 'vcallout'],
  ['map', '.map-sidebar .map-result:nth-of-type(2)', 'map-result'],
];

const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844, isMobile: true, hasTouch: true}]]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.route('**://*/**', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  if (phase === 'before') await page.addInitScript(st => { const s = document.createElement('style'); s.textContent = st; s.dataset.reconstruct = 'before-fix'; document.currentScript.after(s); }, OLD_STATE);
  let injected = false;
  for (const [view, sel, name] of shots) {
    await page.goto(base + '/#view=' + (view === 'place' ? 'place&id=peles' : view), {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('main#vcontent', {timeout: 60_000});
    await page.waitForTimeout(2100);
    if (phase === 'before' && !injected) { await page.addStyleTag({content: OLD_STATE}); injected = true; await page.waitForTimeout(150); }
    const el = await page.$(sel);
    if (!el) { console.log('MISS', label, view, sel); continue; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const box = await el.boundingBox();
    await page.screenshot({path: `${outDir}pad-shadow-${name}-${phase}-${label}.png`, clip: {x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16}});
    console.log('shot', `${name}-${phase}-${label}`, Math.round(box.width) + 'x' + Math.round(box.height));
  }
  await context.close();
}
await browser.close();
