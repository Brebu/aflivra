import {test, expect, type Page} from '@playwright/test';
import {readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';

// The site's canonical origin — the same absolute base the deploy scripts and
// relays pin (aflivra.brebu.workers.dev). Every SEO artifact that names a URL
// (sitemap, robots Sitemap line, canonical, og:url) must resolve against it.
const SITE = 'https://aflivra.brebu.workers.dev';

// The crawlable surface is route-derived: every app/*/page.tsx (the SPA at /
// carries the hash views; /api/* route handlers are data endpoints, never
// pages). A new page.tsx without a sitemap entry fails this gate.
function pageRoutes(): string[] {
  const appDir = join(import.meta.dirname, '..', 'app');
  const routes = ['/'];
  for (const entry of readdirSync(appDir, {withFileTypes: true})) {
    if (!entry.isDirectory() || entry.name === 'api') continue;
    if (existsSync(join(appDir, entry.name, 'page.tsx'))) routes.push('/' + entry.name);
  }
  return routes.sort();
}

// robots.txt groups: consecutive User-agent lines followed by directives,
// separated by blank lines. Parsed, not pattern-matched, so a directive added
// to the wrong group cannot pass by adjacency.
function robotsGroups(text: string): {agents: string[]; directives: string[]}[] {
  const groups: {agents: string[]; directives: string[]}[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const agents: string[] = [], directives: string[] = [];
    for (const raw of block.split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (key.trim().toLowerCase() === 'user-agent') agents.push(value);
      else directives.push(`${key.trim()}: ${value}`);
    }
    if (agents.length && directives.length) groups.push({agents, directives});
  }
  return groups;
}

// Every AI crawler we promise an explicit policy to. Claude-Web does not exist
// as a user agent; the real Anthropic fetchers are ClaudeBot (indexing),
// Claude-User (user-initiated) and Claude-SearchBot (search).
const AI_AGENTS = ['GPTBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended', 'Bytespider'];

async function metaContent(page: Page, selector: string): Promise<string> {
  const locator = page.locator(`head ${selector}`);
  await expect(locator).toHaveCount(1);
  return (await locator.getAttribute('content')) ?? '';
}

test.describe('robots.txt policy', () => {
  test('all crawlers are allowed except /api/, with explicit AI-agent sections and the sitemap', async ({request}) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const text = await response.text();
    const groups = robotsGroups(text);

    // General group: everything allowed except the data API surface.
    const general = groups.find(group => group.agents.includes('*'));
    expect(general, 'a User-agent: * group with directives must exist').toBeDefined();
    expect(general!.directives).toContain('Allow: /');
    expect(general!.directives).toContain('Disallow: /api/');
    expect(general!.directives).not.toContain('Disallow: /');

    // Explicit allow sections for the AI agents, same polite /api/ carve-out.
    for (const agent of AI_AGENTS) {
      const group = groups.find(candidate => candidate.agents.includes(agent));
      expect(group, `explicit robots section for ${agent}`).toBeDefined();
      expect(group!.directives).toContain('Allow: /');
      expect(group!.directives).toContain('Disallow: /api/');
    }

    // The sitemap is declared as an absolute URL.
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});

test.describe('sitemap.xml', () => {
  test('enumerates exactly the app route tree, absolute URLs, honest lastmod', async ({request}) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');

    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => match[1]);
    const locs = entries.map(entry => /<loc>([^<]+)<\/loc>/.exec(entry)?.[1] ?? '');
    expect(locs).toEqual(pageRoutes().map(route => `${SITE}${route}`));

    // lastmod is required, a real date (YYYY-MM-DD), never in the future
    // (one day of tolerance: the committing machine's local date can be a
    // few hours ahead of the runner's UTC date).
    const ceiling = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 10);
    for (const entry of entries) {
      const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(entry)?.[1] ?? '';
      expect(/^\d{4}-\d{2}-\d{2}$/.test(lastmod), `lastmod must be a date, found "${lastmod}"`).toBe(true);
      expect(lastmod <= ceiling, `lastmod ${lastmod} is in the future`).toBe(true);
    }
  });
});

test.describe('llms.txt for AI agents', () => {
  test('llms.txt states what the site is, its surfaces, sources, refresh semantics, contact, license and sitemap', async ({request}) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text.trimStart().startsWith('# Aflivra')).toBe(true);
    expect(text).toMatch(/agregator/i);
    expect(text).toContain('date publice oficiale');
    expect(text).toContain('Urmăriri și notificări');
    expect(text).toContain('contactretetesecrete@gmail.com');
    expect(text).toContain('licen');
    expect(text).toContain(`${SITE}/sitemap.xml`);
    expect(text).toContain('llms-full.txt');
    // The honest refresh contract: worker-side daily crons + weekly relays.
    expect(text).toContain('zilnic');
    expect(text).toContain('săptămânal');
    // The MCP connector for AI consumers is part of the discoverable surface.
    expect(text).toContain('/api/mcp');
    expect(text).toContain('34 de tool-uri');
  });

  test('llms-full.txt is the expanded per-domain guide covering all 16 domains', async ({request}) => {
    const response = await request.get('/llms-full.txt');
    expect(response.status()).toBe(200);
    const full = await response.text();
    const short = await (await request.get('/llms.txt')).text();
    expect(full.length).toBeGreaterThan(short.length);

    // The 16 domain labels from app/v2-model.ts — a domain missing from the
    // guide breaks this gate (the guide must follow the app's inventory).
    for (const domain of ['Orașul tău', 'Vreme și prognoză', 'Bani & economie', 'Firme, pe înțeles', 'Natură și mediu',
      'În mișcare', 'Sănătate aproape', 'Educație & viitor', 'Cultură și turism', 'Muncă & oportunități',
      'Lege & administrație', 'Energie & consum', 'Pământ & agricultură', 'Filme și cinematografe',
      'Povești și lectură', 'Știri & actualitate']) {
      expect(full, `llms-full.txt must cover the domain "${domain}"`).toContain(domain);
    }
    expect(full).toContain('contactretetesecrete@gmail.com');
    expect(full).toContain('/catalog');
  });
});

