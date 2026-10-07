// Warmed-SW probe: first load installs+activates the SW; second load (SW controlling from
// navigation start, exactly the returning-user state) counts font & hero fetches.
import { chromium } from '@playwright/test';

const [base] = process.argv.slice(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

const load = async (hash, label) => {
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', r => { const u = r.url(); if (/InterVariable|hero-graphite/.test(u)) reqs.push(u.split('/').slice(-2).join('/') + ' [' + r.resourceType() + ']'); });
  await page.goto(base + '/#' + hash, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await sleep(6000);
  const s = await page.evaluate(() => ({
    controller: !!navigator.serviceWorker?.controller,
    fontFetches: performance.getEntriesByType('resource').filter(e => e.name.includes('InterVariable')).map(e => e.initiatorType + '/' + e.transferSize),
    heroFetches: performance.getEntriesByType('resource').filter(e => e.name.includes('hero-graphite')).map(e => e.initiatorType + '/' + e.transferSize),
    dataView: document.querySelector('main')?.getAttribute('data-view'),
    heroImg: !!document.querySelector('img.hero-photo'),
    fontOk: document.fonts.check('16px "Inter Aflivra"'),
  }));
  console.log(label, '→ sw-controlled:', s.controller, '| view:', s.dataView, '| heroImg:', s.heroImg, '| fontOk:', s.fontOk);
  console.log('   resource-timing font:', JSON.stringify(s.fontFetches), 'hero:', JSON.stringify(s.heroFetches));
  console.log('   playwright-request events:', JSON.stringify(reqs));
  await page.close();
  return s;
};

await load('view=home', 'LOAD1 (installs SW)');
const s2 = await load('view=domain&id=transport', 'LOAD2 (SW controlling, deeplink)');
await load('view=home', 'LOAD3 (SW controlling, home)');
await browser.close();
console.log(s2.fontFetches.length > 1 ? 'PROOF: font fetched more than once on SW-controlled load' : 'single font fetch on controlled load');
