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

// The marker set covers the full national inventory (267 repere), where dense clusters
// (București) overlap; this reper has no neighbour within a pin radius, so its centre is
// a deterministic, unobstructed hit target for the click and keyboard legs.
const MARKER = {label: 'Selectează Biserica Rotondă din Geoagiu', name: 'Biserica Rotondă din Geoagiu', id: 'osm-w780297975'};

async function openMapAtMarker(page: Page) {
  await page.goto('/#view=map');
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'map');
  await waitForClientReady(page);
  const marker = page.locator(`.map-workspace .romap g.map-pin[aria-label="${MARKER.label}"]`).first();
  // Keep the marker clear of the sticky header band before clicking.
  await marker.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 260));
  return marker;
}

test.describe('Hartă — reperele navighează la locul lor', () => {
  test('clicking a repere marker opens that place (#view=place&id=...)', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const marker = await openMapAtMarker(page);

    await marker.locator('circle').first().click();

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText(MARKER.name);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#view=place&id=${MARKER.id}`);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('keyboard activation (Enter) on a repere marker opens that place too', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    const marker = await openMapAtMarker(page);

    await marker.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'place');
    await expect(page.locator('.place-hero h1')).toHaveText(MARKER.name);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#view=place&id=${MARKER.id}`);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
