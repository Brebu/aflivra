import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})).newPage();
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
const pt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Pentru tine: localitate, interese și aspect"]'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
await page.mouse.click(pt.x, pt.y);
await page.waitForSelector('.preferences-sheet', {timeout: 10000});
await page.keyboard.press('Escape');
const dump = await page.evaluate(() => {
  const out = {rules: [], ov: {}, layers: []};
  const ov = document.querySelector('[data-slot=sheet-overlay]');
  if (ov) {
    const cs = getComputedStyle(ov);
    out.ov = {state: ov.getAttribute('data-state'), pe: cs.pointerEvents, cls: [...ov.classList].join(' ').slice(0, 220)};
  }
  const walk = (rules, depth) => {
    for (const rule of rules) {
      if (rule.cssRules) {
        out.layers.push('  '.repeat(depth) + (rule.cssText.split('{')[0] || rule.constructor?.name).slice(0, 60));
        walk(rule.cssRules, depth + 1);
      } else if (rule.selectorText && rule.selectorText.includes('pointer-events-none')) {
        out.rules.push({sel: rule.selectorText.slice(0, 180), css: rule.style?.pointerEvents ?? '', matchesOv: ov ? ov.matches(rule.selectorText) : null});
      }
    }
  };
  walk(document.styleSheets[0] ? Array.from(document.styleSheets).flatMap(s => {try {return Array.from(s.cssRules)} catch {return []}}) : [], 0);
  return out;
});
console.log('overlay:', JSON.stringify(dump.ov, null, 1));
console.log('rules with pointer-events-none:');
for (const r of dump.rules) console.log(' sel:', r.sel, '| css:', r.css, '| matchesOverlay:', r.matchesOv);
console.log('layer structure (first 12):');
for (const l of dump.layers.slice(0, 12)) console.log(' ', l);
await browser.close();
