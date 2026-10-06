# Advocate Review

**Date**: 2026-10-06 (Phase 1.5)
**Feature**: Search UX + Romanian grammar + downloads cleanup + source 5xx parity validation + UI/UX polish pass
**Enforcement Mode**: ADVOCATE_ENFORCE=true (default — no override found; **no CRITICAL findings, nothing blocks**)
**Reviewer**: Advocate Agent (Staff SWE / CISSP / CCSP / Cloud Architect)
**Coordination Mode**: none (personal project, per PLAN.md — session-tracked via STATUS.md)

## Executive Summary
The plan is well-shaped overall (disjoint wave ownership, budget discipline, zero new deps). I am changing three
things before the Architect locks it: (1) the "Monitorul Oficial" chip should route to the legal workspace
(`domain/justitie`), not the company view — that is what the name means to a Romanian user; (2)
`verify-source-errors.mjs` must be **mock-first with an opt-in `--live` mode, NOT live-in-CI** — the verify
battery in CI has no dev server and a live check would burn real source requests on every push; (3) the plural
helper is under-specified — Romanian requires "N **de** plural" for 20+, which the plan omits, and which
silently breaks `e2e/transit-view.spec.ts:40`. The missing-value "unify to ONE form" clause is grammatically
wrong as written and must become word-unification with per-noun gender declension. Downloads removal is
directive-backed — adopt.

## Decision Points for User

### Decision 1: "Monitorul Oficial" chip target — chip must route by what the name MEANS
**Severity**: MEDIUM | **Plan verdict**: CHANGE (partial — chip routing ADOPTED, target changed)
**Proposed (plan)**: chip → `go('company','427282')` — the ANAF company view of Monitorul Oficial RA (the state publishing house).
**Challenge**: "Monitorul Oficial" without "RA" names the **Official Gazette of Romania** (the legal publication where
laws, decrees and decisions appear), not the publishing house's balance sheet. A user tapping that chip expects
gazette content. In this app, gazette content (acts whose `publication` field IS "Monitorul Oficial", plus dosare)
lives in the **legal workspace**: `domain/justitie` ("Lege & administrație"), whose DEFAULT tab is
`legal` = "Legislație și dosare" (`lib/dashboard-topics.ts:15`, `app/domain-workspace.tsx:12,29` →
`app/legal-workspace.tsx:51-55`). Landing on `company/427282` shows the printing house's turnover — the same
class of "didn't send me where I should go" the user complained about, one hop later. Supporting asymmetry: the
company view already has five+ entry points (dashboard stat `page.tsx:127`, money pulse `page.tsx:98`, explore
CompanyCard `page.tsx:114`, firme domain, saved page); the legal workspace has **no** home shortcut today.
**Recommendation**: chip "Monitorul Oficial" → `go('domain','justitie')`. If the intent was to showcase the demo
company, relabel the chip to **"Monitorul Oficial RA"** and keep `company/427282` — label and destination must
stay coherent; either pairing is honest, the current mix is not.
**Trade-off**: `justitie` loses the hero's company-search demo (mitigated: company stays reachable elsewhere, and
typed CUI 427282 still routes to it via `page.tsx:77`); company view would have shown cached data (24h TTL)
while the legislation search needs one live query (budget 120/h) — the seeded code-copy fallback
(`app/legal-workspace.tsx:22` `codeFallback`) keeps the tab informative even when the portal fails.
**Confidence**: HIGH on the semantics; the label-relabel alternative is genuinely user-facing → ASK.

