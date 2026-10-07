# STATUS — map-compliance-flows

## Builder-B Findings (compliance)

GDPR wave, store-independent (no marketplace work, per user decision). All work inside the worktree; no branch ops. Companion wave: Builder-A owns the map/transport/places surfaces — my edits never touch those files (their mid-edit `app/transit-workspace.tsx` briefly failed a shared `tsc`/`lint` pass; it settled green by my final gates).

### TDD evidence — RED → GREEN → REFACTOR

**Arc 1 — legal pages, footer, first-use notices (e2e)**
- RED: wrote `e2e/legal-pages.spec.ts` (8 tests: /confidentialitate SSR + render Art. 13 elements, /termeni SSR + render, footer legal links on home + standalone /catalog, position one-liner, watch tooltip). Run: **8/8 failed** (pages 404, links/notices missing).
- GREEN: `app/confidentialitate/page.tsx`, `app/termeni/page.tsx`, `app/site-footer.tsx` (wired to catalog + both legal pages), footer links + contact email added to `app/page.tsx`, position one-liner in `app/location.tsx`, watch tooltip in `app/watch-button.tsx`. Run: 8/8 passed.
- REFACTOR: `next/link` for page-route hrefs (repo lint rule; my new files are not on the legacy amnesty list), Romanian curly closers `„…”`, diacritic fixes, assertion strings pinned to the real text. Re-run: 8/8 passed.

**Arc 2 — VAPID contact (harness pin)**
- RED: strengthened `verify-watch-sweep.mjs` Leg 6 (`payload.sub` must equal `mailto:contactretetesecrete@gmail.com`) — failed against the placeholder.
- GREEN: `lib/live/web-push.ts:12` → real contact. Harness continued past Leg 6.

**Arc 3 — retention (sweeper + harness fixture)**
- RED: added harness Leg 11 (400-day watch with no events must be purged; 400-day watch **with** a recent event must stay; fresh watch stays; 400-day events purged) — failed (`retentionWatches` undefined).
- GREEN: retention pass in `lib/live/watch-sweep.ts` — `WATCH_INACTIVE_DAYS=180` / `EVENT_RETENTION_DAYS=365` exported constants; before each check pass, watches with `created_at < cutoff(180d)` **AND** `COALESCE((SELECT MAX(created_at) FROM watch_events …), created_at) < cutoff(180d)` are deleted in chunks; events older than 365d deleted; both recorded in `state.retentionWatches/retentionEvents` + sweep notes. Leg 11 green; whole harness exit 0.
- REFACTOR/pin: Leg 12 added — reads `app/confidentialitate/page.tsx` + `app/site-footer.tsx` + `app/page.tsx` and asserts the policy's numbers are the sweeper's constants and the contact email matches everywhere. Changing `180`/`365` or the email without updating the page now breaks the battery — the text↔code drift is mechanically locked.

### Files modified (path: summary)

