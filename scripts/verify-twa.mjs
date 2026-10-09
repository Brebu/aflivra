import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

// Poarta TWA (Android packaging, M1): tot ce trebuie să fie adevărat în repo
// ca pasul 2 (console-side, M2) să fie doar „citește SHA-256 → înlocuiește
// placeholder-ul → redeploy → closed test”. targetSdk 36 e mandatul Play
// (31 aug 2026 aplicațiile noi), assetlinks-ul poartă fingerprintul real al certificatului
// de semnare al APK-ului publicat pe site, iar materialul de semnare nu
// există niciodată în repo — semnarea e Play App Signing, console-side.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TWA = join(ROOT, 'twa'), PUBLIC = join(ROOT, 'public');
const HOST = 'aflivra.brebu.workers.dev', PACKAGE_ID = 'ro.aflivra.app';
const CERT_FINGERPRINT_RE = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;
const REQUIRED_RELATIONS = ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.use_device_origin'];

// 1. twa-manifest.json: JSON valid, aplicație identitate finală (id-ul de
//    pachet e imuabil pe Play), SDK-ul declarat 36, host = originea publicată.
const manifestPath = join(TWA, 'twa-manifest.json');
assert.ok(existsSync(manifestPath), 'twa/twa-manifest.json lipsește — proiectul Bubblewrap nu poate fi verificat');
const twa = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(twa.packageId, PACKAGE_ID, 'packageId final și unic: ro.aflivra.app (decizia documentată în twa/README.md — id-ul nu se poate schimba după publicare)');
assert.ok(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(twa.packageId), 'packageId e un identificator Java valid');
assert.equal(twa.host, HOST, 'host = originea publicată (fără schemă, fără bară finală)');
assert.equal(twa.name, 'Aflivra', 'numele aplicației');
assert.equal(twa.launcherName, 'Aflivra', 'numele din lansator încapând sub ecranul de start');
assert.equal(twa.themeColor, '#0071e3', 'themeColor = culoarea din manifestul web (brand, nu reinventată)');
assert.equal(twa.startUrl, '/', 'startUrl = rădăcina aplicației');
assert.equal(twa.appVersionName, '1.0.0', 'appVersionName semver, pornit la 1.0.0');
assert.equal(twa.appVersionCode, 1, 'appVersionCode pornește la 1 și crește la fiecare upload');
assert.equal(twa.enableNotifications, true, 'notificările Web Push (iOS 16.4+/Android) fac parte din aplicație');
assert.equal(twa.features?.locationDelegation?.enabled, true, 'locationDelegation — geolocația e capaibilitate de bază (Orașul tău/vremea)');

// 2. targetSdkVersion 36 — mandatul Play Console pentru aplicații noi de la
//    31 august 2026. Pin-ul declarat aici e sursa unică pe care twa/build-aab.mjs
//    îl injectează în proiectul Android generat (șablonul Bubblewrap rămâne în urmă).
assert.equal(twa.targetSdkVersion, 36, 'targetSdkVersion trebuie să fie 36 (Play: aplicațiile noi de la 31.08.2026) — clapă RED probabilă cu un fixture de 35');

// 3. Manifestul web rămâne sursa de adevăr pentru instalare (lang/display/icons)
//    și twa-manifestul îl referințiază pe originea publicată.
const webManifestPath = join(PUBLIC, 'manifest.webmanifest');
assert.ok(existsSync(webManifestPath), 'public/manifest.webmanifest lipsește');
const webManifest = JSON.parse(readFileSync(webManifestPath, 'utf8'));
assert.equal(webManifest.lang, 'ro', 'manifestul web: limba română');
assert.equal(webManifest.display, 'standalone', 'manifestul web: standalone');
assert.equal(webManifest.theme_color?.toLowerCase(), twa.themeColor.toLowerCase(), 'themeColor din twa-manifest = theme_color din manifestul web');
assert.equal(twa.webManifestUrl, `https://${HOST}/manifest.webmanifest`, 'webManifestUrl = manifestul publicat pe origine');
for (const field of ['iconUrl', 'maskableIconUrl']) {
  assert.ok(twa[field]?.startsWith(`https://${HOST}/`), `${field} pornește de pe originea publicată`);
  const iconPath = join(PUBLIC, twa[field].replace(`https://${HOST}/`, ''));
  assert.ok(existsSync(iconPath), `${field} → fișier real în public/: ${iconPath}`);
  assert.equal(readFileSync(iconPath).subarray(1, 4).toString('ascii'), 'PNG', `${field} este un PNG real`);
}

