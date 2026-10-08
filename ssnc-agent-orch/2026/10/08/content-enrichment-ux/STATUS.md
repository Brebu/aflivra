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

## Builder-C Findings (Wave B registries)

**Wave**: B-1 (CUI company card) + B-2 (dosar court card) + B-4 (act-id legal reader) · **Status: DONE** (all evidence below on the final tree; two disclosures: a B-1-semantics edit in `lib/live/cache.ts` outside the listed partition, and the resumed-arc provenance — see "Session recovery")

### Session recovery

This wave resumed mid-flight: the prior arc of the same role spent the probes (07:57), wrote the three RED spec files + matrix cells (RED logs 08:09–08:13), landed the implementation, ran the 6 legs GREEN (08:49), then made three further edits (08:53: `app/legal-workspace.tsx`, `lib/live/legal-consolidation.ts`, `app/live-company.tsx` — the version-history + bibliographic-fallback work) and one fleet run (08:56: 180/182 — the 2 failures were this arc's mid-edit `legal-act-facts:48` and the parallel agent's `place-image-stability`) before being cut off without a STATUS entry. I verified the final tree end-to-end rather than reverting anything (each 08:53 edit is load-bearing for leg 3/6 and green), diagnosed both fleet failures as mid-edit transients, corrected two comment-accuracy defects my own-infra reads exposed (below), and completed the ×2 gate matrix.

### Probes ledger (every spend this wave)

| # | When (UTC) | Request | Result |
|---|---|---|---|
| P1a | 10-08 04:56:01 | GET `data.gov.ro/dataset/0793f…/resource/72d0bd2f…` (no `/download`) | 200 HTML CKAN view page 32,243 B — recorded as spent (first attempt kept in ledger) |
| P1b | 10-08 04:57:49 | GET `…/download/contracte-farm-31.03.2026.xls` — the FARM/pharmacies export, the loader's own URL | 200 XLS 345,600 B — **columns: Numar contract / Cod fiscal furnizor / Tip furnizor / Nume furnizor / Cod CAS / Nume CAS, 2,284 rows, CUI plain-numeric** (fixture `fixtures/cnas-farm.xls`) |
| P2 | 10-08 04:56:07 | GET `legislatie.just.ro/Public/DetaliiDocument/41627` (one act page, no SOAP token) | **connection refused (UND_ERR_SOCKET)** — consistent with A2's 02:53/02:57Z GetToken 500s: the MJ legislation portal is source-down at probe time → the honest-absence basis for B-4's fallback leg |
| own-infra ×4 | 10-08 (this session) | GET deployed worker `/api/directory?kind=health|pharmacies|hospitals` (+ the 427282 match checks) | A2's own-infra precedent (outside the source budget; served from the app's own D1-cached editions): **all three 31.03.2026 CNAS editions (clinici 4,117 / farmacii 2,284 / spitale 731 records) publish the same contract column set including „Cod fiscal furnizor"**; CUI 427282 matches 0 rows in clinici/spitale today (live honest absence). No CKAN/data.gov.ro request triggered. |
| B-2 act-links | — | no new probe | no spend needed: A2's live SOAP capture (`fixtures/courts-portal-just.txt`) already pins that dosar responses cite acts **by number and year inside `solutieSumar` text only — no act identifiers** → the „nu sunt disponibile legături programatice" note is probe-backed |

DDG: none (D6). No new CKAN probes were needed beyond P1: A2's shared-endpoint fixture covers the `lista-furnizori` metadata, and the live column facts came from P1b + the own-infra reads.

**Live-truth correction (made this session):** the landed code comment claimed clinic/hospital exports publish „CUI cod" „live-probed" — the own-infra reads show every current edition publishes the contract shape with „Cod fiscal furnizor"; „CUI cod" is the column name of the pinned directory fixtures/earlier editions. The accepted-column set (`['CUI cod','Cod fiscal furnizor']`) was already correct — **no behavior change**; the comments in `lib/live/adapters.ts`, the e2e spec header, and the matrix fixture comment were corrected to state the real evidence; matrix + 6 legs + tsc/lint re-proven green after the edit.

