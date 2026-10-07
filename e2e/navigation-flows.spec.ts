import {test, expect, type Page} from '@playwright/test';

// Navigation & dialog-flow audit (map-compliance-flows, UI/UX wave). The reporter's symptom:
// moving between screens, opening dialogs and coming back — sometimes the same button needs
// pressing 2–3 times. The measured roots this file pins:
//   1. post-dialog first-tap drop — the exit-animated overlay/content keep pointer events for
//      ~160–180 ms after close (measured probe: unblock 160–182 ms, residue to ~325 ms), so the
//      first press at a nav button after closing a sheet/dialog is swallowed;
//   2. the sheet's 500 ms slide-in — a fast press at an item's rest position lands on the
//      backdrop while the content has not arrived and dismisses the sheet;
//   3. the mobile bottom nav marks the current view only with a class — no aria-current;
//   4. the skip link (href="#vcontent") rides the app's hash router: activating it from a deep
//      screen rewrote the hash and reset the routed view to home.
// Real mobile emulation for the tap legs (the bar is mobile-only CSS).
test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});

async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}
async function waitForView(page: Page, view: string, timeout = 12_000) {
  await expect.poll(() => page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? ''), {timeout}).toBe(view);
}
type BtnPt = {x: number; y: number; label: string};
async function barButtons(page: Page): Promise<BtnPt[]> {
  return page.evaluate(() => [...document.querySelectorAll('.vbottom-nav button')].map(b => {
    const r = b.getBoundingClientRect();
    return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: b.textContent.trim()};
  }));
}
// A raw single tap — no locator auto-wait: measures exactly what one real press does.
async function barTap(page: Page, btn: BtnPt) {
  await page.touchscreen.tap(btn.x, btn.y);
}
async function pressHeaderButton(page: Page, label: string) {
  const pt = await page.evaluate(l => {
    const nav = document.querySelector('header nav[aria-label="Navigare principală"]');
    const btn = [...(nav?.querySelectorAll('button') ?? [])].find(b => b.textContent.includes(l));
    if (!btn) throw new Error('header button missing: ' + l);
    const r = btn.getBoundingClientRect();
    return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};
  }, label);
  await page.mouse.click(pt.x, pt.y);
}

async function openPrefsSheet(page: Page) {
  await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
  await expect(page.locator('.preferences-sheet')).toBeVisible({timeout: 10_000});
}

test.describe('Fluxuri de navigare — o singură apăsare după închiderea unui dialog', () => {
  test('după Escape pe sheetul de preferințe, primul tap pe Dashboard navighează din prima', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.vbottom-nav button')).toHaveCount(6);
    await waitForClientReady(page);
    await waitForView(page, 'home');
    await openPrefsSheet(page);
    const dash = (await barButtons(page))[1];
    await page.keyboard.press('Escape');
    // The press a fast thumb issues right after the sheet closes: exactly one tap, no retry.
    await barTap(page, dash);
    await waitForView(page, 'dashboard');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');
  });

  test('după închidea galeriei de fotografii, primul tap pe bara de jos navighează din prima', async ({page}) => {
    await page.goto('/#view=place&id=peles');
    await waitForClientReady(page);
    await waitForView(page, 'place');
    await page.getByRole('button', {name: /Deschide galeria/}).first().click();
    await expect(page.locator('.photo-dialog')).toBeVisible({timeout: 10_000});
    const dash = (await barButtons(page))[1];
    // No toBeHidden wait here: the tap below is issued the way a fast thumb does it, while the
    // dialog is still fading out — waiting for hidden would absorb exactly the drop window.
    await page.keyboard.press('Escape');
    await barTap(page, dash);
    await waitForView(page, 'dashboard');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');
  });

  test('zona barei de jos nu este acoperită imediat după închiderea sheetului (elementFromPoint)', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await waitForView(page, 'home');
    await openPrefsSheet(page);
    await page.keyboard.press('Escape');
    // Structural contract: one frame after the close input, the hit at the nav coordinates must
    // resolve to the nav button — the exiting overlay must not hold pointer events.
    const hit = await page.evaluate(async () => {
      const btn = document.querySelectorAll('.vbottom-nav button')[1];
      const r = btn.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      await new Promise(requestAnimationFrame);
      const el = document.elementFromPoint(x, y);
      return {tag: el?.tagName ?? '', inBtn: !!el?.closest('.vbottom-nav button')};
    });
    expect(hit.inBtn, `one frame after close the nav button must own its point (hit: ${hit.tag})`).toBe(true);
  });
});

