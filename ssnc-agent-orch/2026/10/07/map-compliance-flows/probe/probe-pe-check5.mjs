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
const res = await page.evaluate(() => {
  const ov = document.querySelector('[data-slot=sheet-overlay]');
  const matches = [];
  const walk = (rules, layer) => {
    for (const rule of Array.from(rules ?? [])) {
      if (rule.cssRules) {
        const name = rule.cssText.split('{')[0].trim().slice(0, 40);
        walk(rule.cssRules, layer + ' ▸ ' + name);
      } else if (rule.selectorText) {
        try {
          if (ov.matches(rule.selectorText) && rule.style && rule.style.pointerEvents) {
            matches.push({layer: layer || 'NO-LAYER', sel: rule.selectorText.slice(0, 130), pe: rule.style.pointerEvents, important: rule.style.getPropertyPriority('pointer-events')});
          }
        } catch {}
      }
    }
  };
  for (const s of Array.from(document.styleSheets)) {try {walk(s.cssRules, (s.ownerNode?.nodeName === 'STYLE' ? 'style-tag' : 'link'));} catch {}}
  const cs = getComputedStyle(ov);
  return {state: ov.getAttribute('data-state'), computedPE: cs.pointerEvents, matchedRules: matches};
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
