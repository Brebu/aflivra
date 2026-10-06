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

async function switchLocality(page: Page, locality: string) {
  await page.getByRole('button', {name: 'Pentru tine: localitate, interese și aspect'}).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Localitate').fill(locality);
  await sheet.getByRole('button', {name: 'Aplică localitatea'}).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
}

test.describe('Transit network view', () => {
  test('the bundled TPBI network renders lines, stops and filters under the default locality', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=transport');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('heading', {level: 2, name: 'Linii, stații și orare'})).toBeVisible();

    // The complete network load is a heavy bundled artifact — budget generously
    // rather than weakening the structural assertions on it.
    await expect(workspace.locator('.entity-grid .transit-card').first()).toBeVisible({timeout: 60_000});
    await expect(workspace.locator('.entity-grid .transit-card h3').first()).toHaveText(/^Linia /);
    await expect(workspace.getByText(/rezultate? · copia integrală: [\d.]+ (?:de )?(?:linie|linii), [\d.]+ (?:de )?(?:stație|stații), [\d.]+ (?:de )?(?:cursă|curse)/)).toBeVisible();

    // Structure: kind chips, filters and the search control on the network mode.
    await expect(workspace.getByLabel('Caută linii, operatori, stații și informații de transport')).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Linii', exact: true})).toBeVisible();
    await expect(workspace.getByRole('button', {name: 'Stații', exact: true})).toBeVisible();
    await expect(workspace.locator('label', {hasText: 'Ordonare'}).first()).toBeVisible();

    // Stops switch renders station cards from the same bundled network.
    await workspace.getByRole('button', {name: 'Stații', exact: true}).click();
    await expect(workspace.locator('.entity-grid .transit-card').first()).toBeVisible({timeout: 30_000});

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a locality outside the TPBI coverage shows the explicit coverage note — not an error state', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=transport');
    await waitForClientReady(page);
    const workspace = page.locator('section.transit-workspace');
    await expect(workspace).toBeVisible();

    // Cluj-Napoca is outside the București–Ilfov TPBI coverage; the degraded
    // structure is an explicit, named message plus the transport inventory,
    // never a live-error block.
    await switchLocality(page, 'Cluj-Napoca');
    await expect(workspace.getByRole('heading', {level: 2, name: 'Transport în Cluj-Napoca'})).toBeVisible();
    await expect(workspace.locator('.field-help').first()).toContainText('Nu avem încă o sursă validată pentru linii și orare în această zonă.');
    await expect(workspace.locator('.live-error')).toHaveCount(0);

    // The nearby transport inventory (stations, railways and transport services)
    // stays available inside the same section.
    await expect(workspace.locator('section.places-workspace').first()).toBeVisible({timeout: 30_000});
    await expect(workspace.locator('section.places-workspace').first().getByRole('heading', {name: 'Stații, gări și servicii de transport'})).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