test.describe('Post-dialog — desktop (header)', () => {
  test.use({viewport: {width: 1280, height: 800}});
  test('după Escape pe sheetul de preferințe, primul click pe Dashboard din header navighează din prima', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await waitForView(page, 'home');
    await openPrefsSheet(page);
    await page.keyboard.press('Escape');
    await pressHeaderButton(page, 'Dashboard');
    await waitForView(page, 'dashboard');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');
  });
});

test.describe('Fluxuri de navigare — meniul mobil', () => {
  test('intrarea în sheet durează cel mult 300 ms (fereastra de tap grăbit se înjumătățește)', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await waitForView(page, 'home');
    await page.getByRole('button', {name: 'Deschide meniul'}).click();
    await expect(page.locator('.menu-sheet')).toBeVisible({timeout: 10_000});
    const duration = await page.evaluate(() => {
      const content = document.querySelector('[data-slot=sheet-content]');
      return content ? getComputedStyle(content).animationDuration : '';
    });
    // 0.5s was half a second of «the sheet has not arrived where I pressed».
    expect(parseFloat(duration), `animationDuration must be ≤ 0.3s, got ${duration}`).toBeLessThanOrEqual(0.3);
  });

  test('o apăsare pe Dashboard din meniu navighează și închide sheetul (regresie la schimbarea duratei)', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await waitForView(page, 'home');
    await page.getByRole('button', {name: 'Deschide meniul'}).click();
    await expect(page.locator('.menu-sheet')).toBeVisible({timeout: 10_000});
    await page.locator('.menu-sheet [data-slot=button]', {hasText: 'Dashboard'}).click();
    await waitForView(page, 'dashboard');
    await expect(page.locator('.menu-sheet')).toBeHidden();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');
  });
});

test.describe('Fluxuri de navigare — starea curentă și legătura de săritură', () => {
  test('bara de jos expune aria-current="page" pentru ecranul curent, ca headerul', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await waitForView(page, 'home');
    const states = await page.evaluate(() => [...document.querySelectorAll('.vbottom-nav button')].map(b => ({label: b.textContent.trim(), current: b.getAttribute('aria-current')})));
    expect(states.find(s => s.label.startsWith('Descoperă'))?.current).toBe('page');
    expect(states.filter(s => s.current === 'page')).toHaveLength(1);
    const dash = (await barButtons(page)).find(b => b.label.startsWith('Dashboard'))!;
    await barTap(page, dash);
    await waitForView(page, 'dashboard');
    await expect.poll(() => page.evaluate(() => document.querySelector('.vbottom-nav button')?.getAttribute('aria-current') ?? null)).toBe(null);
    const after = await page.evaluate(() => [...document.querySelectorAll('.vbottom-nav button')].map(b => ({label: b.textContent.trim(), current: b.getAttribute('aria-current')})));
    expect(after.find(s => s.label.startsWith('Dashboard'))?.current).toBe('page');
    // getAttribute returns null (never undefined) once React removes aria-current.
    expect(after.find(s => s.label.startsWith('Descoperă'))?.current).toBe(null);
  });

  test('legătura «Mergi la conținut» mută focusul fără a reseta ecranul curent (hash)', async ({page}) => {
    await page.goto('/#view=domain&id=justitie&tab=legal');
    await waitForClientReady(page);
    await waitForView(page, 'domain');
    await page.keyboard.press('Tab'); // first focusable: the skip link
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focused).toContain('Mergi la conținut');
    await page.keyboard.press('Enter');
    // The skip link must be a pure focus move: the routed view stays, the deep hash stays.
    await expect.poll(() => page.evaluate(() => document.getElementById('vcontent')?.getAttribute('data-view') ?? ''), {timeout: 6_000}).toBe('domain');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('#view=domain&id=justitie');
    const active = await page.evaluate(() => ({tag: document.activeElement?.tagName, id: document.activeElement?.id}));
    expect(active.id).toBe('vcontent');
  });
});

test.describe('Fluxuri de navigare — butonul înapoi al browserului', () => {
  test('din Dashboard, «înapoi» revine la home, iar următoarea apăsare pe bară navighează din prima', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await waitForView(page, 'home');
    const dash = (await barButtons(page)).find(b => b.label.startsWith('Dashboard'))!;
    await barTap(page, dash);
    await waitForView(page, 'dashboard');
    await page.goBack();
    await waitForView(page, 'home');
    // After a back landing, the same bar button still activates with a single press.
    const dash2 = (await barButtons(page)).find(b => b.label.startsWith('Dashboard'))!;
    await barTap(page, dash2);
    await waitForView(page, 'dashboard');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#view=dashboard');
  });
});
