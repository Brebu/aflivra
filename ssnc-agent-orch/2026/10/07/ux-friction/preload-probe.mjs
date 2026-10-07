// Preload-audit probe: console warnings + font/hero fetch counts + post-hydration head inventory.
// Usage: node ssnc-agent-orch/2026/10/07/ux-friction/preload-probe.mjs <base-url> <label> <out-prefix>
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const [base, label, outPrefix] = process.argv.slice(2);
if (!base || !label || !outPrefix) throw new Error('Expected <base-url> <label> <out-prefix>');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const report = { label, base, runs: [] };

const probe = async (hash, name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  const reqs = [];
  page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text(), location: m.location()?.url }));
  page.on('request', r => {
    const u = r.url();
    if (/InterVariable|hero-graphite/.test(u)) reqs.push({ phase: 'request', url: u.slice(u.indexOf('/fonts') >= 0 ? u.indexOf('/fonts') : u.indexOf('/media')), type: r.resourceType() });
  });
  page.on('response', r => {
    const u = r.url();
    if (/InterVariable|hero-graphite/.test(u)) reqs.push({ phase: 'response', status: r.status(), url: u.slice(u.indexOf('/fonts') >= 0 ? u.indexOf('/fonts') : u.indexOf('/media')), headers: { 'cache-control': r.headers()['cache-control'] || '', vary: r.headers()['vary'] || '', 'content-type': r.headers()['content-type'] || '' } });
  });
  await page.goto(base + '/#' + hash, { waitUntil: 'load', timeout: 45000 }).catch(e => consoleMsgs.push({ type: 'error', text: 'goto: ' + e.message }));
  await sleep(10000); // Chrome fires the unused-preload warning a few seconds after window load
  const state = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const pick = p => res.filter(e => e.name.includes(p)).map(e => ({ name: e.name.split('/').pop(), initiator: e.initiatorType, transfer: e.transferSize, encoded: e.encodedBodySize, cache: [e.deliveryType, e.nextHopProtocol].join('/') }));
    return {
      title: document.title.slice(0, 40),
      dataView: document.querySelector('main')?.getAttribute('data-view'),
      heroImgInDom: !!document.querySelector('img.hero-photo'),
      fontFetches: pick('InterVariable'),
      heroFetches: pick('hero-graphite'),
      preloadLinks: [...document.querySelectorAll('link[rel="preload"],link[rel="modulepreload"]')].map(l => ({ rel: l.rel, as: l.as || '-', href: l.getAttribute('href'), crossorigin: l.crossOrigin })),
      fontPreloadCopies: [...document.querySelectorAll('link[rel="preload"][href*="InterVariable"]')].length,
      fontStatus: [...document.fonts].map(f => f.family + ':' + f.status).slice(0, 4),
      fontCheck: { interAflivra: document.fonts.check('16px "Inter Aflivra"'), body: getComputedStyle(document.body).fontFamily.slice(0, 60) },
      swControlled: !!navigator.serviceWorker?.controller,
    };
  });
  const shot = outPrefix + '-' + name + '.png';
  await page.screenshot({ path: shot });
  report.runs.push({ name, hash, state, preloadConsoleWarnings: consoleMsgs.filter(m => /preload/i.test(m.text)), allConsole: consoleMsgs.slice(0, 40), fontHeroReqRes: reqs });
  await ctx.close();
};

await probe('view=domain&id=transport', 'deeplink');
await probe('view=home', 'home');
await browser.close();
writeFileSync(outPrefix + '.json', JSON.stringify(report, null, 1));
const warn = r => r.preloadConsoleWarnings.map(w => '  [' + r.name + '] ' + w.text.slice(0, 160));
console.log('== ' + label + ' ==');
for (const r of report.runs) {
  console.log(r.name + ': view=' + r.state.dataView + ' fontPreloadCopies=' + r.state.fontPreloadCopies +
    ' fontFetches=' + r.state.fontFetches.length + ' heroFetches=' + r.state.heroFetches.length +
    ' heroImg=' + r.state.heroImgInDom + ' sw=' + r.state.swControlled + ' fontCheck=' + r.state.fontCheck.interAflivra);
  warn(r).forEach(l => console.log(l));
}
