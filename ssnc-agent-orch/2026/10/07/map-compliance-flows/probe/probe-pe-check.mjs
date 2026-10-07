import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
const page = await context.newPage();
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'home', null, {timeout: 20000});
const pt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Pentru tine: localitate, interese și aspect"]'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
await page.mouse.click(pt.x, pt.y);
await page.waitForSelector('.preferences-sheet', {timeout: 10000});
await page.keyboard.press('Escape');
const series = await page.evaluate(() => new Promise(resolve => {
  const samples = [];
  const start = performance.now();
  const tick = () => {
    const nav = document.querySelectorAll('.vbottom-nav button')[1];
    const r = nav.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const el = document.elementFromPoint(x, y);
    const overlay = document.querySelector('[data-slot=sheet-overlay]');
    const content = document.querySelector('[data-slot=sheet-content]');
    samples.push({dt: Math.round(performance.now() - start), hit: el?.tagName + '.' + (el?.getAttribute?.('data-slot') ?? (el?.className || '').toString().slice(0, 22)), hitPE: el ? getComputedStyle(el).pointerEvents : '', ovPE: overlay ? getComputedStyle(overlay).pointerEvents + '/' + overlay.getAttribute('data-state') : 'gone', ccPE: content ? getComputedStyle(content).pointerEvents + '/' + content.getAttribute('data-state') : 'gone', inBtn: !!el?.closest('.vbottom-nav button')});
    if (performance.now() - start > 900) {resolve(samples); return;}
    requestAnimationFrame(tick);
  };
  tick();
}));
for (const s of series.filter((s, i) => i < 4 || s.inBtn || i % 4 === 0)) console.log(JSON.stringify(s));
console.log('first-in-btn dt:', (series.find(s => s.inBtn) || {}).dt);
await browser.close();
