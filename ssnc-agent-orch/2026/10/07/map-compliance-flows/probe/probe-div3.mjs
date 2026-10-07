import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
const page = await context.newPage();
const consoleMsgs = [], pageErrors = [];
page.on('console', m => consoleMsgs.push(m.type() + ': ' + m.text().slice(0, 140)));
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'home', null, {timeout: 20000});
await page.evaluate(() => {
  window.__divWatch = [];
  const scan = () => {
    const nav = document.querySelector('.vbottom-nav');
    if (!nav) return;
    const r = nav.querySelectorAll('button')[0].getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const inBtn = !!(el && el.closest && el.closest('.vbottom-nav button'));
    const cover = !inBtn && el && el.tagName !== 'BUTTON' ? {tag: el.tagName, cls: (el.className || '').toString().slice(0, 90), z: getComputedStyle(el).zIndex, pe: getComputedStyle(el).pointerEvents, id: el.id, html: el.outerHTML.slice(0, 160)} : null;
    window.__divWatch.push({t: Math.round(performance.now()), view: document.getElementById('vcontent')?.getAttribute('data-view'), hit: (el?.tagName || '-') + (inBtn ? '(in-btn)' : '(NOT-in-btn)'), cover});
  };
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, {childList: true, subtree: true});
  setInterval(scan, 300);
});
// now navigate home → dashboard via the real bar tap
async function tapBtn(i) {
  const pt = await page.evaluate(idx => {const r = document.querySelector('.vbottom-nav').querySelectorAll('button')[idx].getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};}, i);
  await page.touchscreen.tap(pt.x, pt.y);
}
console.log('→ tapping dashboard (btn1)');
await tapBtn(1);
await page.waitForTimeout(1200);
console.log('→ tapping home (btn0)');
await tapBtn(0);
await page.waitForTimeout(1200);
console.log('→ tapping saved (btn5)');
await tapBtn(5);
await page.waitForTimeout(1200);
console.log('→ tapping home (btn0) from saved');
await tapBtn(0);
await page.waitForTimeout(1500);
const watch = await page.evaluate(() => window.__divWatch);
// compress: only transitions + any sample where hit is NOT in a button
let lastKey = '';
for (const w of watch) {
  const key = w.view + '|' + w.hit;
  if (key !== lastKey || w.cover) {console.log(`t=${w.t}ms view=${w.view} hit=${w.hit}${w.cover ? ' COVER=' + JSON.stringify(w.cover) : ''}`); lastKey = key;}
}
console.log('--- console ---'); for (const m of consoleMsgs.slice(0, 25)) console.log(m);
console.log('--- pageerrors ---'); for (const e of pageErrors.slice(0, 10)) console.log(e);
console.log('final view:', await page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view')));
await browser.close();
