import { chromium, devices } from '/Users/cbrebu/Projects/alfivra/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
import { writeFileSync, copyFileSync } from 'node:fs';
const browser = await chromium.launch();
const iPhone = devices['iPhone 13'];
const ctx = await browser.newContext({ ...iPhone, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3500);
const audit = await page.evaluate(() => ({
  hero: (() => { const i = document.querySelector('img.hero-photo'); return { currentSrc: i?.currentSrc?.split('/').pop(), srcSet: !!i?.srcset, fetchpriority: i?.getAttribute('fetchpriority') }; })(),
  covers: [...document.querySelectorAll('img.category-cover')].slice(0, 6).map(i => i.currentSrc.split('/').pop()),
  font: [...document.fonts].map(f => f.family + ':' + f.status),
  fontBytes: performance.getEntriesByType('resource').filter(r => r.name.includes('InterVariable')).map(r => r.decodedBodySize),
  fade: getComputedStyle(document.body).fontFamily.slice(0, 40),
}));
const png = await page.screenshot({ fullPage: false });
writeFileSync('ssnc-agent-orch/2026/10/07/ux-friction/after-perf-home-mobile.png', png);
console.log(JSON.stringify(audit, null, 1));
console.log('pageErrors:', errors);
await ctx.close(); await browser.close();
