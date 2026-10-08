# PLAN — content-enrichment-ux

**Mode**: standalone `/build` — session dir `ssnc-agent-orch/2026/10/08/content-enrichment-ux/`
**Branch**: cut from `main` at implementation time (this session is read-only analysis; PLAN + conventions only)
**Stack**: Next.js 16.3 / vinext + React 19.2 on Cloudflare Workers (D1 `DB`, 5-cron cap frozen), TypeScript 5.9, Tailwind 4, Leaflet 1.9, Playwright e2e (Chromium), Node ≥22.13, corepack pnpm. UI strings Romanian; code/comments/artifacts English.

## Advocate Review

Status: **Completed** — `ADVOCATE-REVIEW.md` in this session dir. All six decision outcomes recorded as ACCEPTED by the orchestrator (standing "aprob tot / tu alegi" + tools incl. Playwright MCP):

- **D1** Wave structure: A1 (per-line live map) ∥ A2 (corpus hygiene) → B (cross-source enrichment) → C (per-domain UI polish). **C rides on enriched data.**
- **D2** Polling: client `pollMs:3000`, `timeoutMs:8000` on the per-line view only; worker→source TTL 30s→**15s, TPBI vehicles kind only**; seconds-tier staleness label; existing guardrails reused; edge micro-cache `max-age=2, swr=2` only if traffic demands; optional v1.1 dead-reckoning interpolation from `bearing`+`speed` (Tranzy rows are `bearing:null` — speed-only, no invented headings).
- **D3** Recency: per-family policy table (below) pinned by a verify gate; "dead" = no-content / expired-source / irreversible-stale, **never age alone**.
- **D4** Merge: validated keys only (CUI / dosar number / act id / SIRUTA / venue id / OSM–Q-id), merge-**with-attribution**, no fuzzy names, no destructive dedup.
- **D5** Images: extend the attestation/hotlink register only where sources provide; no bulk downloads.
- **D6** DuckDuckGo: probe/research-only at build time; no runtime DDG; no UI search box unless the user asks.
- **Tools**: Playwright MCP for live verification where stable; local `@playwright/test` probes as fallback.

External dependencies: none (single-operator project, no tracker — `jira_key: none`).

## Hard constraints (carry verbatim into every builder brief)

1. **No 6th cron trigger** — all 5 Cron Trigger slots are frozen (`lib/live/refresh-groups.json`, enforced by `scripts/verify-refresh-sweep.mjs`; deploy refuses a partial list via `scripts/deploy.mjs`). Nothing in this plan adds a cron or moves a family into a sweep group.
2. **No runtime DuckDuckGo** (D6).
3. **No bulk image downloads** — hotlink+attestation register only (D5).
4. **No name-based entity merges, no destructive dedup at storage level** (D4).
5. **No age-based deletion outside the D3 policy table.**
6. **No re-do of anything in the Already-Done Register** (bottom of this file).
7. **No new page routes** — the per-line surface is a view/dialog inside Transport; `update-sitemap.mjs` is NOT rerun.
8. **Egress classes respected**: TPBI/Tranzy are worker-reachable (fine); adsb.lol/BIA/AFIR stay on their weekly relays — untouched by every wave.
9. **Working-tree write rule for this session**: PLAN.md + conventions.md only. Nothing in this file was committed or deployed.
10. **Nothing secret reaches a log** — the 3s route must not log payloads; `TRANZY_API_KEY` stays an env reference (`lib/live/transit-realtime.ts:33-34` fail-closed precedent).

---

## Wave A (concurrent, partitioned — Builder-A: A1, Builder-B: A2)

The two sub-waves are verified orthogonal (Advocate D1: the per-line map reads `network.json` + per-route artifacts + `/api/transport-live?route=`, none of which recency/dead-data touches — vehicles/lines are TTL-governed, not age-governed). **Strict file partition** (10/07 lesson: a shared `tsc`/`lint` pass caught a mid-edit overlap):

- **Builder-A owns**: `app/transit-workspace.tsx`, `app/api/transport-live/route.ts`, `lib/live/transit-realtime.ts`, `lib/live/refresh-groups.json` (one reason-string edit), `e2e/line-live-map.spec.ts` (new), README transport staleness sentences.
- **Builder-B owns**: `scripts/verify-recency-policy.mjs` (new), `scripts/audit-dead-data.mjs` (new), `scripts/audit-unused-fields.mjs` (new), formats-audit updates in per-family view files, `docs/hygiene/*.md` (new), `.github/workflows/pr-validation.yml` + README battery registration.
- **Nobody touches**: watch surfaces, legal consolidation semantics, places import pipeline (until the census approves a purge), relay workflows.

