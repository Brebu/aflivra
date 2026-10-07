// Systemic card audit — padding + elevation across the major surfaces (padding+shadows task).
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/uiux/card-audit.mjs [phase]
//
// For every CARD-class element on each major surface, measures:
//  - computed padding of the card itself
//  - text inset: min distance from the card border-box edge to any text-bearing descendant
//    (the honest rendered outcome — catches padding:0 cards whose wrapper provides it, and
//     wrapper-less cards whose text sits on the edge)
//  - computed box-shadow (elevation presence)
//  - verdict: FLUSH_TEXT (inset < 12px), NO_SHADDOW (no elevation), OK
// Surfaces: home, explore, dashboard, map, compare, watch, saved, place, domain reader,
// money, company, planner, recommendations — desktop 1280 + mobile 390.
// Zero external fetches: every non-dev-server route is aborted in the browser.
import {chromium} from '@playwright/test';

const phase = process.argv[2] ?? 'before';
const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;

const routes = [
  ['home', '#view=home'],
  ['explore', '#view=explore'],
  ['dashboard', '#view=dashboard'],
  ['map', '#view=map'],
  ['compare', '#view=compare'],
  ['watch', '#view=watch'],
  ['saved', '#view=saved'],
  ['place', '#view=place&id=peles'],
  ['domainStiri', '#view=domain&id=stiri'],
  ['domainLocal', '#view=domain&id=local&tab=servicii'],
  ['money', '#view=money'],
  ['company', '#view=company'],
  ['planner', '#view=planner'],
  ['recommendations', '#view=recommendations'],
];

const CARD_SELECTOR = [
  '.domain-card', '.place-card', '.news-card', '.live-resource', '.vpanel', '.vstat',
  '.insight-story', '.recommendation-card', '.city-story', '.story-card', '.cinema-card',
  '.transit-card', '.visit-card', '.entity-card', '.weather-card', '.currency-card',
  '.station-card', '.dataset-card', '.quick-card', '.company-card', '.compare-cards > *',
  '.record-list > article', '.locality-grid > article', '.weather-live-grid > article',
  '.watch-feed-section', '.feed-section', '.contacts-panel', '.court-history-panel',
  '.vcallout', '.snapshot-note', '.pulse-row > button', '.map-result', '.entity-row',
  '.live-freshness', '.reader-note', '.record-fields',
].join(',');

const browser = await chromium.launch();
const report = {phase, viewports: {}};

for (const [label, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844, isMobile: true, hasTouch: true}]]) {
  const context = await browser.newContext({viewport, deviceScaleFactor: 2});
  const page = await context.newPage();
  await page.route('**://*/**', route => {
    if (route.request().url().startsWith(base)) return route.continue();
    return route.abort();
  });
  const perView = {};
  for (const [view, hash] of routes) {
    await page.goto(base + '/' + hash, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('main#vcontent', {timeout: 60_000});
    await page.waitForTimeout(1800);
    const found = await page.evaluate(sel => {
      const els = Array.from(document.querySelectorAll(sel));
      const out = [];
      const cardRect = el => el.getBoundingClientRect();
      for (const el of els) {
        const cs = getComputedStyle(el);
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(c => /card|panel|vstat|story|resource|result|row|note|vcallout|freshness|record-fields|feed-section/i.test(c)).slice(0, 2).join(' ');
        if (!cls) continue;
        // Text insets: distance from card border-box to each text-bearing descendant's rect.
        // Clip-aware: rects intersected with every overflow/scroll ancestor between the text
        // and the card — scrolled-out table halves measure from the clip edge (what the eye
        // sees), fully-hidden rects drop out. Overflow past the card box is not surface.
        const rect = cardRect(el);
        const visibleRect = (host, r) => {
          let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
          let p = host.parentElement;
          while (p && p !== el) {
            // A closed <details> lays out its slot content (non-zero rects, content-visibility)
            // without painting it — measuring it as "flush" would false-flag hidden tables.
            if (p.tagName === 'DETAILS' && !p.open) return null;
            try { if (typeof p.checkVisibility === 'function' && !p.checkVisibility()) return null; } catch {}
            const pcs = getComputedStyle(p);
            if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') {
              const pr = p.getBoundingClientRect();
              left = Math.max(left, pr.left); top = Math.max(top, pr.top);
              right = Math.min(right, pr.right); bottom = Math.min(bottom, pr.bottom);
            }
            p = p.parentElement;
          }
          return right > left && bottom > top ? {left, top, right, bottom} : null;
        };
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node, minInset = Infinity;
        while ((node = walker.nextNode())) {
          const t = node.textContent;
          if (!t || !t.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            if (r.width < 2 || r.height < 2) continue;
            const v = visibleRect(node.parentElement, r);
            if (!v) continue;
            const inset = Math.min(v.left - rect.left, v.top - rect.top, rect.right - v.right, rect.bottom - v.bottom);
            if (inset >= 0) minInset = Math.min(minInset, inset);
          }
        }
        const imgTouches = Array.from(el.querySelectorAll('img')).some(img => {
          const r = img.getBoundingClientRect();
          return r.width > 40 && Math.min(r.left - rect.left, rect.right - r.right) < 2;
        });
        const visible = rect.width > 24 && rect.height > 24 && cs.display !== 'none' && cs.visibility !== 'hidden';
        if (!visible) continue;
        out.push({
          cls,
          padding: cs.padding.split(' ').map(p => parseFloat(p) || 0).join('/'),
          textInset: minInset === Infinity ? null : Math.round(minInset * 10) / 10,
          shadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 60),
          radius: cs.borderRadius.slice(0, 40),
          imgBleed: imgTouches,
          text: (el.textContent || '').trim().slice(0, 34),
        });
      }
      return out;
    }, CARD_SELECTOR);
    perView[view] = found;
  }
  report.viewports[label] = perView;
  await context.close();
}

await browser.close();

// Aggregate: dedup per (view, cls) — one representative row per class per surface.
const rows = [];
for (const [vp, views] of Object.entries(report.viewports)) {
  for (const [view, cards] of Object.entries(views)) {
    const byCls = new Map();
    for (const c of cards) {
      const k = view + '|' + c.cls;
      const prev = byCls.get(k);
      if (!prev || (prev.textInset ?? 99) > (c.textInset ?? 99)) byCls.set(k, c);
    }
    for (const c of byCls.values()) {
      const flush = c.textInset !== null && c.textInset < 12;
      const noShadow = c.shadow === 'none';
      rows.push({
        view, cls: c.cls, viewport: vp, padding: c.padding, textInset: c.textInset,
        shadow: c.shadow === 'none' ? 'none' : 'elevated', radius: c.radius, imgBleed: c.imgBleed,
        verdict: flush ? 'FLUSH_TEXT' : (noShadow ? 'no-elevation' : 'ok'),
      });
    }
  }
}
report.rows = rows;
const flags = rows.filter(r => r.verdict !== 'ok');
console.log(JSON.stringify({phase, totalClassSurfaces: rows.length, flagged: flags.length, flags}, null, 2));
await (await import('node:fs/promises')).writeFile(outDir + 'card-audit-' + phase + '.json', JSON.stringify(report, null, 2));
