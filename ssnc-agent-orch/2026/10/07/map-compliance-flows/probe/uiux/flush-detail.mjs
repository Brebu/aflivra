// Detail probe — for the flagged surfaces, identifies WHICH child places text at/near the
// card border (class, margin, the inset it achieves). Diagnostic for the padding+shadows fix.
import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();

const targets = [
  ['home', '.snapshot-note'],
  ['home', '.vpanel.mini-trend'],
  ['home', '.live-section.places-workspace'],
  ['home', '.discovery-split'],
  ['company', '.company-layout .vpanel'],
  ['watch', '.watch-feed-section'],
  ['watch', 'article.watch-item, .watch-item'],
  ['dashboard', '.snapshot-note'],
];

for (const [label, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844, isMobile: true, hasTouch: true}]]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.route('**://*/**', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  for (const [view, sel] of targets) {
    await page.goto(base + '/#view=' + view, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('main#vcontent', {timeout: 60_000});
    await page.waitForTimeout(1500);
    const info = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return {found: false, sel};
      const rect = el.getBoundingClientRect();
      const rows = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      const seen = new Set();
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const host = node.parentElement;
        if (!host || seen.has(host)) continue;
        seen.add(host);
        const range = document.createRange();
        range.selectNodeContents(node);
        let worst = Infinity, worstRect = null;
        for (const r of range.getClientRects()) {
          if (r.width < 2 || r.height < 2) continue;
          const inset = Math.min(r.left - rect.left, r.top - rect.top, rect.right - r.right, rect.bottom - r.bottom);
          if (inset < worst) { worst = inset; worstRect = r; }
        }
        if (worst !== Infinity) rows.push({host: host.className || host.tagName.toLowerCase(), inset: Math.round(worst * 10) / 10, margin: getComputedStyle(host).margin});
      }
      rows.sort((a, b) => a.inset - b.inset);
      return {found: true, sel, padding: getComputedStyle(el).padding, worst: rows.slice(0, 4)};
    }, sel);
    console.log(label, view, JSON.stringify(info));
  }
  await context.close();
}
await browser.close();