// 4. assetlinks.json: structura exactă Digital Asset Links cu fingerprintul REAL al
//    certificatului de semnare al APK-ului publicat pe site (distribuția aleasă e
//    instalarea directă de pe site, semnată cu cheia owner-ului — nu Play App Signing,
//    deci fingerprintul se cunoaște din keystore-ul de semnare, nu dintr-o consolă).
//    Poarta pănă valoarea exactă: o editare accidentală a fișierului sau o resemnare
//    cu altă cheie se prinde aici, nu în telefonul utilizatorului.
const UPLOAD_CERT_SHA256 = '9B:56:D9:6D:2F:BE:D7:BA:A1:1C:DD:67:56:FF:B4:D0:28:83:DC:ED:00:49:B2:F8:6B:D9:40:67:C3:E0:64:D1';
const assetlinksPath = join(PUBLIC, '.well-known', 'assetlinks.json');
assert.ok(existsSync(assetlinksPath), 'public/.well-known/assetlinks.json lipsește — TWA nu se poate verifica fără el');
const assetlinks = JSON.parse(readFileSync(assetlinksPath, 'utf8'));
assert.ok(Array.isArray(assetlinks) && assetlinks.length > 0, 'assetlinks.json este o listă de declarații nevidă');
const statement = assetlinks[0];
assert.ok(Array.isArray(statement.relation), 'declarația are relații');
for (const relation of REQUIRED_RELATIONS) assert.ok(statement.relation.includes(relation), `relația ${relation} lipsește (URL bar + delegarea geolocației în TWA)`);
assert.equal(statement.target.namespace, 'android_app', 'namespace android_app');
assert.equal(statement.target.package_name, PACKAGE_ID, 'package_name = packageId din twa-manifest (o singură identitate)');
assert.ok(Array.isArray(statement.target.sha256_cert_fingerprints) && statement.target.sha256_cert_fingerprints.length > 0, 'sha256_cert_fingerprints prezent');
assert.ok(statement.target.sha256_cert_fingerprints.every(f => CERT_FINGERPRINT_RE.test(f)), 'fingerprintele sunt 32 de perechi hex separate prin „:”');
assert.ok(statement.target.sha256_cert_fingerprints.includes(UPLOAD_CERT_SHA256), `fingerprintul real al certificatului de semnare al APK-ului publicat (${UPLOAD_CERT_SHA256.slice(0,11)}…) lipsește din assetlinks — TWA-ul instalat de pe site nu se verifică fără el; o resemnare cu altă cheie actualizează explicit valoarea pin-ată aici`);

// 5. Graphic-ul de magazin (Play listing): PNG real, exact 1024×500, sub 1 MB —
//    cerința Play Console; randat din tokenii reali ai brandului.
const graphicPath = join(TWA, 'store-assets', 'feature-graphic.png');
assert.ok(existsSync(graphicPath), 'twa/store-assets/feature-graphic.png lipsește — Play Console îl cere la listing (randare: node scripts/render-feature-graphic.mjs)');
const graphic = readFileSync(graphicPath);
assert.equal(graphic.subarray(12, 16).toString('ascii'), 'IHDR', 'feature graphicul este un PNG valid');
assert.equal(graphic.readUInt32BE(16), 1024, 'feature graphicul are lățimea 1024');
assert.equal(graphic.readUInt32BE(20), 500, 'feature graphicul are înălțimea 500');
assert.ok(graphic.length > 10_000, 'feature graphicul nu e un fișier gol');
assert.ok(graphic.length <= 1024 * 1024, `graphicul rămâne sub 1 MB (Play): ${graphic.length} bytes`);

// 6. Wrapper-ul de build pină o singură versiune EXACTĂ de Bubblewrap — fără
//    game, fără „latest”: execuția pinată e cultura repo (nicio rețea flotilă).
const wrapperPath = join(TWA, 'build-aab.mjs');
assert.ok(existsSync(wrapperPath), 'twa/build-aab.mjs lipsește — wrapper-ul pipeline-ului AAB');
const wrapper = readFileSync(wrapperPath, 'utf8');
const pin = /BUBBLEWRAP_VERSION\s*=\s*'([^']+)'/.exec(wrapper);
assert.ok(pin, 'wrapper-ul declară BUBBLEWRAP_VERSION într-un singur loc');
assert.match(pin[1], /^\d+\.\d+\.\d+$/, `versiunea Bubblewrap e EXACTĂ (fără ^ ~ latest): ${pin[1]}`);
const [major, minor] = pin[1].split('.').map(Number);
assert.ok(major > 1 || (major === 1 && minor >= 25), `Bubblewrap >= 1.25.0 pentru AGP/JDK17 modern: ${pin[1]}`);

// 7. ZERO material de semnare în twa/: semnarea e Play App Signing
//    (console-side); keystore-ul de upload trăiește doar pe mașina owner-ului,
//    niciodată în repo. Clapa merge pe fișierele urmărite — twa/build/ e
//    generat & ignorat de git.
const SIGNING_EXT = /\.(keystore|jks|p12|pfx|bks|aab|apk)$/i;
const walk = (dir) => readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
  const p = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'build' ? [] : walk(p);
  return [p];
});
for (const file of walk(TWA)) {
  const rel = relative(TWA, file);
  assert.ok(!SIGNING_EXT.test(file), `material de build/semnare comis în twa/: ${rel} — interzis (AAB/APK se generează, nu se comit; keystore-ul nu există niciodată în repo)`);
  assert.ok(!/keystore|signing[-_]key/i.test(file), `nume de fișier cu material de semnare în twa/: ${rel}`);
  const content = readFileSync(file).toString('latin1');
  assert.ok(!/BEGIN (RSA )?PRIVATE KEY/.test(content), `bloc de cheie privată în ${rel}`);
}
assert.ok(!twa.signingKey?.path, 'signingKey.path din twa-manifest rămâne gol — keystore-ul nu se consemnează în repo');

console.log(`Poarta TWA a trecut: ${PACKAGE_ID} @ ${twa.appVersionName} (code ${twa.appVersionCode}), targetSdk ${twa.targetSdkVersion}, host ${twa.host}, assetlinks cu fingerprintul real al certificatului de semnare al APK-ului (${UPLOAD_CERT_SHA256.slice(0,11)}…), Bubblewrap fixat @${pin[1]}, feature graphic 1024×500 sub 1 MB (${(graphic.length / 1024).toFixed(0)} KB), fără material de semnare.`);
