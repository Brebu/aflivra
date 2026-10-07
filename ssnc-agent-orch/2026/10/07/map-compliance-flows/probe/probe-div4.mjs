import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
const page = await context.newPage();
// replicate the matrix bring-up exactly: goto '/' first, then goto '#view=watch'
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'home', null, {timeout: 20000});
console.log('--- after first load (home) ---');
await page.waitForTimeout(300);
await dump();
await page.goto(base + '/#view=watch');
console.log('--- after goto(#view=watch) — immediate sequence ---');
for (const ms of [50, 150, 300, 600, 1200, 2500]) {
  await page.waitForTimeout(ms === 50 ? 50 : ms - 50 < 0 ? 0 : 0 || 0);
  await page.waitForTimeout(0);
}
// simpler: poll quickly
await dumpAll();
async function dump() {
  const r = await page.evaluate(() => {
    const nav = document.querySelector('.vbottom-nav');
    if (!nav) return {err: 'no nav'};
    const r0 = nav.querySelectorAll('button')[0].getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r0.left + r0.width / 2), Math.round(r0.top + r0.height / 2));
    return {hit: el?.tagName, cls: (el?.className || '').toString().slice(0, 60), inBtn: !!el?.closest?.('.vbottom-nav button')};
  });
  console.log(JSON.stringify(r));
}
async function dumpAll() {
  for (let t = 0; t < 2600; t += 150) {
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const nav = document.querySelector('.vbottom-nav');
      const r0 = nav.querySelectorAll('button')[0].getBoundingClientRect();
      const hitBtn0 = document.elementFromPoint(Math.round(r0.left + r0.width / 2), Math.round(r0.top + r0.height / 2));
      const divs = [...document.body.children].map(c => ({tag: c.tagName, cls: (c.className || '').toString().slice(0, 50), z: getComputedStyle(c).zIndex}));
      return {t: Math.round(performance.now()), view: document.getElementById('vcontent')?.getAttribute('data-view'), hit: hitBtn0?.tagName + (hitBtn0?.closest?.('.vbottom-nav button') ? '(in-btn)' : '(NOT)'), bodyChildren: divs, coverHtml: hitBtn0 && !hitBtn0.closest('.vbottom-nav button') ? hitBtn0.outerHTML.slice(0, 300).replace(/\s+/g, ' ') : null};
    });
    console.log(JSON.stringify(r).slice(0, 420));
  }
}
await browser.close();
