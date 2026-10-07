import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => {if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200));});
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
const pt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Pentru tine: localitate, interese și aspect"]'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
await page.mouse.click(pt.x, pt.y);
await page.waitForSelector('.preferences-sheet', {timeout: 10000});
await page.keyboard.press('Escape');
const res = await page.evaluate(() => {
  const ov = document.querySelector('[data-slot=sheet-overlay]');
  if (!ov) return {err: 'overlay gone'};
  const target = '.data-\\[state\\=closed\\]\\:pointer-events-none[data-state="closed"]';
  let directMatch = null;
  try {directMatch = ov.matches(target);} catch (e) {directMatch = 'THREW: ' + String(e).slice(0, 120);}
  // collect matching rules manually with per-rule error reporting
  const results = {directMatch, ovState: ov.getAttribute('data-state'), classList: [...ov.classList].join(' ').slice(0, 160), computed: getComputedStyle(ov).pointerEvents, matching: [], errors: []};
  const walk = (rules, layer) => {
    for (const rule of Array.from(rules ?? [])) {
      if (rule.cssRules) {walk(rule.cssRules, layer + '/' + (rule.cssText.split('{')[0].trim().slice(0, 30) || rule.constructor.name));}
      else if (rule.selectorText) {
        let m = null;
        try {m = ov.matches(rule.selectorText);} catch (e) {results.errors.push(layer + ' … ' + rule.selectorText.slice(0, 60) + ' → ' + String(e).slice(0, 60)); continue;}
        if (m && rule.style && (rule.style.pointerEvents || rule.style.getPropertyValue('animation-duration'))) {
          results.matching.push({layer: layer.slice(0, 80), sel: rule.selectorText.slice(0, 120), pe: rule.style.pointerEvents || '', animDur: rule.style.animationDuration || ''});
        }
      }
    }
  };
  for (const s of Array.from(document.styleSheets)) {try {walk(s.cssRules, s.ownerNode?.nodeName === 'STYLE' ? 'style' : 'link');} catch (e) {results.errors.push('sheet: ' + String(e).slice(0, 80));}}
  return results;
});
console.log(JSON.stringify(res, null, 1).slice(0, 3500));
console.log('page errors:', errors.slice(0, 6));
await browser.close();
