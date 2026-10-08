import {test, expect, type Page} from '@playwright/test';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

test.describe('Sweep repair pins', () => {
  test('the AFIR feed renders each article once: unique titles, no duplicate React keys', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // The duplicated-article defect first surfaced as React duplicate-key console
    // errors on the agricultura news feed, so the console itself is part of the pin.
    const duplicateKeyErrors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error' && /two children with the same key/.test(message.text())) duplicateKeyErrors.push(message.text());
    });
    await page.goto('/#view=domain&id=agricultura');
    await expect(page.locator('.domain-hero h1')).toHaveText('Pământ & agricultură');
    const articles = page.locator('[data-testid="feed-article"]');
    await expect.poll(async () => articles.count(), {timeout: 45_000}).toBeGreaterThanOrEqual(1);
    const titles = (await articles.locator('h3').allInnerTexts()).map(title => title.trim());
    expect(titles.length).toBeGreaterThanOrEqual(1);
    // Every served article renders once: no repeated headline in the list.
    expect(new Set(titles).size, `duplicated feed titles: ${titles.join(' | ')}`).toBe(titles.length);
    expect(duplicateKeyErrors, `duplicate React keys: ${duplicateKeyErrors.join(' | ')}`).toEqual([]);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

   test('the public catalog page serves its h1 in the server-rendered HTML', async ({page}) => {
    const response = await page.request.get('/catalog');
    expect(response.status()).toBe(200);
    // The page heading must exist before hydration — an SSR contract, not a client effect.
    const html = await response.text();
    expect(html).toContain('<h1>Catalogul de date publice ale României</h1>');
   });
});

test.describe('Typed date display on venue facts (formats audit pins)', () => {
  // The formats audit (Wave A2) found raw source stamps leaking into typed rows:
  // the IFEP registry publishes update stamps as „dd-mm-yyyy HH:mm" and the
  // lawyers row rendered them raw, while the company identity facts rendered
  // the bare ISO registration/query dates. These pins keep the typed locale
  // display on those rows while the raw disclosure stays wherever the source's
  // own shape is the contract (MetadataFields panels, registry details).
  const now = () => new Date().toISOString();

  async function waitForClientReady(page: Page) {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
  }

  const lawyersState = () => ({
    key: 'lawyers:probe', name: 'IFEP / UNBR · tabloul național al avocaților', url: 'https://www.ifep.ro/Justice/Lawyers/LawyersPanel.aspx', adapterVersion: 'ifep.public-search.v2',
    status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {
      items: [{id: 'probe-1', name: 'POPESCU Ana', title: 'Avocat definitiv, Baroul Cluj', details: 'Sediu principal: Cluj-Napoca', rights: 'Drept de concluzii la: Judecătorii, Tribunale, Curți de Apel', updatedAt: '05-10-2026 12:12', paragraphs: [], url: 'https://www.ifep.ro/'}],
      total: 1, page: 0, pages: 1, pageSize: 15,
      note: 'Tabloul profesional este actualizat de barouri.', sourceUrl: 'https://www.ifep.ro/Justice/Lawyers/LawyersPanel.aspx',
    },
  });

  test('the lawyers row shows the parsed stamp alongside the registry\'s published form', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.route('**/api/lawyers*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(lawyersState())}));
    await page.goto('/#view=domain&id=justitie&tab=lawyers');
    await waitForClientReady(page);
    await expect(page.getByRole('heading', {level: 2, name: 'Avocați și situația în tablou'})).toBeVisible();
    const row = page.locator('.record-list article', {hasText: 'POPESCU Ana'});
    await expect(row.first()).toBeVisible();
    // The typed interpretation of the registry's local-clock stamp „05-10-2026 12:12".
    await expect(row.first()).toContainText('5 oct. 2026');
    await expect(row.first()).toContainText('12:12');
    // The registry's published form stays disclosed alongside, never replaced.
    await expect(row.first()).toContainText('05-10-2026 12:12');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  const companyState = () => ({
    key: 'company:427282', name: 'Firme · ANAF', url: 'https://webservicesp.anaf.ro', adapterVersion: 'anaf.profile.v2',
    status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400,
    data: {
      name: 'Monitorul Oficial RA', cui: '427282', address: 'București', inactive: false, vat: true, year: 2025,
      registrationDate: '1991-03-07', queriedDate: '2026-10-08', legalForm: 'Societate națională', registration: 'J40/1/1991',
      currentCaen: '58', financialCaen: '58', warnings: [], sources: [],
      registryDetails: {date_generale: {denumire: 'Monitorul Oficial RA', data_inregistrare: '1991-03-07', forma_juridica: 'Societate națională'}, inregistrare_scop_Tva: {scpTVA: true}, stare_inactiv: {statusInactivi: false}},
      history: [{year: 2025, entries: [{label: 'Cifra de afaceri', value: 123456789}, {label: 'Profit net', value: 1000}, {label: 'Număr mediu de salariați', value: 120}], caen: '58', indicators: {}, url: 'https://webservicesp.anaf.ro/bilant?an=2025&cui=427282'}],
    },
  });

  test('the company identity facts render locale dates, with the raw response still disclosed on the fiscal tab', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.route('**/api/company*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(companyState())}));
    await page.goto('/#view=company&id=427282');
    await waitForClientReady(page);
    await expect(page.getByRole('heading', {level: 1, name: 'Verifică o firmă după CUI.'})).toBeVisible();
    await expect(page.locator('.company-live h2').first()).toHaveText('Monitorul Oficial RA');
    await page.getByRole('tab', {name: 'Identitate'}).click();
    const identity = page.locator('.company-live .facts-table').first();
    await expect(identity).toContainText('Data înregistrării');
    // Typed locale display on the identity facts — not the bare ISO stamp.
    await expect(identity).toContainText('7 mar. 1991');
    await expect(identity).toContainText('8 oct. 2026');
    // The fiscal tab still carries the raw registry shape (data_inregistrate stays as published).
    await page.getByRole('tab', {name: 'Statut fiscal'}).click();
    const fiscal = page.locator('.company-live .facts-table').first();
    await expect(fiscal).toContainText('Data înregistrării');
    await expect(fiscal).toContainText('1991-03-07');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

