// Why does touch single-pointer pan not reach the React handler while mouse does?
import {chromium} from '@playwright/test';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
const ctx = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') console.log('CONSERR:', m.text().slice(0, 200)); });
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:5173/#view=map');
await p.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});
await p.waitForFunction(() => document.querySelector('.romap svg > g')?.getAttribute('transform'), null, {timeout: 15_000});
await sleep(600);
await p.evaluate(() => document.querySelector('.romap').scrollIntoView({block: 'center'}));
await sleep(300);
// Raw DOM-level listeners on the svg (what actually reaches the element, pre-React).
await p.evaluate(() => {
  const svg = document.querySelector('.romap svg');
  const w = window; w.__h = {down: [], move: [], up: [], cancel: [], last: null};
  svg.addEventListener('pointerdown', e => w.__h.down.push({id: e.pointerId, tag: e.target.tagName, pt: e.pointerType, captureAfter: svg.hasPointerCapture(e.pointerId)}));
  svg.addEventListener('pointermove', e => w.__h.move.push({id: e.pointerId, tag: e.target.tagName, pt: e.pointerType, hasCap: svg.hasPointerCapture(e.pointerId), lastNow: JSON.stringify(svg._last)}));
  svg.addEventListener('pointerup', e => w.__h.up.push({id: e.pointerId}));
  svg.addEventListener('pointercancel', e => w.__h.cancel.push({id: e.pointerId}));
  // observe setPointerCapture calls
  const orig = svg.setPointerCapture.bind(svg);
  svg.setPointerCapture = (id) => { w.__h.last = 'capture:' + id; return orig(id); };
});
const c = await p.evaluate(() => { const el = document.querySelector('.romap svg'); const r = el.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)}; });
const before = await p.evaluate(() => document.querySelector('.romap svg > g').getAttribute('transform'));
// touch drag from a PIN (Castelul Peleș sits at map center)
await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: c.x, y: c.y}]});
for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: c.x + 10 * i, y: c.y + 8 * i}]});
await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
await sleep(400);
const h = await p.evaluate(() => (window).__h);
const after = await p.evaluate(() => document.querySelector('.romap svg > g')?.getAttribute('transform'));
console.log('handler stream:', JSON.stringify(h, null, 1).slice(0, 1600));
console.log('transform', before, '->', after); console.log('COUNTERS', JSON.stringify(await p.evaluate(() => ({render:(window).__rmRender, setpan:(window).__rmSetpan, deltas:(window).__rmDeltas}))));
await b.close();
