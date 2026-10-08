# Aflivra TWA — proiectul Bubblewrap

Ambalajul Android (Trusted Web Activity) pentru `https://aflivra.brebu.workers.dev`.
Conținutul aplicației rămâne web (Chrome protocol, fără webview); APK/AAB-ul e
generat, iar legătura aplicație↔sit e verificată prin Digital Asset Links.

## Ce e comis și ce nu

| Fișier | Rol |
| --- | --- |
| `twa-manifest.json` | Sursa de adevăr a identității aplicației — se comite. |
| `build-aab.mjs` | Pipeline-ul de generare (Bubblewrap fixat, SDK injectat, AAB nesignat) — se comite. |
| `store-assets/` | Graficul de listing Play (1024×500) — se comite. |
| `build/` | Proiectul Android generat — **niciodată comis** (ignorat de git). |

Materialul de semnare nu există în repo: semnarea e Play App Signing
(console-side), keystore-ul de upload — dacă se alege vreodată unul — trăiește
doar pe mașina owner-ului. Poarta `scripts/verify-twa.mjs` clapează fix asta.

## Decizii

- **`packageId: ro.aflivra.app`** — imuabil după primul upload pe Play. Ales
  brand-first pe namespace-ul `.ro` (aplicație românească); un id derivat din
  `*.workers.dev` ar fixa identitatea aplicației de un subdomeniu de
  infrastructură gratuit.
- **`targetSdkVersion: 36` în twa-manifest.json** — mandatul Play pentru
  aplicații noi (31.08.2026). Nu e un câmp nativ Bubblewrap; e pinul nostru,
  pe care `build-aab.mjs` îl injectează în gradle-ul generat și
  `verify-twa.mjs` îl clapează (RED-dovedit cu fixture de 35). Dacă Bubblewrap
  câștigă câmp nativ, se mută pinul acolo.
- **Bubblewrap `@bubblewrap/cli@2.2.0`, versiune EXACTĂ** — două locuri nu
  există: `BUBBLEWRAP_VERSION` în `build-aab.mjs` e sursa; `verify-twa.mjs` o
  citește și validează forma (fără `^ ~ latest`). Versiunea a fost aleasă
  offline; primul apel rețea al wrapper-ului verifică existența pe registry
  (404 = eroare reală, pinul se actualizează).
- **Fingerprint placeholder în `public/.well-known/assetlinks.json`** —
  trecerea 1 (acum): structură Digital Asset Links completă, SHA-256 all-zero.
  Trecerea 2, console-side: se citește SHA-256 real din Play Console (App
  integrity) și se înlocuiește doar valoarea — `docs/packaging/android-play.md`.

## Comenzi

```bash
node scripts/verify-twa.mjs   # poarta offline (CI o rulează mereu)
node twa/build-aab.mjs        # AAB nesignat ( cere JDK 17+ și rețea; skip înregistrat altfel )
node scripts/render-feature-graphic.mjs   # regenerează store-assets/feature-graphic.png
```
