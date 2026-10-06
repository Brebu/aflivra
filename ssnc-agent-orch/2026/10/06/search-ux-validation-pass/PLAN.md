# Implementation Plan

## Feature
Search UX + Romanian grammar + downloads cleanup + source 5xx parity validation + UI/UX polish pass

## Goal
Every search destination routes semantically (chips, typed queries), all numbers read grammatically in
Romanian, the downloads surface is honest (no 404 sections), any source-level 5xx is proven to be the
SOURCE's error (not ours) through direct-vs-app parity checks, and the visual result is aligned and
beautiful on every screen — with results always visible.

## Requirements (from the /analyse synthesis — user-approved directives)

1. **Search routing (per-chip semantic)** — `app/page.tsx:97`:
   - "Castelul Peleș" chip → `go('place','peles')` (place page exists);
   - "Brașov" chip → city-story semantics: `geo.selectCity(<brasov>)` + `go('domain','local')` (match
     `app/page.tsx:104` pattern);
   - "Monitorul Oficial" chip → `go('company','427282')` (the CUI shortcut already exists for typed
     numeric queries, `app/page.tsx:77`);
   - search string gains `p.region` (`app/page.tsx:82`) so city-region queries match (Brașov → Bran);
   - CompanyCard geo-gating (`!geo.hasLocal`, `app/page.tsx:114`) must not hide a direct company
     intent: company chip/typed CUI routes to the company view regardless of geo state;
   - the hardcoded Monitorul empty-state suppression (`app/page.tsx:116`) is removed with the proper
     routing (empty state renders normally otherwise);
   - catalog `initialQuery` from chips must NOT forward entity-intent text to CKAN dataset search
     (`app/catalog-workspace.tsx:13`) — chips set no catalog query.
2. **Romanian grammar**:
   - a plural helper (1 → singular, 0/2-19 → plural, gender-aware per noun) in the app's own utils
     style, wired into the ~15 hardcoded sites from the analysis (pagination "1 rezultate", place
     counts, courts "1 ședințe publicate", transit "1 curse ale variantei circulă", metadata
     "1 câmpuri", server-built `app/api/domain/route.ts:7` "1 surse au copii vechi", etc.);
   - unify missing-value phrasing to ONE form across surfaces (today: "Nefurnizat de sursă" /
     "Neprecizat de sursă" / "Neprecizată de sursă") — pick the existing dominant, adjust the two outliers.
3. **Downloads surface honesty** (user directive: "dacă nu, nu este necesar"):
   - REMOVE the broken zip-inventory section (`app/source-packages.tsx` fetches `/downloads/source-packages.json?v=35` → 404; zips not deployed by design);
   - KEEP what is real: the 5 deployed PDF guides (v30–v35) — surface them as the downloads inventory instead;
   - footer "Exportă inventarul" label is navigation — relabel to match reality ("Despre date & platformă" companion action) — no mislabeled "export";
   - README: the "pagina permanentă de descărcări" claims must stop pointing at the retiring
     chatgpt.site URLs — point at the repo + the deployed guides.
4. **Source 5xx parity validation** (user directive: "if it downloads from the source and 5xx — why? validate the source gives the SAME error hit separately; if not, the problem is ours"):
   - new `scripts/verify-source-errors.mjs` (the verify-*.mjs harness pattern): for every live source
     family, drive the LOCAL app's API route once (capturing any 5xx/error state), and for each failure
     fetch the underlying source URL directly (once, through the same loader contract) comparing
     outcomes: source failing too ⇒ source problem (documented, expected); source OK but app 5xx ⇒
     OUR BUG (exit non-zero with the diff);
   - BUDGET-AWARE by design: one pass per family (same magnitude as one app visit per family), reads
     mostly cached state, and must not re-hit sources that the local API already served successfully;
   - CI-wire it into the battery (continue-on-error NO — it is a real gate for our side, with
     source-side failures reported as informational).
