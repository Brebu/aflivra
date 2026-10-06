import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'ssnc-agent-orch/2026/10/06/design-alignment-pass/screens';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const VIEWS = [
  { name: 'home', hash: '#view=home' },
  { name: 'explore', hash: '#view=explore' },
  { name: 'place', hash: '#view=place' },
  { name: 'justitie', hash: '#view=domain&id=justitie' },
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ headless: true });
const shoot = async (url, hash) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, userAgent: UA, locale: 'ro-RO',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(url + '/' + hash, { waitUntil: 'domcontentloaded' });
  await sleep(4500);
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(400);
  const png = await page.screenshot();
  const bands = [];
  for (const t of [0, 281, 562]) {
    bands.push(await page.screenshot({ clip: { x: 0, y: t, width: 390, height: 280 } }));
  }
  const H = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  await ctx.close();
  return { png, bands, H, errs };
};

for (const v of VIEWS) {
  const ours = await shoot('https://aflivra.brebu.workers.dev', v.hash);
  const orig = await shoot('https://reper-romania.xywex.chatgpt.site', v.hash);
  (await import('node:fs')).writeFileSync(`${OUT}/${v.name}-ours.png`, ours.png);
  (await import('node:fs')).writeFileSync(`${OUT}/${v.name}-orig.png`, orig.png);
  const html = `<html><body style="margin:0;background:#111"><div style="display:flex;font:22px sans-serif;color:#fff"><div style="flex:1"><div style="padding:10px">AL NOSTRU — afli&#351;.brebu.workers.dev</div><img src="data:image/png;base64,${ours.png.toString('base64')}" style="width:390px;height:auto"></div><div style="flex:1"><div style="padding:10px">ORIGINAL — reper-romania.xywex.chatgpt.site</div><img src="data:image/png;base64,${orig.png.toString('base64')}" style="width:390px;height:auto"></div></div></body></html>`;
  const pair = await browser.newPage({ viewport: { width: 800, height: 900 } });
  await pair.setContent(html);
  await sleep(500);
  await pair.screenshot({ path: `${OUT}/${v.name}-pair.png`, fullPage: true });
  await pair.close();
  const bandDiff = ours.bands.map((b, i) => b.equals(orig.bands[i]) ? 'eq' : 'DIFF');
  console.log(JSON.stringify({ view: v.name, pageH: { ours: ours.H, orig: orig.H }, top3bands: bandDiff, jsErrs: { ours: ours.errs.length, orig: orig.errs.length } }));
}
await browser.close();
console.log('DONE -> ' + OUT);
