import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
const page = await context.newPage();
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'home', null, {timeout: 20000});
await page.evaluate(() => {
  window.__evts = [];
  const rec = (e) => {const el = e.target instanceof Element ? e.target : null; window.__evts.push({t: Math.round(performance.now()), k: e.type, tag: el?.tagName, cls: (el?.className || '').toString().slice(0, 40), txt: (el?.textContent || '').trim().slice(0, 16), x: e.clientX, y: e.clientY});};
  for (const k of ['pointerdown', 'touchstart', 'touchend', 'click']) document.addEventListener(k, rec, {capture: true, passive: true});
});
for (const waitMs of [60, 600]) {
  // open menu
  const menuPt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Deschide meniul"]'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
  await page.touchscreen.tap(menuPt.x, menuPt.y);
  await page.waitForSelector('.menu-sheet', {timeout: 100_000});
  if (waitMs) await page.waitForTimeout(waitMs);
  const item = await page.evaluate(() => {const items = [...document.querySelectorAll('.menu-sheet [data-slot=button]')]; const dash = items.find(i => i.textContent.includes("Dashboard")); const r = dash.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), rect: {l: Math.round(r.left), w: Math.round(r.width), t: Math.round(r.top), h: Math.round(r.height)}};});
  console.log(`menu open, waited ${waitMs}ms; Dashboard item rect:`, JSON.stringify(item));
  await page.evaluate(() => {window.__evts = [];});
  await page.touchscreen.tap(item.x, item.y);
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({view: document.getElementById('vcontent')?.getAttribute('data-view'), hash: location.hash, sheet: !!document.querySelector('.menu-sheet'), evts: window.__evts.map(e => e.k + '@' + e.tag + ' "' + e.txt + '" (' + e.x + ',' + e.y + ')')}));
  console.log(`after tap (waited ${waitMs}ms):`, JSON.stringify(state, null, 1));
  // ensure sheet closed before next iteration
  await page.evaluate(() => {document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));});
  await page.waitForTimeout(300);
  if (await page.evaluate(() => !!document.querySelector('.menu-sheet'))) {await page.evaluate(() => {const c = document.querySelector('.menu-sheet'); c && (window.__x = 1);});}
}
await browser.close();
