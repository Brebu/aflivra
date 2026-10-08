# Advocate Review

**Date**: 2026-10-08
**Feature**: content-enrichment-ux — the verbatim 12-point request (CSS/UX audit, full source-data use, cross-source enrichment, images, NEW per-line live transport map with 3s polling, richer cards/dialogs, cross-dataset entity merge, readable details with icons, human-friendly formats, per-source probes, dead-data removal, 3-year recency except firms + court cases)
**Enforcement Mode**: ADVOCATE_ENFORCE=true (default — no `.claude/rules/build-overrides.md`, no `.specify/memory/constitution.md` in this repo)
**Reviewer**: Advocate Agent (Staff SWE / CISSP / CCSP / Cloud Architect)
**Coordination Mode**: None — no `.claude/rules/jira.md`, no tracker context in this repo (`jira_key: none` in the session brief). Session tracking therefore not created; all findings live here. Say the word if you want a Jira or TEAM-BOARD mode set up before the build.

## Executive Summary

The 12 points are really **4 workstreams**: one bounded NEW feature (the per-line live map — every ingredient already exists in the repo), one open-ended data pass (enrichment, formats, dead data, recency), two UI polish passes (CSS/UX/cards/dialogs/icons) that must ride on the data work. Doing all 12 in one merged pass is how you get regression hell across 51 sections. My recommendation: **split into an orthogonal concurrent wave (transport map ∥ data-cleanup policy), then enrichment, then per-domain UI polish — and pin a written per-family recency table before anyone deletes a single row.** No CRITICAL findings; the two highest-risk items are (a) the naive global reading of the 3-year rule, which would gut in-force legislation and the 181k-places corpus, and (b) unbounded 3s-polling cost — both have concrete, evidence-backed designs below.

## Decision Points for User

