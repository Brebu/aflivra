// Card DISCOVERY sweep — finds every rendered "card-like" element by computed style
// (panel background + border + radius), regardless of class name, and audits its
// text inset / margin-of-content / shadow. This is the systemic counterpart to
// card-audit.mjs (class-list driven): it catches card families the selector list missed.
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/uiux/card-discovery.mjs
import {chromium} from '@playwright/test';

const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;

const routes = [
  ['home', '#view=home'], ['explore', '#view=explore'], ['dashboard', '#view=dashboard'],
  ['map', '#view=map'], ['compare', '#view=compare'], ['watch', '#view=watch'],
  ['saved', '#view=saved'], ['place', '#view=place&id=peles'], ['domainStiri', '#view=domain&id=stiri'],
  ['domainLocal', '#view=domain&id=local&tab=servicii'], ['money', '#view=money'],
  ['company', '#view=company'], ['planner', '#view=planner'], ['recommendations', '#view=recommendations'],
];

const browser = await chromium.launch();
const report = {};

for (const [label, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844, isMobile: true, hasTouch: true}]]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.route('**://*/**', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  for (const [view, hash] of routes) {
    await page.goto(base + '/' + hash, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('main#vcontent', {timeout: 60_000});
    await page.waitForTimeout(1600);
    const found = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('main *')) {
        const cs = getComputedStyle(el);
        const cls = (el.getAttribute('class') || '').trim();
        if (!cls || cls.length > 90) continue;
        if (!el.classList.length) continue;
        const cardish = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') &&
          cs.borderWidth.split(' ')[0] && parseFloat(cs.borderTopWidth) === 1 &&
          parseFloat(cs.borderRadius) >= 10 && cs.position !== 'fixed';
        if (!cardish) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 90 || rect.height < 48) continue;
        // skip nested cards that live INSIDE another card-like parent with radius>=10
        let p = el.parentElement, nested = false;
        while (p && p.tagName !== 'MAIN') {
          const pcs = getComputedStyle(p);
          if ((pcs.backgroundColor !== 'rgba(0, 0, 0, 0)' || pcs.backgroundImage !== 'none') && parseFloat(pcs.borderRadius) >= 10 && p.getBoundingClientRect().width > 90) { nested = true; break; }
          p = p.parentElement;
        }
        if (nested) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node, minInset = Infinity;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            if (r.width < 2 || r.height < 2) continue;
            const inset = Math.min(r.left - rect.left, r.top - rect.top, rect.right - r.right, rect.bottom - r.bottom);
            if (inset >= 0) minInset = Math.min(minInset, inset);
          }
        }
        if (minInset === Infinity) continue;
        out.push({
          cls: cls.split(/\s+/).slice(0, 2).join(' '),
          tag: el.tagName.toLowerCase(),
          pad: cs.padding.replace(/px/g, '').split(' ').map(p => parseFloat(p) || 0).join('/'),
          inset: Math.round(minInset * 10) / 10,
          shadow: cs.boxShadow === 'none' ? 'none' : 'elev',
          text: (el.textContent || '').trim().slice(0, 26),
        });
      }
      return out;
    });
    report[label + '/' + view] = found;
  }
  await context.close();
}
await browser.close();

const lines = [];
let flush = 0, total = 0;
for (const [surface, cards] of Object.entries(report)) {
  for (const c of cards) {
    total++;
    if (c.inset < 12) { flush++; lines.push([surface.padEnd(23), c.cls.slice(0, 26).padEnd(27), 'pad=' + String(c.pad).padEnd(10), 'inset=' + String(c.inset).padEnd(6), 'shadow=' + c.shadow, '·', c.text].join(' ')); }
  }
}
console.log('card-like-root surfaces:', total, '| FLUSH (<12px text inset):', flush);
console.log(lines.sort().join('\n'));
await (await import('node:fs/promises')).writeFile(outDir + 'card-discovery.json', JSON.stringify(report, null, 2));
