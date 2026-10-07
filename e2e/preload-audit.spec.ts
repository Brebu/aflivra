import {test, expect} from '@playwright/test';

// The service worker precaches /fonts/InterVariable.woff2 and answers its fetch
// directly from CacheStorage, so a network-level preload (HTML link tag or the
// HTTP Link header) can never be claimed by the font load — real Chrome
// orphans it and warns "preloaded but not used". The font must load through
// @font-face alone (font-display: swap keeps first paint instant).
test.describe('Head preload audit', () => {
  test('the served page declares no font or hero-image preload that a view cannot guarantee to use', async ({request}) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    const html = await response.text();

    // No font preload tag: the service worker owns this URL's fetch path.
    expect(html, 'font preload link must not be declared in HTML').not.toContain('/fonts/InterVariable.woff2" as="font');
    expect(html).not.toMatch(/<link[^>]*rel="preload"[^>]*as="font"/);

    // No hero image preload in HTML: the root layout SSRs the home view for every
    // URL (hash routing is client-only), so on deep links the hero unmounts at
    // hydration and a preloaded hero image is fetched but never used.
    expect(html, 'hero image preload must not be declared in HTML').not.toMatch(/<link[^>]*rel="preload"[^>]*as="image"/);

    // Module preloads, stylesheets and icons are used on every view and stay.
    expect(html).toMatch(/<link[^>]*rel="modulepreload"/);
    expect(html).toMatch(/<link[^>]*rel="stylesheet"/);

    // The HTTP Link header must not preload the font or the hero either — a
    // header preload fires on every response, including deep links.
    const linkHeader = response.headers()['link'] || '';
    expect(linkHeader, 'Link header must not preload the worker-cached font').not.toContain('InterVariable');
    expect(linkHeader, 'Link header must not preload the home-only hero image').not.toContain('hero-graphite');
  });

  test('the hero image renders on home with its natural img-level priority and no preload', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto('/#view=home');
    const heroPhoto = page.locator('img.hero-photo');
    await expect(heroPhoto).toBeVisible();
    await expect(heroPhoto).toHaveAttribute('src', /hero-graphite-blue\.webp$/);
    // fetchPriority belongs on the img itself — the browser fetches the first
    // body content image early and at high priority without any preload link.
    await expect(heroPhoto).toHaveAttribute('fetchpriority', 'high');
    expect(await heroPhoto.getAttribute('loading'), 'the hero stays an eager image').toBeNull();
    // No preload link for it may exist in the head either.
    await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveCount(0);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a deep link triggers no preload-initiated hero fetch and the font still loads exactly once', async ({page}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto('/#view=domain&id=transport');
    // Hash routing resolves client-side: the SSR home hero unmounts at hydration.
    await expect(page.locator('main#vcontent')).toHaveAttribute('data-view', 'domain');
    await expect(page.locator('img.hero-photo')).toHaveCount(0);

    // Wait out the preload-warning window so the assertion matches what a user
    // would see in the console, then audit how each critical resource was fetched.
    await page.waitForTimeout(6000);
    const audit = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return {
        heroEntries: resources.filter(e => e.name.includes('hero-graphite')).map(e => e.initiatorType),
        fontFetches: resources.filter(e => e.name.includes('InterVariable')).map(e => e.initiatorType),
        fontLoaded: [...document.fonts].some(f => f.family === 'Inter Aflivra' && f.status === 'loaded'),
        fontInUse: getComputedStyle(document.body).fontFamily.includes('Inter Aflivra'),
        preloadLinks: [...document.querySelectorAll('link[rel="preload"]')].map(l => l.getAttribute('as') + ':' + (l.getAttribute('href') || '')).filter(h => /font|image/.test(h)),
      };
    });
    // The SSR home hero is still in the raw HTML (the server cannot see the hash),
    // so the parser may fetch it before hydration swaps the view — but nothing may
    // be fetched as a *preload*: no link-initiated hero entry, no orphanable copy.
    expect(audit.heroEntries.filter(i => i === 'link'), 'no preload-initiated hero fetch on a deep link').toEqual([]);
    expect(audit.fontFetches, 'font must load exactly once, via @font-face').toEqual(['css']);
    expect(audit.fontLoaded, 'Inter Aflivra must be loaded (no FOUT regression)').toBe(true);
    expect(audit.fontInUse, 'body must render in Inter Aflivra').toBe(true);
    expect(audit.preloadLinks, 'no font/image preload link may remain in the DOM').toEqual([]);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
