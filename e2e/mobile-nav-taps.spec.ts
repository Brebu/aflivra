import {test, expect, type Page} from '@playwright/test';

// Mobile bottom-nav taps: the reported symptom is that after switching into a category
// or another loaded view, the first tap(s) on the bottom bar appear ignored.
// Real mobile emulation for every leg in this file.
test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

const BAR_ITEMS = [
  {id: 'home', label: 'Descoperă'},
  {id: 'dashboard', label: 'Dashboard'},
  {id: 'map', label: 'Hartă'},
  {id: 'compare', label: 'Compară'},
  {id: 'saved', label: 'Salvate'},
];

async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

type BarGeometry = {navBottom: number; buttons: {id: string; cx: number; top: number; bottom: number}[]; lowBandY: number};

async function barGeometry(page: Page): Promise<BarGeometry> {
  return page.evaluate(() => {
    const nav = document.querySelector('.vbottom-nav');
    if (!nav) throw new Error('bottom nav missing');
    const navR = nav.getBoundingClientRect();
    const buttons = [...nav.querySelectorAll('button')].map((btn, i) => {
      const r = btn.getBoundingClientRect();
      return {id: ['home', 'dashboard', 'map', 'compare', 'saved'][i] ?? String(i), cx: Math.round(r.left + r.width / 2), top: Math.round(r.top), bottom: Math.round(r.bottom)};
    });
    return {navBottom: Math.round(navR.bottom), buttons, lowBandY: Math.round(navR.bottom - 5)};
  });
}

// Instruments capture-phase events + class/view flips with performance.now() stamps.
async function installMonitor(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__navMon = {clicks: [] as any[], active: [] as any[], view: [] as any[], activeBeforeView: null as any};
    document.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement)?.closest?.('.vbottom-nav button');
      if (btn || (e.target as HTMLElement)?.closest?.('.vbottom-nav')) {
        w.__navMon.clicks.push({t: performance.now(), btn: btn?.textContent?.trim() ?? null, inButton: !!btn});
      }
    }, {capture: true, passive: true});
    const nav = document.querySelector('.vbottom-nav');
    const main = document.getElementById('vcontent');
    if (nav && main) {
      for (const btn of nav.querySelectorAll('button')) {
        let last = btn.className;
        new MutationObserver(() => {
          if (btn.className !== last && btn.className.includes('active')) {
            last = btn.className;
            w.__navMon.active.push({t: performance.now(), btn: btn.textContent?.trim()});
            if (w.__navMon.activeBeforeView === null) w.__navMon.activeBeforeView = main.getAttribute('data-view');
          }
        }).observe(btn, {attributes: true, attributeFilter: ['class']});
      }
      let lastView = main.getAttribute('data-view');
      new MutationObserver(() => {
        const v = main.getAttribute('data-view');
        if (v !== lastView) {lastView = v; w.__navMon.view.push({t: performance.now(), v});}
      }).observe(main, {attributes: true, attributeFilter: ['data-view']});
    }
  });
}

async function readMonitor(page: Page) {
  return page.evaluate(() => (window as any).__navMon);
}

async function tap(page: Page, x: number, y: number) {
  await page.touchscreen.tap(x, y);
}

