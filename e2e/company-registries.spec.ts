import {test, expect, type Page} from '@playwright/test';

// Wave B (B-1) — the company card enriches on the validated CUI key only:
//  - the balance sheet's own CAEN label (den_caen, a real source field dropped at parse until
//    this wave) rendered beside the code on the identity facts;
//  - the ANAF VAT registration interval typed as a date range alongside the raw disclosure;
//  - the CKAN data.gov.ro CNAS provider registries joined on the exact CUI column the
//    registries publish („Cod fiscal furnizor" in every current 31.03.2026 edition, per the
//    live probe and the own-infra cached-edition reads; „CUI cod" is the earlier-edition
//    column name the join also accepts), each registry rendered grouped by its own source
//    with Freshness and full record disclosure, absence kept honest.
test.describe('Company registries joined on CUI (Wave B)', () => {
  const now = () => new Date().toISOString();

  const anafSourceState = {
    key: 'company:427282', name: 'ANAF', url: 'https://webservicesp.anaf.ro', adapterVersion: 'anaf.profile.v3',
    status: 'fresh', publishedAt: '2025', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400,
  };

  const companyState = () => ({
    ...anafSourceState,
    data: {
      name: 'Monitorul Oficial RA', cui: '427282', address: 'București', inactive: false, vat: true, year: 2025,
      registrationDate: '1991-03-07', queriedDate: '2026-10-08', legalForm: 'Societate națională', registration: 'J40/1/1991',
      currentCaen: '58', financialCaen: '5812', caenLabel: 'Activități de editare a ziarelor', vatFrom: '2007-06-13', vatTo: null,
      warnings: [], sources: [anafSourceState],
      provenance: {
        name: {source: 'ANAF · registru fiscal', url: 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', referenceDate: '2026-10-08', verifiedAt: now()},
        cnasFarmacii: {source: 'data.gov.ro · Farmacii în registrul CNAS', url: 'https://data.gov.ro/dataset/lista-furnizori', referenceDate: '31.03.2026', verifiedAt: now()},
      },
      publicRegistries: [
        {
          kind: 'pharmacies', name: 'Farmacii în registrul CNAS', period: '31.03.2026',
          records: [{'Numar contract': '479', 'Cod fiscal furnizor': '427282', 'Tip furnizor': 'Farmacie', 'Nume furnizor': 'Farmacia de verificare SRL', 'Cod CAS': 'CAS-B', 'Nume CAS': 'CAS BUCUREŞTI'}],
          source: {key: 'directory:pharmacies', name: 'Farmacii în registrul CNAS', url: 'https://data.gov.ro/dataset/lista-furnizori', adapterVersion: 'directory.complete-fields.v6', status: 'fresh', publishedAt: '31.03.2026', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400},
        },
        {
          kind: 'health', name: 'Clinici în registrul CNAS', period: '31.03.2026', records: [],
          source: {key: 'directory:health', name: 'Clinici în registrul CNAS', url: 'https://data.gov.ro/dataset/lista-furnizori', adapterVersion: 'directory.complete-fields.v6', status: 'fresh', publishedAt: '31.03.2026', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400},
        },
      ],
      registryDetails: {date_generale: {denumire: 'Monitorul Oficial RA', data_inregistrare: '1991-03-07', forma_juridica: 'Societate națională'}, inregistrare_scop_Tva: {scpTVA: true, dataInceputScpTVA: '2007-06-13', dataSfarsitScpTVA: null}, stare_inactiv: {statusInactivi: false}},
      history: [{year: 2025, caen: '5812', caenLabel: 'Activități de editare a ziarelor', entries: [{label: 'Cifra de afaceri', value: 123456789}, {label: 'Profit net', value: 1000}, {label: 'Număr mediu de salariați', value: 120}], indicators: {}, url: 'https://webservicesp.anaf.ro/bilant?an=2025&cui=427282'}],
    },
  });

  async function waitForClientReady(page: Page) {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false), {timeout: 30_000}).toBe(true);
  }

  async function openCompany(page: Page) {
    await page.route('**/api/company*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(companyState())}));
    await page.goto('/#view=company&id=427282');
    await waitForClientReady(page);
    await expect(page.getByRole('heading', {level: 1, name: 'Verifică o firmă după CUI.'})).toBeVisible();
    await expect(page.locator('.company-live h2').first()).toHaveText('Monitorul Oficial RA');
  }

  test('the balance CAEN label renders typed beside the code, and the VAT interval as a date range', async ({page}) => {
    // The raw registry disclosure (raw CAEN code, TVA interval stamps) stays on the fiscal tab.
    await openCompany(page);
    await page.getByRole('tab', {name: 'Identitate'}).click();
    const identity = page.locator('.company-live .facts-table').first();
    await expect(identity).toContainText('CAEN în bilanț');
    // den_caen is a field the ANAF balance response carries (probe-pinned); the identity row
    // renders it beside the code instead of dropping it at parse.
    await expect(identity).toContainText('5812 · Activități de editare a ziarelor');
    await expect(identity).toContainText('Înregistrare în scopuri TVA');
    // The interval is typed with the locale date helpers — the pair 13 jun 2007 → open-ended.
    await expect(identity).toContainText('13 iun. 2007');
    await expect(identity).toContainText('în prezent');
    // The raw registry shape keeps the source's own TVA interval stamps on the fiscal tab
    // (the column key renders under its registry label; the stamp stays exactly as published).
    await page.getByRole('tab', {name: 'Statut fiscal'}).click();
    const fiscal = page.locator('.company-live .facts-table').first();
    await expect(fiscal).toContainText('Început înregistrare TVA');
    await expect(fiscal).toContainText('2007-06-13');
  });

  test('the CKAN CNAS registries join on the exact CUI, grouped by source, with honest absence', async ({page}) => {
    await openCompany(page);
    await page.getByRole('tab', {name: 'Registre publice'}).click();
    const registries = page.locator('.company-registries');
    await expect(registries).toBeVisible();
    await expect(registries.getByRole('heading', {level: 2, name: 'Registrele publice pentru acest CUI'})).toBeVisible();
    // Each registry renders with its own identity and Freshness line (per-source grouping).
    const pharmacies = registries.locator('.company-registry', {hasText: 'Farmacii în registrul CNAS'});
    await expect(pharmacies).toBeVisible();
    await expect(pharmacies).toContainText('Ediția 31.03.2026');
    await expect(pharmacies.locator('.live-freshness')).toContainText('Farmacii în registrul CNAS');
    // The matched record discloses every published column of the source row.
    await expect(pharmacies).toContainText('Farmacia de verificare SRL');
    await expect(pharmacies).toContainText('Cod fiscal furnizor');
    await expect(pharmacies).toContainText('427282');
    // A readable registry without a matching CUI stays an honest absence, never an invented row.
    const clinics = registries.locator('.company-registry', {hasText: 'Clinici în registrul CNAS'});
    await expect(clinics).toBeVisible();
    await expect(clinics).toContainText('CUI-ul nu apare în această ediție a registrului');
    // The provenance table carries each joined registry field with its data.gov.ro source.
    const provenanceRow = page.locator('.company-live .facts-table tr', {hasText: 'cnasFarmacii'});
    await expect(provenanceRow).toBeVisible();
    await expect(provenanceRow).toContainText('data.gov.ro · Farmacii în registrul CNAS');
  });
});
