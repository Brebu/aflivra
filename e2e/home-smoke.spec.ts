import {test, expect, type Page} from '@playwright/test';

// Freshness may settle on any of: fresh/cached → "Sursă verificată",
// stale seed fallback → "Ultima copie disponibilă", or "Indisponibil";
// asserting a specific one would be flaky by design — the valid set is the contract.
const validChips = new Set(['Sursă verificată', 'Ultima copie disponibilă', 'Indisponibil']);

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

test.describe('Home smoke', () => {
  test('home view renders with header nav, hero, PWA head links and valid live statuses', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'home');

    // Header navigation with the Romanian labels from app/page.tsx
    // (the Compară button carries the live selection count badge in its name).
    const nav = page.getByRole('navigation', {name: 'Navigare principală'});
    for (const label of ['Descoperă', 'Dashboard', 'Hartă']) {
      await expect(nav.getByRole('button', {name: label, exact: true})).toBeVisible();
    }
    await expect(nav.getByRole('button', {name: /^Compară( \d+)?$/})).toBeVisible();

    // Hero essentials.
    await expect(page.getByRole('heading', {level: 1, name: 'Ce ai nevoie să afli?'})).toBeVisible();
    await expect(page.getByLabel('Caută un loc, o firmă sau un subiect')).toBeVisible();

    // Pulse/dashboard essentials on the home wrap.
    await expect(page.locator('.pulse-row')).toBeVisible();
    await expect(page.locator('.pulse-row', {hasText: 'Curs de referință'})).toBeVisible();
    await expect(page.locator('.pulse-row', {hasText: 'Prognoză locală'})).toBeVisible();

    // PWA head wiring: manifest with cache-bust, apple-touch-icon, theme-color,
    // mobile-web-app-capable — the installability contract, not just markup presence.
    await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute('href', /\/manifest\.webmanifest\?v=/);
    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png$/);
    const themeColor = page.locator('head meta[name="theme-color"]');
    await expect(themeColor).toHaveCount(1);
    await expect(themeColor).toHaveAttribute('content', '#0071e3');
    // The legacy spelling may also be present; at least the modern directive must carry "yes".
    await expect(page.locator('head meta[name="mobile-web-app-capable"]').first()).toHaveAttribute('content', 'yes');

    // Live sections: the BNR and local-weather freshness chips must settle on a valid
    // terminal status (tolerant of fresh | cached | stale | unavailable, never "Se verifică").
    await expect(async () => {
      const chips = page.locator('.home-source-dates .live-freshness .source-chip');
      const count = await chips.count();
      expect(count).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < count; index++) {
        const text = ((await chips.nth(index).innerText()) || '').trim();
        expect(validChips.has(text), `unexpected freshness chip: "${text}"`).toBe(true);
      }
    }).toPass({timeout: 45_000});

    // The app must load without uncaught page errors.
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