test.describe('Bara de jos — tap-urile de la mobil se înregistrează din prima', () => {
  test('fiecare buton acoperă toată înălțimea barei, inclusiv banda de safe-area (elementFromPoint)', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.vbottom-nav button')).toHaveCount(5);
    await waitForClientReady(page);
    const g = await barGeometry(page);

    // The band below the buttons (the nav's safe-area padding) must belong to each button:
    // a thumb landing there is the most common miss on a phone.
    const hits = await page.evaluate((y) => {
      return [...document.querySelectorAll('.vbottom-nav button')].map((btn) => {
        const r = btn.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, y);
        return {btn: btn.textContent?.trim(), hit: el ? (el as HTMLElement).closest?.('.vbottom-nav button')?.textContent?.trim() ?? el.tagName : null};
      });
    }, g.lowBandY);
    for (const h of hits) expect(h.hit, `low-band tap over "${h.btn}" must hit that button, hit: ${h.hit}`).toBe(h.btn);

    // And the button centres themselves, of course.
    for (const b of g.buttons) {
      const expected = BAR_ITEMS.find(i => i.id === b.id)?.label;
      const hit = await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return el ? (el as HTMLElement).closest?.('.vbottom-nav button')?.textContent?.trim() ?? el.tagName : null;
      }, {x: b.cx, y: Math.round((b.top + b.bottom) / 2)});
      expect(hit, `centre tap over "${expected}" must hit that button`).toBe(expected);
    }
  });

  test('după intrarea într-o categorie, primul tap pe bară primește feedback imediat și navighează', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.goto('/');
    await waitForClientReady(page);
    await installMonitor(page);

    // Enter a category (the reporter's flow), let it settle like a reader would.
    // touchscreen.tap does not auto-scroll: bring the card into the viewport first.
    const card = page.locator('.domain-card').nth(1);
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    await tap(page, box!.x + box!.width / 2, box!.y + box!.height / 2);
    // The card maps to its own view (domain/money/company depending on the category).
    await expect.poll(() => page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? ''), {timeout: 15_000}).not.toBe('home');
    const originView = await page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? '');

    // Phone-class main thread: the destination view commit is the expensive part.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 2});

    const g = await barGeometry(page);
    const dash = g.buttons.find(b => b.id === 'dashboard')!;
    await tap(page, dash.cx, Math.round((dash.top + dash.bottom) / 2));
    const before = await page.evaluate(() => performance.now());

    // Feedback contract: the pressed destination highlights on the bar long before the
    // heavy view commit lands. Under 2x throttle this is instant-commit territory.
    await expect.poll(async () => (await readMonitor(page)).active.some((a: any) => a.btn === 'Dashboard'), {timeout: 4_000})
      .toBe(true);
    const m = await readMonitor(page);
    const activeAt = m.active.find((a: any) => a.btn === 'Dashboard').t as number;
    expect(activeAt - before, `bar feedback gap after tap: ${Math.round(activeAt - before)}ms`).toBeLessThan(300);
    expect(m.clicks.filter((c: any) => c.inButton).length, 'tap must register as a click on the button').toBeGreaterThan(0);

    // The bar highlight must not wait for the heavy view: the dashboard view is still
    // the previous one at the moment the bar lights up.
    expect(m.activeBeforeView, 'active flips before data-view (deferred mount)').toBe(originView);

    // And the destination does arrive.
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'dashboard');
    await expect(page.locator('.dash-stats').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');

    // Screenshot of the bar at mobile (probe evidence for the report).
    await page.screenshot({path: 'test-results/mobile-nav-bar.png'});
    expect(pageErrors).toEqual([]);
  });

  test('periplul complet al barei: fiecare tap navighează, inclusiv cele testate la baza barei', async ({page}) => {
    await page.goto('/#view=domain&id=justitie');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    await installMonitor(page);
    const g = await barGeometry(page);

    // Tour the bar left to right at a user cadence; every tap must register on its button.
    for (const b of g.buttons) {
      await tap(page, b.cx, Math.round((b.top + b.bottom) / 2));
      await page.waitForTimeout(450);
    }
    let m = await readMonitor(page);
    expect(m.clicks.filter((c: any) => c.inButton).length, 'all five taps registered on buttons').toBe(5);

    // Tap targets deliberately at the base of the bar (safe-area band): these are the
    // taps the reporter describes as "ignored on the first tries".
    for (const b of [g.buttons[1], g.buttons[3]]) {
      await tap(page, b.cx, g.lowBandY);
      await expect.poll(() => page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? ''), {timeout: 10_000}).toBe(b.id);
    }
    m = await readMonitor(page);
    expect(m.clicks.filter((c: any) => !c.inButton).length, 'low-band taps must land on buttons, not the nav root').toBe(0);

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'compare');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=compare');
  });
});
