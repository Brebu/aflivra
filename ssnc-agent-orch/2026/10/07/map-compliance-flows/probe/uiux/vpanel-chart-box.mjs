import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await page.goto(base + '/#view=home', {waitUntil: 'domcontentloaded'});
await page.waitForSelector('main#vcontent', {timeout: 60000});
await page.waitForTimeout(2000);
const res = await page.evaluate(() => {
  const panel = document.querySelector('.vpanel.mini-trend');
  const scroll = panel?.querySelector('.table-scroll');
  const chart = panel?.querySelector('.data-chart');
  const table = panel?.querySelector('table');
  if (!panel || !table) return {found: false};
  const pr = panel.getBoundingClientRect(), sr = scroll.getBoundingClientRect(), cr = chart.getBoundingClientRect(), tr = table.getBoundingClientRect();
  return {
    panel: {l: pr.left, w: pr.width, padding: getComputedStyle(panel).padding},
    chart: {left: cr.left - pr.left, width: cr.width},
    scroll: {left: sr.left - pr.left, width: sr.width, overflow: getComputedStyle(scroll).overflow},
    table: {left: tr.left - pr.left, right: pr.right - tr.right, width: tr.width},
  };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
