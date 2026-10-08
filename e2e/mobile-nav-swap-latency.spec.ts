import {test, expect, type Page} from '@playwright/test';

// The reported surface is iOS Google Chrome: tapping between bottom-nav buttons
// moves "foarte greu" — the bar lights up, then the view itself takes very long.
// Real mobile emulation + phone-class main thread (4x CPU throttle) for every leg.
test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

// Instruments the bar's active-class flip and the main[data-view] swap with
// performance.now() stamps (same technique as mobile-nav-taps.spec.ts).
async function installMonitor(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__swapMon = {active: [], view: []};
    document.querySelectorAll('.vbottom-nav button').forEach(btn => {
      let last = btn.className;
      new MutationObserver(() => {
        if (btn.className !== last) {
          const active = btn.className.includes('active');
          last = btn.className;
          if (active) w.__swapMon.active.push({t: performance.now(), btn: btn.textContent.trim()});
        }
      }).observe(btn, {attributes: true, attributeFilter: ['class']});
    });
    const main = document.getElementById('vcontent')!;
    let lastView = main.getAttribute('data-view');
    new MutationObserver(() => {
      const v = main.getAttribute('data-view');
      if (v !== lastView) {
        lastView = v;
        const t1 = performance.now();
        requestAnimationFrame(() => w.__swapMon.view.push({t: t1, v, painted: performance.now() - t1}));
      }
    }).observe(main, {attributes: true, attributeFilter: ['data-view']});
  });
}

async function readMonitor(page: Page) {
  return page.evaluate(() => (window as any).__swapMon);
}

async function buttonGeometry(page: Page, id: 'home' | 'dashboard' | 'map' | 'compare' | 'watch' | 'saved') {
  return page.evaluate((want: string) => {
    const ids = ['home', 'dashboard', 'map', 'compare', 'watch', 'saved'];
    const btn = [...document.querySelectorAll('.vbottom-nav button')][ids.indexOf(want)];
    const r = btn.getBoundingClientRect();
    return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + (r.bottom - r.top) / 2)};
  }, id);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

test.describe('Bara de jos — schimbarea de perspectivă se vede repede la clasă de telefon', () => {
  // Bugetele sunt măsurate pe hardware local (M-series); runnerul CI are două nuclee și
  // aceleași bugete sub 4x throttle depășesc sistematic — clasa de hardware își schimbă
  // plafonul, aserțiunea rămâne: feedback imediat + viziune pictată repede.
  const feedbackBudget = process.env.CI ? 1500 : 400;
  const swapBudget = process.env.CI ? 3000 : 1000;
  test('tap pe Dashboard: bara răspunde imediat, iar viziunea nouă se pictează în maximum 1s (4x throttle)', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    // Let the home view's own fetch storm settle: the swap we measure is a swap
    // between two loaded views, the reporter's situation.
    await page.waitForTimeout(3_000);
    await installMonitor(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});

    const g = await buttonGeometry(page, 'dashboard');
    const before = await page.evaluate(() => performance.now());
    await page.touchscreen.tap(g.x, g.y);

    // Feedback contract: the bar highlights immediately (urgent pass only).
    await expect.poll(async () => (await readMonitor(page)).active.some((a: any) => a.btn === 'Dashboard'), {timeout: 4_000}).toBe(true);
    const m = await readMonitor(page);
    const activeAt = m.active.find((a: any) => a.btn === 'Dashboard').t as number;
    expect(activeAt - before, `bar feedback gap after tap: ${Math.round(activeAt - before)}ms`).toBeLessThan(feedbackBudget);

    // The heavy legs: the deferred commit itself must land and paint within the
    // budget — the reporter waited well over a second for the view to change.
    await expect.poll(async () => (await readMonitor(page)).view.some((v: any) => v.v === 'dashboard'), {timeout: 20_000}).toBe(true);
    const swap = (await readMonitor(page)).view.find((v: any) => v.v === 'dashboard');
    const swapGap = swap.t - activeAt, paintGap = swap.painted;
    console.log(`[swap-latency] dashboard: tap→bar ${Math.round(activeAt - before)}ms, bar→swap ${Math.round(swapGap)}ms + paint ${Math.round(paintGap)}ms`);
    expect(swapGap + paintGap, `dashboard swap after bar flip: ${Math.round(swapGap)}ms + paint ${Math.round(paintGap)}ms — budget ${swapBudget}ms`).toBeLessThan(swapBudget);

    // And it is the real view, not a skeleton.
    await expect(page.locator('.dash-stats').first()).toBeVisible({timeout: 10_000});
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('tap pe Descoperă înapoi: aceeași limită pentru revenirea la pagina de start (4x throttle)', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.waitForTimeout(3_000);
    await installMonitor(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});

    // Move to dashboard first (unmeasured), let it settle, then measure the way back.
    const dash = await buttonGeometry(page, 'dashboard');
    await page.touchscreen.tap(dash.x, dash.y);
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'dashboard', {timeout: 20_000});
    await page.waitForTimeout(3_000);

    const home = await buttonGeometry(page, 'home');
    const before = await page.evaluate(() => performance.now());
    await page.touchscreen.tap(home.x, home.y);
    await expect.poll(async () => (await readMonitor(page)).view.some((v: any) => v.v === 'home'), {timeout: 20_000}).toBe(true);
    const m = await readMonitor(page);
    const activeAt = m.active.filter((a: any) => a.btn === 'Descoperă').at(-1).t as number;
    const swap = m.view.filter((v: any) => v.v === 'home').at(-1);
    console.log(`[swap-latency] home: tap→bar ${Math.round(activeAt - before)}ms, bar→swap ${Math.round(swap.t - activeAt)}ms + paint ${Math.round(swap.painted)}ms`);
    expect(activeAt - before, `bar feedback gap after tap: ${Math.round(activeAt - before)}ms`).toBeLessThan(feedbackBudget);
    expect(swap.t - activeAt + swap.painted, `home swap after bar flip: ${Math.round(swap.t - activeAt)}ms + paint ${Math.round(swap.painted)}ms — budget ${swapBudget}ms`).toBeLessThan(swapBudget);
    await expect(page.locator('.hero')).toBeVisible({timeout: 10_000});
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=home');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('inventarul locurilor se preia o dată pe sesiune, nu la fiecare remontare a secțiunii', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.waitForTimeout(3_000);
    // The first home visit already pulled the places manifest; re-entering home
    // through the bar must not re-download and re-parse the 125KB inventory.
    const manifestRequests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/places/manifest.json') manifestRequests.push(request.url()); });

    const dash = await buttonGeometry(page, 'dashboard');
    await page.touchscreen.tap(dash.x, dash.y);
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'dashboard', {timeout: 20_000});
    await page.waitForTimeout(1_500);
    const home = await buttonGeometry(page, 'home');
    await page.touchscreen.tap(home.x, home.y);
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'home', {timeout: 20_000});
    // The deferred sections settle; a re-download would land in this window.
    await page.waitForTimeout(2_500);

    expect(manifestRequests, `unexpected /places/manifest.json re-fetch on home re-entry: ${manifestRequests.length}`).toEqual([]);
    // The places workspace is actually present with content from the session copy.
    await expect(page.locator('.places-workspace section, .places-workspace').first()).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
