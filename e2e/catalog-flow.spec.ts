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

test.describe('National catalog', () => {
  test('category filter, search, result count and pagination render on the home catalog section', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'home');

    const catalog = page.locator('#national-catalog .catalog-workspace');
    await expect(catalog).toBeVisible();
    await expect(catalog.getByRole('heading', {level: 2, name: 'Toate datele publice, într-un singur catalog'})).toBeVisible();
    await expect(catalog.getByLabel('Caută în catalogul național')).toBeVisible();

    // Category filter chips (browseAll tabs) — select one and assert it becomes active.
    const tabs = catalog.locator('.catalog-category-tabs');
    await expect(tabs).toBeVisible();
    const allCategories = tabs.getByRole('button', {name: 'Toate categoriile', exact: true});
    await expect(allCategories).toBeVisible();
    await waitForClientReady(page);
    const sanatate = tabs.getByRole('button', {name: 'Sănătate', exact: true});
    await sanatate.click();
    await expect(sanatate).toHaveAttribute('aria-pressed', 'true');
    await expect(allCategories).toHaveAttribute('aria-pressed', 'false');

    // The verified inventory (bundled seed) renders a result count and dataset cards.
    await expect(catalog.locator('.live-result-count')).toContainText(/seturi · \d+ pe această pagină/);
    await expect(catalog.locator('.live-resource').first()).toBeVisible({timeout: 30_000});

    // Pagination elements: page input from the shared Pagination component.
    const pagination = catalog.locator('nav.live-pagination');
    await expect(pagination).toBeVisible();
    await expect(pagination).toContainText(/din \d+( · [\d.]+ (?:de )?rezultate?)?/);
    await expect(pagination.getByLabel('Numărul paginii')).toBeVisible();
    const next = pagination.getByRole('button', {name: 'Vezi mai mult'});
    await expect(next).toBeVisible();
    if (await next.isEnabled()) {
      await next.click();
      await expect(pagination.getByLabel('Numărul paginii')).toHaveValue('2');
    }

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
