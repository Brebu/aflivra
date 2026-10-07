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
