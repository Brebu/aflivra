import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
const [a, b] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const r = await page.evaluate(async ([ua, ub]) => {
  const load = u => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = u; });
  const [ia, ib] = [await load(ua), await load(ub)];
  if (ia.width !== ib.width || ia.height !== ib.height) return { dimsDiffer: true, a: [ia.width, ia.height], b: [ib.width, ib.height] };
  const c = [ia, ib].map(img => { const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }); cv.getContext('2d').drawImage(img, 0, 0); return cv.getContext('2d').getImageData(0, 0, img.width, img.height).data; });
  let diff = 0, big = 0;
  for (let i = 0; i < c[0].length; i += 4) {
    const d = Math.abs(c[0][i] - c[1][i]) + Math.abs(c[0][i+1] - c[1][i+1]) + Math.abs(c[0][i+2] - c[1][i+2]);
    if (d > 24) diff++; if (d > 72) big++;
  }
  const total = c[0].length / 4;
  return { dims: [ia.width, ia.height], differingPx: diff, bigDiffPx: big, totalPx: total, differingPct: +(100 * diff / total).toFixed(3) };
}, [a, b].map(u => pathToFileURL(u).href));
console.log(JSON.stringify(r));
await browser.close();
