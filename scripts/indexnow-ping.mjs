import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// IndexNow: announce the sitemap URLs to the IndexNow API after a deploy
// (and manually when needed: `node scripts/indexnow-ping.mjs`).
// The key was generated once (crypto.randomBytes(16).toString('hex')) and
// lives where IndexNow verifies it: public/<key>.txt containing the key —
// both file name and content are the key itself, so the route and the value
// cannot drift apart. To rotate: generate a new hex key, replace the file
// (delete the old one), and the key file is picked up automatically.
// Failure is never fatal: a missing key or an unreachable endpoint logs a
// warning the deploy carries on from (re-ping manually later).
const SITE_HOST = 'aflivra.brebu.workers.dev';
const SITE_BASE = 'https://aflivra.brebu.workers.dev';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function findIndexNowKey({publicDir = join(ROOT, 'public')} = {}) {
  for (const file of readdirSync(publicDir)) {
    if (!/^[0-9a-f]{16,64}\.txt$/.test(file)) continue;
    const content = readFileSync(join(publicDir, file), 'utf8').trim();
    if (content === file.replace(/\.txt$/, '')) return content;
  }
  return null;
}

export function readSitemapUrls({sitemapPath = join(ROOT, 'public', 'sitemap.xml')} = {}) {
  const xml = readFileSync(sitemapPath, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
}

export async function pingIndexNow({fetchImpl = fetch, base = SITE_BASE, host = SITE_HOST} = {}) {
  const key = findIndexNowKey();
  if (!key) return {ok: false, warning: 'niciun fișier de cheie IndexNow în public/ (public/<key>.txt cu cheia în conținut)'};
  const urlList = readSitemapUrls();
  if (!urlList.length) return {ok: false, warning: 'sitemap.xml nu conține nicio rută — rulează node scripts/update-sitemap.mjs'};
  const body = {host, key, keyLocation: `${base}/${key}.txt`, urlList};
  try {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json; charset=utf-8'},
      body: JSON.stringify(body),
    });
    if (response.status >= 400) return {ok: false, warning: `IndexNow a răspuns HTTP ${response.status}`, count: urlList.length};
    return {ok: true, status: response.status, count: urlList.length};
  } catch (error) {
    return {ok: false, warning: `IndexNow inaccesibil: ${error instanceof Error ? error.message : String(error)}`, count: urlList.length};
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(new URL('./indexnow-ping.mjs', import.meta.url)) === process.argv[1];
if (invokedDirectly) {
  const result = await pingIndexNow();
  if (result.ok) console.log(`✅ IndexNow ping trimis: ${result.count} URL-uri (HTTP ${result.status}).`);
  else { console.error(`⚠️ ${result.warning}${result.count ? ` (${result.count} URL-uri pregătite)` : ''} — reluă manual: node scripts/indexnow-ping.mjs`); process.exit(0); }
}
