import {test, expect, type Page} from '@playwright/test';

// The justice + rail wave: notaries, experts and train stations own registries, workspaces
// and federated families. Legs pin the seeded registry browse (deterministic seed copies:
// notari 3.096 · experți judiciari 8.024 · experți tehnici 1.494, ediția 23.01.2025 / 08 iunie
// 2026), the traducători registry served live, the committed planned-timetable corpus
// (1.846 de stații, 9 operatori, ediția 2025–2026 CFR Călători) and the federated
// click-through seeds — hash tab values only through the topicSections registry.
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

async function openDomainTab(page: Page, domain: string, tab: string) {
  await page.goto(`/#view=domain&id=${domain}&tab=${tab}`);
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
  await waitForClientReady(page);
}

test.describe('Justice registries (notari, experți, traducători)', () => {
  test('the notari tab browses the seeded registry, searches it and opens the full record with the fee-grid act', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openDomainTab(page, 'justitie', 'notari');

    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 2, name: /Notari publici în registru/})).toBeVisible();
    await expect(workspace.getByLabel('Caută notar în registrul profesional')).toBeVisible();
    // The fee grid is a separate official act — linked formally, not republished.
    await expect(workspace.getByRole('link', {name: /Grila de onorarii — Ordinul 177\/C\/2024/})).toHaveAttribute('href', 'https://legislatie.just.ro/Public/DetaliiDocument/278490');

    await expect(workspace.locator('.record-list article .record-heading').first()).toBeVisible({timeout: 60_000});
    await expect(workspace.getByText(/3\.0\d{2} de înregistrări găsite/)).toBeVisible();
    await expect(workspace.getByText(/ediția 23\.01\.2025/)).toBeVisible();
    const chamberOptions = await workspace.getByLabel('Camera notarilor').locator('option').count();
    expect(chamberOptions).toBeGreaterThan(10);

    await workspace.getByLabel('Caută notar în registrul profesional').fill('cazacu');
    await workspace.getByLabel('Caută notar în registrul profesional').press('Enter');
    await expect(workspace.getByText(/(\d+ )?(înregistrare|înregistrări) găsite/).first()).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.record-list article strong', {hasText: 'CAZACU CRISTINA-VALENTINA'}).first()).toBeVisible({timeout: 60_000});

    await workspace.locator('.record-list article .record-heading', {hasText: 'CAZACU CRISTINA-VALENTINA'}).first().click();
    await expect(workspace.locator('.record-fields dt', {hasText: 'NUME'})).toBeVisible();
    await expect(workspace.locator('.record-fields dt', {hasText: 'CAMERA'})).toBeVisible();
    await expect(workspace.getByText('Registrul pe data.gov.ro')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('the experți tab switches between the three registries and opens the full record', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openDomainTab(page, 'justitie', 'experti');

    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 2, name: /Experți, traducători și interpreți/})).toBeVisible();
    await expect(workspace.locator('.record-list article .record-heading').first()).toBeVisible({timeout: 60_000});
    await expect(workspace.getByText(/8\.0\d{2} de înregistrări găsite/)).toBeVisible();

    await workspace.getByRole('button', {name: 'Experți tehnici'}).click();
    await expect(workspace.getByText(/1\.4\d{2} de înregistrări găsite/)).toBeVisible({timeout: 60_000});
    await expect(workspace.getByText(/ediția 08 iunie 2026/)).toBeVisible();

    await workspace.getByRole('button', {name: 'Traducători și interpreți'}).click();
    // The traducători registry (≈38.000 de înregistrări) is fetched once and served from
    // the persistent copy — the first browse can pay a full registry load.
    await expect(workspace.getByText(/3[0-9]\.\d{3} de înregistrări găsite/)).toBeVisible({timeout: 90_000});
    await expect(workspace.locator('.record-list article .record-heading').first()).toBeVisible({timeout: 90_000});

    const firstHeading = workspace.locator('.record-list article .record-heading').first();
    await firstHeading.click();
    await expect(workspace.locator('.record-fields').first()).toBeVisible();
    await expect(workspace.locator('.record-fields dt', {hasText: 'Limbi'}).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('Mersul trenurilor (planned timetables, 9 operators)', () => {
  test('the trains tab searches stations with any diacritic spelling and opens a station board', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openDomainTab(page, 'transport', 'trains');

    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 2, name: /Gări și mersul trenurilor/})).toBeVisible();
    await expect(workspace.locator('.record-list article .record-heading').first()).toBeVisible({timeout: 60_000});
    await expect(workspace.getByText(/1\.846 de stații găsite/)).toBeVisible();

    // Infofer editions use legacy cedilla diacritics (Braşov); typing the modern
    // comma-below spelling must still find the station — the search fold both ways.
    await workspace.getByLabel('Caută gara sau stația de tren').fill('brașov');
    await workspace.getByLabel('Caută gara sau stația de tren').press('Enter');
    await expect(workspace.getByText(/3 stații găsite/)).toBeVisible({timeout: 60_000});
    const brasovRow = workspace.locator('.record-list article .record-heading', {hasText: 'Braşov'}).first();
    await expect(brasovRow).toBeVisible();

    await brasovRow.click();
    await expect(workspace.getByRole('heading', {level: 3, name: 'Braşov'})).toBeVisible();
    await expect(workspace.getByText(/\d+ de plecări planificate · \d+ de sosiri planificate/)).toBeVisible();
    const times = workspace.locator('.facts-table tbody tr td').first();
    await expect(times).toHaveText(/^\d{2}:\d{2}( \+1)?$/);
    // Every operator's published edition stays visible and linkable (some private
    // operators' newest official edition is years old — surfaced honestly, not hidden).
    await workspace.getByText(/Edițiile operatorilor/).click();
    await expect(workspace.getByText(/ediția „Mers tren - Regiotrans Brasov 2016-2017”/)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('Federated families for the justice + rail wave', () => {
  async function searchFromExplore(page: Page, term: string) {
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await waitForClientReady(page);
    await page.getByLabel('Caută în locuri și domenii').fill(term);
    await expect(page.getByTestId('federated-busy')).toHaveCount(0, {timeout: 90_000});
  }

  test('a notary name surfaces the notary registry family and click-through seeds the notari tab', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await searchFromExplore(page, 'popescu');

    const justitie = page.locator('[data-testid="federated-group"][data-group="justitie"]');
    await expect(justitie).toBeVisible({timeout: 90_000});
    const notaryRow = justitie.locator('[data-testid="federated-row"]', {hasText: 'Registrul notarilor publici'}).first();
    await expect(notaryRow).toBeVisible({timeout: 90_000});
    const clickedNotary = (await notaryRow.locator('strong').textContent())?.trim() || '';
    await notaryRow.click();

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('.domain-workspace')).toBeVisible();
    expect(page.url()).toContain('#view=domain&id=justitie&q=');
    expect(page.url()).toContain('&tab=notari');
    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 2, name: /Notari publici în registru/})).toBeVisible();
    // The workspace seed is the clicked notary's own published name — the document of record.
    expect(clickedNotary.length).toBeGreaterThan(3);
    await expect(workspace.getByLabel('Caută notar în registrul profesional')).toHaveValue(clickedNotary);
    expect(pageErrors).toEqual([]);
  });

  test('a station term surfaces the trains family and click-through seeds the trains tab', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await searchFromExplore(page, 'gara brasov');

    const transport = page.locator('[data-testid="federated-group"][data-group="transport"]');
    await expect(transport).toBeVisible({timeout: 90_000});
    const stationRow = transport.locator('[data-testid="federated-row"]', {hasText: 'Mersul trenurilor'}).first();
    await expect(stationRow).toBeVisible({timeout: 90_000});
    const clickedStation = (await stationRow.locator('strong').textContent())?.trim() || '';
    await stationRow.click();

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    expect(page.url()).toContain('#view=domain&id=transport&q=');
    expect(page.url()).toContain('&tab=trains');
    const workspace = page.locator('section.live-section');
    await expect(workspace.getByRole('heading', {level: 2, name: /Gări și mersul trenurilor/})).toBeVisible();
    expect(clickedStation.toLowerCase()).toContain('bra');
    await expect(workspace.getByLabel('Caută gara sau stația de tren')).toHaveValue(clickedStation);
    expect(pageErrors).toEqual([]);
  });

  test('an expert name surfaces the expert registries in the justiție group', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await searchFromExplore(page, 'petric agricultură');

    const justitie = page.locator('[data-testid="federated-group"][data-group="justitie"]');
    await expect(justitie).toBeVisible({timeout: 90_000});
    const expertRow = justitie.locator('[data-testid="federated-row"]', {hasText: 'Tabloul experților judiciari'}).first();
    await expect(expertRow).toBeVisible({timeout: 90_000});
    expect(pageErrors).toEqual([]);
  });
});
