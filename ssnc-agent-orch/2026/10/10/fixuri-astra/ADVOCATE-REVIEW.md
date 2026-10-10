# Advocate Review

**Date**: 2026-10-10 (evening, +0300)
**Feature**: Aflivra remediation round — 12 defects (N01, D01–D11), 6 sequential PRs
**Enforcement Mode**: ADVOCATE_ENFORCE=true (default; no `.claude/rules/build-overrides.md`, no `.specify/`) — no CRITICAL-category findings (nothing touches auth/secrets/PII), so nothing blocks.
**Reviewer**: Advocate Agent (constrained scope: sequencing/conflicts/reuse/repo-fit — remediations themselves are user-approved and data-verified; not re-litigated)
**Coordination Mode**: None — pre-decided (personal repo, no `jira.md`, no tracker context anywhere in `.claude`/`.specify`; user has never used ticket tracking here). No Jira, no TEAM-BOARD, no tickets.

## Executive Summary

No conflicts: zero open PRs, `main` == `origin/main` == `12a1299` (Astra baseline), tree clean except the session dir, and none of the 6 planned branch names exists. The plan's reuse assumptions hold against the actual files (defect anchors verified in code; `lib/live/date.ts` exists and is *extended*, not created; CI wiring targets are correct). Three real operational risks: **(1)** the session's offline fixture package is partial — 14 of 49 manifest files are absent and `verify_offline.py` currently FAILS — all 14 are byte-identically recoverable from `~/Downloads/Aflivra_Fixuri_Probe_Offline_2026-10-10 (1)_3139/`, a mechanical copy PLAN assumes is already done; **(2)** exact-value corpus pins would break the *daily* corpora-refresh on the first genuine new event after PR4; **(3)** the 03:17 UTC cron can run the still-v1 EIDA/LMI importers through the repaired workflow between PR1 and PR4/PR5. Two decision points, both small.

## A. Conflict Check

