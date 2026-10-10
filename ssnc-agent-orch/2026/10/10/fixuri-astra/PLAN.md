# Implementation Plan

## Feature
Aflivra remediation round — 12 defects (N01, D01–D11) from the externally verified GPT Astra
plan (`fixtures/Aflivra_Plan_Implementare_Fixuri_2026-10-10.md`), including two corpus
migrations (EIDA v2, LMI v2) and one workflow repair (corpora-refresh).

## Goal
Close all 12 defect rows with tests at the right level (source value, parser, route, MCP,
corpus, workflow), per Astra's acceptance criteria (plan §8), delivered as the plan's six
sequential PRs, then deploy once and run the extended live verification.

## Requirements

Defect map (Astra plan §2, anchors valid at session-start HEAD `12a1299`):

| ID | Pri | Fix | Anchor | Acceptance (plan §3/§4/§8) |
|----|-----|-----|--------|-----------------------------|
| N01 | P1 | corpora-refresh stages real dirs (`public/{situr,amccrs,eida,lmi}` + `public/data/snapshot-transport.json`), stage-then-`git diff --cached --quiet`, `changed` output gating commit/push/PR (incl. dispatch), explicit branch push + rerun-dedup, `--input-dir`/`--source-dir` offline mode for SITUR/EIDA/LMI importers with fixture manifest validation, keep candidate validation separate from real-diff approval. Semantic-content hash so `fetchedAt` churn ≠ change. | `.github/workflows/corpora-refresh.yml:57,67`; `scripts/snapshot-register.mjs:18` | pathspec probe passes; no-diff run commits nothing; new file detected |
| D01 | P1 | SEN URL → `https://www.transelectrica.ro/sen-filter`; JSON parsed from body regardless of Content-Type; `PROD`/`CONS`/`SOLD` numeric-validated; no artificial positivity clamp | `lib/live/sen.ts:17` | fixture JSON yields 3 numeric powers; live fresh or honestly-reasoned degradation |
| D06 | P2 | Remove fixed `h-2`; Europe/Bucharest candidate-offset parse with reverse verification; winter `26/01/10 12:00:00`→`2026-01-10T10:00:00Z`; summer `26/10/10 19:07:52`→`2026-10-10T16:07:52Z`; spring-forward missing time → invalid+reason; fall-back repeated time → declared ambiguity; keep `observedAtText` + tz-assumption note; no `Math.max(0,age)` masking bad conversions | `lib/live/sen.ts:24–31` | DST cases pass; invalid ts ≠ fresh-zero age |
| D02 | P1 | SITUR county match uses `countyName()` on BOTH sides (request + `record.judet`); original county preserved in display; explicit unknown county → 400 not national; no corpus regen, no row dropping/dedup | `lib/live/situr.ts:78–85` | `București`/`Bucuresti`/`MUNICIPIUL BUCUREŞTI`/`B` each → 387 food rows; control counties Brașov/Cluj; pagination preserved |
| D04 | P1 | Lawyers route computes `barCounty` when `context.scope !== 'national'` and canonicalized county exists, independent of `context.active`; invalid explicit county rejected; `geoScope=national` explicit sense preserved; no global `active` semantic change | `app/api/lawyers/route.ts:10`, `lib/geographic-scope.ts:26` | `county` alone reaches real IFEP `ddlCompany`; test real `GET()` with county-only/locality-only/both/national; verify `barScope`, total, pagination, fallback note |
| D03 | P1 | FDSN event parser header-mapped (col 9→EventType not swapped): pure module `scripts/lib/fdsn-text.mjs`, header validation stops import on change, per-row column/number/date validation with reports, keep year slice + M≥3 + bbox + 1000-limit detection + 204 reported separately | `scripts/import-eida-snapshot.mjs:33` | all 1,157 events correct vs fixtures + `validated/eida-verification.json` |
| D05 | P2 | Station text: drop `#` header/comment lines; 150 station/period records; no false dedup of legit periods | `scripts/import-eida-snapshot.mjs:20–23` | no `network='#Network'` rows; stations=150 |
| D11 | P2 | EIDA response `coverage` block: statuses `full`/`partial`/`outside`/`inconclusive`; `available` metadata + validated/inconclusive slices; calendar-valid `YYYY`/`YYYY-MM`/`YYYY-MM-DD` prefixes; `from > to` → 400; `minMagnitude < 3` doesn't claim sub-threshold coverage; stations mode has its own profile | `lib/live/eida.ts:58–70`, `app/api/earthquakes/route.ts:6–16` | 2019→full; 2014–2016→partial w/ effective range; 2030→outside (200 + indicator); 2026→inconclusive; mixed→partial w/ 2026 split |
| D07 | P2 | LMI parser: `pdftotext -bbox-layout` geometry (helper Python stdlib XML, Node-orchestrated); per-page table geometry from header/lines; row anchored on current number/LMI code; continuation lines by coordinates; cross-page continuions, repeated headers, footnotes, rotated marginalia; `pdfPage` vs `printedPage` kept; golden set extended to 20–30 rows multi-page; corpus v2 (`aflivra-lmi-v2` reader + `/lmi/monuments-bucuresti.json.gz` + SHA proof together); diff reviewed split count-vs-content; keep 2015 base + update note | `scripts/import-lmi-snapshot.mjs:45–80` | 12 delivered corrections + extended sample match PDF; address/dating never mixed (B-II-m-B-17930→`Str. Academiei 3-5 sector 1, Bd. Elisabeta 15-19` / `sf. sec. XIX`) |
| D08 | P2 | `isValidCalendarDate()` in shared `lib/live/date.ts` (strict `YYYY-MM-DD`, UTC round-trip via `toISOString().slice(0,10)`), applied before `cinemaLoader()` and reused for full EIDA dates | `app/api/cinema/route.ts:4` | `2026-02-30`, `2026-04-31`, `2025-02-29` → 400 + `isError=true` + 0 upstream calls; `2024-02-29`, `2026-10-11` accepted |
| D09 | P2 | `resourceSheetRows`: validate sheet index against `state.data.sheets` after metadata read, before chunk read (datastore: only sheet 0); invalid-arg error type distinct from SourceError → route maps to 400; availability/SHA failures stay source errors | `lib/live/resources.ts:113`, `app/api/resource/route.ts:12` | invalid sheet (table+datastore) → 400; same resource `sheet=0` still works after; cache/rows unaltered; CSV/XLSX rejection behavior kept |
| D10 | P2 | MCP venue examples use canonical IDs (`odeon`, `operacluj`, `teatruldearta`); `eventVenue()` also matches `foldVenue(venue.id) === key`; unknown venue → 400 | `lib/mcp/tools.ts:70`, `lib/live/events.ts:10` | every schema example + docs/mcp.md example passes real resolver + `/api/events`; unknown → 400; existing names/aliases preserved (Opera Cluj stays valid) |
| CI | — | Wire `verify-lawyers.mjs` + `verify-geographic-scope.mjs` into `pr-validation.yml` (currently absent); add proposed `verify-integration-regressions.mjs` (real parser/route imports, no reimplementation); run full plan-§6 command battery | `.github/workflows/pr-validation.yml` | CI runs all gates incl. new regressions file |
| U01 | P1 | **USER DIRECTIVE (mid-session, 2026-10-10): "tot ce e expus via MCP să fie accesibil și prin UI"** — every capability exposed through the 41 MCP tools must be reachable in the UI. Audit tool→route→UI-surface coverage, close gaps (UI surfaces for anything only-MCP), and lock it with a permanent gate `scripts/verify-mcp-ui-parity.mjs` in CI so future tools can't ship UI-orphaned | `lib/mcp/tools.ts` (targets), UI pages under `app/` | gate green: each MCP route referenced by UI code (Link/fetch/client call) with real user surface; gaps closed with UI, not waivers |

