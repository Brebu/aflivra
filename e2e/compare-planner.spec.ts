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

test.describe('Compare, planner and the standalone catalog route', () => {
  test('compare selection is capped at three places and renders the comparison table', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=compare');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'compare');
    await waitForClientReady(page);
    await expect(page.getByRole('heading', {level: 1, name: 'O alegere mai clară, alături.'})).toBeVisible();

    // Two places are preselected (Peleș, Bran) → two comparison cards.
    const selection = page.locator('.compare-selection');
    await expect(selection).toContainText('Maximum 3 locuri');
    await expect(page.locator('.compare-cards article')).toHaveCount(2);

    // A third place joins the comparison.
    await selection.getByRole('button', {name: 'Salina Turda'}).click();
    await expect(page.locator('.compare-cards article')).toHaveCount(3);

    // A fourth is rejected: the toast states the cap and the selection stays at three.
    // The widened attested corpus also carries the OSM record of the real Ateneul
    // Român, so the same display name now appears twice: .first() picks the
    // editorial one and either way the cap toast is the assertion under test.
    await selection.getByRole('button', {name: 'Ateneul Român'}).first().click();
    await expect(page.getByText('Poți compara maximum 3 locuri. Elimină mai întâi un loc.')).toBeVisible();
    await expect(page.locator('.compare-selection button.selected')).toHaveCount(3);

    // The comparison table renders the shared criteria column.
    await expect(page.locator('.compare-table')).toBeVisible();
    await expect(page.locator('.compare-table thead th').first()).toHaveText('Ce te interesează');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('planner starts with the default stops, takes a budget and accepts one more stop', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=planner');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'planner');
    await waitForClientReady(page);
    await expect(page.getByRole('heading', {level: 1, name: 'Planul tău de explorare.'})).toBeVisible();

    // Default plan (Peleș, Bran) renders as ordered stops with the summary aside.
    await expect(page.locator('.plan-stop')).toHaveCount(2);
    await expect(page.getByRole('heading', {level: 2, name: 'Privirea de ansamblu'})).toBeVisible();
    await expect(page.locator('.plan-summary')).toContainText('Opriri');
    await expect(page.getByLabel('Bugetul tău total, în RON')).toBeVisible();
    await page.locator('#planBudget').fill('500');
    await expect(page.getByRole('button', {name: 'Descarcă planul'})).toBeVisible();

    // Adding a stop via the picker grows the plan and persists it to localStorage.
    await page.getByRole('combobox', {name: 'Adaugă o oprire'}).click();
    await page.getByRole('option', {name: 'Salina Turda'}).click();
    await expect(page.locator('.plan-stop')).toHaveCount(3);
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('reper.v2.plan') || '[]')).toContain('"turda"');

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the standalone /catalog route renders the full catalog with the back-to-platform link', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/catalog');
    await expect(page.locator('a.catalog-home')).toHaveText('Aflivra · Înapoi la platformă');
    await expect(page.getByLabel('Caută în catalogul național')).toBeVisible();

    const catalog = page.locator('.catalog-workspace');
    await expect(catalog.getByRole('heading', {level: 2, name: 'Toate datele publice, într-un singur catalog'})).toBeVisible();
    await expect(catalog.locator('.catalog-category-tabs')).toBeVisible();
    await expect(catalog.locator('.live-result-count')).toContainText(/seturi · \d+ pe această pagină/);
    await expect(page.getByLabel('Localitate', {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Aplică localitatea'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