### Decision 2: Downloads surface — remove the zip inventory, surface the 5 real PDFs
**Severity**: HIGH (public-facing 404s) | **Plan verdict**: ADOPT removal; CHANGE the footer detail
**Evidence**: `public/downloads/` contains exactly 5 committed PDFs (`Aflivra_v30/v32/v33/v34/v35_Documentatie.pdf`,
~135 KB total). `app/source-packages.tsx:7-8` fetches `/downloads/source-packages.json?v=35` (**404**), links
`/downloads/index.html` (**404**) and `/downloads/<zip>` (**404** — zips are built by `scripts/package-source.py`
into `out/`, never deployed). README.md:325 claims the zips+manifest live in `public/downloads/` (false);
README.md:59 points the "pagina permanentă de descărcări" at the retired `reper-romania.xywex.chatgpt.site` host.
**Recommendation**: ADOPT the plan — remove the section (user directive: "dacă nu, nu este necesar"), surface the
5 deployed PDFs (latest first) as a static list in the replacement component — **not** a separate committed
manifest json (5 committed files duplicated into a 6th file is drift bait; the verify battery should instead assert
each listed guide exists on disk in `public/downloads/` — a 5-line fs check, placement at DevOps' discretion per
Task 1.3/1.4). KEEP `scripts/package-source.py` + `verify-source-packages.py` as the LOCAL offline-package tool
(document in README as a repo-run script, not a deployed page). Do NOT deploy the multi-MB zips to Worker assets.
**Footer**: `page.tsx:137` button "Exportă inventarul" → `go('about')` is mislabeled navigation. The footer already
has "Despre date & platformă" → same destination — don't create a duplicate label. Options: (a) relabel
"Ghidurile platformei" → about (my rec — the guides list now lives there), (b) remove the duplicate button.
**README**: kill the chatgpt.site link (line 59) and the zip-location claim (line 325); point downloads at
`/downloads/*.pdf` + the repo. ASK on (a) vs (b); rest is directive-backed.
**Confidence**: HIGH.

### Decision 3: verify-source-errors.mjs — mock-first, `--live` opt-in (default OFF, never in CI)
**Severity**: HIGH (highest-risk piece as flagged) | **Plan verdict**: CHANGE
**Proposed (plan)**: drive the local app's API route once per family per run, compare against a direct source
fetch per failure, wire into the CI battery as a hard gate.
**Challenge — three hard facts**:
1. **The CI verify job has no dev server** (`.github/workflows/pr-validation.yml` — verify job runs bare
   `node scripts/*.mjs`; only the e2e job boots a server). A route-driving live script cannot run there as designed.
2. **Real cost per pass** (from `lib/live/cache.ts:43-47` + loader TTLs): a cold pass costs ≈25-30 real upstream
   requests: ANAF company = **4** HTTP (3 bilanți + registry POST, `adapters.ts:36-41`), courts = **2** SOAP
   operations (CautareDosare + CautareDosare2), and the `/api/domain?kind=stiri` route **fans out to every
   institution feed** (`api/domain/route.ts:7` loop) — must sample ONE feed, not all. CI-local D1 is always cold
   → every push would spend the full set from GitHub runner IPs (Cloudflare-fronted sources; flaky by design).
3. **The house harness pattern is zero-network**: verify-downloads.mjs / verify-live.mjs transpile the TS, stub
   `globalThis.fetch` with fixtures, mock D1 in-memory, and import route handlers directly — verify-live.mjs
   ALREADY tests source-failure degradation for courts (429/Retry-After, 503 diagnostics, invalid-200) this way.
**Recommendation**: two modes in one script, per the house pattern:
- **Default (CI, hard gate, `continue-on-error: NO`)** — mock matrix per family: stub fetch to emit 500/429/
  timeout/malformed per source family through the transpiled `/api/*` route with in-memory D1 seeded (a) with a
  cached copy → assert 200 + stale/cached status + data preserved (our side never 5xxes when a copy exists);
  (b) without a copy → assert the documented error state and that the error text carries the source's HTTP
  status/category (`SourceError.diagnostics`, `adapters.ts:9`) — this is what makes "a 5xx is provably the
  SOURCE's, not ours" a checkable contract.
