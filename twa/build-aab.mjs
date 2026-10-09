import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Pipeline-ul AAB (Android App Bundle, NESIGNAT): Bubblewrap fixat la o
// versiune EXACTĂ (execuția pinată e cultura repo — fără game, fără latest),
// proiectul Android se generează în twa/build/ (niciodată comis), iar SDK-ul
// declarat în twa-manifest.json se injectează în gradle-ul generat —
// șabloanele Bubblewrap rămân în urmă față de mandatul Play (targetSdk 36
// pentru aplicații noi de la 31.08.2026). Semnarea NU are loc aici niciodată:
// Play App Signing semnează console-side, keystore-ul de upload (opțional,
// trăind doar pe mașina owner-ului) nu există în repo — build.gradle fără keystore
// produce un app-release.aab nesignat. SKIP-ele sunt înregistrate onest
// (java≥17 / rețea lipsă), eșecurile reale termină cu exit 1.
const BUBBLEWRAP_VERSION = '1.25.0';
const MIN_JAVA_MAJOR = 17;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TWA = join(ROOT, 'twa'), BUILD = join(TWA, 'build');
const MANIFEST = join(TWA, 'twa-manifest.json');
const HOST = 'aflivra.brebu.workers.dev';

const run = (command, args, options = {}) => spawnSync(command, args, {stdio: 'inherit', ...options});

const registerSkip = (reason) => {
  console.log(`SKIP înregistrat: ${reason} — poarta offline scripts/verify-twa.mjs rămâne sursa de adevăr; AAB-ul se generează unde mediul e complet (CI-ul public are JDK 17 + rețea).`);
  process.exit(0);
};

// 1. Java ≥17 (Bubblewrap 2.x: JDK 17) — altfel skip înregistrat, nu eșec fals.
const java = spawnSync('java', ['-version'], {encoding: 'utf8'});
if (java.error || java.status !== 0) registerSkip(`lipsește JDK-ul (java -version): ${java.error?.message ?? 'exit ' + java.status}`);
const javaVersion = /version "([^"]+)"/.exec(`${java.stderr}${java.stdout}`)?.[1] ?? '';
const javaMajor = Number(javaVersion.split(/[._]/)[0]);
if (!javaMajor || javaMajor < MIN_JAVA_MAJOR) registerSkip(`JDK ${javaVersion || 'necunoscut'} < ${MIN_JAVA_MAJOR} — Bubblewrap 2.x cere JDK 17+`);

// 2. Rețea + EXISTENȚA pin-ului: versiunea a fost aleasă offline, deci primul
//    apel rețea verifică că pachetul există pe registry — un răspuns 404 e
//    eroare reală (pinul trebuie actualizat), nu skip.
const registryUrl = `https://registry.npmjs.org/@bubblewrap/cli/${BUBBLEWRAP_VERSION}`;
let registry;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  registry = await fetch(registryUrl, {method: 'HEAD', signal: controller.signal});
  clearTimeout(timer);
} catch (error) {
  registerSkip(`registry npm inaccesibil (${error.message ?? error})`);
}
if (!registry.ok) {
  console.error(`Pinul @bubblewrap/cli@${BUBBLEWRAP_VERSION} nu există pe registry (HTTP ${registry.status}) — actualizează BUBBLEWRAP_VERSION (alegerea offline, verificată aici la primul apel rețea).`);
  process.exit(1);
}

const twa = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const targetSdk = twa.targetSdkVersion;
if (!Number.isInteger(targetSdk)) {
  console.error('twa/twa-manifest.json nu declară targetSdkVersion — poarta verify-twa explică de ce 36 e obligatoriu.');
  process.exit(1);
}

