# STATUS — wave2c (relay + precision session)

Branch: feat/wave2c-relay-precision · session dir: ssnc-agent-orch/2026/10/07/wave2c/

## Builder-3 Findings (cluster precision)

**Status: DONE — cluster-declutter UX shipped as design (a) passive lateral collision-offsets with hairline leaders; RED (4 legs failing on the live-bug numbers) → GREEN (13/13 map legs, full suite 96/0) after one root-caused mid-flight repair; tsc 0 · lint 0 errors / 117 warnings (baseline, none mine) · build green · fan-out + leaders proven painted by a raster probe + screenshots at compact zoom.**

### Design decision (stated, with the corpus evidence that forced it)

**Choice: (a) lateral collision-offsets with 0.5px leaders — pairwise, not clustered.** Rationale:
- **(b) spider is NOT materially simpler here** — it fights the PR #12 architecture: the svg-level nearest-pin resolver would need a new cluster-dot concept + overlay layer + dismiss handling + a second keyboard path; (a) instead *feeds* the existing resolver (click resolves against rendered = offset positions — "the whole point"), stays passive (no extra click — the map's model is one-click-to-navigate), and needed no new interaction state.
- **The naive clustering reading of "pins within render tolerance" is impossible on this corpus** — probes (`probes/probe-cluster-geometry.json`, `probe-cluster-sizes.json`, `probe-seeded-stars.json`) show that at the resolver's tolerance (≥12.5 svg units) Bucharest's old town chains into a **118-member transitive blob**, and even at 2-px-equivalent thresholds ~80 pins sit within one seed's neighbourhood (55–80-member "stars"). Fanning a city is absurd; the task's own framing ("pairs/trios fan out ±4-6px") is only honest for **strictly pairwise** handling.
- **Final shape**: greedy matching — all colliding pairs at the current zoom, tightest-first (distance asc, array-order tiebreak), **one pair per pin**, both pins displaced ±(TARGET−sep)/2 **along their own true axis** (the leader shows truth; the axis keeps the real-world bearing); then 2 bounded repair rounds for residuals (a displaced pin can land stacked on a third pin — the later-array pin is pushed single-sided to target, cumulative displacement capped). Constants, all in CSS px at the live render: collision stack threshold **2 px** (the pixel-ownership floor the existing ownedPixels contract already uses), target separation **11.5 px** (pairs displace each ≤5.75 px — the brief's "±4-6px"), cap **23 px**. Anchored in CSS px, so on-screen separation stays aimable at every zoom while the *geographic* deviation shrinks ∝1/zoom — the honest "converge toward truth" for stacks no zoom can separate.
- Corpus reality the design rides honestly: ~50 same-building pairs (0.01–0.09u: Curtea Veche↔Palatul Voievodal, Brukenthal↔Casa Albastră… — distinct catalog entries under different names) get the same pair-fan as genuinely-distinct pairs; merging them is corpus curation, out of this task's scope. Dense metro fields (2.5–5u gaps — pixel-resolvable, the Corvinilor class) never collide at any zoom and stay as the accepted status quo.

### Mechanism (shipped)

- `app/v2-charts.tsx` — module-level `declutterPins(pins, zoom, width)` (pure, deterministic: distance-sorted pairs, array-order ties, fixed 2 repair rounds); `RomaniaMap` gains an svg `ResizeObserver` width state (init 640), `useMemo(()=>declutterPins(pins,zoom,width),[pins,zoom,width])` — **offsets recompose per zoom transform, not just mount**; pins render at `translate(truth+offset)`; a `g.map-leaders` hairline group (`stroke="#8d9aab" strokeWidth={0.5} strokeLinecap round vectorEffect="non-scaling-stroke"`, pointer-events none) paints truth→rendered for every displaced pin **under** the pins; `resolvePin` resolves nearest against **rendered** positions (offset included).
- Leaders are fully self-contained SVG attributes (no CSS dependency) — proven by the raster probe painting them in a detached-svg context; `app/polish.css` nets **zero** change.
- Keyboard focus targets, `role=button`, `tabIndex=0`, aria-labels byte-identical (asserted in the spec); no countText surfaces changed — nothing new claims "2 locuri la aceeași adresă", the leaders themselves are the honesty device; reduced-motion irrelevant (static offsets, no animation added).
- `app/v2-model.ts` (the pin-set merge) needed **no change** — the 267-pin dedup set is the input as-is (inventory leg still 267).

### TDD cycle (RED → GREEN → repair → GREEN)

- **RED** (spec written first, run against the unmodified tree): 4/4 new legs failed for the right reasons — Ateneul↔Muzeul Colecțiilor rendered **0.577 css px apart** (the live-divergence class reproduced deterministically: the brief's "clicked Ateneul's circle center twice → Muzeul"), Peleș↔Pelișor **0.31 px**, no offsets at compact zoom, no leaders group.
- **GREEN (first pass)**: 4/4 passed + the 9 pre-existing map legs stayed green. **But the required screenshot probe caught a real defect**: Ateneul↔Muzeul rendered 103 px apart — one pin displaced 83 svg units, far beyond the 18u cap the algorithm enforces.
- **Root cause (offline repro `probes/repro-declutter.mjs` with per-step tracing, then fixed in one place)**: the repair loop ordered residual pairs by their **round-start** distance but applied pushes using **current** positions — after earlier same-round pushes moved pins, dividing the moved delta by the stale distance yielded a non-unit vector and the push ballooned by current/stale ratio (traced: an 8.1u push became a ~76u jump). Fix: recompute the pair geometry at application time (`cur` distance + unit vector), skip pairs an earlier push already separated. Offline verification: max displacement **17.86 ≤ cap 17.95**, zero pins over cap. The matching pass was already immune (the `taken` guarantee means participants are unmoved when their pair processes).
- **Regression hardened**: the leader leg now asserts every leader's length ≤ 19u (the cap invariant the bug violated).
- **GREEN (final)**: map spec **13/13** (9 pre-existing + 4 new), full suite **96/0**, all gates below.

### Verification (commands run this session, worktree root)

| Check | Result |
|---|---|
| `corepack pnpm exec tsc --noEmit` | exit 0, **0 errors** |
| `corepack pnpm lint` | **0 errors / 117 warnings** (≤117 baseline, exact; scoped eslint on `app/v2-charts.tsx` + `e2e/map-markers.spec.ts`: **0 problems**) |
| `corepack pnpm exec playwright test e2e/map-markers.spec.ts` | **13 passed** (2 originals + 7 cluster legs + mobile tap + 4 new declutter legs) |
| `corepack pnpm test:e2e` (full) | **96 passed / 0 failed** (90 pre-change + 4 mine + 2 from the parallel flights agent's spec growth, all green) |
| `corepack pnpm build` | exit 0; no tracked-file churn from the build (parallel agents' in-flight files untouched) |
| Pre-change baseline | full suite 90/90 green (run before my edits) |

### Probe evidence (artifacts in `ssnc-agent-orch/2026/10/07/wave2c/probes/`)

- **Geometry after the fix** (`probe-decluster-shots.mjs`): Ateneul↔Muzeul Colecțiilor rendered **5.21 css px** apart (both individually aimable, pre-fix 0.58); Peleș↔Pelișor **11.5 px** (the matched pair at exact target, each pin ±5.75 px — the brief's "±4-6px"); Peleș↔Sinaia 5.01, Pelișor↔Sinaia 6.51; 184 leaders at compact zoom; Peleș's leader shrinks 4.37u → **3.33u local at zoom 1.3**.
- **Convergence** (e2e leg, pinned): the Dobrogea pair Cetatea romană Adamclisi↔Tropaeum Traiani (1.1u, mutual-nearest in open country) is displaced at zoom 1 (~3.9u each), **smaller at zoom 1.3**, and **back at exactly its true position (leader withdrawn) at zoom 1.6** — offsets follow the zoom transform, converge to truth when zoom actually separates the pair; the never-separable trio's leader shrinks monotonically.
- **Screenshots**: `decluster-sinaia-compact.png`, `decluster-ateneu-pair-compact.png`, `decluster-sinaia-zoom1.3.png`. ⚠️ Disclosure: this model cannot view images, so "visible fan-out/leaders" is proven **programmatically** by `probe-paint.mjs` — the live SVG rasterized to a canvas: **178/184 leader lines paint** along their truth→rendered path (0.5px hairline sampled on a cross), and every named pin's dark disk inks around its rendered position (8-point ring sampling: 3–8/8 dark, ink present at all five). The PNGs stand as the human-readable artifact.
- The paint probe is also why leaders carry `stroke` inline: a detached raster never loads polish.css — hairlines must be element attributes to render everywhere (also more robust for print/canvas).

### Files modified (mine only)

- `app/v2-charts.tsx` — `declutterPins` (pairwise greedy matching + bounded repair, zoom/width-aware), `ResizeObserver` width, `offsets` memo, leaders group, pins at offset positions (labels follow the rendered side), resolver over rendered positions. +57/−6.
- `e2e/map-markers.spec.ts` — 4 new legs (`PIN_GEO` geometry table, `renderedPins`/`leaderLengths` helpers): pair separation + rendered-position clicks ×2 determinism; trio reachability + role/tabIndex unchanged; per-zoom recompose + convergence (Adamclisi pair → truth at 1.6, trio leaders shrink); hairline leaders anchored at truth with the ≤19u cap invariant. +178.
- `app/polish.css` — **net zero** (leader styling self-contained on the SVG elements).
- `app/v2-model.ts` — untouched (merge needs no change).
- Session probes: `probe-cluster-geometry.mjs/.json`, `probe-cluster-sizes.mjs/.json`, `probe-seeded-stars.mjs/.json`, `probe-declutter-final.mjs/.json` (the design-decision evidence), `dump-pins.mjs` + `repro-declutter.mjs` (the root-cause reproduction), `probe-decluster-shots.mjs`, `probe-paint.mjs`, `decluster-*.png`.

### Conventions applied

`.specify/memory/conventions.md` absent in this repo (checked before coding, as in the ux-friction pass); followed the repo's own conventions: business-rule comments only (the declutter semantics + the stale-distance rule are documented where they live), no ticket IDs in code, regression test first, one focused change per surface, English in code + Romanian in user-facing strings (the spec's aria-labels reuse the shipped Romanian labels unchanged).

### Self-review (four lenses)

- **Completeness** — every task bullet shipped: design choice stated with rationale; collision detector recomputes per zoom transform (useMemo deps + measured width, not just mount); resolver resolves against offset positions; keyboard targets and aria unchanged (asserted); the 9 existing map legs green; RED-first e2e for the Ateneul↔Muzeul pair (rendered-position clicks navigate to the right place, ×2 deterministic), the trio (all three reachable at compact zoom), and zoom convergence (leader lengths shrink, converging pair returns to truth); no new count text surfaced and none needed; no animation so reduced-motion is moot. Screenshots + paint proof delivered; the one thing I cannot do — view the PNGs — is disclosed and covered by the raster probe.
- **Quality** — deterministic end to end (distance sort, array-order ties, fixed rounds); constants documented in CSS px with their meaning; the algorithm is one pure function matching the file's style; the mid-flight defect was root-caused with an instrumented offline reproduction and fixed at the single cause (no chained tweaking — one fix, one verification), and the violated invariant became a permanent spec assert.
- **Discipline** — stayed inside my partition (v2-charts/polish-css/map-spec/probes; polish.css nets zero; v2-model intentionally untouched); parallel agents' in-flight files (flights, verify-court-links, verify-packed-seeds, workflows) never touched; probes read-only against my own dev server (started mine, killed only mine — 5173 left free).
- **Testing** — the legs exercise real shipped behavior through the real app (DOM-rendered transforms + CTM-mapped clicks), not mocks; RED proved the failure mode on the exact live-bug numbers; the suite covers determinism (same pixel twice), boundary (convergence to exactly 0), and invariant (cap) cases; full 96-leg suite green.

### Honest limits / follow-ups (non-blocking, registered)

1. Cross-pair separations in dense quarters (two pins each fanned with *different* partners) land at the repair floor (~2 px pixel-ownership) rather than the pair target — aimable and deterministic, but denser than a matched pair's 11.5 px; the Bucharest old-town core stays visually a tight multi-fan field at compact zoom (honest: ~50 same-building pairs + museum quarters; zoom-in collapses it to same-building fans only).
2. Residual collisions after 2 repair rounds are left as today's deterministic-nearest status quo (rounds/cap are the documented bound; the corpus's current state leaves no pinned-over-cap pin — asserted).
3. The home compact map's offsets pop in one paint after mount (ResizeObserver measures the real width post-hydration; SSR renders the pre-offset state — no hydration mismatch, verified by the green home/explore legs).
4. The corpus's different-name same-building pairs (Curtea Veche ↔ Palatul Voievodal Curtea Veche etc.) now render as two individually-clickable pins ±5.75px with a hairline between them — honest for two distinct catalog entries; if the product ever wants them merged into one visiting site, that is a v2-model merge-rule decision (name-uniqueness within ~50m), raised here, not taken.

**Status: DONE**

## Builder-4 Findings (weekly cadence redesign)

**Status: DONE — the three egress-blocked GitHub relays went weekly (Mon/Tue/Wed 03:00/04:00/05:00 UTC, workflow_dispatch kept on all three), every cadence claim in UI/workflow-log/README/verify-pins became the honest weekly word or a data-derived age, the staleness label now scales minutes→hours→days from `lastSuccessAt` for up-to-7+-day-old copies, and the standing Actions-minutes budget policy (worker-first, relay-weekly, <200 « 1.500/lună) is registered in README; RED-first (pins + two new e2e tiers failed on the unmodified tree) → GREEN across the whole chain.**

### Cron diff (the budget-decided redesign)

| Workflow | Before | After | Notes |
|---|---|---|---|
| `afir-refresh.yml` | `0 */2 * * *` (every 2 h) | `0 3 * * 1` | Monday 03:00 UTC; `workflow_dispatch` kept (manual tours stay available) |
| `bia-refresh.yml` | `0 * * * *` (hourly) | `0 4 * * 2` | Tuesday 04:00 UTC, **the browser-leg fall-through included in the weekly tour** |
| `flights-refresh.yml` | `*/15 * * * *` (every 15 min) | `0 5 * * 3` | Wednesday 05:00 UTC; `workflow_dispatch` kept |

Days spread deliberately (observability + politeness); only the cron line and the flights warning's interval clause changed in the workflows — step names carry no interval claims (verified), and `permissions`, exit-class handling and the browser leg wiring are untouched.

### Copy changes (honest + dynamic-from-data)

| Surface | Before | After |
|---|---|---|
| `app/flights-workspace.tsx` count label | „poziții de acum ~X **minute** · preluate prin intermediar extern, **la fiecare 15 de minute**" | „poziții de acum ~X minute/**ore**/**zile** · preluate prin intermediar extern, **săptămânal**" — `stalenessText(minutes)` scales the age from `lastSuccessAt`-derived `stalenessMinutes` (minutes <1 h, hours <24 h, days above; RO plurals `un minut/o oră/o zi`) |
| `app/flights-workspace.tsx` source note | „…tura de intermediar extern **la fiecare 15 de minute**; când rețeaua…" | „…tura de intermediar extern, **săptămânal**; când rețeaua serverului este primită de sursă, fluxul se citește direct." |
| `app/flights-workspace.tsx` BIA note | „Panoul zilei se reîmprospătează **în fiecare oră** prin intermediarul de reîmprospătare." | „Panoul zilei se reîmprospătează **săptămânal** prin intermediarul extern de reîmprospătare; momentul panoului este etichetat onest." |
| `app/flights-workspace.tsx` map pins | `description:'Imatriculare X'` | `+ ' · poziția observată la '+dateText(r.observedAt)` — each stale map position names its snapshot moment in the popup (the Tranzy precedent), so the surface stays honest for up-to-7±-day-old data |
| `lib/live/flights.ts` 429/503 note (+ comment) | „…prin tura de intermediar extern, **la fiecare 15 minute**; încearcă…" | „…prin tura de intermediar extern, **săptămânal**; încearcă din nou peste puțin timp." (the direct-read path may still recover, so the retry clause stays honest) |
| `scripts/relay-flights.mjs` `[final]` exit-2 line | „…reia la următoarea tură programată, **la fiecare 15 minute**" | „…reia la următoarea tură programată, **săptămânal**" |
| `flights-refresh.yml` warning | „…reia la următoarea tură programată, **la fiecare 15 minute**." | „…reia la următoarea tură programată, **săptămânal**." |
| `lib/live/refresh-groups.json` `transport.flights` reason | „…citește aceleași patru cereri fixe de acoperire națională **la fiecare 15 minute** și le predă…" | „tura de intermediar extern, **săptămânal**, citește aceleași patru cereri fixe de acoperire națională și le predă…" (README source table mirrors it byte-for-byte) |
| README (106, 204, 226–228, 230–234) | „la fiecare 15 minute", „poziții de acum ~X minute", old crons, old budget math | weekly wording everywhere; „poziții de acum ~X minute/ore/zile"; `0 3 * * 1` / `0 4 * * 2` / `0 5 * * 3`; no residual `*/15`/`0 */2`/hourly/orară/2.880/3.960 anywhere |

Non-relay „15 minute" mentions (README 136/148 — legal Retry-After ceiling, BNR TTL) are source-/cache-policy semantics, not relay cadences: left untouched. `bia-refresh`/`afir-refresh` warning texts and `relay-afir.mjs`/`relay-bia.mjs`/`fetch-bia-browser.mjs` log lines carry no interval claims — unchanged.

### Pin updates

| File | Pin | Before → After |
|---|---|---|
| `scripts/verify-relay-afir.mjs:25` | workflow cron assertion | `'cron: "0 */2 * * *"'` → `'cron: "0 3 * * 1"'` (message names the worker-first/relay-weekly rule) |
| `scripts/verify-relay-bia.mjs:41` | workflow cron assertion | `'cron: "0 * * * *"'` → `'cron: "0 4 * * 2"'` (message carries the new ≈10 relay-minutes/month budget rule; the old „3.960 vs 2.000 gratuite" math retired) |
| `scripts/verify-relay-flights.mjs:46` | workflow cron assertion | `'cron: "*/15 * * * *"'` → `'cron: "0 5 * * 3"'` (message: snapshot-age label between tours, never a numeric cadence promise) |
| Sweep pins | — | **Confirmed NOT relay-bound**: `verify-refresh-sweep.mjs` pins only the five Worker group crons (`0/7/14/21/28 0 * * *`), `verify-sweep-inventory.mjs` maps families→harnesses with no cadences — both untouched, both green |

### TDD cycle (RED → GREEN)

- **RED (pins)**: the three verify-relay cron assertions updated first and run against the unmodified workflows — all three exited 1 at exactly the weekly-cron assertion (`AssertionError … actual: false, expected: true`, captured in /tmp).
- **RED (labels)**: two new e2e legs written first — hours tier (`stalenessMinutes: 180` → „poziții de acum ~3 ore", `~180 minute` count 0) and the weekly-worst-case days tier (`stalenessMinutes: 8640` → „poziții de acum ~6 zile" + map-popup snapshot moment) — both failed on the unmodified tree for the right reason (the app rendered raw „~180 minute"/„~8640 minute"); the pre-existing 12-minute leg was updated honestly (mock copy + disclosure regex).
- **GREEN**: workflows + copy + registry implemented; all three relay gates pass full loopback batteries (13/15-incl-4-browser/9 legs); flights-view 9/9.
- **Mid-flight repair (root cause, one fix)**: the first GREEN run failed the disclosure assert with a **strict-mode violation — 4 matching elements**, because the weekly word now honestly appears in the error note, the count label, the source note and the BIA board. The asserts were anchored to the age label itself (`/poziții de acum ~X … intermediar extern … săptămânal/`) instead of loosened — the disclosure is asserted where it lives, not asserted weaker.

### Verification chain (commands run this session, worktree root)

| Check | Result |
|---|---|
| `actionlint` | exit 0, no findings |
| `node scripts/verify-relay-{afir,bia,flights}.mjs` | 0 / 0 / 0 — 13, 15 (11 + 4 browser legs, local chromium) and 9 legs green |
| `corepack pnpm exec tsc --noEmit` | exit 0, **0 errors** |
| `corepack pnpm lint` | **0 errors / 117 warnings** (≤117 baseline, exact; none mine) |
| Verify battery ×1 (25 scripts incl. Builder-2's wired `verify-court-links` + `verify-packed-seeds`) | **25/25 OK**; `verify-legal-pdf` = registered skip (pypdf absent locally — CI installs it; workflow's own skip path) |
| `corepack pnpm test:e2e` (full) | **98 passed / 0 failed** (Builder-3's 96 + my 2 new tier legs) |
| `corepack pnpm build` | exit 0; `lib/live/seed-snapshots.json` restored, tree clean of build churn |
| `node scripts/deploy.mjs --dry-run` | exit 0 |
| `node scripts/db-migrate.mjs --local` ×2 | run 1 exit 0; run 2 exit 0, **idempotent no-op** confirmed both times |

### Files modified (mine only, this session)

- `.github/workflows/afir-refresh.yml`, `bia-refresh.yml`, `flights-refresh.yml` — cron lines + the flights warning's interval clause; `workflow_dispatch` retained (asserted).
- `app/flights-workspace.tsx` — `stalenessText` + count label + source note + BIA weekly note + per-pin snapshot moment. (+9 net in my regions; Builder-1's label surfaces otherwise untouched.)
- `lib/live/flights.ts` — 429/503 relay note + its comment clause.
- `scripts/relay-flights.mjs` — `[final]` exit-2 line.
- `lib/live/refresh-groups.json` — `transport.flights` reason.
- `scripts/verify-relay-afir.mjs`, `verify-relay-bia.mjs`, `verify-relay-flights.mjs` — cron pins + budget-rule messages.
- `e2e/flights-view.spec.ts` — 12-minute leg updated honestly; +2 new tier legs (hours, weekly-worst-case days incl. map-popup snapshot-age). +78 lines mine.
- `README.md` — lines 106, 204 (verify-docs paragraph), 226–228 table, 230, 232, 234: weekly crons, weekly/age-tier wording, and the standing budget policy registration.

**Standing budget policy registered in README (line ~234):** „tot ce poate fi preluate de Worker rămâne pe Worker (gratuit, crons-urile Cron Triggers neschimbate), iar clasa blocată la egress — AFIR, BIA și avioane — merge săptămânal prin turele GitHub, desfășurate intenționat pe trei zile diferite… trei ture săptămânale ≈ 10 minute de relaie pe lună, iar împreună cu CI-ul depozitului (≈ 100–150 de minute pe lună) totalul stă sub 200 de minute pe lună — față de ținta de buget de maximum 1.500 de minute pe lună; vechimea copiilor servite se etichetează onest din date…, fără nicio promisiune de interval în interfață."

### Conventions applied

`.specify/memory/conventions.md` absent (as Builder-3 recorded); followed repo conventions: business-rule comments only (the `stalenessText` scale comment and the flights.ts relay-note comment document semantics where they live), no ticket IDs in code, Romanian in user-facing strings / English in code + assert messages, regression/RED-first for every copy-bound change (e2e tiers + verify pins), scope discipline: only the cadence-bearing surfaces in my partition (map cluster code, court-links/packed-seeds scripts and the previous builders' kingdoms untouched beyond the cadence lines).

### Self-review (four lenses)

- **Completeness** — crons weekly on all three with `workflow_dispatch` kept (diff-verified); every cadence claim I could find by exhaustive grep is now weekly or data-derived (`15 minute|15 de minute|în fiecare oră|la 2 ore|2.880|3.960` residual audit: zero relay hits; the two legal/TTL „15 minute" README mentions are non-relay and out of scope); age label covers minute/hour/day tiers incl. the >7-day missed-tour case (tier is unbounded in days); map pins carry the per-position snapshot moment; budget registered in README + STATUS.
- **Quality** — one pure function for the age scale, tested through the real DOM at all three tiers; asserts were tightened (anchored to the label) rather than weakened when multi-match surfaced; mocks mirror the real loader copy so the double stays faithful.
- **Discipline** — stayed inside the cadence partition; `verify-refresh-sweep`/`verify-sweep-inventory` verified NOT to pin relay cadences before declaring them out of scope; no workflow knobs touched beyond the cron + one warning clause; dev server: started and stopped by Playwright itself (5173 verified free afterward — Builder-3's discipline held).
- **Testing** — RED proved on the exact numbers (180 → raw „minute" rendered; 8640 same), GREEN covers determinism (multi-element disclosure anchored), boundary (tier thresholds 60/1440 via 12 min/3 ore/6 zile) and the worst case (weekly + missed tour); full suite 98/0 and 25-script battery green.

### Honest limits / follow-ups (non-blocking, registered)

1. `verify-legal-pdf` is a registered local skip (pypdf absent) — the workflow's own skip path prints the same notice in CI, where pypdf is installed.
2. The BIA worst case with the weekly cadence: a board copied Tuesday can serve up to ~6 days of an outdated „day board" — the surface discloses this via the weekly note + `momentul panoului` (already rendered); if product later wants a days-age label on the BIA side too (the flights-style `stalenessText`), that is a `flight-board` route change (serve `stalenessMinutes` from `state.lastSuccessAt` like `/api/flights` does) — raised here, not taken (the flights label was my assignment; the BIA claim I inherited said „în fiecare oră" and is now honest).
**Status: DONE**

## Builder-5 Findings (flights quadrant retry)

**Status: DONE — the flights relay tour now absorbs the source's rolling rate limit politely: the four coverage points stay sequential with a fixed ~1 s inter-point gap, and only the HTTP 429 pause is retried (same point, at most 2 extra attempts, delays ~2 s then ~5 s) while every other status keeps the single-attempt semantics and the fail-closed verdict is untouched (an exhausted pause still delivers nothing, exit 2). RED-first (both new harness legs proven failing on the unmodified tree) → GREEN 11/11 legs ×2 runs; tsc 0 · lint 0 errors/117 warnings (baseline, none mine); battery neighbors green; e2e untouched.**

### BIA browser-defeat registration

- **Evidence — the second weekly tour, run 37602759592 (2026-10-07, `bia-refresh`)**: the browser leg (`scripts/fetch-bia-browser.mjs`) drove the repo-pinned headless chromium through the airport board URL; the bounded challenge wait (`CHALLENGE_WAIT_MS_DEFAULT=45_000`, polled every 2.5 s) exhausted its 45 s window with the last navigation still answered **HTTP 403** — the airport's browser challenge did not clear for the headless session either. Plain server fetch was already rejected (the simple relay leg's registered class); the headless browser path is now rejected with the same measured evidence.
- **Classification — BIA joins the registered relay classes as `source-defends-all-automated-paths`**: `afir.ro` rejects by egress class, `adsb.lol` rate-limits by rolling window (this session's flights evidence, first tour run 37602748205), and the airport board defends every automated path we are willing to run. Each class keeps its own honest surface; none is assumed — all probe/tour-proven.
- **The boards keep the honest degrade note**: the reader serves the last published copy (or the „nu a fost încă preluat" honest note) with the snapshot-aged label; nothing masks the failure and no fake board is ever served.
- **The weekly tour keeps trying**: the `bia-refresh` tour stays wired (Tuesday 04:00 UTC, `workflow_dispatch` kept) with the browser-leg fall-through in place — if the airport ever stops challenging automated sessions, the tour completes without code changes; exit 2 stays a recorded warning, not a failure.
- **Registered decision — NO further escalation from us**: no residential proxies, no browser-fingerprint spoofing, no challenge-solving services, no third-party scraping infrastructure. A public-data convenience feature does not justify an arms race against the airport's bot defense; the honest degrade (stale board + honest label + weekly retry) is the contract we keep. Decided and registered here; not open to quiet reversal.

### Retry design (the evidence and the choice)

**Evidence (first weekly flights tour, run 37602748205)**: the GitHub runner is *welcome* at adsb.lol — three coverage points answered HTTP 200 with real boards (191 MB-class) — but the fourth back-to-back hit, the SE quadrant point (44.5, 28.25), answered **HTTP 429**: a rolling-window rate limit on rapid consecutive requests, not the AFIR egress class (the runner does not run on the Workers network, and the source demonstrably serves it).

**Choice — sequential + gap + bounded 429-only retry (implemented, not parallel+ hammer retry)**: the four points were already fetched sequentially (a `for…of` with `await`, back-to-back ~1.5 s apart); the evidence (429 on the 4th *sequential* hit) says rolling window, so the polite shape is *request + pause*, never a burst and never a parallel fan:
- `POINT_GAP_MS=1_000` — a fixed ~1 s pause before each non-first point.
- Only `RETRY_STATUS=429` retries the **same** point, at most `RETRY_DELAYS_MS=[2_000,5_000]` extra attempts (increasing); each re-fetch reuses the same bounded 12 s fetch.
- Every other status (403/500/503/…), network error, oversized body: exactly one attempt — unchanged semantics (pinned by the pre-existing legs, still green).
- The tour verdict is untouched: **all four boards or nothing** („fără cadran tăcut") — the retry only absorbs a transient pause; an exhausted 429 still reports the fail-closed line and exits 2 with zero delivery (pinned by the new exhaustion leg).
- Worst-case tour runtime ≈ 205 s (4 × (3 × 12 s + 7 s) + 3 s gaps + 30 s POST) — comfortably inside the workflow's existing `timeout-minutes: 10`; **no workflow change needed**.
- Scope honesty: the retry cannot fix a *sustained* rate limit (all three attempts 429 → exit 2, retried at next Wednesday's tour) — absorbing bursts is exactly the scope. It uses fixed delays rather than honoring a `Retry-After` header the source might send: a weekly tour should not sleep on a publisher-set unbounded delay.

### TDD cycle (RED → GREEN → no refactor needed)

- **RED (harness first — both new legs added to `verify-relay-flights.mjs` before any relay edit, runs against the unmodified tree)**:
  - *Absorbed-pause leg* (point 4 answers 429, 429, then 200 → the tour must succeed): failed **`2 !== 0`** — the unmodified relay exits 2 on the first 429.
  - *Exhausted-pause leg* (point 4 answers 429 on every attempt → the tour must still fail closed): failed **`1 !== 3`** — the unmodified relay attempts the point exactly once. Proven in a second pass with the two legs temporarily swapped (the harness aborts at the first failing leg, so each new leg's RED was captured in its own pass with the other leg ahead of it); the file was restored to the final order afterwards.
  - The timing asserts (inter-point gaps ≥ 900 ms, retry delays ≥ 1900/≥ 4900 ms, ≥ 7 s elapsed, arrival-order pins) live inside the absorbed-pause leg after the exit-status assert, so their RED is subsumed by the leg's RED — they first executed at GREEN (documented, not claimed as separately RED).
- **GREEN (`relay-flights.mjs`)**: exported `POINT_GAP_MS`/`RETRY_STATUS`/`RETRY_DELAYS_MS` with the business-rule comment carrying the first-tour evidence; module-level `pause` helper; the per-point loop with fixed pacing and the bounded retry. First run: 10/11 — one failing assert, **root-caused**: my regex `/reîncer/` counted 3 because the honest success report „după 2 reîncercări" matches the same stem; the behavior was right, the anchor was wrong. Fixed to `/a cerut o pauză/g` (the pause notice itself — 2 in both legs); tightened, not weakened. 11/11 after the one fix.
- **REFACTOR**: none needed — the implementation matched the file's dense shape on the first pass (retry inlined per point, `pause` module-level beside `line`/`cause`); confirmed green twice + full chain below.

### Verification chain (commands run this session, branch `fix/flights-quadrant-retry`, loopback only — zero external fetches)

| Check | Result |
|---|---|
| Pre-change baseline (before any edit) | tsc exit 0 · lint 0 errors/117 warnings · `verify-relay-flights` 9/9 legs exit 0 |
| `corepack pnpm exec tsc --noEmit` | exit 0, **0 errors** |
| `corepack pnpm lint` | **0 errors / 117 warnings** (≤117 baseline, exact; none mine) |
| `node scripts/verify-relay-flights.mjs` ×2 | **exit 0 both** — 11/11 legs (9 pre-existing green unchanged + 2 new), static retry-constant pins included |
| `node scripts/verify-sweep-inventory.mjs` | exit 0 (family→harness map intact) |
| `node scripts/verify-refresh-sweep.mjs` | exit 0 (relay families still excluded from the cron sweep — the relay stays the single writer of its freshness) |
| `node scripts/verify-model-contracts.mjs` | exit 0 |
| `node scripts/verify-source-errors.mjs` | exit 0 — 196 cells / 31 families incl. the flights/adsb relay cells (route side untouched, still green) |
| `node --check` both modified scripts | ok |
| E2E suite | **untouched** — audit: no e2e leg pins `relay-flights.mjs` (grep across `e2e/`): `flights-view.spec.ts` pins the reader-side note copy + staleness labels in `lib/live/flights.ts` and the `/api/flights` response shapes — surfaces this change never touched (the runner script is CI-only, its output never renders in the UI) |

### Files modified (mine only)

- `scripts/relay-flights.mjs` — retry/pacing constants (exported, business-rule comment with first-tour evidence), `pause` helper, per-point fixed gap + bounded 429-only retry loop with honest pause/recovery/exhaustion log lines; fail-closed verdict and exit classes unchanged (+28/−9).
- `scripts/verify-relay-flights.mjs` — header contract note; arrival timestamps on the double's source GETs; `throttlePoints` double capability; 2 new legs (absorbed pause: order, gaps, both retry delays, pause-notice logs, recovery report, single POST with byte-for-byte boards; exhausted pause: 3-attempt bound, others exactly 1 attempt, zero delivery, fail-closed line); 3 static pins (`POINT_GAP_MS`, `RETRY_STATUS`, `RETRY_DELAYS_MS`); final summary + `legs:11` (+37 net).
- `ssnc-agent-orch/2026/10/07/wave2c/STATUS.md` — this section (BIA registration + findings).

### Conventions applied

`.specify/memory/conventions.md` absent (as Builders 3–4 recorded); repo conventions followed: business-rule comments only — the rolling-window politeness rule is documented where it lives (Romanian, matching the script's own comment style), no ticket IDs in code, English in code + assert messages with Romanian user-facing log strings, RED-first (harness legs before implementation, both legs' failure captured on the unmodified tree), scope discipline (only the relay script + its harness + this session file; no workflow, UI, loader or route surface touched).

### Self-review (four lenses)

- **Completeness** — 429-only ×2 retry with ~2 s/~5 s increasing delays ✓; every other status single-attempt ✓; fail-closed invariant unchanged and pinned (exhausted leg: 0 POSTs, exit 2) ✓; sequential pacing implemented and documented with the deciding evidence ✓; harness RED-first with exactly the two required legs + honest static pins ✓; BIA registration appended with the run-37602759592 evidence ✓; workflow untouched with the worst-case runtime computed inside the existing 10-minute bound ✓.
- **Quality** — constants exported and pinned; the retry loop is one bounded `for` in the file's own density; logs honest at every step (pause notice with attempt ordinal and delay, recovery reports its retries, exhaustion keeps the fail-closed line); no scaffolding, no TODOs.
- **Discipline** — two scripts + the session STATUS only; loopback doubles on 127.0.0.1, zero external fetches; the temporary leg swap used to capture the second leg's RED was reverted immediately and is disclosed above.
- **Testing** — the legs drive the real relay subprocess against the real loopback double; server-side arrival timestamps prove the delays actually elapse (not instant-pass); the one mid-flight fix was root-caused (wrong anchor, not wrong behavior) and tightened the assert.

### Honest limits (registered)

1. The BIA 45 s/403 evidence (run 37602759592) is recorded from the tour's workflow log summary given to this session; no local artifact of that run exists — the source of record is the Actions log, as for the flights 429 (run 37602748205).
2. Whether adsb.lol's real rolling window clears at this pacing is confirmed only by the next real weekly tour (Wednesday 05:00 UTC) — the loopback harness freezes the shape we send, not the source's window; same honest class as the runner-reputation note.
3. A sustained rate limit (all three attempts 429) still exits 2 — by design; the retry absorbs bursts, not outages.

**Status: DONE**
