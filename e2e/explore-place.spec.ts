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

test.describe('Explore → place → gallery → saved', () => {
  test('explore lists places, place detail opens with lightbox and save persists to localStorage and the saved view', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await expect(page.getByRole('heading', {level: 1, name: 'Explorează. Conectează. Înțelege.'})).toBeVisible();
    await expect(page.getByLabel('Caută în locuri și domenii')).toBeVisible();

    // First gallery card opens its place detail (#view=place).
    await waitForClientReady(page);
    const firstCard = page.locator('.exploration-gallery .place-card').first();
    await expect(firstCard).toBeVisible();
    const placeName = ((await firstCard.locator('.place-title').innerText()) || '').trim();
    await firstCard.locator('button.place-title').click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText(placeName);
    await expect(page.getByRole('button', {name: 'Înapoi la explorare'})).toBeVisible();

    // Lightbox on the bundled image gallery: title, credit and next photo navigation.
    await page.getByRole('button', {name: /Deschide galeria/}).click();
    const lightbox = page.getByRole('dialog');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByRole('heading', {name: placeName})).toBeVisible();
    await expect(lightbox.locator('.photo-credit').first()).toBeVisible();
    const next = lightbox.getByRole('button', {name: 'Fotografia următoare'});
    if (await next.count()) {
      await next.click();
      await expect(lightbox.getByText(/Fotografie reală · 2 \/ \d+/)).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();

    // Bookmark persists to localStorage reper.v2.saved and confirms via toast
    // (aria-label on the hero save button: "Salvează <place>"; after saving the
    // button flips to "Elimină <place>" with aria-pressed=true).
    const saveButton = page.locator('.place-hero').getByRole('button', {name: `Salvează ${placeName}`});
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await expect(page.getByText('Salvat pe acest dispozitiv')).toBeVisible();
    const savedToggle = page.locator('.place-hero').getByRole('button', {name: `Elimină ${placeName}`});
    await expect(savedToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(savedToggle).toContainText('Salvat');
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('reper.v2.saved') || '[]')).toContain('"peles"');

    // The saved view lists the bookmarked place with the per-device collection copy.
    await page.goto('/#view=saved');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'saved');
    await expect(page.getByRole('heading', {level: 1, name: 'Colecția ta de repere.'})).toBeVisible();
    await expect(page.locator('.place-card', {hasText: placeName})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Exportă colecția'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a typed region query surfaces places from that region and a no-match query shows the generic empty state', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByLabel('Caută un loc, o firmă sau un subiect').fill('Brașov');
    await page.locator('form.hero-search').getByRole('button', {name: 'Explorează', exact: true}).click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    // The gallery search string includes the place region, so the Brașov region
    // surfaces Bran alongside the city's own Piața Sfatului.
    await expect(page.locator('.exploration-gallery .place-card', {hasText: 'Castelul Bran'})).toBeVisible();

    // A genuine no-match query renders the generic empty state with its explanatory copy.
    await page.getByLabel('Caută în locuri și domenii').fill('zzqxv');
    await page.locator('form.explore-search').getByRole('button', {name: 'Caută', exact: true}).click();
    await expect(page.getByRole('heading', {level: 2, name: 'Niciun rezultat în selecția editorială'})).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
