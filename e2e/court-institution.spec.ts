import {test, expect, type Page} from '@playwright/test';

// Wave B (B-2) — the dosar court card surfaces the institution registry's own metadata:
// the court type and the locality/territory named in the institution's published label
// (public/courts/institutions.json), rendered on each stage of the dosar journey; and the
// dosar→legal-act link honesty the probe settled: the portal's programmatic responses cite
// acts by number and year inside the solution text only — no act identifiers are published,
// so the surface states the absence instead of guessing a search link.
test.describe('Court institution metadata on dosar stages (Wave B)', () => {
  const now = () => new Date().toISOString();
  const hearing = {
    date: '2026-01-05T00:00:00', time: '11:00', panel: 'Complet de verificare', result: 'Admis fond',
    summary: 'Sentința civilă nr. 1/F din 05 ianuarie 2026 pronunțată de Tribunalul Bihor în dosarul nr. 6236/111/2017.',
    pronouncementDate: '2026-01-05T00:00:00', document: 'Hotărâre', documentNumber: '1/2026', documentDate: '2026-01-05T00:00:00',
  };
  const record = (id: string, court: string, courtLabel: string, stage: string) => ({
    id, number: '6236/111/2017', court, courtLabel, department: 'Secția civilă', category: 'Litigii de muncă', stage,
    date: '2017-12-01', modified: '2026-10-05', parties: [{name: 'Parte publică', role: 'Reclamant'}], appeals: [], hearings: [hearing],
  });
  const courtSourceState = () => ({
    key: 'court:records.v5:probe', name: 'Portalul instanțelor · date publice', url: 'https://portal.just.ro', adapterVersion: 'portal.deep-records.v6',
    status: 'fresh', publishedAt: '2026-10-05', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 300,
    data: {
      items: [
        record('probe-tbihor', 'TribunalulBIHOR', 'Tribunalul Bihor', 'Fond'),
        record('probe-caoradea', 'CurteadeApelORADEA', 'Curtea de Apel Oradea', 'Apel'),
      ],
      searchScope: 'number-all-courts', note: 'Fișă publică din portalul instanțelor.',
    },
  });

  async function waitForClientReady(page: Page) {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false), {timeout: 30_000}).toBe(true);
  }

  test('stage rows carry the institution type and locality from the registry label', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route('**/api/legal', async route => {
      if (route.request().method() === 'POST') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(courtSourceState())});
      return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: 'necunoscut'})});
    });
    await page.goto('/#view=domain&id=justitie&tab=legal');
    await waitForClientReady(page);
    await page.getByRole('tab', {name: 'Dosare în instanță'}).click();
    await page.getByLabel('Număr dosar', {exact: true}).fill('6236/111/2017');
    await page.getByRole('button', {name: 'Caută dosare'}).click();

    const panel = page.locator('.court-history-panel', {hasText: 'Parcursul dosarului 6236/111/2017'});
    await expect(panel).toBeVisible({timeout: 30_000});
    // The institution label published by the registry splits into type + locality words on
    // every confirmed stage — the values come from the registry, never from name matching.
    const fondStage = panel.locator('.court-stage', {hasText: 'Fond'});
    await expect(fondStage).toBeVisible();
    await expect(fondStage.locator('.court-stage-institution')).toHaveText('Tribunal · Bihor');
    const apelStage = panel.locator('.court-stage', {hasText: 'Apel'});
    await expect(apelStage.locator('.court-stage-institution')).toHaveText('Curte de Apel · Oradea');
    // The links honesty the probe settled: no act identifiers are published, so the surface
    // states the absence instead of linking a search guess.
    await expect(panel).toContainText('legături programatice');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the dosar document tab discloses the act-citation absence without search guesses', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route('**/api/legal', async route => {
      if (route.request().method() === 'POST') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(courtSourceState())});
      return route.fulfill({status: 404, contentType: 'application/json', body: JSON.stringify({error: 'necunoscut'})});
    });
    await page.goto('/#view=domain&id=justitie&tab=legal');
    await waitForClientReady(page);
    await page.getByRole('tab', {name: 'Dosare în instanță'}).click();
    await page.getByLabel('Număr dosar', {exact: true}).fill('6236/111/2017');
    await page.getByRole('button', {name: 'Caută dosare'}).click();

    const card = page.locator('.court-case-group .court-case', {hasText: 'Dosar 6236/111/2017'}).first();
    await expect(card).toBeVisible({timeout: 30_000});
    await card.getByRole('button', {name: 'Vezi toate detaliile'}).click();
    await card.getByRole('tab', {name: /Hotărâri și documente/}).click();
    // The documents tab declares what the portal does and does not publish for act citations.
    await expect(card).toContainText('legături programatice');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