test.describe('og-image.png', () => {
  test('serves a real 1200×630 PNG under the size budget', async ({request}) => {
    const response = await request.get('/og-image.png');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    const buffer = Buffer.from(await response.body());
    expect(buffer.length).toBeGreaterThan(10_000);
    expect(buffer.length, `og-image.png must stay under 300 KB (found ${buffer.length} bytes)`).toBeLessThanOrEqual(300 * 1024);
    // PNG signature + IHDR: the image is exactly the OG canvas, not a fallback asset.
    expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(buffer.readUInt32BE(16)).toBe(1200);
    expect(buffer.readUInt32BE(20)).toBe(630);
  });
});

test.describe('home head: indexable, canonical, full OG/Twitter set', () => {
  test('home is index,follow and carries the complete Open Graph + Twitter card', async ({page}) => {
    await page.goto('/');
    const robots = await metaContent(page, 'meta[name="robots"]');
    expect(robots.toLowerCase()).not.toContain('noindex');
    expect(robots.toLowerCase()).not.toContain('nofollow');
    expect(robots.toLowerCase()).toContain('index');
    expect(robots.toLowerCase()).toContain('follow');

    // The pinned origin, with or without the trailing slash the root normalizes to.
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', /aflivra\.brebu\.workers\.dev\/?$/);
    expect((await page.locator('head link[rel="canonical"]').getAttribute('href'))!.startsWith(SITE)).toBe(true);

    expect(await metaContent(page, 'meta[property="og:title"]')).toBe('Aflivra — România la îndemână');
    expect(await metaContent(page, 'meta[property="og:description"]')).toContain('Date din surse publice');
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe('website');
    expect((await metaContent(page, 'meta[property="og:url"]'))!.replace(/\/$/, '')).toBe(SITE);
    expect(await metaContent(page, 'meta[property="og:site_name"]')).toBe('Aflivra');
    expect(await metaContent(page, 'meta[property="og:locale"]')).toBe('ro_RO');
    expect(await metaContent(page, 'meta[property="og:image"]')).toBe(`${SITE}/og-image.png`);
    expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe('1200');
    expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe('630');
    expect((await metaContent(page, 'meta[property="og:image:alt"]')).length).toBeGreaterThan(10);

    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await metaContent(page, 'meta[name="twitter:title"]')).toBe('Aflivra — România la îndemână');
    expect((await metaContent(page, 'meta[name="twitter:description"]')).length).toBeGreaterThan(10);
    expect(await metaContent(page, 'meta[name="twitter:image"]')).toBe(`${SITE}/og-image.png`);
  });

  test('home carries structured data for WebSite and SoftwareApplication in the SSR HTML', async ({page}) => {
    const response = await page.goto('/');
    const html = await response!.text();
    // The crawler truth: JSON-LD must be in the server-rendered HTML, not
    // written after hydration.
    expect(html).toContain('application/ld+json');
    const nodes = await page.locator('script[type="application/ld+json"]').evaluateAll(
      elements => elements.map(element => JSON.parse(element.textContent ?? '{}')));
    const graph = (nodes[0] as {'@graph'?: Record<string, unknown>[]})?.['@graph'] ?? nodes;
    const website = graph.find(node => node['@type'] === 'WebSite') as Record<string, unknown>;
    expect(website).toBeDefined();
    expect(website.name).toBe('Aflivra');
    expect(website.url).toBe(`${SITE}/`);
    expect(website.inLanguage).toBe('ro');

    const app = graph.find(node => node['@type'] === 'SoftwareApplication' || node['@type'] === 'WebApplication') as Record<string, any>;
    expect(app).toBeDefined();
    expect(app.applicationCategory).toBeDefined();
    expect(String(app.operatingSystem)).toBe('Web');
    expect(String(app.offers?.price)).toBe('0');
    expect(JSON.stringify(app.publisher)).toContain('contactretetesecrete@gmail.com');
  });
});

test.describe('per-page metadata on the standalone routes', () => {
  test('catalog page: own title, description, canonical and OG set', async ({page}) => {
    await page.goto('/catalog');
    const title = await page.title();
    expect(title).toContain('Catalogul');
    expect(title).not.toBe('Aflivra — România la îndemână');

    const robots = await metaContent(page, 'meta[name="robots"]');
    expect(robots.toLowerCase()).not.toContain('noindex');

    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/catalog`);
    expect(await metaContent(page, 'meta[property="og:title"]')).toContain('Catalogul');
    expect((await metaContent(page, 'meta[property="og:description"]')).length).toBeGreaterThan(20);
    expect(await metaContent(page, 'meta[property="og:url"]')).toBe(`${SITE}/catalog`);
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await metaContent(page, 'meta[property="og:image"]')).toBe(`${SITE}/og-image.png`);
  });

  for (const route of ['/termeni', '/confidentialitate']) {
    test(`${route}: own title, description, canonical and OG set`, async ({page}) => {
      await page.goto(route);
      const title = await page.title();
      expect(title).not.toBe('Aflivra — România la îndemână');
      expect((await metaContent(page, 'meta[name="description"]')).length).toBeGreaterThan(30);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', `${SITE}${route}`);
      expect(await metaContent(page, 'meta[property="og:url"]')).toBe(`${SITE}${route}`);
      expect(await metaContent(page, 'meta[property="og:title"]')).not.toBe('Aflivra — România la îndemână');
      expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    });
  }
});
