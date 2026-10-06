# Implementation Plan

## Feature
Sweep & Federated Search — exhaustively verify and repair every category/object, add all-category federated search with a unified results list, animate the weather section.

## Goal
Freeze the foundation: every object in the app renders correctly, its source check works (or fails honestly with the right message), and search finds everything from everywhere — before building Watch on top.

## North Star (recorded, NOT this session's scope)
User's product vision, verbatim intent: 4 return motives — „Pentru mine azi" (personalized local feed), „Urmărește" (Watch: follow dosar/firmă/act/localitate, notify only on change — named the central growth function), „Verifică" (CUI/dosar/lege/localitate → unified answered response with source + verification date), „Explică-mi" (official data turned into clear explanations, never hiding the source). Differentiator: „Am verificat 7 surse. Asta e ce contează pentru tine. Asta s-a schimbat. Aici e sursa oficială." Next session: /brainstorm for Watch.

## Requirements
- **R1 Exhaustive sweep**: enumerate every category → subcategory → object/article; per object verify (a) rendering: alignment, no oversized whitespace, no raw programmatic field names, expected images present; (b) model correctness: dosar structure (fond–apel–recurs), legislative structure, metadata fields; (c) source verification via parity protocol (direct source / local dev loader / live worker), each failure classified OUR-BUG (fix it) / SOURCE-BLOCKS-EGRESS (honest degrade: last valid copy + retry + direct-to-source link + explanation — already shipped for AFIR class) / SOURCE-DOWN (honest degrade, retry budget).
- **R2 Federated search**: a search term („școli", „avocați", „notari", „sala", place, CUI, dosar…) matches across ALL categories/workspaces simultaneously; results display as ONE list grouped by category with counts; each entry navigates to the object inside its own category workspace; existing semantic chips and router behavior preserved.
- **R3 Weather life**: animations and attractive elements in the weather section (transitions, icon motion, ambient effects) implemented within the existing design tokens and respecting reduced-motion.
- **R4 No regressions**: e2e suite (currently 28/28) stays green and grows to cover federated search + repaired defects; verify battery stays green; tsc 0 errors; lint 0 errors (warnings baseline 114 unchanged or better); build + deploy dry-run + db-migrate idempotency clean.

