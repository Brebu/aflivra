import {test, expect, type Page} from '@playwright/test';

// T2 — search by NAME on the firm surface. The probe ledger (2026-10-08, session
// vehicle-company-imagery) settled the source: the official ONRC/MFP name registries
// (OD_FIRME.CSV 693 MB, date de identificare 2 × ~435 MB) publish no server-side name
// query and exceed every fetch cap; mfinante's name-lookup page is retired (404 after the
// mfinante.ro → mfinante.gov.ro move); webservicesp.anaf.ro exposes no search endpoint;
// finantepublice.ro is a parked domain. The one upstream that answers a name query is the
// open-knowledge registry the app already reads for the same firm family (Wikidata, joined
// by the Romanian VAT identifier) — so the name search reads it, rate-budgeted, with the
// coverage disclosed. Every stub below is a full status+data source envelope.
test.describe('Company name search (Wikidata VAT registry)', () => {
  const now = () => new Date().toISOString();

  const anafSourceState = {
    key: 'company:427282', name: 'ANAF', url: 'https://webservicesp.anaf.ro', adapterVersion: 'anaf.profile.v3',
    status: 'fresh', publishedAt: '2025', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400,
  };

  const knowledgeSourceState = {
    key: 'knowledge-company:427282', name: 'Wikidata · identificare după numărul TVA', url: 'https://www.wikidata.org/', adapterVersion: 'wikidata.company-vat.v1',
    status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400,
  };

  const companyState = () => ({
    ...anafSourceState,
    data: {
      name: 'Monitorul Oficial RA', cui: '427282', address: 'București', inactive: false, vat: true, year: 2025,
      queriedDate: '2026-10-08', vatFrom: '2007-06-13', vatTo: null, caenLabel: 'Activități de editare a ziarelor',
      warnings: [], sources: [anafSourceState], provenance: {
        name: {source: 'ANAF · registru fiscal', url: 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', referenceDate: '2026-10-08', verifiedAt: now()},
      },
      publicRegistries: [
        {
          kind: 'pharmacies', name: 'Farmacii în registrul CNAS', period: '31.03.2026',
          records: [{'Numar contract': '479', 'Cod fiscal furnizor': '427282', 'Nume furnizor': 'Farmacia de verificare SRL'}],
          source: {key: 'directory:pharmacies', name: 'Farmacii în registrul CNAS', url: 'https://data.gov.ro/dataset/lista-furnizori', adapterVersion: 'directory.complete-fields.v6', status: 'fresh', publishedAt: '31.03.2026', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 86400},
        },
      ],
      history: [{year: 2025, caen: '5812', entries: [{label: 'Cifra de afaceri', value: 123456789}], indicators: {}, url: 'https://webservicesp.anaf.ro/bilant?an=2025&cui=427282'}],
      leadership: [], websites: [],
    },
  });

  // Status+data envelope of the name-search loader: entity search reads ro then en
  // (merged per entity), the VAT/site detail comes from the registry — a row with a
  // validated CUI links onward; a row whose entity carries no registry VAT stays
  // listed with an honest no-CUI marker, never an invented CUI (eMAG-class firms are
  // found by name but publish no VAT identifier in the open-knowledge registry).
  const nameSearchState = () => ({
    key: 'company-name:monitorul oficial', name: 'Wikidata · firme după nume', url: 'https://www.wikidata.org/', adapterVersion: 'wikidata.company-name.v3',
    status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {
      query: 'monitorul oficial',
      items: [
        {cui: '427282', vat: 'RO427282', qid: 'Q2138580', name: 'REGIA AUTONOMA MONITORUL OFICIAL', websites: ['https://www.monitoruloficial.ro/'], country: 'România', matchNote: 'identificator TVA (P3608) citit în registrul deschis', sourceUrl: 'https://www.wikidata.org/wiki/Q2138580'},
        {cui: '45548304', vat: 'RO45548304', qid: 'Q99887766', name: 'MONITORUL OFICIAL DE VERIFICARE SRL', websites: [], country: 'România', matchNote: 'identificator TVA (P3608) citit în registrul deschis', sourceUrl: 'https://www.wikidata.org/wiki/Q99887766'},
        {cui: null, vat: null, qid: 'Q23827008', name: 'eMAG', websites: ['https://www.emag.ro/'], country: 'România', matchNote: 'potrivire de nume pe clasă de organizație (P31), fără identificator fiscal românesc citit în registru', sourceUrl: 'https://www.wikidata.org/wiki/Q23827008'},
        {cui: null, vat: null, qid: 'Q3137194', name: 'EMAG Elektrizitäts-AG', websites: [], country: 'Germania', matchNote: 'potrivire de nume pe clasă de organizație (P31), fără identificator fiscal românesc citit în registru', sourceUrl: 'https://www.wikidata.org/wiki/Q3137194'},
      ],
      count: 4, limited: false,
    },
  });

  async function waitForClientReady(page: Page) {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false), {timeout: 30_000}).toBe(true);
  }

  async function openCompany(page: Page, nameResults = nameSearchState()) {
    let nameSearchRequests = 0;
    await page.route('**/api/company*', route => {
      if (route.request().url().includes('name=')) {
        nameSearchRequests++;
        return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(nameResults)});
      }
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(companyState())});
    });
    await page.goto('/#view=company&id=427282');
    await waitForClientReady(page);
    await expect(page.getByRole('heading', {level: 1, name: 'Verifică o firmă după CUI.'})).toBeVisible();
    return () => nameSearchRequests;
  }

  test('typing a firm name returns the matching firms with their CUI, disclosed coverage', async ({page}) => {
    await openCompany(page);
    await page.getByLabel('Nume firmă').fill('monitorul oficial');
    await page.getByRole('button', {name: 'Caută după nume'}).click();
    const results = page.locator('.company-name-results');
    await expect(results).toBeVisible();
    await expect(results.getByRole('heading', {level: 2, name: 'Firme găsite după nume'})).toBeVisible();
    // The coverage sentence states the honest source shape: the open-knowledge registry
    // behind the search and the national registry that cannot be queried by name at source.
    await expect(results).toContainText('4 firme găsite');
    const first = results.locator('.company-name-result').first();
    await expect(first).toContainText('REGIA AUTONOMA MONITORUL OFICIAL');
    await expect(first).toContainText('CUI 427282');
    // A found entity without a registry VAT stays listed, marked honest — no invented CUI,
    // no dosar: the row is plain text, not a clickable button.
    const noCui = results.locator('.company-name-no-cui');
    await expect(noCui).toHaveCount(1);
    await expect(noCui).toContainText('eMAG');
    await expect(noCui).toContainText('fără CUI citit în registrul deschis');
    await expect(noCui).toContainText('https://www.emag.ro/');
    await expect(noCui.getByRole('button')).toHaveCount(0);
    await expect(results).toContainText('registrul deschis de cunoștințe');
    await expect(results).toContainText('fără interogare pe nume la sursă');
    // The count sentence discloses the no-CUI rows instead of hiding them.
    await expect(results).toContainText('Intrările fără CUI citit din registru rămân indicate');
  });

  test('clicking a result opens that firm card with the public registries tab', async ({page}) => {
    await openCompany(page);
    await page.getByLabel('Nume firmă').fill('monitorul oficial');
    await page.getByRole('button', {name: 'Caută după nume'}).click();
    await page.locator('.company-name-result', {hasText: 'REGIA AUTONOMA MONITORUL OFICIAL'}).click();
    // The card opens for the clicked firm's validated CUI…
    await expect(page.locator('.company-profile h2')).toHaveText('Monitorul Oficial RA');
    // …and the public-registries tab of the existing card is the destination view.
    const registries = page.locator('.company-registries');
    await expect(registries).toBeVisible();
    await expect(registries).toContainText('Farmacii în registrul CNAS');
  });

  test('no name match stays an honest absence naming the unqueryable national registry', async ({page}) => {
    const empty = {
      ...nameSearchState(),
      key: 'company-name:firmă inexistentă de verificare',
      data: {query: 'firmă inexistentă de verificare', items: [], count: 0, limited: false},
    };
    await openCompany(page, empty);
    await page.getByLabel('Nume firmă').fill('firmă inexistentă de verificare');
    await page.getByRole('button', {name: 'Caută după nume'}).click();
    const results = page.locator('.company-name-results');
    await expect(results).toBeVisible();
    await expect(results).toContainText('Nicio firmă cu acest nume nu este prezentă în registrul deschis de cunoștințe');
    // The absence names the probe-settled reality: integral ONRC files (OD_FIRME, 693 MB)
    // that cannot be queried by name at the source — the reason the search cannot read them.
    await expect(results).toContainText('Registrul național al firmelor');
    await expect(results).toContainText('CUI');
  });

  test('a too-short name is rejected client-side without querying any source', async ({page}) => {
    const requests = await openCompany(page);
    await page.getByLabel('Nume firmă').fill('a');
    await page.getByRole('button', {name: 'Caută după nume'}).click();
    await expect(page.locator('.company-live [role="alert"]').last()).toContainText('Introdu cel puțin 2 caractere');
    expect(requests()).toBe(0);
  });
});
