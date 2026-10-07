import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await page.goto(base + '/#view=home', {waitUntil: 'domcontentloaded'});
await page.waitForSelector('main#vcontent', {timeout: 60000});
await page.waitForTimeout(2200);
const res = await page.evaluate(() => {
  const el = document.querySelector('.vpanel.mini-trend');
  const pr = el.getBoundingClientRect();
  const rows = [];
  for (const c of el.querySelectorAll(':scope > *')) {
    const r = c.getBoundingClientRect();
    rows.push({cls: (c.className || c.tagName).toString().slice(0, 30), top: Math.round(r.top - pr.top), bottom: Math.round(r.bottom - pr.top), h: Math.round(r.height)});
  }
  const scroll = el.querySelector('.table-scroll');
  const sr = scroll.getBoundingClientRect();
  const table = el.querySelector('table'); const tr2 = table.getBoundingClientRect();
  const lastTr = table.querySelector('tbody tr:last-child'); const lr = lastTr.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {panel: {w: Math.round(pr.width), h: Math.round(pr.height), display: cs.display, overflow: cs.overflow, padBottom: cs.paddingBottom}, children: rows, scroll: {top: Math.round(sr.top - pr.top), bottom: Math.round(sr.bottom - pr.top), overflow: getComputedStyle(scroll).overflow, maxH: getComputedStyle(scroll).maxHeight}, table: {top: Math.round(tr2.top - pr.top), bottom: Math.round(tr2.bottom - pr.top)}, lastRow: {bottom: Math.round(lr.bottom - pr.top), position: getComputedStyle(lastTr).position}};
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
