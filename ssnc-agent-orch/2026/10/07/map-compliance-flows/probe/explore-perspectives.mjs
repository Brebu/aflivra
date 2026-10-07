// BEFORE/AFTER probe — explore „Mai multe perspective" domain-grid images (perspective-cards task).
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/explore-perspectives.mjs before|after
//
// Measures the same surfaces the user report names: on #view=explore the 16 domain cards must
// render the SAME category editorial images the dashboard shows — one <img class="category-cover">
// per card, complete (naturalWidth>0), currentSrc resolving to a /media/ manifest asset, plus the
// grid card count, per-card img count and clickable surface (tap on the cover must navigate like
// the card's text). Screenshots: desktop 1280 + mobile 390, scoped to the grid.
// Zero external fetches: every non-dev-server route is aborted in the browser.
import {chromium} from '@playwright/test';

const phase = process.argv[2] ?? 'before';
const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;

const manifest = JSON.parse(await (await fetch(new URL('/media/category-illustrations.json', base))).text());

const browser = await chromium.launch();
const report = {phase, viewports: {}};

for (const [label, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844, isMobile: true, hasTouch: true}]]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.route('**://*/**', route => {
    if (route.request().url().startsWith(base)) return route.continue();
    return route.abort();
  });
  await page.goto(base + '/#view=explore', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main#vcontent[data-view="explore"]', {timeout: 60_000});
  const grid = page.locator('.section-head:has(h2:text-is("Mai multe perspective")) + .domain-grid');
  await grid.waitFor({state: 'visible', timeout: 60_000});
  const gridEl = await grid.elementHandle();
  await gridEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    const grid = Array.from(document.querySelectorAll('.section-head h2')).find(h => h.textContent?.trim() === 'Mai multe perspective')?.closest('.section-head')?.nextElementSibling;
    const cards = grid ? Array.from(grid.querySelectorAll(':scope > button.domain-card')) : [];
    return {
      cardCount: cards.length,
      cardsWithImg: cards.filter(c => c.querySelector('img')).length,
      coverCount: cards.filter(c => c.querySelector('img.category-cover')).length,
      completeCovers: cards.filter(c => {const i = c.querySelector('img.category-cover'); return i && i.complete && i.naturalWidth > 0}).length,
      currentSrcSample: cards.slice(0, 3).map(c => c.querySelector('img')?.currentSrc ?? null),
      cardSize: cards.length ? {w: Math.round(cards[0].offsetWidth), h: Math.round(cards[0].offsetHeight)} : null,
      cardComputedStyle: cards.length ? {padding: getComputedStyle(cards[0]).padding, radius: getComputedStyle(cards[0]).borderRadius} : null,
      firstCardHTML: cards.length ? cards[0].innerHTML.slice(0, 400) : null
    };
  });
  await page.waitForTimeout(1200);
  await page.screenshot({path: `${outDir}explore-perspectives-${phase}-${label}.png`, fullPage: false});
  report.viewports[label] = data;
  await context.close();
}

// Cover-tap navigation equivalence (desktop): pointer on the image itself must navigate to the
// same route as tapping the card text.
{
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await context.newPage();
  await page.route('**://*/**', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(base + '/#view=explore', {waitUntil: 'domcontentloaded'});
  const grid = page.locator('.section-head:has(h2:text-is("Mai multe perspective")) + .domain-grid');
  await grid.waitFor({state: 'visible', timeout: 60_000});
  const hashBefore = await page.evaluate(() => location.hash);
  const img = grid.locator('button.domain-card').first().locator('img').first();
  if (await img.count()) {
    await img.scrollIntoViewIfNeeded();
    await img.click({timeout: 20_000});
    await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') !== 'explore', null, {timeout: 20_000}).catch(() => {});
    report.coverTap = {hashBefore, navigated: await page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? 'explore')};
  } else {
    report.coverTap = {hashBefore, navigated: 'no img to tap (text-only cards)'};
  }
  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
const illustrationIds = new Set(manifest.map(m => m.id));
console.log('illustration ids on the manifest (' + illustrationIds.size + '):', [...illustrationIds].join(','));