- `app/confidentialitate/page.tsx` (new) — RO privacy policy, Art. 13-complete; every number/mechanism maps to code (table below).
- `app/termeni/page.tsx` (new) — RO TOS: aggregator nature, official-source-as-truth + current source links, no-warranty, liability limits, per-source licensing (→ „Surse și licențe"), acceptable use (no automated hammering), changes.
- `app/site-footer.tsx` (new) — shared standalone-page footer: brand, catalog, **Confidentialitate · Termeni · contact email**.
- `app/page.tsx` — home footer-links gain Confidentialitate/Termeni/`mailto:contactretetesecrete@gmail.com`.
- `app/catalog/page.tsx` — SiteFooter added (standalone pages carry the legal footer too).
- `app/location.tsx` — LocationControl one-liner: position is requested-only, coarsened on-device (2/3 decimals), **never persisted server-side**, only chosen city stays local; links the policy.
- `app/watch-button.tsx` — ControlHint says what is saved (followed ref + anonymous install id, on server, until deleted via „Șterge-mi datele").
- `app/watch-center.tsx` — **not modified**: push first-use copy verified already honest (`:218` install-id-at-first-watch, `:226` „Cerem permisiunea browserului doar când apeși butonul").
- `lib/live/watch-sweep.ts` — retention pass (constants + purge + state/notes); `WatchSweepState` gains `retentionWatches/retentionEvents`.
- `lib/live/web-push.ts` — `VAPID_CONTACT` → the real operator email (RFC 8292 `sub`).
- `scripts/verify-watch-sweep.mjs` — Leg 6 strengthened (exact contact), Leg 11 retention fixture, Leg 12 policy↔code drift lock.
- `e2e/legal-pages.spec.ts` (new) — 8 specs.
- `docs/compliance/registru-art-30.md` (new) + `docs/compliance/breach-runbook.md` (new) — both RO, referencing real mechanisms (file:line verified this session).
- `README.md` — verify-watch-sweep battery sentence extended (retention + VAPID-contact + policy-lock; `410`→`404/410` truth fix — the code maps **both** 404 and 410 to gone, `web-push.ts:71`); e2e spec-file count corrected 14→23 (was stale before this wave).

### Cross-check table — policy text ↔ verified code truths

| /confidentialitate says | Code truth (verified) |
| --- | --- |
| 180 de zile → inactive watch purged | `WATCH_INACTIVE_DAYS=180` (`lib/live/watch-sweep.ts:42`), purge before check pass (`:157-169`); harness Leg 11 (400-day watch, no events → purged) |
| 365 de zile → events max | `EVENT_RETENTION_DAYS=365` (`:43`), `DELETE FROM watch_events WHERE created_at<?`; Leg 11 (2 × 400-day events → purged, recent event stays) |
| 2 zecimale (~1,1 km) pentru vreme | `app/local-weather.tsx:9` `lat.toFixed(2)` |
| 3 zecimale (~110 m) pentru context geografic | `lib/geographic-scope.ts:18` `geographicParams` `toFixed(3)` |
| poziția „nu sunt salvate pe server" | no position column/table anywhere in `drizzle/0000_thin_demogoblin.sql`; localStorage keeps only mode/manual city (`app/location.tsx:19-36`) |
| Abonamentul push șters automat când serviciul de livrare îl raportează dispărut | `lib/live/web-push.ts:71` maps **404 or 410** → `gone`; sweep deletes the row (pushGone branch). (Task said "409/410" — verified truth is **404/410**; policy, README and registru state the code truth.) |
| Notificările criptate trec prin serviciul de livrare al platformei, fără ca acesta să le poată citi conținutul | RFC 8291 aes128gcm E2E encryption (`web-push.ts:49-62`) |
| „Șterge-mi datele" șterge integral + schimbă identificatorul | `purgeInstall` (`watch-sweep.ts:130`), route `app/api/watch/purge/route.ts`, `clearInstallId` (`app/install-id.ts:22`), button `app/watch-center.tsx:93` |
| Datele persistente în D1 „Uniunea Europeană (Europa de Vest)" | **user decision (D1 runs in WEUR/EU)** — recorded as the operator's decision in the registru; not verifiable offline (deploy config records no location; no network used) |
| identificator anonim la prima urmărire | `app/install-id.ts:1-38` (lazy `crypto.randomUUID`) |
| Cloudflare = împuternicit; Open-Meteo primește coordonatele rotunjite de pe serverul nostru | `app/api/weather/route.ts:6` + `readSource` pipeline (forecast fetched Worker→Open-Meteo) |
| contact contactretetesecrete@gmail.com | policy + both footers + `VAPID_CONTACT` (`web-push.ts:12`) — equal, pinned by harness Leg 6/12 and e2e |

### Gates (run this session, outputs above)

- `corepack pnpm exec tsc --noEmit` → exit 0, no errors.
- `corepack pnpm lint` → exit 0 — **0 errors, 115 warnings** (≤117 baseline).
- `node scripts/verify-watch-sweep.mjs` → **×2 exit 0** (ran twice consecutively twice: after Leg 11 and again after Leg 12 — 12 legs, retention + policy-lock included).
- `node scripts/verify-watch-api.mjs` → exit 0 (routes untouched by my exports change).
- `node scripts/audit-controls.mjs` → exit 0 (`site-footer.tsx` passes the structural scan — plain links all carry href).
- `node scripts/verify-ro-text.mjs` → exit 0.
- Full e2e: `corepack pnpm test:e2e` → **124 passed, 0 failed**, exit 0 (23 spec files incl. the new legal-pages).

### Four-lens self-review

- **Completeness**: all 8 assigned tasks implemented; no stubs/TODOs; pages are full prose, runbook/register reference real mechanisms; nothing deferred.
- **Quality**: follows the exact standalone-page pattern (`app/catalog/page.tsx`), reuses existing CSS classes only, repo harness conventions for the new legs, `next/link` where the repo's lint demands it for new code, Romanian diacritics checked word-by-word (fixed my own slips: „urmăririle", „afișăm", curly closers).
- **Discipline**: RED→GREEN→REFACTOR per arc (evidence above); scope kept to my partition — no marketplace, no map/transit/places files touched; the only cross-partition residual is the stale e2e count + 404/410 wording in README lines that describe my subsystem.
- **Testing**: assertions hit real behavior (SSR HTML, rendered pages, hover-open tooltip, real SQL purge on an in-memory D1 schema); numbers locked against drift by harness Leg 12.

### Reservations (small, stated)

1. **D1 WEUR/EU** is stated on the page per the user decision; it could not be re-verified from the repo (no location recorded, no network allowed). Registru marks it as the operator's decision.
2. **Cloudflare DPA URL** (`https://www.cloudflare.com/cloudflare-dpa/`) cited from knowledge, not fetched this session — worth one online confirmation.
3. First-use notices: the position one-liner renders on the non-compact LocationControl (home location-strip — the primary surface where asking happens); compact variants stay button-only by design (no banners, per task).

**Status: DONE** — pages, footer, retention, notices, docs, VAPID contact delivered; all gates green (tsc 0, lint 0 errors/115 warnings, harness ×2 exit 0, full e2e 124 passed).

---

## Builder-A Findings (maps)

Scope: the Architect's 6-item fix list from `../map-compliance-analysis/ANALYSIS.md` §4, exactly — the map/transport/places surfaces. The parallel Builder-B wave owns the legal/footer/watch surfaces; my edits never touch those (their page.tsx footer hunk was left untouched in place).

### TDD evidence — RED → GREEN → REFACTOR

**Fix 1 — stale vehicles render+label (bug #1, `transit-workspace.tsx:49,52`)**
- RED: `e2e/transit-view.spec.ts` „a stale operator copy keeps every vehicle position on the map, labeled «poziții de acum ~7 minute»" — failed: map absent behind the `ld.isLive` gate, 0 arrows (per-vehicle 120 s drop). `e2e/tranzy-view.spec.ts` „a stale Tranzy copy keeps the vehicle map rendered, labeled «poziții de acum ~9 minute»" — failed: `.public-map` never appeared.
- GREEN: dropped both render gates and the 120 s per-vehicle drop (only non-finite lat/lon rows are skipped); the caption carries the flights-pattern `stalenessText` age label (`poziții de acum ~X minute/oră/zi`); both live APIs now publish `stalenessMinutes` from `lastSuccessAt` (`transport-live/route.ts`, `tranzy-live/route.ts` — the flights arithmetic, incl. `Math.max(0, …)`). Honest zero states kept: no feed ever fetched (no Tranzy key / unavailable) renders no map, no records.
- REFACTOR: one stale-label ternary shared by both branches; arrows still render by bearing, circles otherwise.
- Tests: `e2e/transit-view.spec.ts`, `e2e/tranzy-view.spec.ts` (2 new legs).

**Fix 2 — radius 1–100 km threaded (bug #2 side, `geographic-scope.ts:18-26`)**
- RED: `scripts/verify-geographic-scope.mjs` — `readGeographicContext({...radius:'100'}).radius` was `undefined` (assertion failed, exit≠0); e2e legs failed on the missing `Rază` selector.
- GREEN: `geographicParams(geo,scope,cityDefault,radius?)` emits `radius` when passed; `readGeographicContext` parses `radius` (absent → 15; integer 1–100 or honest 400 rejection — never clamped); `GeographicContext.radius` + `availableContext(…,radius=15)`. Both APIs pass `context.radius` into BOTH `nearbyRecord` call sites (`transport-live` nearStops/nearRoutes + vehicle rows; `tranzy-live` rows). `TransitWorkspace` carries the same 2–100 selector (places-selector family, `countText` labels: „N vehicule în raza de X km"), threaded via `geographicParams` for the vehicles view only (arrivals/alerts/lists keep 15 km); help copy states honestly: raza mărește filtrarea, nu extinde acoperirea (TPBI / operatorul Tranzy).
- Battery legs: TPBI vehicle at ~24 km served only at radius 30; Tranzy at ~22 km only at 30; `radius=101` → 400; stale copy keeps `stalenessMinutes: 8` + all positions served.
- Tests: `e2e/transit-view.spec.ts` + `e2e/tranzy-view.spec.ts` radius legs (request URL assertions) + battery legs above.

**Fix 3 — trains honest note**
- No behavior change to test — copy/comment only (registered option, per YAGNI rule). `trains-workspace.tsx` intro now states: edițiile publicate sunt doar ore planificate — pozițiile în timp real nu sunt disponibile de la operator, deci pagina nu desenează trenuri pe hartă și nu inventează poziții. `lib/live/trains.ts` corpus comment extended: no operator publishes real-time positions and `TrainStation` carries no lat/lon, so nothing can be placed on a map today; station-map stays a registered option until an Infofer edition exposes coordinates. Existing trains tests green.

**Fix 4 — map-aware page size (`places-query.ts:9,21,24`)**
- RED: `e2e/places-workspace.spec.ts` — map view never issued a request carrying `pageSize=200` (waitForResponse timeout); direct API leg: `pageSize=200` served `pageSize: 18`; invalid `pageSize` values were silently ignored instead of rejected.
- GREEN: `PlacesQuery.pageSize?:number` (default 18 — list views unchanged); `queryPlaces` uses `query.pageSize??18` everywhere `size` was fixed; `/api/places` validates `pageSize` integer 1–200 (0/201/500/abc/18.5 → 400 `Alege o localitate și filtre valide.`); `PlacesWorkspace` sends `pageSize=200` only when `view==='map'`. Battery: 18-item list page stays the exact distance-sorted prefix of the 200-item map page around Cluj.
- Tests: `e2e/places-workspace.spec.ts` (2 new legs) + battery leg.

**Fix 5 — radius selector on the national repere map (`page.tsx:105,142`)**
- RED: `e2e/map-markers.spec.ts` „the repere map obeys the chosen radius around the active locality" — no selector in `#view=map` (element not found).
- GREEN: `exploreRadius` (`useLocationState('15')` — resets per locality switch) threaded into `localPlaces`' `nearbyRecord(p, geo.center, radius)`; selector in the map sidebar (same 2–100 family as places); the „raza de 15 km" copy at `page.tsx:136` (explore gallery) and `:158` (recommendations) is now dynamic. Deterministic corpus counts asserted: Brașov 15 km → 3 pins, 100 km → 47 (nearest outside place 5 km clear of the threshold; margins computed offline against the exact haversine `distanceKm` + the cities.json Brașov coordinates).
- Tests: `e2e/map-markers.spec.ts` (1 new leg).

**Fix 6 — remaining 15 km surfaces: REGISTERED-ONLY (raised, not built)**
- `transit-workspace.tsx:43` network route/stop list client filter `<=15` + the route `<option>` filter + the „raza de 15 km" network copy — kept at 15.
- `app/cinema-workspace.tsx:17,26-27`, `app/events-workspace.tsx:16,20`, `lib/tabular-geography.ts:8,13` (catalog tables) — kept at 15; no radius selector anywhere on these surfaces.
- Rationale (Architect §4.6): connected-network surfaces whose publishers set their own coverage; a radius selector there is scope creep. To extend later: thread the same `readGeographicContext.radius`/`geographicParams` path — the plumbing now exists.

### Files modified

| File | Summary |
|---|---|
| `lib/geographic-scope.ts` | `radius` on `GeographicContext`/`availableContext`; `geographicParams(…,radius?)`; `readGeographicContext` validated radius (1–100 integer, absent=15, invalid→null) |
| `app/api/transport-live/route.ts` | radius into both `nearbyRecord` sites; `stalenessMinutes` published on stale copies |
| `app/api/tranzy-live/route.ts` | radius into `nearbyRecord`; `stalenessMinutes` |
| `app/transit-workspace.tsx` | stale render+label both branches; `stalenessText` helper; RadiusField + honest help; countText captions; radius in live URLs + viewKeys |
| `app/trains-workspace.tsx` | honest planned-times-only note |
| `lib/live/trains.ts` | corpus comment: no positions, no station coordinates, station-map registered-only |
| `lib/places-query.ts` | `PlacesQuery.pageSize` parameterization (default 18) |
| `app/api/places/route.ts` | `pageSize` param, validated 1–200 |
| `app/places-workspace.tsx` | `pageSize=200` when `view==='map'` |
| `app/page.tsx` | latest-threading lines only: `exploreRadius` state + selector in `#view=map` sidebar + dynamic raza copy (`:136`,`:158`) + `localPlaces` `nearbyRecord` radius |
| `e2e/{transit-view,tranzy-view,places-workspace,map-markers}.spec.ts` | 7 new legs (all RED-first) |
| `scripts/verify-geographic-scope.mjs` | radius-parse, both-API radius threading, staleness, pageSize legs (the battery that covers geographic scope) |

### Gates (run this session)

- `corepack pnpm exec tsc --noEmit` → **exit 0, no errors** (final re-run after all edits; one intermediate orphan-brace error in my tranzy rewrite was caught and fixed mid-session).
- `corepack pnpm lint` → my 14 touched files: **0 errors**, 42 warnings (pre-existing style classes: img-element, exhaustive-deps inherited shapes). Chain total measured 117 problems at one point (2 errors then in Builder-B's in-flight `confidentialitate`/`termeni` pages — mine contributed 0; Builder-B's final pass reports chain **0 errors / 115 warnings**).
- `node scripts/verify-geographic-scope.mjs` → **×2 exit 0** (consecutive runs; new legs included: „Both live-vehicle APIs thread the validated 1–100 km radius…" + „…list page keeps being the distance-sorted prefix of the 200-item map page").
- e2e RED confirmed first: all 7 new legs failed for the intended reasons (map hidden when stale / selector missing / no pageSize=200 request / pageSize ignored / battery radius undefined). After GREEN: each new leg passes.
- Full suite: first full run **121 passed, 3 failed** (`place-image-stability`, `locality-instant`, `federated-search`) — all 3 pass in isolation and the second full run is **124 passed, 0 failed** (parallel-load flakes against one dev server, not regressions; my 7 legs included in both runs).
- Probe (`ssnc-agent-orch/2026/10/07/map-compliance-flows/probe/map-fixes-probe.mjs`, run against my own dev server, killed after): transit Cluj-Napoca stale copy → caption „6 vehicule în raza de 100 km · poziții de acum ~7 minute · ultima copie a operatorului · operator: CTP Cluj-Napoca…", request carries `radius=100`, map rendered (screenshot `transit-cluj-stale-radius100.png`); places map at 100 km → `pageSize: 200, items: 200 of total 1466`, map rendered (screenshot `places-map-radius100.png`). (Screenshots captured but not visually re-inspected in-session — no image input — the DOM/URL/caption assertions above are the probe's evidence.)

### Four-lens self-review

- **Completeness**: all 6 fix-list items done — 5 built (RED→GREEN), item 3 copy-only by design. No stubs, no TODOs; stale/absent-feed zero states preserved (no map without data, no invented positions).
- **Quality**: radius contract mirrors the places API's existing validation pattern (reject, never clamp); the age label reuses the exact flights `stalenessText` logic and arithmetic; captions keep countText grammar; selector markup reuses the existing SelectField/control-label family.
- **Discipline**: stayed inside my partition — `app/page.tsx` touched only at the nearbyRecord threading lines + selector/copy mounts; Builder-B's footer hunk untouched; one accidental ternary rewrite in `transport-live` was diffed against git and restored to the original semantics before commit.
- **Testing**: every behavior change has a RED-first e2e or battery leg that failed for the documented reason before the fix; the full suite is green (124/124) — the 3 first-run flakes were isolated and pass individually plus on the full rerun.

### Reservations (small, stated)

1. `transport-live`/`tranzy-live` keep their 30 s poll even on a stale feed (pre-existing cadence); the staleness label is computed at request time and can lag up to one poll interval — same behavior as the flights surface.
2. The `pageSize=200` map page leaves `result.pages` expressed in 200-sized pages while the pagination UI under the map follows it (18-sized on cards) — consistent with what is rendered, but the two views paginate differently by design; assert-level copy (`entity-results-header` total) stays anchored on the unchanged total.
3. The map pin count for `pageSize=200` cannot be DOM-counted (Leaflet `preferCanvas` paints place pins into a canvas); the e2e asserts the served page + the visible canvas instead, and the battery asserts the 200-item prefix identity.

**Status: DONE** — fixes 1–5 built with RED-first evidence, fix 6 registered-only list recorded, all gates green (tsc 0; lint 0 errors on my files; battery ×2 exit 0; full e2e 124 passed; probe captured).

---

## UI/UX Findings (navigation + touch audit)

Both audits ran to completion against the live dev server (reused wave-1 leftover on :5173), with real mobile emulation (390×844, hasTouch, isMobile) and CDP `Input.dispatchTouchEvent` for touch pans and two-finger pinches. Probe scripts + JSON + screenshots: `probe/uiux/` (`touch-gesture-probe-v3.mjs`, `nav-flow-matrix-v3.mjs`, `touch-gesture-report.json` = PRE-fix RED, `touch-gesture-report-v3.json` = post-fix GREEN, `nav-flow-matrix.json` v3 post-fix).

### A. Touch gestures on the maps — root causes + fixes

Reported: „Natural Earth se micșorează foarte prost… nu pot face pan și zoom cu degetele pe mobil pe hartă".

**Verdict per surface (probe-measured):**

| Surface | Pan (finger) | Pinch (two fingers) | Before → After |
|---|---|---|---|
| `#view=map` — RomaniaMap SVG (the Natural Earth map, `v2-charts.tsx:57`) | **broken → fixed** | **nonexistent → added** | RED 16:29/16:31 → GREEN 16:48 (probe) |
| Leaflet `PublicMap` (places/flights/cinema/transit workspaces) | **works** (pane 0→100,80px, 12/12 moves, 0 cancel) | **works** (zoom z5→z6 measured on fresh tile requests) | no fix needed — guard legs added |

**Root causes found on RomaniaMap (all in our code), each with probe evidence pre-fix:**

1. `touch-action: pan-y` on `.romap svg` (`app/v2.css`) made the browser claim vertical-dominant drags for page scroll: probe measured **2 delivered moves → `pointercancel` → 28 page-scroll events → 0 map pan**.
2. The pan handler only armed when `e.target.tagName === 'svg'` (`app/v2-charts.tsx:81` old) — a drag starting on a pin (the pins carpet the map; the map-center drag hit Peleș' circle: **12 moves delivered, 0 cancels, 0 pan**) never panned.
3. **No two-pointer pinch existed at all** (20 two-finger moves delivered, zoom scale untouched).
4. **Pre-existing bug surfaced by the audit (also affected mouse!)**: the pan state updater re-read the mutable `svg._last` at React flush time — after the handler had already advanced it — so every move after the first computed delta 0. A 12-move mouse drag produced **a single frame of pan (translate 14.3px instead of ~171px)**.

**Fixes (all in `app/v2-charts.tsx` + 1 CSS line + probe-verified):**

- `touch-action: pan-y` → **`none`** on `.romap svg` (`app/v2.css:1`) — the map surface owns its gestures; the page still scrolls everywhere outside the bounded map card (standard interactive-map tradeoff, same one Leaflet's own container makes).
- Pan arms on **any pointerdown inside the svg** (pins included); taps stay selections via the existing ≤5px slop guard; a two-pointer gesture suppresses the click (`multiTouch` ref).
- **Two-pointer pinch** added: distance ratio from gesture-start base, zoom clamp 1–2.8 (matches the ± buttons), anchored on the CTM-exact pinch midpoint; pan updates are computed **absolutely from the gesture base** (pure updaters, immune to React batching) and the pan delta is computed synchronously at handler time (fix #4 above).
- Post-fix probe: drag-from-pin → `translate(196,130)`; vertical drag → 12/12 moves, 0 cancellants, 0 page scrolls; pinch → `scale(2.27)` with anchored pan; mouse control leg → full 171/110px (also repaired).

**New e2e (RED documented by the pre-fix probe runs, GREEN now): `e2e/map-touch-gestures.spec.ts`, 6 legs** — drag-from-pin pans; vertical drag pans with **0 pointercancel + 0 page scroll**; pinch zooms >1.3; tap on a measured pin still navigates to the place profile; reset button restores `translate(0 0) scale(1)`; leaflet guard leg (pan + pinch raises the requested tile zoom, tiles stubbed with `Cache-Control: no-store` — the probe first produced a false negative from browser-cached tile routes).

**Probe-method findings registered honestly (were my own measurement bugs, each corrected in-session):** unscoped `.romap` queries catch the home view's compact romap during the initial render (scrolls to a wrong 18,570px target — fixed by scoping to `.map-workspace .romap` + waiting for `data-view=map`); `scroll-behavior:smooth` + asynchronously-growing sidebar also overshoots `scrollIntoView` (use `behavior:'instant'`); `route.fulfill` responses get browser-cached (needs `no-store`); leaflet's container IS the `div.public-map` itself (`.public-map .leaflet-container` never matches a descendant).

### B. Navigation flows — the matrix + dialog-first-tap

**Matrix (probe v3, post-dialog-fix)** — `nav-flow-matrix.json`: **91 cells** (mobile 390×844 + desktop 1280×800 × entries home/dashboard/map/deep-domain-tab/place-profile/watch-center/saved × targets home/dashboard/map/compare/watch/saved + menu-sheet + brand), every cell measured **activates on the first press** (view flip ≤336ms, same-state presses keep state), `elementFromPoint` at the nav coordinates resolves to the nav button in every entry state (cover-checks all green), back-button legs return to home and re-press activates with 1 press, CPU-4× legs stay 1-press (1.0–1.6s view flips under throttle).

**REAL defect found + fixed — the post-dialog first-tap drop (the „trebuie să apeși de 2–3 ori" complaint):** after closing any dialog/sheet, the exiting overlay kept hit-testing for ~155–182ms, swallowing the first press at the nav bar. The earlier wave's intended fix (`data-[state=closed]:pointer-events-none` in `components/ui/sheet.tsx` / `dialog.tsx`) **never actually compiled** — probe showed **zero pointer-events rules in any stylesheet** for those Tailwind arbitrary variants (the content's apparent fix was Radix's inline re-assignment). Fix delivered where it cannot fail to compile: **plain attribute-selector CSS in `app/polish.css`** — `[data-slot=sheet-overlay][data-state=closed], [data-slot=dialog-overlay][data-state=closed], [data-slot=sheet-content][data-state=closed], [data-slot=dialog-content][data-state=closed] { pointer-events:none !important }`. Post-fix probe: **unblock 0ms, activated-1st-press = true** on lightbox (esc/x), act-reader (esc/x), cinema-film (esc), prefs-sheet (esc) — the exit animations still play visually, they just stop hit-testing the instant close starts. The wave-1 spec legs that had silently regressed (`navigation-flows.spec.ts` post-dialog ×5) are green again.

**Spec repair (not app):** `e2e/navigation-flows.spec.ts:156` asserted `getAttribute(...)` `toBeUndefined()` — `getAttribute` returns `null` when the attribute is absent; corrected to `toBe(null)` (this leg could never pass as written).

**Registered, no fix (rationale):**

1. **Menu fast-tap during slide-in (6 mobile matrix cells)** — a tap at the menu item's rest position ~60ms after opening lands on the still-sliding backdrop and dismisses (entry animation 300ms after the earlier wave halved it from 500ms). Standard drawer behavior (radix/vaul/ios sheets behave identically); reaction-time floor makes the window marginal; the settled-item legs all navigate with 1 press in every entry state. Registered as known fast-tap behavior, not a defect.
2. **Purge dialog leg N/A by design** — „Șterge-mi datele" is disabled on an empty watch center (`app/watch-center.tsx:93`); matrix contexts have an empty watch center. The purge flow itself is covered by `watch-flows.spec.ts` with seeded rows.
3. **Leaflet pinch fine-print** — its TouchZoom snaps to integer zoom levels (zoomSnap 1), so a 2.27× spread lifts one level (z5→z6); that is leaflet's native behavior, not ours.
4. **Matrix-probe reopen flakes (2 legs)** — the probe reopens dialogs faster than the exit unmount; the same interactions pass deterministically in the e2e suite. Probe-machinery, not app.

### Gates (this audit's changes)

- `corepack pnpm exec tsc --noEmit` → **exit 0, 0 errors**.
- `corepack pnpm lint` → **0 errors, 115 warnings** — same count the chain carried after wave-1 (my touched files added 0).
- Full e2e suite: **139 passed, 0 failed** (was 124 at wave-1 close; +6 new touch-gesture legs, +9 from the concurrently-landed wave legs), including the previously-regressed post-dialog legs and the new `map-touch-gestures` spec.
- Files I touched: `app/v2-charts.tsx`, `app/v2.css` (1 declaration), `app/polish.css` (+8), `e2e/map-touch-gestures.spec.ts` (NEW, 6 legs), `e2e/navigation-flows.spec.ts` (spec-semantics repair). No map DATA logic (staleness/radius/pagination) was touched — rendering/interaction surfaces only.

**Status: DONE** — touch-gesture root causes fixed at source (3 gesture bugs + 1 pre-existing state-updater bug), the navigation matrix re-measured all-green post-fix, the post-dialog first-tap drop fixed via compiling-CSS, 3 honest registrations recorded; gates green (tsc 0 / lint 0 errors / full e2e 139 passed).

## Builder Findings (perspective cards)

Task: wire the SAME category editorial images the dashboard renders onto the explore `#view=explore` „Mai multe perspective" domain cards (user report: cards „apar urât tare… nu e ca pe dashboard" — text-only, no images).

**How the images wire (answer to the root question).** The dashboard surface is `<CategoryDirectory>` (rendered by BOTH home and `#view=dashboard`, `app/category-directory.tsx:11`) — the saved view (`app/page.tsx` saved route) renders the same pattern inline. Both use the shared component **`app/category-photo.tsx` → `<CategoryPhoto id={d.id} cover/>`**, which renders:

```
<figure class="category-cover-frame">
  <img class="category-cover" src="/media/illustration-<id>.webp"
       srcSet="/media/illustration-<id>-960.webp 960w"     ← from category-illustrations.json variants
       sizes="(max-width:640px) 92vw, 25rem" alt={caption} loading="lazy" width={1672} height={941}/>
  <figcaption>Ilustrație AI</figcaption>
</figure>
<span class="domain-card-content">…icon, h3, p…</span>
```

All 16 explore domain ids resolve to a registered illustration (`vreme`→a v30 entry, `povesti`→reuses the cultura file), each with a **960w variant on disk**. **Change made (exactly one render expression, `app/page.tsx:143`):** the explore card button now renders `<CategoryPhoto id={d.id} cover/>` + the text wrapped in `<span className="domain-card-content">`, mirroring the dashboard card structure. No new component was needed — the shared `CategoryPhoto` already exists; no CSS was touched (`.v2 .domain-card .category-cover` / `.domain-card-content` / `.category-card-action` are global in `complete-data.css`/`controls.css`, already exercised by dashboard + saved).

- **Click behavior unchanged**: the button and its `go(...)` mapping (`bani→money`, `firme→company`, rest→domain) are byte-identical; the img sits inside the button (pointer-neutral — e2e leg presses the img itself and lands on `#view=domain&id=local`, plus bani→money).
- **Count row**: the trailing „N tipuri de informații ⤴" span moved inside the content block with the dashboard's `category-card-action` class — the old direct-child span would have sat flush on the edge once `.v2 .domain-card{padding:0}` (complete-data.css, applies unconditionally) governs the card. The dead inline `style={{color:d.accent}}`/`size={26}` on the icon were dropped: inside `.domain-card-content` CSS forces `color:#2463d3!important`, `28px!important` (complete-data.css:92,122) — the dashboard renders the bare `<Icon aria-hidden/>` for the same reason.
- **Found along the way (honest finding, pre-existing)**: the text-only explore cards were not just imageless — the same `padding:0` rule left their content flush against the card edge (probe BEFORE: computed padding `0px`). The `domain-card-content` wrapper (padding 22px) restores the dashboard card interior as part of this change.
- **Budget gate honesty**: `verify-media-budget.mjs:64` asserts the COVER RENDERING offers every illustration variant by reading `app/category-photo.tsx` — the new render site goes through that same component, so the gate stays honest by construction (and the srcSet it asserts is what the explore cards now ship). Probe `currentSrc` confirms the browser actually selects the 960 variants on explore (not the 1672px originals).
- **Bespoke captions (data, not a bug)**: `vreme` and `povesti` illustrations carry bespoke honest AI captions (not the standard „Ilustrație editorială generată cu AI pentru categoria X." sentence); the leg asserts verbatim manifest-caption equality + AI disclosure instead of the standard sentence.

**TDD evidence** — `e2e/explore-perspectives.spec.ts` (NEW, 3 legs):
- **RED**: ran on the pre-change tree — all 3 legs failed for the right cause (poll for complete `.category-cover` imgs: **0 of 16**; no img to tap; covers 0/16).
- **GREEN**: after the one-line wiring change — 3/3 pass.
- **REFACTOR**: none needed on production code (single declarative expression, mirrors the proven saved-view pattern); the spec itself was repaired mid-run twice (invented `.has()` matcher → `.toBe(true)`; h3 read after navigation → read before click; absolute-URL currentSrc → `new URL().pathname`) — each fix re-run to green.
- Legs: (1) per-card image audit — 16 cards × `img.category-cover`, all `complete && naturalWidth>0`, `currentSrc` resolves to a registered manifest file (root or 960 variant), srcSet offers the 960w variant, `sizes` exact shared value, alt = verbatim manifest caption + AI disclosure; (2) cover-tap pointer-neutrality + bani/firme special-case routes; (3) mobile 390 single-column order/structure (first „Orașul tău", last „Știri & actualitate").

**Verification (all run this session, after the final edits):**
- `corepack pnpm exec tsc --noEmit` → **exit 0, 0 errors**.
- `corepack pnpm lint` → **exit 0, 0 errors, 115 warnings** — identical count to the nav-audit close (my files add none).
- `corepack pnpm test:e2e` full suite → **142 passed, 0 failed** (wave's 139 + 3 new legs). One pre-existing flake noted honestly: `map-markers.spec.ts` Sinaia sub-pixel leg failed in an intermediate full run, then passed 14/14 in isolation AND in the final full run — untouched by my change (map surfaces not modified).
- `node scripts/verify-media-budget.mjs` → **exit 0** (render-wiring variant assertion green; ship census unchanged).
- Probes (`probe/explore-perspectives.mjs`, `probe/explore-perspectives-pixels.mjs`): BEFORE — 16 text-only cards (283×182 desktop / 358×166 mobile, padding 0px, zero imgs); AFTER — 16/16 covers present + complete, cards 283×405 / 358×410 (grew by the cover + content block), radius/shape tokens unchanged (`24px 24px 24px 10px`), cover-tap navigates to `domain`. Pixel evidence (I could not eyeball the PNGs in-session): all 16 covers pixel-std ≥ 41.35 (flat/missing = ~0) with navy-dominant RGB — real art rendering; screenshots tripled in size (desktop 317KB→1040KB, mobile 152KB→515KB). Screenshots: `probe/explore-perspectives-{before,after}-{desktop,mobile}.png`.

**Files touched (mine only):** `app/page.tsx` (the one „Mai multe perspective" render expression, line 143), `e2e/explore-perspectives.spec.ts` (NEW), `probe/explore-perspectives.mjs` + `probe/explore-perspectives-pixels.mjs` (session probes). No dashboard rendering, no map surfaces, no legal pages, no nav components, no CSS files were modified.

**Status: DONE** — the explore perspectives grid now renders the identical category illustration wiring the dashboard uses (shared component, same srcSet/sizes/alt class, gate-honest), click behavior byte-identical, all gates green (tsc 0 / lint 0 errors / 142 e2e passed / verify-media-budget exit 0), before/after + pixel evidence captured.

## Debugger Findings (iOS lag + localities)

Branch `fix/ios-lag-localities` (cut from `feat/map-compliance-flows` @ a087953). All measurements: Playwright mobile emulation 390×844 / isMobile / hasTouch / CPU 4× throttle (CDP `setCPUThrottlingRate`) against the dev server. Absolute numbers carry dev-mode React (jsxDEV) inflation — relative deltas are the honest signal; prod absolute latency can only be confirmed on a real iOS device (registered below).

### (C) „locația Cluj Iași etc nu există" — root cause CONFIRMED (compound, 3 defects)

Data was never missing: `public/places/cities.json` (OSM Geofabrik, 13,971 items: 102 city / 224 town / 13,081 village / 564 hamlet, county attribution via `withLocalCounty` + SIRUTA `locality-counties.json` 8,713 keys; the model-contract corpus is the 13,755 SIRUTA entries — `siruta-details-dropped=13755` in `verify-model-contracts.mjs`). The delivery was broken at `app/location.tsx`:

1. **County folded into searchable text**: the datalist label is `name · county`, and matching is substring-on-folded-label — so a query that is a COUNTY name (`cluj`, `iasi`, `constanta`, `brasov`…) matches every village in that county (~200–400 items each).
2. **Scan-order 30-cap**: `matches` takes the first 30 in corpus (alphabetical) order — for a county-name query the 30 slots fill with alphabetically-early villages; the city (which sorts after them AND has its own name as the county's) never enters the datalist. Node simulation + live DOM probe (before): `cluj` → 30× `X · Cluj` villages, no `Cluj-Napoca`; `iasi` → 30× `X · Iași` villages, no `Iași`; `timisoara` → 1 option `Timișoara · Timiș` (full-name only).
3. **Native datalist matching model mismatch**: mobile keyboards filter datalist options by raw, case-insensitive PREFIX on the option value — diacritic-SENSITIVE (`iasi` never prefix-matches `Iași`, `timisoara` never prefix-matches `Timișoara`) and prefix-position-only (`cluj` never prefix-matches `Agârbiciu · Cluj`). Our `normalizeSearch` folding existed only on OUR side of that contract. Net effect on the phone: type a colloquial county/city fragment → the chips offer nothing relevant → „nu există".

**Fix (root, `app/location.tsx`):** ranked suggestion engine replacing the first-30-substring cap — score per item: 0 exact (name or label), 1 name-prefix, 2 name word-start, 3 name-substring, 4 county-suffix-only; tie-break type-rank (city > town > village > hamlet) then `Intl.Collator('ro')`; bounded top-8 selection (single pass, no full sort). Visible `[role=listbox] [role=option]` combobox UI (aria-expanded/controls/activedescendant, arrow-key navigation, Enter = exact-match else active row, Escape closes list, tap applies immediately) — no longer delegating matching/fuzzy-ordering to the native widget; the `<datalist>` is kept and fed the SAME ranked top-8 (values start with the name, so native chips can also show them). The current locality is pinned first on an empty field („localitatea activă"). Corpus→index derivation cached per cities-array identity (module `WeakMap`) — the two simultaneously mounted pickers (preferences sheet + home PlacesWorkspace 'nearby') build it once, not twice (measured 780ms sheet-open longtask before = 2× index builds).

Verified (new spec `e2e/locality-picker-suggestions.spec.ts`): every top-10 city query resolves with the city FIRST — `cluj`→Cluj-Napoca, `iasi`→Iași, `timisoara`→Timișoara, + București, Constanța, Craiova, Brașov, Galați (both `galați`/`galati`), Ploiești, Oradea — with and without diacritics; datalist chips carry the same city; tap-to-apply flips the strip status + persists `mode:manual`; the pre-existing exact-label contract (`fill('Cluj-Napoca · Cluj')` + Apply/Enter, used by `locality-instant`, `map-markers`, `events-venues`, `tranzy-view` specs) preserved. `scripts/verify-location.mjs` (mock-React picker harness — found BROKEN at HEAD since the watch wave added the WatchButton import; README documents it §47/§443) repaired (WatchButton stub + `useDeferredValue` host) and green again on the rewritten picker.

### (B) „șterg tot, scriu altă localitate — durează foarte mult să apară… totul se mișcă cu lag" — root cause CONFIRMED (3 defects, 1 amplifier)

Live-probe evidence (4× throttle, before): keystroke ECHO is fast (5–6ms input→next frame) — but every keystroke synchronously recomputed the match scan AND swapped 30 `<datalist>` options, and Blink rebuilds datalist suggestion state per option mutation — longtasks of 479 / 871 / 364ms DURING typing (the typed letters appear, then everything freezes); the sheet-open cost 780ms (2 picker index builds + 13,971-entry setCities re-render); plus:

1. **Mid-typing draft wipe**: `useEffect(()=>setDraft(cityLabel),[geo.key,cityLabel])` — `geo.key` changes on every `watchPosition` tick position jitter (`.toFixed(3)` grid ≈ ~100m), so a device-mode user's typing field kept being reset to the resolved-locality label mid-keystroke. Fixed: the effect keys on `[cityLabel]` only — position ticks that don't change the resolved locality no longer touch the field (comment in code documents the rule).
2. **Per-tick whole-app re-render storm (amplifier)**: every accepted watchPosition fix → `setPosition` → new context value → every `useLocation` consumer re-renders (the entire home/dashboard tree) + `nearestLocality` scans 13,971 items — stationary GPS jitter made this continuous. Fixed at the source: the provider accepts a fix only when its 3-decimal cell changes (the app's own published context rounding), so stationary users get one re-render, not a storm.
3. **Suggestion cost on the urgent path**: scan + datalist + list re-renders ran synchronously in the keystroke's render. Fixed by reusing the app's own deferral pattern: `useDeferredValue(query)` — the input echoes in the urgent pass, suggestions (listbox + datalist, ≤8 rows) recompute in the interruptible deferred pass. The existing `SearchInput` debounce pattern (instant local draft + `startTransition` publish, `app/search-input.tsx`) is the same shape the picker now follows.

**RED leg passed**: `după primele trei litere, sugestiile sunt vizibile în maximum 200ms (4x CPU throttle)` — stamps the input event and the first frame in which `[data-query="tim"]` presents a Timișoara option; measured well under budget after the fix (spec run 2.7s end-to-end including typing).

Registered honestly: iOS `watchPosition` tick rate/jitter and the real-world storm suppression can only be confirmed on a physical device — the emulation serves a single static fix (my probe cannot tick).

### (A) bottom-nav „se mișcă foarte greu" — root cause CONFIRMED

The bar's active flip was already deferred-fast (the nav-fix wave's `useDeferredValue(route)` works — `route` drives the bar, `dRoute` drives `main`). What remained slow was **the deferred commit itself**: one giant task = old-view deletion effects (290ms) + new-view mount render (300ms+ jsxDEV) + per-mount geography work. Every view swap UNMOUNTS and REMOUNTS the heavy shared sections (`LiveCatalog`, `CategoryDirectory`, `FeedCards`, `WeatherStations`, `PlacesWorkspace`) — and each remount re-ran `useSource(..., cache:'no-store')` fetches (`/api/domain?kind=stiri` ×4, `/api/weather?kind=alerts` ×2, `/places/manifest.json` ×2/125KB, `/api/places` ×2 measured on a 4-tap tour) + a fresh `createGeographyIndex` trie (8,713 names per LiveCatalog mount; measured cheap in isolation — 7ms desktop — but pure duplicated work) + `classifyGeography` over the whole inventory, then a SECOND full re-render when each fetch landed.

Before (settled views, 4× throttle): **bar→view-swap dashboard +943…1270ms, home +1278ms** (747/716ms longtasks), map +302, compare +384, watch +243, saved +118.

**Fixes (minimal, at the causes):**
- `app/deferred-mount.tsx` (NEW): `DeferredMount` mounts children in the frame AFTER the view's first paint (rAF→setTimeout). The view swap commit is now small (shells + old-view deletion), the heavy sections mount in their own following frame — the reader sees the destination land immediately, content fills right after. Applied in `page.tsx` to home + dashboard heavy sections (`CategoryDirectory`, `LiveCatalog` inside the `#national-catalog` anchor section — anchor stays live so `openCatalog` scroll is unaffected, `FeedCards`, `WeatherStations`, `PlacesWorkspace`) and the map view's `div.map-workspace`.
- `app/use-source.ts`: session-level last-good SWR — remounts serve the previous valid response instantly (no busy flash, busy only when no copy exists), revalidate in the background; a byte-identical response skips `setResponse` entirely (no second re-render); `status:'unavailable'` responses are never cached; an error with a valid copy in hand keeps the copy visible (the app's „ultima copie validă" philosophy — same copy text rule as the seeds); visitor-triggered `visibilitychange` kept on `document` (fixed a would-be regression — first draft attached it to `window`, caught by the repaired mock harness before commit).
- `app/places-workspace.tsx`: the 125KB places manifest is loaded ONCE per session (module-level shared promise; each mount/revision still gets its own abort-guarded setState; failure clears the session so retry refetches). Every place's „Fișa completă" detail reuses it too.

After (same harness, 4× throttle): **dashboard +173…197ms, home +430ms paint-included** (tour legs 162/204/405/252/113/321ms), manifest re-fetch on re-entry 0 (was +1), `/api/domain` revalidate hits stay but no longer cause a visible re-render wave. The remaining ≥900ms longtasks now run one frame AFTER the swap paint, by design (content fill), not before it (blocked view). Registered: prod-build absolute numbers + on-device paint behavior need a real iPhone.

### Verification (gates)

- tsc: **0 errors**. ESLint: **0 errors / 115 warnings = baseline exactly** (no delta).
- `corepack pnpm test:e2e`: **149 passed / 0 failed** — baseline 142 + 7 new legs (`locality-picker-suggestions.spec.ts` ×4, `mobile-nav-swap-latency.spec.ts` ×3). Zero regressions; the pre-existing picker contracts (exact-label Apply, sheet Escape, watch button) all green.
- Script battery touched: `verify-location.mjs` (repaired, green), `verify-expanded.mjs`, `verify-css-keyframes.mjs`, `audit-controls.mjs`, `verify-sweep-inventory.mjs`, `verify-model-contracts.mjs` — all green.

### Honest registration — what only a real iOS device can confirm

1. iOS WebKit datalist chip presentation on the keyboard accessory bar (prefix filtering, diacritic sensitivity of the chips) — my fix removes the dependency (own listbox + ranked datalist), but chip behavior itself is device-only observable.
2. Real `watchPosition` tick cadence/jitter → actual re-render-storm suppression from the 3-decimal cell dedupe (emulation serves one static fix).
3. iOS Chrome paint/scroll peculiarities during view swaps (rubber-banding under the deferred mounts, sheet scroll containment with the new `max-height`-bounded suggestion list).
4. Production-build absolute latencies (dev-mode jsxDEV inflates render cost heavily; relative deltas hold).

**Files touched (mine only):** `app/location.tsx` (picker rewrite + provider cell-dedup), `app/use-source.ts` (SWR), `app/places-workspace.tsx` (manifest session cache), `app/deferred-mount.tsx` (NEW), `app/page.tsx` (DeferredMount wraps), `app/controls.css` (listbox + deferred-shell styles), `scripts/verify-location.mjs` (repair: WatchButton stub, useDeferredValue host), `e2e/locality-picker-suggestions.spec.ts` (NEW), `e2e/mobile-nav-swap-latency.spec.ts` (NEW), this STATUS.md section. A concurrent session's `pr49-digital-reporting-engine-pentaho-review-findings.md` working-tree change is NOT mine and is left out of this commit.

**Status: RESOLVED — root causes: (C) county-folded substring matching + scan-order 30-cap + native-datalist prefix/diacritic mismatch drowning county-seat cities under county villages (data was present all along); (B) per-keystroke synchronous datalist churn (871ms longtasks @4×) + geo.key-driven draft wipe + per-tick whole-app re-render storm; (A) full unmount/remount + `no-store` refetch + re-render wave of heavy shared sections inside one deferred commit (1278→431ms worst leg, content fill now one frame after paint). All gates green; 3 attempts never needed.**

---

## Debugger Findings (diacritice dosare)

**USER REPORT (verbatim):** „am probleme cu diacriticele românești. apar cu semnul întrebării... am văzut asta la dosare de justiție" — ș/ț → `?` pe suprafețele de dosare.

### Phase 1 — Root Cause Investigation (dovezi, nu ipoteze)

1. **Rândul cache REAL din `.wrangler/state` D1** (astăzi, adapter `portal.deep-records.v6`, buget `courts` used=1): `solutieSumar` conține LITERAL `?` (byte 0x3F) în pozițiile ș/ț — `Cur?ii de Apel Bucure?ti`, `Sec?ia I Penală`, `pronun?ată`, `solu?ia` — în timp ce diacriticele cu sedilă (ş/ţ U+015F/U+0163: `Sentinţa`, `autorităţile`, `Poliţiei`) și ă/â/î (`Penală`, `măsura`, `comunică`) sunt **intacte**, și **zero U+FFFD** în tot rândul.
2. **XLSX-urile MJ brute** (capturi reale din sesiune, citite direct cu python `zipfile` — ocolind 100% codul nostru): `notari.xlsx` → `DRAGOMIRE?TI`, `PIATRA NEAM?`, `TÂRGOVI?TE`, `CONSTAN?A`; `experti-judiciari.xlsx` → `DOROBAN?ILOR`, `Grivi?ei`, `coresponden?ă`, `Timi?ul` (59 șiruri). Aceeași semnătură exclusivă: doar pozițiile ș/ț → `?`.
3. **Contraproba altei instituții**: `experti-tehnici.xlsx` (MDPLPA) exportă formele corecte cu virgulă (U+0219/U+021B) — deci nu e o problemă XLSX/Unicode generică, ci pipeline-ul editorial al Ministerului Justiției.
4. **Lanțul nostru, pas cu pas** (`adapters.ts:10` TextDecoder implicit UTF-8 streaming cu `{stream:true}`+flush final → `parseCourtSearch` → D1 JSON → `route.ts` → UI/exporturi): pur string-ops fără nia transcodare lossy; `document-pdf` substituie onest `[U+…]` (niciodată `?`).

### Phase 3 — Reproducere offline + testarea ipotezelor (4 fază, RED-first)

Probe byte-identic (envelopă SOAP UTF-8, headere ASMX reale, **chunk-uri de 1/3/7/13 bytes care taie secvențele multibyte la mijloc**) prin lanțul REAL `getSource → parseCourtSearch → loadCourtSearch`:

- **H1 „decode-ul nostru strică ș/Ț" — RESPINSĂ**: ambele familii de glife (virgulă U+0218–021B ȘI sedilă U+015E/U+0163) + ă/â/î supraviețuiesc byte-cu-byte inclusiv la limite de chunk; decoderul nu fabrică niciodată U+FFFD.
- **H2 „scrierea D1/JSON strică" — RESPINSĂ**: round-trip JSON exact.
- **H3 „«?» vine din datele publicate de MJ" — CONFIRMATĂ**: lanțul păstrează verbatim `Bucure?ti`/`Sec?ia` (nu poate produce `?` — un TextDecoder UTF-8 produce U+FFFD pe bytes invalizi, niciodată `?`; `?` în output înseamnă byte 0x3F pe wire).

### Root cause

**Textul oficial al MJ vine deja corupt de la sursă**: acolo unde sistemele lor au stocat formele corecte cu virgulă-desubt, pipeline-ul lor de publicare a transcodat printr-un charset legacy fără acele glife (sedila ş/ţ și ă/â/î există în el, ș/ț cu virgulă nu) și a substituit fiecare caracter nereprezentabil cu `?` **înainte să plece_bytes de pe serverul lor**. Provocarea utilizatorului este acea pierdere pre-existentă, afișată onest dar nedivulgate. Ipotezele anticipare ale task-ului (charset în TextDecoder / decodare după header / encoding la scrierea în DB) sunt **toate exonerate de dovezi byte-level** — nu există nimic lossy de reparat în lanțul nostru, iar „repararea" glifelor ar însemna inventare de conținut oficial (respins de principiile repo-ului).

### Fix aplicat (minimal, onest, fără glife inventate)

- `lib/court-history.ts` — `upstreamDiacriticLoss()` (detectorul semnăturii `literă?literă` — intra-cuvânt, deci zero fals-pozitiv pe întrebări legitime cum ar fi „afli?") + `DIACRITIC_LOSS_NOTE` (propoziția de divulgare, vocea repo-ului).
- `lib/live/legal.ts` `parseCourtSearch` — când semnătura apare în fișe, `note` sursei primește divulgarea (ajunge în UI prin calea existentă `source.data.note` din `courts-workspace.tsx:43`, fără cod UI nou de randare).
- `app/courts-workspace.tsx` — exporturile PDF „Fișa publică" și „Soluția pe scurt" primesc aceeași divulgare condiționată în textul exportat.
- `README.md` — paragraful dosarelor documentează cele două familii de glife, fidelitatea byte-cu-byte a lanțului, pierderea upstream la MJ (inclusiv contraproba MDPLPA) și comportamentul de divulgare.
- Randarea rămâne **verbatim** (ce face și reader-ul de acte normative: `legal-reader.ts:83` normalizează sedilă→virgulă doar pentru cheile de potrivire, niciodată la afișare) — decizia „follow what the app does elsewhere" s-a rezolvat la: afișare verbatim + potrivire pe ambele forme (pattern-ul `Sentin[tţţ]a` deja exista).

### RED → GREEN

- **RED**: `scripts/verify-court-links.mjs` — picior nou: round-trip byte-exact al ambelor familii de glife prin `parseCourtSearch` (parse + JSON), decode streaming pe chunks de 5 bytes prin `loadCourtSearch` real, păstrarea verbatim a `?` sursă, detectarea semnăturii (`Sec?ia` da / „afli?" nu), divulgarea în `note` pentru fișa coruptă + absența ei pentru fișa curată. Înainte de fix: `TypeError: history.upstreamDiacriticLoss is not a function` (piciorul a eșuat primul la funcția inexistentă — eșec așteptat).
- **GREEN după fix** — piciorul trece; restul piciorului (fidelitatea round-trip) a trecut și la prima rulare ca armură de regresie — documentat onest: partea aceea **nu era ruptă**; o fix a forțat-o ar fi fost o remediere inventată.

### Verification (gates)

- tsc: **0 erori**. ESLint: **0 erori / 115 warninguri = plafon exact** (zero delta; warning-urile din fișierele mele sunt pre-existente: linia de effect din `courts-workspace.tsx` deplasă cu 2 de import, idiomul `module` din harness).
- Bateria verify-legal-* ×2 + harness-urile atinse/adiacente: `verify-legal-records`, `verify-legal-refresh`, `verify-court-links`, `verify-live` ×2 fiecare = PASS; `verify-geographic-scope`, `verify-federated-search`, `verify-source-errors`, `verify-export-formats`, `verify-watch-api`, `verify-watch-sweep`, `verify-refresh-sweep` = PASS.
- **Pre-existente, NU ale mele** (documentate, nelăsate să pară ca regresii ale mele): `verify-legal-pdf` = `ModuleNotFoundError: No module named 'pypdf'` (mediu — python3 de sistem nu are pypdf; harness-ul nu încarcă niciun fișier atins de mine); `verify-law-navigation` = `Cannot find module './watch-button'` (break cunoscut din val-ul watch, documentat la §47/existing); `verify-model-contracts` = 2 violări places-attraction (muncă in-flight a agentului paralel — `import-places.py` modificat chiar acum în worktree).
- `corepack pnpm test:e2e` full: **146/151 passed**. Cele 5 eșecuri: 2 = spec-uri NOI in-flight ale agentului paralel (`places-attractions-validity.spec.ts`, corelate cu violările model-contracts de mai sus) + 3 flakes **rotative** dovedite (federated-search :251/:292 apoi :334, place-image-stability — toate trec la a doua/a treia rulare în izolare; rotesc între rulări = fereastră HMR pe dev-server partajat în timp ce agenții paraleli editează `location.tsx`/CSS-uri; zero suprapunere cu diff-ul meu). Suprafața juridică: `legal-flow` + `legal-pages` + `justice-registries` = **16/16 la fiecare rulare**. Condiția task-ului pentru e2e („if a dosar leg asserts text content") nu e îndeplinită — singurul picior de dosare din e2e asertează doar existența tab-ului; un picior nou care ar depinde de date live de la MJ ar fi flaky prin construcție, iar contractul e dovedit offline în harness.
- Registrele profesionale (`justice:experti-judiciari`, seed `server-seed.json`: `Bucure?ti` ×2, `Crânga?i`) au ACEEAȘI corupere upstream dovedită — suprafața registrelor e în afara fișierelor mele (deținute de agentul paralel); **ridicat aici** pentru ca divulgarea să fie oglindită și acolo de cine o are în scope.

### Conventions Applied

**Source:** `.specify/memory/conventions.md` — **inexistent** într-acest repo (verificat înainte de orice cod); am urmat convențiile repo-ului observate: mesaje/voice în română onestă, `field-help`/`source-warning` ca canale de divulgare, fără comentarii în cod în afara regulii de business (detectorul are exact comentariul regulii: pierdere upstream MJ, redare verbatim), fără ID-uri de ticket-uri în cod, comentarii doar unde codul singur nu spune de ce.

**Files touched (ale mele):** `lib/court-history.ts` (detector + notă), `lib/live/legal.ts` (divulgare în `note` la `parseCourtSearch`), `app/courts-workspace.tsx` (divulgare în exporturile PDF ale fișei/soluției), `scripts/verify-court-links.mjs` (picior RED→GREEN diacritice + decode streaming), `README.md` (paragraf dosare), această secțiune STATUS.md.

**Status: RESOLVED — root cause: pierderea ș/ț există ÎN datele publicate de Ministerul Justiției (byte 0x3F la pozițiile formelor cu virgulă, înainte de publicare — dovedit byte-level pe rândul cache real + XLSX-urile brute MJ; lanțul nostru dovedit lossless pe chunk-uri de rețea și JSON round-trip), iar remedierea corectă în granita noastră este redarea verbatim + divulgarea sursei pierderii (note + exporturi + README), nu inventarea glifelor. Activat RED-first în verify-court-links (piciorul eșua la helperul inexistent, verde după fix).**

## UI/UX Findings (padding + shadows)

Branch `fix/perfect-pass-v1` (in-place, same worktree). User reports, verbatim: „astea nu au padding în interior. se vad urât" + „ai foarte multe elemente, carduri ce nu au padding interior și se vede urât" and „cred că mergea să pui și niște umbre". Design-system pass over the app's own CSS card system (app/*.css token + card classes) — Maintain mode (no `.bluestone/config.md`): the pass generalizes the elevation vocabulary the app already ships; it invents no new look.

### Token definitions (modern.css `.v2` block, beside the existing `--af-*` family)

- `--af-card-shadow: 0 4px 16px #15324704` — resting card elevation. Byte-identical to the literal the vpanel/place-card/domain-card/news-card/live-resource/vstat family has shipped since modern.css existed; now written once.
- `--af-card-shadow-raised: 0 12px 28px #1532470e` — interactive/hover tier. The exact place-card hover literal, generalized.
- `--af-card-pad: 22px` — the systemic card interior. Consumed by `.v2 .domain-card>.domain-card-content` (complete-data.css) — the same wrapper rule family the previous wave introduced; the config contract (card-class `padding:0` + wrapper carries padding, full-bleed covers intact) is untouched.
- Both tiers are soft y-offset, low-alpha navy (#153247 base) — the flat-navy aesthetic's own shadow language, not a new heavy drop-shadow. Reduced-motion irrelevant to static shadows (verified: the no-motion/reduced-motion global rules already zero transitions; shadows are static).

### Audit method (probe/uiux/card-audit.mjs, both viewports 390+1280, 14 hash-routes)

For every card-class element: computed padding, computed shadow, and a **clip-aware visible text inset** — min distance from the card border to text rects intersected with every overflow/scroll ancestor (scrolled-out table halves measure from the clip edge; fully clipped rects drop). Two measurement pitfalls found and fixed in the probe, both registered as false-positive families, NOT bugs:
1. overflow rects inside `.table-scroll` (mini-trend/company data tables) — clipped by `overflow:auto`, invisible;
2. **closed `<details class="chart-table">`** — Chrome lays out slot content with non-zero rects while unpainting it (content-visibility); the probe now skips closed-details subtrees + `checkVisibility()`.
The earlier raw pass reported `.vpanel` at "3px flush" from both — false; vpanel insets are 29px when measured visible-only.

### Audit table (before → after, class-surfaces 84; raw flags 34 → 24, of which TRUE card defects 17 → 0)

| Card class | Surfaces (views) | Inner pad before | Text inset before | Shadow before | Text inset after | Shadow after | Verdict |
|---|---|---|---|---|---|---|---|
| `.snapshot-note` | home, explore, dashboard (+ every sourceNotice surface) | 18/0 (d), 15/0/18 (m) | **1px** | none (inner note) | **15px** both | none (by design) | FIXED — the systemic offender |
| `.map-result` | map sidebar | 9/7 mobile | 11px inline | none (flat row) | 13px inline (pad 9/10) | none (flat row) | FIXED inline; see registration |
| `.city-story` | home | 32 | 32 | **none** | 32 | **token resting** + raised on hover | ELEVATED (interactive `<button>`) |
| `.insight-story` | home analytics | 29/26 | 27 | **none** | 27 | **token resting** | ELEVATED |
| `.recommendation-card` | home analytics | 29/26 | 27 | **none** | 27 | **token resting** | ELEVATED |
| `.visit-card` | place reader | 31 | 32 | **none** | 32 | **token resting** | ELEVATED |
| `.vcallout` | saved, planner | 24 | 29 | **none** | 29 | **token resting** | ELEVATED |
| `.vpanel` (and the modern.css:8 family) | all | 28/22-18 | 29 | literal 0 4px 16px #15324704 | 29 | `var(--af-card-shadow)` — computed identical | TOKENIZED, zero visual delta |
| `.place-card` hover | explore, home, saved, place | — | — | literal 0 12px 28px #1532470e | — | `var(--af-card-shadow-raised)` | TOKENIZED, zero visual delta |
| `.domain-card` + wrapper | dashboard, explore, saved | card 0 / wrapper 22 | 22 | resting + hover | 22 | unchanged | ALREADY HEALTHY (previous wave's wrapper fix present at all 4 render sites; only the wrapper's literal is now the token) |
| `transit/cinema/story`-cards | domain workspaces | via `entity-card`/`news-card` bases | 21–23 | elevated | unchanged | unchanged | ALREADY HEALTHY (compose over padded/elevated bases) |

Intentionally NOT elevated (rationale): `.live-freshness`, `.reader-note`, `.snapshot-note` are inner notes tinted lighter than their host cards — floating an inner layer above its parent card would invert the depth hierarchy; they get the padding fix only. `.map-result` rows and `.domain-rail` rows are list rows, not cards. Legacy globals.css classes (`.quick-card`, `.station-card`, `.weather-card`, `.currency-card`, `.dataset-card`) are unused by the v2 app — untouched dead template CSS.

### Fix implementation (CSS only — no component/class wiring changes needed; all render sites already route through the fixed base classes)

1. `app/modern.css` token block: +`--af-card-shadow`, `--af-card-shadow-raised`, `--af-card-pad`.
2. `app/modern.css` card-skin line: resting + hover literals → tokens; `.v2 .snapshot-note` skin gains `padding:12px 16px` (the exact shape of its sibling note `.live-freshness`).
3. `app/modern.css` new rule: resting token on `.city-story,.insight-story,.recommendation-card,.visit-card,.vcallout`; `city-story:hover` raised tier (its box-shadow transition already exists via the v2.css global button transition).
4. `app/modern.css` 640px media: `.v2 .snapshot-note{padding:14px}` (matches live-freshness mobile), `.v2 .map-result{padding:9px 10px}`.
5. `app/complete-data.css`: `.domain-card-content` `22px` → `var(--af-card-pad)`.

### Verification (all run this session, after the final edits)

- `corepack pnpm exec tsc --noEmit` → **0 errors**.
- `corepack pnpm lint` → **0 errors / 115 warnings = baseline exactly**.
- `node scripts/verify-css-keyframes.mjs` → **exit 0** (22 animation references, no animation touched).
- `node scripts/verify-ro-text.mjs` → **exit 0**.
- `corepack pnpm test:e2e` full suite → **151 passed, 0 failed** (baseline 149 + the 2 legs that rotated as flakes in intermediate runs). Honest instability narrative: run 1/149+2 (federated-search diacritics + picker 4x-CPU latency — both passed 19/19 isolated); run 2/149+2 (map-touch-gestures finger-pan + map-markers Sinaia sub-pixel — the pre-existing flake pair the iOS-lag wave registered; both passed 20/20 isolated; map surfaces are the parallel wave's partition, untouched by this pass); run 3/151 green. No e2e leg asserted the old paddings/shadows (audited: only count/hasText assertions touch `.map-result`), so no RED-first spec updates were owed. Two app-side dev-server deaths mid-session (workerd internal fetch + a foreign leftover server PID squatting :5173) were server-runtime/port-contention events, not CSS; all runs above are from clean playwright-managed servers, and nothing of this session is left running.
- **Pixel evidence (I could not eyeball PNGs in-session — registered honestly)**: probe/uiux/pad-shadow-pixels.mjs measures the 6px ring outside each card edge: every elevated family darkens −0.10…−0.46 mean gray after vs before (the resting token rendering; sub-perceptual per-pixel, below the 6-gray change threshold — subtle by design, exactly the mission's "tasteful, not heavy"); `map-result` desktop is a 0/0 control pair; mobile map-result shows the 9% content shift from the inline padding bump; snapshot-note pairs reflowed (sizes differ — computed styles assert 12/16 + 14). Screenshots: `probe/uiux/pad-shadow-*-{before,after}-{desktop,mobile}.png` (28 files; BEFORE state reconstructed in-browser by re-injecting the exact replaced literals — no git stash on a shared worktree).
- Accessibility preserved: no text touches a bordered edge (all true card insets ≥13); contrast untouched (no color changes anywhere); focus-visible outlines untouched; tokens inherit the existing motion rules.

### Probe artifacts (probe/uiux/)

`card-audit.mjs` (+`card-audit-before/after.json`), `card-discovery.mjs` (computed-style card enumeration, 792 card-like roots), `flush-detail.mjs`, `vpanel-offender/all/rect-side/chart-box/visibility/children/crop` (the false-positive investigation chain), `mapresult-box.mjs`, `mapresult-worst.mjs` (the 1px-as-line-box-top finding), `computed-after.mjs`, `offender-shots.mjs`, `pad-shadow-pixels.mjs`.

### Playwright test coverage review

| Surface | Playwright tests | Intersects this pass? |
|---|---|---|
| All card surfaces (home/explore/dashboard/saved/place/map/watch/money/company) | Existing suites cover flows; no visual-pixel assertions exist on card chrome | No leg asserted old padding/shadow values — verified by grep before editing |
| Card padding/elevation invariants | None exist (none existed before either — the app's e2e contract is behavior, not chrome) | Raised for @validator: optional follow-up leg asserting `.snapshot-note` computed `padding-left/right ≥ 14px` + the five families' non-none `box-shadow` on home/saved/place, if chrome assertions are wanted at all |

**Files touched (mine only):** `app/modern.css` (tokens + 4 rule edits), `app/complete-data.css` (1 literal → token), `probe/uiux/*` (audit/evidence scripts + PNGs/JSONs), this STATUS.md section. No components, no lib/, no api routes, no preferences/attractions/dosar surfaces, no layout/typography changes.

**Status: PASSED — padding: 17/17 true card defects cleared (7 flush: snapshot-note systemic 1px→15px on 3 views × 2 viewports + map-result mobile inline 7→10px; 10 elevation: 5 shadow-less card families × 2 viewports elevated via the new 2-tier `--af-card-*` tokens), existing literals tokenized with zero visual delta; the 24 residual raw flags are by-design registrations (12 live-freshness + 6 snapshot-note + 2 reader-note inner notes stay flat by depth-hierarchy, 1 flat map-result desktop control row, 2 non-card watch-feed-section section wrappers, 1 map-result mobile line-box-top semantics row — borderless, no visible boundary); gates: tsc 0, lint 0/115=baseline, css-keyframes 0, ro-text 0, e2e 151/0.**

## Builder Findings (position text + attractions)

Task 1 = the long position-privacy paragraph removed from the location surface (the detail stays on /confidentialitate; home footer already links it everywhere, so the preferred "nothing" option applies). Task 2 = „locuri de vizitat” ships only valid articles: an attractions name-validity gate at the corpus build + a local recovery of the shipped corpus. Scope kept: the dosar/diacritics and global-CSS files showing as modified in the tree belong to the parallel sessions (untouched by me); the push watch-tooltip notice (button-driven dialog) stays by design.

### Task 1 — TDD (paragraph gone)

- RED: rewrote the `e2e/legal-pages.spec.ts:125` leg (the one that pinned the one-liner) into „the location strip keeps its status line and carries no long compliance paragraph" — failed against the current tree on the exact still-rendered paragraph quotes.
- GREEN: `app/location.tsx` — the entire `<p className="field-help">Poziția se folosește doar pentru datele locale…Confidentialitate…</p>` deleted from `LocationControl` (its only mount: the non-compact home location strip; the preferences sheet and places-workspace render the compact variant, which never carried it). The status line + text-link buttons stay; `/confidentialitate` + registru keep every number (untouched, watch-sweep Leg 12 keeps locking them).
- No replacement link added: the home footer already carries `Confidentialitate` and the leg asserts it in the same context.

### Task 2 — root cause + gate classes (measured, not guessed)

Root cause: `scripts/import-places.py` took `name:ro`/`name`/`brand`/`operator` with **no validity gate**, and fell back to the subcategory label for unnamed objects — so English OSM name dumps („3rd enclosure" = a Sibiu city-wall segment mapped `historic=citywalls` + `tourism=attraction`, `name="3rd enclosure"`) and 96 unnamed attractions named „Locuri de vizitat" shipped as articles.

Gate (attractions label only — every other subcategory keeps its status quo) rejects **116 records / 16 unique names**, built from the actual corpus audit:

| Class | Names | Records |
|---|---|---|
| Unnamed, name = the attraction label itself (pipeline fallback) | `Locuri de vizitat` | 96 |
| English leading-ordinal descriptor | `3rd enclosure` | 3 |
| OSM `fixme` artifact | `Sfinxul Buștea (fixme)` | 1 |
| Name echoes a structural tag value | `windmill` (= `man_made=windmill`) | 4 |
| Pure-English common-word phrase | `Fresh-meat`, `Gravity Hill`, `Of of`, `Red Pole`, `barn with wagons`, `floating mill` | 6 |
| Audited singletons (no safe generic rule) | `NICOSMAIL`, `Ot11378 campu mare`, `Traseu Manastirea Magarul, la dreapta dupa canton`, `former mine-Valea Blaznei`, `partie schi - ski slope` | 5 |
| Unnamed entry whose fallback name is a *different* label (found by the build gate; a shipped-name audit cannot see it) | `Centre culturale` | 1 |

**Keep-list sanity (all present post-gate, pinned in tests):** Salina Turda, Castelul Bran, Castelul Pelișor, Cetatea Râșnov, Salina Cacica (+ Babele, Sfinxul, Mănăstirea Sinaia, Castelul Corvinilor verified in the audit). Deliberately **kept**: `castel Dracula Transfagarasan` (real commercial castle — website/hours/image), `Brașov/Rasnov/Tulcea/#loveREGHIN Sign` (real sign installations), `Amphitheatre`/`Amphiteater of Micia` (real identified ruins), `Fontaine` (named fountain), locality-suffixed `Gravity Hill *` variants, Hungarian/Ukrainian-Cyrillic minority toponyms. 112 records dropped entirely (attraction was their only type); 4 records keep shipping in their other categories with the attractions label stripped and the name re-derived exactly as a fresh import would.

### Task 2 — TDD (RED → GREEN → REFACTOR)

- RED (battery): `scripts/verify-model-contracts.mjs` LEG 1 gained the mirrored gate (`places-attraction-name`), the post-gate count pin (`places-attraction-count`) and the famous keep-list (`places-attraction-keep`). Run against the pre-change corpus: **[places-attraction-name] n=115 + [places-attraction-count] 1649≠1534 — exit 1** (the battery mirror sees shipped names, so it reports 115; the build gate's 116th case is the unnamed `Centre culturale` fallback, correctly caught at name-source level by the Python gate).
- RED (e2e): `e2e/places-attractions-validity.spec.ts` (NEW, 2 legs) — fixture leg walks every served attractions page and asserts zero junk names/patterns + total 1533 + famous present; live-render leg searches „Salina Turda" (card renders) and „enclosure"/„3rd enclosure" (zero served + `.live-empty`). Both failed on the pre-change corpus (total 1649; the enclosure query served the 3 „3rd enclosure" rows).
- GREEN: gate implemented in `scripts/import-places.py` (`ATTRACTION_LABEL`, `valid_public_attraction_name`, `apply_attraction_gate` + build-report counters; `import osmium` moved into `main()` so the gate stays importable without pyosmium); corpus recovered locally through the pipeline: `finalize-places.py` gained the PBF-less recovery path (`--cities` + `--as-of`, osmium import scoped to the `--pbf` branch), and **`scripts/recover-places-attractions.py`** (NEW) re-assembles `public/places` from the shipped record chunks (full original tags preserved — no fetch), importing the gate from `import-places.py` so build and recovery can never diverge, then runs finalize + `compress-snapshots.py` (deterministic gzip layer, ×2 byte-identical). Cities/LICENSE/exploration assets carried byte-for-byte; every manifest sha256 proof regenerated by finalize itself.
- **Exploration realignment (real break caught by the battery, not by luck): the rebuild re-shards records (600/shard), so 30 of the 267 exploration `recordChunk` pins went stale — a runtime break of each gallery place's „Fișa completă" sheet. The recovery now realigns every anchor (loud failure if a record vanished; none did — dropped ∩ anchored = ∅, stripped ∩ anchored = ∅, relatedSources refs to dropped ids = 0) and re-aligns `exploration-import.json`'s `afterCoverage` to the shipped corpus (cultura rows 8655→8540, hotlink 181→179 — two junk records carried image tags; attested unchanged at 184) with an explicit `corpusGateRealignment` provenance entry; the `before*` tables stay the pure import-time snapshot.
- REFACTOR: recovery idempotence proven — a re-run on the already-gated corpus reports `attractions-rejected 0` and byte-stable output; metadata temp-file now `finally`-unlinked.

### Files modified (mine only)

- `app/location.tsx` — the long privacy paragraph deleted (Task 1).
- `e2e/legal-pages.spec.ts` — position-notice leg flipped to assert absence (RED-first).
- `e2e/places-attractions-validity.spec.ts` (NEW) — 2 legs (fixture + live render).
- `scripts/import-places.py` — attractions validity gate + docs + lazy osmium import + gate report in the build log.
- `scripts/finalize-places.py` — `--cities`/`--as-of` recovery path (same assembler, single source of truth).
- `scripts/recover-places-attractions.py` (NEW) — corpus recovery driver + exploration anchor/coverage realignment, idempotent.
- `scripts/verify-model-contracts.mjs` — LEG 1 attractions gate mirror + count pin + keep-list + summary line.
- `scripts/verify-sweep-inventory.mjs`, `scripts/verify-expanded.mjs`, `scripts/verify-snapshot-transport.mjs` — count pins 181649→181537 (+ sweep-inventory log text).
- `app/page.tsx` — about-view copy „181.649"→„181.537 de locuri".
- `README.md` — corpus truth: **181.537 locuri din 183.310 elemente OpenStreetMap**, contacts 44.106/16.219/7.277/16.594/20.922, + the gate sentence in the `public/places` paragraph.
- `public/places/**` + `public/data/snapshot-transport.json` — regenerated corpus (manifest proofs, indices, records re-sharded, exploration realigned, gzip registry).

### Count deltas (honest)

- corpus records: 181.649 → **181.537** (−112; sourceFeatures 183.422 → 183.310, exactly the dropped records' own contribution)
- cultura category: 8.655 → **8.540**; attractions label: 1.649 → **1.533**; every other category unchanged
- contacts: address −16, phone −2, website −4, program −3, e-mail unchanged; cities 13.971 unchanged
- e2e baseline 149 → **151 passed** (the two new attractions legs); 0 failed on the final full run

### Gates (run on the final tree)

- `corepack pnpm exec tsc --noEmit` → **exit 0**.
- `corepack pnpm lint` → **0 errors, 115 warnings** (baseline exactly; my files add none).
- `node scripts/verify-model-contracts.mjs` → **×2 exit 0** (attractions 1533 post-gate, 858 sha256 proofs, index↔runtime parity on 735.552 entries; re-confirmed once more after the final state).
- `node scripts/verify-sweep-inventory.mjs` → exit 0 („181.537 de locuri"); `verify-expanded` → exit 0 (181.537 records / 183.310 features / 554 shards); `verify-snapshot-transport` → exit 0 (6.673 snapshots, all proofs); `verify-geographic-scope` → exit 0; `verify-location` → exit 0; `verify-ro-text` → exit 0; `verify-exploration-media` → exit 0 (267 anchors against exact records); `verify-media-budget` → exit 0 (afterCoverage == shipped); `verify-federated-search` → exit 0; `audit-controls` → exit 0.
- `corepack pnpm test:e2e` full → **151 passed, 0 failed**, exit 0. Intermediate runs documented honestly: one 4×-throttle latency leg (mobile-nav-swap) flaked under full-suite load, passed in isolation; one mid-run collapse (142) was the reused dev server dying mid-suite — the final run on a fresh auto-started server is the green of record.
- Recovery idempotence: re-run against the recovered corpus → `attractions-rejected 0`, byte-stable output; stray metadata temp files (found twice: one shipped into public/places pre-fix, two left at public/ root) eliminated + `finally`-unlinked and the shipped corpus re-checked.

### Four-lens self-review

- **Completeness**: both user reports resolved at the source (paragraph deleted from the only surface that renders it; junk classes rejected at the corpus build **and** the shipped corpus recovered). No stubs; the recovery is a full pipeline path, not a data patch.
- **Quality**: the gate mirrors the repo's established Python↔JS mirror pattern (like `norm()` ↔ `normalizeSearch`), with the battery as the parity guard; blocklist built from measured junk, keep-list pinned in two test layers; over-filter consciously avoided (documented keeps).
- **Discipline**: gate scoped to the attractions label only (the 23k unnamed Parcări etc. remain the other surfaces' status quo — raised here, not silently changed); no map/transport/places-UI files touched beyond the paragraph; no scope creep into the dosar/CSS partitions.
- **Testing**: every behavior has a RED-first failing leg (e2e ×3, battery ×2 buckets); famous-target survival asserted twice; the full suite green on the final tree.

**Reservations (small, stated):** (1) Borderline English-ish names with identifying value (`Golful Francezului nude beach`, `Amphitheatre`, locality-suffixed `Gravity Hill *`) stay by design — rejecting them needs a judgment call the audit did not support; re-runnable gate means tightening later is one dictionary edit + one recovery run. (2) The gate applies to the attractions label; junk-class names on *other* labels (e.g. `Fresh` in Magazine și servicii) ship as before — out of the reported scope. (3) The attractions count 1533 is pinned in three places (e2e, battery, this report) — a future corpus refresh must move them together (that coupling is the repo's existing pin style).

**Status: DONE** — paragraph gone (RED-first leg pins the absence + the footer link), attractions gate at the corpus build + local recovery of the shipped corpus (116 rejects, 16 junk names, 112 drops + 4 strips; famous keep-list intact; deltas reported), all gates green: tsc 0 / lint 0 errors·115 warnings / verify-model-contracts ×2 exit 0 / sweep-inventory + expanded + snapshot-transport + geographic-scope + location + ro-text + exploration-media + media-budget exit 0 / full e2e **151 passed**.

## Builder Findings (nearby map radius + pan)

User reports (verbatim): (1) „pe hartă când trebuie să vizualizez toate elementele pinate din preajma mea, nu ține cont de ce rază și arată doar până în 5 km ceva de genul"; (2) „când fac pan și mă duc în altă zonă nu am refresh în zona asta". Scope: the nearby-pins places map (`PublicMap` inside `PlacesWorkspace` map view) — the leaflet surface, not the home SVG repere map.

### Root cause (measured, not guessed)

The nearby map's data request was the **nearest-200 slice** — `view=map` sent `pageSize=200` with distance sort, so once the radius selected more than 200 records the rendered pin set was **identical for every radius** (always the nearest 200) and the radius selector changed only the count label. The visual cap = the distance of the 200th-nearest record, which depends purely on POI density (offline corpus probe mirroring `queryPlaces`' nearby path, spatial cells + haversine, on the shipped post-gate corpus):

| center / category | records within 5 km | 15 km | 50 km | 100 km | **200th-nearest pin at** |
|---|---|---|---|---|---|
| Cluj / cultura | 119 | 175 | 361 | 1448 | **23.7 km** |
| București / firma | 4957 | 9257 | 10418 | 14544 | **0.46 km** |
| București / cultura | 362 | 478 | 536 | 861 | **2.02 km** |
| București / local-all | 12783 | 26085 | 29862 | 41622 | **0.31 km** |

So on dense surfaces every pin sat within a few hundred meters–2 km regardless of the chosen radius — exactly „arată doar până în 5 km ceva de genul". Wiring was NOT the cause: the old request did carry the selected `radius`; the response just silently capped the pin set at the 200 page boundary (`distanceOrder.slice(page*size,(page+1)*size)` in `lib/places-query.ts`). Pan never refetched because the query URL was keyed to `geo.center` only — the leaflet viewport was invisible to the data layer.

### Fix

- `lib/places-query.ts` — `PlacesQuery.view:'cards'|'map'` + the pins branch: `view:'map'` collects every filter-passing in-radius row in the existing scan (slim pin rows `{id,name,lat,lon,address,distance,updatedAt}` — no second re-read pass) and returns `{items,total:items.length,page:0,pages:1}` — the whole radius set, no page-size ceiling.
- `app/api/places/route.ts` — `view` validated at the boundary: `view=map` is rejected (400, the app's honest message) unless `scope=nearby` with finite center, and **rejects `pageSize`/`page` alongside `view=map`** (a paging cap on the pin request would silently cap the radius again); `view` must be `cards|map`.
- `app/places-workspace.tsx` — in map+nearby view the request is the pins set keyed to the **map's own center** (`mapCenter??center`, `useLocationState` so a locality switch reseeds it); count header honest „N rezultate în raza de X km"; field-help states the map-center semantics + the pan refresh; the card grid + pagination are hidden in that view (the map is the presentation — „Fișe" restores the unchanged 18-per-page cards); the national (scope=all) map view keeps its existing bounded sample + cards, unchanged.
- `app/public-map.tsx` — `onViewportSettle` optional callback: leaflet `moveend`+`zoomend` through one **400 ms debounce** notifying `getCenter()`; programmatic moves (initial `setView`, per-`viewKey` `fitBounds`, `invalidateSize`) complete synchronously and are swallowed by a microtask `quiet` guard so a refit after a radius change can never trigger a surprise refetch; `data-pins` (finite-coordinate count) on the map element for honest render telemetry.

Pan mechanics end-to-end: settled gesture → debounced notify → `setMapCenterFromMap` (rounded to the app's 3-decimal geographic grid, deduped — a zoom that keeps the center is a no-op) → pins URL changes → `useSource` aborts the in-flight request (url-change cleanup — the cancel requirement) and fetches the new center; byte-identical responses hit the ios-lag wave's session SWR (no second render), a different center is a different URL = fresh fetch, exactly as that wave designed.

### TDD evidence — RED → GREEN → REFACTOR (all four units watched failing first)

- **e2e leg (a)** (rewritten `e2e/places-workspace.spec.ts` "the map view serves every in-radius pin…"): RED — `waitForResponse` for a `view=map` request timed out at 60 s (the wiring did not exist; old code sent `pageSize=200`). GREEN — request carries `scope=nearby&radius=100&view=map` + `lat/lon`, **no `pageSize`, no `page`**; response `items.length===total` (861 items at 100 km), farthest pin 99+ km from the center (> the 2.02 km the old 200-slice covered); `.public-map[data-pins]` equals the served total; back on „Fișe" the page size is 18 again (Builder-A's cards contract kept for both directions).
- **e2e validation leg** (new): RED — `view=map&scope=all`, `view=map&pageSize=200`, `view=map&page=0`, `view=map&radius=101`, `view=bogus` all returned 200 against the old route. GREEN — all five 400 with `{error:'Alege o localitate și filtre valide.'}`; a valid pins request serves `items===total`, `pages:1`; the plain `pageSize=200` card request still works (mobile context, CDP touch-drag/pinch helpers copied from the touch-gestures leaflet leg).
- **e2e pan leg** (new, mobile 390×844 isMobile hasTouch): RED — `data-pins` attribute missing. GREEN — initial pins request → `data-pins` = served total; one CDP touch drag moves the map ≈138 km → exactly **one** new `view=map` request whose center differs (> 25 km), the new zone's pins render (`data-pins` = new served total, items===total); 1.6 s of silence after (one drag = one fetch); a two-finger pinch around the same center (zoom-only) fires **zero** additional pin requests.
- **battery leg** (`scripts/verify-geographic-scope.mjs`, after the pageSize-prefix leg): RED — `assert.equal(pins.items.length,pins.total)` failed `18 !== 1457` (view unknown, the query fell through to the 18-page). GREEN — `queryPlaces(… view:'map')` around Cluj returns every in-radius cultura element (`items===total>200`, every `distance<=100`, farthest > 50 km) and the 18-item list page stays its distance-sorted prefix; the old pageSize=200-vs-18 prefix leg kept (still the national-sample contract, sentence updated to say so).

### Probe evidence (`probe/nearby-map-probe.mjs` + `nearby-map-probe.json` + `nearby-map-pan-after.png`, own dev server, killed after)

- Radius legs (cultura, default București center, map view): `radius=5` → served **353** = `data-pins` 353, farthest pin **5.0 km**; `radius=50` → **538** = 538, span **49.7 km**; `radius=100` → **858** = 858, span **99.8 km**. (Before: the map-compliance wave's own probe measured `pageSize:200, items: 200 of total 1466` at radius 100 — a 23.7 km cluster; the offline table above is the before-evidence for the other densities.)
- Pan sequence (all at radius 100): drag NE 137.6 km → **1** request, center (43.421, 27.103), 33/33 pins rendered; drag N 130 km → 1 request, (44.590, 27.103), 763/763; drag NW 143.4 km → 1 request, (45.675, 28.092), 317/317. One gesture — one fetch — the new zone's own pins, every time. (An earlier probe draft landed one drag in Bulgaria and got an honest 0 — kept as a finding, not hidden: the empty zone renders 0 pins and the count label says 0; the probe was fixed to expect the served total, including 0.)
- Probe-method finding (my own measurement bug, fixed in-session): the first draft interacted before `main#vcontent[data-view=explore]` settled — the first paint is the home tree, which renders its own `places-workspace`; the interaction died with that tree's unmount and the selects silently reverted. The e2e legs never trip this because they assert `data-view` first; the probe now does too.

### Files modified (mine only — the corpus/binary diffs in the tree belong to the parallel waves)

`lib/places-query.ts` (pins branch + `PlacePin`), `app/api/places/route.ts` (`view` boundary validation), `app/places-workspace.tsx` (pins URL + mapCenter + honest labels + cards hidden in pin view + mapCenter reset on filter reset), `app/public-map.tsx` (settle notify + quiet guard + `data-pins`), `e2e/places-workspace.spec.ts` (rewritten map leg + 2 new legs + gesture helpers), `scripts/verify-geographic-scope.mjs` (battery pins leg + truth sentences), `README.md` (one sentence in the places radius paragraph — the pin view has no paging ceilings, pan refetch, cards stay paginated), `probe/nearby-map-probe.*` + `nearby-map-pan-after.png`.

### Gates (run this session, on the final tree)

- `corepack pnpm exec tsc --noEmit` → **0 errors**.
- `corepack pnpm lint` → **0 errors, 115 warnings = baseline exactly** (my 6 touched files: 0 errors, 8 pre-existing warnings).
- `node scripts/verify-geographic-scope.mjs` → **×2 exit 0** (consecutive runs; both include the new "Map pin sets checked" leg).
- `node scripts/verify-ro-text.mjs` → **exit 0** (the new Romanian copy passes the numeral/diacritic scan).
- `corepack pnpm test:e2e` full suite → **153 passed, 0 failed** (baseline 151 + 2 new tests; the rewritten map test replaced its predecessor 1:1). No flakes this run; the neighboring map surfaces (touch-gestures leaflet leg, imobiliare ortho legs, map-markers, place-image-stability) all green.

### Four-lens self-review

- **Completeness**: both user reports fixed at the source (the pin set is the whole radius; pan refetches the new center); every mission item delivered incl. probe evidence; no stubs or TODOs.
- **Quality**: the pins contract mirrors the repo's validation voice (reject, never clamp — paging params alongside `view=map` are 400s, not ignored); `countNoun` grammar in the honest label; `useLocationState` semantics reused for geo-key reseeding; fit/refit suppression documented by a business-rule comment; SWR interplay is exactly what the ios-lag wave designed (byte-identical → no re-render; new center → new URL → fresh fetch).
- **Discipline**: stayed inside my partition (the `app/page.tsx` and corpus diffs in the tree are the parallel waves' uncommitted work — untouched); the battery leg update was required by the ×2 gate's own contract (it pinned the map-page behavior this fix changes); README got exactly one sentence.
- **Testing**: all four test units observed RED for the documented reasons before any production code; the full suite is green with the two new legs included; the probe cross-checks DOM telemetry (`data-pins`), network truth (params + totals) and geometry (spans) independently.

### Reservations (small, stated)

1. **local-all at radius 100 km around a big city serves/renders ~23–42k pins** (measured 23,182 Cluj / 41,622 București offline; probe ran cultura). One local request, canvas rendering — desktop-correct, but a low-end phone panning that map will feel it. No silent cap by design; a future clustering/thinning decision would need its own honest-disclosure design.
2. The nearby map view no longer shows the card grid + pagination (the map is the view; „Fișe" is one tap away). The national map view keeps cards under the map — an intentional asymmetry: the two scopes have different contracts (full radius set vs bounded national sample), each labeled honestly.
3. The screenshot (`nearby-map-pan-after.png`) was captured but not visually inspected in-session (no image input) — the DOM/URL/count assertions above are the probe's evidence.
4. `/api/places` `view=map` responses for the biggest sets are multi-MB JSON (uncompressed locally; the platform compresses text responses in transit). Bounded by the corpus, measured, honest.

**Status: DONE** — root cause measured (nearest-200 slice capping the visible radius at 0.3–23.7 km depending on density), the honored-radius pin set wired with no silent caps (validated boundary, honest labels), pan-aware debounced refetch from the map's own center (cancel-in-flight, byte-identical no-op), all gates green: tsc 0 / lint 0 errors·115 warnings / verify-geographic-scope ×2 exit 0 / verify-ro-text 0 / full e2e **153 passed**.

---

## Builder Findings (national map → Leaflet)

Branch `feat/national-map-leaflet` (cut from main @ a66f633). USER REQUEST (verbatim): „natural earth map vreau să fie schimbat cu aia unde am și live, celălalt tip de hartă" — the national repere map (#view=map, hand-built SVG `.romap`) becomes the same kind of interactive map as the live one. All work in the worktree; committed locally, not pushed.

### What was ported (exactly)

- **`app/public-map.tsx` (extended, additive)**: new optional props `onSelect?: (id) => void`, `selectedId?: string`, `regionLabel?: string`. When `onSelect` is present, every non-vehicle point renders as a Leaflet divIcon marker containing a **real `<button type="button" class="repere-pin(chosen)" aria-label="Selectează {name}">`** — the same divIcon convention the flight-arrow markers use, extended where Leaflet gives nothing (see a11y below). All existing PublicMap consumers (transit, tranzy, flights, cinema, places) pass none of the new props — byte-identical behavior for them.
- **`app/page.tsx`**: the `#view=map` workspace swaps `<RomaniaMap …/>` for `<PublicMap points=… selectedId={activePin} onSelect={id=>{setActivePin(id);go('place',id)}} viewKey={'repere:'+exploreRadius+':'+(geo.hasLocal?geo.label:'na')} regionLabel="Harta României cu repere selectabile"/>`. Ported with it, unchanged in behavior: the radius selector (the 1–100 km `nearbyRecord` threading — Brașov 15 km→3 repere, 100 km→47), the sidebar list, the active-place preview card, the „Vezi ca listă" toggle, and the honest positioning notes. `viewKey` refits the bounds when radius/locality changes. The un-deduplicated corpus is unchanged (273 source entries − 6 same-place repeats = 267 pins).
- **`mapPlaces` memo (`app/page.tsx`)**: the Leaflet points array is memoized on `localPlaces` — an inline array handed PublicMap a **new identity on every Aflivra re-render** (live polls land mid-view), tearing down and rebuilding all 267 pin buttons while a test or a finger was on one (`Element is not attached to the DOM` — the full-run RED that isolation hid). One memo, fixed.
- **`app/workspaces.css`**: `.repere-pin` styles (26 px hit area, 16 px navy/white dot, hover, `.chosen` gold — the old `.map-pin.chosen` treatment); focus-visible ring is the app-global `.v2 button:focus-visible` gold outline, free from the real `<button>`.
- **`app/v2.css`**: the workspace height ladder ports to the new surface — `.map-workspace .public-map{height:590px}` (desktop, was `.map-workspace>.romap`), `430px` at ≤900 px (was the 430 romap pair), `320px` at ≤640 px (was the 320 romap pair); the dead 310 romap pair at ≤640 removed. OSM attribution is Leaflet's own control (`Leaflet | © OpenStreetMap contributors` — probe-verified), same as the live maps.

### Sunk complexity — what stayed vs. what died

**Nothing in `app/v2-charts.tsx` died**: the RomaniaMap machine (nearest-pin resolver, declutter offsets + leader hairlines, pinch emulation, pan-from-any-pointerdown, zoom buttons, `.romap` css, Natural Earth credit) is still consumed by the compact mini-maps (home discovery-split, place overview „Locul în context", planner aside) — kept untouched per the partition. What died is only the #view=map-scoped css (the 4 workspace `.romap` rules above) and the **e2e legs pinned to the emulated canvas** (listed below).

### A11y approach (mission item 3)

The existing live-map markers grant keyboard nothing (vehicle arrows are `role="img"` divs; plain circles are canvas — neither focusable). The old national map had 267 keyboard-reachable `g.map-pin[role=button][tabindex=0]`. Preserved on Leaflet by making the pin a **native `<button>`**: real tab stop, real Enter/Space activation (no synthetic key handlers), accessible name `Selectează {name}` (the exact old aria-label), `title` = place name, focus rings from the global button rule. A click navigates only when the pointer stayed within the old map's own ≥5 px slop (a drag stays a pan — same rule the SVG map shipped).

### TDD evidence — RED → GREEN → REFACTOR

- **RED**: rewrote `e2e/map-markers.spec.ts` (Leaflet surface, OSM tiles stubbed TINY_PNG + `no-store` — zero external fetches) and ported the `#view=map` describe of `e2e/map-touch-gestures.spec.ts`. First run on the unmodified tree: **12/13 failed for the intended reason** (`.map-workspace .public-map.leaflet-container` never appears — the SVG map still owns the view); the 1 pass was the untouched leaflet places-guard leg.
- **GREEN**: implementation above; 13/13 pass (incl. desktop click/keyboard/list-toggle/click-far/dedup census 267/radius 3→47/Sinaia real-zoom separation, mobile stack-tap, CDP touch pan-from-pin / vertical drag 0-cancel-0-scroll / pinch raising real tile zoom / tap-navigates).
- **REFACTOR**: `mapPlaces` memo (the full-run detach bug), census locator fix (`pinsLabeled` counts by label — `filter({has:…})` checks descendants, never the button itself), scroll-anchor fixes (the 267-entry sidebar is a ~20k px column — `scrollIntoView` must target the map element, a lesson the specs now document).

### Legs ported / retired (honest list)

**Ported** (8 map-marker legs — click→place, keyboard Enter→place, „Vezi ca listă"→explore, click-far-selects-nothing, one-pin-per-place census (267 + label census + sidebar), radius 3→47, Sinaia trio separation at real zoom (Leaflet box-zoom + each pin opens its own place), mobile stack-tap; 4 touch legs — drag-from-pin pans, vertical drag own-gesture audit (0 pointercancel / 0 scroll / scrollY unchanged), pinch raises served tile zoom, tap navigates.

**Retired** (SVG-emulation contracts that existed only for the constrained canvas, documented in the spec headers): ownedPixels nearest-pin-to-click-point resolution (overlap-pair + sub-pixel Sinaia ×2/pixel); declutter legs (offset ≥2 css px, offsets recomposing per zoom converging to truth, hairline leaders anchoring displaced pins ≤19 units); the SVG transform gauge + Resetează-harta reset leg (no emulated transform to reset; viewKey refits on corpus change). Replaced by their real-surface equivalents: hit-testing = the browser's own (click each own button at real zoom), separation = native meters-per-pixel zoom (the separation leg + mobile pixel-ownership leg).
- **Mobile stack-tap reformulated honestly**: the old leg asserted "opens one of the stacked trio" — a property of the resolver's nearest-pin arithmetic. On real DOM hit-testing, the pixel at Peleș's center at phone scale is genuinely owned by whichever button paints on top (often a 4th Sinaia repere) — the honest port asserts the tap opens **exactly the pin `elementFromPoint` reports**, same one every time. Which sibling you get is what zoom is for (the separation leg).

### Gates (final tree, this session)

- `corepack pnpm exec tsc --noEmit` → **exit 0, 0 errors** (spec type errors fixed during GREEN: TS field names + Shift via keyboard.down — mouse.down takes no modifiers).
- `corepack pnpm lint` → **0 errors, 115 warnings — exactly the repo baseline** (re-run after the memo fix and final css).
- `node scripts/verify-css-keyframes.mjs` → exit 0 (22 animation references / 16 definitions intact).
- `node scripts/audit-controls.mjs` → exit 0; `node scripts/verify-ro-text.mjs` → exit 0; `node scripts/verify-model-contracts.mjs` → exit 0.
- **No battery script pins `.romap` behavior** (grep romap|map-pin|RomaniaMap over scripts/ → none); the map-affecting gates are the css-keyframes/model/audit trio above, all green.
- Full `corepack pnpm test:e2e` on the final tree: **144 passed, 2 failed** — both failures are the SAME two `events-venues` Opera Cluj legs, **verified failing identically on the clean main tree (a66f633, my changes stashed)**: their fixtures hardcode `BAL MASCAT`/`FÂNTÂNA…` at 2026-10-07 (written yesterday, expired at midnight — the workspace honestly filters past events). **Registered, not fixed** (outside my partition — events surface; a fixture refresh ticket belongs to whoever owns events-venues).
- Probe (`probe/national-map-leaflet-probe.mjs`, own dev server, killed after): initial fit = **z7, 267/267 pins visible**; zoom 6 via the map's own − control = **z6, 267 visible, 15 tiles**; zoom 12 via 6 dblclicks beside Peleș = **z12 (displayed tile URL z=12), 6 repere visible in-viewport, 15 tiles**, `chosen:1` at every step, attribution „Leaflet | © OpenStreetMap contributors", **zero page errors**. Screenshots `national-map-zoom6.png` / `national-map-zoom12.png` captured; this session could not visually re-inspect them (no image input) — the DOM/zoom/census assertions above are the evidence, PNGs await eyeballs.

### AIGA registration (mission item 4)

`inspire.geomil.ro` is **completely down — 20 s connection timeout from residential too** (my own `curl --max-time 20` → exit 28, matching the orchestrator's 2026-10-07 probe). The overlay keeps its honest error + retry path (already pinned by `imobiliare-ortho.spec.ts`'s "service does not answer" leg); **no further action from us until their host recovers**.

### Four-lens self-review

- **Completeness**: mission items 1–6 all done (port, sunk-complexity check, a11y, AIGA line, e2e RED-first with honest retirements, all gates + probe). No stubs, no TODOs.
- **Quality**: additive extension of the shared component (existing consumers untouched — the 5 other PublicMap surfaces render byte-identical markup without the new props); pin conventions match the flight-arrow divIcon family; the slop guard copies the old map's own rule.
- **Discipline**: only the assigned files touched (public-map.tsx, page.tsx #view=map section + one memo, two css files' map parts, two e2e specs); compact mini-maps and v2-charts untouched; the pr49 png in the working tree is another session's and is excluded from the commit.
- **Testing**: every ported behavior has a leg that was RED for the documented reason on the old tree; the full-suite 2 failures are proven pre-existing on clean main.

**Status: DONE** — the national map is the same kind of interactive map as the live one (OSM tiles, native finger pan/pinch/zoom, keyboard-reachable repere buttons, honest attribution), 267-pin corpus + radius + navigation contracts all ported and green; gates: tsc 0 / lint 0 errors·115 warnings / batteries green / full e2e 144 passed with 2 pre-existing date-expired events-venue failures (verified on clean main, registered); probe z6+z12 captured.