### A1 — Per-line live map (Transport „În mișcare", point 5)

Everything below composes existing machinery — this is assembly, not construction (Advocate checklist #2 PASS). Verified file:line anchors:

- Per-route artifacts: `public/transit/routes/<hash>.json.gz` (201 files) proven by `public/transit/manifest.json` (`routes.<id> = {file,bytes,sha256,trips,stopTimes,variants}`); read client-side via `snapshotJson('/transit/'+route.file, manifest.routes[route.id])` — `app/transit-workspace.tsx:24` (RouteReader). Deliberately excluded from the client memory cache (`app/snapshot-store.ts:18` — keep that exclusion; per-route payloads are one-shot dialog loads).
- `RouteReader` already renders: variants (ordered `stopIds` per direction + headsigns), chosen-trip `shapes` polyline, stops as `PublicMap` points (`app/transit-workspace.tsx:26-31`) — the **planned-route map**. What's new is the **live vehicles layer + 3s poll + seconds-tier staleness**.
- `/api/transport-live?route=` already validates (`route.length>100` guard) and filters per line (`app/api/transport-live/route.ts:10-15`), resolved via `transit.tripRoutes` for tripId→routeId.
- Vehicle render with heading arrows already exists: `PublicMap` `MapPoint{vehicle,bearing,speed,occupancy,occupancyPercentage}` (`app/public-map.tsx:6`, telemetry via `lib/transit-view.ts:12-15`), asserted by `e2e/transit-view.spec.ts:81` (bearing-rotated markers). Tranzy rows carry `bearing:null` → circles, never invented headings.
- Polling guardrails all in `app/use-source.ts`: abort on unmount/URL change `:52`, visibility+online gate `:54-55`, byte-identical no-rerender `:39-40`, error keeps last good copy with 60s backoff `:41-50`. Only new number: `pollMs:3000` (today `30000`, `app/transit-workspace.tsx:50` — **workspace-level poll stays 30000**; the per-line poll is separate).

| # | Task | Files | Owner | Gates / Verify | e2e (RED first) |
|---|------|-------|-------|----------------|-----------------|
| A1-1 | **RED**: per-line live-map spec — open a line from the routes grid, intercept `/api/transport-live?kind=vehicles&route=<id>` with an operator-shaped payload (pattern from `e2e/transit-view.spec.ts:83`); assert: stations + shape polyline + vehicle markers with heading telemetry on one map; seconds-tier staleness label; honest empty state (zero vehicles → the „un vehicul lipsă din flux nu înseamnă că linia nu circulă" note class, never an error block); no `live-error` on stale copy | `e2e/line-live-map.spec.ts` (new) | Builder-A | run against unmodified code → legs fail exactly on the missing surface; log kept in session artifacts | this task |
| A1-2 | **TTL 15s**: `realtimeLoader(kind)` — `ttl:30` → `ttl:kind==='vehicles'?15:30` (**arrivals/alerts stay 30**; **Tranzy loader at `:70` untouched**). Sync the `transport.realtime` reason string in `refresh-groups.json` ("TTL de 30 de secunde" → 15 for positions) and the README onDemand table | `lib/live/transit-realtime.ts:24`, `lib/live/refresh-groups.json` (reason text only), `README.md` (onDemand table + Transport staleness sentence) | Builder-A | `node scripts/verify-source-errors.mjs` (TPBI cells incl. honest-degrade), `node scripts/verify-refresh-sweep.mjs` (groups/crons unchanged) | — |
| A1-3 | **Seconds-tier staleness**: API emits `stalenessSeconds` (= floor seconds since `lastSuccessAt`) alongside `stalenessMinutes` on the transport-live surface (`:18`); client `stalenessText` (`app/transit-workspace.tsx:36-41`) gains a seconds branch ("acum ~X secunde" under one minute; minute/hour/day scale unchanged — flights precedent). IP: derive from payload's own `observedAt`/`lastSuccessAt`, never serve-time | `app/api/transport-live/route.ts:18`, `app/transit-workspace.tsx:36-41` | Builder-A | `node scripts/verify-model-contracts.mjs` if SourceState shape is asserted; tsc | A1-1 legs |
| A1-4 | **Per-line live layer in RouteReader**: independent `useSource('/api/transport-live?kind=vehicles&route='+route.id,{timeoutMs:8000,pollMs:3000})`; merge render: station points + vehicle `MapPoint`s (bearing/speed/occupancy passthrough) + shape path on the existing `PublicMap`; visible-vehicle count + per-source `Freshness` + the seconds-tier label; per-variant (headsign) vehicle grouping where the feed's tripIds map to the selected variant's `tripIds` | `app/transit-workspace.tsx` (RouteReader, `:22-31` region) | Builder-A | `corepack pnpm lint` + `tsc --noEmit`; `node scripts/audit-controls.mjs` (labels/close handlers on any new controls) | A1-1 |
| A1-5 | **Line picker UX**: line cards already open RouteReader (`selected` state at `:46`); make the vehicles-mode `routeFilter` select a picker that opens the per-line live view for the chosen line (set `routeFilter` + `selected` together); every line in `network.routes` reachable, registry is the source of truth | `app/transit-workspace.tsx` (`:46-50`, `:63` region) | Builder-A | `node scripts/audit-controls.mjs`; `node scripts/verify-sweep-inventory.mjs` | A1-1 + picker leg (select → dialog opens with that line) |
| A1-6 | **Battery/hidden-tab/unmount guardrails (RED)**: intercept and count requests; assert (a) ~3s cadence while visible (window 2.5–4s), (b) CDP `Emulate.setPageVisibilityState:'hidden'` → request count frozen over ≥2 intervals, resumes on visible, (c) dialog close (unmount) → no further requests after the abort window, (d) byte-identical response → no busy churn / stable pin count (byte-identical SWR, `use-source.ts:39-40`) | `e2e/line-live-map.spec.ts` | Builder-A | full `corepack pnpm test:e2e` (budgets: 120s/15s — never weaken an assertion to green, widen a timeout) | this task |
| A1-7 | **Rate math registered** (see section below) in README transport description + conventions.md — client 3s poll, worker 15s TTL, one D1 copy for all viewers; state explicitly that `no-store` stays (`app/api/transport-live/route.ts:20`) and the micro-cache is a deferred option | `README.md`, `conventions.md` | Builder-A → Scribe review | README re-read against final diff | — |
| A1-8 | **Wave-A1 exit gate**: `tsc --noEmit` 0 errors; `lint` 0 errors (warnings budget ≤117); `test:e2e` green incl. new legs; `verify-source-errors.mjs`, `verify-refresh-sweep.mjs`, `verify-snapshot-transport.mjs` green; no git commit inside the session (session rule) | — | Builder-A + Validator | battery above | — |
| A1-9 (follow-up, P2) | Tranzy per-line view (localities outside TPBI coverage get a per-agency line map over `/api/tranzy-live` — circles only, `bearing:null`); **Tranzy TTL stays 30** | `app/transit-workspace.tsx`, `app/api/tranzy-live/route.ts`, `lib/live/transit-realtime.ts:70` (no change) | Builder-A (after A1-8) | same battery | extend the spec |

**A1 reuse rules**: no new endpoint (the `route=` filter is live), no new Map component (extend RouteReader's map render), no per-view loader (one `readSource` copy), no cron, no relay. The stale-copy-keeps-map honesty rule (README:16-17 comment, `route.ts:18`) carries to the new label.

### A1 rate math (registered — D2 evidence)

- Worker→TPBI: TTL 15s → at most 4 source fetches/min across **all** viewers (single D1 row, single writer via `lock_until` 60s lease, `lib/live/cache.ts:62`); vs TPBI budget comfort of GTFS-RT norms (10–30s consumer polling).
- One viewer-hour on the per-line view: ~1,200 `/api/transport-live` requests (~1.2% of the Workers free plan 100k/day) and ~2–5 D1 row reads per request (cache row + payload chunks via `cache.ts:20`) ≈ 5k reads/hour (~0.1% of 5M/day).
- CPU: one JSON.parse of the cached vehicles payload per request (route filter applied in-route after `readSource`) — bounded, small.
- Client: poll ticks fire only when visible+online (`use-source.ts:54`); abort on unmount (`:52`); byte-identical responses never re-render (`:39-40`).
- Contingency (deferred, D2): edge micro-cache `Cache-Control: public, max-age=2, stale-while-revalidate=2` on this one route only if concurrency grows — honest because staleness derives from the payload's own observed timestamps, not serve time.

### A2 — Corpus hygiene (points 2, 9, 11, 12) — gated by the D3 table FIRST

Recency anchors already coded (keep, generalize, never gut): catalog seeds `modified >= 3y` (`lib/live/cache.ts:15`); company history rolling 3y (`lib/live/cache.ts:70`, mirrored in the view copy `app/live-company.tsx:17`); CNAS resource editions within 3y (`lib/live/directories.ts:11`); nightly-boundary staleness reset (`cache.ts:26-27, :60`). Legislation keeps in-force semantics (`lib/live/legal-consolidation.ts` — year-independent); places/films/registries have **no** age semantics by design.

**The D3 per-family policy table (the contract — pinned by the new gate):**

| Family class | Rule | Coded anchor |
|---|---|---|
| News feeds / announcements (`FeedCards`, stiri) | last 3 years (future-first ordering already exists) | feeds readers |
| Events / spectacole / cinema calendars | future-facing (past events drop naturally) | `lib/live/events.ts` |
| CKAN dataset browsing | `modified >= 3y` (already coded — keep) | `lib/live/cache.ts:15` |
| ANAF company history | last 3 fiscal years (already coded — keep; the firm exemption is about *existence*, and ANAF already serves full existence) | `lib/live/cache.ts:70`, `app/live-company.tsx:17` |
| CNAS/registry resource editions | latest edition within 3y (already coded — keep) | `lib/live/directories.ts:11` |
| Legislation / legal acts | **in-force regardless of year** (repeal/expiry is the death criterion, tracked by consolidation) | `lib/live/legal-consolidation.ts` |
| Court dosare | **full period** (user-exempt) | `lib/live/justice.ts`, `lib/court-history.ts` |
| Places / geography / heritage | **exempt** (no age semantics — 181,537 records) | `public/places/manifest.json` |
| Films / cultural catalog | **exempt** | films corpus |
| Professional registries (notari/avocați/experti) | **exempt** (standing, not age) | `lib/live/lawyers.ts`, justice registries |
| Transport network/schedules | edition TTL governs (already) | GTFS loaders |

"Dead data" definition (point 11): **no-content records, expired-source rows, irreversible stale-without-copy states** — plausibly broken-links — identified per family by the probe pass, **never by age alone**.

| # | Task | Files | Owner | Gates / Verify | e2e |
|---|------|-------|-------|----------------|-----|
| A2-1 | **RESEARCH probe pass** (point 10, folded here): curl probes against every family the wave touches — response shapes for the enrichment fields Wave B will join on (ANAF bilanturi/registru shapes, CKAN store rows, MJ SOAP envelopes, venue calendar JSON-LD, TPBI/Tranzy headers incl. rate-limit headers at the 15s cadence); politeness ledger in the session STATUS (curl commands + timestamps, ≤4 TPBI/min); DDG as a **manual research aid only**; captured fixtures land as new cells in `verify-source-errors.mjs` | session dir `RESEARCH.md` (this directory), `scripts/verify-source-errors.mjs` (new cells), fixture files under `archives/` per existing pattern | Builder-B (probe) | `node scripts/verify-source-errors.mjs` green with the new cells | — |
| A2-2 | **Recency-policy verify gate**: new `scripts/verify-recency-policy.mjs` — asserts each table row's coded anchor exists with its exact constant (the `3*365.25*86400000` window at `cache.ts:15`, the `getUTCFullYear()-3` merge at `cache.ts:70`, the directories window at `:11`), asserts legislation has no year filter, and structurally asserts the exempt readers carry no age predicate. Register in `pr-validation.yml` verify job + README battery list | `scripts/verify-recency-policy.mjs` (new), `.github/workflows/pr-validation.yml`, `README.md` | Builder-B | the script itself; battery entry registered | — |
| A2-3 | **Dead-data census**: `scripts/audit-dead-data.mjs` — offline corpus reader, per family: rows with no content / expired-source / beyond-horizon vs the policy table → emits `docs/hygiene/dead-data-census.md` with a per-family purge-or-label plan. **No deletion in this task** — the census + plan are the deliverable and go through review before A2-5 executes anything | `scripts/audit-dead-data.mjs` (new), `docs/hygiene/dead-data-census.md` | Builder-B | script exit 0 over the full corpus; census reviewed against the D3 table | — |
| A2-4 | **Formats audit** (point 9): enumerate the surfaces where odd formats leak raw today — unix seconds/ms, ISO8601Z, bare ISO dates, epoch strings visible in `MetadataFields` panels (`app/metadata-fields.tsx`) and typed rows. Findings list goes in `docs/hygiene/formats-audit.md`; fixes promote **typed display alongside the raw disclosure** via `dateText`/`displaySourceDate` (`lib/live/date.ts` — already handles years, ranges, `dd.mm.`, local-clock stamps) — raw panels are never replaced (honest-disclosure principle). Audit the flight/epoch precedents (ft→m, kt→km/h, epoch→ISO) for stragglers | `docs/hygiene/formats-audit.md` (new), then per-surface fixes in the owning `app/*-workspace.tsx` / `app/live-data.tsx` consumers; `lib/live/date.ts` only if a shape is missing | Builder-B | per-surface `tsc`/`lint`; `node scripts/verify-ro-text.mjs` if text rules touched | date-format legs in the owning specs where a typed row is asserted |
| A2-5 | **Unused-fields census** (point 2 substrate): `scripts/audit-unused-fields.mjs` — per family, diff fields the loaders fetch vs fields any surface renders (loader `details` blobs vs typed row keys) → `docs/hygiene/unused-fields.md` — **the enrichment gap-list that feeds Wave B** (each unshown field is a candidate for a typed, attributed display — not automatic; the gap-list assigns each to Wave B by entity key) | `scripts/audit-unused-fields.mjs` (new), `docs/hygiene/unused-fields.md` | Builder-B | script exit 0; gap-list cross-referenced with B-task join plans | — |
| A2-6 | **Purge execution + corpus proof regeneration** (only what A2-3's approved plan sanctions): deletion per family only where the census + policy table both approve; corpus regeneration through the established importers (`scripts/import-places.py` + `finalize-places.py`, `import-transit.py`, `import-stories.py`, `import-expanded-snapshots.mjs`); sha256 proofs regenerate via the standing pipeline (`compress-snapshots.py` runs pre-build; manifests carry byte+sha). **Flag**: `scripts/verify-sweep-inventory.mjs:48` pins the 181,537 places count — any places change is a deliberate gate edit that must cite the policy table row; README coverage tables updated in the same change | family-specific: `public/places/**` regenerated artifacts, `public/transit/**`, `public/stories/**`; pinned-count edits where sanctioned; `README.md` counts | Builder-B (after census review) | `verify-expanded.mjs`, `verify-snapshot-transport.mjs`, `verify-catalog.mjs`, `verify-sweep-inventory.mjs`, `verify-packed-seeds.mjs` — all green post-regeneration | sweep-regressions spec stays green |
| A2-7 | **Wave-A2 exit gate + battery registration**: all four new/updated scripts in `pr-validation.yml` in battery order + README battery sentences; `tsc`, `lint` (≤117 warnings), full `test:e2e` | `.github/workflows/pr-validation.yml`, `README.md` | Builder-B + Validator (review) | the registration diff itself | — |

---

## Wave B — Cross-source enrichment, merge-with-attribution (points 3 + 7) — after A lands

**The one rule (D4)**: joins ONLY on validated identifiers, each enriched field rendered **grouped by its source**, never name similarity, never storage-level dedup. The provenance pattern to follow is already shipped and is the model: `combineCompany` in `lib/live/knowledge.ts:6` — per-field `provenance[field]={source,url,verifiedAt,referenceDate}`, exact `RO+CUI` Wikidata match (`P3608`), multi-match → honest warning **without** merging, rendered via `app/company-provenance.tsx` + per-source `Freshness` lines + raw `MetadataFields` preserved.

Validated keys in the estate (all regex/shape-checked at boundaries — reuse, don't reinvent): **CUI** (`/^[1-9]\d{1,9}$/`, `app/live-company.tsx:18`), **dosar number** (`\d{1,8}/\d{1,5}/\d{4}(/…)?`, `lib/court-history.ts:14`), **act id** (`officialLawUrl` / `law-tracked:v1:` keys, `lib/live/legal-registry.ts:7-9`), **SIRUTA** (localities API + geographic scope), **venue id** (`public/events/venues.json` validated registry, `lib/live/events.ts:3-5`), **OSM/Wikidata ids** (places merge in `app/v2-model.ts`; the name+1km dedup guard from the 10/07 map waves is the standing rule — a pure-name join stays forbidden).

| # | Entity / join plan (validated key) | Concrete fields joined (per surface) | Files | Owner | Gates |
|---|---|---|---|---|---|
| B-1 | **CUI** — company card. Already: ANAF registru (identity fields, provenance map) + 3y bilanturi + Wikidata exact VAT match (websites, leadership). New per the A2-1 probe findings: CKAN data.gov.ro company-adjacent datasets joined **on CUI where the dataset schema carries it** (e.g. additional registry fields); each added field gets a `provenance` entry + per-source Freshness | `lib/live/adapters.ts` (loadCompany), `lib/live/knowledge.ts`, `app/live-company.tsx`, `app/company-provenance.tsx` | Builder | `verify-live.mjs`, new `verify-enrichment-joins.mjs` (B-7) |
| B-2 | **Dosar number** — court card. Already: stage grouping fond/apel/recurs with explicit-judgment evidence (`lib/court-history.ts:29-40` — the validated reference extraction), court registry details via normalized institution labels (`:21`). New: institution metadata (court type/city from `public/courts/institutions.json`) surfaced on stage rows; dosar→legal-act links **only where an act id is explicitly cited** in a solution (probe validates availability — otherwise an honest "nu sunt disponibile" note, never a search guess) | `app/court-history-panel.tsx`, `app/courts-workspace.tsx`, `lib/court-history.ts` (read-only extensions), `lib/live/court-references.ts` (index reuse) | Builder | `verify-court-links.mjs`, `verify-courts-workspace.mjs` |
| B-3 | **Place / Q-id** — place cards & profile. OSM record fields + Wikimedia imagery joined **on the exact id from the source row** (record id / Q-id); imagery via the **attestation register** (hotlink+credit+license — `public/media/manifest.json` schema), never bulk-hosted; duplicate-name-place protection is the existing name+1km rule, asserted not relaxed | `app/places-workspace.tsx`, `app/v2-model.ts`, `public/media/manifest.json`, `app/public-media.tsx` | Builder | `verify-exploration-media.mjs`, `verify-media-budget.mjs`, `verify-expanded.mjs` |
| B-4 | **Act id** — legal reader. Already: consolidation selection, tracked registry, reader/PDF exports with verification dates. New (probe-gated): MJ portal event/act metadata where the portal exposes it for the same act id; anything not programmatically available stays an honest absence | `lib/live/legal-consolidation.ts`, `lib/live/legal-registry.ts`, `app/legal-workspace.tsx` | Builder | `verify-legal-records.mjs`, `verify-legal-reader.mjs`, `verify-law-navigation.mjs` |
| B-5 | **Venue id** — event cards. Join events items ↔ validated venue registry fields (address city/county, coordinates, institution url) on the venue id the loader already stamps (`lib/live/events.ts:20` `venue:venue.id`); venue→places cross-link **as a link** (federated), not a merge, where the venue id matches a places record id — never by name | `lib/live/events.ts`, `app/events-workspace.tsx` | Builder | `verify-sweep-inventory.mjs` (venues registry pinned), `events-venues.spec.ts` |
| B-6 | **Federated cross-links where no key exists** — extend `lib/live/federated.ts` with a v5 family of **cross-entity links** (e.g. place → venue-calendar link, dosar → court registry link, CUI → firm watch): discovery + deep-link, explicitly NOT merges (D4's honest ceiling) | `lib/live/federated.ts`, `scripts/verify-federated-search.mjs`, `e2e/federated-search.spec.ts` | Builder | `verify-federated-search.mjs`, `federated-search.spec.ts` |
| B-7 | **Join-truth gate**: new `scripts/verify-enrichment-joins.mjs` — structurally asserts: every join call site resolves on a validated key predicate (CUI/dosar/act/SIRUTA/venue/Q-id regex map); every enriched field renders inside a provenance group; multi-match surfaces a warning; **no** name-similarity in join code paths. Register in battery + README | `scripts/verify-enrichment-joins.mjs` (new), `pr-validation.yml`, `README.md` | Builder | the script + battery |
| B-8 | Wave-B exit: lint/tsc/e2e + the owning family gates above; README "Revizia" update describing the joins under the existing honest-coverage format (what each source adds, what it does not guarantee) | `README.md` | Scribe | README re-read against diff; llms-full surfaces list only if the surface set changed | fleet e2e |

**Wave-B fixture rule**: every newly joined family gets its probe fixture in `verify-source-errors.mjs` (the reader–setter contract cells) before the loader changes — the A2-1 research output is the input.

---

## Wave C — UI polish + images (points 1, 4, 6, 8) — rides on A2+B enriched data

Reference surface inventory: the existing 62-surface audit from the session brief, pinned mechanically by `scripts/verify-sweep-inventory.mjs` (16 domains / 51 sections + standalone workspaces) and `scripts/audit-controls.mjs` (structural control/label/state census — every dialog has a close handler, every input a label). Idioms already shipped: vpanel, record-list, facts-table, reader-dialog, `panel-top` kicker+icon (lucide grid), category illustrations on every card, lightbox + credits.

| # | Task | Files | Owner | Gates / e2e |
|---|------|-------|-------|-------------|
| C-1 | **Per-domain card/dialog/detail pixel pass** over the 16 domains (Typo/density/spacing on enriched cards only — post-B data). Per-domain: read the surface against its enriched payload, adjust CSS in the owning `app/*.css` + component files; NOTHING from the Already-Done register is redone | `app/complete-data.css` + per-domain `app/*-workspace.tsx` | Builder (per-domain arcs) + Validator | `verify-css-keyframes.mjs`, `audit-controls.mjs`, `visual-compare.mjs`/`pixel-diff.mjs` vs. before-shots; Playwright MCP live verification where stable, local probes fallback (per Tools decision) |
| C-2 | **Icons for detail fields**: lucide map for every newly enriched typed field (the `panel-top` kicker+icon pattern is the established idiom; `lucide-react` already the only icon source) | per-domain workspace files / `app/live-data.tsx` shared rows | Builder | `audit-controls.mjs`; e2e per-domain specs assert the icon row renders |
| C-3 | **Complex cards + dialogs where enrichment added content**: richer vpanel/facts-table variants carrying provenance groups + imagery; every overlay keeps the labeled ≥44px close control and works mobile-first (320px checks — README Chrome-frame convention) | owning `app/*-workspace.tsx`, `components/ui/*` (only if a dialog variant is genuinely needed — reuse first) | Builder | `audit-controls.mjs`, owning e2e specs |
| C-4 | **Image attestation extension** (D5, point 4): extend the register **only where a source provides imagery per entity type** (per the A2-1/B research: Wikimedia/Commons for Q-id entities, venue calendar media[] for events, OSM image tags for places); every added row keeps full attribution (`author/license/license_url/source_page_url` + sha256 + bytes — the `verify-media-budget.mjs:32-37` completeness checks); **no bulk downloads**; ceilings assert: ≤15,500 media files, ≤20,000 shipped census (both with headroom today) | `public/media/manifest.json`, `scripts/build-media-variants.mjs` if variants needed, `app/category-photo.tsx`/`app/public-media.tsx` render | Builder | `verify-media-budget.mjs`, `verify-exploration-media.mjs` |
| C-5 | **Wave-C exit + docs**: full battery + e2e; README revizia entry; per-domain screenshot evidence in session artifacts | `README.md`, session artifacts | Scribe | README vs diff; llms-full only if surfaces changed | fleet e2e |

---

## RESEARCH leg (point 10) — probe pass, folded into A2-1 and B briefs

The estate's probe discipline (politeness ledger in every session STATUS, `scripts/verify-source-errors.mjs` — 49 families / 196+ cells incl. the honest-degrade matrix, post-merge `--live` passes) IS point 10's "know how each source responds". This session extends it (A2-1) with curl-based probes targeted at: (a) the 15s TTL cadence against TPBI (rate-limit headers, `Retry-After`), (b) the exact response shapes the Wave-B joins consume (ANAF bilanturi rows, CKAN datastore schemas, MJ SOAP envelopes for act metadata, venue JSON-LD fields incl. image/offer shapes), (c) every family A2 purges from. DuckDuckGo is a manual research aid during discovery only (D6) — zero repo wiring, and if the user's intent was actually a DDG-powered UI search box, that is a separate explicit product decision.

## Risk register

| # | Risk | Sev | Mitigation (this plan) |
|---|---|---|---|
| R1 | TPBI intolerance at 15s source TTL long-term | MED | Single D1 writer caps fetches at 4/min for ALL viewers; A2-1 probes rate-limit headers; rollback is one constant (`transit-realtime.ts:24`); documented MEDIUM confidence in D2 |
| R2 | Over-eager purge destroying valid corpora (in-force legislation, 181,537 places) | HIGH | Census (A2-3) → review → only sanctioned purge (A2-6); `verify-recency-policy.mjs` pins the table; pinned counts (`verify-sweep-inventory.mjs:48`) must change **together with** a cited policy row |
| R3 | False cross-source merges (wrong firm's data on a card) | HIGH | D4 key-only joins; B-7 structural gate; the knowledge.ts multi-match warning pattern; federated links where no key |
| R4 | Unmetered public 3s endpoint under sharing load | MED | Rate math registered; `no-store` kept; edge micro-cache is a pre-designed deferred fix (D2) |
| R5 | A1∥A2 build interference (mid-edit shared gates) | MED | Strict file partition (Builder-A/B disjoint file sets, listed above); final per-builder battery re-run at wave exit (10/07 lesson, recorded in ux-friction STATUS) |
| R6 | Hidden-tab/battery e2e flakiness (Playwright can't set visibilityState directly) | LOW | CDP `Emulate.setPageVisibilityState` via `page.context().newCDPSession` — the probe style this repo already uses; generous e2e budgets (120s/15s) without weakening assertions |
| R7 | Places/transit corpus regeneration touching pristine sha256 proofs | MED | Regeneration only through the established importers; `compress-snapshots.py` + manifest checks (byte+sha) re-verified by `verify-packed-seeds.mjs`/`verify-expanded.mjs`; CI build-restore already tolerates seed-snapshot churn |
| R8 | Enrichment violating the honest-disclosure ethos (silent merges, hidden provenance) | MED | B-7 gate + per-source Freshness rendering; raw `MetadataFields` stays on every surface untouched |
| R9 | Doc drift (README/llms describing stale behavior) | LOW | Every wave includes its README sentences in the same change; Scribe re-reads words against the final diff |

## Already-Done exclusions (from ADVOCATE-REVIEW.md — cite in every builder brief; do NOT redo)

- **CSS/UX base**: padding/shadows pass (10/07), mobile-nav tap-fix (9 legs), preload audit (3 legs), hero/cover srcset + font subset, pin declutter + nearest-click resolution, scroll-padding bands. Wave C only does the *post-enrichment* typographic/density pass.
- **Raw disclosure**: `MetadataFields` "Toate datele publicate de sursă" on every surface — A2/C add typed rows *alongside*, never replace.
- **Images baseline**: category AI illustration on every card, hero/covers variants, lightbox + credits, attested/hotlink register with `was→now` progression. Only *extension* where sources provide (D5).
- **Transport live baseline**: per-locality vehicles map (TPBI radius + Tranzy per-agency, bearing/speed, staleness label, stale-copy honesty), `route=` filter live. Only the **per-line view** is new.
- **Cards/dialogs idioms**: vpanel / record-list / facts-table / reader-dialog. Only richer variants riding enriched data.
- **Icons**: lucide `panel-top` kicker+icon grid everywhere — continuous polish only.
- **Human formats**: `dateText` widescale, ft→m, kt→km/h, epoch→ISO, occupancy labels, RO plurals `countText`. A2 (straggler audit + seconds age tier for the map) only.
- **Live probes**: politeness ledger + 49-family matrix + post-merge `--live` discipline — extended, not rebuilt.
- **Recency anchors**: catalog 3y, firm 3y rolling, CNAS 3y — kept as-is, generalized with exemptions.
- **Watch („Urmărește")**: fully shipped 10/07 — untouched by every wave.

## Agent assignments (summary)

- **Builder-A** (orchestrate-builder): Wave A1 — tasks A1-1…A1-8 (+A1-9 follow-up after review).
- **Builder-B** (orchestrate-builder): Wave A2 — A2-1…A2-7; probes first (RESEARCH), policy gate before any purge.
- **Builder** (orchestrate-builder): Wave B (B-1…B-7), then Wave C (C-1…C-4). Per-review sequencing after each arc.
- **Validator** (orchestrate-validator): per-wave — owns the RED-first e2e legs review, battery re-runs, and the exit gates; verifies census output before A2-6 executes any purge.
- **Scribe** (orchestrate-scribe): README revision entries per wave, battery registration sentences, llms-full only if the surface set changes.
- **Specialists recommended**: **orchestrate-devops** — battery/CI registration steps (A2-7, B-7, C exits; `pr-validation.yml` ordering + actionlint-free YAML correctness). **orchestrate-security** — audit of the 3s public route (no payload logging, validated filters, rate posture) before A1 exit. **orchestrate-uiux** — Wave C pixel passes under the existing design system (reuse-before-invent, `audit-controls` census). **orchestrate-performance** — optional review of the 15s TTL + D1 read math before deploy (math already registered above). No database specialist (no schema change — `source_cache` reuse only, fragments untouched); no new API surface (B extends loaders, not routes).

## Execution order recap

```
Wave 0 (done): Advocate review — D1..D6 ACCEPTED (binding) + this PLAN + conventions.md
Wave A (concurrent, partitioned files):
  A1  Per-line live map: e2e RED → TTL 15s (TPBI vehicles only) → stalenessSeconds
      → RouteReader live layer (pollMs 3000) → line picker → guardrail e2e → rate math → exit gate
  A2  RESEARCH probes → verify-recency-policy gate → dead-data census (no deletion)
      → formats audit → unused-fields census → sanctioned purge + regeneration → battery registration
Wave B: joins per validated key (CUI/dosar/place-Q/act/venue) with per-field attribution
      + federated cross-links (no-key cases) + verify-enrichment-joins gate
Wave C: per-domain pixel passes + icons + enriched cards/dialogs + attestation extension
      (rides on enriched data; Playwright MCP verification, visual-compare evidence)
```

Facts in this plan are file:line-anchored to this worktree at 2026-10-08; the Already-Done Register and Decision Outcomes in `ADVOCATE-REVIEW.md` are the authoritative scope boundaries.
