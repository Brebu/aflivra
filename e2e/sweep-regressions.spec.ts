import {test, expect, type Page} from '@playwright/test';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

test.describe('Sweep repair pins', () => {
  test('the AFIR feed renders each article once: unique titles, no duplicate React keys', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    // The duplicated-article defect first surfaced as React duplicate-key console
    // errors on the agricultura news feed, so the console itself is part of the pin.
    const duplicateKeyErrors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error' && /two children with the same key/.test(message.text())) duplicateKeyErrors.push(message.text());
    });
    await page.goto('/#view=domain&id=agricultura');
    await expect(page.locator('.domain-hero h1')).toHaveText('Pământ & agricultură');
    const articles = page.locator('[data-testid="feed-article"]');
    await expect.poll(async () => articles.count(), {timeout: 45_000}).toBeGreaterThanOrEqual(1);
    const titles = (await articles.locator('h3').allInnerTexts()).map(title => title.trim());
    expect(titles.length).toBeGreaterThanOrEqual(1);
    // Every served article renders once: no repeated headline in the list.
    expect(new Set(titles).size, `duplicated feed titles: ${titles.join(' | ')}`).toBe(titles.length);
    expect(duplicateKeyErrors, `duplicate React keys: ${duplicateKeyErrors.join(' | ')}`).toEqual([]);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the public catalog page serves its h1 in the server-rendered HTML', async ({page}) => {
    const response = await page.request.get('/catalog');
    expect(response.status()).toBe(200);
    // The page heading must exist before hydration — an SSR contract, not a client effect.
    const html = await response.text();
    expect(html).toContain('<h1>Catalogul de date publice ale României</h1>');
  });
});
