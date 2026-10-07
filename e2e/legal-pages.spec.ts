import {test, expect, type Page} from '@playwright/test';

// The GDPR Art. 13 contract for the two legal pages: every string asserted here is
// written against verified code truths — the retention numbers mirror the watch sweep
// (180-day inactive watches, 365-day events), the email is the operator contact,
// and the coarsening decimals mirror app/local-weather.tsx (2) and
// lib/geographic-scope.ts (3). If the code changes, these assertions must chase it.
const operatorContact = 'contactretetesecrete@gmail.com';
const privacyMustContain = [
  operatorContact,
  '180 de zile',
  '365 de zile',
  'ANSPDCP',
  'Șterge-mi datele',
  '2 zecimale',
  '3 zecimale',
  'consimțământ',
  'Cloudflare',
];
const termsMustContain = [
  'agregator',
  'adevărul de referință',
  'Fără garanții',
  'Răspunderea',
  'Surse și licențe',
  'cereri automate',
];

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

async function expectFooterLegalLinks(page: Page) {
  const footer = page.locator('footer.vfooter');
  await expect(footer).toBeVisible();
  await expect(footer.getByRole('link', {name: 'Confidentialitate', exact: true})).toBeVisible();
  await expect(footer.getByRole('link', {name: 'Termeni', exact: true})).toBeVisible();
  const contact = footer.getByRole('link', {name: new RegExp(operatorContact)});
  await expect(contact).toBeVisible();
  await expect(contact).toHaveAttribute('href', 'mailto:' + operatorContact);
}

test.describe('Confidentialitate — Art. 13 privacy page', () => {
  test('the page serves the Art. 13 elements in the SSR HTML', async ({page}) => {
    const response = await page.request.get('/confidentialitate');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<h1>Confidentialitate</h1>');
    for (const required of privacyMustContain) {
      expect(html, `SSR HTML must contain "${required}"`).toContain(required);
    }
    // The retention numbers in the prose are the sweeper's numbers, verbatim.
    expect(html).toContain('180 de zile');
    expect(html).toContain('365 de zile');
    // Rights + complaint route to the Romanian supervisory authority.
    expect(html).toContain('https://www.anpdcp.ro/');
    // The standalone page carries the legal footer too.
    expect(html).toContain('href="/termeni"');
  });

  test('the page renders with the operator contact, retention and coarsening truths', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/confidentialitate');
    await expect(page.getByRole('heading', {level: 1, name: 'Confidentialitate'})).toBeVisible();
    const body = page.locator('main');
    await expect(body).toContainText(operatorContact);
    await expect(body).toContainText('180 de zile');
    await expect(body).toContainText('365 de zile');
    await expect(body).toContainText('2 zecimale');
    await expect(body).toContainText('3 zecimale');
    await expect(body).toContainText('Șterge-mi datele');
    await expect(body).toContainText('ANSPDCP');
    await expect(body).toContainText('Uniunea Europeană');
    // Coordinates never persisted server-side — the verified code truth, in prose.
    await expect(body).toContainText('nu sunt salvate pe server');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Termeni — terms of service page', () => {
  test('the page serves the TOS essentials in the SSR HTML', async ({page}) => {
    const response = await page.request.get('/termeni');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<h1>Termeni de utilizare</h1>');
    for (const required of termsMustContain) {
      expect(html, `SSR HTML must contain "${required}"`).toContain(required);
    }
    expect(html).toContain('href="/confidentialitate"');
  });

  test('the page renders the nature-of-service and liability limits', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/termeni');
    await expect(page.getByRole('heading', {level: 1, name: 'Termeni de utilizare'})).toBeVisible();
    const body = page.locator('main');
    await expect(body).toContainText('agregator');
    await expect(body).toContainText('adevărul de referință');
    await expect(body).toContainText('Fără garanții');
    await expect(body).toContainText('Răspunderea');
    await expect(body).toContainText('cereri automate');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Legal footer links', () => {
  test('the home footer carries the legal links and the contact email', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    await expectFooterLegalLinks(page);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the standalone catalog page carries the legal footer too', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/catalog');
    await expectFooterLegalLinks(page);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('First-use notices at the moment of collection', () => {
  test('the location control states coarsening and non-persistence beside the button', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/');
    const control = page.locator('.location-strip .location-control');
    await expect(control).toBeVisible();
    // The one-liner must sit next to the button that triggers the browser prompt.
    await expect(control).toContainText('rotunjite');
    await expect(control).toContainText('nu sunt salvate pe server');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the watch button tooltip says what gets saved and for how long', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.goto('/catalog');
    const watchButton = page.locator('.location-watch-row .watch-button');
    await expect(watchButton).toBeVisible();
    // The tooltip opens from a hydrated pointerenter handler; a hover fired during
    // the dev-server hydration window is lost, so the probe re-hovers until it opens.
    await expect(async () => {
      await watchButton.hover();
      await expect(page.getByText(/identificator anonim/).first()).toBeVisible({timeout: 1_000});
    }).toPass({timeout: 30_000});
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
