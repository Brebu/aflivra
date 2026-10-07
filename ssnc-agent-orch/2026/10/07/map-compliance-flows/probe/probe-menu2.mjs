import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const now = () => new Date().toISOString();
const browser = await chromium.launch();
// replicate the exact matrix context + bringUp + a couple of target attempts, then the menu leg
for (const variant of ['plain', 'after-targets']) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
  const page = await context.newPage();
  // installFixtures like the matrix
  await page.route(/\/api\/watch/, route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({watches: [], sweepState: {runsPerDay: 3, timesUtc: '04:28', lastRunAt: now(), lastEvents: 0, lastPushes: 0, lastOk: true}, notification: {vapidPublicKey: null}, kinds: []})}));
  await page.route('**/api/legal*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({data: {items: []}})}));
  await page.route('**/api/cinema*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({data: {}})}));
  if (variant === 'after-targets') {
    // emulate the matrix flow: two target attempts with bringUpEntry resets before the menu leg
    await page.goto(base + '/');
    await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
    await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'home', null, {timeout: 20000});
    for (const t of [1, 2]) { // tap dashboard then map, then bring back home via goto (hash)
      const pt = await page.evaluate(i => {const r = document.querySelector('.vbottom-nav').querySelectorAll('button')[i].getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};}, t);
      await page.touchscreen.tap(pt.x, pt.y);
      await page.waitForTimeout(1200);
      await page.goto(base + '/#view=home');
      await page.waitForTimeout(600);
    }
  } else {
    await page.goto(base + '/');
    await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
    await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'home', null, {timeout: 20000});
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => {
    window.__evts = [];
    const rec = (e) => {const el = e.target instanceof Element ? e.target : null; window.__evts.push({t: Math.round(performance.now()), k: e.type, tag: el?.tagName, txt: (el?.textContent || '').trim().slice(0, 14), x: e.clientX, y: e.clientY});};
    for (const k of ['pointerdown', 'touchstart', 'touchend', 'click']) document.addEventListener(k, rec, {capture: true, passive: true});
  });
  // the exact matrix menu leg: evaluate-block coords, touchscreen open, selector wait, item find, tap
  await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Deschide meniul"]'); if (!b) throw new Error('menu button missing'); const r = b.getBoundingClientRect(); window.__menuPt = {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
  const pt = await page.evaluate(() => window.__menuPt);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForSelector('.menu-sheet', {timeout: 10_000});
  const item = await page.evaluate(() => {const items = [...document.querySelectorAll('.menu-sheet [data-slot=button]')]; const dash = items.find(i => i.textContent.includes('Dashboard')); const r = dash.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
  await page.touchscreen.tap(item.x, item.y);
  await page.waitForTimeout(2200);
  const state = await page.evaluate(() => ({view: document.getElementById('vcontent')?.getAttribute('data-view'), hash: location.hash, sheet: !!document.querySelector('.menu-sheet'), evts: window.__evts.map(e => e.k + '@' + e.tag + ' "' + e.txt + '" (' + (e.x ?? '-') + ',' + (e.y ?? '-') + ')@t' + e.t)}));
  console.log(`--- variant=${variant} ---`);
  console.log(JSON.stringify(state, null, 1));
  await context.close();
}
await browser.close();