## Advocate Review
Status: Skipped — design pre-approved by the user in the /build clarifying exchange (prompt.md Q2: „Nu mă interesează ce alegi. Aprob tot."), no ADVOCATE-REVIEW.md in the session dir. Key decisions incorporated: full delegation of design choices within the 3-component scope. External dependencies: none.

## Architecture (verified against the tree by Architect)
- **Sweep tooling** extends the `scripts/verify-*.mjs` transpile-import harness family: (1) a new offline registry-completeness gate (`verify-sweep-inventory.mjs`), (2) `verify-source-errors.mjs` families table extended from 6 to ~15 families (paths: directory×4, lawyers/ifep, legal/law, feeds/afir, feeds/alt kinds, localities/siruta, events, stories, cinema, transport-realtime) with the established mock matrix + `--live` parity (dev route → direct ≤2 ONLY on surfaced app-route errors → optional deployed-worker leg via `AFLIVRA_VERIFY_DEPLOYED_BASE`, our own infra, needed to detect the SOURCE-BLOCKS-EGRESS class — that is exactly how AFIR was found). Budget-capped by construction, as today.
- **Federated search is CLIENT-SIDE fan-out over existing validated routes — NO new backend route** (no `/api/search`). Today's hero/explore `search()` routes to the explore view which seeds `PlacesWorkspace` + `LiveCatalog` with `q`; the federated layer adds a fan-out to the already-searchable routes (`/api/places` local-all index, `/api/catalog`, `/api/lawyers` ≥3 chars, `/api/directory` ×4 kinds, `/api/domain?kind=stiri` + `kind=agricultura`, dosar-postgres only when the query matches the dosar-number regex, CUI-numeric shortcut unchanged) + the client-side editorial gallery, rendered as ONE grouped list. Result→object navigation reuses `go(view,id,query)` + a NEW validated `tab` hash param + small `initialQuery` seed props on the few workspaces that lack one (Lawyers, RecordBrowser, Legal courts, Stories). Grouping order follows the domain registry (`v2-model.domains`); counts via `countText`.
- **Weather animations are pure client/CSS** on the existing `.weather-scene` family (workspaces.css:48-54) + the already-computed `background` condition class in `WeatherStations`, gated by BOTH `prefs.motion` (`.v2.no-motion`) and `prefers-reduced-motion` (matchMedia + blanket `@media` overrides), following the `aflivra-*` keyframes precedent.
- **Constraint carried from the previous session**: a NEW top-level lib module breaks the closed stub resolvers in `verify-location.mjs` / `verify-search-ui.mjs` — the federated family layer lives in `lib/live/query.ts` or (if split) BOTH resolver lists are extended in the same change (conventions.md records this).

## The Sweep Inventory (concrete, enumerated from the registries — not guessed)
**App routes (15)**: home, explore, map, place, dashboard, company, money, domain, compare, recommendations, saved, planner, about + the public `/catalog` page (app/catalog/page.tsx).

**Domains (16) × sections (46 tabs + auto 'data' tab each)** from `v2-model.domains` + `topicSections` (dashboard-topics.ts):
| Domain | Sections (subcategories) |
|---|---|
| local | places, weather, transport, registry |
| vreme | weather |
| sanatate | places, health, pharmacies, hospitals, news |
| educatie | places, schools, news |
| transport | network, vehicles, arrivals, alerts, places, news |
| cultura | places, events, selection |
| filme | cinema, places, films |
| povesti | stories |
| bani | currency, places |
| firme | companies, places, compare |
| munca | news, places |
| justitie | legal, lawyers, places, news |
| energie | calculator, places, news |
| agricultura | news (AFIR), places |
| mediu | places, weather |
| stiri | news (7-feed fan-out), places |

**Places (OSM) inventory** (public/places/manifest.json): 178,868 objects; 16 category indices (local-all, agricultura, bani, cultura, educatie, energie, filme, firme, justitie, local, mediu, munca, sanatate, stiri, transport) + ~70 subcategories incl. **Avocați**, **Notari**, Școli-linked (Grădinițe/Colegii/Universități), Săli de concerte — the user's query examples are all places subcategories.

**Catalog categories (14 + 'alte')** from catalog-categories.ts (CKAN query per category); **directory kinds (4)**: schools (datastore, server-paged), health/pharmacies/hospitals (CNAS, full-copy); **transit modes (5)**: network, vehicles, arrivals, alerts; **feed kinds**: stiri-fanout (7 hosts), agricultura (afir.ro — KNOWN SOURCE-BLOCKS-EGRESS), filme (Wikidata), per-domain news; **cinema sites** (id/dated, city-scoped); **events** (ODEON, coverage-scoped); **stories** (Wikisource by id, corpus list client-side); **courts registry** (public/courts/institutions.json).

**Source families (parity universe)**: bnr, weather.anm, forecast/open-meteo, weather.alerts, company.anaf (+wikidata), catalog.ckan/data.gov.ro, directory.schools, directory.cnas×3, lawyers/ifep, legal.courts/portalquery.just, legal.laws, feeds×7, afir.ro, films/wikidata, stories/wikisource, events/odeon, transport.gtfs/tpbi, transport.realtime, localities/siruta, cinema, resources/datastores — registry: refresh-groups.json (5 groups / 21 members + seedBacked + onDemand).

**Exhaustive-vs-sampled rule** (this is what „every object" satisfied means within the user's own budget discipline): snapshot-backed corpora (places 178,868, catalog inventory, CNAS ×3, SIRUTA, legal snapshots, transport GTFS, stories corpus, cinema sites) are verified **offline in full** by the model-contract harness (T1.4). Source-backed paged families (schools datastore pages >0, lawyers beyond cached queries, feeds' live polls) are verified structurally + page-0 sampled + parity probes — literally walking every upstream page would violate the ≤2-direct-fetches/family cap the user themselves imposed after the 429 storms.

## Tasks (final — owners, files, tests)

### Phase 1: Sweep harness + inventory (DevOps tooling · UI/UX + Validator probing · Builder repairs)
- [ ] T1.1 Sweep inventory gate (assigned: DevOps)
  - Test: write-then-run `node scripts/verify-sweep-inventory.mjs` (RED pass surfaces the real registry gaps)
  - Implement: scripts/verify-sweep-inventory.mjs (new) — offline enumeration + completeness asserts: topicSections ids ↔ DomainWorkspace content() ids ↔ components; catalogCategories ↔ catalogTopic mapping; places manifest categories ↔ domain ids; directories kinds; transit modes; feedConfigs kinds + afirLoader + filmsLoader; cinema sites; institutions registry; refresh-groups members ↔ loader keys. Wire into pr-validation.yml battery + README runbook (same change).
  - Verify: exit 0; battery line green in CI job list
  - Files: scripts/verify-sweep-inventory.mjs, .github/workflows/pr-validation.yml, README.md
- [ ] T1.2 Parity classifier extension to ~15 families (assigned: DevOps)
  - Test: mock-matrix cells per new family (500×3-retry, 429, timeout, malformed, success, warm-500) RED→GREEN
  - Implement: scripts/verify-source-errors.mjs — extend `families` (directory.schools, directory.cnas:health/pharmacies/hospitals, lawyers/ifep, legal/law, localities/siruta, feeds/afir pre-classified known-class, feeds/filme, events/odeon, stories/wikisource, transport.realtime, cinema) + add the deployed-worker parity leg (`AFLIVRA_VERIFY_DEPLOYED_BASE`, skipped-with-note when unset — required leg for SOURCE-BLOCKS-EGRESS detection)
  - Verify: `node scripts/verify-source-errors.mjs` exit 0, families≈15; `--live` run once at T4.1
  - Files: scripts/verify-source-errors.mjs
- [ ] T1.3 Rendering audit battery (assigned: UI/UX)
  - Test: probe script driving every surface (15 routes + 16 domains × their sections + 'data' tabs at 390 & 1280)
  - Implement: session-dir `probe-sweep-render.mjs` (probe-*.mjs precedent; screenshots+JSON to session dir, NOT committed): overflowX=0, brokenImages=0, console/pageerror=0, raw-programmatic-field scan, whitespace-gap heuristic, headings/labels, countText grammar re-derive, images where expected — findings register into session STATUS (classified OUR-BUG/DATA/SOURCE)
  - Verify: findings register written; every failure numbered + classified
  - Files: session-dir probe + findings; NO app/ commits from this task (fixes are T1.5)
- [ ] T1.4 Model-contract audit — offline, every object (assigned: Validator)
  - Test: `node scripts/verify-model-contracts.mjs` RED pass = the real model gaps
  - Implement: scripts/verify-model-contracts.mjs (new, transpile-import harness) — full-corpus invariants: ALL 178,868 places (fields, coords, category labels not raw ids); catalog inventory datasets; CNAS title-extraction fallbacks; SIRUTA items; dosar fond<apel<recurs rank + evidence-only references (lib/court-history.ts invariants on seeded corpora); legislative consolidation asOf/verified shape (legal snapshots); forecast current/hourly/daily+units shape; stories/cinema/events corpus shape. Battery + README line in same change.
  - Verify: exit 0 after fixes land in T1.5 (findings register until then)
  - Files: scripts/verify-model-contracts.mjs, .github/workflows/pr-validation.yml, README.md
- [ ] T1.5 Fix OUR-BUG findings (assigned: Builder-B)
  - Test: per-finding regression (e2e assertion or verify-script assert) BEFORE the fix (TDD rule for bug fixes)
  - Implement: whatever T1.3/T1.4 findings name (rendering alignment, raw field names, missing images, dosar/model defects) — batch by file; page.tsx/domain-workspace fixes ride Builder-B's T2.3 ownership
  - Verify: the failing test flips green; full e2e stays green
  - Files: per findings register (assigned at finding time)
- [ ] T1.6 Drift-trio repair (assigned: DevOps)
  - Test: `node scripts/verify-expanded.mjs && node scripts/verify-legal-records.mjs && node scripts/audit-controls.mjs` exit 0
  - Implement: the three documented recipes (source-html temp-rewrite in verify-expanded; source-xml in verify-legal-records; falsy pin in audit-controls) — wave-2 STATUS has the exact patterns; CI continue-on-error flags stay as-is this session (hardening them is workflow-owner follow-up)
  - Verify: all three exit 0 locally, twice
  - Files: scripts/verify-expanded.mjs, scripts/verify-legal-records.mjs, scripts/audit-controls.mjs

### Phase 2: Federated search (API specialist + Builder-B; page.tsx serialized under ONE owner)
- [ ] T2.1 Federated family layer + harness (assigned: API)
  - Test: `node scripts/verify-federated-search.mjs` RED→GREEN (fixture payloads per family: item shape, grouping, countText counts, min-3-chars (lawyers), dosar-regex gating, CUI shortcut)
  - Implement: federated family descriptors + response→item mappers — in `lib/live/query.ts` (preferred: closed-resolver constraint) or new module + extend BOTH stub-resolver lists in the same change. Families v1: places/local-all, catalog, lawyers, directory×4, feeds/stiri + feeds/agricultura, dosare (regex-gated POST), editorial gallery (client), CUI numeric (existing shortcut surfaced in its group), stories (client corpus list — verify loadability at build; defer-with-rationale if not client-loadable). Cinema/events excluded v1 (locality/day-scoped, not national corpora — recorded, not silent).
  - Verify: exit 0; battery + README line
  - Files: lib/live/query.ts (or lib/live/federated.ts + the two resolver lists), scripts/verify-federated-search.mjs, .github/workflows/pr-validation.yml, README.md
- [ ] T2.2 Grouped results list UI (assigned: Builder-B)
  - Test: e2e/federated-search.spec.ts RED legs first (T2.4)
  - Implement: app/search-results.tsx (new, exports `FederatedResults`) + page.tsx explore view renders it above the gallery when q≠''; ONE list, group headers = category label + countText(n,'rezultat','rezultate'), rows title+subtitle+snippet+source name; per-group busy (existing shimmer), honest per-group error, global honest empty (Empty pattern); chips + existing sections preserved below
  - Verify: tsc/lint + e2e legs green
  - Files: app/search-results.tsx, app/page.tsx, app/workspaces.css (row styles only if tokens demand)
- [ ] T2.3 Navigation + workspace seeds (assigned: Builder-B)
  - Test: same spec's click-through legs
  - Implement: validated `tab` hash param (page.tsx sync(): `p.get('tab')` accepted only against topicSections[category] registry); go() gains optional tab write; DomainWorkspace gains initialTab + passes initialQuery to sections; seed props added: LawyersWorkspace({initialQuery}), RecordBrowser({kind,initialQuery}), LegalWorkspace({initialQuery,initialCourtNumber}), StoriesWorkspace({initialQuery}) (LiveCatalog/PlacesWorkspace already accept); catalog results seed LiveCatalog category via existing category prop path; dosar result seeds the courts form; CUI → existing company shortcut unchanged
  - Verify: home-smoke chip tests + locality-instant stay green (router regression zero)
  - Files: app/page.tsx, app/domain-workspace.tsx, app/lawyers-workspace.tsx, app/record-workspace.tsx, app/legal-workspace.tsx, app/stories-workspace.tsx
- [ ] T2.4 Federated e2e (assigned: Validator)
  - Test: the spec IS the test — RED first against unmodified tree
  - Implement: e2e/federated-search.spec.ts ~10 legs: 'sala' from home hero → grouped list (Locuri incl. Sala-object, Catalog, Școli/registre matches); 'avocați' → lawyers + places groups; 'notari' → places group (Notari subcategory); CUI numeric → company shortcut pinned; click places → domain places tab seeded + object visible; click lawyers → justitie/lawyers seeded; click catalog dataset → LiveCatalog seeded; zzqxv → honest global empty; 2-char → lawyers group degrades honestly; 200+ chars → boundary rejection honest
  - Verify: full suite 28 + new legs green
  - Files: e2e/federated-search.spec.ts

### Phase 3: Weather animations (UI/UX + Builder-A)
- [ ] T3.1 Weather animation design within tokens (assigned: UI/UX)
  - Test: design note in session STATUS (tokens audit: existing aflivra-* keyframes family + v2.css palette)
  - Implement: animation set decision on the EXISTING hooks: scene ambient per `background` class (rain streaks / snow drift / clear-night stars / clear-day glow), temperature re-mount transition on geo/refresh re-key, metric-chip icon micro-motion (metricIcon set), home pulse button subtle float (CSS-only — avoid page.tsx churn), gated by prefs.motion + prefers-reduced-motion
  - Verify: tokens-only assertion (no new colors/patterns outside v2.css variables)
  - Files: session-dir design note; no repo files yet
- [ ] T3.2 Implement weather animations (assigned: UI/UX implements the CSS seam; Builder-A any component markup)
  - Test: e2e/weather-motion.spec.ts legs (T3.3) RED where applicable
  - Implement: app/workspaces.css keyframes + layer styles beside .weather-scene; app/weather-workspace.tsx ambient layer markup keyed off the existing `background` var; `@media(prefers-reduced-motion:reduce)` + `.v2.no-motion` gates for every new keyframe (blanket rules cover only `.v2`-scoped children)
  - Verify: probe battery 390+1280 (probe-after precedent): overflowX=0, no console errors, no layout regressions; reduced-motion emulation → no animation-name/transform effects
  - Files: app/workspaces.css, app/weather-workspace.tsx
- [ ] T3.3 Weather-motion e2e (assigned: Validator)
  - Test: the spec IS the test
  - Implement: e2e/weather-motion.spec.ts ~3 legs: ambient layer present per rendered condition text; `page.emulateMedia({reducedMotion:'reduce'})` → computed animation none; prefs-sheet motion toggle off (`.no-motion`) → same
  - Verify: suite green
  - Files: e2e/weather-motion.spec.ts

### Phase 4: Verification + ship (DevOps + Validator)
- [ ] T4.1 Full chain (assigned: DevOps)
  - Test: ordered chain, stop-and-report on failure (verification contract: fix nothing here)
  - Implement: nothing — run: tsc → lint (0 errors, warnings ≤114+no-new) → full verify battery (now incl. sweep-inventory, model-contracts, federated-search, extended source-errors, drift trio) → verify-source-errors `--live` parity once vs local dev + deployed-worker leg → e2e full suite (28 + ~13 new) → build → `git checkout -- lib/live/seed-snapshots.json` → deploy --dry-run → db-migrate --local ×2 → results table into session STATUS
  - Verify: every gate exit code recorded in STATUS
  - Files: session STATUS (chain table)
- [ ] T4.2 Session wrap (assigned: Validator)
  - Test: coverage accounting (baseline 28 → final count with named deltas)
  - Implement: session STATUS final summary: findings register closed (every finding fixed / classified-with-class), files-touched per owner, cross-agent cleanliness check (`git diff` per wave)
  - Verify: STATUS complete; no uncommitted stray files outside session dir
  - Files: session STATUS

## Quality Targets

| Target | Value |
|--------|-------|
| e2e suite | 28/28 baseline green, grows to ~41 (federated ~10 + weather ~3 + repair regs) |
| Verify battery | all hard gates green incl. NEW sweep-inventory + model-contracts + federated-search; sweep scripts in CI DEFAULT mode |
| tsc / lint | 0 errors / 0 errors (warnings ≤114, no new) |
| Integration | build + deploy --dry-run + db-migrate ×2 idempotent |
| Source budget | ≤2 direct fetches per source family, only for surfaced failures (unchanged discipline) |
| Reduced motion | every new animation gated by BOTH prefs.motion and prefers-reduced-motion |

## Implementation Standards
- TDD for the query layer and sweep classifier (failing test first)
- No scaffolding: every fix fully functional
- Playwright e2e via existing harness (no browser MCP — dead this session; use @playwright/test locally, reuseExistingServer)
- macOS discipline: no `timeout`, no rm -rf on $HOME, corepack pnpm only, build → restore seed-snapshots
- New lib module ⇒ extend verify-location.mjs + verify-search-ui.mjs resolver lists in the SAME change (closed-resolver constraint)

## Specialists Recommended (finalized per trigger table)
- [x] **UI/UX** — triggered: weather animations (T3.1/T3.2), grouped list design (T2.2 review), rendering audit battery (T1.3)
- [x] **API** — triggered: federated family layer contract (T2.1) — no new endpoint; the fan-out consumes existing validated routes; reviews the tab-param + seed-prop contracts
- [x] **DevOps** — triggered: sweep harness + CI battery + parity legs + drift trio (T1.1/T1.2/T1.6/T4.1)
- [ ] **Performance** — conditional advisory, NOT dispatched: fan-out is ~8 debounced requests (350ms) to our own cached routes; dispatch ONLY if T4.1 shows fan-out latency/retry-storm symptoms (useSource poll semantics over-many families)
- [ ] **Security** — NOT triggered: no new endpoint, no new trust boundary (client text flows to existing routes that validate length/charset at the boundary; q ≤200); one builder checklist item: the new `tab` hash param MUST be validated against the topicSections registry before use (same class as every other registry-validated param) — recorded in conventions + T2.3

## Coordination
Mode: Markdown session (no tracker)
Session Ticket: none
Label: n/a

## Coordination Mode
Mode: SUBAGENTS
Reason: single TS stack, well-understood codebase, task-parallel; page.tsx + domain-workspace.tsx serialized under Builder-B for the whole session (T1.5-page fixes + T2.2 + T2.3 share them); scripts/ serialized under DevOps
**Complexity Score: 4/10** (raised from preliminary 2/10 — justified: 62 domain surfaces + 15 routes to sweep, findings-driven T1.5 variance, two new router surfaces (tab param + federated list) with regression-sensitive existing specs; still task-parallel with disjoint ownership and every convention documented from the previous session)

## Feasibility Flags ( Architects' findings — flag, not decide)
1. **Notaries as a professional registry do not exist** — „Notari" exists only as an OSM places subcategory (sweepable/searchable); a UNNPR notary registry would be a NEW data source (out of scope; user decision for a later session)
2. **Cinema/events excluded from federated v1** — locality/day-scoped corpora with no national q contract; reachable via their workspaces' internal search (user decision if inclusion is wanted)
3. **Stories family**: /api/story is id-only (Wikisource); federated stories = client corpus list IF loadable client-side — verified at build in T2.1; defer-with-rationale otherwise
4. **„Every object" interpretation** is bounded by the user's own budget discipline: full offline verification for snapshot-backed corpora (178,868 places included), structural + sampled + parity for source-backed paged families (walking every upstream page would violate the ≤2-direct-fetches rule)

## Constitution Reference
Global agent rules (no project CLAUDE.md); repo conventions from v1 + search-ux-validation-pass sessions (STATUS.md history is canonical — distilled into this session's conventions.md)

## Session Directory
ssnc-agent-orch/2026/10/06/sweep-federated-search
