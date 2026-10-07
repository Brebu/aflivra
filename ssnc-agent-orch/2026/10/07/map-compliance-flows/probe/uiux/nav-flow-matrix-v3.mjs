// Navigation flow-matrix audit — map-compliance-flows, UI/UX wave. (v2 — measurement fixes)
//   node ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/nav-flow-matrix.mjs
//
// v2 changes after the first pass:
//   - installMonitor runs in EVERY leg (dialog legs previously crashed on a missing monitor).
//   - matrix menu leg measures item coordinates after the sheet's entry animation settles
//     (~700ms) and CLOSES the sheet afterwards, so the following entry's first cell is not
//     polluted by a still-open sheet (this poisoned every "→ home" cell in pass 1).
//   - raw clicks are recorded per attempt (first 3) so hit targets are auditable.
//   - an "early tap" menu variant documents the real-user fast-tap hazard: within the sheet's
//     500ms slide-in, a tap at the item's REST position hits the backdrop and dismisses.
//   - desktop gains the brand→home target.
// Legs (both viewports: 390×844 mobile emulation + 1280×800 desktop):
//   M/D — entry states × nav targets: presses, latency, click registration, nav cover.
//   MENU — menu sheet: settled-item tap navigates + closes; fast early tap at rest position.
//   BACK — hash-router browser-back semantics, then one more press.
//   DIALOG — post-dialog drop: prefs sheet, menu sheet, place lightbox, watch purge, legal
//       act reader, cinema film dialog — close (esc/×/backdrop/button) → ONE immediate nav
//       press + the deterministic interception window at the nav coordinates.
//   CPU — 4× CPU-throttled latencies.
// Zero external fetches: everything not from the dev server is aborted in the browser.
import {chromium} from '@playwright/test';

const base = 'http://127.0.0.1:5173';
const outDir = new URL('.', import.meta.url).pathname;
const results = {meta: {startedAt: new Date().toISOString(), version: 3}, matrix: [], dialogLegs: [], backLegs: [], coverChecks: [], cpuLegs: [], notes: []};
const log = (...a) => console.log(...a);

const MOBILE = {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true};
const DESKTOP = {viewport: {width: 1280, height: 800}};
const VIEWPORTS = {mobile: MOBILE, desktop: DESKTOP};

const ENTRIES = [
  {id: 'home', hash: '#view=home', settleView: 'home'},
  {id: 'dashboard', hash: '#view=dashboard', settleView: 'dashboard'},
  {id: 'map', hash: '#view=map', settleView: 'map'},
  {id: 'deep domain tab', hash: '#view=domain&id=justitie&tab=legal', settleView: 'domain'},
  {id: 'place profile', hash: '#view=place&id=peles', settleView: 'place'},
  {id: 'watch center', hash: '#view=watch', settleView: 'watch'},
  {id: 'saved', hash: '#view=saved', settleView: 'saved'},
];
const MOBILE_TARGETS = [
  {id: 'home', label: 'Descoperă'}, {id: 'dashboard', label: 'Dashboard'}, {id: 'map', label: 'Hartă'},
  {id: 'compare', label: 'Compară'}, {id: 'watch', label: 'Urmărite'}, {id: 'saved', label: 'Salvate'},
];
const HEADER_TARGETS = [
  {id: 'home', label: 'Descoperă'}, {id: 'dashboard', label: 'Dashboard'}, {id: 'map', label: 'Hartă'},
  {id: 'compare', label: 'Compară'}, {id: 'home', label: 'Descoperă', brand: true},
];

