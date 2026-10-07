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

// The „Mai multe perspective" grid on #view=explore: the .domain-grid that directly
// follows the section head carrying that heading.
function perspectivesGrid(page: Page) {
  return page.locator('.section-head:has(h2:text-is("Mai multe perspective")) + .domain-grid');
}

type CoverAudit = {
  cardCount: number;
  covers: number;
  complete: number;
  cards: {alt: string | null; currentSrc: string | null; srcSet: string | null; sizes: string | null; h3: string | null}[];
};

// Scroll every lazy cover into view, then read one row per card.
async function auditCovers(page: Page, grid: Awaited<ReturnType<typeof perspectivesGrid>>): Promise<CoverAudit> {
  const cards = grid.locator('button.domain-card');
  const cardCount = await cards.count();
  for (let i = 0; i < cardCount; i++) await cards.nth(i).scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => page.evaluate(() => {
        const grid = Array.from(document.querySelectorAll('.section-head h2'))
          .find(h => h.textContent?.trim() === 'Mai multe perspective')
          ?.closest('.section-head')
          ?.nextElementSibling;
        const imgs = grid ? (Array.from(grid.querySelectorAll('button.domain-card > .category-cover-frame > img.category-cover')) as HTMLImageElement[]) : [];
        return imgs.filter(i => i.complete && i.naturalWidth > 0).length;
      }),
      {timeout: 30_000}
    )
    .toBe(cardCount);
  return page.evaluate(() => {
    const grid = Array.from(document.querySelectorAll('.section-head h2'))
      .find(h => h.textContent?.trim() === 'Mai multe perspective')
      ?.closest('.section-head')
      ?.nextElementSibling;
    const cards = grid ? Array.from(grid.querySelectorAll(':scope > button.domain-card')) : [];
    return {
      cardCount: cards.length,
      covers: cards.filter(c => c.querySelector('.category-cover-frame > img.category-cover')).length,
      complete: cards.filter(c => {const i = c.querySelector('.category-cover-frame > img.category-cover') as HTMLImageElement | null; return !!i && i.complete && i.naturalWidth > 0}).length,
      cards: cards.map(c => {const img = c.querySelector('.category-cover-frame > img.category-cover') as HTMLImageElement | null; return {alt: img?.getAttribute('alt') ?? null, currentSrc: img?.currentSrc ?? null, srcSet: img?.getAttribute('srcset') ?? null, sizes: img?.getAttribute('sizes') ?? null, h3: c.querySelector('h3')?.textContent?.trim() ?? null}})
    };
  });
}

test.describe('Explore „Mai multe perspective" — category editorial images', () => {
  test('every domain card renders the dashboard category illustration: present, complete, manifest asset, variant-offering srcSet, AI-caption alt', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    const grid = perspectivesGrid(page);
    await expect(grid).toBeVisible();

    const audit = await auditCovers(page, grid);
    expect(audit.cardCount, 'the perspectives grid holds the full domain set').toBe(16);
    expect(audit.covers, 'every card renders a cover img from the shared category-photo component').toBe(16);
    expect(audit.complete, 'every cover is fetched and decoded (complete + naturalWidth)').toBe(16);

    // Provenance: every rendered currentSrc must be a file registered on the
    // category-illustrations manifest (the same register the dashboard covers use).
    const manifest = await page.evaluate(async () => (await fetch('/media/category-illustrations.json').then(r => r.json())) as {id: string; file: string; caption: string; variants: {file: string; width: number}[]}[]);
    const registered = new Set<string>();
    for (const entry of manifest) {registered.add(entry.file); for (const v of entry.variants || []) registered.add(v.file);}
    const captions = new Set(manifest.map(m => m.caption));
    for (const card of audit.cards) {
      const file = card.currentSrc ? new URL(card.currentSrc).pathname.replace(/^\/media\//, '').split(/[?#]/)[0] : '';
      expect(registered.has(file), `currentSrc must resolve to a registered manifest asset: ${card.h3} → ${card.currentSrc}`).toBe(true);
      expect(card.srcSet, `the cover must offer the 960w width variant like the dashboard: ${card.h3}`).toContain('960w');
      expect(card.sizes, `the cover must carry the shared sizes gate so the variant choice stays honest: ${card.h3}`).toBe('(max-width:640px) 92vw, 25rem');
      expect(card.alt ?? '', `alt must disclose the AI illustration like every dashboard cover: ${card.h3}`).toMatch(/^Ilustrație.*AI/);
      expect(captions.has(card.alt!), `alt must be a verbatim manifest caption: ${card.h3} → ${card.alt}`).toBe(true);
    }
    expect(pageErrors, 'no page errors while rendering 16 covers').toEqual([]);
  });

  test('the cover stays pointer-neutral: a press on the image navigates exactly like the card', async ({page}) => {
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    await waitForClientReady(page);
    const grid = perspectivesGrid(page);
    await expect(grid).toBeVisible();

    // Press the first card's cover img itself (the whole image is inside the button).
    const firstCard = grid.locator('button.domain-card').first();
    await firstCard.scrollIntoViewIfNeeded();
    const firstCardTitle = ((await firstCard.locator('h3').innerText()) || '').trim();
    expect(firstCardTitle).toBe('Orașul tău');
    await firstCard.locator('img.category-cover').first().click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('view=domain');

    // The special-cased categories keep their routes with the cover present.
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    const bani = grid.locator('button.domain-card', {has: page.locator('h3', {hasText: 'Bani & economie'})});
    await bani.scrollIntoViewIfNeeded();
    await bani.locator('img.category-cover').first().click();
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'money');
  });

  test('mobile keeps the single-column grid and card order with every cover rendering', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    const grid = perspectivesGrid(page);
    await expect(grid).toBeVisible();

    const audit = await auditCovers(page, grid);
    expect(audit.cardCount).toBe(16);
    expect(audit.covers).toBe(16);
    expect(audit.complete).toBe(16);
    // One card per row at 390px (the grid's mobile shape is unchanged by the images).
    const widths = await grid.locator('button.domain-card').evaluateAll(cards => cards.map(c => Math.round((c as HTMLElement).offsetWidth)));
    expect(new Set(widths).size, 'all cards share the single-column track width').toBe(1);
    // The domain order is the model order, untouched by the wiring change.
    expect(audit.cards[0].h3).toBe('Orașul tău');
    expect(audit.cards.at(-1)!.h3).toBe('Știri & actualitate');
  });
});