## Architecture

**USER DIRECTIVE (overrides Astra §3 delivery split): ONE PR for the whole round.**
Single branch `fix/astra-remediation` off `main`; Astra's PR order becomes internal
milestones (dependencies preserved: helper before EIDA, parser before corpus import,
workflow-fix before offline-import verification). The branch stays unmerged until all 12
defects close, then one squash-merge + one deploy. This also removes the interim-state risk
of the 03:17 UTC corpora-refresh cron running against half-migrated importers.

1. **PR1 `fix/n01-corpus-workflow`** — N01 + `--input-dir`/`--source-dir` for SITUR/EIDA/LMI
   importers + fixture manifest validation + session fixtures wired for CI + shared
   `lib/live/date.ts` `isValidCalendarDate()` (per plan §3 note, kills PR4→PR6 dependency) +
   new `verify-integration-regressions.mjs` skeleton with D08 cases (tests-first: helper +
   cinema wiring lands here, D08 closed in PR6 per Astra grouping... adjusted: helper here,
   its cinema application in PR6).
2. **PR2 `fix/sen-endpoint-dst`** — D01 + D06 (`lib/live/sen.ts`, adaptor v2
   `energy.power-system.v2`, v1 stale-copy timestamp recompute or explicit unvalidated
   declaration; SEN fixture from package as CI fixture).
