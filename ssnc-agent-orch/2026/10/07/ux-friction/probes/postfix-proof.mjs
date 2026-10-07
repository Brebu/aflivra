// Post-fix proof probe, v2 — mirrors the (proven, e2e) interaction exactly:
// 1280x720 context, scrollIntoViewIfNeeded + scrollBy(0,260), no pre-hover.
// Also samples the marker's boundingBox twice to document the jitter seen during hover retries.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'ssnc-agent-orch/2026/10/07/ux-friction/probes';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TARGET = 'Selectează Biserica Rotondă din Geoagiu';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5173/#view=map', { waitUntil: 'domcontentloaded' });
for (let n = 0; n < 60; n++) {
  if (await page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false)) break;
  await sleep(500);
}
const marker = page.locator(`.map-workspace .romap g.map-pin[aria-label="${TARGET}"]`).first();
await marker.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 260));
await sleep(300);

const circle = marker.locator('circle').first();
const b1 = await circle.boundingBox();
await sleep(250);
const b2 = await circle.boundingBox();
const jitter = { box1: b1, box2: b2, movedPx: b1 && b2 ? Math.hypot(b1.x - b2.x, b1.y - b2.y).toFixed(1) : null };
const topAtCenter = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el ? `${el.tagName}@(${Math.round(x)},${Math.round(y)}) owner=[${(el.closest('g[aria-label]') || el).getAttribute?.('aria-label')}]` : null;
}, [b1.x + b1.width / 2, b1.y + b1.height / 2]);

await page.screenshot({ path: `${OUT}/postfix-map-with-marker.png` });

await circle.click();
await sleep(1200);
const proof = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector('main#vcontent')?.getAttribute('data-view'), hero: document.querySelector('.place-hero h1')?.textContent }));
await page.screenshot({ path: `${OUT}/postfix-place-after-click.png` });
const out = { jitter, topAtCenter, clickLandedOn: topAtCenter, ...proof };
writeFileSync(`${OUT}/postfix-proof.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await ctx.close();
await browser.close();
