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
// preferences key, so a non-null read proves the client app is interactive.
async function waitForClientReady(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

// Gallery images must survive every re-render the page performs on its own:
// an Aflivra-scope state change (the filter chips) and the 60-second live-data
// refresh tick both re-render the page, and no legitimate re-render replaces a
// still-mounted place card's <img> element. Element identity is the oracle — a
// recreated <img> restarts loading every time, which is the reported defect
// (images reloading continuously on the explore view after a page refresh).
test.describe('Explore gallery image stability', () => {
  test('gallery place images keep their DOM elements and are not re-fetched across page re-renders', async ({page}) => {
    test.setTimeout(115_000);
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=explore');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
    const gallery = page.locator('.exploration-gallery');
    await expect(gallery.locator('.place-card').first()).toBeVisible({timeout: 45_000});
    await waitForClientReady(page);

    // Mark every gallery image element in the live DOM.
    const beforeCount = page.evaluate(() => {
      document.querySelectorAll('.exploration-gallery img').forEach((img, index) => (img as HTMLElement).dataset.stab = String(index));
      return document.querySelectorAll('.exploration-gallery img').length;
    });
    expect(await beforeCount).toBeGreaterThan(0);

    // Part 1: an Aflivra-scope re-render with unchanged gallery content — the
    // 'Locuri cu galerii' chip keeps the same cards and the same images.
    await page.locator('.filter-bar .chip-row button').filter({hasText: 'Locuri cu galerii'}).click();
    await expect(page.locator('.filter-bar .chip-row button.selected').filter({hasText: 'Locuri cu galerii'})).toBeVisible();
    await page.waitForTimeout(1_500);
    const keptAfterChip = await page.evaluate(() => document.querySelectorAll('.exploration-gallery img[data-stab]').length);
    expect(keptAfterChip, 'gallery <img> elements must survive an Aflivra re-render (chip filter change)').toBe(await beforeCount);

    // Part 2: settle past the initial live-data arrivals, then hold a window that
    // contains the 60-second live refresh tick (four noise-free assertions: same
    // DOM img elements, and no /media image requests re-issued for the gallery).
    await page.waitForTimeout(12_000);
    await page.evaluate(() => {
      document.querySelectorAll('.exploration-gallery img').forEach((img, index) => (img as HTMLElement).dataset.stab = 'w' + index);
    });
    const windowCount = await page.evaluate(() => document.querySelectorAll('.exploration-gallery img').length);
    const mediaRequests: string[] = [];
    page.on('request', request => {
      if (request.resourceType() === 'image' || /\.(webp|png|jpe?g|gif|avif)(?:\?|$)/i.test(request.url())) mediaRequests.push(request.url());
    });
    await page.waitForTimeout(64_000);
    const keptAfterTick = await page.evaluate(() => document.querySelectorAll('.exploration-gallery img[data-stab]').length);
    expect(keptAfterTick, 'gallery <img> elements must survive the 60-second live-data refresh tick').toBe(windowCount);
    const mediaReloads = mediaRequests.filter(url => url.includes('/media/'));
    expect(mediaReloads, `gallery images must not be re-fetched by re-renders: ${mediaReloads.join(' | ')}`).toEqual([]);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
