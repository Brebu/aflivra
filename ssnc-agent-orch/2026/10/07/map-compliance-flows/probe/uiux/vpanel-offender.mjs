import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
for (const [view, sel] of [['home', '.vpanel.mini-trend'], ['company', '.vpanel']]) {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + '/#view=' + view, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main#vcontent', {timeout: 60000});
  await page.waitForTimeout(2000);
  const res = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    const rect = el.getBoundingClientRect();
    const bad = [];
    const climb = n => { let p = n.parentElement, chain = []; while (p && p !== el) { chain.push(p.className || p.tagName); p = p.parentElement; } return chain.join(' < '); };
    const clipped = (host, r) => { let p = host.parentElement; while (p && p !== el) { const c = getComputedStyle(p); if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const pr = p.getBoundingClientRect(); if (r.left >= pr.right || r.right <= pr.left || r.top >= pr.bottom || r.bottom <= pr.top) return true; } p = p.parentElement; } return false; };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        const inset = Math.min(r.left - rect.left, r.top - rect.top, rect.right - r.right, rect.bottom - r.bottom);
        if (inset >= 0 && inset < 12 && !clipped(node.parentElement, r)) bad.push({text: node.textContent.trim().slice(0, 30), host: node.parentElement.className || node.parentElement.tagName, inset: Math.round(inset * 10) / 10, chain: climb(node).slice(0, 90)});
      }
    }
    return bad.slice(0, 5);
  }, sel);
  console.log(view, JSON.stringify(res, null, 1));
  await page.close();
}
await browser.close();
