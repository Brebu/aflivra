import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// The packaging legs: every file a store/distribution channel fetches from this
// origin is served through the asset pipeline (public/ → dist/client → Workers
// assets, exact-match before the Worker), never through app code. These legs
// run against the local dev server — Vite's public-dir middleware — which is
// the same bytes-on-disk chain the build copies and wrangler serves, so a pass
// here proves the delivery chain without a deploy.

// Digital Asset Links — binds the Android TWA (package ro.aflivra.app) to this
// origin so the TWA opens without a browser URL bar. Two-pass flow: pass 1
// (now) serves the format-complete placeholder fingerprint; pass 2 swaps in
// the real Play App Signing SHA-256 after the first internal-test upload —
// docs/packaging/android-play.md step 3. Byte identity with the file on disk
// guarantees that swap needs no route/format work, only a value edit.
const ASSETLINKS_DISK = join(import.meta.dirname, '..', 'public', '.well-known', 'assetlinks.json');
const TWA_PACKAGE = 'ro.aflivra.app';

test.describe('assetlinks.json — the TWA↔origin binding', () => {
  test('serves the exact on-disk bytes as application/json', async ({request}) => {
    const response = await request.get('/.well-known/assetlinks.json');
    expect(response.status(), 'the dotfile must survive the asset pipeline (public/.well-known/)').toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const served = Buffer.from(await response.body());
    const disk = readFileSync(ASSETLINKS_DISK);
    expect(served.equals(disk), 'served bytes must be identical to public/.well-known/assetlinks.json — no route or transform layer').toBe(true);
  });

  test('carries the exact Digital Asset Links structure (relation, android_app target, fingerprint format)', async ({request}) => {
    const document = JSON.parse(readFileSync(ASSETLINKS_DISK, 'utf8'));
    expect(Array.isArray(document), 'assetlinks.json is a statement list').toBe(true);
    expect(document.length, 'assetlinks.json is a non-empty statement list').toBeGreaterThan(0);

    const statement = document[0];
    expect(statement.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(statement.target).toBeDefined();
    expect(statement.target.namespace).toBe('android_app');
    expect(statement.target.package_name).toBe(TWA_PACKAGE);
    // One fingerprint, format-complete: 32 colon-separated hex pairs. The
    // placeholder is all-zero pairs; the pass-2 value is a drop-in swap.
    expect(Array.isArray(statement.target.sha256_cert_fingerprints)).toBe(true);
    expect(statement.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
    const fingerprint = statement.target.sha256_cert_fingerprints[0];
    expect(fingerprint, 'fingerprint must be 32 colon-separated hex pairs (AA:BB:…)').toMatch(/^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/);

    // The served document parses to the same structure (not just equal bytes).
    const servedStatement = await request.get('/.well-known/assetlinks.json');
    expect(servedStatement.status()).toBe(200);
    expect(await servedStatement.json()).toEqual(document);
  });
});

test.describe('the installable-PWA trio — served, correct type, no byte drift', () => {
  test('manifest.webmanifest: application/manifest+json, standalone, ro, 192+512 maskable icons', async ({request}) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest.name).toBe('Aflivra — România la îndemână');
    expect(manifest.lang).toBe('ro');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.id).toBe('/');
    const sizes = manifest.icons.map((icon: {sizes: string}) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of manifest.icons) {
      expect(icon.purpose).toContain('maskable');
    }
  });

  test('icons and touch icon serve as PNG with its real file bytes', async ({request}) => {
    for (const [path, source] of [
      ['/icon-192.png', 'icon-192.png'],
      ['/icon-512.png', 'icon-512.png'],
      ['/apple-touch-icon.png', 'apple-touch-icon.png'],
    ] as const) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).toContain('image/png');
      const served = Buffer.from(await response.body());
      const disk = readFileSync(join(import.meta.dirname, '..', 'public', source));
      expect(served.equals(disk), `${path} must serve the exact public/${source} bytes`).toBe(true);
    }
  });

  test('sw.js serves as JavaScript — the fetch-handling SW is part of installability', async ({request}) => {
    const response = await request.get('/sw.js');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('javascript');
    const text = await response.text();
    // The installability contract: a fetch handler, not a no-op stub.
    expect(text).toContain('addEventListener(\'fetch\'');
  });
});
