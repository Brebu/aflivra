import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})).newPage();
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
const pt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Pentru tine: localitate, interese și aspect"]'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
await page.mouse.click(pt.x, pt.y);
await page.waitForSelector('.preferences-sheet', {timeout: 10000});
const info = await page.evaluate(() => {
  const ov = document.querySelector('[data-slot=sheet-overlay]');
  const cc = document.querySelector('[data-slot=sheet-content]');
  const has = (el, cls) => el?.classList.contains(cls);
  const clsName = 'data-[state=closed]:pointer-events-none';
  // find any stylesheet rule mentioning pointer-events-none with a data-state selector
  let ruleText = '';
  for (const sheet of document.styleSheets) {
    try {for (const rule of sheet.cssRules) {
      const t = rule.cssText || '';
      if (t.includes('data-state="closed"]') && t.includes('pointer-events')) ruleText += t.slice(0, 160) + '\n';
    }} catch {}
  }
  return {ovHasClass: has(ov, clsName), ccHasClass: has(cc, clsName), ovClassList: [...(ov?.classList ?? [])].join(' ').slice(0, 300), ruleText};
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
