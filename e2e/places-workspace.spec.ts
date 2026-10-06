import {test, expect, type Page} from '@playwright/test';

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

test.describe('Places workspace', () => {
  test('national inventory renders with locality scope, nearby radius control and entity cards', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');

    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Muzee, teatre și obiective de vizitat'})).toBeVisible();
    await expect(workspace.getByLabel('Caută locuri, servicii, adrese și contacte')).toBeVisible();

    // Locality filter ("Unde cauți") — switching to nearby exposes the radius control
    // and the location city picker for the chosen locality.
    await waitForClientReady(page);
    const scopeSelect = workspace.locator('label', {hasText: 'Unde cauți'}).locator('select');
    await expect(scopeSelect).toBeVisible();
    await scopeSelect.selectOption('nearby');

    const radiusGroup = workspace.locator('.entity-location');
    await expect(radiusGroup).toBeVisible();
    await expect(radiusGroup.getByLabel('Localitate')).toBeVisible();
    await expect(radiusGroup.getByRole('button', {name: 'Aplică localitatea'})).toBeVisible();
    const radiusSelect = radiusGroup.locator('label', {hasText: 'Rază'}).locator('select');
    await expect(radiusSelect).toBeVisible();
    await radiusSelect.selectOption('30');

    // The scope note names the active radius; results then stream from the local API
    // against the bundled national inventory (no upstream network call here).
    await expect(workspace.locator('.field-help').first()).toContainText('raza de 30 km');
    await expect(workspace.locator('.entity-results-header')).toContainText(/rezultate/);
    await expect(workspace.locator('.entity-card').first()).toBeVisible({timeout: 30_000});

    // View chips and filter reset for the inventory.
    await expect(workspace.getByRole('button', {name: 'Fișe', exact: true})).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Harta paginii'})).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Resetează filtrele'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
