import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
const page = await context.newPage();
const consoleMsgs = [], pageErrors = [];
page.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 160)));
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
// capture the tap-time hit precisely with in-page listeners BEFORE the tap
await page.goto(base + '/#view=dashboard');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'dashboard', null, {timeout: 20000});
const taps = await page.evaluate(() => {
  window.__taps = [];
  const record = (name, e) => {
    const el = e.target instanceof Element ? e.target : null;
    window.__taps.push({k: name, t: Math.round(performance.now()), type: e.type, tag: el?.tagName, cls: (el?.className || '').toString().slice(0, 50), inBtn: !!el?.closest?.('.vbottom-nav button'), btn: el?.closest?.('.vbottom-nav button')?.textContent?.trim().slice(0, 14), x: e.clientX, y: e.clientY, view: document.getElementById('vcontent')?.getAttribute('data-view'), cover: el && !el.closest('.vbottom-nav button') ? {tag: el.tagName, cls: (el.className || '').toString().slice(0, 90), z: getComputedStyle(el).zIndex, html: el.outerHTML.slice(0, 200).replace(/\s+/g, ' ')} : null});
  };
  for (const k of ['touchstart', 'touchend', 'pointerdown', 'click']) {
    document.addEventListener(k, e => record(k, e), {capture: true, passive: true});
  }
  return true;
});
// geometry as the matrix did
const pt = await page.evaluate(() => {const r = document.querySelector('.vbottom-nav').querySelectorAll('button')[0].getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
console.log('btn0 coords:', pt);
await page.touchscreen.tap(pt.x, pt.y);
await page.waitForTimeout(1600);
const st1 = await page.evaluate(() => ({view: document.getElementById('vcontent')?.getAttribute('data-view'), hash: location.hash, eltap: window.__taps.length}));
console.log('after 1st tap:', JSON.stringify(st1));
await page.touchscreen.tap(pt.x, pt.y);
await page.waitForTimeout(1600);
const st2 = await page.evaluate(() => ({view: document.getElementById('vcontent')?.getAttribute('data-view'), hash: location.hash, taps: window.__taps.map(t => t.k + ':in-btn=' + t.inBtn + ' btn=' + t.btn)}));
console.log('after 2nd tap:', st2.view, st2.hash);
for (const t of await page.evaluate(() => window.__taps)) console.log(JSON.stringify(t).slice(0, 300));
console.log('--- console ---'); for (const m of consoleMsgs.slice(0, 20)) console.log(m);
console.log('--- pageerrors ---'); for (const e of pageErrors.slice(0, 15)) console.log(e);
await browser.close();