- **`--live` (opt-in, default OFF, NOT in CI)** — parity against the LOCAL dev server (127.0.0.1:5173), one pass
  per family, one sampled feed for the feeds family; on app error, `loader.load()` the source URL directly once
  through the same loader contract and classify: SOURCE FAULT (direct also fails, same category — informational)
  vs OUR BUG (source OK, exit 1) vs THROTTLED (our `source_budget` limit message — informational). Cost with warm
  local D1 from earlier testing: most families serve from cache (company/films/resources TTL 24h; catalog/law 1h);
  realistic live spend ≈10-25 upstream requests, once, manually — within every hourly budget (anaf 120, ckan 500,
  legislation 120, courts 60, open-meteo 400). README documents it as the manual runbook step for "why does
  category X error?" — this is the literal implementation of the user's directive.
**Trade-off**: CI can't ever answer "is the real source down right now" — by design; the mock mode proves our side
is honest, the live mode answers the real-world question on demand.
**Confidence**: HIGH — this is the only shape consistent with the budget discipline AND the existing battery.

### Decision 4: Polish pass scope — bounded defect fixing, not a design pass
**Severity**: MEDIUM | **Plan verdict**: ADOPT with a hardened acceptance line
**Recommendation**: "design de vis" is bounded to exactly: (a) the registered defect (UNGARIA SVG label clip,
`app/v2-charts.tsx:25` + map-country CSS); (b) a post-fix visual re-audit on the 10 named screens (home, place
detail, domain×3, company, saves, legal reader — all via LOCAL dev, single loads per screen) fixing only defects
introduced or exposed by this pass's own changes (removed about-page section, new chip destinations, changed count
labels, geo-empty explanatory states from Req 1); (c) every re-audit finding written into session STATUS with its
seam before being fixed. Anything aesthetic beyond that list → backlog, not scope. No redesign, no new components,
no typography/color system, no new interactions — a genuine "dream design" pass is a separate /brainstorm
(follow-up, aligned with the deferred-notifications decision pattern).
**Confidence**: HIGH.

### Decision 5: Missing-value phrase — unify the WORD, keep the GENDER (do not freeze one string)
**Severity**: MEDIUM | **Plan verdict**: CHANGE the approach
**Evidence in situ**: three "…de sursă" variants — "Nefurnizat de sursă" (metadata-fields.tsx:8,
record-workspace.tsx:19, experience.tsx:26 — generic key/value slots), "Neprecizat de sursă" (courts-workspace.tsx:23,
generic slot), "Neprecizată de sursă" (lib/live/date.ts:2 — labels a **dată**, feminine → the feminine is
CORRECT). The repo's own gold standard already declines per noun: weather station facts (weather-workspace.tsx:18:
Umiditate→"Nefurnizată", Vânt→"Nefurnizat", Presiune și tendință→"Nefurnizate" plural, Zăpadă→"Nefurnizată"),
legal act facts ("Număr neprecizat" M / "Publicație neprecizată" F, legal-workspace.tsx:49),
company-provenance.tsx:6 ("Data de referință"→"Nefurnizată de sursă" — the feminine of the target word, precedent).
**Challenge**: a single frozen form is **grammatically wrong** in a gendered language — freezing "Nefurnizat de
sursă" would make date slots read "dată nefurnizat de sursă"; freezing "Neprecizată" is worse. The plan's "adjust
the two outliers" would create errors while claiming to fix them.
**Recommendation**: unify the **word** to the dominant and semantically right verb "Nefurnizat" (source didn't
supply), **declined by the labeled noun's gender**: generic mixed-noun value slots → "Nefurnizat de sursă"
(courts-workspace.tsx:23 changes from "Neprecizat"); known-feminine slots keep feminine (date.ts:2 →
"Nefurnizată de sursă"); plural where the noun is plural. Field-specific single-noun phrases ("Obiect neprecizat",
"Secție neprecizată", "Licență neprecizată" etc.) are already grammatical with a different construction —
leave them; touching them is churn, not correctness.
**Confidence**: HIGH (grammar, not preference; the repo itself is the precedent).

