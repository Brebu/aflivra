import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await page.goto(base + '/#view=home', {waitUntil: 'domcontentloaded'});
await page.waitForSelector('main#vcontent', {timeout: 60000});
await page.waitForTimeout(2200);
const res = await page.evaluate(() => {
  const panel = document.querySelector('.vpanel.mini-trend');
  const pr = panel.getBoundingClientRect();
  const scroll = panel.querySelector('.table-scroll');
  const fmt = el => { const c = getComputedStyle(el); return {tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 26), position: c.position, height: c.height, maxH: c.maxHeight, overflow: c.overflow, display: c.display, open: el.tagName === 'DETAILS' ? el.open : undefined, clip: c.clipPath}; };
  const chain = [];
  let p = scroll;
  while (p && p !== panel) { chain.unshift(fmt(p)); p = p.parentElement; }
  const mid = {x: pr.left + pr.width / 2, y: pr.bottom + 40};
  const top = document.elementFromPoint(mid.x, mid.y);
  return {chain, whoIsTopBelowPanel: top ? (top.tagName + '.' + (top.className || '').toString().slice(0, 40)) : null,
    scrollRectInViewport: {bottom: Math.round(scroll.getBoundingClientRect().bottom), viewportH: innerHeight, scrolledPast: scroll.getBoundingClientRect().bottom > innerHeight},
    probePoint: mid};
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
