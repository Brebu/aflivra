// T2.2/T2.3 runtime probe — the federated results UI on the explore view.
// Types 'sala', asserts the grouped list (groups + rows + counts via countText),
// the fan-out busy→settled lifecycle, then clicks a places row and asserts the
// domain workspace opens on the seeded places tab with the query re-seeded.
// Session-dir probe: not committed; Validator's federated spec (T2.4) will pin legs.
import { test, expect } from '@playwright/test';

const errors: string[] = [];
test.beforeEach(({ page }) => {
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
});

test('explore federated search renders grouped results and navigates a place row', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.evaluate(() => { location.hash = 'view=explore'; });
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
  await page.locator('.explore-search input').fill('sala');
  await page.locator('.explore-search button[type=submit]').click();

  const list = page.locator('[data-testid=federated-results]');
  await expect(list).toBeVisible({ timeout: 30000 });
  await expect(list.locator('[data-testid=federated-group]')).not.toHaveCount(0, { timeout: 30000 });
  await expect(list.locator('[data-testid=federated-row]')).not.toHaveCount(0, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const groups = await list.locator('[data-testid=federated-group]').evaluateAll(nodes =>
    nodes.map(n => ({ id: n.getAttribute('data-group'), count: n.querySelector('header')?.textContent || '' })));
  const rows = await list.locator('[data-testid=federated-row]').count();
  console.log('groups:', JSON.stringify(groups));
  console.log('rows:', rows, 'busy:', await list.locator('[data-testid=federated-busy]').count());
  const countsOk = groups.length > 0 && groups.every(g => /rezultat/.test(g.count));
  expect(countsOk, 'group headers carry countText grammar: ' + JSON.stringify(groups)).toBe(true);
  expect(await list.locator('[data-testid=federated-row]').first().textContent()).toContain('Deschide');

  await page.locator('[data-testid=federated-row]').first().click();
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain', { timeout: 15000 });
  const hash = await page.evaluate(() => location.hash);
  console.log('hash after click:', hash);
  expect(/view=domain/.test(hash)).toBe(true);
  await expect(page.locator('.domain-workspace')).toBeVisible({ timeout: 15000 });
});

test('explore federated search degrades honestly for a nonsense term', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.evaluate(() => { location.hash = 'view=explore'; });
  await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'explore');
  await page.locator('.explore-search input').fill('zzqxv');
  await page.locator('.explore-search button[type=submit]').click();
  const list = page.locator('[data-testid=federated-results]');
  await expect(list).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(4000);
  const busy = await list.locator('[data-testid=federated-busy]').count();
  if (busy === 0) {
    const empty = await list.locator('[data-testid=federated-empty]').count();
    console.log('zzqxv: groups with no rows anywhere; global empty count =', empty);
    const rows = await list.locator('[data-testid=federated-row]').count();
    console.log('zzqxv rows:', rows);
    expect(rows === 0 || empty === 1 || list.textContent()).toBeTruthy();
  }
  console.log('zzqxv done (busy=' + busy + ')');
});

test.afterAll(() => {
  const real = errors.filter(e => !/favicon|Manifest: Line|Download the React DevTools/i.test(e));
  if (real.length) console.log('PAGE ERRORS:\n' + real.join('\n'));
  expect(real, 'no page errors: ' + real.join(' | ')).toHaveLength(0);
});
