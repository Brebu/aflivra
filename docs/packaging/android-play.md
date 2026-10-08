# Android pe Google Play — calea de clicks (M2, console-side)

M1 (repo-only) e gata: `public/.well-known/assetlinks.json` cu fingerprint
**placeholder**, proiectul `twa/` (Bubblewrap fixat, targetSdk 36), poarta
`scripts/verify-twa.mjs` și CI-ul `android-aab.yml`. Pașii de mai jos sunt
doar console + o înlocuire de valoare.

## Pasul 1 — Cont și aplicație

Play Console, **25 USD o singură dată** → „Create app": nume `Aflivra`,
țară, „App", gratuit. Dacă e cont personal **nou**, Play va cere **test
închis cu ~12 testeri timp de ~14 zile** înainte de producție (verifică
pragurile exacte în consolă — au variat).

## Pasul 2 — Internal testing, primul upload

Build: artefactul CI-ului (`android-aab.yml` → *aflivra-twa-unsigned-aab*)
sau local `node twa/build-aab.mjs`. Upload AAB în **Testing → Internal
testing**. La primul upload, optează în **Play App Signing** cu cheie
generată de Google (keystore-ul de upload, dacă alegi unul, rămâne pe mașina
ta — niciodată în repo).

## Pasul 3 — Citește SHA-256 și înlocuiește placeholder-ul (trecerea 2)

Play Console → **Release → Setup → App integrity** (sau Setup → App
signing) → certificate **App signing key** → copiază **SHA-256 certificate
fingerprint**. Înlocuiește valoarea din
`public/.well-known/assetlinks.json`:

```
"sha256_cert_fingerprints": ["AA:BB:…:CC"]   // 32 de perechi hex — doar valoarea se schimbă
```

Formatul și structura trebuie să rămână intacte — poarta `verify-twa.mjs`
clapează exact asta. Apoi `corepack pnpm deploy` (servește fișierul ca asset
Worker, byte-cu-byte) și verifică:

```
curl https://aflivra.brebu.workers.dev/.well-known/assetlinks.json
```

Rebuild + reinstall pe testerul din internal testing: bara de adrese Chrome
dispare când verificarea Digital Asset Links trece (fallback: Custom Tab cu
bară — înseamnă fingerprint nepotrivit).

## Pasul 4 — Listingul (ROMÂNĂ)

| Element | Valoare |
| --- | --- |
| Titlu | `Aflivra` (≤30 caractere) |
| Descriere scurtă | `Informații publice, cu sursa la vedere.` (manifestul web) |
| Feature graphic | `twa/store-assets/feature-graphic.png` (1024×500, ≤1 MB ✓) |
| Screenshots | min. 2 — planul de mai jos |
| Politica de confidențialitate | `https://aflivra.brebu.workers.dev/confidentialitate` |
| Contact suport | adresa de operator din `/confidentialitate` |

### Planul de screenshots

Reutilizează suita Chrome existentă (`scripts/visual-compare.mjs:39` —
captureaza la 390×844 @2x, iPhone width): home `#view=home`, harta
`#view=explore`, profilul unui loc `#view=place`, un dashboard de domeniu
`#view=domain&id=…`. Capturează de la originea publicată (schimbă URL-urile din
script sau declară `AFLIVRA_SHOOT_ORIGIN`), min. 2, recomandat 4.

## Pasul 5 — Data safety + rating + closed test → producție

**Data safety (răspunsurile prefilled, din analiza de conformitate):**
Location → *Approximate* → App functionality; nu se partajează; nu se
leagă de identitate; criptat în tranzit; ștergere la cerere („Șterge-mi
datele" există în aplicație). Device or other IDs → App functionality; nu
se partajează; nu se leagă; ștergere la cerere. Nimic altceva.

**Rating IARC:** aplicație de referință/informație — chestionarul e trivial.

Cont personal **nou**: closed testing (~12 testeri / ~14 zile) înainte de
producție; cont **existent**: producția poate urma direct după internal test.
Verifică starea cerinței în consola aplicației.
