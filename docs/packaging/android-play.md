# Android — instalare directă de pe site (ruta aleasă)

Distribuția aleasă: **APK semnat cu cheia owner-ului, publicat pe site**
(`/downloads/aflivra.apk`), fără magazin de aplicații. Inclusiv verificația
TWA: fingerprint-ul din `public/.well-known/assetlinks.json` e cel **real**
al certificatului de semnare (se cunoaște din keystore — nu depinde de nicio
consolă), deci aplicația instalată de pe site se deschide **fără bara de
adresă**.

## Ce e publicat

- `public/downloads/aflivra.apk` — pachetul semnat (`ro.aflivra.app`,
  `versionName 1.0.0`, `versionCode 2`, targetSdk 36), semnat `CN=Aflivra`,
  alias `aflivra-upload`.
- Link + note de instalare în **Despre → „Ghidurile platformei" →
  Aplicația Android**.
- `public/.well-known/assetlinks.json` — fingerprint real, pin-at în
  `scripts/verify-twa.mjs` (o resemnare cu altă cheie actualizează valoarea
  explicit, nu silențios).

## Reînnoirea aplicației (o versiune nouă)

1. `node twa/build-aab.mjs` cu mediul de semnare (env `AFLIVRA_UPLOAD_*` +
   `BUBBLEWRAP_*`, keystore-ul rămâne în `~/.aflivra-signing/`) — produce și
   APK-ul semnat `twa/build/app-release-signed.apk`.
2. Copiază-l peste `public/downloads/aflivra.apk`, crește `appVersionName` /
   `appVersionCode` în `twa/twa-manifest.json`.
3. Poarta `verify-downloads.mjs` verifică publicarea (pachet ZIP real,
   dimensiune, link în secțiune); `verify-twa.mjs` verifică identitatea +
   assetlinks. Lanțul local complet + deploy.

Instalarea utilizatorului: deschide site-ul pe Android → „Descarcă
aplicația" → Android cere o singură dată permisiunea de a instala din
acel browser (Setări → Aplicații → browser-ul → „Instalează aplicații
necunoscute") → Instalează. Dezinstalarea e standard, din launcher.

## Google Play (opțional, ulterior)

Dacă se vrea și Play: cont 25 USD, upload AAB (`twa/build/` /
`aflivra-upload-signed.aab`), Play App Signing resemnează console-side —
atunci assetlinks primește ÎN PLUS fingerprintul generat de Play (lista
`sha256_cert_fingerprints` poate purta ambele valori). Pașii de consolă în
istoricul git al acestui fișier (revizia cu „M2, console-side").