// 3. Generare: twa-manifest.json comis e sursa de adevăr; init îl reia din
//    directorul țintă (copiat mai jos), iar webmanifestul publicat e fallback.
mkdirSync(BUILD, {recursive: true});
copyFileSync(MANIFEST, join(BUILD, 'twa-manifest.json'));
// Semnarea de upload e opțională și trăiește doar pe mașina owner-ului: keystore-ul
// nu intră niciodată în repo — manifestul comis declară signingKey gol, iar copia
// din build/ primește calea reală prin env (BUBBLEWRAP_*_PASSWORD se dau doar la
// execuție, niciodată comise).
const uploadKeystore = process.env.AFLIVRA_UPLOAD_KEYSTORE, uploadAlias = process.env.AFLIVRA_UPLOAD_ALIAS;
if (uploadKeystore && uploadAlias) {
  const buildManifest = JSON.parse(readFileSync(join(BUILD, 'twa-manifest.json'), 'utf8'));
  buildManifest.signingKey = {path: uploadKeystore, alias: uploadAlias};
  writeFileSync(join(BUILD, 'twa-manifest.json'), JSON.stringify(buildManifest, null, 2));
  console.log(`Semnare de upload activată din env: ${uploadAlias} (keystore-ul rămâne în afara repo-ului).`);
}
const dlx = ['pnpm', 'dlx', `@bubblewrap/cli@${BUBBLEWRAP_VERSION}`];
// init-ul Bubblewrap promptează interactiv (Domain, URL path, etc.) chiar și cu
// twa-manifest.json complet — default-urile prompt-urilor sunt valorile din manifestul
// nostru, deci un PTY care apasă Enter pe fiecare întrebare rezolvă non-interactiv.
let generated = spawnSync('python3', [join(ROOT, 'twa', 'pty-drive.py'), 'init', BUILD], {stdio: 'inherit'});
if (generated.status !== 0) {
  console.error(`bubblewrap init a eșuat (exit ${generated.status}) — vezi output-ul de mai sus; twa-manifest.json complet ar trebui să evite orice prompt.`);
  process.exit(1);
}
// Interviul de init suprascrie twa-manifest.json cu default-urile lui — packageId
// devine dev.workers.<host>.twa, versionName un contor — iar identitatea Android este
// pe viață: packageId-ul nu se mai poate schimba după publicarea în Play. Manifestul
// comis se reafirmă PESTĂ copia interviului: fiecare câmp comis câștigă, interviul
// completează doar câmpurile de generator pe care comisul nu le declară
// (splashScreenFadeOutDuration, minSdkVersion… — un câmp lipsă ajunge gol în
// build.gradle și pică compilarea). Keystore-ul generat de interviu rămâne orfan.
const asserted = {...JSON.parse(readFileSync(join(BUILD, 'twa-manifest.json'), 'utf8')), ...JSON.parse(readFileSync(MANIFEST, 'utf8'))};
if (uploadKeystore && uploadAlias) asserted.signingKey = {path: uploadKeystore, alias: uploadAlias};
writeFileSync(join(BUILD, 'twa-manifest.json'), JSON.stringify(asserted, null, 2));
console.log(`Manifestul comis reafirmat peste interviu: identitate ${asserted.packageId} ${asserted.appVersionName} (code ${asserted.appVersionCode}), completat de interviu cu ${Object.keys(asserted).length - Object.keys(JSON.parse(readFileSync(MANIFEST, 'utf8'))).length} câmpuri de generator.`);

// 3b. În Bubblewrap 1.25, init generează CONFIGUL (twa-manifest.json), nu proiectul
//     Android — proiectul îl generează build, complet non-interactiv când parolele
//     de semnare vin pe env (BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD).
const built = spawnSync('python3', [join(ROOT, 'twa', 'pty-drive.py'), 'build', BUILD], {stdio: 'inherit'});

if (built.status !== 0) {
  console.error(`bubblewrap build a eșuat (exit ${built.status}).`);
  process.exit(1);
}

// 4. Proiectul generat: găsește app/build.gradle (nu hardcoda layout-ul
//    șablonului — dar absent whole-hotel = eșec onest).
const gradleFile = ['twa-android', 'android', 'app', '.'].map(dir => join(BUILD, dir, 'app', 'build.gradle')).find(existsSync)
  ?? readdirSync(BUILD, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => join(BUILD, e.name, 'app', 'build.gradle')).find(existsSync);
if (!gradleFile) {
  console.error('Proiectul Android generat nu conține app/build.gradle — layout-ul șablonului Bubblewrap s-a schimbat; ajustează twa/build-aab.mjs.');
  process.exit(1);
}
const projectDir = join(gradleFile, '..', '..');

// Identitatea generată trebuie să fie cea declarată — un șablon Bubblewrap schimbat
// (sau un manifest netradus corect) nu are voie să publice alt packageId.
const gradleIdentity = /applicationId\s+["']([^"']+)["']/.exec(readFileSync(gradleFile, 'utf8'))?.[1];
if (gradleIdentity !== twa.packageId) {
  console.error(`applicationId generat (${gradleIdentity ?? 'lipsă'}) ≠ packageId declarat (${twa.packageId}) — identitatea Play e pe viață; build-ul se oprește până manifestul și șablonul se potivesc.`);
  process.exit(1);
}
console.log(`Identitate verificată: applicationId ${gradleIdentity}.`);

