import {test, expect, type Page} from '@playwright/test';

// The federated result list renders in the domain-registry order of app/v2-model.ts
// (mirrored by lib/live/federated.ts federatedGroups): whatever subset of groups a
// term surfaces must keep that relative order, with counts via the countText grammar
// (mirroring lib/live/query.ts: 1 → "1 rezultat", 2–19 → "N rezultate", 20+ → "N de rezultate").
const registryOrder = ['local', 'vreme', 'bani', 'firme', 'mediu', 'transport', 'sanatate', 'educatie', 'cultura', 'munca', 'justitie', 'energie', 'agricultura', 'filme', 'povesti', 'stiri'];
const registryLabel: Record<string, string> = {
  local: 'Orașul tău', vreme: 'Vreme și prognoză', bani: 'Bani & economie', firme: 'Firme, pe înțeles', mediu: 'Natură și mediu',
  transport: 'În mișcare', sanatate: 'Sănătate aproape', educatie: 'Educație & viitor', cultura: 'Cultură și turism', munca: 'Muncă & oportunități',
  justitie: 'Lege & administrație', energie: 'Energie & consum', agricultura: 'Pământ & agricultură', filme: 'Filme și cinematografe', povesti: 'Povești și lectură', stiri: 'Știri & actualitate',
};
function countPhrase(rows: number): string {
  const unit = rows % 10, lastTwo = rows % 100;
  const noun = unit === 1 && lastTwo !== 11 ? 'rezultat' : rows === 0 || (lastTwo >= 2 && lastTwo <= 19) ? 'rezultate' : 'de rezultate';
  return new Intl.NumberFormat('ro-RO').format(rows) + ' ' + noun;
}

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

async function openExplore(page: Page) {
  await page.goto('/#view=explore');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
  await waitForClientReady(page);
}

async function searchFromExplore(page: Page, term: string) {
  await page.getByLabel('Caută în locuri și domenii').fill(term);
}

// Every network family must reach a terminal state before structural assertions; the
// busy line disappears exactly when no family is pending anymore.
async function waitFamiliesSettled(page: Page) {
  await expect(page.getByTestId('federated-busy')).toHaveCount(0, {timeout: 60_000});
}

async function renderedGroupIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid="federated-group"]').evaluateAll(groups => groups.map(group => group.getAttribute('data-group') || ''));
}

async function renderedRowSnapshot(page: Page): Promise<Array<{group: string; titles: string[]}>> {
  return page.locator('[data-testid="federated-group"]').evaluateAll(groups => groups.map(group => ({
    group: group.getAttribute('data-group') || '',
    titles: Array.from(group.querySelectorAll('[data-testid="federated-row"] strong')).map(strong => (strong.textContent || '').trim()).sort(),
  })));
}

async function expectGroupCountsAndLabels(page: Page) {
  const groups = page.locator('[data-testid="federated-group"]');
  const count = await groups.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const group = groups.nth(index);
    const id = (await group.getAttribute('data-group')) || '';
    expect(registryOrder, `unknown group "${id}"`).toContain(id);
    await expect(group.locator('header h3')).toHaveText(registryLabel[id]);
    const rows = await group.locator('[data-testid="federated-row"]').count();
    await expect(group.locator('header .small-muted')).toHaveText(countPhrase(rows));
  }
}

