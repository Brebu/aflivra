import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
for (const view of ['home', 'company']) {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + '/#view=' + view, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main#vcontent', {timeout: 60000});
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => {
    const visibleRect = (el, host, r) => {
      let l = r.left, t = r.top, rt = r.right, b = r.bottom, p = host.parentElement;
      while (p && p !== el) {
        const c = getComputedStyle(p);
        if (c.overflowX !== 'visible' || c.overflowY !== 'visible') { const pr = p.getBoundingClientRect(); l = Math.max(l, pr.left); t = Math.max(t, pr.top); rt = Math.min(rt, pr.right); b = Math.min(b, pr.bottom); }
        p = p.parentElement;
      }
      return rt > l && b > t ? {l, t, rt, b} : null;
    };
    return Array.from(document.querySelectorAll('.vpanel')).map(el => {
      const rect = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node, worst = Infinity, offender = null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = new Range(); range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width < 2 || r.height < 2) continue;
          const v = visibleRect(el, node.parentElement, r);
          if (!v) continue;
          const inset = Math.min(v.l - rect.left, v.t - rect.top, rect.right - v.rt, rect.bottom - v.b);
          if (inset >= 0 && inset < worst) { worst = inset; offender = {text: node.textContent.trim().slice(0, 24), host: (node.parentElement.className || node.parentElement.tagName).toString().slice(0, 40)}; }
        }
      }
      return {cls: (el.className || '').slice(0, 60), text: (el.textContent || '').trim().slice(0, 30), worst: Math.round(worst * 10) / 10, offender};
    });
  });
  console.log('==', view); for (const r of res) console.log(JSON.stringify(r));
  await page.close();
}
await browser.close();
