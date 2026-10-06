import {test, expect, type Page} from '@playwright/test';

// The legislative search may answer from the live Portal or fall back to the verified
// bundled code copies ("Ultima copie disponibilă"); any terminal chip is valid.
const validChips = new Set(['Sursă verificată', 'Ultima copie disponibilă', 'Indisponibil']);

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

test.describe('Legal workspace', () => {
  test('workspace loads with the legislative search form and the Codul penal results', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/#view=domain&id=justitie');
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await waitForClientReady(page);

    const legal = page.locator('.legal-workspace');
    await expect(legal).toBeVisible();
    await expect(legal.getByRole('tab', {name: 'Legislație'})).toBeVisible();
    await expect(legal.getByRole('tab', {name: 'Dosare în instanță'})).toBeVisible();

    const section = legal.locator('.legal-section').first();
    await expect(section.getByRole('heading', {level: 2, name: 'Găsește actul. Citește-l aici.'})).toBeVisible();
    await expect(section.getByLabel('Titlul sau subiectul actului')).toBeVisible();
    await expect(section.getByLabel('Cuvinte în textul actului')).toBeVisible();

    // The "Codul penal" quick topic: of the bundled code copies it is the one with a
    // verified consolidation (excluding asOf in the future), so the full-text fallback
    // is deterministic whether the Portal answers or not. Result titles differ between
    // the live Portal and the bundled copy — presence + act card structure is the contract.
    test.setTimeout(120_000);
    await section.getByRole('button', {name: 'Codul penal', exact: true}).click();
    await expect(section.locator('.law-result').first()).toBeVisible();
    await expect(section.locator('.law-result h3').first()).not.toBeEmpty();
    await expect(section.locator('.law-result').first().getByRole('button', {name: /Citește actul/})).toBeVisible();
    await expect(async () => {
      const chip = ((await section.locator('.live-freshness .source-chip').first().innerText()) || '').trim();
      expect(validChips.has(chip), `unexpected freshness chip: "${chip}"`).toBe(true);
    }).toPass({timeout: 10_000});

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the consolidated reader shows act facts, version status, TOC navigation and a per-article PDF download', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    test.setTimeout(180_000);
    await page.goto('/#view=domain&id=justitie');
    await waitForClientReady(page);
    const legal = page.locator('.legal-workspace');
    await expect(legal.getByRole('tab', {name: 'Legislație'})).toBeVisible();
    await legal.locator('.legal-section').first().getByRole('button', {name: 'Codul penal', exact: true}).click();
    await expect(legal.locator('.law-result').first()).toBeVisible();

    // Open the act reader ("Citește actul" on the first result).
    await legal.locator('.law-result').first().getByRole('button', {name: /Citește actul/}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Articole, alineate și istoricul formei oficiale · Portal Legislativ')).toBeVisible();

    // LawText structure: act facts, the version-status section, and the reader tools
    // ("Cuprinsul actului" TOC + in-act search) — the consolidated-reader contract.
    const reader = dialog.locator('.reader-body');
    await expect(reader.locator('.legal-act-facts')).toBeVisible({timeout: 90_000});
    await expect(reader.locator('section.law-version-status')).toBeVisible();
    await expect(reader.locator('section.law-version-status h3')).not.toBeEmpty();
    // The TOC select is addressed by id: its accessible label is also matched
    // substring-wise by the "Navighează în cuprinsul actului" nav beside it.
    const toc = reader.locator('select#law-article');
    await expect(toc).toBeVisible();
    await expect(toc.locator('option').first()).toHaveText('Întregul act');
    await expect(reader.getByLabel('Caută în acest act')).toBeVisible();

    // TOC article navigation: choosing any section shows the "Revino la act" exit.
    await toc.selectOption({index: 1});
    await expect(reader.getByRole('button', {name: 'Revino la act'})).toBeVisible();
    await toc.selectOption('');
    await expect(reader.locator('.law-text')).toBeVisible();

    // Per-article PDF export fires a browser download (pdf-lib + bundled fonts).
    const download = page.waitForEvent('download', {timeout: 60_000});
    await reader.locator('button.law-pdf-download').first().click();
    const received = await download;
    expect(received.suggestedFilename()).toMatch(/\.pdf$/);
    await received.cancel();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
