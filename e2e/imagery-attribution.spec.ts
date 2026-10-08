import {test, expect, type Page} from '@playwright/test';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  return errors;
}

// SSR markup is visible before React attaches handlers; the mount effect writes the
// preferences key, so a non-null read proves the client app is interactive — the
// search form only carries a filled query once hydration owns the input.
async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

// The Wikidata imagery register legs: parks, schools, pharmacies and courts whose
// committed OSM row carries an exact Q-id with an attested Commons image render that
// image with its license chip — "Fotografie atestată local · Wikidata/Commons" — while
// rows without an attestation keep the honest AI illustration chip, branded pharmacy
// rows say "Fotografie de brand" (the chain, never that specific pharmacy), and the
// place detail surfaces one attested gallery photo per locality as tourism promotion,
// labeled clearly as NOT a photo of the place.
test.describe('Wikidata imagery attribution', () => {
  test('a park card with an attested Wikidata image renders it with the license chip and full gallery attribution', async ({page}) => {
    test.setTimeout(115_000);
    const pageErrors = collectPageErrors(page);
    const registerServed = page.waitForResponse(response => response.url().includes('/media/imagery-register.json'));
    await page.goto('/#view=domain&id=mediu');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible();
    const register = await registerServed;
    expect(register.status()).toBe(200);
    await waitForClientReady(page);

    const search = workspace.getByLabel('Caută locuri, servicii, adrese și contacte');
    await search.fill('Parcul Cișmigiu');
    await search.press('Enter');
    const card = workspace.locator('article.entity-card', {hasText: 'Parcul Cișmigiu'}).first();
    await expect(card).toBeVisible({timeout: process.env.CI ? 70_000 : 30_000});

    // The card swaps the AI illustration for the attested local file once the register
    // session lands; the chip states the honest provenance and the exact license.
    await expect(card.locator('.entity-card-image img')).toHaveAttribute('src', /^\/media\/wiki-q959632\./, {timeout: 30_000});
    await expect(card.locator('.entity-card-image figcaption')).toContainText('Fotografie atestată local · Wikidata/Commons');
    await expect(card.locator('.entity-card-image figcaption')).toContainText('CC BY-SA 3.0');
    await expect(card.locator('.entity-card-image figcaption')).not.toContainText('Ilustrație');

    // The detail gallery prepends the attested image with author, license and the
    // Commons source page — full attribution, not a bare anonymous img.
    await card.getByRole('button', {name: 'Toate informațiile și harta'}).click();
    const detail = card.locator('.entity-expanded');
    await expect(detail.first()).toBeVisible({timeout: 30_000});
    await expect(detail.locator('.public-media-gallery').first()).toBeVisible({timeout: 30_000});
    const galleryFigure = detail.locator('.public-media-gallery figure').first();
    await expect(galleryFigure.locator('img')).toHaveAttribute('src', /^\/media\/wiki-q959632\./);
    await expect(galleryFigure).toContainText('Mastermindsro');
    await expect(galleryFigure).toContainText('CC BY-SA 3.0');
    await expect(galleryFigure.getByRole('link', {name: 'Proveniența materialului'})).toHaveAttribute('href', /commons\.wikimedia\.org\/wiki\/File:Cismigiu/);
    await expect(galleryFigure.getByRole('link', {name: 'Condițiile licenței'})).toHaveAttribute('href', /creativecommons\.org/);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a pharmacy chain brand image is labeled as a brand photo, and an independent pharmacy without an attestation keeps the honest AI illustration chip', async ({page}) => {
    test.setTimeout(115_000);
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=sanatate&tab=places');
    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible({timeout: 30_000});
    await waitForClientReady(page);

    // Dr Max Romanian rows share the brand Q-id where they carry one: those cards show
    // the brand's Commons photo and say so — never claiming a photo of that pharmacy.
    // Rows of the same chain without the brand Q-id keep the honest AI illustration.
    const search = workspace.getByLabel('Caută locuri, servicii, adrese și contacte');
    await search.fill('Dr Max');
    await search.press('Enter');
    const brandCard = workspace.locator('article.entity-card:has(h3:text-is("Dr Max")):has(figcaption:has-text("Fotografie de brand · Wikidata/Commons"))').first();
    await expect(brandCard).toBeVisible({timeout: process.env.CI ? 70_000 : 30_000});
    await expect(brandCard.locator('.entity-card-image img')).toHaveAttribute('src', /^\/media\/wiki-q56317371\./, {timeout: 30_000});
    await expect(brandCard.locator('.entity-card-image figcaption')).toContainText('Fotografie de brand · Wikidata/Commons');
    await expect(brandCard.locator('.entity-card-image figcaption')).toContainText('CC BY-SA 3.0');
    await expect(brandCard.locator('.entity-card-image figcaption')).not.toContainText('atestată local');
    const plainChainCards = workspace.locator('article.entity-card:has(h3:text-is("Dr Max")):has(figcaption:has-text("Ilustrație reprezentativă · AI"))');
    expect(await plainChainCards.count(), 'chain rows without the brand Q-id keep the honest AI illustration').toBeGreaterThan(0);

    // An independent pharmacy with no Q-id at all keeps the honest AI illustration:
    // no invented photo, the label says exactly what it is.
    await search.fill('2NA Farm');
    await search.press('Enter');
    await expect(workspace.locator('article.entity-card').first()).toBeVisible({timeout: process.env.CI ? 70_000 : 30_000});
    const plainCards = workspace.locator('article.entity-card');
    const count = await plainCards.count();
    expect(count).toBeGreaterThan(0);
    for (let at = 0; at < Math.min(count, 6); at++) {
      const card = plainCards.nth(at);
      await expect(card.locator('.entity-card-image img')).toHaveAttribute('src', /^(?!.*\/media\/wiki-).*/);
      await expect(card.locator('.entity-card-image figcaption')).toContainText('Ilustrație reprezentativă · AI');
    }

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a court card shows its attested photograph and the locality tourism teaser from the attested gallery register', async ({page}) => {
    test.setTimeout(115_000);
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=justitie&tab=places');
    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible({timeout: 30_000});
    await waitForClientReady(page);

    const search = workspace.getByLabel('Caută locuri, servicii, adrese și contacte');
    await search.fill('Palatul de Justiție Sibiu');
    await search.press('Enter');
    const card = workspace.locator('article.entity-card:has(h3:text-is("Palatul de Justiție"))').first();
    await expect(card).toBeVisible({timeout: process.env.CI ? 70_000 : 30_000});

    // The Sibiu courthouse carries the exact entity Q-id: its attested image renders.
    await expect(card.locator('.entity-card-image img')).toHaveAttribute('src', /^\/media\/wiki-q43113639\./, {timeout: 30_000});
    await expect(card.locator('.entity-card-image figcaption')).toContainText('Fotografie atestată local · Wikidata/Commons');

    // The detail adds the locality tourism teaser: exactly one attested gallery photo
    // for the locality, clearly labeled as NOT a photo of this place.
    await card.getByRole('button', {name: 'Toate informațiile și harta'}).click();
    const detail = card.locator('.entity-expanded');
    await expect(detail.first()).toBeVisible({timeout: 30_000});
    const teaser = detail.locator('[data-testid="imagery-teaser"]');
    await expect(teaser).toBeVisible({timeout: 30_000});
    await expect(teaser.locator('.kicker')).toContainText('PROMOVARE TURISTICĂ · Sibiu');
    await expect(teaser.locator('img')).toHaveAttribute('src', /^\/media\/.+\.webp$/);
    await expect(teaser).toContainText('Nu este o fotografie a acestui loc.');
    await expect(teaser.getByRole('link', {name: /galeria fotografiată a localității/i})).toHaveAttribute('href', /^#view=place&id=/);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a school without an attested image keeps the honest AI illustration chip (no invented photography)', async ({page}) => {
    test.setTimeout(115_000);
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=educatie');
    const workspace = page.locator('section.places-workspace').first();
    await expect(workspace).toBeVisible({timeout: 30_000});
    await waitForClientReady(page);

    // Grădinițe (kindergartens) are corpus rows without Q-id attestations: whatever
    // the search returns, every card must be either honest AI illustration or an
    // attested/published image — never a bare anonymous photo.
    const search = workspace.getByLabel('Caută locuri, servicii, adrese și contacte');
    await search.fill('Grădinița');
    await search.press('Enter');
    await expect(workspace.locator('article.entity-card').first()).toBeVisible({timeout: process.env.CI ? 70_000 : 30_000});
    const cards = workspace.locator('article.entity-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    let aiChips = 0, attestedChips = 0;
    for (let at = 0; at < Math.min(count, 6); at++) {
      const card = cards.nth(at);
      const figcaption = card.locator('.entity-card-image figcaption');
      if ((await figcaption.count()) === 0) {
        // A card with a source-published hotlink shows no chip — it must never
        // show a register image it has no attestation for.
        await expect(card.locator('.entity-card-image img')).toHaveAttribute('src', /^(?!.*\/media\/wiki-).*/);
        continue;
      }
      const text = (await figcaption.textContent()) || '';
      if (text.includes('Ilustrație reprezentativă · AI')) aiChips++;
      if (text.includes('Wikidata/Commons')) attestedChips++;
      expect(text, 'every card discloses its image provenance chip').toMatch(/Ilustrație reprezentativă · AI|Wikidata\/Commons/);
    }
    expect(aiChips, 'the kindergarten query keeps honest AI-labeled cards').toBeGreaterThan(0);
    expect(attestedChips, 'no kindergarten card claims a Wikidata attestation it does not have').toBe(0);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
