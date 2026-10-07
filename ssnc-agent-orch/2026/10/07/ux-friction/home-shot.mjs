import { chromium } from '@playwright/test';
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(base + '/#view=home', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const s = await page.evaluate(() => ({
  fonts: [...document.fonts].map(f => f.family + ':' + f.status),
  body: getComputedStyle(document.body).fontFamily.slice(0, 70),
  check: document.fonts.check('16px "Inter Aflivra"'),
  fontFetches: performance.getEntriesByType('resource').filter(e => e.name.includes('InterVariable')).length,
}));
await page.screenshot({ path: out });
console.log(JSON.stringify(s));
await browser.close();
