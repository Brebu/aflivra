import {chromium} from '@playwright/test';
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
await page.goto(base + '/');
await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30000});
const dump = await page.evaluate(() => {
  const found = {closedVariants: [], pointerRules: [], sheetFiles: []};
  const walk = (rules, path) => {
    for (const rule of rules) {
      if (rule.cssRules && (rule.cssText.includes('@'))) {
        walk(rule.cssRules, path + '/' + (rule.cssText.split('{')[0] || '').trim().slice(0, 30));
      } else if (rule.selectorText) {
        if (rule.selectorText.includes('data-state="closed"') || rule.selectorText.includes('data-state=closed')) found.closedVariants.push(rule.selectorText.slice(0, 200));
        if (rule.cssText.includes('pointer-events')) found.pointerRules.push(rule.cssText.slice(0, 160));
      }
    }
  };
  for (const s of Array.from(document.styleSheets)) {try {walk(s.cssRules, '#' + (s.ownerNode?.id ?? (s.href || 'inline').slice(-40)));} catch {}}
  for (const l of Array.from(document.querySelectorAll('link[rel=stylesheet], style')).slice(0, 12)) found.sheetFiles.push((l.getAttribute('href') || 'inline-' + (l.textContent || '').length).slice(0, 80));
  return found;
});
console.log('stylesheets on the page:', JSON.stringify(dump.sheetFiles, null, 1));
console.log('rules mentioning data-state=closed (first 20):');
for (const s of dump.closedVariants.slice(0, 20)) console.log(' ', s);
console.log('rules mentioning pointer-events (first 10):');
for (const s of dump.pointerRules.slice(0, 10)) console.log(' ', s);
await browser.close();
