import {test, expect, type Page} from '@playwright/test';

// ShareAction contract: the native share sheet when the platform offers one
// (title/text/url with honest Romanian copy per surface), and a fallback
// sheet with Copy link + share-intent links (URL-encoded) when it doesn't.
// The share URL is always the URL the visitor is on (location.origin + the
// app route), so a share from a mirror or a local run is equally honest.

type ShareCall = {title?: string; text?: string; url?: string};

async function stubNavigatorShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shares: unknown[] = [];
    (window as unknown as Record<string, unknown>).__shareCalls = shares;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: unknown) => { shares.push(data); return Promise.resolve(); },
    });
  });
}

async function removeNavigatorShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {configurable: true, value: undefined});
  });
}

async function shareCalls(page: Page): Promise<ShareCall[]> {
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__shareCalls as ShareCall[] ?? []);
}

async function waitForClientReady(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reper.v2.preferences') !== null), {timeout: 30_000}).toBe(true);
}

test.describe('ShareAction on the home hero', () => {
  test('the share chip hands the app to navigator.share with honest copy', async ({page}) => {
    await stubNavigatorShare(page);
    await page.goto('/');
    await waitForClientReady(page);
    const share = page.getByRole('button', {name: 'Partajează Aflivra'});
    await expect(share).toBeVisible();
    await share.click();
    const calls = await shareCalls(page);
    expect(calls.length).toBe(1);
    expect(calls[0]!.title).toContain('Aflivra');
    expect(String(calls[0]!.text).length).toBeGreaterThan(10);
    expect(new URL(calls[0]!.url!)).toMatchObject({origin: new URL(page.url()).origin});
    // A successful native share never opens the fallback sheet.
    await expect(page.getByRole('dialog', {name: 'Partajează'})).toHaveCount(0);
  });

  test('without navigator.share, the fallback sheet copies the link and offers encoded intents', async ({page}) => {
    await removeNavigatorShare(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await waitForClientReady(page);
    await page.getByRole('button', {name: 'Partajează Aflivra'}).click();

    const sheet = page.getByRole('dialog', {name: 'Partajează'});
    await expect(sheet).toBeVisible();

    const expectedUrl = new URL('/', page.url()).href;
    const copy = sheet.getByRole('button', {name: 'Copiază linkul'});
    await expect(copy).toBeVisible();
    await copy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), {timeout: 10_000}).toBe(expectedUrl);
    await expect(page.getByText('Link copiat')).toBeVisible();

    // Share-intent links carry the URL-encoded share URL.
    const intents = new Map<string, string>();
    for (const label of ['Facebook', 'X', 'WhatsApp', 'Telegram', 'LinkedIn']) {
      const href = await sheet.getByRole('link', {name: new RegExp(label), exact: false}).getAttribute('href');
      expect(href, `intent link for ${label}`).toBeTruthy();
      intents.set(label, href!);
    }
    expect(decodeURIComponent(intents.get('Facebook')!)).toContain(expectedUrl);
    expect(decodeURIComponent(intents.get('WhatsApp')!)).toContain(expectedUrl);
    expect(decodeURIComponent(intents.get('Telegram')!)).toContain(expectedUrl);
    expect(decodeURIComponent(intents.get('LinkedIn')!)).toContain(expectedUrl);
    const xHref = intents.get('X')!;
    expect(decodeURIComponent(xHref)).toContain(expectedUrl);
    expect(xHref.startsWith('https://')).toBe(true);
  });
});

test.describe('ShareAction on the place profile', () => {
  test('the place toolbar shares the place: its name and its hash URL', async ({page}) => {
    await stubNavigatorShare(page);
    await page.goto('/#view=place&id=peles');
    await waitForClientReady(page);
    await expect(page.locator('.place-hero h1')).toHaveText('Castelul Peleș');

    const share = page.getByRole('button', {name: 'Partajează Castelul Peleș'});
    await expect(share).toBeVisible();
    // The share button replaces the old raw clipboard-copy "Distribuie" link.
    await expect(page.getByRole('button', {name: 'Distribuie'})).toHaveCount(0);
    await share.click();

    const calls = await shareCalls(page);
    expect(calls.length).toBe(1);
    expect(calls[0]!.title).toContain('Castelul Peleș');
    const shared = new URL(calls[0]!.url!);
    expect(shared.origin).toBe(new URL(page.url()).origin);
    expect(decodeURIComponent(shared.hash)).toBe('#view=place&id=peles');
  });
});

test.describe('ShareAction on the watch center', () => {
  test('the watch center shares the app', async ({page}) => {
    await stubNavigatorShare(page);
    await page.goto('/#view=watch');
    await waitForClientReady(page);
    const share = page.getByRole('button', {name: 'Partajează Aflivra'});
    await expect(share).toBeVisible();
    await share.click();
    const calls = await shareCalls(page);
    expect(calls.length).toBe(1);
    expect(calls[0]!.title).toContain('Aflivra');
    expect(new URL(calls[0]!.url!)).toMatchObject({origin: new URL(page.url()).origin, pathname: '/'});
  });
});