3. **PR3 `fix/geographic-county-filters`** — D02 + D04 (SITUR read-side canonicalization
   with 400 for unknown county; lawyers barCounty local fix + `verify-lawyers.mjs`/
   `verify-geographic-scope.mjs` wired into CI, real `GET()` tests with simulated IFEP).
4. **PR4 `fix/eida-v2`** — D03 + D05 + D11 (`scripts/lib/fdsn-text.mjs` pure parser,
   `EidaEvent` right keys + `magnitudeAuthor`, `coverageByYear` metadata, coverage contract,
   strict interval validation; corpus v2 via `apply_eida_candidate.py --write` after parser
   fix; schema `aflivra-eida-v2`, adaptor `eida.seismic-history.v2`, asset + SHA proof +
   reader in same commit; `verify-surse-noi-corpus.mjs` pins updated to v2: 1,157 events /
   150 stations).
5. **PR5 `fix/lmi-v2`** — D07 (bbox-layout parser + geometry helper, golden 12 + extended
   20–30 rows multi-page visual validation, corpus v2 regeneration from package PDF,
   `aflivra-lmi-v2` + asset/SHA same commit, corpus pins updated).
6. **PR6 `fix/api-mcp-validation`** — D08 (cinema strict date) + D09 (sheet index 400) + D10
   (canonical venue examples + id folding); e2e + MCP contract tests (`isError=true` on 400).

Then: single `node scripts/deploy.mjs` (with `AFLIVRA_D1_DATABASE_ID`), post-deploy
`verify-mcp-live.mjs` extended with county-only lawyers, invalid date/sheet, EIDA semantic
coverage probes (plan §6).

## Tasks

### M1: corpus workflow + shared helper (N01)  [was PR1]
- [ ] T1 Tests-first: pathspec reproduction probe + workflow-lint assertions (verify-integration-regressions.mjs `workflow` group)
- [ ] T2 `corpora-refresh.yml` repaired (real dirs, staging + `--cached --quiet`, `changed` output + gating, branch push + dedup on rerun)
- [ ] T3 `--input-dir`/`--source-dir` on import-situr/import-eida/import-lmi (no fetch in local mode; manifest validation before import)
- [ ] T4 Semantic-content hash for no-change days (order-insensitive where source reorders)
- [ ] T5 `lib/live/date.ts` with `isValidCalendarDate()` + unit cases (leap, impossible days)
- [ ] Verify: offline import from fixtures reproduces committed corpora byte-identically (EIDA pre-v2 for now — pins unchanged this PR)

