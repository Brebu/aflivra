## Builder-B Findings (Wave A2)

**Wave**: A2 — corpus hygiene (points 2, 9, 10, 11, 12) · **Status: DONE** (see open items under "Parallel-agent state")

### A2-1 — RESEARCH probe pass (point 10)

One polite probe per family across all **31 active families** (the `verify-source-errors.mjs` matrix list): 24 live probes + 2 skipped with justification (`transport/trains` corpus-only, `transport/tranzy` env-gated without `TRANZY_API_KEY` — the loader's own gate forbids interrogating without it), 5 families sharing 3 endpoints (3 CNAS directories via one `package_show`, events/search + operanationalacluj via one tribe calendar). No DuckDuckGo (D6 — research-only, and unneeded). Full ledger + shapes + fixtures: `RESEARCH.md`, `probe-results.json`, `fixtures/` in this session dir; driver `probe-sources.mjs`.

Politeness ledger: ≥5 s between probes, ≥20 s between the two TPBI hits (2 TPBI/min vs the ≤4/min ceiling), 8 data.gov.ro GETs over ~5 min, one SOAP POST each to portalquery.just.ro and legislatie.just.ro, one adsb.lol coverage point, the deployed-worker check is our own infra (outside the source budget). Findings that matter: (1) **legal/law is source-down at probe time** — `legislatie.just.ro` GetToken answered HTTP 500 empty ×2 (02:53Z, 02:57Z) and refused https at protocol level; the deployed worker serves the last good copy with `status:"stale"` — honest-degrade confirmed in production, verdict class source-down; (2) **no rate-limit headers on TPBI** at the D2 15 s cadence — posture supports the decision; (3) live RT snapshot: 596 vehicles, `position` exposing only lat/lon/bearing that instant (loader's absence-tolerance already coded); (4) school datastore offers a much richer field list than the display (Cod SIRUTA PJ, Cod SIIIR PJ, Mediu loc. PJ…).

### A2-2 — `scripts/verify-recency-policy.mjs` (NEW, mandatory gate)

The D3 per-family recency table pinned to its exact coded anchors so drift breaks CI: catalog 3y window at `cache.ts:15`, company 3-fiscal-year merge at `cache.ts:70`, CNAS editions window at `directories.ts:11`, nightly-boundary machinery `cache.ts:19/26/27/60` including the `law:consolidated.v2` exemption from the nightly reset, legislation/dosare **no rolling year window anywhere in the legal chain**, feeds with no default age window + recent-first default in the domain route, events future-facing display filter (`scope==='all'||x.start.slice(0,10)>=bucharestDate()`), and the exempt readers (legal, justice, lawyers, feeds/films, trains, stories, housing) structurally forbidden from gaining a rolling age window. **Drift-proof**: RED-tested with three deliberate drifts (constant 3→2 at `cache.ts:15`; a rolling window appended to `justice.ts`; an anchor moved off `directories.ts:11`) — each fails the gate with the exact D3 row named; restored tree green. Registered in `pr-validation.yml` (verify battery, after `verify-refresh-sweep`) + README battery list + prose.

### A2-3 — `scripts/audit-dead-data.mjs` (NEW, report-only) + A2-6 review gate

**Census total: 26 families documented — 0 no-content rows, 1 beyond-horizon row, 0 orphans. SANCTIONED-TRIVIAL: 0 · PENDING-REVIEW: 0 · CLEAN: 26.** Report at `docs/hygiene/dead-data-census.md`. Per the mission's SANCTIONED vs PENDING-REVIEW marking: **no family reaches either bar** — the loaders' own validation guarantees content (parse-throws on empty), all manifests are consistent (places 303/303 chunks, stories 233/233 texts, transit 201/201 route files, trains 128/128 shards), and the single beyond-horizon record is the catalog seed's rolling-edge row (modified 2023-10-05, exits service autonomously through the dynamic `getSeed` window — no storage action warranted). Dev-D1 observations (1010 rows, 33 load-state errors, all with honest gates + backoff) are labeled dev-state, informational — no production conclusion drawn. **Consequently: no purge executed, no corpus regeneration, `verify-sweep-inventory` pin 181,537 untouched.** Age was never used as a deletion criterion (D3).

### A2-4 — Formats audit (point 9)

Enumeration over every `app/*.tsx` surface: raw-leak scan (`{x.At}`-shaped braces without a typed formatter), epoch/ISO reach, precedent stragglers (ft→m, kt→km/h, epoch→ISO). Findings + fixes — **3 surfaces fixed, display-side only, raw disclosure never replaced**:
- `app/lawyers-workspace.tsx` — IFEP stamp `dd-mm-yyyy HH:mm` raw in a typed row → typed `dateText` reading **alongside** the registry's published form; new `dd-mm-yyyy[ HH:MM]` shape in `lib/live/date.ts` (local wall-clock, no zone shift, structurally invalid stamps stay raw — never run through the lenient Date parser).
- `app/live-company.tsx` — identity facts table bare-ISO `Data înregistrării`/`Interogare fiscală` + contact-tab verification line → typed `dateText`; the raw `data_inregistrare` stays disclosed on the fiscal tab (`RegistryFields`) and in the full export.
- Verified clean: all other surfaces typed (`dateText`/`weatherDate`), deliberate HH:MM displays (cinema/courts/trains times), epoch conversions all inside loaders, `MetadataFields` panels raw by design.
**TDD**: 2 new e2e legs in `e2e/sweep-regressions.spec.ts` ("Typed date display on venue facts") — RED against the unmodified display (raw `1991-03-07` observed in the failure output), GREEN after the fix; full file + `home-smoke` green. Audit doc: `docs/hygiene/formats-audit.md`.

### A2-5 — `scripts/audit-unused-fields.mjs` (NEW, report-only) — the Wave B gap-list

`docs/hygiene/unused-fields.md` — the ordered gap table, **162 buried fields** (fetched, disclosed raw-only, candidacy for Wave B typed display) + 1 dropped-at-parse field + 3 families verified full-column generic render (no hidden fields: directories ×4, justice ×4, housing ×2) + 5 parsed-only families. Evidence: today's probe captures + in-repo fixtures + committed corpora; typed fields extracted structurally from the owning workspace components.

**Gap-list top-10 (Wave B input):**
1. `flights/adsb` — 45 buried aircraft fields (`alt_geom, ias, tas, mach, wd, ws, oat, tat, track_rate, roll, mag_heading, category, nav_qnh, seen, seen_pos…`)
2. `events (tribe)` — author, organizer, cost + ~50 more offered-but-buried event keys (venue id join family)
3. `catalog/ckan` — 26 result-row keys buried in `metadata` (tags, groups, maintainer, relationships…)
4. `places (OSM tags)` — top-25 untyped tag keys by frequency (`operator ×2399, brand:wikidata ×1572, tourism ×997, shelter_type ×837…`) — B-3 Q-id joins
5. `transport/realtime (TPBI)` — `currentStopSequence, currentStatus, trip.startDate, trip.scheduleRelationship, vehicle.licensePlate`
6. `transport/tranzy` — `vehicle_type, bike_accessible` (timestamp converted; speed/wheelchair typed)
7. `company/anaf` — **`den_caen` is the one dropped-at-parse field** (CAEN name fetched, never kept) + TVA date-interval flatten candidates — B-1 CUI
8. `flights/bia` — `actualTime` (atd/ata) on the arrivals panel
9. `localities/siruta` — all 7 CSV columns typed or named; no buried columns (clean)
10. `feeds` — `category`, `guid`, `dc:creator` dropped at parse (author/category attribution candidates)

### A2-7 — Battery registration + TTL contract text

- `pr-validation.yml` verify battery + README battery list + prose: `verify-recency-policy.mjs` (mandatory, after `verify-refresh-sweep.mjs`) + `audit-dead-data.mjs`/`audit-unused-fields.mjs` (advisory report-only, after `audit-controls.mjs`) — battery order mirrored in both files.
- **TTL semantic text 30→15 (Builder-A delegation)**: Builder-A's code change landed (`transit-realtime.ts:24` `ttl:kind==='vehicles'?15:30`, Tranzy `:70` untouched) — the contract text applied in the same registered places: `lib/live/refresh-groups.json` onDemand `transport.realtime` reason + README onDemand table ("pozițiile 15 s, estimările de sosire și sesizările 30 s"). No gate pins the prose (verified — only family+reason shape is asserted).
- Corpus regeneration: **not triggered** (0 sanctioned purges) — sha256 pipeline untouched, pinned counts unchanged.

### Verification (commands run this session)

- `node scripts/verify-recency-policy.mjs` — GREEN ×2 (plus 3 deliberate-drift RED proofs)
- `node scripts/audit-dead-data.mjs` — GREEN ×2 (report-only)
- `node scripts/audit-unused-fields.mjs` — GREEN ×2 (report-only)
- `node scripts/verify-refresh-sweep.mjs` · `verify-sweep-inventory.mjs` · `verify-packed-seeds.mjs` — GREEN ×2 (post text/pin change)
- `node scripts/verify-source-errors.mjs` (31 families / 196 cells) · `verify-model-contracts.mjs` · `audit-controls.mjs` · `verify-ro-text.mjs` — GREEN
- `corepack pnpm exec tsc --noEmit` — **0 errors** (merged tree incl. Builder-A's landed transit files)
- `corepack pnpm lint` — **0 errors, 115 warnings** (≤115 budget)
- Full e2e: **167/168 passed** — every leg of my scope green (incl. my 2 new format pins); the single failure + 2 mid-flight legs in `e2e/line-live-map.spec.ts` are **Builder-A's RED-first A1 spec** (their partition, actively progressing: 4/6 of their legs pass on my recheck — their file, their ownership; see below)
- Battery registered in `.github/workflows/pr-validation.yml` + README (same change)

### Files (mine)

- NEW: `scripts/verify-recency-policy.mjs`, `scripts/audit-dead-data.mjs`, `scripts/audit-unused-fields.mjs`, `docs/hygiene/dead-data-census.md`, `docs/hygiene/unused-fields.md`, `docs/hygiene/formats-audit.md`, this session dir's `RESEARCH.md` + `probe-sources.mjs` + `probe-results.json` + `fixtures/*` (24 fixtures + 1 decoded shape)
- EDITED: `lib/live/date.ts` (registry dash-stamp shape), `app/lawyers-workspace.tsx`, `app/live-company.tsx` (typed dates alongside raw), `app/...` formats fixes only — no data changed anywhere; `lib/live/refresh-groups.json` + `README.md` (TTL contract text + battery), `.github/workflows/pr-validation.yml` (battery lines), `e2e/sweep-regressions.spec.ts` (2 new pins)
- NOT touched: verify-source-errors.mjs (not my partition), watch surfaces, corpus files, pinned counts, Builders-A's transit/live-map files

### Self-review (four lenses)

- **Completeness**: all 7 tasks delivered; deliverables are the gates + the three advisory docs + the probe artifacts; nothing stubbed; the census's no-purge outcome is an evidenced result, not a skip.
- **Quality**: matches estate conventions (verify-*/audit-* naming, battery registration in the same change, Romanian user-facing output, English code comments, politeness ledger recorded). The audits fail loudly if their evidence sources vanish.
- **Discipline**: no deletion performed and none warranted; age never a criterion; strict file partition respected (`verify-source-errors.mjs` fixtures registered here instead of editing a file I don't own); the TTL text applied only after Builder-A's code change landed so text and code match.
- **Testing**: RED→GREEN evidenced for the gate (3 drift scenarios) and for the display fixes (2 e2e legs); everything re-run ×2; outputs read, not assumed.

### Parallel-agent state (open, not mine)

Builder-A's `e2e/line-live-map.spec.ts` legs were mid-RED during my exit gate (their A1 tasks are sequenced RED-first; 4/6 pass on my last check). Their `tsc`-visible mid-edit state resolved during my session — final tree typechecks clean. `app/transit-workspace.tsx`/`app/api/transport-live/route.ts`/`lib/live/transit-realtime.ts` are theirs; I only applied the delegated registry/README text after their constant landed. `.tmp-probe-popup.mjs` (untracked) is their probe artifact — left untouched.

## Builder-A Findings (Wave A1)

**Wave**: A1 — per-line live map (Transport „În mișcare", point 5) · **Status: DONE** (one observed non-blocking cold-load note below)

### TDD cycle (RED → GREEN → REFACTOR)

**RED** — `e2e/line-live-map.spec.ts` written first, all 6 legs run against unmodified code: all 6 failed for the intended reasons (live section heading missing; `data-pins` 59 vs 61/62 — no vehicles merged; absence note missing; picker opening nothing; 0 heading markers; byte-identical leg failing at 2 polls of 0 new requests). Failure log: `line-live-map-RED.log` in this dir. One locator repair during RED (Playwright `filter({has})` needs the inner locator page-rooted — probed, not assumed; noted in the spec comment) and one CDP reality: this bundled Chromium **rejects `Emulation.setPageVisibilityState`** (probed live — both domains; `Page.setWebLifecycleState` accepted but does not flip `visibilityState`; two-page bringToFront does not either in headless), so the hidden-tab leg emulates `document.visibilityState` + a real `visibilitychange` at the exact boundary the poll gate reads — assertion unchanged, only the injection point. Deviates from R6's assumption, not from the assertion.

**GREEN** — all 6 legs pass (`line-live-map-GREEN.log`), full suite **168/168** (`a1-full-suite.log`).

**REFACTOR** — the shared staleness ternary (appearing 3×) collapsed into `stalenessPhrase(d, fallback)`; `variants` gained its own `useMemo` (correctness + kills the one new lint warning); no behavior change.

### Per-task status

| Task | Status | Evidence |
|---|---|---|
| A1-1 RED spec + core leg | DONE | 6-leg spec; stations+vehicles on one map asserted via `data-pins` arithmetic (59+3 / 63+3), direction grouping per variant headsign, telemetry aria-label + `rotate(87 14 14)` |
| A1-2 TTL 15s TPBI vehicles only | DONE | `lib/live/transit-realtime.ts:24` `ttl:kind==='vehicles'?15:30`; arrivals/alerts and the Tranzy loader (`:70`) untouched — verified active in the live probe payload (`ttlSeconds:15` on `transport:realtime:vehicles`) |
| A1-3 stalenessSeconds + seconds tier | DONE | API emits `stalenessSeconds` (floor) alongside the unchanged `Math.round` minutes, only when stale; `stalenessText` gains the sub-minute seconds branch (Romanian plurals via `countText` → „40 de secunde"); minute/hour/day scale untouched — pre-existing stale-label e2e legs still green |
| A1-4 RouteReader live layer | DONE | independent `useSource('/api/transport-live?kind=vehicles&route='+id,{timeoutMs:8000,pollMs:3000})`; merged `mapPoints` memoized so byte-identical polls never redraw the map; station points + vehicle MapPoints (bearing/speed/occupancy passthrough) + shape path on the existing `PublicMap`; count + per-headsign direction summary + per-source Freshness + seconds-tier label; honest empty note („Un vehicul lipsă din flux nu înseamnă că linia nu circulă") |
| A1-5 line picker | DONE | vehicles-mode `routeFilter` select sets `routeFilter`+`selected` together (vehicles mode only — arrivals/alerts picker untouched); every `network.routes` option remains registry-sourced |
| A1-6 guardrails | DONE | cadence assertions 2.5–4s window (observed ~3.05–3.2s), hidden freeze over ≥2 intervals, immediate resume on visible, unmount abort (no requests 6.5s after close), byte-identical: pin count stable + no busy/error churn while polls keep firing |
| A1-7 rate math + README | DONE | one TTL line in README:108 (positions 15s, estimates/alerts 30s, per-line 3s poll named); conventions.md already carries the D2 numbers (§1) — no edit needed there |
| A1-8 exit gate | DONE | see battery below |
| A1-9 Tranzy per-line | REGISTERED P2 follow-up — not this wave (per PLAN) |

### TTL-text delegation (for A2 — RECEIVED AND APPLIED)

The registry text sync that pairs with my TTL constant: `lib/live/refresh-groups.json` onDemand `transport.realtime` reason + README onDemand table row. **A2 applied both while I was mid-wave** (their STATUS §A2-7 records it) — I verified the applied text against my loader semantics on the final tree: „Pozițiile vehiculelor au un TTL de 15 secunde, iar estimările de sosire și sesizările un TTL de 30 de secunde; nu pot fi pre-împrospătate." — matches `ttl:kind==='vehicles'?15:30` exactly. Nothing left to delegate. My README edit is only line 108 (transport coverage sentence) — the one line in my partition.

### PollMs plumbing gap found and fixed (`app/use-source.ts` — licensed by the brief)

RED evidence surfaced a real stall: with byte-identical responses, `setResponse` was skipped (correct, no re-render), but the poll effect keyed only on `[url,data,busy,error,options.pollMs]` had **no signal to re-arm the timer — polling halted after one identical copy**. On the per-line 3s poll with a 15s source TTL, most polls inside a TTL window are byte-identical, so the leg "\~3s cadence while visible" and "byte-identical → no churn" were mutually unsatisfiable. Fix: the completed cycle itself re-arms the timer — `revision` added to the poll effect deps, with a comment stating the contract (byte-identical → no re-render, but the cadence continues). No existing spec pins the stall (checked); no other semantics touched (attempts/backoff/visibility/online logic unchanged).

### Rate math (registered, per D2)

- Worker→TPBI: TTL 15s → at most 4 source fetches/min **total across all viewers** (single D1 row `transport:realtime:vehicles`, single writer via `lock_until` 60s lease — `lib/live/cache.ts`); GTFS-RT politeness norms (10–30s consumer polling) respected.
- One viewer-hour on the per-line view: ~1,200 `/api/transport-live` requests ≈ **1.2% of the Workers free plan 100k/day**; ~2–5 D1 reads per request ≈ **5k reads/hour ≈ 0.1% of 5M/day**. CPU: one JSON.parse of the cached vehicles payload per request, route filter applied in-route.
- Client: ticks fire only when visible+online; abort on unmount; byte-identical never re-renders and (post-fix) never stalls.
- **Edge micro-cache (`Cache-Control: public, max-age=2, stale-while-revalidate=2`) NOT applied — deferred contingency** per D2 (registered in conventions §1); `no-store` stays on the route (verified unchanged).
- Follow-up candidate (non-blocking, observed): a full marker rebuild on changed-bytes polls closes an open leaflet popup for one cycle; per-marker diffing would be a new mechanism — noted, not built (YAGNI; popup pathway covered deterministically in `transit-view.spec.ts`).

### Verification (commands run on the final merged tree, this session)

- `corepack pnpm exec tsc --noEmit` — **0 errors**
- `corepack pnpm lint` — **0 errors, 115 warnings** (= pre-existing baseline; zero added)
- `node scripts/verify-source-errors.mjs` — GREEN (31 families / 196 cells, incl. TPBI honest-degrade)
- `node scripts/verify-refresh-sweep.mjs` — GREEN (5 groups, crons frozen, no 6th trigger)
- `node scripts/verify-model-contracts.mjs` · `audit-controls.mjs` · `verify-sweep-inventory.mjs` (181,537 places pin intact) · `verify-snapshot-transport.mjs` · `verify-packed-seeds.mjs` — all GREEN, exit 0
- `corepack pnpm test:e2e` — **168 passed / 0 failed** (incl. my 6 new line-live-map legs + A2's 2 format legs)

### Files (mine, partition respected)

- NEW: `e2e/line-live-map.spec.ts` (6 legs, fixture read offline from `public/transit/routes/75ce47a779c2311fc60ed79e.json.gz` — route PV1_403, both direction variants with real tripIds)
- EDITED: `app/transit-workspace.tsx` (RouteReader live layer; `stalenessText` seconds tier; `stalenessPhrase` refactor; picker onChange; `variants` memo), `app/api/transport-live/route.ts` (`stalenessSeconds` + comment), `lib/live/transit-realtime.ts` (TTL constant ONLY), `app/use-source.ts` (poll re-arm fix + comment), `README.md` (line 108 ONLY)
- NOT touched: `refresh-groups.json` (A2's), watch/legal/courts/events/federated surfaces, corpus, cron config, `public-map.tsx` (reused as-is — heading arrows, circles, popups all existing machinery)

### Live probe (politeness ledger entry)

One live probe via the local dev server, no interception, through the app's own D1-cached loader machinery (~3 min, TTL 15s self-throttles ≤4/min by design; TPBI cumulative with A2's 2 direct hits stays far under ceiling). Evidence: `live-probe-evidence.json` + screenshots `live-probe-vehicles-list.png` (759 vehicles, radius map, „poziții de acum ~un minut") and `live-probe-line-map.png` (line 403, 06:46 — honest empty: „0 vehicule în flux pe linie · poziții de acum ~17 secunde", stations-only map). The probe caught the seconds tier live in both forms: `stalenessSeconds:87/stalenessMinutes:1` on a stale copy and `ttlSeconds:15` on the fresh one. ( PNG verification by file metadata — image preview not available in this session's model. )

### Self-review (four lenses)

- **Completeness**: all A1-1…A1-8 delivered, A1-9 registered as P2; every state honest (empty note, stale-keeps-map, error-keeps-copy, no invented headings for bearing-less vehicles); no scaffolding, no TODOs.
- **Quality**: every ingredient composed from existing machinery (PublicMap markers/popups, useSource guardrails, countText plurals, the staleness label family); the two new code comments state contracts, not narration; Romanian UI text, English artifacts.
- **Discipline**: strict file partition held (refresh-groups.json delegated, not touched; A2 confirmed symmetric restraint on my files); RED-first honored including keeping the RED log; no cron, no new endpoint, no new Map component, no DDG, no bulk anything; the one out-of-partition edit (use-source.ts) was pre-licensed by the brief for exactly this gap and is documented above.
- **Testing**: RED→GREEN→REFACTOR evidenced with logs; the guardrail legs assert the hook's live behaviors, not mocks; full battery re-run green on the merged tree; probe evidence saved.
