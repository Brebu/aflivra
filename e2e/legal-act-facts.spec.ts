import {test, expect, type Page} from '@playwright/test';

// Wave B (B-4) — the legal reader surfaces, for the same validated act id, the metadata the
// MJ portal publishes: the consolidation history (the act's version events, each carrying its
// own official document address) rendered below the selected version — selection itself stays
// untouched; and the bibliographic facts the official search already holds for that exact act
// id, surfaced when the portal page cannot be read (probe-pinned this session: the portal
// refused connections), instead of a bare error.
test.describe('Legal act facts for the same act id (Wave B)', () => {
  const now = () => new Date().toISOString();
  const actId = 'https://legislatie.just.ro/Public/DetaliiDocument/70001';
  const baseId = 'https://legislatie.just.ro/Public/DetaliiDocument/70000';
  const today = () => new Date().toISOString().slice(0, 10);

  const searchState = () => ({
    key: 'law:search.v5:probe', name: 'Portal Legislativ · Ministerul Justiției', url: 'https://legislatie.just.ro/', adapterVersion: 'legislation.search.v5',
    status: 'fresh', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {
      items: [{id: actId, title: 'LEGE de verificare pentru fișa actului', type: 'LEGE', number: '1', date: '2009-06-17T00:00:00', issuer: 'Parlamentul României', publication: 'Monitorul Oficial nr. 510', sourceUrl: actId, year: '2009'}],
      hasMore: false, pageSize: 10,
    },
  });

  const fullState = () => ({
    key: 'law:consolidated.v2:probe', name: 'Portal Legislativ · Ministerul Justiției', url: 'https://legislatie.just.ro/', adapterVersion: 'legislation.consolidated.v2',
    status: 'fresh', publishedAt: '2026-01-01', lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: null, error: null, ttlSeconds: 3600,
    data: {
      items: [{
        id: actId, title: 'LEGE de verificare pentru fișa actului', type: 'LEGE', number: '1', date: '2009-06-17T00:00:00',
        issuer: 'Parlamentul României', publication: 'Monitorul Oficial nr. 510', sourceUrl: actId, textProvided: true,
        text: 'Art. 1\n(1) Legea penală stabilește regulile de aplicare.\n\nArt. 2\n(1) Text de verificare pentru cititor.',
        consolidation: {
          kind: 'consolidated', versionId: '70001', versionDate: '2026-01-01', asOf: today(), checkedAt: now(), sourceUrl: actId, futureVersions: [],
          versionHistory: [
            {id: '70000', date: '2009-06-17', kind: 'base'},
            {id: '70001', date: '2026-01-01', kind: 'consolidated'},
          ],
        },
      }],
      hasMore: false, pageSize: 1,
    },
  });

  async function waitForClientReady(page: Page) {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null).catch(() => false), {timeout: 30_000}).toBe(true);
  }

  test('the reader renders the official version history of the same act id, each event on its official address', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    let fullLoads = 0;
    await page.route('**/api/legal', async route => {
      const body = route.request().postDataJSON();
      if (body?.full) { fullLoads++; return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(fullState())}); }
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(searchState())});
    });
    await page.goto('/#view=domain&id=justitie');
    await waitForClientReady(page);
    await page.getByLabel('Titlul sau subiectul actului').fill('LEGE de verificare');
    await page.getByRole('button', {name: 'Caută acte normative'}).click();
    const result = page.locator('.law-result', {hasText: 'LEGE de verificare pentru fișa actului'}).first();
    await expect(result).toBeVisible({timeout: 30_000});
    await result.getByRole('button', {name: /Citește actul/}).click();
    const dialog = page.locator('.reader-dialog').first();
    await expect(dialog).toBeVisible({timeout: 30_000});
    // The reader's dialog title is the act's own title, matched exactly on the act id.
    await expect(dialog).toContainText('LEGE de verificare pentru fișa actului');
    // The version-history events the portal publishes for this act id render below the
    // selected version, each on its own official DetaliiDocument address.
    const history = dialog.locator('.law-version-history');
    await expect(history).toBeVisible();
    await expect(history).toContainText('Istoricul formelor oficiale');
    await expect(history).toContainText('17 iun. 2009');
    await expect(history).toContainText('Formă de bază');
    await expect(history).toContainText('Formă consolidată');
    await expect(history.locator('a[href="' + baseId + '"]')).toBeVisible();
    // The selected form line stays the consolidation verdict (selection untouched).
    await expect(dialog.locator('.law-version-status')).toBeVisible();
    expect(fullLoads, 'the act is opened through the full-reader path').toBeGreaterThanOrEqual(1);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('when the portal page cannot be read, the act keeps its official-search bibliographic facts', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route('**/api/legal', async route => {
      const body = route.request().postDataJSON();
      if (body?.full) return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({key: 'law:probe', name: 'Portal Legislativ', url: 'https://legislatie.just.ro/', adapterVersion: 'legislation.consolidated.v2', status: 'unavailable', publishedAt: null, lastSuccessAt: now(), lastAttemptAt: now(), nextAttemptAt: now(), error: 'Portalul Legislativ nu poate transmite textul acum.', ttlSeconds: 3600, data: null})});
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(searchState())});
    });
    await page.goto('/#view=domain&id=justitie');
    await waitForClientReady(page);
    await page.getByLabel('Titlul sau subiectul actului').fill('LEGE de verificare');
    await page.getByRole('button', {name: 'Caută acte normative'}).click();
    const result = page.locator('.law-result', {hasText: 'LEGE de verificare pentru fișa actului'}).first();
    await expect(result).toBeVisible({timeout: 30_000});
    await result.getByRole('button', {name: /Citește actul/}).click();
    const dialog = page.locator('.reader-dialog').first();
    await expect(dialog).toBeVisible({timeout: 30_000});
    // The honest degrade keeps the act's own bibliographic facts from the official search —
    // same act id, from the same response the row came from — never a search guess.
    await expect(dialog).toContainText('Portalul Legislativ nu poate transmite textul acum.');
    const bibliographic = dialog.locator('.act-bibliographic-facts');
    await expect(bibliographic).toBeVisible();
    await expect(bibliographic).toContainText('Datele bibliografice ale actului');
    await expect(bibliographic).toContainText('Parlamentul României');
    await expect(bibliographic).toContainText('Monitorul Oficial nr. 510');
    await expect(bibliographic).toContainText('din căutarea oficială');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
