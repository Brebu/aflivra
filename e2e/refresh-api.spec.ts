import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// The dev token lives only in the gitignored .dev.vars that `corepack pnpm dev` reads;
// the specs read it from there so a rotated value cannot silently desync the suite.
const devToken = (() => {
  const text = readFileSync(fileURLToPath(new URL('../.dev.vars', import.meta.url)), 'utf8');
  const match = text.match(/^REFRESH_TOKEN=(.+)$/m);
  if (!match) throw new Error('.dev.vars fără REFRESH_TOKEN — pornește serverul dev cu .dev.vars prezent.');
  return match[1].trim();
})();

const groupNames = ['live', 'weather', 'news', 'legislation', 'registers'];
const validSourceStatuses = new Set(['fresh', 'cached', 'stale', 'unavailable']);

test.describe('Refresh API', () => {
  test('both routes reject a missing and a wrong bearer token with 401', async ({request}) => {
    const noToken = await request.post('/api/refresh?source=weather');
    expect(noToken.status()).toBe(401);
    expect(await noToken.json()).toEqual({error: 'Acces interzis.'});

    const wrongToken = await request.post('/api/refresh?source=weather', {headers: {authorization: 'Bearer token-gresit'}});
    expect(wrongToken.status()).toBe(401);
    expect(await wrongToken.json()).toEqual({error: 'Acces interzis.'});

    const statusNoToken = await request.get('/api/refresh/status');
    expect(statusNoToken.status()).toBe(401);
    expect(await statusNoToken.json()).toEqual({error: 'Acces interzis.'});

    const statusWrongToken = await request.get('/api/refresh/status', {headers: {authorization: 'Bearer alt-token-gresit'}});
    expect(statusWrongToken.status()).toBe(401);
  });

  test('an unknown group is rejected with 404 listing the valid groups', async ({request}) => {
    const response = await request.post('/api/refresh?source=inexistent', {headers: {authorization: `Bearer ${devToken}`}});
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('Grupuri valide: live, weather, news, legislation, registers.');
  });

  test('status with the dev token returns all five groups with the summary shape', async ({request}) => {
    const response = await request.get('/api/refresh/status', {headers: {authorization: `Bearer ${devToken}`}});
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.groups.map((group: any) => group.name)).toEqual(groupNames);
    for (const group of body.groups) {
      expect(typeof group.cron, `cron for ${group.name}`).toBe('string');
      expect(Array.isArray(group.seedBacked), `seedBacked for ${group.name}`).toBe(true);
      expect(group.lastSweepAt === null || typeof group.lastSweepAt === 'string', `lastSweepAt for ${group.name}`).toBe(true);
      expect(Array.isArray(group.perSource), `perSource for ${group.name}`).toBe(true);
      for (const source of group.perSource) expect(validSourceStatuses.has(source.status), `invalid status: ${source.status}`).toBe(true);
    }
    expect(typeof body.servedAt).toBe('string');
  });

  test('a single small group sweep (weather) returns per-source statuses under the free-plan shape', async ({request}) => {
    test.setTimeout(120_000);
    const response = await request.post('/api/refresh?source=weather', {headers: {authorization: `Bearer ${devToken}`}});
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.groups.length).toBe(1);
    const group = body.groups[0];
    expect(group.group).toBe('weather');
    expect(Array.isArray(group.sources)).toBe(true);
    expect(group.sources.length).toBe(4);
    for (const source of group.sources) {
      expect(validSourceStatuses.has(source.status), `invalid source status: ${source.status}`).toBe(true);
      expect(typeof source.key).toBe('string');
    }
    expect(typeof body.servedAt).toBe('string');
  });
});
