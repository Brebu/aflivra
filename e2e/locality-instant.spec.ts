import {test, expect, type Page} from '@playwright/test';

// Freshness may settle on any of: fresh/cached → "Sursă verificată", stale seed
// fallback → "Ultima copie disponibilă", or "Indisponibil"; asserting a specific
// one would be flaky by design — the valid set is the contract.
const validChips = new Set(['Sursă verificată', 'Ultima copie disponibilă', 'Indisponibil']);

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

// SSR markup is visible before React attaches handlers; the mount effect writes the
// preferences key, so a non-null read proves the client app is interactive.
async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

// The Romanian count-agreement rule pinned by scripts/verify-ro-text.mjs: counts
// ending in digit 1 (except 11) take the singular without "de"; 0 and 2-19 take the
// plain plural; every other count takes "de" + plural.
function roCountKind(n: number): 'singular' | 'plain' | 'de' {
  const lastTwo = n % 100, unit = n % 10;
  return unit === 1 && lastTwo !== 11 ? 'singular' : n === 0 || (lastTwo >= 2 && lastTwo <= 19) ? 'plain' : 'de';
}

test.describe('Instant locality refresh', () => {
  test('applying a locality from the preferences sheet updates every visible locality surface without a reload', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    // A document reload would clear this marker.
    await page.evaluate(() => ((window as unknown as Record<string, string>).__localityProbe = 'alive'));

    const stripStatus = page.locator('.location-strip [role="status"]').first();
    await expect(stripStatus).toContainText('România · oraș implicit București');

    await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
    const cityField = page.getByLabel('Localitate', {exact: true});
    await expect(cityField).toBeVisible();
    await cityField.fill('Cluj-Napoca · Cluj');
    const apply = page.getByRole('button', {name: 'Aplică localitatea'});
    await expect(apply).toBeEnabled();

    // The locality stimulus rides the geo key: locality-scoped families re-fetch
    // immediately (their URLs carry the new coordinates/locality), while the national
    // bundle (/api/live) must not be re-requested for a locality change.
    const forecastForCluj = page.waitForRequest(/\/api\/weather\?lat=46\.77&lon=23\.59/, {timeout: 30_000}).catch(() => null);
    const liveCalls: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/live') liveCalls.push(request.url()); });

    await apply.click();
    await page.keyboard.press('Escape'); // close the sheet; the surfaces below are the subject

    // The visible label swaps instantly — pure context re-render, no fetch involved.
    await expect(stripStatus).toHaveText(/Cluj-Napoca\./, {timeout: 2_000});
    await expect(page.locator('button[title="Schimbă localitatea în preferințe"]')).toContainText('Cluj-Napoca');
    // A locality-dependent section re-renders synchronously (the geo radius copy flips).
    await expect(page.getByRole('heading', {level: 2, name: 'Obiective de vizitat în apropiere'})).toBeVisible();
    await expect(page.locator('.pulse-row', {hasText: 'Prognoză locală'})).toContainText('Cluj-Napoca');

    // Locality families re-key: the local forecast URL carries the new coordinates.
    expect(await forecastForCluj, 'the forecast family must re-fetch for the new locality').not.toBeNull();

    // The preferences key follows the applied locality; the location store keeps the manual choice.
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('reper.v2.preferences') || '{}').city), {timeout: 10_000}).toBe('Cluj-Napoca');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aflivra.location.v1') || '{}').mode), {timeout: 10_000}).toBe('manual');

    // No reload happened (marker survives, hash untouched by the sheet flow).
    expect(await page.evaluate(() => (window as unknown as Record<string, string>).__localityProbe)).toBe('alive');
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe('');

    // National sections do not hard-reset: the BNR pulse keeps rendering.
    await expect(page.locator('.pulse-row', {hasText: 'Curs de referință'})).toBeVisible();
    // Freshness chips settle on a terminal degrade state, tolerant of source status.
    await expect(async () => {
      const chips = page.locator('.home-source-dates .live-freshness .source-chip');
      const count = await chips.count();
      expect(count).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < count; index++) {
        const text = ((await chips.nth(index).innerText()) || '').trim();
        expect(validChips.has(text), `unexpected freshness chip: "${text}"`).toBe(true);
      }
    }).toPass({timeout: 45_000});
    // The national bundle was not re-requested for the locality change (the only
    // legitimate /api/live traffic is the 60s poll started at mount, well outside
    // this test's window).
    expect(liveCalls, `unexpected /api/live re-fetch on locality change: ${liveCalls.join(' | ')}`).toEqual([]);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Instant locality refresh (device geolocation)', () => {
  test.use({permissions: ['geolocation'], geolocation: {latitude: 45.7983, longitude: 24.1256, accuracy: 30}});
  test('a device geolocation fix scopes every surface without a manual step', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const stripStatus = page.locator('.location-strip [role="status"]').first();
    const forecastForSibiu = page.waitForRequest(/\/api\/weather\?lat=45\.80&lon=24\.13/, {timeout: 45_000}).catch(() => null);
    await page.goto('/');
    await expect(stripStatus).toContainText('Aproape de Sibiu');
    await expect(page.locator('.pulse-row', {hasText: 'Prognoză locală'})).toContainText('Aproape de Sibiu');
    expect(await forecastForSibiu, 'the forecast family must be scoped to the device position').not.toBeNull();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aflivra.location.v1') || '{}').mode), {timeout: 10_000}).toBe('device');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Company-intent search coherence (Advocate R1)', () => {
  test('a company-intent query renders the company card without the empty state; a no-match query keeps the explanatory empty state', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByLabel('Caută un loc, o firmă sau un subiect').fill('monitorul');
    await page.locator('form.hero-search').getByRole('button', {name: 'Explorează', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    // The query matches the company card, so the card renders and the generic empty
    // state must not render alongside it.
    await expect(page.locator('.company-result')).toBeVisible();
    await expect(page.locator('.company-result')).toContainText('Monitorul Oficial RA');
    await expect(page.locator('.vempty')).toHaveCount(0);

    // A genuinely unmatched query keeps the explanatory empty state.
    await page.getByLabel('Caută în locuri și domenii').fill('zzqxv');
    await page.locator('form.explore-search').getByRole('button', {name: 'Caută', exact: true}).click();
    await expect(page.getByRole('heading', {level: 2, name: 'Niciun rezultat în selecția editorială'})).toBeVisible();
    await expect(page.locator('.company-result')).toHaveCount(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Romanian count agreement on the wave-2 sites', () => {
  test('the explore gallery count at a single result reads "1 loc"', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByLabel('Caută un loc, o firmă sau un subiect').fill('Salina Turda');
    await page.locator('form.hero-search').getByRole('button', {name: 'Explorează', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await expect(page.locator('.exploration-gallery .place-card')).toHaveCount(1);
    await expect(page.locator('.exploration-gallery .small-muted').first()).toHaveText(/^1 loc$/);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the saved collection count at one item reads "1 element salvat"', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByLabel('Caută un loc, o firmă sau un subiect').fill('Salina Turda');
    await page.locator('form.hero-search').getByRole('button', {name: 'Explorează', exact: true}).click();
    await expect(page.locator('.exploration-gallery .place-card')).toHaveCount(1);
    await page.locator('.exploration-gallery .place-card button[aria-label="Salvează Salina Turda"]').click();
    await expect(page.getByText('Salvat pe acest dispozitiv')).toBeVisible();
    await page.goto('/#view=saved');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'saved');
    await expect(page.locator('[data-view=saved] .page-intro p').first()).toContainText('1 element salvat');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the home gallery button follows the Romanian count rule', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    const button = page.getByRole('button', {name: /Toate cele \d+(?: de)? locuri cu galerii/});
    await expect(button).toBeVisible();
    const text = (await button.innerText()).replace(/\s+/g, ' ').trim();
    const match = text.match(/^Toate cele (\d+) (.+) cu galerii$/);
    expect(match, `unexpected gallery button copy: "${text}"`).toBeTruthy();
    const count = Number(match![1]);
    const expected = roCountKind(count) === 'singular' ? 'loc' : roCountKind(count) === 'plain' ? 'locuri' : 'de locuri';
    expect(match![2], `count ${count} must read "${expected}"`).toBe(expected);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the weather variables line follows the Romanian count rule', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=dashboard');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'dashboard');
    await expect(async () => {
      const line = page.getByText(/Toate cele \d+ .*variabil/).first();
      await expect(line).toBeVisible();
      const text = (await line.innerText()).replace(/\s+/g, ' ').trim();
      const match = text.match(/^Toate cele (\d+) (variabilă disponibilă|variabile disponibile|de variabile disponibile) pentru/);
      expect(match, `unexpected weather count line: "${text}"`).toBeTruthy();
      const count = Number(match![1]);
      expect(count, 'the count line is asserted with data present (variables > 0)').toBeGreaterThan(0);
      const expected = roCountKind(count) === 'singular' ? 'variabilă disponibilă' : roCountKind(count) === 'plain' ? 'variabile disponibile' : 'de variabile disponibile';
      expect(match![2], `count ${count} must read "${expected}"`).toBe(expected);
    }).toPass({timeout: 45_000});
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the cinema program counts follow the Romanian count rule', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=filme');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.getByRole('heading', {level: 2, name: 'Ce filme rulează la cinema?'})).toBeVisible();
    await expect(async () => {
      const line = page.locator('.cinema-workspace p').filter({hasText: /ore locale/}).first();
      await expect(line).toBeVisible();
      const text = (await line.innerText()).replace(/\s+/g, ' ').trim();
      const match = text.match(/^(\d+) (film|filme|de filme) · (\d+) (proiecție|proiecții|de proiecții) ·/);
      expect(match, `unexpected cinema count line: "${text}"`).toBeTruthy();
      const films = Number(match![1]), events = Number(match![3]);
      expect(films, 'the program line is asserted with data present (films > 0)').toBeGreaterThan(0);
      expect(match![2]).toBe(roCountKind(films) === 'singular' ? 'film' : roCountKind(films) === 'plain' ? 'filme' : 'de filme');
      expect(match![4]).toBe(roCountKind(events) === 'singular' ? 'proiecție' : roCountKind(events) === 'plain' ? 'proiecții' : 'de proiecții');
    }).toPass({timeout: 60_000});
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Footer honesty', () => {
  test('the footer guide link opens the About view where the platform guides live', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    const guideLink = page.locator('.vfooter .footer-links').getByRole('button', {name: 'Ghidurile platformei'});
    await expect(guideLink).toBeVisible();
    await guideLink.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'about');
    await expect(page.getByRole('heading', {level: 1, name: 'Informație verificabilă.'})).toBeVisible();
    await expect(page.getByRole('heading', {level: 2, name: 'Ghidurile platformei'})).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
