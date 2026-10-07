// Deep probe: CDP Log entries (browser-level console, incl. preload warnings) + head link mutations.
// Usage: node ssnc-agent-orch/2026/10/07/ux-friction/preload-probe-cdp.mjs <base-url> <label> <out-prefix>
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
  const cdp = await ctx.newCDPSession(page);
  const logEntries = [];
  await cdp.send('Log.enable');
  cdp.on('Log.entryAdded', e => logEntries.push({ source: e.entry.source, level: e.entry.level, text: (e.entry.text || '').slice(0, 220), url: (e.entry.url || '').slice(0, 120) }));
  const consoleMsgs = [];
  page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 220) }));
  await page.goto(base + '/#' + hash, { waitUntil: 'commit', timeout: 45000 }).catch(() => {});
  // Observe head link mutations from the earliest possible moment.
  await page.addInitScript(() => {
    window.__linkLog = [];
    const log = m => { try { window.__linkLog.push(m); } catch {} };
    const push = (op, el) => log({ op, rel: el.rel || '', href: (el.getAttribute('href') || '').slice(0, 100), t: performance.now().toFixed(0) });
    const mo = new MutationObserver(muts => {
      for (const mu of muts) {
        mu.addedNodes.forEach(n => { if (n.tagName === 'LINK') push('add', n); if (n.querySelectorAll) n.querySelectorAll('link').forEach(c => push('add-in', c)); });
        mu.removedNodes.forEach(n => { if (n.tagName === 'LINK') push('rm', n); if (n.querySelectorAll) n.querySelectorAll('link').forEach(c => push('rm-in', c)); });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', () => window.__linkLog.push({ op: 'window-load', t: performance.now().toFixed(0) }));
  });
  await page.goto(base + '/#' + hash, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await sleep(12000); // preload warnings fire ~3-5s after window load
  const state = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const pick = p => res.filter(e => e.name.includes(p)).map(e => ({ initiator: e.initiatorType, transfer: e.transferSize, delivery: e.deliveryType }));
    return {
      dataView: document.querySelector('main')?.getAttribute('data-view'),
      heroImgInDom: !!document.querySelector('img.hero-photo'),
      fontFetches: pick('InterVariable'),
      heroFetches: pick('hero-graphite'),
      fontPreloadCopies: [...document.querySelectorAll('link[rel="preload"][href*="InterVariable"]')].length,
      fontCheck: document.fonts.check('16px "Inter Aflivra"'),
      swControlled: !!navigator.serviceWorker?.controller,
      linkLog: (window.__linkLog || []).filter(l => /InterVariable|hero-graphite/.test(l.href || '')),
    };
  });
  report.runs.push({ name, hash, state, logEntries: logEntries.filter(e => /preload/i.test(e.text)), allLog: logEntries.slice(0, 30), console: consoleMsgs });
  await ctx.close();
};

// Two loads in ONE context/tab sequence: plain load, then a reload — mimics real browsing
// where console preserve-log shows one warning per load.
await probe('view=domain&id=transport', 'deeplink');
await browser.close();
writeFileSync(outPrefix + '.json', JSON.stringify(report, null, 1));
const r = report.runs[0];
console.log('== ' + label + ' ' + r.name + ' ==');
console.log('fontPreloadCopies:', r.state.fontPreloadCopies, 'fontFetches:', JSON.stringify(r.state.fontFetches), 'heroFetches:', JSON.stringify(r.state.heroFetches), 'heroImg:', r.state.heroImgInDom, 'sw:', r.state.swControlled);
console.log('head link mutations for font/hero:', JSON.stringify(r.state.linkLog));
console.log('CDP log entries w/ preload:', JSON.stringify(r.logEntries, null, 1));
console.log('CDP log entries total:', r.allLog.length);
