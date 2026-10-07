import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
const page = await context.newPage();
await page.goto(base + '/#view=place&id=peles');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'place', null, {timeout: 20000});
const info = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Deschide galeria'));
  if (!b) return {err: 'button missing'};
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return {rect: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}, point: {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)}, hit: el?.tagName + '.' + (el?.className || '').toString().slice(0, 40), hitIsBtn: !!el?.closest?.('button')};
});
console.log('gallery btn:', JSON.stringify(info));
if (!info.err) {
  await page.mouse.click(info.point.x, info.point.y);
  await page.waitForTimeout(1200);
  console.log('after coord click, photo-dialog present:', await page.evaluate(() => !!document.querySelector('.photo-dialog')));
  if (!await page.evaluate(() => !!document.querySelector('.photo-dialog'))) {
    // try a trusted locator click
    await page.getByRole('button', {name: /Deschide galeria/}).first().click();
    await page.waitForTimeout(1200);
    console.log('after locator click, photo-dialog present:', await page.evaluate(() => !!document.querySelector('.photo-dialog')));
  }
}
await browser.close();