5. **UI/UX polish pass ("design de vis, aranjat și aliniat")**:
   - post-fix visual re-audit (sparingly: local dev, single loads) on the key screens — home, place
     detail, domain×3, company, saves, legal reader;
   - fix the registered real defects: `UNGARIA` SVG map label clip (`app/v2-charts.tsx:25` + map-country
     CSS);
   - results-always-visible: with the search fixes (#1) the geo-radius empty states get the proper
     explanatory empty state (no suppressed empties);
   - any new alignment finding from the re-audit gets fixed at the seam the audit names (CSS files
     app/v2.css / app/*.css, dense one-line style).

## Architecture
Edge-only changes on the frozen rev-35+main stack: routing handlers in app/page.tsx + one new util +
one component removal + one verify script + CSS touch-ups. Zero new schema. Zero new dependencies.
All existing patterns respected (verify-harness style, dense components, Romanian user-facing strings,
no comments except business rules).

## Tasks (waves — disjoint files within a wave)

### Wave 1 (parallel)
- [ ] Task 1.1 (Builder-A): search routing per Requirements 1 — app/page.tsx + app/catalog-workspace.tsx
      + e2e/home-smoke.spec.ts gains chip-routing assertions (place chip lands on #view=place&id=peles etc.)
- [ ] Task 1.2 (Builder-B): plural helper + the ~15 sites + missing-value unification + server phrase
      (app/*.tsx, app/api/domain/route.ts; NOT app/page.tsx — owned by Task 1.1; page.tsx plural sites
      ("1 locuri" page.tsx:111, "1 elemente salvate" page.tsx:134) are handed to Builder-A for wiring
      AFTER 1.1 lands — same file)
- [ ] Task 1.3 (DevOps): scripts/verify-source-errors.mjs (Req 4) + CI wiring + README runbook lines
- [ ] Task 1.4 (Builder-C): downloads honesty per Req 3 — source-packages.tsx removal/replacement,
      footer relabel, README downloads section

### Wave 2 (after Wave 1)
- [ ] Task 2.1 (UI/UX + Builder-D): visual re-audit on fixed build + UNGARIA fix + polish findings

### Wave 3
- [ ] Task 3.1 (DevOps): full local verification chain + README final state
- [ ] Task 3.2 (orchestrator+user): PR, merge, deploy, live verification (single loads)

## Quality Targets

| Target | Value |
|--------|-------|
| e2e | 15/15 + new chip-routing spec green |
| lint / tsc | 0 errors / clean |
| verify battery | including new verify-source-errors.mjs green (source-side failures informational only) |
| Grammar | no "1 <plural>" pattern remains (grep-audited) |
| Links | no /downloads/source-packages.json reference remains; no chatgpt.site download links remain |

## Implementation Standards
House rules (global CLAUDE.md): English artifacts, no comments except business rules, no ticket IDs,
Romanian user-facing strings, TDD where specifiable (plural helper gets a verify-*.mjs test; chip
routing gets e2e assertions), degrade-never-fail. Budget discipline: no live/original site loads from
agents; local dev only; verify scripts are budget-aware by design.

## Specialists Recommended (trigger table on this plan text)
- [x] DevOps — matched: "CI", verify harness, scripts (owns T1.3)
- [x] API — matched: "/api", "5xx", route validation (advisory on T1.3 design; read-only)
- [x] UI/UX — matched: "UI", alignment, design polish (owns T2.1)
- [x] Content Specialist — matched: README/documentation (folded into T1.3/T1.4 writers)
- [ ] Security — not triggered (no auth/secrets this pass)
- [ ] Database — not triggered (zero schema change)

## Coordination
Mode: none (personal project, GitHub issues maybe later; session-tracked via STATUS.md)

## Constitution Reference
Global CLAUDE.md house rules (operative standards embedded above).

## Session Directory
ssnc-agent-orch/2026/10/06/search-ux-validation-pass

## Final decisions (Advocate + user, binding)
1. Chips: "Castelul Peleș" → go('place','peles'); "Brașov" → geo.selectCity + go('domain','local'); "Monitorul Oficial RA" (relabeled) → go('company','427282'). TextField numeric → company stays.
2. Footer: relabel "Exportă inventarul" → "Ghidurile platformei" (About view lists the 5 real PDF guides).
3. verify-source-errors.mjs: MOCK-FIRST (deterministic failure matrix through transpiled routes, CI hard gate) + `--live` opt-in one-pass-per-family parity run (app route vs direct source fetch; exit 1 only when source OK but app errors). `--live` runs ONCE at T3.1 integration.
4. Missing-value: "Nefurnizat/Nefurnizată de sursă" declined by labeled noun's gender (no false unification).
5. Plural rule: 1 → singular; 2–19 → plural; 20+ → "de" + plural. e2e specs asserting old patterns updated alongside their sites. page.tsx plural call-sites (2) move to Wave 2 (file ownership).
6. Polish bounded: UNGARIA clip + this pass's own visual fallout + empty-state improvements from routing fixes. Dream-design overhaul = separate /brainstorm.
