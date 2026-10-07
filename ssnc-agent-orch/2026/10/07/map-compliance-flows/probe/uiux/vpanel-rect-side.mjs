import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await page.goto(base + '/#view=home', {waitUntil: 'domcontentloaded'});
await page.waitForSelector('main#vcontent', {timeout: 60000});
await page.waitForTimeout(2000);
const res = await page.evaluate(() => {
  const el = document.querySelector('.vpanel.mini-trend');
  const rect = el.getBoundingClientRect();
  const visibleRect = (host, r) => {
    let l = r.left, t = r.top, rt = r.right, b = r.bottom, p = host.parentElement;
    while (p && p !== el) {
      const c = getComputedStyle(p);
      if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const pr = p.getBoundingClientRect(); l = Math.max(l, pr.left); t = Math.max(t, pr.top); rt = Math.min(rt, pr.right); b = Math.min(b, pr.bottom); }
      p = p.parentElement;
    }
    return rt > l && b > t ? {l, t, rt, b} : null;
  };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node; const out = [];
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    const range = new Range(); range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const v = visibleRect(node.parentElement, r);
      if (!v) continue;
      const sides = {left: v.l - rect.left, top: v.t - rect.top, right: rect.right - v.rt, bottom: rect.bottom - v.b};
      const inset = Math.min(...Object.values(sides));
      if (inset >= 0 && inset < 12) out.push({text: node.textContent.trim().slice(0, 20), side: Object.keys(sides).find(k => sides[k] === inset), sides: {left: Math.round(sides.left * 10) / 10, top: Math.round(sides.top * 10) / 10, right: Math.round(sides.right * 10) / 10, bottom: Math.round(sides.bottom * 10) / 10}});
    }
  }
  const table = el.querySelector('table'); const tr = table?.getBoundingClientRect();
  return {offenders: out.slice(0, 6), tableRect: tr ? {leftOfPanel: Math.round(tr.left - rect.left), topOfPanel: Math.round(tr.top - rect.top), width: Math.round(tr.width)} : null, panelRect: {left: rect.left, top: rect.top, w: rect.width, h: rect.height}};
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