// 5. Injecția SDK-ului declarat (36): compileSdk + targetSdk, dintr-o singură
//    sursă — twa-manifest.json. Fiecare înlocuire e verificată post-fapt, ca
//    un șablon schimbat să NU treacă silențios.
let gradle = readFileSync(gradleFile, 'utf8');
for (const directive of ['compileSdk', 'compileSdkVersion', 'targetSdk', 'targetSdkVersion']) {
  const pattern = new RegExp(`(?<=\\b${directive}\\s)\\d+`);
  if (!pattern.test(gradle)) continue;
  gradle = gradle.replace(pattern, String(targetSdk));
}
writeFileSync(gradleFile, gradle);
gradle = readFileSync(gradleFile, 'utf8');
const pinnedCompile = /compileSdk(?:Version)?\s+(\d+)/.exec(gradle)?.[1];
const pinnedTarget = /targetSdk(?:Version)?\s+(\d+)/.exec(gradle)?.[1];
if (Number(pinnedCompile) !== targetSdk || Number(pinnedTarget) !== targetSdk) {
  console.error(`Injecția SDK nu s-a putut verifica în build.gradle (compileSdk=${pinnedCompile}, targetSdk=${pinnedTarget}, declarat=${targetSdk}) — șablonul Bubblewrap flotează și mandatul Play (API 36) nu se poate onesta.`);
  process.exit(1);
}
console.log(`SDK injectat și verificat: compileSdk ${pinnedCompile}, targetSdk ${pinnedTarget} (sursa: twa-manifest.json).`);

// 6. Android SDK pentru gradle: local.properties din mediul curent, dacă e	setat (CI-ul public îl preinstalează).
if (process.env.ANDROID_HOME && !existsSync(join(projectDir, 'local.properties'))) {
  writeFileSync(join(projectDir, 'local.properties'), `sdk.dir=${process.env.ANDROID_HOME}\n`);
}

// 7. Build NESIGNAT: ./gradlew bundleRelease — fără keystore în build.gradle,
//    AGP produce un app-release.aab nesignat (semnarea e Play App Signing).
const gradlew = join(projectDir, 'gradlew');
if (!existsSync(gradlew)) {
  console.error(`Lipsește ${gradlew} — proiectul generat nu are wrapper Gradle.`);
  process.exit(1);
}
chmodSync(gradlew, 0o755);
const build = run(gradlew, ['bundleRelease', '--no-daemon'], {cwd: projectDir});
if (build.status !== 0) {
  console.error(`gradle bundleRelease a eșuat (exit ${build.status}).`);
  process.exit(1);
}

// 8. Artefactul: există, nesignat, cu SHA-256 tipărit pentru trasabilitate.
const outputs = join(projectDir, 'app', 'build', 'outputs', 'bundle', 'release');
const aab = existsSync(outputs) ? readdirSync(outputs).filter(f => f.endsWith('.aab')).map(f => join(outputs, f))[0] : undefined;
if (!aab || !statSync(aab).isFile() || statSync(aab).size < 1024) {
  console.error(`AAB-ul nesignat nu există în ${outputs} — build-ul a trecut fără artefact, fără decor onest.`);
  process.exit(1);
}
const sha256 = createHash('sha256').update(readFileSync(aab)).digest('hex');
console.log(`AAB nesignat: ${aab} (${(statSync(aab).size / 1024 / 1024).toFixed(2)} MB), SHA-256 ${sha256}.`);

// 9. Semnarea de upload (opțională, doar unde mediul e complet): jarsigner cu
//    keystore-ul owner-ului — Play cere AAB semnat la încărcare, iar Play App
//    Signing îl resemnează console-side cu cheia de aplicație. Parolele circulă
//    exclusiv pe env (BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD),
//    niciodată în repo.
const jarsigner = [process.env.AFLIVRA_JARSIGNER, process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', 'jarsigner'), 'jarsigner', '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/jarsigner'].filter(Boolean).find(p => existsSync(p) || spawnSync(p, ['-help'], {stdio: 'ignore'}).status === 0);
const storePassword = process.env.BUBBLEWRAP_KEYSTORE_PASSWORD;
if (uploadKeystore && uploadAlias && jarsigner && storePassword) {
  const signedAab = join(BUILD, 'aflivra-upload-signed.aab');
  copyFileSync(aab, signedAab);
  const sign = run(jarsigner, ['-keystore', uploadKeystore, '-storepass', storePassword, '-keypass', process.env.BUBBLEWRAP_KEY_PASSWORD || storePassword, signedAab, uploadAlias], {stdio: 'pipe'});
  if (sign.status !== 0) {
    console.error(`jarsigner a eșuat (exit ${sign.status}).`);
    process.exit(1);
  }
  const verify = spawnSync(jarsigner, ['-verify', signedAab], {encoding: 'utf8'});
  if (verify.status !== 0 || !/jar verified/i.test(`${verify.stdout}${verify.stderr}`)) {
    console.error('AAB-ul semnat nu trece jarsigner -verify — semnarea nu se livrează neverificată.');
    process.exit(1);
  }
  console.log(`AAB semnat cu cheia de upload (CN=Aflivra, alias ${uploadAlias}), jarsigner -verify OK: ${signedAab}
Play App Signing resemnează console-side după încărcare; tw/build/ e ignorat de git, deci keystore-ul nu ajunge în repo.`);
} else {
  console.log(`Semnarea de upload s-a sărit (lipsește keystore-ul pe env, jarsigner-ul sau parola) — AAB-ul nesignat rămâne pentru mediul complet.
Play App Signing semnează console-side după încărcare; tw/build/ e ignorat de git.`);
}
