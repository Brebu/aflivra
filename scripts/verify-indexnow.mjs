import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findIndexNowKey, pingIndexNow, readSitemapUrls} from './indexnow-ping.mjs';

// Bateria IndexNow + og-image: cheia din public/, payload-ul exact (URL-urile
// din sitemap, keyLocation-ul verificabil), eșecul niciodată fatal, iar deploy-ul
// ping-ează doar după o publicare reușită — plus blocarea derivei og-image
// (fișierul de pe disk = dimensiunile declarate în app/seo.ts).
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://aflivra.brebu.workers.dev';

// 1. Cheia: fișier hex în public/, conținut = numele fișierului (convenția IndexNow).
const key = findIndexNowKey();
assert.ok(key, 'public/ trebuie să conțină fișierul de cheie IndexNow (public/<key>.txt, cheia în conținut)');
assert.match(key, /^[0-9a-f]{16,64}$/, 'cheia IndexNow este hex cu 16-64 de caractere');
assert.ok(existsSync(join(ROOT, 'public', key + '.txt')), 'fișierul de cheie IndexNow există la public/' + key + '.txt');

// 2. Payload-ul exact pe un fetch stub: endpoint, host, key, keyLocation și
//    URL-lista luată întocmai din sitemap.
const sitemapUrls = readSitemapUrls();
assert.ok(sitemapUrls.length >= 3, 'sitemap.xml are rute de anunțat: ' + sitemapUrls.length);
let captured = null;
const fetchStub = async (url, options) => {
  captured = {url, options};
  return {status: 200};
};
const ok = await pingIndexNow({fetchImpl: fetchStub});
assert.equal(ok.ok, true, 'ping-ul reușit raportează ok');
assert.equal(ok.count, sitemapUrls.length, 'numărul de URL-uri anunțate = rutele din sitemap');
assert.equal(captured.url, 'https://api.indexnow.org/indexnow', 'endpoint-ul IndexNow');
assert.equal(captured.options.method, 'POST', 'metoda POST');
assert.match(captured.options.headers['content-type'], /^application\/json/, 'antet JSON');
const body = JSON.parse(captured.options.body);
assert.equal(body.host, 'aflivra.brebu.workers.dev', 'host-ul este domeniul publicat');
assert.equal(body.key, key, 'cheia din payload = cheia din fișierul de cheie');
assert.equal(body.keyLocation, `${SITE}/${key}.txt`, 'keyLocation-ul indică fișierul de cheie public');
assert.deepEqual(body.urlList, sitemapUrls, 'urlList = întocmai <loc>-urile din sitemap.xml');

// 3. Eșecul niciodată fatal: fetch căzut sau HTTP de eroare → avertizare, fără throw.
const unreachable = await pingIndexNow({fetchImpl: async () => { throw new Error('rețea căzută'); }});
assert.equal(unreachable.ok, false);
assert.ok(unreachable.warning.includes('IndexNow'), 'avertisment onest la fetch căzut');
const httpError = await pingIndexNow({fetchImpl: async () => ({status: 400})});
assert.equal(httpError.ok, false);
assert.ok(httpError.warning.includes('400'), 'avertismentul păstrează codul HTTP real');

// 4. Deploy-ul ping-ează doar după o publicare reușită: apelul stă după poarta
//    de stare a deploy-ului, iar calea --dry-run iese înainte de a-l atinge.
const deploy = readFileSync(join(ROOT, 'scripts', 'deploy.mjs'), 'utf8');
const statusGate = deploy.indexOf('deployed.status!==0');
const pingCall = deploy.indexOf('pingIndexNow()');
assert.ok(statusGate >= 0 && pingCall > statusGate, 'ping-ul IndexNow vine după poarta deploy-ului reușit');
const dryRunExit = deploy.indexOf('if(dryRun){');
assert.ok(dryRunExit >= 0 && dryRunExit < pingCall, '--dry-run iese înainte de ping (nicio rețea în dry-run)');

// 5. Deriva og-image: fișierul de pe disk este exact canvasul declarat în app/seo.ts.
const ogBytes = readFileSync(join(ROOT, 'public', 'og-image.png'));
assert.equal(ogBytes.subarray(12, 16).toString('ascii'), 'IHDR', 'og-image.png este un PNG valid');
assert.equal(ogBytes.readUInt32BE(16), 1200, 'og-image.png are lățimea 1200');
assert.equal(ogBytes.readUInt32BE(20), 630, 'og-image.png are înălțimea 630');
assert.ok(ogBytes.length > 10000, 'og-image.png nu este un fișier gol');
assert.ok(ogBytes.length <= 300 * 1024, 'og-image.png rămâne sub 300 KB: ' + ogBytes.length);
const seo = readFileSync(join(ROOT, 'app', 'seo.ts'), 'utf8');
assert.ok(seo.includes("OG_IMAGE_PATH = '/og-image.png'"), 'app/seo.ts declară /og-image.png');
assert.ok(seo.includes('OG_IMAGE_WIDTH = 1200') && seo.includes('OG_IMAGE_HEIGHT = 630'), 'app/seo.ts declară dimensiunile 1200×630');

console.log(`Bateria IndexNow + og-image a trecut: cheie ${key.slice(0, 8)}…, ${sitemapUrls.length} URL-uri anunțate întocmai din sitemap, eșec non-fatal, ping-ul legat de deploy-ul reușit, og-image 1200×630 sub buget (${(ogBytes.length / 1024).toFixed(0)} KB).`);