const now = () => new Date().toISOString();
const watchList = () => ({
  watches: [{id: 'w-dosar-x', kind: 'dosar', ref: '6236/111/2017', label: 'Dosar 6236/111/2017', createdAt: now(), muted: false, lastEventAt: null, unseenCount: 1}],
  sweepState: {runsPerDay: 3, timesUtc: '04:28, 10:28, 16:28', lastRunAt: now(), lastEvents: 0, lastPushes: 0, lastOk: true, note: 'probe'},
  notification: {vapidPublicKey: null}, kinds: ['dosar', 'firma', 'localitate', 'act', 'venue', 'meteo'],
});
const actSummary = {id: 'law-' + 'ab'.repeat(32), title: 'CODUL CIVIL din 17 iulie 2009', type: 'Lege', number: '71/2011', date: '2009-07-17', issuer: 'Parlamentul României', publication: 'Monitorul Oficial', sourceUrl: 'https://legislatie.just.ro/Public/DetaliiDocument/123'};
const lawSource = full => ({key: 'law:verified-copy', name: 'Portal Legislativ · căutare', url: 'https://legislatie.just.ro', adapterVersion: 'law.soap.v2', status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600, data: {items: [full ? {...actSummary, text: 'Art. 1\n(1) Legea civilă.', textProvided: true} : actSummary], hasMore: false, pageSize: 1}});
const cinemaSource = () => ({
  key: 'cinema:probe', name: 'Cinema · program', url: 'https://cinema.example', adapterVersion: 'probe.v1', status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
  data: {
    cinema: {externalCode: 'cin-probe', name: 'Cinema Probe', latitude: 44.43, longitude: 26.1, address: {address1: 'Str. Probei 1', city: 'București'}},
    filmCount: 1, eventCount: 1, date: 'today',
    films: [{id: 'film-1', title: 'Filmul probei', length: 100, releaseYear: 2024, attributeIds: [], posterLink: '', url: 'https://cinema.example/film-1', media: [], shows: [{id: 's1', eventDateTime: todayAt(20, 0), auditorium: 'Sala 1', soldOut: false, languages: {}}]}],
  },
});
function todayAt(h, m) {const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString().slice(0, 16);}