test.describe('Federated search — one grouped list', () => {
  test('a term from the home hero renders one registry-ordered list with countText counts, rows and news source links', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByLabel('Caută un loc, o firmă sau un subiect').fill('sala');
    await page.locator('form.hero-search').getByRole('button', {name: 'Explorează', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await expect(page.getByRole('heading', {level: 2, name: 'Rezultate pentru „sala”'})).toBeVisible();
    await waitFamiliesSettled(page);

    // Groups follow the domain-registry order and never duplicate.
    const ids = await renderedGroupIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    const positions = ids.map(id => registryOrder.indexOf(id));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    // Every group header shows its registry label and a countText agreeing with the rendered rows.
    await expectGroupCountsAndLabels(page);
    expect(await page.getByTestId('federated-row').count()).toBeGreaterThanOrEqual(10);

    // The domain news rows carry the external source link (provenance, not a dead end).
    const newsLinks = page.locator('[data-testid="federated-group"][data-group="stiri"] a.federated-row-source');
    await expect(newsLinks.first()).toBeVisible();
    await expect(newsLinks.first()).toHaveAttribute('href', /^https?:\/\//);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('diacritics fold: „școli" and „scoli" render the same grouped results', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'școli');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const withDiacritics = await renderedRowSnapshot(page);
    expect(withDiacritics.length).toBeGreaterThan(0);
    // Schools datasets surface in the local group via the public catalog, school
    // registry records in the education group — the equivalence is not two empties.
    expect(withDiacritics.map(s => s.group)).toContain('local');
    expect(withDiacritics.map(s => s.group)).toContain('educatie');
    expect(withDiacritics.flatMap(s => s.titles).length).toBeGreaterThan(0);

    await searchFromExplore(page, 'scoli');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const plain = await renderedRowSnapshot(page);
    expect(plain).toEqual(withDiacritics);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a long multi-word term still matches across families', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'ateneul român bucurești');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    await expectGroupCountsAndLabels(page);
    // All three words must match: the editorial gallery surfaces the Ateneul Român place.
    await expect(page.locator('[data-testid="federated-group"][data-group="cultura"] [data-testid="federated-row"]', {hasText: 'Ateneul Român'}).first()).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a term that is also a suggestion chip label searches without stealing the chip semantics', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByLabel('Caută un loc, o firmă sau un subiect').fill('Brașov');
    await page.locator('form.hero-search').getByRole('button', {name: 'Explorează', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    expect(await page.getByTestId('federated-row').count()).toBeGreaterThan(0);

    // The typed term is a search, not a city-context activation: the location strip
    // keeps the default city (the chip path is the one that switches it).
    await expect(page.locator('.location-strip [role="status"]').first()).toContainText('București');

    // The explore filter chips keep their own semantics on the editorial gallery
    // underneath, while the federated list stays untouched by them.
    const chips = page.locator('.filter-bar .chip-row button');
    await expect(chips).toHaveCount(7);
    await page.locator('.filter-bar .chip-row').getByRole('button', {name: 'Locuri', exact: true}).click();
    await expect(page.locator('.exploration-gallery')).toBeVisible();
    await expect(page.getByTestId('federated-results')).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Federated search — professional and registry families', () => {
  test('„avocați" surfaces the OSM lawyer offices and the IFEP family state honestly', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'avocați');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const justitie = page.locator('[data-testid="federated-group"][data-group="justitie"]');
    await expect(justitie).toBeVisible();
    await expect(justitie.locator('header h3')).toHaveText('Lege & administrație');
    // The national places inventory surfaces lawyer offices with the „Avocați" subcategory.
    await expect(justitie.locator('[data-testid="federated-row"]', {hasText: 'Avocați · OpenStreetMap'}).first()).toBeVisible();
    // The professional registry family never fails silently: rows, or its honest note.
    const lawyerRows = await justitie.locator('[data-testid="federated-row"]', {hasText: 'Tabloul avocaților'}).count();
    const lawyerNotes = await justitie.locator('p.source-warning', {hasText: 'Tabloul avocaților'}).count();
    expect(lawyerRows + lawyerNotes).toBeGreaterThan(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('„notari" surfaces notaries through the places „Notari" subcategory', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'notari');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const justitie = page.locator('[data-testid="federated-group"][data-group="justitie"]');
    await expect(justitie).toBeVisible();
    const notaryRows = justitie.locator('[data-testid="federated-row"]', {hasText: 'Notari · OpenStreetMap'});
    await expect(notaryRows.first()).toBeVisible();
    expect(await notaryRows.count()).toBeGreaterThanOrEqual(2);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a lawyers row click-through opens the justitie domain with the seeded registry search', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'popescu');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const lawyerRow = page.locator('[data-testid="federated-row"]', {hasText: 'Tabloul avocaților'}).first();
    await expect(lawyerRow).toBeVisible();
    const lawyerName = ((await lawyerRow.locator('strong').innerText()) || '').trim();
    expect(lawyerName.length).toBeGreaterThan(0);
    await lawyerRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('.domain-hero h1')).toHaveText('Lege & administrație');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toMatch(/#view=domain&id=justitie&q=.+&tab=lawyers$/);
    await expect(page.getByRole('heading', {level: 2, name: 'Avocați și situația în tablou'})).toBeVisible();
    await expect(page.getByLabel('Caută avocat în registrul profesional')).toHaveValue(lawyerName);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Federated search — shortcuts, seeds and click-throughs', () => {
  test('a numeric CUI term surfaces the firme shortcut row whose click-through opens the company view', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, '427282');
    const cuiRow = page.locator('[data-testid="federated-group"][data-group="firme"] [data-testid="federated-row"]', {hasText: 'Firma cu CUI 427282'});
    await expect(cuiRow).toBeVisible();
    await expect(cuiRow).toContainText('Identitate și bilanț · ANAF');
    await cuiRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'company');
    await expect(page.getByRole('heading', {level: 1, name: 'Verifică o firmă după CUI.'})).toBeVisible();
    await expect(page.getByLabel('CUI firmă')).toHaveValue('427282');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#view=company&id=427282');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a dosar-format term seeds the courts form without submitting it', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, '123/45/2024');
    const dosarRow = page.locator('[data-testid="federated-group"][data-group="justitie"] [data-testid="federated-row"]', {hasText: 'Dosarul 123/45/2024'});
    await expect(dosarRow).toBeVisible();
    // The seed contract is form-filling, never an automatic portal query (the
    // submit would hit the live courts SOAP service).
    await dosarRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('.domain-hero h1')).toHaveText('Lege & administrație');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#view=domain&id=justitie&tab=legal');
    await expect(page.getByRole('heading', {level: 2, name: 'Dosare, părți și soluții publice'})).toBeVisible();
    await expect(page.getByLabel('Număr dosar', {exact: true})).toHaveValue('123/45/2024');
    await expect(page.getByRole('combobox', {name: 'Căutare după număr', exact: true})).toHaveValue('all');
    await expect(page.locator('.court-results')).toHaveCount(0);
    await expect(page.getByText('Se verifică fișele și ședințele din sursa oficială…')).toHaveCount(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a catalog dataset row opens the domain data tab with the seeded catalog search', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'urbanism');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    // The catalog family rows carry the data.gov.ro source line inside the local group.
    const catalogRow = page.locator('[data-testid="federated-group"][data-group="local"] [data-testid="federated-row"]', {hasText: 'data.gov.ro'}).first();
    await expect(catalogRow).toBeVisible();
    const datasetTitle = ((await catalogRow.locator('strong').innerText()) || '').trim();
    expect(datasetTitle.length).toBeGreaterThan(0);
    await catalogRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('.domain-hero h1')).toHaveText('Orașul tău');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toMatch(/#view=domain&id=local&q=.+&tab=data$/);
    await expect(page.getByLabel('Caută în catalogul național')).toHaveValue(datasetTitle);
    // The seeded inventory search runs under the default locality-biased context;
    // the full national scope must surface the clicked dataset itself.
    await page.getByRole('combobox', {name: 'Context geografic', exact: true}).selectOption({label: 'Întregul catalog național'});
    const seededCard = page.locator('.live-resource', {hasText: datasetTitle}).first();
    await expect(seededCard).toBeVisible();
    // A dataset the inventory classifies under another category must land on THAT
    // category's data tab, never on the local tab whose filter would hide it.
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await searchFromExplore(page, 'școli');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const classifiedRow = page.locator('[data-testid="federated-group"][data-group="educatie"] [data-testid="federated-row"]', {hasText: 'Școli sigure'}).first();
    await expect(classifiedRow).toBeVisible();
    const classifiedTitle = ((await classifiedRow.locator('strong').innerText()) || '').trim();
    expect(classifiedTitle.length).toBeGreaterThan(0);
    await classifiedRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('.domain-hero h1')).toHaveText('Educație & viitor');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toMatch(/#view=domain&id=educatie&q=.+&tab=data$/);
    await expect(page.getByLabel('Caută în catalogul național')).toHaveValue(classifiedTitle);
    // The clicked dataset is itself visible on its own category tab.
    await expect(page.locator('.live-resource', {hasText: classifiedTitle}).first()).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a story row opens the povesti domain with the seeded library and carries the Wikisource source link', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'harap');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    // The stories corpus is a client-side eager family: it must be part of the very
    // first search of a fresh page, not only of later searches on a mounted list.
    await waitFamiliesSettled(page);
    // The source link is a sibling of the row button inside the list item (a link
    // inside a button would be invalid HTML), so the href is pinned on the item.
    const storyItem = page.locator('[data-testid="federated-group"][data-group="povesti"] li', {hasText: 'Povestea lui Harap-Alb'}).first();
    const storyRow = storyItem.getByTestId('federated-row');
    await expect(storyRow).toBeVisible();
    await expect(storyItem.locator('a.federated-row-source')).toHaveAttribute('href', 'https://ro.wikisource.org/wiki/Povestea_lui_Harap-Alb');
    await storyRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('.domain-hero h1')).toHaveText('Povești și lectură');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toMatch(/#view=domain&id=povesti&q=.+&tab=stories$/);
    await expect(page.getByRole('heading', {level: 2, name: 'Povești, basme și legende'})).toBeVisible();
    await expect(page.getByLabel('Caută povești în titlu, autor și text integral')).toHaveValue('Povestea lui Harap-Alb');
    // The seeded search surfaces the story itself in the library grid.
    await expect(page.locator('.story-card', {hasText: 'Povestea lui Harap-Alb'}).first()).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('an editorial gallery row opens the place detail view directly', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'castelul peles');
    // The gallery family is the only one sourced from the editorial presentation.
    const galleryRow = page.locator('[data-testid="federated-row"]', {hasText: 'Prezentare editorială'}).first();
    await expect(galleryRow).toBeVisible();
    await expect(galleryRow).toContainText('Castelul Peleș');
    await galleryRow.click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText('Castelul Peleș');
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#view=place&id=peles');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Federated search — honest boundaries', () => {
  test('a term with no matches anywhere renders the global honest empty state', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'zzqxvqm');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    await expect(page.getByTestId('federated-empty')).toBeVisible();
    await expect(page.getByTestId('federated-empty')).toContainText('Nicio categorie conectată nu are potriviri pentru „zzqxvqm”');
    // No family found anything: every rendered group is an anchored empty category
    // that says so honestly, never a row in disguise.
    const groups = page.locator('[data-testid="federated-group"]');
    const groupCount = await groups.count();
    expect(groupCount).toBeGreaterThanOrEqual(1);
    for (let index = 0; index < groupCount; index++) {
      await expect(groups.nth(index).locator('[data-testid="federated-row"]')).toHaveCount(0);
      await expect(groups.nth(index).locator('.live-empty')).toContainText('Nicio potrivire în această categorie.');
    }
    await expect(page.getByTestId('federated-row')).toHaveCount(0);
    // The editorial selection keeps its own separate empty state below.
    await expect(page.getByRole('heading', {level: 2, name: 'Niciun rezultat în selecția editorială'})).toBeVisible();
    await page.getByTestId('federated-empty').getByRole('button', {name: 'Resetează căutarea'}).click();
    await expect(page.getByTestId('federated-results')).toHaveCount(0);
    await expect(page.getByLabel('Caută în locuri și domenii')).toHaveValue('');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a two-character term gates the lawyers family honestly while the other families still search', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'ab');
    await expect(page.getByTestId('federated-results')).toBeVisible();
    await waitFamiliesSettled(page);
    const justitie = page.locator('[data-testid="federated-group"][data-group="justitie"]');
    await expect(justitie).toBeVisible();
    await expect(justitie.locator('p.small-muted', {hasText: 'Tabloul avocaților: Introdu cel puțin 3 caractere pentru acest registru.'})).toBeVisible();
    await expectGroupCountsAndLabels(page);
    await expect(page.locator('[data-testid="federated-group"][data-group="educatie"]')).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a term over 200 characters is rejected honestly without any grouped result', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openExplore(page);
    await searchFromExplore(page, 'x'.repeat(205));
    await expect(page.getByTestId('federated-note')).toBeVisible();
    await expect(page.getByTestId('federated-note')).toHaveText('Căutarea este prea lungă. Folosește cel mult 200 de caractere.');
    await expect(page.getByTestId('federated-group')).toHaveCount(0);
    await expect(page.getByTestId('federated-row')).toHaveCount(0);
    await expect(page.getByTestId('federated-busy')).toHaveCount(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