### Decision 1: Wave structure — 12 points at once vs 4 sequenced workstreams
**Severity**: HIGH
**Proposed**: All 12 points in one pass ("Tratează totul important, punct cu punct").
**Challenge**: The 10/07 sessions show what this estate's discipline can carry: 3 concurrent builders with strict file partitions + a DevOps registration pass, each wave fully gated. The 12 points span 16 domains / 51 sections / 49 source families (`verify-sweep-inventory` output today) — a single merged pass mixes new-feature risk (transport polling) with corpus-mutation risk (dead data/recency) with pure-display risk (CSS). **The points are NOT mutually coupled** — I verified the per-line map has zero dependency on enrichment (it reads `network.json` + per-route artifacts + the existing `/api/transport-live?route=` filter, none of which recency/dead-data touches: vehicles/lines are TTL-governed, not age-governed). Orthogonal work that lands together is exactly what partitioned waves are for.
**Recommendation**:
- **Wave A (concurrent, 2 builders)**: **A1 = per-line live transport map** (point 5 — bounded, new surface, all ingredients exist, see Decision 2) and **A2 = corpus hygiene + data use** (points 11, 12, 9, 2: dead data, recency per family, formats audit, unused-fields audit). A2 is gated by Decision 3's policy table FIRST.
- **Wave B: cross-source enrichment** (points 3, 7) — per-surface joins, attribution display, gated by Decision 4's key rules.
- **Wave C: UI/UX polish** (points 1, 6, 8) — per-domain waves riding on enriched data; images (point 4) ride within each wave under Decision 5's policy.
- Single-builder fallback order: A1 → A2 → B → C (A1 first = bounded headline win; the only hard constraint is **C after A2+B** — polishing surfaces whose data then changes is paying twice, which is what your instinct got right and I keep).
**Trade-off**: 4 waves over ~2-3 sessions vs 1 mega-wave. You lose nothing except calendar time; you gain reviewable, gate-green increments per wave (the estate's whole verification battery is per-wave for a reason).
**Confidence**: HIGH — orthogonality verified against the actual data paths.

### Decision 2: The 3-second polling contract for the per-line map
**Severity**: HIGH (cost + the feature's honesty)
**Proposed**: client polls the line's vehicles every 3 seconds.
**Challenge**: Three cost layers, all measured against this repo's code:
1. **The guards you asked for already exist.** `app/use-source.ts:52` aborts in-flight fetches on unmount/url-change; `:54` gates every poll tick on `document.visibilityState==='visible' && navigator.onLine`; `:41-50` backs off on errors (60s, max 6 attempts) and never evicts a good copy; `:39-40` skips re-render on byte-identical responses. The only new number is `pollMs:3000` (today 30000, `app/transit-workspace.tsx:50`).
2. **Worker→source TTL is the real freshness ceiling.** The vehicles feed is ONE D1-cached copy for all clients (`lib/live/cache.ts:61` serves cached rows without touching the source), loader TTL 30s (`lib/live/transit-realtime.ts:24`). With TTL 30s, a 3s poll serves data up to 30s old — the map "jumps" every 30s. TTL 3s would hammer TPBI (20 req/min) for no honest gain. **15s is the right number**: 4 source fetches/min total across ALL viewers, squarely inside GTFS-RT politeness norms (10-30s consumer polling), and movement every ~15s.
3. **D1 + CPU amplification**: each poll ≈ 1 Workers request + ~2-5 D1 row reads (cache row + payload chunks via `cache.ts:20`) + a JSON.parse of the cached payload in-route. One viewer-hour = 1,200 requests (~1.2% of the free plan's 100k/day) and ~5k D1 reads (~0.1% of 5M/day). Fine at personal scale; the mitigation if concurrency ever matters is a 2-3s **edge micro-cache** on just this route (`Cache-Control: public, max-age=2, stale-while-revalidate=2` — honest, because `stalenessMinutes`/`isLive` derive from the payload's own `observedAt`, not serve-time). Keep `no-store` everywhere else.
4. **Honesty detail that will bite**: `stalenessMinutes` is minute-floored (`app/api/transport-live/route.ts:18`) — on a 3s poll it reads "~0 minute", which is a lie of omission. Add a **seconds tier** to the age label for this surface (the minute/hour/day scale in `app/flights-workspace.tsx` sets the precedent).
**Recommendation**: client `pollMs:3000, timeoutMs:8000` on the per-line view only; vehicles-loader TTL 30s→**15s** (TPBI kind only); seconds-granularity staleness label on that surface; optional v1.1: client-side dead-reckoning interpolation using `bearing`+`speed` (both already in the TPBI rows, `transit-realtime.ts:17`; Tranzy rows carry `bearing:null` — speed-only interpolation, no invented headings, the existing precedent) so the map *feels* 3s-live between 15s source refreshes; edge micro-cache only if/when traffic demands it.
**Trade-off**: 15s data freshness vs literal 3s source truth — you keep TPBI politeness and the single-writeer cache discipline, and the interpolation closes most of the perceptual gap. Battery: bounded (visibility gate + abort already in the hook; small responses — the `route=` filter returns only that line's vehicles).
**Confidence**: HIGH on the design; MEDIUM on whether TPBI tolerates 15s long-term (the `--live` probe pass per family is the existing verification vehicle).

### Decision 3: The 3-year recency rule — per-family policy, not a global filter
**Severity**: HIGH (can silently destroy valid corpora)
**Proposed**: "doar date recente din ultimii 3 ani mai puțin la firme și dosare de instanță unde vreau toată perioada" — only last-3-years data, except firms and court cases.
**Challenge**: A global age filter applied at display/storage would gut things that are NOT dead: **in-force legislation from any year** (an act from 2016 still in force is not "dead data" — the estate's legal flows already have their own in-force/consolidation semantics, plus the nightly-boundary staleness reset at `cache.ts:26-27`), **the 181,537 places corpus** (geography doesn't expire; 75 subcategories of heritage/museums are the app's core), **films** (a 1990 Romanian film is catalog, not stale), **professional registries** (notaries/lawyers/experts — standing, not age), **court registers**. Meanwhile the rule is ALREADY partially coded where it belongs: catalog seeds filter `modified >= 3y` (`lib/live/cache.ts:15`), company history keeps the last 3 years (`cache.ts:70`, copy at `app/live-company.tsx:18`), CNAS resource editions pick within 3 years (`lib/live/directories.ts:11`).
**Recommendation** — pin this per-family table as a written artifact the Architect turns into a verify gate (a script asserting each family's rule, so a future edit can't quietly change the policy):

| Family class | Rule |
|---|---|
| News feeds / announcements (`FeedCards`, stiri) | last 3 years (future-first ordering already exists) |
| Events / spectacole / cinema calendars | future-facing (past events drop naturally; no reverse-3y semantics needed) |
| CKAN dataset browsing | `modified >= 3y` (already coded — keep) |
| ANAF company history | last 3 years (already coded — keep; user's firm exemption is about *existence*, not the rolling 3y balance history they already see) |
| CNAS/registry resource editions | latest edition within 3y (already coded — keep) |
| Legislation / legal acts | **in-force regardless of year** (repeal/expiry is the death criterion, already tracked by consolidation) |
| Court dosare | **full period** (user-exempt — explicitly the whole history) |
| Places / geography / heritage | **exempt** (no age semantics) |
| Films / cultural catalog | **exempt** |
| Professional registries (notari/avocați/experti) | **exempt** (standing, not age) |
| Transport network/schedules | edition TTL governs (already) |

And "dead data" (point 11) defined as: **no-content records, expired-source rows, irreversible stale-without-copy states** — plausibly also broken-links — identified per family by a probe pass, never by age alone.
**Trade-off**: a table + gate script (~half a day) vs the risk of an over-eager deletion pass that users cannot un-see. The exemption list is longer than the application list — that asymmetry IS the finding.
**Confidence**: HIGH — grounded in the existing coded policies and the legal domain's semantics.

### Decision 4: Cross-source entity merge — attribution display on validated keys, never fuzzy joins
**Severity**: HIGH (false-merge risk)
**Proposed**: "fiecare loc, articol, element să conțină tot ce se poate găsi despre ele în toate seturile de date" — every element enriched from all datasets.
**Challenge**: The keys that make merging safe are already validated at boundaries in this repo: **CUI** (ANAF company loader, watch `firma` kind, compare view), **dosar number** `123/45/2026[/P]` (court history + watch, regex-validated), **act id** (`legislatie.just` URL / `law-<64hex>`, watch `act` kind), **SIRUTA** (localities API + geographic scope), **venue id** (validated registry), **OSM/Wikidata ids** (places merge in `v2-model.ts`). The danger is the second half of any merge project: name-based joins. The 10/07 map waves already met this class of bug — same-name different-city museums survive only because the dedup required name+1km proximity (`app/v2-model.ts` merge rule); a pure-name join would have merged Muzeul de Artă ×3 cities into one place. Display-level silent merging also fights the app's identity: every surface shows provenance ("Toate datele publicate de sursă" in MetadataFields, per-source Freshness lines).
**Recommendation**: merge-**with-attribution** at the display layer: an enriched element shows each additional field grouped by ITS source (the MetadataFields/provenance idiom already exists), joined ONLY on the validated identifiers above; **never** on name similarity, and **never** destructive dedup at storage level. Where a join has no validated key, don't join — link (federated search already does cross-family discovery and deep-links by kind; extend that instead). This is point 3+7's honest ceiling.
**Trade-off**: slightly less "one magical unified card" than the dream; zero false merges, zero silent provenance loss. The alternative's failure mode (a competitor's balance sheet on the wrong firm's card because two firms share a name) is unrecoverable trust damage.
**Confidence**: HIGH.

### Decision 5: "Images everywhere" — bounded by the attestation pipeline and the 20k asset cap
**Severity**: MEDIUM
**Proposed**: every element has an image if possible.
**Challenge**: This is largely ALREADY SHIPPED, honestly: `verify-media-budget.mjs` today reports 186,239 corpus rows at 0.35% imaged via **hotlinked + attested** source images, and **every remaining card renders the labeled AI editorial illustration of its category — no bare imageless card**. The census sits at **7,447/20,000 files** (deploy: 7,569 assets, 13.4MB) — headroom exists but is not infinite, and the estate's pattern is deliberately *hotlink-with-attribution + attestation register*, NOT bulk-downloading source images (which would duplicate other people's assets, blow the file cap, and create a maintenance corpse).
**Recommendation**: point 4 = "extend the attested/hotlink register where a source actually provides imagery" (Wikimedia/OSM for places is the in-place mechanism; the `was 0 → 277 attested` progression in today's media-budget output shows the pipeline works), keep AI illustrations as the honest default, never bulk-download. Per-surface work rides inside Waves B/C.
**Trade-off**: some entities stay illustration-only. That's not a failure — it's the honest-degrade ethos applied to pixels.
**Confidence**: HIGH.

### Decision 6: DuckDuckGo probes — keep the existing probe discipline; do NOT wire DDG as a runtime source
**Severity**: MEDIUM
**Proposed**: "să te uiți cum vine fiecare request cu probe direct cu duckduckgo" — check how each request/source responds, with direct probes + DuckDuckGo.
**Challenge**: The estate already has a rigorous probe discipline: the politeness ledger in every session STATUS, captured fixtures, `verify-source-errors.mjs` (49 families / 196+ cells incl. honest-degrade matrix), and post-merge `--live` passes. That is "know how each source responds" — done, maintained, budgeted. The DuckDuckGo part: **zero references in the repo today**. DDG has no free official API; its HTML endpoints are bot-defended (the estate just spent a whole episode learning what "source-defends-all-automated-paths" means with BIA — the registered decision was *no arms race against bot defense*). Wiring DDG as a runtime enrichment source would add exactly that class of fragile dependency for marginal content gain.
**Recommendation**: (a) keep and extend the existing probe/fixture discipline per touched family (that part of point 10 is real work and cheap); (b) DDG at most as a **manual research aid** during enrichment discovery (Wave B), never a runtime source; (c) if the intent was "a search fallback in the UI", the existing federated search already is that, over validated families.
**Trade-off**: if you specifically wanted DDG-powered live search boxes in the UI, that's a product decision to make explicitly — and I'd challenge it again then.
**Confidence**: HIGH on the discipline; the DDG interpretation is genuinely ambiguous (MEDIUM) — flagging my reading for your confirmation.

## Decision Outcomes
- Decision 1 (wave structure): PENDING — recommended concurrent A1∥A2 → B → C
- Decision 2 (3s polling): PENDING — recommended {3s client, 15s TTL, seconds staleness tier, optional interpolation}
- Decision 3 (recency): PENDING — recommended per-family table above, pinned by a verify gate
- Decision 4 (merge model): PENDING — recommended attribution display on validated keys only
- Decision 5 (images): PENDING — recommended attestation-register extension only
- Decision 6 (DuckDuckGo): PENDING — recommended probes-yes / runtime-DDG-no
- CRITICAL RISK ACCEPTED: none (no CRITICAL findings)

## Platform Discovery
**Platform Repo**: none (../totalis does not exist; no adjacent platform/shared repo; session brief confirms standalone project)
**Existing Services Found**: n/a — but see "Existing Solutions Found" below: the in-repo equivalents cover every need.
**Reuse Recommendations**: all four workstreams build on in-repo mechanisms (per-route transit artifacts, useSource polling, federated search, watch keys, attestation register).

## Shipping & Infrastructure
**IaC Location**: none in-repo as classic IaC; deployment is `scripts/deploy.mjs` (wrangler, D1 `aflivra` + ASSETS bindings, **exactly 5 cron triggers — the free-plan cap, frozen** by `verify-refresh-sweep.mjs`), CI = `.github/workflows/pr-validation.yml` (full verify battery in-order), weekly relays `afir/bia/flights-refresh.yml` (Mon/Tue/Wed, ≈10 relay-min/month), workflows under `afir-egress-diagnostic.yml` too.
**Deployment Method**: Cloudflare Workers (build → seed-snapshots churn restored → deploy; actionlint on workflows)
**CI/CD**: GitHub Actions (code.ssnc.dev per PR context)
**Environments**: dev (:5173 / local worker :8787) + production `aflivra.brebu.workers.dev`
**Finding**: PASS — IaC-equivalent exists (deploy script + gates); the relevant constraint for this scope is the **budget policy already registered in README**: worker-first, relays weekly, standing total <200 Actions-min/month vs the 1,500 cap — the new work must not add cron triggers (all 5 slots taken; a per-line refresh must ride the existing loaders/TTLs, NOT a 6th cron) and must respect the same egress classes (TPBI/Tranzy are worker-reachable — the map feature is safe; adsb.lol is egress-blocked/relayed).

### How This Code Ships
Worker-first: every live family reads through D1-cached loaders with TTLs and retry/backoff under `lib/live/cache.ts`; egress-blocked classes (AFIR, BIA, adsb.lol) ship via weekly GitHub relay tours into seed routes; the verify battery (25+ scripts, exact order) gates every PR; deploys through `scripts/deploy.mjs` with a 5-cron ceiling.

## Existing Solutions Found
- [x] `public/transit/routes/<hash>.json.gz` (201 files, avg 57KB gz, max 189KB, 11.1MB total) — **per-line station sequences (`variants`: ordered stopIds per direction + headsigns), per-line `shapes` (polylines), per-line `stops`** — the entire geometry for point 5's map, ALREADY BUILT, currently untouched by any client surface (`app/snapshot-store.ts:18` even deliberately excludes them from the memory cache). `network.json` route rows carry the `file: routes/<hash>.json` pointer (verified on route PV1_403).
- [x] `public/transit/TPBI_GTFS.zip` — contains `stop_times.txt` (70MB), `trips.txt`, `shapes.txt` beyond the 4 files the loader reads (`lib/live/transport.ts:4`) — static offline source if per-route artifacts ever need regeneration; no new network source needed.
- [x] `/api/transport-live?route=` filter — already validates and serves per-line vehicles (`app/api/transport-live/route.ts:10-15`); `routeFilter` already threads from the UI (`app/transit-workspace.tsx:50`). The per-line surface is a NEW VIEW over an EXISTING endpoint.
- [x] `app/use-source.ts` — pollMs/visibility-gate/abort-on-unmount/error-backoff/byte-identical-SWR, all verified in source (lines 52, 54, 41-50, 39-40).
- [x] `lib/live/federated.ts` — cross-family search + kind-targeted deep links (networks, flights, events, firms-by-CUI, court, …) — the discovery layer point 3 builds on.
- [x] Watch kinds (dosar/firma/localitate/act/venue/meteo) — the validated entity-key inventory for point 7's joins (watch-v1 contract, all refs regex-validated at boundaries).
- [x] Attestation/hotlink image register + `verify-media-budget.mjs` — the honest images-everywhere machinery (point 4).
- [x] Probe discipline: `verify-source-errorrs.mjs` family matrix + session politeness ledgers + `--live` passes (point 10's "direct probes").
- [x] Recency anchors already coded: `cache.ts:15` (catalog 3y), `cache.ts:70` + `app/live-company.tsx:18` (firms 3y history), `directories.ts:11` (CNAS 3y) — point 12 is a *generalization with exemptions*, not a greenfield filter.
- [ ] Searched platform repo — not available (no platform/shared repo exists for this project).

## Infrastructure Recommendations
1. Per-line live map rides the EXISTING loader + TTL + D1-cache machinery — no cron, no relay, no new source. Vehicles TTL 30s→15s only.
2. The per-line map redraws via the existing leaflet `PublicMap` vehicle-marker path (`MapPoint{vehicle,bearing,speed}` contract, rotated arrows — flights wave already proved this).
3. Enrichment (Wave B) must reuse `readSource` loaders + `MetadataFields` provenance rendering; no parallel fetch layer.
4. Edge micro-cache (`max-age=2, swr=2`) ONLY on the per-line route if concurrency demands; keep `no-store` default.

## Security Concerns
No CRITICAL findings. Relevant standing items for the new surface: D1 queries already parameterized everywhere (the watch-sweep audit pinned scoped installs); no PII added by any of the 12 points (polling adds no user data; enrichment adds public-source fields); secrets stay references (`TRANZY_API_KEY` env, fail-closed honest note `transit-realtime.ts:34`); the 3s poll must NOT log payloads (nothing in the design does). Advisory note: the per-line 3s endpoint is public and unmetered-per-user — at present app scale this is fine; the edge micro-cache is the DoS-shaped mitigation if it's ever shared widely.

## Cross-Team Dependencies
None — single-operator project, no tracker configured. (If you want this wave tracked in Jira, run the tracker setup first; otherwise this file is the record.)

## Checklist Results
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Complexity | CONCERN→resolved by Decision 1 | 12-in-one is merge hell; 4-workstream split is evidence-backed (orthogonality verified) |
| 2 | Build vs Reuse | PASS | Every ingredient exists in-repo (per-route artifacts, route filter, polling hook, federated, watch keys, attestation) — the feature is assembly, not construction; DDG is the one "new wheel" and I recommend against it (Decision 6) |
| 3 | Infrastructure | PASS w/ constraint | Worker-first + 5-cron cap + weekly relays + budget <200/1500 min — the design adds zero cron and zero new egress classes |
| 4 | Security | PASS | No new auth surface, no PII, secrets as env refs; unmetered public 3s endpoint noted with mitigation |
| 5 | Operational | PASS | TTL/backoff/SWR/visibility/abort already in the machinery; staleness-label seconds tier flagged; D1/Workers-quota math done |
| 6 | Business Alignment | PASS | The 12 points ARE the product; the split delivers the headline feature early and protects corpora from over-eager deletion |
| 7 | Cross-Team Impact | PASS/N-A | Single-operator; no other teams; no tracker conflicts (only session today under 2026/10/08) |

## Already-Done Register (do NOT redo — cite in every builder brief)

| Prompt point | Already shipped (evidence) | What actually remains |
|---|---|---|
| 1 CSS/UX | padding/shadows pass (10/07 context); mobile nav tap-fix (`mobile-nav-taps` 9 legs); preload audit (3 legs); hero/cover srcset + font subset (−41.3% cold load); pin declutter + nearest-click resolution (map spec 13/13); scroll-padding bands | Per-domain typographic/density audit riding on ENRICHED cards — Wave C only |
| 2 Use all source data | `MetadataFields`/"Toate datele publicate de sursă" raw disclosure on every surface; manifest tripRoutes resolution in the live route | Audit pass promoting useful raw fields into parsed typed display (Wave A2) |
| 4 Images | Category AI illustrations on EVERY card (media budget gate output today); hero/covers variants; lightbox gallery + credits; attested/hotlink register with `was→now` progression | Extend attestation where sources provide — Decision 5 policy |
| 5 Transport live map | Per-LOCALITY vehicles map exists (TPBI radius + Tranzy per-agency, bearing/speed, staleness labels, stale-copy-keeps-map honesty from the map-compliance wave); `route=` filter already live | **Per-LINE view: stations polyline + all line vehicles + 3s poll — THE new feature** |
| 6 Cards/dialogs | vpanel / record-list / facts-table / reader-dialog idioms all shipped | Richer variants riding enriched data — Wave C |
| 8 Details with icons | lucide icon grid pattern (`panel-top` kicker+icon) everywhere | Continuous polish — Wave C |
| 9 Human formats | `dateText` widescale; ft→m, kt→km/h (flights); epoch→ISO; occupancy; RO plurals `countText` | Straggler audit (unix secs in raw MetadataFields panels; add seconds age tier for the map) |
| 10 Live probes | Politeness ledger + verify-source-errors 49 families/196+ cells + `--live` post-merge discipline | Extend to newly touched families; DDG optional manual aid only |
| 11 Dead data | Honest-degrade + stale labeling + never-invented-data everywhere | A real removal PASS exists but needs Decision 3's definition (no-content/expired, not age) |
| 12 Recency | Already coded for catalog seeds, firm history (3y rolling — the user's firm exemption means full EXISTENCE, which ANAF already serves), CNAS editions | Generalize per-family table with exemptions (Decision 3) |
| Watch ("Urmărește") | Full feature shipped 10/07 (6 kinds, push, retention, GDPR pages) | Nothing in the 12 points touches it — keep it untouched |

## Recommended Wave Structure (summary)

```
Wave 0 (this review): Decisions 1-6 settled; recency policy table DRAFTED (Decision 3)
Wave A (concurrent, partitioned):
  A1  Per-line live map (point 5): per-route artifact → stations+shape polyline,
      /api/transport-live?route= vehicles at pollMs 3000, TTL 15s, seconds staleness tier,
      leaflet vehicle markers (arrows by bearing — Tranzy circles, no invented heading),
      direction variants (headsigns), honest empty/degrade states; tranzy per-line = follow-up
  A2  Corpus hygiene (points 11+12+9+2): policy-gated dead-data pass, recency per family
      (the table), formats straggler audit, unused-fields promotion audit — per-family,
      verify-gate asserting each family's rule
Wave B: Cross-source enrichment (points 3+7): attribution joins on validated keys
      (CUI/dosar/act-id/SIRUTA/venue/Q-id), federated cross-links where no key
Wave C: Per-domain UI/UX waves (points 1+6+8) over enriched data; images (4) ride each wave
```

Hard constraints to carry into every builder brief: no 6th cron trigger (5-slot cap frozen); no runtime DuckDuckGo; no bulk image downloads; no name-based entity merges; no age-based deletion outside the policy table; no re-do of anything in the Already-Done Register.

## Decision Outcomes (recorded by orchestrator, user authorization: standing "aprob tot / tu alegi" + grant de tools inclusiv Playwright MCP)
- D1 Wave structure: ACCEPTED — A1 (per-line live map) ∥ A2 (corpus hygiene: dead-data+recency-per-family+formats+unused-fields) → B (cross-source enrichment with attribution) → C (per-domain UI polish + images extension). C rides on enriched data.
- D2 Polling contract: ACCEPTED — client pollMs 3000; worker→source TTL 15s; seconds-tier staleness label; existing guardrails (visibility/abort/no-rerender) reused; edge micro-cache max-age=2 if ever needed.
- D3 Recency rule: ACCEPTED — per-family table (as coded: catalogs/firm-history/CNAS rolling; legislation = in-force semantics; places/films/registries exempt); «dead» = no-content/expired, never age alone; a verify gate pins the table.
- D4 Entity merge: ACCEPTED — validated keys only (CUI/dosar/act/SIRUTA/venue/Q-id), merge-with-attribution, no fuzzy names, no destructive dedup.
- D5 Images: ACCEPTED — extend attestation register only where sources provide; no bulk downloads.
- D6 DDG: ACCEPTED — probe/research-only at build time (point 10 of the request satisfied by the probe discipline); no runtime DDG; no UI search box unless the user asks.
- Tools: orchestrator uses Playwright MCP for live verification where stable, local @playwright/test probes as fallback.
