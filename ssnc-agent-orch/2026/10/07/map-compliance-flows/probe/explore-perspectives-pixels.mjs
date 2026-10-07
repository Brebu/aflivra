// Pixel-level AFTER evidence for the explore perspectives covers (image-free verification for
// agents that cannot see PNGs): draws each rendered cover into a same-origin canvas and reports
// per-cover pixel variance plus the dominant cover-frame color. A blank/missing image yields
// near-zero variance; the editorial illustrations are navy/porcelain sculptural art.
import {chromium} from '@playwright/test';

const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch();

for (const [label, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844, isMobile: true, hasTouch: true}]]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.route('**://*/**', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(base + '/#view=explore', {waitUntil: 'domcontentloaded'});
  const grid = page.locator('.section-head:has(h2:text-is("Mai multe perspective")) + .domain-grid');
  await grid.waitFor({state: 'visible', timeout: 60_000});
  const cards = grid.locator('button.domain-card');
  const n = await cards.count();
  for (let i = 0; i < n; i++) await cards.nth(i).scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  const variance = await page.evaluate(() => {
    const out = [];
    for (const c of document.querySelectorAll('.section-head h2')) {
      if (c.textContent?.trim() !== 'Mai multe perspective') continue;
      const gridEl = c.closest('.section-head')?.nextElementSibling;
      for (const card of gridEl?.querySelectorAll(':scope > button.domain-card') ?? []) {
        const img = card.querySelector('img.category-cover');
        if (!img) {out.push(null); continue}
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 24;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, 40, 24);
        const d = ctx.getImageData(0, 0, 40, 24).data;
        let sum = 0, sumSq = 0, n2 = 0, r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) {sum += d[i]; sumSq += d[i] * d[i]; n2++; r += d[i]; g += d[i + 1]; b += d[i + 2]}
        const mean = sum / n2;
        const std = Math.sqrt(sumSq / n2 - mean * mean);
        out.push({std: Math.round(std * 100) / 100, avgRgb: [Math.round(r / n2), Math.round(g / n2), Math.round(b / n2)]});
      }
    }
    return out;
  });
  console.log(label, 'covers:', variance.length, '| min pixel std:', Math.min(...variance.map(v => v?.std ?? -1)), '| all ≥ 8 (real art, not flat blocks):', variance.every(v => (v?.std ?? 0) >= 8));
  console.log('  first three:', JSON.stringify(variance.slice(0, 3)));
  const gridEl = await grid.elementHandle();
  await gridEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${outDir}explore-perspectives-after-${label}.png`, fullPage: false});
  await context.close();
}
await browser.close();
