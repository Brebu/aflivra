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

// The suggestion chips need hydrated React handlers; the mount effect writes the
// preferences key, so a non-null read proves the client app is interactive.
async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
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

  test('home hero shows no inline provenance; the licenses panel keeps the hero credit', async ({page}) => {
    // The hero was decluttered by design: image, heading, subtitle, search and chips stay,
    // every attribution string and the provenance export widget were taken out of it.
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    const hero = page.locator('section.hero');
    await expect(hero).toBeVisible();
    for (const removed of ['ILUSTRAȚIE EDITORIALĂ', 'Fotografia originală', 'Proveniență și transformări', 'xulescu_g']) {
      await expect(hero).not.toContainText(removed);
    }
    // Attribution moves, it doesn't disappear: the CategoryDirectory footer still exports
    // "Surse și licențe", and the manifest behind that export carries the hero credit
    // (author, license, link to the original photograph on Wikimedia Commons).
    const footer = page.locator('.category-directory-footer');
    await expect(footer.getByRole('combobox', {name: 'Format pentru surse și licențe'})).toBeVisible();
    await expect(footer.getByRole('button', {name: 'Surse și licențe', exact: true})).toBeVisible();
    const response = await page.request.get('/media/category-manifest.json');
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as unknown as Record<string, string>[];
    const heroCredit = manifest.find(entry => entry.category === 'editorial-hero');
    expect(heroCredit?.credit).toContain('xulescu_g');
    expect(heroCredit?.license).toBe('CC BY-SA 2.0');
    expect(heroCredit?.sourceUrl).toContain('commons.wikimedia.org');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Hero suggestion chips route semantically', () => {
  test('the Castelul Peleș chip opens the place detail view directly', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.locator('.hero-suggestions').getByRole('button', {name: 'Castelul Peleș', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText('Castelul Peleș');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#view=place&id=peles');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the Monitorul Oficial RA chip opens the ANAF company view for CUI 427282', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.locator('.hero-suggestions').getByRole('button', {name: 'Monitorul Oficial RA', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'company');
    await expect(page.getByRole('heading', {level: 1, name: 'Verifică o firmă după CUI.'})).toBeVisible();
    // The CUI field is seeded from the routed entity id, regardless of live-data state.
    await expect(page.getByLabel('CUI firmă')).toHaveValue('427282');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#view=company&id=427282');
    // Entity-intent chips set no catalog query: the landed dataset search starts empty
    // (only typed free-text searches still seed it).
    await expect(page.getByLabel('Caută în catalogul național')).toHaveValue('');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the Brașov chip selects the city and opens the local domain', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.locator('.hero-suggestions').getByRole('button', {name: 'Brașov', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.getByRole('heading', {level: 1, name: 'Orașul tău'})).toBeVisible();
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#view=domain&id=local');
    // City-story semantics: the chip activates the Brașov locality context, like the city cards below.
    await expect(page.locator('.location-strip [role="status"]')).toContainText('Brașov');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