async function blockExternal(context) {
  await context.route('**/*', route => {
    if (route.request().url().startsWith(base)) return route.fallback();
    return route.abort();
  });
}
async function installFixtures(page) {
  await page.route(/\/api\/watch/, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/watch' && route.request().method() === 'GET') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(watchList())});
    if (url.pathname === '/api/watch-events') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({events: [{id: 'evt-1', kind: 'dosar', ref: '6236/111/2017', title: 'Termen nou', body: 'Ședință programată.', url: '', createdAt: now(), seen: false}], hasMore: false})});
    if (url.pathname === '/api/watch-events/ack') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({acked: 1})});
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})});
  });
  await page.route('**/api/legal*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(lawSource(route.request().method() === 'POST' && route.request().postDataJSON()?.full))}));
  await page.route('**/api/cinema*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(cinemaSource())}));
}

async function waitForClientReady(page) {
  await page.waitForFunction(() => localStorage.getItem('reper.v2.preferences') !== null, null, {timeout: 30_000});
}
async function waitForView(page, view, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view')) === view) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

async function installMonitor(page, kind) {
  await page.evaluate(k => {
    const w = window;
    if (w.__probeKind === k) return;
    w.__probe = {clicks: [], viewFlips: [], barFlips: [], headerFlips: []};
    document.addEventListener('click', e => {
      const btn = e.target instanceof Element && e.target.closest('.vbottom-nav button, header nav[aria-label="Navigare principală"] button');
      if (e.target instanceof Element) w.__probe.clicks.push({t: performance.now(), tag: e.target.tagName, txt: (e.target.textContent || '').trim().slice(0, 16), label: (btn?.textContent || '').trim().slice(0, 24), onBtn: !!btn, x: e.clientX, y: e.clientY});
    }, {capture: true, passive: true});
    const main = document.getElementById('vcontent');
    let lastView = main?.getAttribute('data-view');
    new MutationObserver(() => {const v = main.getAttribute('data-view'); if (v !== lastView) {lastView = v; w.__probe.viewFlips.push({t: performance.now(), v});}}).observe(main, {attributes: true, attributeFilter: ['data-view']});
    for (const btn of document.querySelectorAll('.vbottom-nav button')) {
      let last = btn.className;
      new MutationObserver(() => {if (btn.className !== last && btn.className.includes('active')) {last = btn.className; w.__probe.barFlips.push({t: performance.now(), label: btn.textContent.trim()});}}).observe(btn, {attributes: true, attributeFilter: ['class']});
    }
    for (const btn of document.querySelectorAll('header nav[aria-label="Navigare principală"] button')) {
      let lastAria = btn.getAttribute('aria-current');
      new MutationObserver(() => {const a = btn.getAttribute('aria-current'); if (a !== lastAria && a === 'page') {lastAria = a; w.__probe.headerFlips.push({t: performance.now(), label: btn.textContent.trim()});}}).observe(btn, {attributes: true, attributeFilter: ['aria-current']});
    }
    w.__probeKind = k;
  }, kind);
}
const readProbe = page => page.evaluate(() => window.__probe);
const resetProbe = async page => {await page.evaluate(() => {const p = window.__probe; if (!p) throw new Error('monitor missing'); p.clicks = []; p.viewFlips = []; p.barFlips = []; p.headerFlips = [];});};

async function navGeometry(page, kind) {
  return page.evaluate(sk => {
    if (sk === 'mobile') {
      const nav = document.querySelector('.vbottom-nav');
      if (!nav) return null;
      return {kind: sk, buttons: [...nav.querySelectorAll('button')].map(b => {const r = b.getBoundingClientRect(); return {label: b.textContent.trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};})};
    }
    const nav = document.querySelector('header nav[aria-label="Navigare principală"]');
    if (!nav) return null;
    return {kind: sk, buttons: [...nav.querySelectorAll('button')].map(b => {const r = b.getBoundingClientRect(); return {label: b.textContent.trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};}), brand: (() => {const b = document.querySelector('header button[aria-label="Aflivra acasă"]'); if (!b) return null; const r = b.getBoundingClientRect(); return {label: 'Aflivra acasă', x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};})()};
  }, kind);
}

async function attemptNav(page, kind, geometry, target, entryView) {
  const isMobile = kind === 'mobile';
  const btn = !isMobile && target.id === 'home' && target.brand ? geometry.brand : geometry.buttons.find(b => b.label.startsWith(target.label));
  if (!btn) return {target: target.id, error: 'button not found', presses: 0, activated: false};
  await resetProbe(page);
  const beforeView = await page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view'));
  const alreadyThere = beforeView === target.id;
  let presses = 0, viewEq = alreadyThere;
  for (let press = 1; press <= 3 && !viewEq; press++) {
    presses = press;
    if (isMobile) await page.touchscreen.tap(btn.x, btn.y); else await page.mouse.click(btn.x, btn.y);
    viewEq = await waitForView(page, target.id, 4500);
  }
  const probe = await readProbe(page);
  const firstClick = probe.clicks[0];
  const clickOnButton = probe.clicks.some(c => c.onBtn && c.label.startsWith(target.label.slice(0, 6)));
  const viewFlip = probe.viewFlips.find(f => f.v === target.id);
  const barFlip = probe.barFlips.find(f => f.label === target.label);
  const headerFlip = probe.headerFlips.find(f => f.label === target.label);
  const toMs = (a, b) => Math.round(a - b);
  return {
    entry: entryView, target: target.id,
    presses: viewEq ? presses : `FAILED-after-${presses}`,
    activated: viewEq, alreadyThere, clickOnButton,
    rawClicks: probe.clicks.slice(0, 3),
    viewFlipMs: viewFlip && firstClick ? toMs(viewFlip.t, firstClick.t) : null,
    barFlipMs: barFlip && firstClick ? toMs(barFlip.t, firstClick.t) : null,
    headerFlipMs: headerFlip && firstClick ? toMs(headerFlip.t, firstClick.t) : null,
    hash: await page.evaluate(() => location.hash),
  };
}

async function bringUpEntry(page, entry, kind) {
  await page.goto(base + '/' + entry.hash);
  await installMonitor(page, kind);
  await waitForClientReady(page);
  const ok = await waitForView(page, entry.settleView, 20_000);
  if (!ok) throw new Error('entry view did not settle: ' + entry.id + ' → ' + entry.settleView);
  await page.waitForTimeout(200);
}

async function matrixLeg(browser, kind) {
  const context = await browser.newContext({...VIEWPORTS[kind], locale: 'ro-RO'});
  await blockExternal(context);
  const page = await context.newPage();
  await installFixtures(page);
  log(`\n== MATRIX ${kind.toUpperCase()} ==`);
  for (const entry of ENTRIES) {
    await bringUpEntry(page, entry, kind);
    const geo = await navGeometry(page, kind);
    if (!geo) {results.notes.push(`${kind}/${entry.id}: nav bar missing`); continue;}
    const cover = await page.evaluate(g => g.buttons.map(b => {
      const el = document.elementFromPoint(b.x, b.y);
      const hit = el ? el.closest('.vbottom-nav button, header nav button') : null;
      return {label: b.label, x: b.x, y: b.y, inBtn: !!hit, hit: hit ? hit.textContent.trim().slice(0, 20) : (el?.tagName + '.' + (el?.className || '').toString().slice(0, 30))};
    }), geo);
    results.coverChecks.push({viewport: kind, entry: entry.id, cover});
    const targets = kind === 'mobile' ? MOBILE_TARGETS : HEADER_TARGETS;
    for (const target of targets) {
      if (entry.id === target.id && !(kind === 'desktop' && target.brand)) {
        await bringUpEntry(page, entry, kind);
        const geoSame = await navGeometry(page, kind);
        const r = await attemptNav(page, kind, geoSame, target, entry.id);
        results.matrix.push({viewport: kind, entry: entry.id, target: target.id, sameState: true, presses: 1, activated: r.activated, clickOnButton: r.clickOnButton, note: 'already on view — press keeps state'});
        log(`${kind} ${entry.id} → ${target.id} (same-state): activated=${r.activated} click=${r.clickOnButton}`);
        if (!r.activated || !r.clickOnButton) await page.screenshot({path: outDir + `matrix-${kind}-${entry.id}-${target.id}-samestate-broken.png`});
        continue;
      }
      await bringUpEntry(page, entry, kind);
      const geoT = await navGeometry(page, kind);
      const r = await attemptNav(page, kind, geoT, target, entry.id);
      results.matrix.push({viewport: kind, entry: entry.id, target: target.id + (target.brand ? ' (brand)' : ''), sameState: false, presses: r.presses, activated: r.activated, clickOnButton: r.clickOnButton, rawClicks: r.rawClicks, viewFlipMs: r.viewFlipMs, barFlipMs: r.barFlipMs, headerFlipMs: r.headerFlipMs, hash: r.hash});
      log(`${kind} ${entry.id} → ${target.id}${target.brand ? '(brand)' : ''}: presses=${r.presses} activated=${r.activated} click=${r.clickOnButton} viewFlip=${r.viewFlipMs ?? '—'}ms ${r.rawClicks?.[0] ? 'firstClick=' + r.rawClicks[0].tag + '/' + (r.rawClicks[0].onBtn ? 'btn' : 'NOTbtn') : 'NO-CLICK'}`);
      if (!r.activated || (typeof r.presses === 'string')) await page.screenshot({path: outDir + `matrix-${kind}-${entry.id.replace(/ /g, '-')}-${target.id}${target.brand ? '-brand' : ''}-failed.png`});
    }
    if (kind === 'mobile') {
      // (a) settled-cadence item tap: open menu, wait out the slide-in, press Dashboard once.
      await bringUpEntry(page, entry, kind);
      const menuPt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Deschide meniul"]'); if (!b) throw new Error('menu button missing'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
      await page.touchscreen.tap(menuPt.x, menuPt.y);
      await page.waitForSelector('.menu-sheet', {timeout: 10_000});
      await page.waitForTimeout(700); // entry animation duration-500 + margin
      await resetProbe(page);
      const item = await page.evaluate(() => {const items = [...document.querySelectorAll('.menu-sheet [data-slot=button]')]; const dash = items.find(i => i.textContent.includes('Dashboard')); const r = dash.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
      await page.touchscreen.tap(item.x, item.y);
      const activated = await waitForView(page, 'dashboard', 5000);
      const sheetGone = await page.waitForSelector('.menu-sheet', {state: 'detached', timeout: 5000}).then(() => true).catch(() => false);
      results.matrix.push({viewport: kind, entry: entry.id, target: 'menu-sheet Dashboard (settled)', presses: activated ? 1 : 'FAILED', activated, sheetClosed: sheetGone});
      log(`mobile ${entry.id} → menu-sheet Dashboard (settled): activated=${activated} sheetClosed=${sheetGone}`);
      if (!activated || !sheetGone) await page.screenshot({path: outDir + `menu-${entry.id.replace(/ /g, '-')}-settled-broken.png`});
      // (b) fast-tap hazard: open menu, immediately press the item's REST position (where the
      // user sees it going) — during the slide-in the backdrop owns part of that area.
      await bringUpEntry(page, entry, kind);
      await page.touchscreen.tap(menuPt.x, menuPt.y);
      await page.waitForSelector('.menu-sheet', {timeout: 10_000});
      const restItem = await page.evaluate(() => {const sheet = document.querySelector('.menu-sheet'); if (!sheet) return null; const items = [...sheet.querySelectorAll('[data-slot=button]')]; const dash = items.find(i => i.textContent.includes('Dashboard')); if (!dash) return null; const sr = sheet.getBoundingClientRect(); const r = dash.getBoundingClientRect(); return {x: Math.abs(Math.round(r.left + r.width / 2 - (sr.width * 0 + 0))) || 0, rest: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), l: Math.round(r.left)};});
      if (restItem) {
        const tapX = 215; // the item's settled centre on a 390px sheet (measured: 67..363)
        await page.touchscreen.tap(tapX, restItem.y);
        await page.waitForTimeout(900);
        const fastState = await page.evaluate(() => ({view: document.getElementById('vcontent')?.getAttribute('data-view'), sheet: !!document.querySelector('.menu-sheet')}));
        results.matrix.push({viewport: kind, entry: entry.id, target: 'menu-sheet Dashboard (fast tap at rest position during slide-in)', presses: fastState.view === 'dashboard' ? 1 : 'dismissed-or-missed', activated: fastState.view === 'dashboard', sheetClosed: !fastState.sheet, note: 'tap issued ~60ms after open; item measured at l=' + restItem.l});
        log(`mobile ${entry.id} menu FAST tap: view=${fastState.view} sheetOpen=${fastState.sheet} (item measured l=${restItem.l}, tapped rest x=215)`);
        await page.screenshot({path: outDir + `menu-${entry.id.replace(/ /g, '-')}-fasttap.png`});
      }
      // ensure the sheet is closed before leaving this entry (protect the next entry's cells)
      const stillOpen = await page.evaluate(() => !!document.querySelector('.menu-sheet'));
      if (stillOpen) {
        await page.keyboard.press('Escape');
        await page.waitForSelector('.menu-sheet', {state: 'detached', timeout: 5000}).catch(() => {});
      }
    }
  }
  await context.close();
}

async function backLeg(browser, kind) {
  const context = await browser.newContext({...VIEWPORTS[kind], locale: 'ro-RO'});
  await blockExternal(context);
  const page = await context.newPage();
  await installFixtures(page);
  const isMobile = kind === 'mobile';
  log(`\n== BACK ${kind.toUpperCase()} ==`);
  const target = {id: 'dashboard', label: 'Dashboard'};
  await bringUpEntry(page, ENTRIES[0], kind);
  const geo = await navGeometry(page, kind);
  const btn = geo.buttons.find(b => b.label.startsWith(target.label));
  if (isMobile) await page.touchscreen.tap(btn.x, btn.y); else await page.mouse.click(btn.x, btn.y);
  await waitForView(page, 'dashboard', 5000);
  await page.goBack();
  const backHome = await waitForView(page, 'home', 5000);
  const backHash = await page.evaluate(() => location.hash);
  const geo2 = await navGeometry(page, kind);
  const btn2 = geo2.buttons.find(b => b.label.startsWith(target.label));
  await resetProbe(page);
  if (isMobile) await page.touchscreen.tap(btn2.x, btn2.y); else await page.mouse.click(btn2.x, btn2.y);
  const reactivated = await waitForView(page, 'dashboard', 5000);
  results.backLegs.push({viewport: kind, flow: 'home → Dashboard → back → Dashboard-press', backLandedHome: backHome, backHash, backThenPressActivated: reactivated, presses: reactivated ? 1 : 'FAILED'});
  log(`back ${kind}: backLandedHome=${backHome} hash=${backHash} reActivated=${reactivated}`);
  await page.goto(base + '/#view=domain&id=justitie&tab=legal');
  await installMonitor(page, kind);
  await waitForView(page, 'domain', 20_000);
  await page.goBack();
  const backDeep = await waitForView(page, 'home', 5000);
  const geo3 = await navGeometry(page, kind);
  const btn3 = geo3.buttons.find(b => b.label.startsWith(target.label));
  const deepReactivate = await (async () => {await resetProbe(page); if (isMobile) await page.touchscreen.tap(btn3.x, btn3.y); else await page.mouse.click(btn3.x, btn3.y); return waitForView(page, 'dashboard', 5000);})();
  results.backLegs.push({viewport: kind, flow: 'home → deep domain → back → Dashboard-press', backLandedHome: backDeep, backThenPressActivated: deepReactivate, presses: deepReactivate ? 1 : 'FAILED'});
  log(`back ${kind} deep: backLandedHome=${backDeep} reActivated=${deepReactivate}`);
  await context.close();
}

async function interceptionWindow(page, navPt) {
  return page.evaluate(pt => new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    const tick = () => {
      const el = document.elementFromPoint(pt.x, pt.y);
      const hitBtn = !!(el && el.closest && (el.closest('.vbottom-nav button') || el.closest('header nav button')));
      const overlay = !!document.querySelector('[data-slot=dialog-overlay], [data-slot=sheet-overlay]');
      const closedContent = !!document.querySelector('[data-slot=dialog-content][data-state=closed], [data-slot=sheet-content][data-state=closed]');
      const overflow = document.body.style.overflow || '(auto)';
      samples.push({dt: Math.round(performance.now() - start), hitBtn, overlay, closedContent, overflow, tag: el?.tagName || ''});
      if (performance.now() - start > 1600 || (!overlay && !closedContent && hitBtn && samples.length > 2)) {
        resolve({
          unblockMs: (samples.find(s => s.hitBtn) || {}).dt ?? null,
          overlayGoneMs: (samples.find(s => s.dt > 0 && !s.overlay && !s.closedContent) || {}).dt ?? null,
          overflowRestoredMs: (samples.find(s => s.dt > 0 && s.overflow === '(auto)') || {}).dt ?? null,
          series: samples.map(s => s.dt + (s.hitBtn ? ':btn' : ':' + s.tag) + (s.overlay ? '+ov' : '') + (s.closedContent ? '+cc' : '')).slice(0, 24),
        });
 return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }), navPt);
}

async function dialogueLeg(browser, kind, dialogName, run) {
  const context = await browser.newContext({...VIEWPORTS[kind], locale: 'ro-RO'});
  await blockExternal(context);
  const page = await context.newPage();
  await installFixtures(page);
  log(`\n== DIALOG ${kind.toUpperCase()} ${dialogName} ==`);
  const legs = await run(page);
  await context.close();
  return legs;
}

async function postDialogTaps(page, kind, open, closeActions) {
  const legs = [];
  for (const close of closeActions) {
    await open(page);
    await installMonitor(page, kind);
    const navPt = await navGeometry(page, kind);
    if (!navPt) throw new Error('nav missing after open: ' + close.dialog);
    const target = kind === 'mobile' ? navPt.buttons[1] : navPt.buttons.find(b => b.label.startsWith('Dashboard'));
    await resetProbe(page);
    await close.do(page);
    if (kind === 'mobile') await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
    const activated = await waitForView(page, 'dashboard', 5000);
    const probe = await readProbe(page);
    const clickOnButton = probe.clicks.some(c => c.onBtn && c.label.startsWith('Dashbo'));
    // deterministic window: reopen + close, sample elementFromPoint at the nav coordinates
    await open(page);
    await close.do(page);
    const navPt2 = await navGeometry(page, kind);
    const pt2 = kind === 'mobile' ? navPt2.buttons[1] : navPt2.buttons.find(b => b.label.startsWith('Dashboard'));
    const win = await interceptionWindow(page, pt2);
    await page.waitForSelector('[data-slot=sheet-content], [data-slot=dialog-content]', {state: 'detached', timeout: 6000}).catch(() => {});
    await page.waitForTimeout(150);
    legs.push({viewport: kind, dialog: close.dialog, closeVia: close.via, activated, clickOnButton, presses: activated ? 1 : 'dropped-or-2+', unblockMs: win.unblockMs, overlayGoneMs: win.overlayGoneMs, overflowRestoredMs: win.overflowRestoredMs, series: win.series});
    log(`${close.dialog} (${close.via}): activated1st=${activated} clickOnButton=${clickOnButton} unblock=${win.unblockMs}ms overlayGone=${win.overlayGoneMs}ms overflowRestored=${win.overflowRestoredMs}ms series=${win.series.slice(0, 8).join(' ')}`);
    if (!activated || !clickOnButton) await page.screenshot({path: outDir + `dialog-${kind}-${close.dialog}-${close.via}-dropped.png`});
  }
  return legs;
}

const closeBackdrop = {via: 'backdrop', do: async p => {await p.evaluate(() => {const x = Math.round(innerWidth / 2), y = Math.round(innerHeight * 0.08); const o = document.querySelector('[data-slot=sheet-overlay], [data-slot=dialog-overlay]'); const evs = ['pointerdown', 'pointerup', 'click']; const pt = {bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch'}; evs.forEach(k => o.dispatchEvent(new (k === 'click' ? MouseEvent : PointerEvent)(k, {...pt, ...(k === 'click' ? {} : {pointerType: 'touch'})})));});}};
const closeEsc = via => ({via, do: async p => {await p.keyboard.press('Escape');}});
const closeX = via => ({via, do: async p => {await p.locator('button[aria-label="Închide meniul"], button[aria-label="Închide fereastra"]').first().click({noWaitAfter: true});}});

const openMenuSheet = async page => {
  const pt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Deschide meniul"]'); if (!b) throw new Error('menu button missing'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
  await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('.menu-sheet', {timeout: 10_000});
};
const openPrefsSheet = async page => {
  const pt = await page.evaluate(() => {const b = document.querySelector('header button[aria-label="Pentru tine: localitate, interese și aspect"]'); if (!b) throw new Error('prefs button missing'); const r = b.getBoundingClientRect(); return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};});
  await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('.preferences-sheet', {timeout: 10_000});
};
const openLightbox = async page => {
  await page.goto(base + '/#view=place&id=peles');
  await waitForClientReady(page);
  await waitForView(page, 'place', 15_000);
  // Locator click: auto-retries through hydration, unlike a raw coordinate click.
  await page.getByRole('button', {name: /Deschide galeria/}).first().click({timeout: 15_000});
  await page.waitForSelector('.photo-dialog', {timeout: 15_000});
};
// openPurge: the 'Șterge-mi datele' button is disabled by design on an empty watch
// center (!rows.length && !events?.length — app/watch-center.tsx:93), so the purge
// dialog is not reachable in a fresh context. Leg registered as by-design-N/A.
const openPurge = null;
const openActReader = async page => {
  await page.goto(base + '/#view=domain&id=justitie&tab=legal');
  await waitForClientReady(page);
  await waitForView(page, 'domain', 20_000);
  await page.getByLabel('Titlul sau subiectul actului').fill('codul civil');
  await page.getByRole('button', {name: 'Caută acte normative'}).click();
  await page.waitForSelector('.law-result', {timeout: 30_000});
  await page.locator('.law-result').getByRole('button', {name: 'Citește actul'}).click();
  await page.waitForSelector('.reader-dialog', {timeout: 30_000});
};
const openFilmDialog = async page => {
  await page.goto(base + '/#view=domain&id=filme&tab=cinema');
  await waitForClientReady(page);
  await waitForView(page, 'domain', 20_000);
  await page.waitForSelector('.cinema-card', {timeout: 30_000});
  await page.locator('.cinema-card').first().getByRole('button', {name: /Detalii, trailer și toate proiecțiile/}).click();
  await page.waitForSelector('.reader-dialog', {timeout: 30_000});
};

async function dialogLegs(browser, kind) {
  const all = [];
  const run = async (name, fn) => {try {all.push(...await dialogueLeg(browser, kind, name, fn));} catch (e) {results.notes.push(`${kind} dialog leg ${name} errored: ${String(e).slice(0, 200)}`); log(`DIALOG ${name} ERRORED: ${String(e).slice(0, 200)}`);}};
  if (kind === 'mobile') {
    await run('menu-sheet', async page => {
      await page.goto(base + '/');
      await waitForClientReady(page);
      await waitForView(page, 'home', 10_000);
      return postDialogTaps(page, kind, openMenuSheet, [{dialog: 'menu-sheet', ...closeEsc('esc'), cleanup: closeEsc('esc').do}, {dialog: 'menu-sheet', ...closeBackdrop, cleanup: closeEsc('esc').do}]);
    });
    await run('prefs-sheet', async page => {
      await page.goto(base + '/');
      await waitForClientReady(page);
      await waitForView(page, 'home', 10_000);
      return postDialogTaps(page, kind, openPrefsSheet, [{dialog: 'prefs-sheet', ...closeEsc('esc'), cleanup: closeEsc('esc').do}, {dialog: 'prefs-sheet', ...closeX('x'), cleanup: closeEsc('esc').do}]);
    });
    await run('lightbox', async page => postDialogTaps(page, kind, openLightbox, [{dialog: 'lightbox', ...closeEsc('esc'), cleanup: closeEsc('esc').do}, {dialog: 'lightbox', ...closeX('x'), cleanup: closeEsc('esc').do}]));
    results.notes.push('purge dialog leg skipped: button disabled by design on an empty watch center (app/watch-center.tsx:93)');
    await run('act-reader', async page => postDialogTaps(page, kind, openActReader, [{dialog: 'act-reader', ...closeEsc('esc'), cleanup: closeEsc('esc').do}, {dialog: 'act-reader', ...closeX('x'), cleanup: closeEsc('esc').do}]));
    await run('cinema-film', async page => postDialogTaps(page, kind, openFilmDialog, [{dialog: 'cinema-film', ...closeEsc('esc'), cleanup: closeEsc('esc').do}]));
  } else {
    await run('prefs-sheet', async page => {
      await page.goto(base + '/');
      await waitForClientReady(page);
      await waitForView(page, 'home', 10_000);
      return postDialogTaps(page, kind, openPrefsSheet, [{dialog: 'prefs-sheet', ...closeEsc('esc'), cleanup: closeEsc('esc').do}, {dialog: 'prefs-sheet', ...closeX('x'), cleanup: closeEsc('esc').do}]);
    });
    await run('lightbox', async page => postDialogTaps(page, kind, openLightbox, [{dialog: 'lightbox', ...closeEsc('esc'), cleanup: closeEsc('esc').do}]));
    results.notes.push('purge dialog leg skipped: button disabled by design on an empty watch center (app/watch-center.tsx:93)');
  }
  results.dialogLegs.push(...all);
  return all;
}

async function cpuLeg(browser, kind) {
  const context = await browser.newContext({...VIEWPORTS[kind], locale: 'ro-RO'});
  await blockExternal(context);
  const page = await context.newPage();
  await installFixtures(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  const isMobile = kind === 'mobile';
  log(`\n== CPU4 ${kind.toUpperCase()} ==`);
  const legs = [];
  for (const flow of [{entry: ENTRIES[0], target: 'dashboard'}, {entry: ENTRIES[3], target: 'dashboard'}, {entry: ENTRIES[4], target: 'home'}]) {
    await bringUpEntry(page, flow.entry, kind);
    const geo = await navGeometry(page, kind);
    const targetObj = (isMobile ? MOBILE_TARGETS : HEADER_TARGETS).find(t => t.id === flow.target);
    const r = await attemptNav(page, kind, geo, targetObj, flow.entry.id);
    legs.push({viewport: kind, entry: flow.entry.id, target: flow.target, presses: r.presses, activated: r.activated, viewFlipMs: r.viewFlipMs, barFlipMs: r.barFlipMs, headerFlipMs: r.headerFlipMs});
    log(`cpu4 ${flow.entry.id} → ${flow.target}: presses=${r.presses} activated=${r.activated} viewFlip=${r.viewFlipMs ?? '—'} bar=${r.barFlipMs ?? '—'} header=${r.headerFlipMs ?? '—'}`);
  }
  results.cpuLegs.push(...legs);
  await context.close();
}

const browser = await chromium.launch();
try {
  await matrixLeg(browser, 'mobile');
  await matrixLeg(browser, 'desktop');
  await backLeg(browser, 'mobile');
  await backLeg(browser, 'desktop');
  for (const kind of ['mobile', 'desktop']) await dialogLegs(browser, kind);
  await cpuLeg(browser, 'mobile');
  await cpuLeg(browser, 'desktop');
} catch (error) {
  results.notes.push('probe error: ' + String(error));
  log('PROBE ERROR', error);
} finally {
  await browser.close();
  const {writeFileSync} = await import('node:fs');
  writeFileSync(outDir + 'nav-flow-matrix.json', JSON.stringify(results, null, 2));
  log('\n→ wrote ' + outDir + 'nav-flow-matrix.json');
  log('matrix cells:', results.matrix.length, '| dialog legs:', results.dialogLegs.length, '| notes:', results.notes.length);
}
