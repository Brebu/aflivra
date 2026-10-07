import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 390, height: 844, isMobile: true, hasTouch: true}, deviceScaleFactor: 2});
await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await page.goto(base + '/#view=map', {waitUntil: 'domcontentloaded'});
await page.waitForSelector('main#vcontent', {timeout: 60000});
await page.waitForTimeout(2200);
const res = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.map-result')) {
    const pr = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node; let worst = Infinity, side = null, txt = '';
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = new Range(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        const s = {left: r.left - pr.left, top: r.top - pr.top, right: pr.right - r.right, bottom: pr.bottom - r.bottom};
        const m = Math.min(...Object.values(s));
        if (m < worst) { worst = m; side = Object.keys(s).find(k => s[k] === m); txt = node.textContent.trim().slice(0, 24); }
      }
    }
    if (worst < 12) out.push({name: el.querySelector('strong')?.textContent?.slice(0, 22), worst: Math.round(worst * 10) / 10, side, txt, h: Math.round(pr.height)});
  }
  return out.slice(0, 4);
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