### Decision 6: Plural helper spec + e2e blast radius — the missing "de" rule
**Severity**: HIGH (silent e2e breakage) | **Plan verdict**: ADOPT helper, CHANGE spec + task ownership
**Evidence**: the plan defines "1 → singular, 0/2-19 → plural" and omits the mandatory Romanian 20+ rule:
numerals ≥20 take "**de**" ("34 de locuri", "8.655 de rezultate") — the app already writes it correctly in prose
("178.868 de locuri", page.tsx:136). Without it, the pass leaves exactly the "glued" text the user complained about.
With it, three pinned e2e assertions flip:
- `e2e/transit-view.spec.ts:40` — `/rezultate · copia integrală: [\d.]+ linii, [\d.]+ stații, [\d.]+ curse/` —
  the counts are large (thousands), so "de linii" **breaks** this regex as written;
- `e2e/places-workspace.spec.ts:44` — `.entity-results-header` `/rezultate/` — flips only at n=1;
- `e2e/catalog-flow.spec.ts:44` + `compare-planner.spec.ts:38,77` — `din \d+( … rezultate)?` and
  `seturi · \d+ pe această pagină` — survive at n≥2 (substring match) but flip at n=1.
**Recommendation**: (a) helper implements the full rule — 1 → singular (gender-aware), 0/2-19 → plural, 20+ →
"de" + plural — as a ~10-line util in the app's own utils style (no dependency; Intl.PluralRules does not give
"de"); (b) **Task 1.2 owns updating the pinned e2e count regexes** (make them `(?: de )?`-tolerant or singular-
tolerant: `/[\d.]+ (?:de )?linii/`, `/rezultat/)`. The plan currently gives e2e duties only to Task 1.1 — gap;
file-disjointness still holds (different spec files); (c) the helper gets the mandated verify-*.mjs test with the
0/1/2/19/20/21/8.655 boundary matrix; (d) Builder-B grep-audits the full plural-site set (my enumeration start:
pagination.tsx:4, page.tsx:102,111,134, metadata-fields.tsx:8, courts-workspace.tsx:23, court-history-panel.tsx:14,
transit-workspace linii/stații/curse labels, record-workspace.tsx:19,20,21,23, catalog-workspace.tsx:18
"seturi", api/domain/route.ts:7 "surse au copii vechi", weather-workspace.tsx:18 "variabile", cinema-workspace.tsx:27,
places-workspace.tsx:83) — the plan's "~15" matches this family.
**Confidence**: HIGH.

## Implementation Risk Flags (for the Architect / Builders)
- **R1** (Task 1.1): removing the Monitorul empty-state suppression (`page.tsx:116`) must stay coherent: for a
  TYPED query matching company intent ("monitorul", "427282"), the CompanyCard and the "Niciun rezultat" empty
  state must not both render. Collapse the `norm('Monitorul Oficial 427282 firma')` hack into one
  `companyMatches` condition instead of deleting the clause blindly.
- **R2** (Task 1.1, advisory): `app/domain-workspace.tsx:25` repeats the geo-gating pattern
  (`initialCui={geo.hasLocal?'':'427282'}`) — the plan only commits `page.tsx` (direct intent). Aligning the
  domain tab is a one-line optional consistency fix; not a direct-intent case, Builder's call.
- **R3** (Task 1.1): with chips calling `go(view,id)` without a query, the "chips set no catalog query" clause
  (catalog-workspace.tsx:13) is satisfied automatically; typed queries still forward `q` to the catalog — by
  design, leave that path alone.
- **R4** (Task 1.3): the README "verify battery" runbook must document the two modes and the manual `--live`
  procedure with the budget table; links target says "no /downloads/source-packages.json reference remains" —
  the UI references die with the component; README:325's claim must be rewritten, `scripts/package-source.py`
  keeps its local-tool documentation.
- **R5** (Task 1.4): `verify-downloads.mjs` line 54 already asserts committed resource copies — unaffected by
  the zip-section removal; do not "clean it up" alongside.

## Decision Outcomes
(pending user responses — updated below as they arrive)
- Decision 1: PENDING — awaiting user (a) domain/justitie [Advocate recommendation] vs (b) company/427282 + relabel "Monitorul Oficial RA".
- Decision 2: ADOPTED (removal directive-backed); footer detail PENDING — (a) "Ghidurile platformei" [rec] vs (b) remove duplicate button.
- Decision 3: ADOPTED as CHANGED (mock-first default in CI, --live opt-in manual) — orchestrator default applied; budget discipline makes live-in-CI a non-starter (no user choice offered).
- Decision 4: ADOPTED as bounded (registered defects + own-pass re-audit findings only; deeper redesign → future /brainstorm) — orchestrator default applied unless the user expands it.
- Decision 5: ADOPTED as CHANGED (word-level unification with gender declension; "Nefurnizat(ă) de sursă") — grammar is correctness, not preference; orchestrator default applied.
- Decision 6: ADOPTED as CHANGED (full "de" rule + e2e regex updates owned by Task 1.2) — the "grammatically perfect" directive decides it; orchestrator default applied.

## Team Activity (claude-code-agent-harness)
Coordination mode: none (personal project — PLAN.md). No tracker to poll; no conflicts possible.

## Existing Solutions Found
- [x] `app/page.tsx:104` city-story pattern (selectCity + setPrefs + go('domain','local')) — reuse verbatim for the Brașov chip. ADOPT.
- [x] `app/page.tsx:77` numeric-CUI shortcut — typed 427282 → company view already correct.
- [x] `scripts/verify-live.mjs` / `scripts/verify-downloads.mjs` — transpile + mock-fetch + in-memory-D1 harness pattern for verify-source-errors.mjs. ADOPT (Decision 3).
- [x] Weather/legal/company-provenance gender-declined placeholder precedent — the missing-value unification follows the repo's own convention (Decision 5).
- [x] "178.868 de locuri" prose precedent (page.tsx:136) — the "de" rule is already house grammar (Decision 6).
- [x] `Pagination` shared component (pagination.tsx) — plural fix lands once, every surface inherits.
- [x] Searched for a platform/reuse repo: N/A — self-contained personal project, zero new dependencies proposed. Confirmed nothing needed from outside.

## Shipping & Infrastructure
**IaC/deploy**: `scripts/deploy.mjs` (wrangler deploy; Cloudflare Workers + D1; `npm start` → `wrangler dev --local --persist-to .wrangler/state`). **CI**: `.github/workflows/pr-validation.yml` — lint+tsc / verify battery (no server) / build+deploy-dry-run+D1-idempotency / e2e (Playwright boots dev, baseURL 127.0.0.1:5173). **Finding**: PASS — deployment path exists and is unaffected by this pass; the only CI change is adding `node scripts/verify-source-errors.mjs` (mock mode) to the verify job.

## Infrastructure Recommendations
No new infrastructure. The verify job gains one script invocation (Decision 3); e2e specs gain string updates (Decision 6). Nothing else touches deployment topology, schema (zero D1 migrations), or dependencies (frozen lockfile preserved).

## Security Concerns
None triggering. No auth changes (public data app, no secrets in scope — `.dev.vars` handling untouched); the verify script's live mode fetches only already-integrated public source URLs through the existing loader contract (same UA/limits — no new attack surface); no PII; no new endpoints. The removed section (`source-packages.tsx`) deletes the only fetch of a 404 JSON — strictly a reduction of surface.

## Cross-Team Dependencies
None (single-owner personal project; mode none).

## Checklist Results
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Complexity | PASS | 4 disjoint wave-1 tasks, ~zero new code surface (one util, one script, one removal); page.tsx cross-task handoff already sequenced by the plan |
| 2 | Build vs Reuse | PASS | every fix extends an existing seam (city-story routing, verify harness, Pagination, gender precedent); no library pulled for 10 lines of Romanian grammar |
| 3 | Infrastructure | PASS (with Decision 3 change) | mock-first into the existing CI battery; live parity manual + budget-tabled |
| 4 | Security | PASS | no auth/secrets/PII surface in scope |
| 5 | Operational | PASS | no deploy/schema/dependency change; budget discipline preserved by design |
| 6 | Business Alignment | PASS | all five requirement areas trace to explicit user directives (prompt.md §Original Prompt 1-4) |
| 7 | Cross-Team Impact | N/A | single-owner project, no tracker |