### Per-task status

| Task | Status | What landed |
|---|---|---|
| **B-1 CUI company card** | DONE | `den_caen` restored from parse-drop (`caenLabel`, probe-visible in `fixtures/company-anaf.txt`) rendered typed beside the CAEN code („5812 · Activități de editare a ziarelor") + provenance entry; TVA interval typed as a date range via the existing date helpers („13 iun. 2007 — în prezent", open-ended when `vatTo` absent) with provenance for `vatFrom`/`vatTo`; new „Registre publice" tab: the 3 CNAS registries joined **on the exact CUI column** (`companyPublicRegistries` — rides the existing daily-TTL `directory:*` D1-cached loaders, one fetch/day per registry across all viewers), per-registry Freshness + period, every published column of each matched record disclosed, multi-match rows kept **distinct**, unmatched registry = honest absence note, unreadable registry = warning only (never a card failure); sources extended with each registry's own source state; prior-copy merge keeps the new fields (`cache.ts` company line) |
| **B-2 dosar court card** | DONE | `institutionProfile` (court id → `public/courts/institutions.json` registry label → type + locality, e.g. „Tribunal · Bihor"), rendered on every stage row + in the export text — **id-based registry lookup, never a name match**; dosar→act links: probe-settled honest absence (`ACT_LINKS_ABSENCE_NOTE`) on the history panel and the documents tab — no search guesses; stage grouping/evidence untouched |
| **B-4 act-id legal reader** | DONE | «Istoricul formelor oficiale»: every version event the portal publishes for the same act id (date + Formă de bază/consolidată + the event's own official `DetaliiDocument` address) rendered below the selected version — **consolidation selection untouched**; portal-unreachable degrade keeps the act's own bibliographic facts from the official search row (tip+număr, emitent, publicație, data — same act id, labeled as such), never a bare error |

### TDD cycle (RED → GREEN → REFACTOR)

- **RED** (prior arc, logs kept in this dir): `wave-b-e2e-RED.log` — 3 new spec files, 6 legs, **all 6 failed for the intended reasons** (missing `.company-registries`/`.court-stage-institution`/`.law-version-history` surfaces, missing absence notes); **fixture rule honored**: `wave-b-matrix-RED-company.log` shows the extended `company/anaf` cells failing on unmodified loaders (composite kept 2 sources vs the asserted 5) — **cells before loader changes**.
- **GREEN**: 6/6 legs isolated — run twice post-resume on the final tree (13s each run); full suite 182/182 (below).
- **REFACTOR**: the live-truth comment corrections above (zero behavior change, all gates re-proven); no code-shape refactor needed — the provenance/join code is the `combineCompany` model extended in place, not reinvented.

### Fields surfaced per surface

- **`app/live-company.tsx`** (B-1): identity tab **+3 typed fields** (`caenLabel` beside the code, `vatFrom`+`vatTo` as a typed range); „Registre publice" tab: **3 registries × every published column of each matched row** (6 columns/record on the current contract-shaped editions) + per-registry period/Freshness/absence-note — max **~21 new rendered fields** on a fully matched card.
- **`app/company-provenance.tsx`** (B-1): **+3 provenance keys** (`cnasClinici`/`cnasFarmacii`/`cnasSpitale`, recorded only where the registry matched — none invented for an unmatched registry) + up to 3 registry source states in the sources list.
- **`app/court-history-panel.tsx` + `app/courts-workspace.tsx` + `lib/court-history.ts`** (B-2): **+2 fields per stage** (institution type, locality) + the act-links absence note on 2 surfaces; export text carries both.
- **`app/legal-workspace.tsx` + `lib/live/legal-consolidation.ts`** (B-4): **+3 fields per version event** (date, kind, official address) + **4 bibliographic fields** on the unreachable-portal degrade.
- Data layer (B-1): `parseBalance`/`parseRegistry` retain `den_caen`/`dataInceputScpTVA`/`dataSfarsitScpTVA`; `companyLoader` version bumped `anaf.profile.v2→v3` (shape change invalidates stale rows per the loader contract); `lib/live/cache.ts` prior-copy keep-list + `vatFrom`, `vatTo`, `publicRegistries`, `caenLabel`.

### Verification (final tree, commands run this session)

- `corepack pnpm exec tsc --noEmit` — **0 errors** (×2)
- `corepack pnpm lint` — **0 errors, 115 warnings** (= the ≤115 budget, pre-existing baseline; zero added)
- `node scripts/verify-source-errors.mjs` — GREEN **×2** — **32 families / 202 cells** (was 31/196: +`legal/act-page` family ×6 cells; `company/anaf` cells extended — CKAN join asserts 5 sources, `caenLabel`, `vatFrom`, 6 CKAN accesses, per-registry match counts, multi-match distinctness, no provenance invented for the unmatched registry)
- Owning family gates — **each green ×2**: `verify-live.mjs`, `verify-court-links.mjs`, `verify-courts-workspace.mjs`, `verify-legal-records.mjs`, `verify-law-navigation.mjs`, and `verify-law-reader.mjs` — **name note**: the mission gate list says `verify-legal-reader.mjs`; no script by that name exists — the reader gate is `verify-law-reader.mjs` (6 real snapshots / 5,694 articles), which is what ran green ×2
- Collateral gates green (my changed code feeds them): `verify-enrichment-joins.mjs` (the parallel agent's B-7 over my join sites — validated-keys only), `verify-recency-policy.mjs` (legal chain stays window-free with my consolidation edit), `audit-controls.mjs` (413 controls), `verify-ro-text.mjs`, `verify-model-contracts.mjs`, `verify-federated-search.mjs`, `verify-search-ui.mjs`, `verify-watch-api.mjs`, `verify-refresh-sweep.mjs`
- `corepack pnpm test:e2e` — **182 passed / 0 failed** on the final tree; my 6 new legs green in both an isolated ×2 run and both full fleets. One transient fleet run post-verification-start (162 passed / exit 1, the 4 failures all `watch-flows` legs) coincided with the parallel agent's mid-run edits on the shared dev server: those legs pass 11/11 isolated immediately after and the immediate full re-run is 182/182 — explained, not papered over; final tree proven green twice.

### Files (mine; partition respected)

- **NEW**: `e2e/company-registries.spec.ts` (2 legs), `e2e/court-institution.spec.ts` (2 legs), `e2e/legal-act-facts.spec.ts` (2 legs)
- **EDITED**: `lib/live/adapters.ts` (caenLabel, vatFrom/vatTo, `companyPublicRegistries`, loadCompany join, loader v3), `lib/live/knowledge.ts` (provenance + registry sources), `app/live-company.tsx` (vatText, CAEN row, registries tab), `app/company-provenance.tsx` (join sentence), **`lib/live/cache.ts` (disclosure: company prior-copy merge line only — file is outside my listed partition, but the edit is loadCompany's own keep-list semantics; without it a subsequent identity-less balance would drop the new fields)**, `lib/court-history.ts` (institutionProfile, absence note, stage.institution, export), `app/court-history-panel.tsx`, `app/courts-workspace.tsx` (documents-tab note), `lib/live/legal-consolidation.ts` (versionHistory), `app/legal-workspace.tsx` (history section + bibliographic fallback), `scripts/verify-source-errors.mjs` (my cells + dynamic-import rewrite), `scripts/verify-courts-workspace.mjs` + `scripts/verify-law-navigation.mjs` (compile-map rows for components my surfaces pull in)
- **UNTOUCHED**: places/media/events/federated files, `verify-enrichment-joins.mjs`, `pr-validation.yml`, README (all the parallel agent's), `lib/live/court-references.ts` + `lib/live/legal-registry.ts` (index reuse — no change needed)

### Self-review (four lenses)

- **Completeness**: all three families delivered with their probe-gated honest absences (portal-down fallback, unmatched registry note, act-links absence note); no stubs, no TODOs (scanned).
- **Quality**: joins resolve only on validated keys (CUI exact-string on the registry's own column; institution by registry id; version events on the portal's own ids) with per-field provenance and per-source Freshness; multi-match stays distinct (matrix-pinned: 2 hospital rows for one CUI remain 2 rows); unchecked claim about live columns found and corrected rather than left.
- **Discipline**: strict partition held except the one disclosed `cache.ts` line (B-1 semantics, precedented by the Wave-A delegation pattern); no new cron, no new endpoint (registries ride existing loaders), no DDG, no bulk anything; raw `MetadataFields`/`RegistryFields` disclosures untouched beneath the typed rows.
- **Testing**: RED evidenced for all 6 legs + the matrix cells; every gate re-run ×2 on the final tree; the own-infra live-column finding was turned into a correction and a re-proof, not an assumption.

**Status: DONE** — the disclosures above (cache.ts line, the gate-name mapping, the resumed-arc provenance) are visible for the orchestrator's review; every gate is green ×2 on the final tree.

## Builder-D Findings (Wave B links + gate)

**Wave**: B — cross-source enrichment, links/venues/places families (B-3, B-5, B-6, B-7) · **Status: DONE**

**Session context**: this run resumed an interrupted Builder-D session (implementations + RED evidence landed 08:09–08:56, STATUS write-up missing — the stray artifacts below are its fingerprints). This continuation verified the landed work end-to-end, repaired two defects, completed two registration gaps, and established the final green tree. All findings below are from commands run on the final tree this session.

### TDD cycle (RED → GREEN → REFACTOR) — evidence from the interrupted run, re-verified

**RED** — all specs written first against unmodified code, failure log `wave-B-RED.log` (08:09): **7 legs failed for the intended reasons** (169 passed) — 2× `events-venues.spec.ts` (venue-registry group + unregistered-venue honesty), 2× `places-workspace.spec.ts` (wikidata link-outs), 3× `federated-search.spec.ts` (place→calendar, dosar→court-registry, CUI→watch anchor links). The 8th new leg („a place row with no venue registry record grows no calendar cross-link") is a negative drift pin — green at birth by design; it guards the honest-absence side.

**GREEN** — 8/8 new legs pass; full fleet **182/182** (`wave-B-d-fleet-final.log`, 2.0m, 35 files).

**REFACTOR** — no behavior change needed beyond the repairs below.

### Per-task status

| Task | Status | What landed |
|---|---|---|
| B-3 place/Q-id | DONE | `operator` stays the typed row it already was (A2 gap-list top key ×2399 — now **pinned** by the gate at `lib/places-view.ts:7`, and e2e-asserted on the Cărturești Carusel detail); `wikidata`/`brand:wikidata`/`operator:wikidata`/`network:wikidata` surface as **external link-outs** built from the exact Q-id in the source row (`/^Q[1-9]\d{0,9}$/`, `https://www.wikidata.org/wiki/<Q-id>`; multi-valued/malformed stays in raw disclosure only) — **zero runtime Wikidata fetches**; imagery untouched per D5 (no new media; ceilings respected: 683 files/15,500, shipped census **7,467/20,000**); name+1km dedup guard **asserted, not relaxed** (`v2-model.ts` NOT modified — the gate pins the `placeKm(...)<1` co-predicate) |
| B-5 venue id join | DONE | Registry record reunited on the venue id the loaders stamp: `VenueFacts` provenance group („Registrul validat al instituțiilor") with address, city·county, coordinates, official URL on the panel AND inside the event dialog via `eventVenue(selected.venue)`; registry commit gained `address`+`placeId` (validated at registry-commit time, never runtime name-matched); venue→places cross-link is a **deep link** through the registry `placeId`; unregistered venue id → no registry group in the dialog (honest-absence leg); fixtures updated to the committed registry values |
| B-6 federated v5 cross links | DONE | `FederatedCrossLink` family in `lib/live/federated.ts`: place→venue-calendar (OSM record id === registry `placeId`; **zero or several matches both stay linkless**), dosar→court registry, CUI→firm watch; rendered as **sibling anchors** (`federated-cross-link`) of the row button in `app/search-results.tsx`, never merged row data; `verify-federated-search.mjs` LEG 7 (incl. the same-name-different-city negative proof — only the recordId-carrying place links) + 4 e2e legs |
| B-7 verify-enrichment-joins.mjs | DONE | Structural join-truth gate, 5 LEGs: (1) validated key predicates at **every join call site** — venue (events loader/api/workspace), place record id + Q-id (places-workspace, federated placeId), CUI (live-company boundary regex, knowledge.ts P3608 exact VAT, **adapters.ts CNAS registry join on the published CUI columns**), dosar (`courtById` registry id, federated `\d{1,8}/\d{1,5}/\d{4}` gate), act (`officialLawUrl`), SIRUTA (published primary-key columns); (2) every enriched field renders inside a provenance/labeled group (venue registry, wikidata links, company provenance map, federated sibling anchors, court stage institution fact, legal act-facts + version-history sections); (3) multi-match → warning/linkless, never merge; (4) name-similarity detector over **16 enrichment files** with the sanctioned exceptions pinned; (5) RED-drift proof — deliberate name-only join, name-compare-in-selection, and relaxed name-without-1km guard fixtures each fail; AbortError check stays exempt (no false positive). Battery-registered: `pr-validation.yml` (after `verify-recency-policy`, i.e. after `verify-refresh-sweep` in battery order) + README battery sentence + the federated v5 README sentence |

### This continuation run — repairs & completions (with evidence)

1. **Stray file removed**: untracked `app/v2-model.tsx` — byte-identical accidental duplicate of the (unmodified) `app/v2-model.ts` from the interrupted run; import resolution prefers `.ts`, but it was tree pollution. Removed.
2. **08:56 fleet failures triaged — environment, not code**: `place-image-stability` (Expected 12, Received 0) and `legal-act-facts:48` (fullLoads 0) both failed only in a fleet run whose dev server received the parallel agent's 08:53 file edits mid-run (`reuseExistingServer: !CI` + HMR full-page reload — the error-context shows `net::ERR_CONNECTION_REFUSED` reconnection during recompile; a reload recreates the DOM, wiping `data-stab`, and resets route-interception counters). **Both green in isolation** and in the final clean fleet **182/182**. No assertion weakened.
3. **Parallel agent's registration gap completed**: their `legal/act-page` matrix family (32 families/202 cells now) was added to `verify-source-errors.mjs` without the inventory link → `verify-sweep-inventory` **FAIL** ("orice familie din tabela de paritate este legată de un registru"). Truthful one-line fix: `'law.search':{parity:['legal/law','legal/act-page']}` — their matrix cells construct `lawLoader({…selectedId})`, i.e. the `law.search` onDemand registry family (same one-registry/two-matrix-families pattern as `events.venues`). Green ×2; **181,537 places pin intact**, 49 registry families all covered. Recorded here as a cross-partition completion on the parallel agent's behalf — battery registration is this task's lane.
4. **Gate extended to the parallel agent's FINAL call sites** (their adapters.ts CUI registry join landed 08:53, after the gate was written 08:40): LEG 1 pins the published CUI columns + exact-equality predicate; `lib/live/adapters.ts` added to the LEG 4 name-join scan (detector pre-checked clean: 0 hits); LEG 2 pins their court-stage institution fact and legal act-facts/version-history provenance groups. Detector dry-run + gate green ×2.

### Fields / links surfaced (the wave's enrichment inventory)

- **Places detail**: typed operator row (pinned); 4 Q-id external link-outs with per-tag labels + "construite din identificatorii exacți (Q…)" disclosure + explicit „aplicația nu interoghează Wikidata" note.
- **Spectacole**: venue registry facts group on the workspace panel and inside every event dialog (address, locality, coordinates, official site link, join-key statement) + venue→places deep link where the registry carries the OSM record id.
- **Federated search**: v5 cross-entity anchors on place rows (calendar discovery), dosar shortcut rows (institutions registry), CUI shortcut rows (firm watch center); linkless where no validated key.

### Probes ledger (Wave B)

This continuation spent **zero new source probes** — all verification is offline (gates) or against the local dev server (own infra). The wave's live probes were spent by the interrupted session at 07:57 (`probe-results-wave-b.json`): 2× CKAN CNAS farm resource (first HTML view attempt recorded as spent + the xls download — fed B-1, finding: no CUI column in the FARM export), 1× MJ `DetaliiDocument` act page (connection-failed — fed B-4's honest-absence path). My families join committed, registry-commit-validated data (venues.json, places corpus tags, refresh-group family routes) — **no new source fetches, so no new probe fixtures required**; the Wave-B fixture rule holds (no newly joined family reads a new source).

### Verification (commands run on the final tree, this session)

- `corepack pnpm exec tsc --noEmit` — **0 errors**
- `corepack pnpm lint` — **0 errors, 115 warnings** (= ≤115 budget; baseline unchanged)
- `corepack pnpm exec playwright test` — **182 passed / 0 failed** (`wave-B-d-fleet-final.log`), incl. my 8 new legs + the parallel agent's 6 legs + both previously-flaky legs
- Gates **green ×2**: `verify-enrichment-joins.mjs` (pre- and post-extension), `verify-federated-search.mjs`, `verify-exploration-media.mjs`, `verify-media-budget.mjs` (683 files/15,500; shipped 7,467/20,000; 610 manifest rows), `verify-expanded.mjs`, `verify-sweep-inventory.mjs` (181,537 + 49 families), `verify-refresh-sweep.mjs` (5 crons frozen — no 6th), `verify-recency-policy.mjs`, `verify-source-errors.mjs` (32 families / 202 cells)

### Files (mine, partition respected)

- NEW: `scripts/verify-enrichment-joins.mjs`
- EDITED: `lib/live/events.ts` (registry fields comment + address/placeId on the type), `public/events/venues.json` (address + validated placeId per institution), `app/events-workspace.tsx` (VenueFacts group, panel + dialog), `app/search-results.tsx` (cross-link sibling anchors), `lib/live/federated.ts` (v5 cross-links + venueForPlaceRecord), `scripts/verify-federated-search.mjs` (LEG 7), `app/places-workspace.tsx` (wikidata link-outs), `e2e/events-venues.spec.ts`, `e2e/federated-search.spec.ts`, `e2e/places-workspace.spec.ts` (8 new legs total), `.github/workflows/pr-validation.yml` + `README.md` (battery + prose, same change), `scripts/verify-sweep-inventory.mjs` (the one-line parity completion above)
- NOT touched: company/court/legal family files (parallel agent's), transit files, corpus files, `public/media/manifest.json`, `app/v2-model.ts` (guard pinned, not relaxed), `lib/live/refresh-groups.json`, cron config, watch surfaces

### Self-review (four lenses)

- **Completeness**: B-3/B-5/B-6 delivered with their e2e legs; B-7 written, extended to the parallel families' final call sites, RED-drift-proofed, battery-registered. D5 honored: no bulk imagery, no new media rows. The zero-Wikidata-fetch and no-name-join contracts are pinned by the gate, not just implemented.
- **Quality**: reuse over invention — the venue group reuses the `live-freshness`/`source-chip` idiom, cross-links reuse the existing `federated-row-source` anchor pattern, link-outs reuse `reader-links`; Romanian UI strings, English code comments; every enriched surface states its own join key in user-visible text.
- **Discipline**: strict partition held (my only out-of-partition edits are the two documented registration completions, both in B-7's battery-registration lane with truthful, evidence-anchored mappings); no cron, no new endpoint, no new source fetch, no runtime DDG, no payload logging; RED evidence preserved; no assertion weakened to green.
- **Testing**: 7 RED legs → GREEN (log inline above); the gate's detector proof covers the D4 failure shapes; both suspicious fleet legs reproduced green twice before being attributed to the dev-server environment; every verify command re-run ×2 with outputs read.

**Status: DONE** — B-3, B-5, B-6, B-7 delivered and verified; exit gate green (tsc 0, lint 0/≤115, e2e 182/182, family gates ×2). Wave B stands complete on the merged tree pending the parallel agent's STATUS write-up for B-1/B-2/B-4 (their code is landed and green on my final tree).
