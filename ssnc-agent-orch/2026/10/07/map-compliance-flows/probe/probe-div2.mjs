import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await context.route('**/*', route => route.request().url().startsWith(base) ? route.fallback() : route.abort());
const page = await context.newPage();
// watch API stub so the view content loads offline-clean
await page.route(/\/api\/watch/, route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({watches: [], sweepState: {runsPerDay: 3, timesUtc: '04:28', lastRunAt: new Date().toISOString(), lastEvents: 0, lastPushes: 0, lastOk: true}, notification: {vapidPublicKey: null}, kinds: []})}));
await page.goto(base + '/#view=watch');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
await page.waitForFunction(() => document.getElementById('vcontent')?.getAttribute('data-view') === 'watch', null, {timeout: 20000});
await page.waitForTimeout(600);
const details = await page.evaluate(() => {
  const out = [];
  for (const div of document.body.querySelectorAll(':scope > div')) {
    const cs = getComputedStyle(div);
    const r = div.getBoundingClientRect();
    out.push({cls: (div.className || '').toString(), id: div.id, tag: div.tagName, z: cs.zIndex, pos: cs.position, pe: cs.pointerEvents, rect: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}, children: div.children.length, text: (div.textContent || '').trim().slice(0, 60)});
  }
  return out;
});
console.log('body > div inventory:', JSON.stringify(details, null, 1));
// WHICH max-z div covers the bar and by how much; also probe points across the bar
const probe = await page.evaluate(() => {
  const pts = [];
  const nav = document.querySelector('.vbottom-nav');
  const navR = nav.getBoundingClientRect();
  pts.push({name: 'above-nav', x: Math.round(navR.left + navR.width / 2), y: Math.round(navR.top - 60)});
  pts.push({name: 'nav-top', x: 195, y: Math.round(navR.top + 4)});
  for (let i = 0; i < 6; i++) {const r = nav.querySelectorAll('button')[i].getBoundingClientRect(); pts.push({name: 'btn' + i, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)});}
  pts.push({name: 'page-mid', x: 195, y: 400});
  pts.push({name: 'below-nav', x: 195, y: Math.round(navR.bottom + 6)});
  return pts.map(p => {const el = document.elementFromPoint(p.x, p.y); return {p: p.name, x: p.x, y: p.y, hit: (el?.tagName || '-') + '.' + ((el?.className || '').toString().slice(0, 40)), z: el ? getComputedStyle(el).zIndex : ''};});
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
