# STATUS — datasets-modals-packaging

## Builder-M1

Status: **DONE** (repo-only M1; one registered first-CI-run risk, see below).

### Task 1 — assetlinks scaffold + serving proof (TDD: RED → GREEN)

- RED: `e2e/packaging-install.spec.ts` scris înainte de fișier — assetlinks legs
  au picat cu `404` (serving) și `ENOENT` (structură); celelalte 3 legs ale trio-ului
  PWA au trecut de la început (fișiere pre-existente, dovadă de livrare nouă).
- GREEN: `public/.well-known/assetlinks.json` creat — ambele relații
  (`handle_all_urls` + `use_device_origin` — geolocația delegată în TWA e
  capaabilitate de bază), target `android_app`/`ro.aflivra.app`, fingerprint
  **placeholder all-zero** format-valid (32 perechi hex „:"-separate).
- **Dovada de livrare**: dev server local servește `/.well-known/assetlinks.json`
  cu `content-type: application/json` și **bytes identical cu fișierul de pe disk**
  (e2e, 5/5 trecute inclusiv în regim `CI=true` cu webServer propriu). Lanțul
  complet: vite serve (publicDir includem dotfile-uri — `recursiveReaddir`/sirv
  fără filtrare dot, verificat în sursa vite 8.0.13; copierea `copyDir` la build
  include dotfile-uri; wrangler assets serve exact-match pe `dist/client`).
  Trecerea 2 (M2) = doar schimb de valoare, zero muncă de format/rută.
- Placeholder-ul e documentat în `docs/packaging/android-play.md` pasul 3 și în
  `twa/README.md`.

### Task 2 — Bubblewrap project + verify-twa gate (TDD: RED → GREEN → RED-proof)

- RED: `scripts/verify-twa.mjs` rulat înainte de `twa/` → `exit 1`
  („twa/twa-manifest.json lipsește").
- GREEN: `twa/twa-manifest.json` (identitate finală, vezi deciziile), apoi RED
  progresiv onest: după manifest, poarta a picat la graphic lipsă → am
  randat graphicul → green complet.
- **RED-proof (transcript, reproductibil cu cele 3 comenzi de mai jos)**:
  `targetSdkVersion: 35` scris temporar → poarta `exit 1`,
  `AssertionError: 35 !== 36` → restaurat la `36` → `exit 0`. Rulează a doua
  oară la final: green (x2 consecutive post-restore).

```bash
node -e 'const fs=require("fs");fs.writeFileSync("twa/twa-manifest.json",fs.readFileSync("twa/twa-manifest.json","utf8").replace("\"targetSdkVersion\": 36","\"targetSdkVersion\": 35"))'
node scripts/verify-twa.mjs   # ← trebuie să pice (35 !== 36)
node -e 'const fs=require("fs");fs.writeFileSync("twa/twa-manifest.json",fs.readFileSync("twa/twa-manifest.json","utf8").replace("\"targetSdkVersion\": 35","\"targetSdkVersion\": 36"))'
node scripts/verify-twa.mjs   # ← verde
```

- Poarta clapează: targetSdk **36** (mandat Play 31.08.2026), packageId final
  valid, host = originea publicată, theme/display/icons consecvente cu
  manifestul web real, assetlinks EXACT structural (regex fingerprint),
  `locationDelegation: true` ↔ relația `use_device_origin` din assetlinks
  (consistență inter-fișiere), feature graphic 1024×500 PNG sub 1 MB (IHDR la
  nivel de bytes), pin Bubblewrap format EXACT + floor ≥2.2.0, **scan complet
  twa/ fără material de semnare** (extensii, nume, blocuri PRIVATE KEY,
  `signingKey.path` gol), fără .aab/.apk comise.
- Wrapper-ul `twa/build-aab.mjs`: JDK≥17 + reachability registry verificate
  (SKIP înregistrat onest la lipsă, exit 0 — convenția repo, ca pypdf în
  pr-validation); pinul verificat la nivel de EXISTENȚĂ la primul apel rețea
  (404 = eroare reală, pinul a fost ales offline); init reia `twa-manifest.json`
  comis (fallback: webmanifestul publicat); **injectează** compileSdk/targetSdk
  din twa-manifest în gradle-ul generat + verificare post-injecție (drift
  șablon = exit 1, niciodată silent); `./gradlew bundleRelease` **fără keystore
  → AAB nesignat**; SHA-256 tipărit; `twa/build/` gitignored.
- Decizia pin: **documented npx/dlx pin, nu devDependency** — `package.json` +
  lockfile nu sunt în partiția mea și churn-ul lockfile-ului ar corupe ramura
  comună; pinul trăiește într-un singur loc (`BUBBLEWRAP_VERSION` în
  `build-aab.mjs`), `verify-twa.mjs` îl citește și validează forma.

### Task 3 — CI `.github/workflows/android-aab.yml`

- Trigger: `workflow_dispatch` + `pull_request` pe `twa/**` (doar — conform
  misiunii; nu am atins `pr-validation.yml`).
- Job 1 `verify-twa`: poarta offline mereu, fără install (Node built-ins
  exclusiv).
- Job 2 `build-aab`: Temurin 17 pin, Android SDK platform-36 instalat
  explicit (runner-ul poate rămâne în urmă față de pin), `node twa/build-aab.mjs`
  real (registered skip dacă java/rețea lipsesc — niciodată verde fals),
  upload artefact AAB 14 zile, `if-no-files-found: ignore`.
- **Risc înregistrat (onest)**: pipeline-ul Bubblewrap→Gradle nu poate fi
  exercitat de pe mașina asta (offline; JDK/SDK/AGP se validează doar pe
  runner). Prima rulare CI poate necesita ajustări de detaliu (flag-uri CLI
  Bubblewrap exacte, prompt-uri non-TTY, compatibilitate AGP↔compileSdk 36) —
  design-ul e „eșuează onest + skip înregistrat", nu verde fals. Aducerea la
  verde a primei rulări ține de M2/orchestrator cu acces la output-ul runnerului.

### Task 4 — Store assets

- `scripts/render-feature-graphic.mjs` (og-image precedent, rescalat 1024×500,
  tokenii reali: hero atestat webp, gradienți vii, Inter Aflivra, busolă) →
  `twa/store-assets/feature-graphic.png` **557 KB** (buget Play 1 MB, PNG
  direct, fallback paletă sharp@0.35.4 locked prin descoperire .pnpm).
- Graficul e clamat de poarta verify-twa (IHDR 1024×500 bytes-level).
- Screenshot plan (documentat, nu executat — `docs/packaging/android-play.md`):
  reutilizare `scripts/visual-compare.mjs` (390×844 @2x): home, explore, place,
  domain — de la originea publicată, min. 2, recomandat 4. M2 capturează.

### Task 5 — iOS A2HS + hints

- `docs/packaging/ios-a2hs.md` — scurt: pașii Safari, notificările funcționale
  de la iOS 16.4 prin Web Push-ul existent, decizia de **99 USD/an lăsată
  utilizatorului** (riscul 4.2/4.2.7(e), Apple recomandă web-ul pentru acest
  shape; TestFlight/Ad Hoc rămân mijlocul de mijloc).
- **Surfața „Instalare pe telefon" existentă = `app/watch-center.tsx:219`**
  (indiciu iOS la notificări) + mențiune generică în `app/termeni/page.tsx:18`.
  watch-center este în febra ferelor de dialog (agent paralel) → conform
  instrucțiunii SAFE am **sat** partea in-app: rămâne de conectat de
  orchestrator un indiciu general de instalare home-screen pe iOS lângă
  suprafața existentă (vezi ios-a2hs.md § „Indiciul în aplicație"). README-ul
  nu a fost atins (orchestrator).

### Deciziile de manifest (pentru orchestrator)

- **applicationId: `ro.aflivra.app`** — final + imuabil după primul upload.
  Namespace `.ro` (brand-first, aplicație românească), nu un id derivat din
  `*.workers.dev` (ar fixa identitatea de un subdomeniu de infrastructură).
  Raționamentul complet în `twa/README.md`.
- **appVersionName 1.0.0 / appVersionCode 1** — standard start.
- **targetSdkVersion 36 în twa-manifest.json** = pinul nostru (câmp nou, nu
  nativ Bubblewrap), consumat de build-aab (injectare gradle) + verify-twa
  (clapă). Dacă Bubblewrap câștigă câmp nativ, pinul se mută acolo.
- **targetSdk compileSdk**: 36 injectat din aceeași sursă unică.
- **`statsig`-free, icon URL-uri pe originea publicată** (icon-512.png maskable
  existent, verificat pa poartă).

### M2 — pașii console-side (Play), pentru utilizator

1. Play Console: cont **25 USD** (dacă e **personal și nou**: se activează
   cerința de test închis — **~12 testeri / ~14 zile** înainte de producție;
   cont **existent (personal sau organizație): fără gauntlet**, producția poate
   urma direct după internal test — verifică banner-ul exact în consolă, cifrele
   au variat istoric).
2. „Create app" — `Aflivra`, RO, aplicație, gratuit.
3. Testing → **Internal testing** → upload AAB **nesignat** (artefactul CI
   `aflivra-twa-unsigned-aab` sau `node twa/build-aab.mjs` local cu JDK 17+).
   La primul upload: opt-in **Play App Signing**, cheie generată de Google;
   keystore de upload opțional — **niciodată în repo** (rimâne pe mașina
   owner-ului; repo-ul nu generează.
4. **App integrity** (Release → Setup → App integrity / App signing) → copiază
   SHA-256 al **App signing key certificate**.
5. Înlocuiește **doar valoarea** din `public/.well-known/assetlinks.json`
   (all-zero → SHA-256 real); `verify-twa` rămâne verde (regex-ul permite orice
   32×hex). `corepack pnpm deploy`. Verifică:
   `curl https://aflivra.brebu.workers.dev/.well-known/assetlinks.json`.
6. Listing RO: titlu `Aflivra`, descriere din manifest,
   `feature-graphic.png`, screenshots (2–4, planul din android-play.md),
   privacy policy `https://aflivra.brebu.workers.dev/confidentialitate`,
   contact suport din `/confidentialitate`.
7. **Data safety** (răspunsurile prefilled în `docs/packaging/android-play.md`
   pasul 5): Location→Approximate→App functionality, nu partajat, nu legat de
   identitate, criptat în tranzit, ștergere la cerere; Device IDs la fel; nimic
   altceva. IARC: aplicație informațională. Producție după (după) closed test
   dacă e cerut.

### iOS — punctul de decizie lăsat utilizatorului

$99/an App Store: **nu s-a ales** — risc real de respingere 4.2 („repackaged
website"); A2HS + Web Push 16.4+ acoperă nevoile. TestFlight/Ad Hoc = mijlocul
onest la $99 dacă dispozitive reale ale prietenilor/familiei impun. Revizitare
doar cu plan de valoare nativă. Detalii: `docs/packaging/ios-a2hs.md`.

### Linii de battery/README pentru orchestrator (nu le-am scris eu în README/CI-ul principal — partiția interzice)

Battery (pr-validation, dacă orchestratorul o dorește alături de workflow-ul
specializat):

```
node scripts/verify-twa.mjs
```

README (secțiunea „Instalare pe telefon" — adițiuni propuse, AFTER the
existing bullets):

```markdown
Pentru Android, aplicația mai poate fi distribuită prin Google Play ca
Trusted Web Activity — proiectul de ambalare (`twa/`, Bubblewrap fixat,
targetSdk 36) și pașii console-side sunt în `docs/packaging/android-play.md`.
Pentru iPhone/iPad, ghidul „Adaugă la ecranul de start" (notificările
funcționale de la iOS 16.4) e în `docs/packaging/ios-a2hs.md`.
```

Config nou: `.github/workflows/android-aab.yml` (dispatch + PR pe twa/**);
`.gitignore` primește `twa/build/`, `*.keystore`, `*.jks` (partiția mea:
apărare „no signing material ever committed" — single non-forbidden shared
file atins, aditiv, notat aici). **`public/manifest.webmanifest` NU a fost
atins** — niciun câmp nou strict necesar (twa citește iconițele/tema
existente).

### Exit gates (comenzi rulate, output real)

| Poartă | Comandă | Rezultat |
| --- | --- | --- |
| Typecheck | `corepack pnpm exec tsc --noEmit` | exit 0 |
| Lint | `corepack pnpm lint` | 115 warnings / **0 errors** (niciun warning din fișierele mele — grep verificat) |
| Poarta TWA | `node scripts/verify-twa.mjs` | verde ×2 consecutive (post-RED-restore + final) |
| RED-proof | fixture 35 | `exit 1`, `35 !== 36` (transcript mai sus) |
| e2e packaging | `CI=true corepack pnpm exec playwright test e2e/packaging-install.spec.ts` | **5/5 passed** (server propriu, teardown automat) |
| Fără material de semnare | `find . -name "*.keystore" -o -name "*.jks" -o -name "*.p12" -o -name "*.aab" -o -name "*.apk"` | **zero fișiere**; `BEGIN PRIVATE KEY` doar în regexul detecției din verify-twa; mențiunile „keystore" doar text de politică (twa/README, build-aab, verify-twa) |
| Dev server | — | serverul de pe :5173 era al agentului paralel (geo-drift run) — **nu l-am atins**; am așteptat portul liber pentru leg-ul CI=true; după rulare port curat (teardown playwright) |
| Commit-uri | `git status` | **zero commit-uri**; fișierele mele: `public/.well-known/**`, `twa/**`, `scripts/verify-twa.mjs`, `scripts/render-feature-graphic.mjs`, `.github/workflows/android-aab.yml`, `e2e/packaging-install.spec.ts`, `docs/packaging/*`, `.gitignore` (aditiv) |

### Self-review (4 lentile)

- **Completeness**: toate cele 5 misiuni livrate; in-app iOS hint sat-blocat
  (partiție/d1-conflict) — documentat + delegat orchestratorului; screenshots
  plan documentat (nu executat — misiunea cerea „plan documented").
- **Quality**: convenții repo (verify-*.mjs culture, skip înregistrat, pin-uri
  exacte, Romanian logs, og-image precedent); zero scaffolding; erori oneste
  cu exit 1, niciodată verde fals.
- **Discipline**: TDD RED→GREEN pe fiecare bucată (e2e serving, gate, graphic
  progresiv) + RED-proof fixture; fără scope creep (public/manifest neatins,
  pr-validation neatins, README neatins); worktree fără commit-uri.
- **Testing**: e2e-ul asertează bytes reali serviti (nu mock), poarta citește
  bytes reali de pe disk (IHDR), gadget-ul de fixture dovedește RED; rulate
  acum, output citit.

Done — M1 shippable fără cont de magazin; M2 = console + o înlocuire de
valoare (pașii mai sus).

## Builder-D1

**Wave**: bugs 1+2 — dialogs close on background geo drift (semantic area key) + own position layer on PublicMap · **Status: DONE**

### TDD cycle (RED → GREEN → REFACTOR)

**RED** — `e2e/geo-drift-dialogs.spec.ts` (NEW, 6 legs) written first against the unmodified tree. Run ×2: **5 failed / 1 passed**, every failure for the intended reason, evidence in `geo-drift-RED.log` + Playwright error contexts:
- registry record dialog (`/#view=domain&id=sanatate&tab=health`): drift fix landed (strip read "Aproape de București · precizie aproximativă 80 m", `/api/directory?...lat=44.429` re-keyed in flight) — `#record-health-0` collapsed anyway.
- transit line reader (`/#view=domain&id=transport`): `.transit-dialog` gone after the drift (probe run with the own-pin assert temporarily softened — the pin assert normally fires first; probe evidence in the error contexts).
- cinema film dialog (`/#view=domain&id=filme`): `.reader-dialog` heading gone **and** the cinema combobox flipped 1807→1824 after the drift (nearest-by-distance reorder leaked into the choice).
- own-position pin: absent on the national map and the places map view (requirement-2 RED).
- the manual-switch leg ("a real locality change closes and rescopes") — **green at birth by design** (negative drift pin: today's tree also closes on key change).
Two spec-side locator repairs during RED (not assertion changes): `getByLabel('Cinematograf')` resolves twice (the label wraps the select, so its text carries every option — and Radix aria-hides the page behind an open dialog, hiding it from role queries) → scoped CSS `.cinema-workspace select` nth(1).

**Geolocation delivery mechanism — probed before the spec settled** (`probe-geolocation-watch.mjs`, localhost only, zero production probes): Chromium fires a transient `POSITION_UNAVAILABLE` (code 2) into every active watchPosition on each override change (context.setGeolocation AND a single direct CDP `Emulation.setGeolocationOverride`), then delivers the new fix — but the app's error handler `stop()`s the watch and resets to default first, so the fix never lands. The e2e stubs `navigator.geolocation` at page init and replays the current fix to active watches (same callback shape the browser uses, no emulation artifact); the app's own quantization/locality/reset paths are fully exercised. **Raised (NOT implemented — outside mission scope)**: a single transient POSITION_UNAVAILABLE on a real device tears down the whole location context (city→default, dialogs close) — same bug family, product decision needed (how long stale device context may persist), belongs to the owner of location error semantics.

**GREEN** — all 6 legs pass, isolated run 15.7s (`geo-drift-GREEN.log`), and green again inside the full CI-sim fleet. `verify-location.mjs` (RED first: "the provider must publish a semantic area key", `areaKey` undefined, exit 1 — `verify-location-RED.log`) green ×2 including the new contract line.

**REFACTOR** — none needed: the area key is one expression beside the cell key, the reset sites are dep renames, and the own-position layer is one self-contained effect with its own layer group.

### What landed

| Task | What |
|---|---|
| Bug 1 — semantic area key | `LocationProvider` publishes `areaKey` (`local:{name}|{county}` / `manual:{name}|{county}` / `device:none` / `default`) alongside the cell `key`; `useLocationState`+`useGeographicScope` reset on `areaKey`; `key` deliberately unchanged for the cell consumers (radius params, map viewKeys, distance re-sorts). Reset effects moved to `areaKey`: record-workspace ×3 (RecordBrowser, LocalitySearch, TransportSearch), transit-workspace:62, cinema:23 **+ the cinema venue-choice guard**, events venue-choice guard (:33-34 + select onChange), page.tsx:121 gallery. Catalog:16 and FeedCards (record:23) already reset on locality identity — left as-is per the mission's "or locality identity". Cities.json async swap keeps the nearest locality at both coordinates (verified against the corpus), so the async re-resolve no longer re-keys anything. |
| Bug 1 — gate | `scripts/verify-location.mjs`: provider asserts (areaKey is a string; a ~200 m cell-crossing drift keeps `areaKey` while `key` moves; a real locality change re-keys it) + scoped-hook drift-stability block (same-cell-key move with same area keeps page 7 / scope "national" / open selection; area flip resets everything; delayed previous-area setters still hidden). |
| Requirement 2 — own position layer | `PublicMap` gains optional `ownPosition:{lat,lon,accuracy}|null`: blue dot (divIcon, `role="img"`, aria-label "Ești aici · precizie aproximativă N m") + honest accuracy circle, in a **separate Leaflet layer group with its own effect** — never enters the fitBounds corpus, never re-keys the map view, never touches `data-pins`. Wired on the three named surfaces: national map (page.tsx map view), places map view (places-workspace), per-line transit map (RouteReader — now reads the location context). On-device only: rendered from `geo.position` (null in manual/default/cleared mode), no API param, no persistence. One-paragraph mention on `/confidentialitate` ("Poziția aproximativă") + the page's own last-updated line bumped (the page's text commits to mirroring mechanism changes). |

### USB/CI battery + README lines for ORCHESTRATOR to register

- **`geo area key reset contract`** → lives in **`scripts/verify-location.mjs`** (extended in place; the script is already described in README battery prose at README:67 and README:477 — the :477 sentence "resetează paginarea…" may gain "starea legată de locație se resetează la schimbarea de zonă semantică (localitate), nu la derivarea fixului în alta celulă de ~100 m". Note: `verify-location.mjs` is currently NOT wired into `pr-validation.yml` (pre-existing state, untouched); wiring it is an orchestrator decision, not required by my mission.
- **e2e: NEW `e2e/geo-drift-dialogs.spec.ts` — 6 legs** (5 RED-first drift/closure legs + 1 green-by-birth honest-re-scope pin).
- No other README/battery additions; no new cron; no API surface change.

### Verification (commands run this session, final tree)

- `corepack pnpm exec tsc --noEmit` — **0 errors**
- `corepack pnpm lint` — **0 errors, 115 warnings** (= pre-existing ≤115 budget; zero added)
- `node scripts/verify-location.mjs` — GREEN **×2** (new area-key contract lines printed)
- `corepack pnpm exec playwright test e2e/geo-drift-dialogs.spec.ts` — **6/6 passed** (15.7s, final tree)
- Full fleet **CI=true sim** (my dev server killed first, port free): **185 passed / 0 failed / 9 skipped (7.4m)** — 194 legs / 37 files incl. my 6; the 9 skips are the registered hardware-premise legs; no flaky. Projections clean: line-live-map, transit-view, tranzy-view, courts (court-institution), federated-search, places-workspace, locality-instant (incl. its device-geolocation leg), catalog-flow, sweep-regressions, legal-pages (privacy page pins preserved by the new paragraph).
- Family gates green: `verify-ro-text` · `verify-model-contracts` · `audit-controls` · `verify-geographic-scope` · `verify-recency-policy` · `verify-enrichment-joins` · `verify-css-keyframes`
- **`verify-sweep-inventory` RED — NOT mine**: fails on the parity family `resource/xml-table`, added by the parallel agent's in-flight `verify-source-errors.mjs` edit without its inventory-parity link (their lane, their registration line — precedence: Builder-D's same-shape completion in the previous session). None of my files feed that gate; verified the failure exists independent of my changes.

### Files (mine; partition respected)

- NEW: `e2e/geo-drift-dialogs.spec.ts` (6 legs)
- EDITED: `app/location.tsx` (areaKey), `app/location-scope.tsx` (hook resets on area key + contract comment), `app/record-workspace.tsx` (3 reset effects), `app/transit-workspace.tsx` (reset effect + RouteReader ownPosition), `app/cinema-workspace.tsx` (choice guard ×3 + reset effect), `app/events-workspace.tsx` (venue choice guard ×3), `app/page.tsx` (gallery reset line + national-map ownPosition prop ONLY), `app/places-workspace.tsx` (ownPosition prop ONLY — marker wiring), `app/public-map.tsx` (ownPosition layer), `app/confidentialitate/page.tsx` (position paragraph + date line), `scripts/verify-location.mjs` (area-key contract)
- NOT touched: `lib/live/resources.ts`, `lib/live/source-xml.ts`, `scripts/verify-source-errors.mjs`, `e2e/resource-flow*`, README, `.github/**`, `public/.well-known`, `twa/**`, the parallel agent's files, corpus, refresh-group registry

### Out-of-partition observations (flagged, not fixed — same drift-close family)

- `app/places-workspace.tsx:77` `setPage(0)` still dep'd on cell `geo.key` (marker-wiring-only partition for me); `app/weather-workspace.tsx:18` station/forecast page resets on cell key; `app/experts-workspace.tsx:26` and `app/notaries-workspace.tsx:21` close their open details on cell drift (their `open` state is `useLocationState`, so the dialog itself now survives — only the extra explicit reset remains); `app/courts-workspace.tsx:36-37` aborts+resets the search state on cell key. All outside my mission's file list; the area-key pattern applies to each the same way if the mission is extended.
- The transient-error teardown raised above (Chromium artifact exposed it; real-device provider blips behave the same).

### Self-review (four lenses)

- **Completeness**: both bugs delivered end-to-end — the semantic area key on every named reset site (mission list + the two choice-guards the survival requirement implies), the own-position layer on exactly the three named map surfaces with the privacy mention; nothing stubbed; RED evidence kept.
- **Quality**: areaKey is one derivation beside the existing cell key with its contract in a comment; the own layer composes existing Leaflet machinery (layerGroup/divIcon/circle) and is structurally incapable of churning the pin corpus; Romanian UI copy ("Ești aici · precizie aproximativă N m"), English code comments.
- **Discipline**: strict file partition held (page.tsx/places-workspace minimal diffs verified via git); no README/.github writes (registration handed to the orchestrator); zero production network probes (localhost dev server + stubbed e2e only; probe script archived in the session dir); no new cron, no API param, no persistence for the dot.
- **Testing**: RED proven on the pre-fix tree ×2 with failure reasons read from error contexts (not just counts); the gate RED proven before implementation; GREEN re-verified twice on the final tree; full fleet green ×1 in CI-sim; the one collateral gate failure triaged to the parallel agent's lane with evidence.

**Status: DONE** — bugs 1+2 implemented and verified; registrations listed above for the orchestrator; two raised observations (transient-error teardown, remaining cell-key reset sites) documented, not silently fixed.

## Builder-D2

**Bug**: 3 — XML tabular at the CKAN resource reader (strat de tabel în `parseResource` pe tokenizer-ul `source-xml.ts`, normalizarea formatelor, netabelabilul document onest) · **Status: DONE** (all evidence below on the final tree)

### TDD cycle (RED → GREEN → REFACTOR)

- **RED (matrix, pre-change loader)**: `matrix-prechange-RED.log` — the extended matrix aborts at `resource/xml-table / format-zip-shp` with today's `Formatul ZIP, SHP nu are încă un cititor integrat` vs the asserted normalized `Formatul ZIP …`; the failure cells before it (http500/429/timeout/malformed/xxe) pass on the unmodified loader as expected (error paths touch no new code).
- **RED (probe, pre-change `parseResource`, every variant)**: `probe-xml-prechange.log` — `success` (XML tabular) → today `kind:'text'`; `format-xml-dot` (`XML.`), `format-xslx` (`XSLX`), `format-json-soap` (`JSON, SOAP, XML`) → today all throw "no cititor integrat". 4 cells fail today and pass only after the change; `xxe` and `success-document` are green-at-birth pins (guard + fallback already existed).
- **GREEN**: matrix green ×2 on the final tree — **33 families / 219 cells** (was 32/202), `resource/xml-table` contributing **17 cells**; new-spec legs 4/4; full fleet **189 passed / 9 skipped / 0 failed in 7.6m under `CI=true`** (incl. D1's geo-drift legs and M1's packaging legs).
- **REFACTOR**: one real defect found and fixed mid-GREEN (documented below — the TXT return fell through the XML table branch, caught by the `success` cell asserting `kind:'text'` against a proven-dominant fixture); no behavior change beyond it.

### Per-task status

| Task | Status | What landed |
|---|---|---|
| XML table tier in `parseResource` | DONE | XXE guard FIRST (unchanged message/position, before any flattening), then `xmlTableRowSet(text)`: dominant repeatable row set — deepest level where one local name covers ≥80% of siblings with count ≥2 under the same parent; qualifying parents with the same row name merge, competing lists pick the larger (exact tie → honest document), rows of same-name children under non-qualifying parents stay out; rows = element attributes (`@name`, xmlns declarations excluded) + child dot-path columns (depth ≤3; beyond-cap content surfaces as the depth-3 column's text; repeated children enumerate `Nume[1..n]` to the set-wide max, one value per column); attributes of nested elements get `path.@attr`; mixed direct text keeps a `#text` column; sheet name = row element's namespace-stripped local name (`title` fallback threaded as optional 3rd `parseResource` param); sheet returns `kind:'table'` so `indexTable`/`chunkRows`/`resourcePage`/exports apply **verbatim** — zero API/schema surface; no dominant set / >128 columns / zero columns / any structural anomaly → today's document tier (`kind:'text'`, format `XML`, `textComplete`), honestly labeled. TXT/TEXT behavior byte-identical (split out of the shared branch, same guard). |
| Format normalization at the dispatch | DONE | `normalizeResourceFormat`: uppercase → first token split on `[,;/ ]` → strip surrounding dots/spaces → alias map `{XSLX→XLSX, XLSXL→XLS, XLSL→XLS}`; `XML.` reaches the XML reader via the trailing-dot trim; `JSON, SOAP, XML` → JSON; `ZIP, SHP` stays honest no-reader with the first form named (`Formatul ZIP nu are încă un cititor integrat.`). Loader version `resource.complete-index.v5→v6` (shape change invalidates stale text-tier copies of XML resources, per the loader contract). |
| Matrix cells (`verify-source-errors.mjs`) | DONE | New family `resource/xml-table` — fixtures mirror published data.gov.ro export shapes. Cells: `http500/http429/timeout/malformed` (failure envelope), `xxe` (reject before flattening), `format-zip-shp` (no-reader, normalized label), `success` (attribute columns + leaf children + nested dot-path, exact column set + rows deepEqual, sheet name `Contract`, indexed/complete, chunks not leaked), `success-dots` (3-level paths, depth-3 container subtree-text, no 4th-level column, child attribute column), `success-repeats` (`Telefon[1..2]`/`Email[1..3]` deterministic enumeration, exact matrix), `success-document` (no dominant set → `kind:'text'` + `textComplete`), `success-two-lists` (competing unequal lists → larger wins), `success-tie` (exact tie → document, no arbitrary pick), `success-sections` (same-name rows merged across qualifying parents — 7 rows, the non-qualifying parent's solo row excluded), `format-xslx`/`format-json-soap`/`format-xml-dot` (published variants normalize to the right reader), `warm-http500` (the table copy serves stale under 500, metadata retried 3×, no re-download). |
| e2e `resource-flow.spec.ts` (NEW) | DONE | 4 stubbed legs: (1) XML table renders 120 rows / sheet name `Contract` / flattened headers (`@id`…`Adresa.Judet`), server-side search (`Cluj` → 42 rows, filter reset), sort toggle (aria-sort ascending → descending, first row 1 → 120) and pagination (50/page, 'din 3', page 2 starts at row 51) through the shared table machinery; (2) non-tabular XML renders the document tier honestly (`.full-document`, format-labeled search `Caută în documentul XML`, paragraph filtering, PDF export offer, **no** `.table-explorer`); (3) CSV + XLSX export from the table tier — ResourceTableDownload → `/api/resource-file` with `id/format/sheet/download` params asserted, `X-Aflivra-Rows`/`X-Aflivra-Sheets` headers served (the existing route pattern), real download events with `.csv`/`.xlsx` names, `export-ready` links; (4) the `XML.` published-format variant loads through the same table tier with its honest label on the resource button. 4/4 green in isolation, in the fleet, and re-run post-restore. |

### Flattening stats — synthetic fixtures (`probe-stats.mjs`, offline, reproducible)

| Fixture | Detected | Time |
|---|---|---|
| CNAS-like registry, 50 000 rows, 8 columns (attrs + leaves + 1 nested address) | table `Contract`, 50 000×8 | 415 ms for a 10.79 MB document |
| Wide row 5 000×40 columns | table `Rand`, 5 000×41 | 175 ms / 4.32 MB |
| KML-like: 20 folders × 250 placemarks (deepest set wins over folders) | table `Placemark`, 5 000×3 | 21 ms / 0.54 MB |
| RSS-like: 2 000 items in a channel | table `item`, 2 000×4 | 10 ms / 0.31 MB |
| Root-level row fragment (3 unwrapped rows, virtual root) | table `Rand`, 3×1 | <1 ms |
| Repeats storm 3×200 same-name children (deepest dominant = the repeated child) | table `X`, 600×1, under the 128-column cap | 1 ms |
| Pathological unterminated `<a …` 200 KB (CPU-guard observation) | immediate honest `null` → document, no hang | <1 ms |

Risk posture consistent with the existing tokenizer (same regex): XXE guarded before any flattening, 25 MB download cap bounds the absolute work, D1 chunk caps bound storage; no new deps, no DOM.

### Files (mine, partition respected)

- EDITED: `lib/live/source-xml.ts` (BNR path `xmlChildren`/`xmlChild` byte-identical; added `xmlParts`/`xmlTagAttributes`/text+entity helpers/`scanDominance`/`scanRows`/`flattenRow`/`xmlTableRowSet`), `lib/live/resources.ts` (format normalization + `title?` param + XML branch split + loader v6 ONLY in the places listed above), `scripts/verify-source-errors.mjs` (new family/f/fixtures/expectations + `resource` route wiring + module import + summary sentence — no other cells touched).
- NEW: `e2e/resource-flow.spec.ts` (4 legs, all stubs inline — zero live fetches, politeness clean).
- Cross-partition completions (disclosed, all load-bearing for the battery): `scripts/verify-downloads.mjs` + `scripts/refresh-resource-copies.mjs` transpile lists gained `'source-xml'` (their transpiled `resources.mjs` now imports `./source-xml.mjs`; without it both harnesses break at import — not executed `refresh-resource-copies`, edit-only: it fetches live sources), `scripts/verify-sweep-inventory.mjs` — `'resource.datastores':{harness:'verify-downloads.mjs',parity:'resource/xml-table'}` (the parity↔registry link for the new matrix family; truthful: the CKAN resource reader is exactly that registry family's parity surface — same pattern Builder-D set for `legal/act-page`).
- Session artifacts: `matrix-prechange-RED.log`, `probe-xml-prechange.mjs`/`.log`, `probe-stats.mjs` (reproducible DER/stats evidence).

### Registration for the orchestrator (battery/README lines — NOT written by me, my partition excludes them)

- **README.md line 21**: `verify-source-errors.mjs` prose says "32 de familii / 202 celule" → **33 de familii / 219 celule**, and the family clause should gain: familia `resource/xml-table` (strat de tabel XML: rând dominant, atribute + copii pe coloane cu punct, copii repețiți enumerați, netabelabilul document onest, XXE respins, variantele de format normalizate). **README.md line 230** carries an even staler "31 de familii (196 de celule)" → same 33/219 correction with the resource/XML-table clause.
- **No battery registration needed**: `verify-source-errors.mjs` is already in `pr-validation.yml` (line 65) and my cells extend it in place; the new `e2e/resource-flow.spec.ts` is picked up automatically by the Playwright config; no new gate scripts, no cron.
- Verify cells to name if prose is added: `resource/xml-table` — celulele `success`, `success-dots`, `success-repeats`, `success-document`, `success-two-lists`, `success-tie`, `success-sections`, `xxe`, `format-xslx`, `format-json-soap`, `format-xml-dot`, `format-zip-shp` (+ the failure envelope `http500/http429/timeout/malformed` and `warm-http500`). e2e legs: `e2e/resource-flow.spec.ts` ×4 (table flow cu căutare/sortare/paginare, document onest, export CSV/XLSX, varianta `XML.`).

### Verification (commands run on the final tree, this session)

- `corepack pnpm exec tsc --noEmit` — **0 errors** (also re-verified after the e2e-birth stash dance and restore)
- `corepack pnpm lint` — **0 errors, 115 warnings** (= the ≤115 budget, zero added)
- `node scripts/verify-source-errors.mjs` — GREEN **×2** (33 families / 219 cells; also green ×1 post-restore)
- `corepack pnpm test:e2e` under `CI=true` — **189 passed / 9 skipped / 0 failed, 7.6m**, port 5173 verified free first, my own dev server started and torn down by the run
- Collateral gates green on the final tree: `verify-downloads` (incl. my transpile-list completion), `verify-sweep-inventory` (parity link proven both directions), `verify-refresh-sweep`, `verify-recency-policy`, `verify-ro-text`, `verify-model-contracts`, `audit-controls`, `verify-enrichment-joins`, `verify-federated-search`, `verify-packed-seeds`, `verify-live`, `verify-watch-sweep`, `verify-watch-api`, `verify-legal-records`

### e2e RED note (why the legs are green at birth)

The e2e legs stub `/api/resource`, so the loader tier is not observable through them — they pin the UI flow (the shared table/document machinery and the export flow), and are green at birth **by design**; proven against the pre-change loader too (stash → 4/4 pass → pop). The RED evidence for the change lives where the mission put it: the matrix cells DER-proven on the pre-change loader (logs above).

### Self-review (four lenses)

- **Completeness**: all four mission items delivered (table tier with all flattening rules, normalization with the exact alias map, matrix cells for every named shape + the failure envelope, 4 e2e legs); no scaffolding, no TODOs, every state honest (document fallback + exponent tie-refusal + XXE reject all pinned).
- **Quality**: reuses the existing tokenizer regex/validation semantics; zero new deps; zero API/schema change (the table rides `indexTable`/`chunkRows`/`resourcePage` verbatim); Romanian UI strings untouched (existing machinery), Romanian error messages, English code comments in new e2e code; the scanner's rules are pinned by cells, not just implemented.
- **Discipline**: strict partition held — `app/experience.tsx` NOT touched (the table/document tiers render generically; no state D1's changes could disturb); `refresh-resource-copies.mjs` edited but never executed (live-fetch importer); the three cross-partition one-liners are disclosed above with their load-bearing reason.
- **Testing**: DER-proven per variant before any loader change; matrix green ×2; mid-GREEN defect (fall-through return) found by my own cell and fixed with the cell exactness, not assertion weakening; fleet green ×1 CI-sim; probes archived and reproducible.
