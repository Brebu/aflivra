import { chromium } from '@playwright/test';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch({ headless: true });
const probe = async (url) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'ro-RO' });
  const page = await ctx.newPage();
  const failed = [];
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url().split('/').slice(-1)[0].slice(0, 60) + ' → ' + r.status()); });
  await page.goto(url + '/#view=home', { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  const data = await page.evaluate(() => {
    const WHAT = [];
    for (const y of [15, 25, 35, 75, 85, 95, 105, 115, 125, 135, 145, 165, 175, 185, 205, 215]) {
      const el = document.elementFromPoint(195, y);
      if (!el) { WHAT.push({ y, el: 'none' }); continue; }
      const cs = getComputedStyle(el);
      WHAT.push({ y, tag: el.tagName, cls: (el.className?.toString() || '').slice(0, 40), txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), font: cs.fontFamily.slice(0, 70), fs: cs.fontSize });
    }
    const fontsLoaded = [...document.fonts].map(f => f.family + ':' + f.status + ':' + (f.loaded ? 'yes' : 'no')).slice(0, 8);
    let fontFaces = [];
    try { for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r instanceof CSSFontFaceRule) fontFaces.push((r.style.getPropertyValue('font-family') || '') + ' ← ' + (r.style.getPropertyValue('src') || '').slice(0, 90)); } } catch {} } } catch {}
    return { WHAT, bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 80), rootFont: getComputedStyle(document.documentElement).fontFamily.slice(0, 80), fontsLoaded, fontFaces: fontFaces.slice(0, 6) };
  });
  await ctx.close();
  return { data, failed: failed.slice(0, 8) };
};
const ours = await probe('https://aflivra.brebu.workers.dev');
const orig = await probe('https://reper-romania.xywex.chatgpt.site');
await browser.close();
console.log(JSON.stringify({ ours, orig }, null, 1));
