import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const out = {};
// Desktop: home (city-story, insight, recommendation, snapshot, vpanel resting)
{
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + '/#view=home', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main#vcontent', {timeout: 60000});
  await page.waitForTimeout(2200);
  out.home = await page.evaluate(() => {
    const pick = sel => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return {shadow: c.boxShadow, pad: c.padding, radius: c.borderRadius.slice(0, 30)}; };
    return {vpanel: pick('.vpanel'), snapshot: pick('.snapshot-note'), cityStory: pick('.city-story'), insight: pick('.insight-story'), recommendation: pick('.recommendation-card'), placeCard: pick('.place-card'), domainCardContent: pick('.domain-card-content')};
  });
  await page.close();
}
// place view: visit-card; saved: vcallout; dashboard hover state is not probed here (transition props asserted via CSS)
{
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  await page.route('**://*/**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + '/#view=place&id=peles', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main#vcontent', {timeout: 60000});
  await page.waitForTimeout(2200);
  out.place = await page.evaluate(() => {
    const el = document.querySelector('.visit-card'); if (!el) return null; const c = getComputedStyle(el); return {shadow: c.boxShadow, pad: c.padding};
  });
  await page.goto(base + '/#view=saved', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(1800);
  out.saved = await page.evaluate(() => {
    const el = document.querySelector('.vcallout'); if (!el) return null; const c = getComputedStyle(el); return {shadow: c.boxShadow, pad: c.padding};
  });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