### M2: SEN (D01+D06)  [was PR2]
- [ ] T1 Tests-first: DST winter/summer vectors, spring-gap, fall-ambiguity, numeric-field validation, v1-stale recompute (fixture = `fixtures/sources/sen-current.json`)
- [ ] T2 `lib/live/sen.ts` URL + parse fix + adaptor v2 + v1 copy handling
- [ ] T3 Live sanity from local (WAF may 404 locally — that's the known environment split; production egress is the judge)

### M3: geographic filters (D02+D04)  [was PR3]
- [ ] T1 Tests-first: 387-food-rows matrix (4 county spellings) + control counties + pagination; lawyers county-only via real `GET()` + simulated IFEP recording `ddlCompany` + `barScope`/fallback checks
- [ ] T2 `lib/live/situr.ts` read-side canonicalization + unknown-county 400
- [ ] T3 `app/api/lawyers/route.ts` barCounty local fix (no `active` semantic change)
- [ ] T4 CI: wire `verify-lawyers.mjs` + `verify-geographic-scope.mjs` into pr-validation

### M4: EIDA v2 (D03+D05+D11)  [was PR4]
- [ ] T1 `scripts/lib/fdsn-text.mjs` pure parser (tests-first on package FDSN texts + `validated/eida-verification.json` field-by-field)
- [ ] T2 Importer rewired to parser; station header exclusion → 150
- [ ] T3 `EidaEvent` keys + `magnitudeAuthor` + `coverageByYear`; coverage contract in `lib/live/eida.ts` + route validation (`from>to` 400, calendar prefixes strict)
- [ ] T4 Migration: `apply_eida_candidate.py --write` (guard: verified baseline) → asset+SHA+schema+adaptor together; `verify-surse-noi-corpus.mjs` pins → v2 values
- [ ] T5 Post-migration module-cache sanity (fresh instance; old cached copy ≠ migration failure)

### M5: LMI v2 (D07)  [was PR5]
- [ ] T1 bbox-layout extraction helper (Python stdlib XML) + Node orchestration
- [ ] T2 Column-geometry row assembly (anchor LMI code, continuation allocation; cross-page/footnotes/rotated text; pdfPage≠printedPage)
- [ ] T3 Golden: 12 delivered corrections + extend to 20–30 rows across pages
- [ ] T4 Corpus v2 regen from `raw/sources/lmi-bucuresti-2015.pdf`; diff split (count vs content); schema/reader/asset/SHA together; pins updated
- [ ] Budget note: full-corpus semantic validation stays out of scope (plan's own limit)

### M6: api/mcp validation (D08+D09+D10)  [was PR6]
- [ ] T1 Cinema strict date wiring (helper from PR1) + zero-upstream-call assertion
- [ ] T2 Sheet index 400 (isolated invalid-arg type; table + datastore; cache survival)
- [ ] T3 Venue examples canonical + `foldVenue(venue.id)` match; docs/mcp.md + schema examples pass real resolver; unknown → 400
- [ ] e2e: events-venues + resource-flow specs extended

### M7: MCP↔UI parity (U01 — user directive, mid-session)
- [ ] T1 Audit: map all 41 MCP tools → target routes → UI references (this decides effort)
- [ ] T2 Gate `scripts/verify-mcp-ui-parity.mjs`: every MCP target route must be referenced by UI code (app pages/components client fetches/Links), wired into pr-validation.yml
- [ ] T3 Close the gaps the audit finds (UI surfaces, e2e smoke where a new surface lands)
- [ ] T4 Scribe: docs/mcp.md gains the parity invariant ("every tool has a UI surface")

### Ship: single PR + deploy + live verify
- [ ] Build the single branch `fix/astra-remediation` through M1–M6 (commit checkpoints per milestone allowed on the branch — they squash into one merge)
- [ ] Full battery (plan §6): install --frozen-lockfile, lint, tsc --noEmit, all verify-*.mjs, build (careful: `seed-snapshots.json` churn check), playwright targeted specs
- [ ] One PR `Aflivra remediation round: 12 defect fixes (N01+D01–D11)`, squash-merge once
- [ ] Deploy once; `verify-mcp-live.mjs` + extended probes (county-only, invalid date/sheet, EIDA coverage semantic)

### Advocate decision resolutions (single-PR session)
- Fixture completion: `fixtures/` stays curated (small evidence + FDSN texts + SEN + goldens,
  referenced directly by targeted CI gates); the complete verified package lives in `raw/`
  local-only (verify_offline.py passed there: 49 files). CI offline import covers EIDA/SEN
  (committed small sources); SITUR/LMI corpus gates assert committed gz corpora — no MB
  binaries enter git.
- Pin semantics: exact-equality pins for committed corpus values (1,157 events / 150
  stations after v2); when corpora-refresh later generates a data PR, that PR updates pins
  deliberately inside its diff (never auto-force-green) per Astra N01.

## Quality Targets

| Target | Value | Notes |
|--------|-------|-------|
| Defect closure | 12/12 per Astra §8 criteria | evidence at value/parser/route/MCP/corpus/workflow levels |
| Verify gates | all existing + new in CI green | `verify-integration-regressions.mjs` in pr-validation.yml |
| tsc --noEmit | 0 errors | LSP reports are stale; tsc is the gate (session precedent) |
| e2e | targeted specs green; known CI flakes (trains tab vinext prefetch, experți budgets, places zoom late-settle) triaged per session precedent | playwright server on :5173 without CI=true |
| Live post-deploy | exit < 3 semantic failures; degradations must have current causes | 41 tools; no silent "fresh" without reason |

## Implementation Standards

- Tests-first where the plan gives expected values (387; DST UTC instants; 1,157/150;
  400 matrices) — write the failing probe, then fix (project rule: regression probes before
  fixes, and every security/defect fix ships with a test that fails without it).
- Project test idiom: `scripts/verify-*.mjs` Node assertion files wired into
  `.github/workflows/pr-validation.yml`, transpiled-source imports where needed (see
  existing `verify-surse-noi-corpus.mjs` / `verify-mcp.mjs` patterns), Playwright for
  browser surfaces.
- No scaffolding, no TODOs; honest degradations only; pinned baselines are never
  auto-adjusted to force green (Astra N01 explicit).
- Corpus pairs (asset + SHA proof) always land in the same commit (Astra D03/D07; repo
  precedent). Schema/adaptor version bumps only where semantics change.
- Comments: repo is comment-light; business rules only where the code can't say it.

## Specialists Recommended
- [x] DevOps - matched: "workflow", "ci", "github actions", "deployment" → focused dispatch after PR1 (N01 workflow review: actions semantics, diff --cached, rerun dedup)
- [x] Migration - matched: "migration", "schema", "version bump", "breaking change" → focused dispatch after PR4 (EIDA v2 + PR5 LMI v2 migration integrity vs plan §5 table)
- [ ] API Designer - not dispatched separately: endpoints/contracts fully specified by Astra (§4 D09/D10/D11); existing route patterns govern
- [ ] Performance Analyst - "cache" keyword hit is cache-versioning (correctness), not perf work; existing budgets unchanged
- [ ] Security Auditor - no auth/secrets surface touched; the 400-vs-200 work is input validation and ships with failing-first tests (D08/D09)
- Core roles (Builder/Validator/Scribe) run orchestrator-side this session: the corpus
  pipeline is deeply session-stateful (13 prior merged PRs of context); parallel
  context-free dispatch risks silent corpus damage. Specialist dispatches above are
  scoped reviews over produced diffs, and Phase 4 two-stage review runs over the final
  cumulative diff vs `12a1299`.

## Coordination
Mode: Markdown (no tracker — personal repo, no jira.md; user has not used ticket tracking
in any prior session on this repo)
Session Ticket: none
Label: n/a

## Coordination Mode
Mode: SUBAGENTS (sequential, orchestrator-led; specialist reviews scoped)
Reason: tightly-coupled 6-PR corpus migration; context continuity outweighs parallelism
Complexity Score: 6 (specialists+cross-layer+iterations) — Advocate gate triggered, run with
constrained scope (see ADVOCATE-REVIEW.md): fixes are user-approved and data-verified;
Advocate checks sequencing/conflicts/reuse, does not re-litigate the defect remediations.
Preliminary Complexity Score: 6

## Constitution Reference
Using standards from: CLAUDE.md (none in repo root — session suite lives in
ssnc-agent-orch/; global agent rules apply: TDD for bug fixes, tests-first, English
artifacts, no comments except business rules)

## Session Directory
ssnc-agent-orch/2026/10/10/fixuri-astra

## Baseline
- HEAD at start: `12a12999d1f0f5762357c6156992fb2747c8cca9` (= Astra's analysis target)
- Offline package: `raw/` (local-only, .gitignored) + `fixtures/` (committed evidence)
- Package integrity: `verify_offline.py` → passed, 49 files, no network