- **Open PRs**: 0 (GitHub API via git credential helper, `pulls?state=open` → HTTP 200, `[]`).
- **Branches**: local `main` == `origin/main` == `12a1299` (Astra's analysis target, PLAN.md:172 — verified). 86 unmerged branch refs exist locally+remotely, but all are squash-merge leftovers: the newest tips (`fix/live-probe-flux` 2026-10-10 18:53, `runda5-surse-romanesti` 18:05) carry content already in `main` via PRs #53–#56; residual `main..branch` diffs are *main-ahead* deltas (e.g. `fix/live-probe-flights` differs only on `scripts/verify-mcp-live.mjs` where #56 superseded #55). No unique unmerged work.
- **Planned branch names** (`fix/n01-corpus-workflow`, `fix/sen-endpoint-dst`, `fix/geographic-county-filters`, `fix/eida-v2`, `fix/lmi-v2`, `fix/api-mcp-validation`): none exist. No collision.
- **Adjacent same-day sessions**: `ssnc-agent-orch/2026/10/10/{runda5-audit,surse-noi}` — both concluded (outputs merged as #53; `runda5-audit/STATUS.md` shows its audit lots consumed by the retest doc this session implements). Not in-progress conflicts.
- **Working tree**: clean except `?? ssnc-agent-orch/2026/10/10/fixuri-astra/` — as required.

**Verdict: no conflicts. Proceed.**

## B. Repo-Pattern Reuse Audit

Verified against the actual files — the plan's assumptions hold, with the anchors confirmed in code:

| Plan assumption | Evidence | Verdict |
|---|---|---|
| N01 pathspec mismatch | `corpora-refresh.yml:57,67` stages `public/data/{situr,amccrs,eida,lmi}`; `snapshot-register.mjs:18-20` writes `public + path` → real dirs are `public/{situr,amccrs,eida,lmi}` (confirmed on disk; `public/data/` holds only `snapshot-transport.json` etc.) | ✅ confirmed; Astra's real-dir fix list matches, incl. `public/data/snapshot-transport.json` (exists) |
| N01 gating absent | commit step `corpora-refresh.yml:63` has no `changed` condition; quiet gate `:54-62` only on `schedule`; `git checkout -b corpora/refresh-$(date)` `:41` breaks same-day rerun | ✅ Astra items 2–4 all map to real gaps |
| `fetchedAt` churn | `import-eida-snapshot.mjs:40` `new Date().toISOString()` embedded in payload | ✅ semantic-hash improvement is grounded |
| D01 URL / D06 offset | `sen.ts:17` `…/web/tel/sen-filter` (the 404 URL); `sen.ts:~31` `Number(h)-2` fixed offset | ✅ confirmed |
| D03/D05 parser | `import-eida-snapshot.mjs:33` column array maps col 10→`eventType` etc. (swapped vs `#EventID|…|EventType` official header); `:22` `fields.length>=columns.length` admits the `#` header row (corpus on disk: 151 stations, first event `eventType:'ml'`) | ✅ confirmed |
| D02/D04/D08/D09/D10/D11 anchors | not re-verified line-by-line (closed decisions per hard constraint); files exist at plan paths | ✅ trusted per Astra data verification |
| `verify-lawyers.mjs` / `verify-geographic-scope.mjs` absent from CI, exist on disk | absent from `pr-validation.yml:79-117` battery; both files exist in `scripts/` | ✅ PR3-T4 wiring is correct reuse, not duplication |
| `verify-integration-regressions.mjs`, `scripts/lib/fdsn-text.mjs` new | neither exists; `scripts/lib/` dir absent (trivially created) | ✅ new as planned, no duplication |
| shared `lib/live/date.ts` | **already exists** (`displaySourceDate`, `romanianDate`); `isValidCalendarDate` absent everywhere | ✅ plan *extends* the module — no conflict; keep helpers in the existing file, don't re-create |
| Adaptor v2 cache route | `cache.ts:33-34` `cachedCopyServes(row, version)` version-keyed; `:75` lets a new `adapter_version` bypass v1 backoff/lock | ✅ PR2's v2-bump + v1-stale-copy recalculation works on the real semantics |
| Deploy / live verify | `scripts/deploy.mjs:15` accepts `AFLIVRA_D1_DATABASE_ID` env; `verify-mcp-live.mjs` exists | ✅ ship-phase assumption holds |
| Importers called bare by workflow | `corpora-refresh.yml:43,47,49` invoke importers with no args | ⚠️ constraint: PR1's `--input-dir`/`--source-dir` must keep the no-arg default = network fetch, or the daily workflow breaks the moment PR1 merges |

**Reuse gaps found (2):**

1. **Partial offline package — 14 of 49 manifest files absent, `verify_offline.py` FAILS now** (`Fișier inexistent: baseline/eida-seismic.json.gz`). Missing: `sources/situr-{cazare,alimentatie,agentii}.xlsx`, `sources/lmi-bucuresti-2015.pdf`, `validated/situr-{agentii,alimentatie,cazare}.json`, `validated/lmi-page28-visual.png`, `baseline/*.json.gz` (×6). PLAN.md:174's "verify_offline.py → passed, 49 files" describes the delivery-time state, not the session dir. **Recovery verified: all 14 are byte-identical (size + SHA-256) in `~/Downloads/Aflivra_Fixuri_Probe_Offline_2026-10-10 (1)_3139/`** — copy them in, re-run `verify_offline.py`, done. (Cross-check: `surse-noi/raw/lmi-buc.pdf` is byte-identical to the manifest's LMI PDF; the surse-noi XLSX are byte-*different* — normal for XLSX re-exports, row-identical per Astra's Counter verification — so the Downloads unpack, not surse-noi, is the right source for the XLSX.)
2. **EIDA fixture slices are unfiltered** (e.g. `fixtures/sources/eida-events-2019.txt` 199 KB) while the committed corpus came from `minmagnitude=3&bbox`-filtered fetches (`import-eida-snapshot.mjs:31`). PR1's byte-identical offline verify therefore requires the offline mode to apply M≥3+bbox+year locally with exactly the server's filter semantics — the plan's parser spec (D03 item 4) includes those filters, so this is covered by design, and the byte-diff verify self-detects any mismatch. Noted so the executor isn't surprised.

## C. Sequencing Risks (6-PR order)

1. **Interim cron exposure (PR1→PR4/PR5)**: `corpora-refresh.yml` runs daily 03:17 UTC; between PR1's workflow repair and PR4's importer fix, a scheduled run re-imports EIDA/LMI with the still-swap-buggy v1 parsers and **opens a refresh PR** (fetchedAt churn alone doesn't trigger it once the semantic hash lands, but any genuine source change does; current count-only pins pass on wrong-field data — Astra says exactly this). If such a PR is merged, PR4's migration guard (`apply_eida_candidate.py` baseline fingerprint) correctly refuses, and it textually conflicts with PR4's corpus commit. Unmerged, it is merely noise the rerun-dedup must tolerate. **Mitigation**: the session started Oct 10 evening (+0300) — if PR1→PR4 (and ideally PR5) merge before 03:17 UTC Oct 11 (= 06:17 local), exposure is zero. PR2/PR3 are EIDA-independent so the order already minimizes the window. Not covered in PLAN — cheap to cover: just finish the sequence in one sitting, and if the session spans the cron, leave any `corpora/refresh-*` PR unmerged until PR4/PR5 land.
2. **Corpus pin + asset same PR**: PLAN PR4-T4 and PR5-T4 both move asset+SHA+schema+adaptor+pins together, and Implementation Standards codify the pair rule. **Covered** — verified against Astra D03.6.
3. **Interim unused export (helper in PR1, first consumer in PR6)**: no gate risk — `tsconfig.json` has no `noUnusedLocals`/`noUnusedParameters`; `eslint.config.mjs` sets no unused-exports rule (and the `lint` script has no `--max-warnings 0`); a module *export* is never an unused local. PR1 also ships the helper with its own unit cases. **Covered — no dead-code gate to worry about.**

## D. Challenge Checklist — Real Risks (5)

| # | Risk (one sentence) | Mitigation status |
|---|---|---|
| 1 | The session's fixture package is partial (14/49 missing, `verify_offline.py` fails) so PR1's offline-import verify and PR5's LMI regen would hit missing inputs. | **Missing from PLAN** — mechanical fix: copy the 14 files from `~/Downloads/Aflivra_Fixuri_Probe_Offline_2026-10-10 (1)_3139/` (SHAs verified identical), re-run `verify_offline.py` → 49/49. |
| 2 | Exact-value pins ("1,157 events") in `verify-surse-noi-corpus.mjs` would fail the **daily** corpora-refresh — which runs that gate at `corpora-refresh.yml:51` after live re-import — on the first genuine new event; current pins are deliberately floors (`scripts/verify-surse-noi-corpus.mjs:61-62` `>=150`/`>=1100`). | **Missing from PLAN** — see Decision 2; closed historical years (2015–2025) are stable, 2026/live totals are not. |
| 3 | The 03:17 UTC cron can run half-migrated importers between PR1 and PR4/PR5 (detail in §C.1). | **Not covered in PLAN** — one-sitting completion or "don't merge refresh PRs mid-sequence" covers it; the v2-baseline guard already contains the damage if violated. |
| 4 | Committing the ~5.1 MB SITUR XLSX + 3.2 MB LMI PDF as CI fixtures bloats the repo and diverges from the surse-noi repo precedent (session `raw/` untracked via its own `.gitignore`; only small text/JSON fixtures committed). | **Partially covered** — PR1's byte-identical verify is EIDA-scoped (PLAN.md:74) and EIDA texts (~500 KB) + the SEN fixture are already on disk; D02's 387-row tests can run against the committed corpus (Astra: the rows exist "în export și în corpus"). Default: commit text fixtures only. |
| 5 | Corpus-pipeline breakage via the deploy-time reader cache: PR4/PR5 ship schema v2 + readers together, but the EIDA/LMI readers hold a process cache (`Astra §5`), so a post-merge verify on a live instance could read a stale v1 copy. | **Covered** — PLAN PR4-T5 ("post-migration module-cache sanity, fresh instance") and Astra §5 both state it. |

Standard checks: complexity (6-PR tightly-coupled sequence is proportionate to 12 anchored defects — PASS), build-vs-reuse (imports verifier/lawyers/geographic-scope wiring, extends existing date module — PASS), infrastructure (GitHub Actions + squash-merge PR pattern matches repo precedent — PASS), security (no auth/secrets surface; D08/D09/D10 400-semantics are the approved input-validation work — PASS), operational (cron exposure + pins — CONCERN, risks 2–3), business alignment (closes all 12 verified defects, Astra acceptance §8 — PASS), cross-team impact (solo repo — N/A).

## E. Coordination

**Mode: none** — pre-decided per the constrained brief; verified no `jira.md`/tracker context exists in this repo (personal project). No tickets created, no TEAM-BOARD. Session tracking stays in this directory (PLAN.md + STATUS.md), repo precedent for solo sessions.

## F. Decision Points

**Decision 1 — Fixture-package completion (blocking for PR1's verify step, mechanical):**
The session fixtures dir is missing 14 of 49 files; PLAN assumes a complete package. Options: (a) copy the 14 from `~/Downloads/Aflivra_Fixuri_Probe_Offline_2026-10-10 (1)_3139/` and re-run `verify_offline.py` (recommended — SHAs already verified identical by this review); (b) proceed with the partial set and scope PR1's byte-identical verify to EIDA only (already PLAN's wording), sourcing the LMI PDF from the same Downloads dir at PR5. Both work; (a) is strictly safer. *Recommendation: (a). Confidence HIGH (measured: 14/14 SHA-256 + size match).*

**Decision 2 — Pin semantics in `verify-surse-noi-corpus.mjs` at PR4/PR5 (small, affects the daily refresh forever):**
PLAN says "pins updated to v2: 1,157 events / 150 stations" but doesn't say exact vs floor. Exact equality breaks `corpora-refresh` (the gate runs there after live re-import, `corpora-refresh.yml:51`) on the first real new event — a silent stop of corpus updates via red CI. Options: (a) exact pins for closed census years 2015–2025, floor (or no pin) on 2026/live totals + exact structural pins (schema `aflivra-eida-v2`, 150 stations, station list stability); (b) exact equality everywhere and accept that any future source change is an explicit re-pin commit (Astra's own philosophy — "poarta se actualizează atunci explicit, prin commit" — arguably endorses this, but that philosophy was written for the frozen-corpus context, not the daily refresh). *Recommendation: (a); it keeps the daily refresh honest about growth while pinning the verified census. Confidence MEDIUM-HIGH (the failure mode is mechanical; the census-year stability assumption is Astra-verified).*

No other decision points — the 6-PR order, the remediation grouping, and the repo's branch/PR mechanics are all decidable from PLAN.md. **Proceed.**

## Checklist Results

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Complexity | PASS | 6 PRs ≈ 12 anchored defects; sequential order minimizes interim windows (§C.1) |
| 2 | Build vs Reuse | CONCERN | Assumptions verified (§B table); gap = partial fixture package (Risk 1) |
| 3 | Infrastructure | PASS | Actions/squash-merge pattern matches the 13 prior merged PRs; no-arg importer default must stay fetch (§B) |
| 4 | Security | PASS | No auth/secrets/PII surface; 400-semantics are approved remediations with tests-first |
| 5 | Operational | CONCERN | Cron exposure PR1→PR4/5 (Risk 3); pin semantics vs daily refresh (Risk 2) |
| 6 | Business Alignment | PASS | All 12 defects closed per Astra §8; no scope inflation found in PLAN |
| 7 | Cross-Team Impact | N/A | Solo repo, coordination mode none |
