# Implementation Status

## Session
sweep-federated-search — subagents mode, session dir ssnc-agent-orch/2026/10/06/sweep-federated-search (branch main; feature branch cut by orchestrator at Phase 3)

## Current Phase
Phase 2: Architecture finalized (PLAN.md complete: inventory enumerated, tasks owned, specialists set). Next: orchestrator dispatches T1.1 (DevOps) / T1.3 (UI/UX) / T2.1 (API) in parallel.

## Session Log
- [orchestrator] Requirements consolidated from the verbatim /build prompt (sweep every category/object, federated all-category search, weather animations) + product-vision fragment recorded as North Star; scope (a) approved by delegation (prompt.md Q1/Q2)
- [architect] Mode: standalone /build, SESSION_DIR detected; extension config absent (.claude/ssnc-agent-orch/agents.yaml + git-workflow.yaml checked — no entry, default role); tech stack detected: TypeScript/Cloudflare-Workers (vinext/React 19/Playwright) → conventions.md written (repo house conventions distilled from search-ux-validation-pass STATUS — binding)
- [architect] Codebase analysis complete (see Architect Findings); PLAN.md finalized: 15 tasks, 4 phases, specialists uiux/api/devops (security N/A, performance conditional), Complexity Score 4/10; feasibility flags recorded (notaries-registry missing, cinema/events excluded v1, stories client-corpus check, budget-bounded "every object")

## Architect Findings

### Tech stack (detected)
TypeScript strict (`@/*` → repo root); Cloudflare Workers via vinext (`dev` on 127.0.0.1:5173, `run-framework.mjs`); D1 + drizzle; `env.ASSETS` snapshot reads with SHA-256 proofs; React 19 client components; Playwright 1.63 e2e (reuseExistingServer — the :5173 server is pre-existing, leave it); `corepack pnpm` only. Conventions written to `conventions.md` — the binding ones: no comments except business rules, Romanian user strings, transpile-import TDD harnesses, **new lib module ⇒ extend the closed stub resolvers (verify-location.mjs / verify-search-ui.mjs) in the same change**, source budget ≤2 direct fetches/family, honest-degrade never 5xx (AFIR class = source-blocks-Workers-egress, honest-degrade UX already shipped — do NOT "fix" at the fetch layer), motion gated by prefs.motion + prefers-reduced-motion.

### Component 1 — SWEEP (R1): how enumeration works today + the harness design
- **The registry spine** (enumerate, not guess): `v2-model.ts` exports 16 domains; `lib/dashboard-topics.ts` `topicSections` maps each domain to its section tabs (46 sections total + an auto 'data' tab per domain → 62 domain surfaces); `app/domain-workspace.tsx:13-33` `content(id)` maps section ids to components; `catalogTopic` remaps vreme→mediu, povesti→cultura for the catalog tab.
- **The object inventories**: `public/places/manifest.json` (178,868 OSM objects; 16 category indices incl. local-all; ~70 subcategories incl. **Avocați**, **Notari**, Săli de concerte — the user's examples all live here); `/catalog/index.json` snapshot (CKAN datasets, 14 categories + 'alte'); CNAS XLSX full copies ×3 + schools datastore (server-paged); SIRUTA (localities); legal snapshots + courts institutions registry; GTFS at startup; stories corpus client-side; cinema sites; feed kinds (7 hosts + AFIR + filme).
- **The parity harness to extend**: `scripts/verify-source-errors.mjs` — `families` table (currently 6: weather/open-meteo, company/anaf, courts/portal.just, feeds/stiri, catalog/ckan, transport/tpbi), DEFAULT = 36-cell mock matrix (transpiled route modules + in-memory D1 + mocked fetch), `--live` = one app-route fetch per family → direct loader fetch ≤2 ONLY for surfaced errors → verdict ok/budget/source/our-bug/recovered. New families to add: directory×4, lawyers/ifep, legal/law, localities/siruta, feeds/afir (KNOWN class — pre-classified), feeds/filme, events/odeon, stories/wikisource, transport-realtime, cinema. **The SOURCE-BLOCKS-EGRESS class needs a deployed-worker leg** (`AFLIVRA_VERIFY_DEPLOYED_BASE`) — dev+direct both work for AFIR; only the worker fails. That leg is our own infra (no source budget).
- **Rendering/model audit**: probe scripts (probe-*.mjs precedent — UI/UX used them in the last session) at 390+1280 for all 15 routes × 62 surfaces; model contracts offline over FULL snapshot corpora via a new transpile-import harness. Exhaustive-vs-sampled rule recorded in PLAN (the user's own budget discipline bounds "every object" for source-paged families).
- **Dosar model** verified present: `lib/court-history.ts` — Fond/Apel/Recurs stage ranking, evidence-only reference extraction (explicit judgment + court + target number; comment at line 22-23 states the business rule). Legislative structure: legal-consolidation `verifiedConsolidation`/`asOf` consumed in /api/legal POST.

### Component 2 — FEDERATED SEARCH (R2): current state (verified) + design
- **No /api/search route exists** (app/api/ has 22 route dirs — verified; none named search). **Decision: client-side fan-out over existing routes, NO new backend** (matches the pre-approved architecture line).
- **Existing search plumbing**: `search()` at page.tsx:77 — numeric 2-10 digits → `go('company', cui)`, else `go('explore', undefined, q)`; the explore view seeds `PlacesWorkspace` (:113, only under places filters!) + `LiveCatalog` (:117) with `q`; the gallery filters the editorial `places` client-side (`norm().includes`, :82); `CompanyCard` company-intent heuristic (:91). Today "sala"/„notari"/„școli" would NOT fan out — places search only hits cultura/mediu-derived categories, directory/lawyers never see the query from the main page.
- **Searchable routes (all cached, all budget-free)**: /api/places (q, category=local-all covers all 178,868), /api/catalog (q), /api/lawyers (q ≥3 chars), /api/directory ×4 kinds (q), /api/domain?kind=stiri|agricultura (q, server fans cached feeds), /api/legal POST (dosar: number regex-gated / name ≥3), CUI numeric shortcut. Stories: /api/story is id-only — client corpus list check at build (flag). Cinema/events excluded v1 (locality/day-scoped — flagged).
- **Navigation mechanism**: `go(view,id,query)` + hash; NEW validated `tab` param (against topicSections registry); `DomainWorkspace` gains initialTab + passes initialQuery; seed props added to LawyersWorkspace/RecordBrowser/LegalWorkspace(courts)/StoriesWorkspace — LiveCatalog + PlacesWorkspace already accept `initialQuery` (precedent). Grouping = domain registry order; counts via `countText`; one grouped list, chips preserved.
- **Result shape**: {category/groupId, view, tab, title, subtitle (source/organization/city), snippet?, id?, seedQuery}. Per-group honest busy/error/empty states (Empty + shimmer patterns exist); global honest empty when all groups empty.

### Component 3 — WEATHER (R3): where animations go
Surfaces: home pulse weather button (page.tsx:99, CSS-only hook preferred); dashboard Stat + WeatherStations (page.tsx:128); domain vreme/mediu tab + place insights tab (WeatherStations from app/weather-workspace.tsx, re-exported by live-data.tsx). **The hook exists**: `WeatherStations` already computes `background` = 'snow'|'rain'|night/clear… from `weather_code` + `is_day` — the ambient scene class is one CSS family away. The seam: `.weather-scene` family (workspaces.css:48-54 — scene hero, 5rem temperature, backdrop-blur metric chips). Motion infra: `useExperienceMotion` (app/motion.ts — reveal/parallax already registered for `.weather-live-grid>article` — line 6), `aflivra-*` keyframes precedent (modern.css/polish.css), blanket reduced-motion + `.v2.no-motion` overrides already in every css file. Every new keyframe must be authored inside `.v2` scope to inherit the gates.

### Key files (the 15 that matter, for every agent)
1. `app/page.tsx` — router `go()`/:77 search shortcut/hash sync; explore view; hot file (Builder-B serialized)
2. `lib/live/query.ts` — shared query layer (normalizeSearch/queryMatcher/createSearchIndex/paginate/countText); federated layer's preferred home (closed-resolver constraint)
3. `lib/dashboard-topics.ts` — topicSections: the category→subcategory→component spine
4. `app/v2-model.ts` — 16 domains registry + editorial places
5. `app/domain-workspace.tsx` — section→component map; gains initialTab/initialQuery plumbing
6. `app/catalog-workspace.tsx` — LiveCatalog (search UX contract, initialQuery precedent)
7. `app/places-workspace.tsx` — PlacesWorkspace (initialQuery precedent, category/sub filtering)
8. `public/places/manifest.json` — the places sweep universe (16 categories, 178,868, subcategory list)
9. `lib/live/catalog-categories.ts` — 14 catalog categories → CKAN queries
10. `scripts/verify-source-errors.mjs` — the parity harness to extend (families table + mock matrix + --live)
11. `lib/live/refresh-groups.json` — source-family registry (5 groups / 21 members + seedBacked + onDemand)
12. `app/weather-workspace.tsx` — WeatherStations + the `background` condition hook (R3)
13. `app/workspaces.css` — .weather-scene family CSS seam for animations
14. `app/motion.ts` — the motion-gating precedent (prefs.motion + matchMedia)
15. `ssnc-agent-orch/2026/10/06/search-ux-validation-pass/STATUS.md` — canonical house-convention record (parity protocol, budget discipline, countText rule, e2e 28/28)

### Coordination decisions
- page.tsx + domain-workspace.tsx owned by Builder-B for the whole session (T1.5-page-fixes + T2.2 + T2.3 overlap them)
- scripts/verify-family owned by DevOps serially (T1.1/T1.2/T1.6 + battery lines); README battery lines ride each script's change (repo rule: same change)
- T2.1 (API) delivers the family layer + harness BEFORE T2.2/T2.3 UI consumes it; T1.3 rendering probe runs on local dev only, /api memoized per URL per run (rate-storm lesson)
- e2e baseline = 28 tests across 9 specs (verified e2e/ listing + prior session); any spec asserting routed strings must tolerate federated section additions above the gallery (strings below are additive)

### Complexity: 4/10 (final — raised from preliminary 2/10)
Justification: task-parallel phases with disjoint file ownership and both routers/conventions proven last session; the raise covers 62+15 surfaces to sweep, findings-driven T1.5 variance (the one unpredictable task), and two new router surfaces (tab param + federated list) whose regression surface (home-smoke, locality-instant, explore-place) must be explicitly guarded. Not higher: no cross-service coupling, single stack, no backend work, one serialized hot file.

### Feasibility flags (flag, not decided)
1. Notaries exist only as the OSM places subcategory „Notari" — a professional notary registry (UNNPR) is a new data source; out of scope, user decision later
2. Cinema/events excluded from federated v1 (locality/day-scoped corpora, no national q) — user decision if wanted
3. Stories federated family contingent on client-loadable corpus list (checked at T2.1 build; defer-with-rationale otherwise)
4. "Every object" exhaustive sweep is bounded by the user's own ≤2-direct-fetches/family budget: FULL offline verification for snapshot-backed corpora (incl. all 178,868 places), structural + sampled + parity for source-paged families

## API Findings (T2.1)

**Status: PASSED — contracts valid** (TDD RED→GREEN; tsc 0 errors; eslint clean; new-module rules honored)

### Deliverables (both NEW files, strictly additive — no existing file edited this task)
- `lib/live/federated.ts` — the federated family layer (pure, synchronous; NO new HTTP endpoint — client-side fan-out over existing cached routes, per Architect)
- `scripts/verify-federated-search.mjs` — the transpile-import TDD harness (6 legs: contract/family table, registry mirrors vs real repo data, eager families + term normalization, fan-out requests + gates, response mapping + honest degrade + immutability, group ordering/counts)

### Exported contract (for T2.2 Builder-B, T2.3 Builder-B, T2.4 Validator — also documented in the module head)
- `federatedSearch(term, options?) -> FederatedSearchResult` — synchronous/pure. Trims term; hard cap 200 chars (>200 -> honest Romanian note, zero requests); resolves eager families; plans one validated request per qualifying network family. Options: `{gallery?: readonly FederatedPlace[] (v2-model places), stories?: readonly FederatedStory[] (/stories/index.json — client corpus), maxPerFamily?: number (default 6)}`.
- `federatedCollect(result, family, response) -> FederatedSearchResult` — pure/immutable merge of ONE route response (SourceState JSON); duplicate/late responses for resolved families are dropped; `unavailable`/malformed -> honest per-family note (the AFIR class) — never throws; stale-with-data still maps rows.
- `federatedFamilies` — 13 descriptors `{id, label, source, kind, category?, minChars?, maxChars?, eager?, request?(term)->url}`.
- `federatedGroups` — registry-ordered `{id,label}[]` mirroring `v2-model.domains` (harness FAILS if the registry drifts — offline sync gate).
- `courtNumberTerm(term) -> string|null` — dosar regex gate (slash-space normalized, `^\d{1,8}/\d{1,5}/\d{4}(/[a-zA-Z0-9.]{1,20})?$`, whole-term only); exposes the courts-form seed for T2.3.
- `validDomainTab(domain, tab)` — validates `tab` ONLY against the topicSections registry (`'data'` = the auto tab) — **the validator T2.3 must call before writing any `tab` hash param** (the Security-noted checklist item).
- Types: `FederatedItem {family, category, subcategory?, id, title, subtitle?, snippet?, kind: place|company|lawyer|dataset|record|article|story|dosar, source, url?, target}` | `FederatedTarget {view: place|company|domain, domain?, tab?, id?, query?, sub?, courtNumber?}` (go()-semantics descriptor) | `FederatedGroupResult {id,label,items,count,families[]}` | `FederatedFamilyState {family, status: pending|done|gate|unavailable, total?, note?}` | `FederatedRequest {family,url}`.

### Families v1 (13)
- **Eager/local**: `gallery` (editorial places via opts — diacritic/case/multi-word matching via the existing matchesQuery), `stories` (client corpus — **INCLUDED: loadability VERIFIED** — StoriesWorkspace already loads `/stories/index.json` client-side via snapshotJson with SHA-256 proof; the harness searches the real 233-item corpus), `cui` (numeric 2-10 digits, mirrors the hero shortcut; item targets `go('company',cui)`), `dosare` (regex-gated; item carries `courtNumber` for the courts-form seed; also matched alongside other families when present).
- **Network (fan-out over existing validated routes, all `geoScope=national` for determinism)**: `places` (/api/places category=local-all — all 178,868), `catalog` (/api/catalog), `lawyers` (/api/lawyers, **min 3 chars, max 160** — gate surfaces the route's "cel puțin 3 caractere" wording honestly), `directory-schools|health|pharmacies|hospitals` (/api/directory, **max 100 chars** per-family gate), `stiri` + `agricultura` (/api/domain kinds; agricultura = the known honest-degrade AFIR class).
- **Excluded with rationale** (module head + here): cinema, events (locality/day-scoped — flag #2); transport (Bucuresti-Ilfov coverage gate, no national q contract); localities/SIRUTA (reference-lookup surface, not a discovery corpus — locality names surface via the places family); legislation-law search + films feed + weather + company-by-name (not in the v1 family plan; `'legislation'` reserved as a kind for a future law-search family). `notary-office` is NOT a kind: notaries exist only as the places subcategory „Notari" (no professional registry — flag #1).

### Grouping semantics (T2.2)
Groups render in `federatedGroups` (= domain registry) order regardless of response arrival order (harness proves it); `group.count` = displayed rows (countText-ready — the module emits numbers, T2.2 renders `countText(n,'rezultat','rezultate')`); the family state carries the source's FULL total (e.g. 1234 with 6 rows shown); a static family surfaces its group as soon as it is resolved/gated (done-with-0-rows, gate note, or unavailable error); item-derived families (places/catalog) create groups only when they own rows; per-group busy for still-pending families reads `result.families` (`status:'pending'`); global honest empty = no groups and no pending family.

### Target descriptors (T2.3 navigation map)
places -> domain `places` tab seeded `query=entry.name` (+`sub`=subcategory label); catalog -> domain `data` tab (LiveCatalog seeded by title, category via the existing catalogTopic path); lawyers -> justitie `lawyers` tab seeded by name; directory x4 -> educatie/sanatate tabs `schools|health|pharmacies|hospitals` seeded by record title; stiri/agricultura -> their domain `news` tab (FeedCards is NOT seeded in v1 — per the PLAN T2.3 seed list; rows carry external `url` for provenance); stories -> povesti `stories` tab seeded by title; gallery -> `go('place', id)`; cui -> `go('company', cui)`; dosare -> justitie `legal` tab + `courtNumber` (LegalWorkspace courts-form seed).

### Test evidence
- RED first: harness written + run against the tree BEFORE the implementation existed -> exit 1 (`RED: lib/live/federated.ts does not exist yet — implement the federated family layer to turn this harness green.`)
- GREEN: `node scripts/verify-federated-search.mjs` -> exit 0 (all 6 legs); re-run x2 -> exit 0 (stable).
- Registry gates pass against REAL data: v2-model domains (16, exact order+labels), directories config (4 labels), places manifest (every category except local-all owns a places section; „Avocați"/„Notari" present in justitie subcategories), stories corpus (233 items readable offline).
- `tsc --noEmit` -> 0 errors | `eslint lib/live/federated.ts scripts/verify-federated-search.mjs` -> clean (exit 0, no findings).
- Not run (not T2.1's to run): e2e (T2.4), CI battery wiring, deploy chain (T4.1).

### Handoffs (owner actions required)
1. **T2.2 (Builder-B)**: consume `federatedSearch`/`federatedCollect` in `app/search-results.tsx`; when wiring `@/lib/live/federated` into any component compiled by `scripts/verify-location.mjs` or `verify-search-ui.mjs`, extend BOTH closed stub-resolver lists in the SAME change (conventions.md constraint — also noted in the module head).
2. **DevOps (scripts/ serial owner)**: add `node scripts/verify-federated-search.mjs` to `.github/workflows/pr-validation.yml` battery + the README runbook line (not editable under this dispatch's additive-only rule).
3. **T2.3 (Builder-B)**: route every `target.tab` through `validDomainTab` and the `target.courtNumber` seed into the courts form; feed rows use `item.url` (external source) — FeedCards stays unseeded in v1.

## Validator Findings (T1.4)

**Status: PASSED (offline model-contract audit) — 1 OUR-BUG class finding (low severity), 11 data-gap/source-side findings, 0 integrity failures, 0 ordering violations, 0 shape defects on the primary contracts.** All verification OFFLINE (zero external fetches — budget discipline respected). Throwaway probes + full JSON outputs: `ssnc-agent-orch/2026/10/06/sweep-federated-search/probes/` (probe-places.mjs, probe-legal.mjs, probe-catalog.mjs, probe-live.mjs). The committed harness `scripts/verify-model-contracts.mjs` (PLAN T1.4 „Implement") is NOT written here — this dispatch is read-only; this register is its input.

### Findings table

| corpus | objects checked | contract checks | failures | class |
|---|---|---|---|---|
| places records (public/places/records, 299 chunks) | 178,868 / 178,868 (full walk, not sampled) | shape ×16 fields (id,name,categories,types,lat,lon,address,city,phone,email,website,openingHours,updatedAt,sourceUrl,locationApproximate,tags); coords in RO bounds; categories ⊆ registry; types↔categories consistency; subcategory ∈ manifest (73 labels); updatedAt/sourceUrl/`locationApproximate`↔id-prefix format; global (norm(name),id) order; dup ids; chunk sha256+bytes proofs; manifest count + 15 category counts + 5 contact counts | **56 objects** — index `search` diverges from the runtime normalizer (see finding P1); everything else 0 | OUR-BUG (low) |
| places indices (name+recent × 16 categories, 420 shards) + spatial (128 cells) + cities | 724,858 index entries + 178,868 spatial entries + 162 cities | shard proofs (sha256+bytes, decompressed); start/count continuity; per-category totals + id-set parity vs records (both directions); field parity index↔record ×13 fields; `chunk` refs valid; name order (norm,id) / recent order (updatedAt desc); spatial exact-once + correct floor(lat/lon) cell; cities shape+proof | 56 objects fail field-parity on `search` only (P1); ids/order/proofs/counts: 0 | OUR-BUG (low) |
| legal snapshots (public/legal-snapshots: manifest 6 + historical 6) | 12 law items, 6 code texts (civil 1.39M chars … munca 167K) | stored+content sha256/bytes proofs ×12; characters counts; consolidation shape via `verifiedConsolidation` (CODUL PENAL: versionDate 2026-07-23 ≤ asOf 2026-10-05 ✓); `lawSections` (3076/688/636/1293/721/368 sections; 2664/492/503/1134/603/298 articles); `lawNavigation` coverage 100% + no dangling/duplicated ids; `lawPage` walks every section exactly once; clause/list/note paragraphs present | **0** | clean |
| dosar model (lib/court-history.ts over public/courts) | 246 institutions + 1 confirmed reference + synthetic full-chain corpus | registry shape/unique ids; CourtReference contract (number regex, court ∈ registry, document/date/verifiedAt); **fond < apel < recurs instance ordering** on every built history (rank 0<1<2, courtLabel tiebreak) — 2/2 histories, 0 violations; evidence-only stage purity (no recordIds/hearings, availability='reference'); relatedCases ≠ self; historyComplete=false; extractCourtReferences negative probes (party-name / invalid source number / court outside registry → all correctly rejected); only an explicit sentință+court+target number creates a stage | **0** | clean |
| CKAN catalog inventory (public/catalog/index.json) | 5,251 / 5,251 | proof vs snapshot-transport registry; id uuid unique; title non-empty & not a UUID slug (raw `name` slug rendered nowhere outside the deliberate „Toate metadatele" dump — checked the render paths: card uses organization/geography/title/notes/formats only); organization/modified/license/resourceCount/formats/categories ⊆ 14 catalogCategories ids (all 14 non-empty; 'alte' bucket 2,983 by design); every id has a detail file | 5 items resourceCount=0 + formats=[] (render „0 resurse" + honest empty dialog) | data-gap |
| CKAN dataset details (public/catalog/datasets, all files) | 5,251 / 5,251 detail files read in full (800 deep-checked for unexpected keys) | id echo; title/organization/notes/url; `metadata_modified`→modified, `license_title`→license, resources{ id,name,format,url,last_modified } (openDataset contract); inventory↔file resourceCount parity | 133 files license_title=null (fallback „Licență neprecizată" by design); 683 resources last_modified=null (renders „Nefurnizată de sursă"); 416 resources nameless + 249 format-less + 81 non-http(s) urls (chips render blank/id-selection unaffected); '.pdf'/'.xlsx' leading-dot formats render raw in chips | source-side + data-gap |
| catalog seed pool (lib/live/catalog-seed.json) + proofs registry | 1,662 entries + 6,534 snapshot-transport proofs (catalog+places+stories+transit) | entry shape; category ⊆ 14 ids; every requested category (incl. the energie/agricultura→mediu, filme→cultura, stiri→justitie fallback remaps) resolves a non-empty pool; 3-year recency filter leaves 1,661/1,662; **all 6,534 proofs verified (stored+content), 0 failures, 0 unregistered files** | 419 entries CKAN `num_resources` ≠ payload `resources.length` → api-mode card shows „N resurse" while the dialog lists the actual chips (P2) | source-side |
| weather ANM (seed.json + demo-data.json) | 162 + 162 stations | WeatherStations contract: name/lat/lon/temperature/humidity/sky/wind/observedAtText; observedAt/sourceUrl meta; demo corpus dormant (no component reads demo.weather — page.tsx consumes only demo.bnr/demo.company; no coords there by design) | 1 station (BATOS) without wind text (renders blank) | source-side |
| stiri/news feeds (server-seed feed:×7 + AFIR) | 7 feeds × 10 items + 8 AFIR items | FeedCards/ContentReader contract: id,title,url,publishedAt(ISO|null),summary,content,media (guarded `{item.summary&&…}`, `item.media?.find`); AFIR shape {id,title,url,publishedAt YYYY-MM-DD|null} | 4 of 7 seeded feeds (sanatate/justitie/energie/transport) are lean copies — items lack summary/content/media entirely vs the live parse output (honest degrade, no crash — guards verified in the render paths) | data-gap |
| films (Wikidata seed) | 1,870 | ContentReader films contract: id/title/url/date(ISO|null)/media(valid urls)/all list fields string-arrays | 0 | clean |
| SIRUTA (server-seed siruta) | 13,755 localities | LocalitySearch contract: id/name/county/parent/postal/environment(Urban|Rural); details optional (`data={x.details||x}` fallback to the row itself) | seed copy drops per-locality `details` (parseSiruta produces them); ~0 without county | data-gap |
| directory CNAS ×3 + schools (server-seed) | 4,117 clinics + 2,284 pharmacies + 731 hospitals + 6,000 schools (compact) | RecordBrowser title-extraction chain ('Nume furnizor'→'Denumire lunga unitate'→'Denumire PJ'→/denum|furnizor/→'Înregistrare publică'); envelope title/period/note/fields/total; fields-parity; schools compact array length ≤ fields + mapped denumire/judet/localitate non-empty | 0 titles fall through to the generic label; schools: source XLSX types Telefon ×5,972 / Cod postal ×5,882 as numbers → leading zeros lost (rendered as-is; publicContacts handles numeric strings) | source-side |
| cinema + events + transport + lawyers + stories | 30 cinema sites + 30 registry entries + 19 Odeon events + 4,529 GTFS stops / 201 routes / 201 route files + zip proof + 15 lawyers (+ route normalization) + 233 stories (all text proofs) | site filmCount↔films parity + registry-code parity; events parsed shape (id/title/content/start/end/url/media/sourceName) + start-sorted; transport stop/route contract + manifest parity both directions; lawyers item contract (id/name/title/url/paragraphs-array — route applies normalizeLawyerData on every path incl. seed); stories index + 233/233 text sha256 proofs | seed copies drop transport route `details`/`file` and cinema/event lean fields (MetadataFields guards); stories/other: 0 | data-gap |
| forecast contract (lib/live/forecast.ts ↔ weather-workspace labels) | 15 current + 44 hourly + 22 daily variables | every requested variable has a Romanian label in the `labels` map (raw-key leak check); parseForecast round-trip envelope (current/hourly/daily/units/timezone; per-part lengths; unix epoch) | **0 unlabeled variables** | clean |
| bnr (seed + demo) | 37 + 37 rates | currency A-Z{3}; value numeric string; multiplier ∈ 1/100; publishedAt YYYY-MM-DD | 0 | clean |

### The two findings that matter (both verified to root cause)

**P1 — places `search` normalizer divergence (OUR-BUG, low severity).** 56 of 178,868 objects carry OSM tags with non-Latin combining marks (Hebrew vowel points, katakana voiced sound marks). The corpus builder (`scripts/finalize-places.py:9` `norm()` — strips every combining character, combining class ≠ 0) and the runtime normalizer (`lib/live/query.ts:1` `normalizeSearch` — strips only U+0300–U+036F) disagree on those marks, so the precomputed index `search` for those 56 objects is not what the app itself would produce (codepoint-level diff confirmed: e.g. `w170814776` index `30a7` vs JS-decomposed `30a6 3099`; `n315473594` index lacks `05b8`). User-visible effect: a query term typed WITH such a non-Latin combining mark fails to match its own object; Latin-script queries (the app's audience) are unaffected. All other fields of the 56 objects match the record exactly (verified field-by-field). Candidate fix for T1.5 (Builder-B or DevOps, scripts/ owner): widen `normalizeSearch` to strip all `\p{M}` marks (matching the Python builder) OR regenerate the index with the JS semantics — pick one norm, make both sides agree; a regression test belongs in the T1.4 harness when it is implemented.

**P2 — CKAN `num_resources` vs the resources payload (source-side, visible in api-mode).** 419 of 1,662 seed-pool rows (captured from live `package_search`) carry `num_resources` > `resources.length` (e.g. `1c7ee37e…`: count=4, payload=3). `parseCatalog` maps `resourceCount: Number(r.num_resources)||…`, the card renders `{format(r.resourceCount||0)} resurse` while `DatasetReader` lists `dataset.resources` — so api-mode cards count resources the payload does not include. Offline inventory mode has zero parity mismatches (all 5,251 verified). Harmless to correctness (never invents rows), but the count can overstate by 1–19. Candidate handling in T1.5: prefer `resources.length` in the card rendering or drop the field from the mesh — a CKAN-side artifact either way.

### Counts summary

- **Objects walked offline (full, not sampled): 1,082,466** — 178,868 places records + 724,858 index entries (name+recent ×16) + 178,868 spatial + 162 cities + 12 law manifests (6 texts re-parsed: 6,782 sections) + 246 courts + 1 confirmed reference + 5,251 catalog inventory + 5,251 catalog datasets + 1,662 catalog seed + 162+162 weather stations + 37+37 bnr rates + 78 feed items + 1,870 films + 13,755 SIRUTA + 7,132 CNAS + 6,000 schools + 30 cinema sites + 19 events + 4,529+201 transport + 15 lawyers + 233 stories.
- **Integrity proofs verified: 7,406 (848 places + 6,534 snapshot-transport + 24 legal) — 0 failures, 0 missing files, 0 unregistered files.**
- **Classes: 1 OUR-BUG (P1, low) · 7 data-gap · 5 source-side · every data-gap/source-side path confirmed to degrade honestly (guarded renders or explicit fallback constants — render-path read for each).**
- **Raw programmatic field names: clean.** Catalog `name` slugs and CKAN metadata keys appear only inside the deliberate, labeled „Toate metadatele setului" disclosure panel; summary cards render only Romanian-labeled fields; every Open-Meteo variable requested by `forecastConfig` has a Romanian label (0 raw keys can reach the forecast table header).
- **Dosar/legislation invariants: 0 failures** — fond<apel<recurs ordering holds everywhere present (seeded + synthetic full chain incl. reference-only stages), and the evidence-only rule (explicit judgment + court + target number) rejects party-name mentions, invalid source numbers and unknown courts.

## UI/UX Findings (T1.3)

**Battery**: `probe-sweep-render.mjs` (session dir) — 15 routes (home, explore, map, place ×5 tabs, dashboard, company, money, domain, compare ×3 tabs, recommendations, saved, planner, about, /catalog, /design.html) + 16 domains × (sections + data tab) = 62 domain surfaces; **162 surface audits × 2 viewports (390×844 dsf2, 1280×800)**. Sequential pages, per-viewport /api/** response cache (dev-server load discipline), record JSON `probes/sweep-render.json`, screenshots `probes/sweep-*.png`. Triage follow-ups `probe-verify[1-4].mjs`.

### Findings register (classified OUR-BUG / DATA / SOURCE)

| # | route | viewport | issue | selector/evidence | severity | class |
|---|-------|----------|-------|-------------------|----------|-------|
| F1 | domain agricultura → news (feed also visible on places/data surfaces of same page) | 390 + 1280 | AFIR feed articles rendered **duplicated** (12 `article` nodes, sampled titles ×2) + React duplicate-key console errors (keys = article URLs `/comunicate/…` ×9) | console: `Encountered two children with the same key` full keys listed in `probes/run-log.txt`; DOM title counts in verify2 output; screenshots `probes/sweep-{390,1280}-agricultura-news.png` | polish | **OUR-BUG** (feed merge/dedupe or key = source+id; T1.5 with a failing e2e assert-first: unique titles) |
| F2 | about (SourcesRegistry) + domain local → data tab source line | 390 + 1280 | sources-registry **note fields leak raw field names + internal ops instructions** into user-facing prose: `datastore_search se aplică numai resurselor cu datastore_active=true`, `Selectează OD_FIRME și nomenclatoarele compatibile. Nu importa reprezentanții personali în MVP.`, `Acoperire națională SIRUTA_s1 2026…` | `public/catalog/sources.json` + `public/data/sources.json` (note fields, entries 4 + 3); rendered via SourcesRegistry on about + catalog source lines; screenshots `probes/sweep-{390,1280}-about.png`, `probes/sweep-{390,1280}-local-data.png` | polish | **OUR-BUG** (registry content rewrite in user-facing Romanian; T1.5 content fix, no code) |
| F3 | /catalog (public page) | 390 + 1280 | **No h1** — page tops out at h2 «Toate datele publice, într-un singur catalog»; `<title>` correct, no in-page h1 | `document.querySelector('h1')` → NONE on /catalog (verify probe); battery meta.h1 = "" | polish | **OUR-BUG** (add the page heading — visible or sr-only h1; T1.5) |

**Verified intentional (no action):** hero subtitle `p` hidden on mobile (`app/experience.css` `@media(max-width:640px){.v2 .hero p{display:none}}`); `.home-source-dates` hidden globally (same file); `.weather-source-block` `hidden`-attribute variant swap in WeatherStations; `.sr-only` labels on ExportActions (a11y pattern, 7 occurrences); home `button.city-story` cover img 21px (390) / 35px (1280) wider than its card, right-clipped by design (`object-fit:cover`, inset:0, z-index:-2 behind safely-inset text — `app/polish.css:24-26`).

**Source-data values (correctly attributed, no app leak):** feed project codes (`BV14C_02` — AFIR article), feed file names (`24_08_2026_dosar_presa_rezultate_finale_bacalaureat_S2`, `Plati_ianuarie`, `…_BolintinDeal`, `zgomot-rutier-outside_agg` URL slug — CKAN/primărie source naming), ANOFM prose «34.128 locuri de muncă», educator-feed tags «bacalaureat 2026 rezultate» (battery grammar hits were date-line+tag innerText adjacency — heuristic artifact, not count phrases), photo attribution `xulescu_g · CC BY-SA 2.0`, contact email. Class **SOURCE/DATA**.

### Clean classes (all 162 surfaces, both viewports — zero findings)

| check | result |
|-------|--------|
| Horizontal overflow (documentElement.scrollWidth − innerWidth) | **0px everywhere** (390 + 1280) |
| Broken images / undefined-null src / tiny-in-slot / cards-missing-images | **0 / 0 / 0 / 0** |
| Oversized whitespace (>140px vertical gaps between content blocks) | **0** post-fix logic (hero/image-panel pair-exclusion documented in probe) |
| Map credit pill occlusion (`.romap` × `.map-country` labels, bbox intersection) | **0px² on every map-bearing surface** (home, map, place, planner) — static position on compact maps, absolute bottom-right on full map, always within romap; last session's fix holds |
| Active section empty (not loading) | **0** — every surface renders content or an honest busy/empty state |
| Zero-size rendered content (visibility-gated) | **0** |
| vbottom-nav vs footer content (true rect intersection) | **0** |
| countText grammar (re-derived vs `countNoun` contract) | **0 app-phrase violations** («7.113 rezultate», «10 rezultate», «7.113 locuri în categoria națională» all correct; grep: no hand-rolled `N rezultate/locuri` templates outside `countText`) |
| Headings/labels | h1 present + non-empty on all hash routes and all 16 domains; **exception /catalog → F3** |

### SSR sanity — 15 route URLs (curl + shell markers)

All **status 200**, no error docs. `/` + the 12 hash routes share the SSR app shell: `title "Aflivra — România la îndemână"`, `id="vcontent"`, brand `aria-label="Aflivra acasă"`, `vfooter`, `hero-search` (12/12 identical — hash never reaches the server, by architecture). `/catalog` distinct page with `catalog-home` back-link. `/design.html` meta-refresh → `/` («Web & mobil» footer link). Unknown path `/zzqxv` → 404 (honest).

### Severity counts
- **blocks-usability: 0**
- **polish: 3** (F1, F2, F3 — all OUR-BUG, all T1.5 candidates with regression-test-first)
- verified-intentional / source-data / clean: everything else (159 remaining surfaces + all global classes)

### Top-5 worst
1. **F1 agricultura/news** — duplicated AFIR articles + React duplicate-key errors (the only visible data-correctness defect)
2. **F2 about + local/data** — registry notes speak API/ops language to users (`datastore_search`, `OD_FIRME`, `SIRUTA_s1`, «Nu importa… în MVP»)
3. **F3 /catalog** — no h1 on a public page
4. home city-story cover clip — verified intentional (recorded so the next session doesn't re-chase it)
5. feed file-name snake_case (educatie/stiri data surfaces) — source naming, DATA class; candidate for a future humanization pass, not this sweep

**Status: ISSUES FOUND — 0 accessibility/blocking, 3 polish (all OUR-BUG, routed to T1.5); full register + evidence in `probes/`.**

## DevOps Findings

### T1.1 complete — verify-sweep-inventory.mjs (new) — PASSED
- [devops] scripts/verify-sweep-inventory.mjs (NEW, offline/fast, transpile-import for the pure registries + structural reads for the rest): enumerates the app's full surface inventory from the registries and asserts coherence in BOTH directions — 16 domains (v2-model) ↔ topicSections keys ↔ 46 sections (count pin); every section id handled by DomainWorkspace.content() (regex-extracted from domain-workspace.tsx incl. the RecordBrowser 4-kind literal — `local/misterios` scratch-mutation → exit 1 naming it); catalogTopic(domain) set == the 14 catalogCategories ids exactly; places manifest categories == the domains with a places section (local-all == 178,868 == m.count); per-category subcategory lists ⊆ the local-all master list (73 distinct), master list unique; 7 feedConfigs kinds have a news section + afirLoader/filmsLoader exported + agricultura/news + filme/films tabs exist; transport sections ⊇ {network,vehicles,arrivals,alerts}; directories keys == {schools,health,pharmacies,hospitals}; cinemas registry non-empty incl. default 1824; courts institutions non-empty with id+label; refresh-groups 5 groups/21 unique members/seedBacked+onDemand documented.
- [devops] The coverage gate (the dispatch's core): every registry key (21 members + 9 seedBacked + 8 onDemand families = 38 distinct) maps through a static coverage table to parity families (read LIVE from verify-source-errors.mjs's `{family:'…'` table — no duplicate list) and/or a named harness script (exists on disk); missing map entry, missing parity family, missing harness AND parity family referenced by no registry key — all exit 1 with the exact key (three scratch-mutations proven: unknown member `feed.despre.fluturi` → exit 1; renamed siruta parity family → exit 1 "localities/siruta lipsește din verify-source-errors.mjs"; unhandled section → exit 1). Scratch runs in /tmp only (repo untouched), cleaned after.
- [devops] Output: `node scripts/verify-sweep-inventory.mjs` → exit 0 ×2 (twice-run contract) — "16 domenii, 46 de secțiuni, 14 categorii de catalog mapped, 14 categorii de locuri (73 subcategorii naționale), 178.868 de locuri, 7 fluxuri + AFIR + filme, 4 feluri de transport, 4 registre, 30 cinematografe, 246 instanțe și 38 familii de surse din registry, toate acoperite".
- [devops] CI + README wired in the same change: battery line in pr-validation.yml + README battery list + blurb (README list was also missing verify-ro-text/verify-source-errors — hard CI gates since the previous session — now synced 1:1 with the workflow battery).

### T1.2 complete — verify-source-errors.mjs parity extension 6→19 families + deployed-worker leg — PASSED
- [devops] families table: 6 → 19 — added directory/schools, directory/health, directory/pharmacies, directory/hospitals, localities/siruta, lawyers/ifep, legal/law (POST kind:law), feeds/agricultura (KNOWN class, pre-classified `source-blocks-egress`), feeds/filme, events/odeon, cinema/cinemacity, stories/wikisource (id 29611 from the stories index), transport/realtime. New routes compiled: directory, lawyers, localities, events, cinema, story, transport-live (lib/live compile chain extended with directories/resources/events/cinema/stories/transit-realtime/lawyers/catalog-metadata + cinemaCatalog/audit inlines + xlsx/gtfs-realtime-bindings package rewrites — the verify-refresh-sweep.mjs proven recipe). Feed fixtures per family: schools datastore JSON, CNAS package_show+XLSX (xlsx-built binary), SIRUTA package_show+1001-row CSV, IFEP HTML (verify-lawyers fixture cloned), law SOAP GetToken+SearchLegi, AFIR card-body HTML, wikidata SPARQL JSON, ODEON ld+json HTML, cinemacity quickbook JSON, wikisource api.php JSON, protobuf FeedMessage (gtfs-realtime-bindings fromObject/encode).
- [devops] Mock matrix: 36 → **114 cells (19 families × 6 scenarios)**, `node scripts/verify-source-errors.mjs` → **exit 0** (~1:56, dominated by the 19 warm/500 real retry-cadence pauses; CI verify job 20-min budget). ONE RED finding fixed by pinning the actual contract: ODEON normalizes '2026-10-06T19:30:00' → '2026-10-06T19:30' (seconds dropped by the parser's normalize rule — old pin was wrong, model was right). Per-family cells assert: degrade-never-5xx, keep-valid-copy (warm-500 stale + 3 attempts), source HTTP code in the Romanian envelope (500×3/429-pause/timeout/malformed per-family documented messages), no re-fetch of served families, and per-family served shapes (records/items/events/chapters/vehicle/act identity).
- [devops] `--live` verdict engine rewritten with the deployed-worker leg: per family 1 GET at AFLIVRA_VERIFY_SOURCE_BASE (default 127.0.0.1:5173) + 1 GET at AFLIVRA_VERIFY_DEPLOYED_BASE (default https://aflivra.brebu.workers.dev — OUR infra, budget-free; empty string → leg skipped-with-note); direct probe unchanged (≤2, only on surfaced errors); classes: ok / our-bug (dev-error-with-fine-source OR deployed hard-5xx — the ONLY exit-1) / source-blocks-egress (dev ok + deployed surfaces 5xx/429 + source fine; pre-classified AFIR confirms WITHOUT spending a direct fetch) / source-down / budget / recovered — verdict + app + deployed + direct recorded per family in the JSON summary.
- [devops] Verdict-engine proof WITHOUT touching any real source (T4.1 owns --live): loopback fixture server + fetch-shim drivers in /tmp (not committed, cleaned logic reusable) — **8/8 phases PASS**: all-ok (19 families exit 0) · AFIR egress class (pre-classified, zero direct probes, exit 0) · our-bug dev-error/source-fine → exit 1 · source-down → informational exit 0 · budget informational · deployed hard-502 → our-bug exit 1 · deployed leg disabled ('') → skipped-with-note · dead dev base → exit 2 with the Romanian hint.
- [devops] `--live` NOT run this task (T4.1's single budget-capped pass owns it).

### T1.6 complete — drift trio repaired — PASSED (twice each)
- [devops] verify-expanded.mjs (exit 1 → 0 ×2): `source-html` added to the lib compile map (lawyers.ts's sourceElements import — the rev-35 source-xml/source-html refactor escaped this harness's map). No second-layer drift surfaced: full 178,868-record + 548-shard + transit + stories + cinema pass restored.
- [devops] verify-legal-records.mjs (exit 1 → 0 ×2, TWO second-layer drifts revealed and fixed along the way, both the previous session's v:'3' precedent class — hidden imports masked by the first failure): (1) compile-map gains source-xml + court-references (+ the court-history/court-query lib-level pair, confirmed-references inline, '../court-history' rewrite, db.batch added to the in-memory D1 wrapper — court-references batch-writes); (2) the route rewrite gains the institutions inline + '@/lib/geographic-scope'/'@/lib/court-query'/'@/lib/court-history'/'@/lib/live/court-references' rewrites + geographic-scope/location-context/query compiled (the legal route now imports the geo/court chain directly) + countyLookup/urbanLocalities inlines. Full contract pass restored (SOAP pause, copie veche, chunk integrity, Bucharest day).
- [devops] audit-controls.mjs (exit 1 → 0 ×2, two stale pins — code is correct, pins predate the PDF-module extraction + the pagination-variant split): `s.body.split` pin moved to lib/legal-pdf.ts (`section.body.split` — where the paragraph-split business rule lives since the exportArticle → law-article-download → createLawArticlePdf refactor) with the workspace pinning the wiring (`downloadLawArticlePdf`); `:!article&&<Pagination` pin updated to `:(!article||selectedHeading)&&<Pagination` (the current correct shape: single-article view replaces pagination; heading sections keep it).
- [devops] pr-validation.yml: **zero continue-on-error lines remain** — the drift trio folded into the hard-gate battery; verify-legal-pdf becomes the guarded recorded skip (`python3 -c 'import pypdf'` gate + explicit SKIP message; the script itself untouched per the dispatch — vendoring pypdf NOT attempted).

### Verification (all run this task, final state)
| Check | Exit | Result |
|-------|------|--------|
| `node scripts/verify-sweep-inventory.mjs` ×2 | 0, 0 | ✅ PASS — full inventory enumerated, 38 registry families covered bidirectionally, 3 negative mutations bite |
| `node scripts/verify-source-errors.mjs` (mock) | 0 | ✅ PASS — `{"result":"ok","mode":"mock","families":19,"cells":114}` |
| Parity-engine fixture phases | 8/8 | ✅ PASS — ok/AFIR-egress/our-bug(1)/source-down/budget/deployed-5xx(1)/deployed-skip/precondition(2); zero real network |
| `node scripts/verify-expanded.mjs` ×2 | 0, 0 | ✅ PASS |
| `node scripts/verify-legal-records.mjs` ×2 | 0, 0 | ✅ PASS |
| `node scripts/audit-controls.mjs` ×2 | 0, 0 | ✅ PASS |
| Full CI battery (15 scripts, workflow order) | 0 ×15 | ✅ PASS — live/cache/export-formats/legal-refresh/catalog/snapshot-transport/refresh-sweep/ro-text/source-errors/sweep-inventory/legal-records/expanded/audit-controls/downloads |
| `verify-legal-pdf.mjs` | SKIP înregistrat | ⏭️ pypdf absent (same as runner image) — guarded-skip step proven locally |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ PASS |
| `corepack pnpm lint` | 0 errors / 114 warnings | ✅ PASS — exact pre-existing baseline; targeted eslint on my 5 scripts: 0 errors (1 pre-existing warning in verify-expanded) |
| `ruby -ryaml` workflow parse + continue-on-error grep | OK / 0 | ✅ PASS |

- [devops] Files touched (exactly the dispatch set): scripts/verify-sweep-inventory.mjs (NEW), scripts/verify-source-errors.mjs, scripts/verify-expanded.mjs, scripts/verify-legal-records.mjs, scripts/audit-controls.mjs, .github/workflows/pr-validation.yml, README.md (battery list + blurbs), this STATUS append. No app/ or lib/ file touched.
- [devops] NOTE for T2.1/API specialist + orchestrator: lib/live/federated.ts (new, untracked, in-flight) is a NEW top-level lib module — per conventions the closed stub resolvers in scripts/verify-location.mjs + scripts/verify-search-ui.mjs must be extended in the SAME change (my battery runs green with it on disk since nothing I compile imports it; verify-federated-search.mjs is that task's harness).
- [devops] **T1.1/T1.2/T1.6: PASSED — all checks successful.**

## UI/UX Findings (T3.1/T3.2)

**Status: PASSED — weather scene life designed + implemented within tokens; every animation gated by BOTH `prefers-reduced-motion` and `prefs.motion` (.v2.no-motion), proven computed-style per condition × viewport.**

### What animates per condition (inventory — CSS-only, transform/opacity exclusively, no JS timers, no animation libraries)

| Condition (existing `background` class) | Ambient layers (infinite loops, compositor-only) | One-shot / interactive |
|---|---|---|
| `.weather-scene-rain` | two oversized rotated-stripe drizzle layers — `::before` `aflivra-weather-rain-far` (1px streaks, `#d9eaff0d`, rotate(18deg) translateY loop, .95s) + `::after` `aflivra-weather-rain-near` (1.6px, `#f3f7ff16`, rotate(13deg), .7s); seamless by construction (stripes invariant along the rotated travel axis) | scene img fade-in `aflivra-weather-sky` (.55s, opacity) on every condition change (`key={background}`) |
| `.weather-scene-snow` | two tiled radial-dot snowfall layers — `aflivra-weather-snow-far` (190×220px tile, 10s) + `-near` (150×160px, 7s); tile-exact translateY travel + eased X sway (22px/−26px), seamless loop | metric-chip icons `aflivra-weather-icon` (svg scale .55→1 + opacity, .5s, 90ms stagger per chip) — replays only on genuinely fresh data via `key={d.current.time}`; same pop for all 15 `.weather-metric-grid` icons; **text never animates** (icons only) |
| `.weather-scene-sunny` (clear day) | `aflivra-weather-glow` — light radial glow `#f3f7ff1c` at 79%/20% breathing opacity .6↔1 + scale 1↔1.07, 12s alternate | station cards: hover (`@media(hover:hover)`) + `:focus-within` → border `#afbcce` + `0 8px 24px #1532470a` shadow deepen, .18s transition — deliberately NO transform (a filled `[data-reveal=visible]` animation would pin a hover translate; paint-only feedback dodges the pin) |
| `.weather-scene-night` | static moon-glow radial + two star-tile layers, each running `aflivra-weather-twinkle` (opacity .45↔.95, 7s/8.5s offset, alternate) combined with `aflivra-weather-night-drift` (180px tile-exact X, 160s/210s reverse — imperceptibly alive) | — |
| `.weather-scene-cloudy` (incl. the pre-forecast loading state) | two wide radial-haze bands, tile-exact X drift — `aflivra-weather-drift-far` (640px tile, 34s left) + `-near` (420px, 23s right) | — |

**Sky transitions between conditions**: condition change re-keys the scene `<img>` (fade-in) and swaps the ambient keyframe family — a gentle crossfade, never a jump. **Home pulse-button float (PLAN T3.1 candidate) intentionally NOT implemented**: it lives in v2.css/page.tsx territory outside this dispatch's file partition (page.tsx owned by Builder-B) — recorded as a candidate, not silently dropped.

### Reduced-motion + gating proof (the constraint, not a claim)
- Everything authored inside `.v2` scope → inherits the two existing blanket gates (modern.css:11 `@media(prefers-reduced-motion:reduce){.v2 *,.v2 *:before,.v2 *:after{animation:none!important}}` + modern.css:15 `.v2.no-motion *`), the same precedent every existing `aflivra-*` keyframe uses. **No motion.ts change needed** (reveal for `.weather-live-grid>article` already registered; prefs→`.no-motion` wiring already on the shell) — motion.ts untouched.
- Probe evidence (`probe-weather-motion.mjs`, session dir, exit 0): `page.emulateMedia({reducedMotion:'reduce'})` → **computed `animationName` = `none` for all six tracked elements (ambient element/::before/::after, scene img, chip icon, grid icon) on ALL 5 conditions × 2 viewports (10/10)**; the ambient span stays rendered as a static texture (frozen base transforms are full-coverage) and the scene class/content is intact — fully usable and informative without motion. With motion ON the same 10 audits assert each expected `aflivra-weather-*` name (incl. the night layer's comma-combined twinkle+drift list) — the CSS actually applies, not just harmless.
- A11y: decorative additions only — the ambient `<span>` carries `aria-hidden="true"` beside the already-aria-hidden img; zero text/aria changes; icons-only refresh motion; ambient layers paint at z-index −1 **behind** the text at ≤ 11% white/light-blue alpha (negligible contrast shift on the navy scene).

### Tokens audit (no new colors, no new patterns)
Every color value reuses the app palette already in the touched family files: `#d9eaff` / `#f3f7ff` (scene text colors, workspaces.css:51/53) and `#ffffff` at low alpha (the existing `#ffffff55` chip-border family) for ambient layers; `#afbcce` border + `0 8px 24px #1532470a` shadow (the exact card-hover values from modern.css:9). Keyframe naming follows the `aflivra-*` family (`aflivra-weather-*`). No CSS variables existed for these hues; no new hue introduced — 0 raw hex outside the established palette identity.

### Files touched (exactly the partition)
- `app/workspaces.css` — one contiguous weather-scene block inserted after the existing `.weather-scene` family (lines 56-79 region), before the dialog rules; weather-section content only, no other section touched
- `app/weather-workspace.tsx` — 3 surgical edits: `key={background}` on the scene img + `<span className="weather-ambient" aria-hidden="true"/>` after it; `key={d.current.time}` on `.weather-scene-metrics` and `.weather-metric-grid` (refresh replay); no aria/logic changes
- `app/motion.ts` — **untouched** (gates already cover the new keyframes)
- Session dir: `probe-weather-motion.mjs` + `probes/weather-motion.json` + screenshots `probes/weather-{390,1280}-{rain,snow,clear,night,cloudy}[-reduced|-full].png` (not committed per probe precedent; screenshots available for human review — this agent session cannot render image input, the computed-style assertions above are the machine proof)

### Verification outputs
| Check | Exit | Result |
|-------|------|--------|
| `node probe-weather-motion.mjs` (session dir) | 0 | ✅ PASS — 10 condition×viewport audits motion-ON (scene class, ambient present, per-layer animationName inventory, img/chip/grid icon anims, kicker/temp/metrics=3/grid=15 render, overflowX=0, zero console/page errors) + 10 reduced-motion audits (all animationName=none, ambient rendered, scene intact) |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ PASS — 0 errors |
| `corepack pnpm lint` | 0 | ✅ PASS — 0 errors / 114 warnings = exact pre-existing baseline, nothing new (the 7 weather-workspace.tsx warnings are the file's pre-existing hook-purity/line-18 warnings) |
| `corepack pnpm test:e2e` | 0 | ✅ PASS — **28/28 passed** (baseline held; weather-motion e2e legs are T3.3/Validator's) |
| `window.matchMedia` handlers, JSDOM/timers | n/a | ✅ no JS motion code introduced — pure declarative CSS |

## DevOps Findings (T1.4c/battery)

**Status: PASSED — model-contracts harness (T1.4c) committed, exit 0 ×2 (idempotent, ~4.3–5.3 s); federated-search harness wired into CI + README; full battery 16/16 green in workflow order (run twice: before and after a mid-verification Builder-B code drop); tsc --noEmit 0; YAML valid, zero continue-on-error.**

### T1.4c complete — scripts/verify-model-contracts.mjs (NEW) — the Validator's T1.4 register made permanent
- [devops] 4 legs, fully OFFLINE (fs+zlib+transpile-import only, zero network, temp dir cleaned on every exit path), per-leg English labels + Romanian per-corpus counts, known-class findings (register's data-gap/source-side) printed once as a "Stări cunoscute" line with counts — they are documented honest-degrade states, never failures; OUR-BUG-class violations collect into bounded samples and exit 1.
- **LEG 1 places** (full walk, not sampled): 178,868 records in 299 chunks; 724,858 index entries over 420 name+recent shards ×15 categories; spatial 178,868 over 128 parts in 48 cells; cities.json shape+proof; **848 sha256/bytes proofs (299 chunks + 420 shards + 128 parts + cities) — 0 failures** (exactly the register's "848 places" proofs); manifest count + per-category counts + 5 contact counts parity; record shape ×16 fields, coords in RO bounds, categories ⊆ registry, types↔categories↔subcategories (73 manifest labels), updatedAt/sourceUrl/id-prefix/locationApproximate format contracts, global (norm(name),id) order, dup ids, index↔record field parity ×13, per-shard continuity, name/recent ordering, spatial exact-once + floor(lat/lon) cell placement.
- **P1 made a permanent regression gate with auto-strict semantics.** The harness transpile-imports `normalizeSearch` LIVE from lib/live/query.ts and recomputes every record's baked `search` key (tags-values + name + address). Auto-detect: if the runtime normalizer strips all combining marks ((katakana voiced U+3099 + Hebrew U+05B8 probe)), the gate is STRICT — index search must equal the recomputation on every object; otherwise divergence is legal only for the documented non-Latin combining-mark class, certified by mark-erasing equivalence (`wideNorm(stored) === wideNorm(raw)`) + an actual non-Latin mark on the raw object. **Both states empirically proven in one task**: my early run (pre-fix query.ts) certified **exactly the register's 56-object P1 class, 0 unexplained**; Builder-B's T1.5 fix (query.ts now enumerating all 934 nonzero-combining-class codepoints, finalize-places.py parity comment added; index NOT regenerated — no public/places changes = the "widen the runtime normalizer" fix decision) landed mid-verification and the gate auto-flipped to strict: **"acord integral pe 724,858 intrări"** — exit 0, no harness edit needed. Any future index↔runtime divergence now fails CI as `places-search-agreement` (strict) or `places-search-corruption`/`places-search-p1-class` (if the normalizer ever narrows again).
- **LEG 2 dosar** (probe-legal §2 distilled, court-history transpiled with institutions inlined): 246 institutions (shape + unique ids), 1 confirmed reference (CourtReference contract + normalizeCourtNumber + uniqueCourtReferences), fond<apel<recurs verified on every built history (rank + ro-locale courtLabel tiebreak) over the seeded corpus AND a synthetic full chain (Fond record r1/2 hearings + evidence-only Fond + Apel + Recurs), evidence-only purity (reference stages carry no recordIds/hearings), relatedCases ≠ self, historyComplete=false, courtHistoryText renders every stage, and the three negative extraction probes (party-name mention / invalid source dosar number / court outside registry) rejected.
- **LEG 3 CKAN**: inventory 5,251 ids unique; categories ⊆ 14 catalogCategories (transpiled live from lib/live/catalog-categories.ts, not hardcoded) + all 14 non-empty (alte bucket 2,983); all 5,251 detail files read in full — openDataset-mapped contract, inventory↔payload resourceCount parity (0 mismatches), **raw keys confined to the labeled-dump contract** (any key beyond the 12 mapped ones fails — the "Toate metadatele" labeled-disclosure boundary); catalog-seed pool 1,662 (category coverage incl. energie/agricultura→mediu, filme→cultura, stiri→justitie remaps; 1,661 recent; 419 in the register's P2 class `num_resources > payload` — overstated only, understatement would fail).
- **LEG 4 live corpora**: 7 feeds ×10 + AFIR 8 {id,title,url,publishedAt YYYY-MM-DD|null, NO summary/content} + films 1,870 (all string-list fields); stations 162 (seed) + 162 (demo, dormancy verified — page.tsx never renders demo.weather coords); directory CNAS ×3 (7,132 records: envelope title/period/note/fields/total, records ⊆ published fields, title-extraction chain, 0 generic-title fallthroughs) + schools 6,000 compact rows; cinema registry 30 + 30 seeded sites (filmCount↔films parity, registry-code coverage); transport 4,529 stops + 201 routes, GTFS zip sha256 proof + 201 route-file proofs + seed↔manifest id parity both directions.
- [devops] Register corrections discovered while distilling (evidence runs in session): (1) the probe's §5 "client seed page-0" assumption was wrong — `seed.json['catalog:::0']` is a **shadowed vestigial entry** (lib/live/cache.ts:15 getSeed serves every `catalog:*` key from the catalogSeed pool and returns before the baseSeeds map; the packed raw row has no `formats` and 1 result); the live page-0 contract is the pool slice, which LEG 3 gates — the vestigial entry is left untouched (lib/ not in my dispatch); (2) the register's "162 cities" miscounted — cities.json holds 13,971 entries (shape+proof gated over all); (3) "spatial 128 cells" = 128 spatial **parts** across 48 cells.

### Stub-resolver conditional — NOT extended, with the exact live-trigger note
- [devops] At first run time no app file imported lib/live/federated → per dispatch: skip + note. **Builder-B's T2.2 wiring then landed mid-verification** (app/page.tsx:49 `import … from '@/lib/live/federated'` + NEW app/search-results.tsx), but **neither verify-location.mjs nor verify-search-ui.mjs compiles either file** (verified by enumerating both closed compile sets and grepping every compiled file for federated: domain/route.ts, location.tsx, location-scope.tsx, use-source.ts, local-weather.tsx, v2-model.ts, search-input/form, draft-form, select-field, metadata-fields, lib chain — NONE import it), so there is no import to resolve today and both harnesses run green (battery-proven twice). Extending the resolvers now would be dead config; the conventions rule binds the FIRST change that routes a `@/lib/live/federated` import through a compiled component (T2.2/T2.4, Builder-B — also handoff #1 in API T2.1 findings).

### Battery + README wiring (same change as the scripts)
- [devops] `.github/workflows/pr-validation.yml` verify battery gains 2 lines after `verify-sweep-inventory.mjs`: `node scripts/verify-model-contracts.mjs` + `node scripts/verify-federated-search.mjs` (17 verify steps total: 15 in the block + verify-downloads + guarded verify-legal-pdf; vanilla `node` steps, no continue-on-error — count remains 0).
- [devops] README.md: the same 2 lines in the sh pipeline block + one Romanian blurb per script appended to the verify paragraph (model-contracts: full offline corpus contract audit incl. the 848 places proofs + index↔runtime search parity + fond<apel<recurs + CKAN labeled-dump + live corpora; federated-search: eager families local, network families planned against existing cached routes, registry-ordered grouped list, honest degrade, no new endpoint).

### Parallel-session liaisons (Builder-B edits observed/diagnosed during verification)
- [devops] **P1 fix confirmed landed** (lib/live/query.ts + scripts/finalize-places.py parity comment; no index regeneration) — see LEG 1; the register's candidate-fix decision is thereby taken: widen the runtime normalizer to the builder's fold.
- [devops] One-line type fix applied to Builder-B's in-flight lib/live/feeds.ts (F1 dedupe work): `.map(...{…}:null}).filter(Boolean)` → `.flatMap(...[{…}]:[]})` (house idiom — lawyers.ts:26 precedent) — tsc's only error (TS18047 'x' possibly null, feeds.ts:16:142) came from filter(Boolean) not narrowing the null union; runtime-identical; verify-source-errors (incl. the AFIR family) + verify-live re-proven green after the change, full battery re-run 16/16.
- [devops] ⚠️**OPEN — not mine, reported**: `corepack pnpm lint` currently exits 1 with **3 errors / 121 warnings** (baseline 0/114 — 3 errors + 7 warnings are new), all `react-hooks/set-state-in-effect` in Builder-B's in-flight T2.2/T2.3 files: app/domain-workspace.tsx:13:30, app/lawyers-workspace.tsx:8:458, app/search-results.tsx:22:3 (the initialQuery-seeding `useEffect(()=>{setState…})` pattern). The CI lint-typecheck gate will fail until those land on a non-effect-setState pattern (key-based remount / derived state — Builder-B's ownership; UI/UX measured 0/114 minutes before these files landed). My files: targeted eslint 0 problems (verify-model-contracts.mjs, feeds.ts re-checked).

### Verification (all run this task, final state)
| Check | Exit | Result |
|-------|------|--------|
| `node scripts/verify-model-contracts.mjs` ×2 (+ final) | 0, 0, 0 | ✅ PASS — idempotent; per-corpus counts printed; runtime 4.3–5.3 s; strict post-fix state: 724,858/724,858 search parity, 848/848 proofs |
| `node scripts/verify-federated-search.mjs` ×2 (+ final) | 0, 0, 0 | ✅ PASS — 6 legs green against the rewritten query.ts (normalizer fix + my feeds flatMap edit) |
| Full battery, workflow order (16 scripts) | 0 ×16 | ✅ PASS — run TWICE (before and after the feeds.ts type fix + page.tsx/search-results.tsx landing): live, cache, export-formats, legal-refresh, catalog, snapshot-transport, refresh-sweep, ro-text, source-errors, sweep-inventory, **model-contracts, federated-search**, legal-records, expanded, audit-controls, downloads |
| `verify-legal-pdf.mjs` | SKIP înregistrat | ⏭️ pypdf absent locally (same guard as the CI step — recorded skip) |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ PASS — after the feeds.ts fix (the single TS18047 was the tree's only error) |
| `corepack pnpm lint` | 1 | ⚠️ 3 errors / 121 warnings — ALL in Builder-B's in-flight T2.2/T2.3 files (see liaisons); targeted eslint on my script + the feeds.ts line: 0 problems |
| `ruby -ryaml` workflow parse + continue-on-error grep | OK / 0 | ✅ PASS — zero continue-on-error lines remain |

- [devops] Files touched: scripts/verify-model-contracts.mjs (NEW, mine), .github/workflows/pr-validation.yml (battery lines), README.md (2 pipeline lines + 2 blurbs), lib/live/feeds.ts (one-line flatMap type fix on Builder-B's in-flight F1 code — the only non-dispatch file, applied because tsc is my verification gate), this STATUS append. app/page.tsx / search-results.tsx / query.ts / finalize-places.py / the workspaces only READ or attributed.
- [devops] **T1.4c + battery wiring: PASSED — all checks successful (repo lint red only on Builder-B's in-flight files, reported above with file:line).**

## Builder-B Findings (T1.5/T2.2/T2.3)

**Status: DONE — all six assigned tasks implemented and verified. tsc 0 errors · lint 0 errors / 114 warnings (exact baseline — the in-flight 3 errors / 121 warnings DevOps observed mid-verification were my intermediate state, resolved below) · e2e 28/28 · structural harnesses green with my changes (incl. DevOps's model-contracts strict gate: „acord integral pe 724.858 intrări").**

### T1.5-P1 — places normalizer unification (fixed, RED→GREEN)

**Decision (data-decided, not guessed):** the runtime `normalizeSearch` now strips **exactly the nonzero canonical-combining-class characters** — the precise class `finalize-places.py` built the index with (`unicodedata.combining(c) != 0`). An all-`\p{M}` rule was measured and **rejected**: the full-corpus census (session probe `probe-p1-normalizer.py`, all 299 record chunks + all 100 local-all name shards) found 4 combining marks with **cc c=0** (Malayalam U+0D3E/U+0D41/U+0D47, all inside Castelul Bran's `name:ha` tag value, record `r3300200`) that the Python builder **keeps** — `\p{M}` would have diverged on that one object in the mirror direction (unified-divergence 1 vs ccc-rule 0). The census also reproduced the T1.4 finding exactly (56 ccc≠0 divergences: Hebrew niqqud, katakana 3099/309A, Arabic 0654) and proved the JS-order vs Python-order (lowercase placement) equivalence on the corpus (0 divergences).

**Implementation:** `lib/live/query.ts` — `normalizeSearch` gained an exact enumerated ccc≠0 class (196 ranges / 934 chars, generated from Unicode data; combining classes are never reassigned per Unicode stability policy) plus a one-line business-rule comment naming the cross-file pairing. `scripts/finalize-places.py` — its rule was already the correct class; added the one-line contract comment that norm() and normalizeSearch implement the same rule. **No index regeneration** — the scan proves every stored `search` value (178,868 rows) equals the unified-rule output char-for-char; independently confirmed by DevOps's strict model-contracts gate flipping to „acord integral".

**TDD evidence:** session probe `probe-p1-rule.mjs` (transpile-import of the real shipped query.ts): **RED** pre-fix `mismatches=56` (same sample ids as the T1.4 register: w84575254, w84575372, n5488367122, r18129562, n6431650635) → **GREEN** post-fix `rows=178868 mismatches=0` + typed-with-mark round-trip legs (Hebrew-niqqud name matches its object; the Malayalam cc c=0 marks are KEPT and match — the Castelul Bran no-regression proof).

### T1.5-F1 — AFIR duplicated articles (fixed, RED→GREEN)

Root cause: the stored D1 copy for `feed:agricultura` held 12 items = 6 canonical URLs ×2 (live capture of afir.ro's homepage, which lists the same comunicate twice) served as-is — `parseFeed` dedupes via `uniqueRecords`/`canonicalUrl` but **`parseAfir` did not**, and `/api/domain` deduped only the `kind=stiri` merge. Fix at the merge point, three layers:
- `lib/live/feeds.ts` `parseAfir` — dedupes exactly like `parseFeed` (`uniqueRecords(items, x => canonicalUrl(x.url))`); DevOps's mid-session flatMap type fix on this same line is kept (acknowledged — it fixed T1.4c's tsc gate on my in-flight edit).
- `app/api/domain/route.ts` — the items mapping for **every** kind now runs through the same `uniqueRecords`/`canonicalUrl` dedupe previously used only by the stiri merge, so already-stored copies serve deduped regardless of what the D1 row holds.
- `app/record-workspace.tsx` `FeedCards` — each `<article class="news-card">` gained **`data-testid="feed-article"`** (the e2e-safe assertion hook: unique-title/unique-render legs can pin it; keys stay `item.id`, unique post-dedupe).
**TDD evidence:** session probe `probe-f1-afir-dedupe.mjs`: **RED** `items=12 uniqueUrls=6` → **GREEN** `items=9 uniqueUrls=9` (route-level guarantee, independent of stored copy). `verify-location.mjs` + `verify-source-errors.mjs` (19 families / 114 cells) re-run green with the route/parse changes.

### T1.5-F2 — sources-registry ops language (fixed, RED→GREEN)

Rewrote the leaking user-facing fields in **both** `public/catalog/sources.json` and `public/data/sources.json`: `S01.note` (datastore_search/datastore_active internals → plain-Romanian description of what the 39.735 references contain), `S08.note` (OD_FIRME/MVP import instructions → what the ONRC 02.09.2026 reference copy includes/excludes), `S19.name` (`SIRUTA_s1 2026` → **„Registrul SIRUTA 2026”**), plus `S12.note` in the catalog registry (raw SOAP parameter names numeParte/numarDosar/obiectDosar → what the public search accepts). Endpoint/evidence diagnostics stay inside the deliberate „Toate detaliile inventarului" labeled-disclosure panel (sanctioned pattern). Compact-JSON formatting preserved. **TDD evidence:** session probe `probe-f2-sources-copy.mjs`: **RED** 13 token hits across the 4+3 entries → **GREEN** 0 (rendered chain: SourcesRegistry reads /catalog/sources.json — the clean copy serves on next mount).

### T1.5-F3 — /catalog h1 (fixed)

`app/catalog/page.tsx` gained a visible page heading on the existing `.page-intro`/`.kicker` tokens: kicker „DATE DESCHISE, LA ÎNDEMÂNĂ", **h1 „Catalogul de date publice ale României”** + one-line intro. **RED→GREEN:** `curl -s /catalog | grep -c '<h1'` 0 → **1** (`<h1>Catalogul de date publice ale României</h1>` verified in the SSR HTML).

### T2.2 — federated results UI (added)

New `app/search-results.tsx` exporting **`FederatedResults({term, gallery, onNavigate, onReset})`**, rendered in the explore view above the gallery whenever `q` is non-empty (`app/page.tsx`):
- `federatedSearch` runs on a **300 ms-debounced settled term** (stacked on the existing 350 ms SearchInput debounce) with `gallery={places}` (v2-model editorial places) and the client stories corpus (`/stories/manifest.json` → `snapshotJson('/stories/index.json', proof)` — the verified-client-loadable path); eager families resolve locally, network families fan out one `fetchWithServerRetry` per planned request, each response folded with **`federatedCollect`** — abort-guarded so term changes drop every in-flight family response (controllers aborted in cleanup; the updater folds from `base` when the accumulated result belongs to another term).
- **ONE grouped list** in `federatedGroups` registry order — runtime probe evidence for „sala”: 9 groups in exact registry order (local 4, firme 2, sanatate 18, educatie 0, cultura 0, justitie 6, agricultura 0, povesti 0, stiri 4 rezultate), group headers = category label + `countText(count,'rezultat','rezultate')`, 34 rows total.
- Honest states: global busy line „Se caută acum în sursele conectate — N surse sunt în curs de verificare" while any family pending (`federated-busy`); per-group „Se caută și în {registru}…" for that group's still-pending families; gate notes surfaced (lawyers min-3-chars wording); unavailable families degrade with their honest note in a `source-warning` line (AFIR class); done families with total>shown render „N rezultate găsite la sursă — afișăm primele m"; **global honest empty** (`federated-empty`, Empty-pattern action „Resetează căutarea") when no group has rows and nothing is pending — probe: zzqxv → 0 rows + global empty rendered.
- Rows: title + subtitle + 2-line-clamped snippet + subcategory/source line; internal „Deschide" navigation; **external „La sursă" link** from `item.url` for kind article/dataset/story (feed provenance; FeedCards unseeded in v1 per plan); React keys `family:id:index` — unique by construction, the F1 lesson applied.
- e2e-safe assertion hooks for T2.4: `federated-results`, `federated-group` (+`data-group`), `federated-row`, `federated-busy`, `federated-empty`, `federated-note`.
- Styles: one contiguous block in **`app/experience.css`** (my file this wave — `workspaces.css` belongs to the weather agents), `.v2`-scoped, house tokens only (#0f3975/#dbe4e5/#525b68, 12-14px radii, `#f1f4f8` hover), 640px mobile row stacking; no animation introduced → no reduced-motion surface.

### T2.3 — validated tab param + workspace seeds (added)

- **`go()` gains an optional 5th param** (tab + a transient seed object); the hash `tab` is written **only for `view=domain` and only after `validDomainTab(id, tab)`** (topicSections registry — the security-checklist validation). `sync()` accepts `p.get('tab')` **only** for a domain view with a registry-valid value; unknown/foreign tabs reset to default. Probe click-through wrote `#view=domain&id=local&q=18Gym&tab=places`.
- **go()-wiring decisions per FederatedTarget kind:** `place` → `go('place', id)` (editorial-object path); `company`/CUI → `go('company', cui)` (existing shortcut, now surfaced as its own firme group row); places → `go('domain', {domain}, {query: place name}, 'places')` + transient `sub` seed (subcategory filter); catalog datasets → domain `'data'` tab, LiveCatalog seeded by title via the existing initialQuery/category path; lawyers → justitie `'lawyers'` tab seeded by name; directory×4 → educatie/sanatate `'schools'|'health'|'pharmacies'|'hospitals'` tabs seeded by record title; stiri/agricultura articles → their domain `'news'` tab (**FeedCards unseeded in v1** — rows carry the external „La sursă" link instead, per the API contract); stories → povesti `'stories'` tab seeded by title; **dosare → justitie `'legal'` tab with the `courtNumber` seed**.
- **Seed props added** (all following the LiveCatalog/PlacesWorkspace initialQuery precedent — state-initializer seeds, no new lint findings): `LawyersWorkspace({initialQuery})`, `RecordBrowser({kind, initialQuery})`, `StoriesWorkspace({initialQuery})`, `LegalWorkspace({initialQuery, initialCourtNumber})` — initialQuery seeds the Legislation title field; **initialCourtNumber seeds the Courts form** (number prefilled, form adapts to followsNumber mode; the search stays submit-driven — the „seeds the courts form" contract, input-seed precedent, not an auto-run effect) — plus `initialSub` on `PlacesWorkspace` beside its existing initialQuery, and `DomainWorkspace({initialTab, initialQuery, initialSub, initialCourtNumber})`.
- `DomainWorkspace` keeps its whole `content()` id mapping intact (verify-sweep-inventory regex extraction re-run green); `key={domain.id+':'+domainTab}` makes tab deep-links remount on the seeded tab (URL=truth on back/forward; in-workspace tab clicks untouched). Page-level seed state is transient: `go()` clears it on every non-federated navigation (federated domain navs pass the seed explicitly) — no stale court/sub seeds on later direct domain visits.

### The DevOps-reported lint red — resolved (their 3 errors / 121 warnings were my in-flight state)

Their liaison note (STATUS above) observed my intermediate `set-state-in-effect` errors; the landed pattern avoids effect-setState entirely: key-based remount for the seed followers (lawyers/record/stories/domain-tab), state-initializer seeding for the courts form, and an abort-guarded fan-out without ref-in-cleanup. **Final: 0 errors / 114 warnings — the exact pre-existing baseline, zero net new warnings.**

### Closed-resolver constraint — checked, no extension needed

`scripts/verify-location.mjs` + `scripts/verify-search-ui.mjs` compile sets were enumerated: **no module compiled by either script imports `@/lib/live/federated`** (page.tsx/domain-workspace.tsx/search-results.tsx are outside both compile sets), so the conditional rule is not triggered today; both scripts re-run green (DevOps's STATUS §"Stub-resolver conditional" independently reached the same conclusion). Recorded so nobody re-derives it — the rule binds the first change that routes a federated import through a compiled component.

### Files touched (mine)

`lib/live/query.ts` (P1), `scripts/finalize-places.py` (P1 comment), `lib/live/feeds.ts` (F1 dedupe; DevOps's flatMap on the same line kept), `app/api/domain/route.ts` (F1 route dedupe), `public/catalog/sources.json` + `public/data/sources.json` (F2), `app/catalog/page.tsx` (F3), `app/record-workspace.tsx` (F1 hook + RecordBrowser seed), `app/search-results.tsx` (**NEW**, T2.2), `app/page.tsx` (T2.2 wiring + T2.3 go/sync/openFederated), `app/domain-workspace.tsx` (T2.3), `app/lawyers-workspace.tsx`, `app/legal-workspace.tsx`, `app/courts-workspace.tsx` (courts form seed), `app/stories-workspace.tsx`, `app/places-workspace.tsx` (initialSub), `app/experience.css` (federated styles). Session-dir evidence (uncommitted): `probes/probe-p1-normalizer.py`, `probes/probe-p1-rule.mjs`, `probes/probe-f1-afir-dedupe.mjs`, `probes/probe-f2-sources-copy.mjs`, `probes/probe-t22-federated-ui.spec.ts` + `probes/playwright.probe.config.ts`. NOT touched (verified): weather-workspace.tsx, workspaces.css, motion.ts, CI/README (DevOps's), e2e/ specs (Validator's).

### Verification (all run this dispatch, final state)

| Check | Exit | Result |
|---|---|---|
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors (final tree, incl. the DevOps feeds.ts line) |
| `corepack pnpm lint` | 0 | ✅ **0 errors / 114 warnings — exact baseline** |
| P1 probe (RED→GREEN) | 1 → 0 | ✅ 56 mismatches → **0 / 178.868 rows**; Hebrew + Malayalam round-trips pass |
| F1 probe (RED→GREEN) | 1 → 0 | ✅ 6 duplicated URLs → every served article URL unique |
| F2 probe (RED→GREEN) | 1 → 0 | ✅ 13 ops-language leaks → 0 |
| F3 curl | — | ✅ /catalog SSR contains `<h1>Catalogul de date publice ale României</h1>` |
| Fan-out curl ×6 (dev routes, budget-free) | 200 ×6 | ✅ places 18 · catalog 24 · directory 20 · stiri 4 · agricultura honest · lawyers honest-unavailable — all deserialize into the federatedCollect contract |
| Playwright runtime probe ×2 (session config, reuseExistingServer) | 2 passed | ✅ 'sala' → 9 registry-ordered groups / 34 rows, row click → `#view=domain&id=local&q=18Gym&tab=places` + domain workspace mounted; 'zzqxv' → honest global empty; **0 page/console errors** |
| Structural battery with my changes | 0 ×10 | ✅ sweep-inventory · location · search-ui · source-errors · expanded · federated-search · courts-workspace · law-navigation · audit-controls · exploration-media |
| Full e2e suite `corepack pnpm test:e2e` | 0 | ✅ **28/28 passed** (16.9s) — zero regressions |

### Self-review (four lenses)

- **Completeness:** all six assigned tasks implemented, every finding has a failing-first probe, no scaffolding (the courts seed is deliberately form-filling per the PLAN contract, documented above).
- **Quality:** F1 dedupe mirrors the in-file precedent; seeds mirror the LiveCatalog precedent; styles on house tokens in my own css file; Romanian user strings; one-line business-rule comments only.
- **Discipline:** stayed inside the partition (weather files, scripts/, CI, README, e2e/ untouched by me); no git commits/branch ops; dev server never restarted; zero external fetches (all verification local dev routes + offline corpora + samples already on disk).
- **Testing:** probes exercise real shipped code (transpile-import / SSR / Playwright), not mocks of it; the full e2e battery re-run at the end.
- **Known limits (honest):** the dosar-row click-through to the seeded courts FORM is wired + type-verified but not end-to-end probed (its submit hits the live portal.just.ro SOAP service — the Validator's T2.4 legs own that pin); `initialSub` rides the pre-existing initialQuery effect in places-workspace (existing baseline warning, count unchanged); federated AFIR/lawyers honest-degrade states were verified structurally (mock battery + probe route states), not against a good live source response (the ≤2-direct-fetch budget discipline forbids it outside surfaced failures).

## Validator Findings (T2.4/T3.3)

**Status: FAILED — 1 real bug found, documented per dispatch ("NO new app code"), its failing-first e2e leg kept RED as the regression pin; everything else green: 47/48 legs passing (28/28 existing — zero regressions — + 19/20 new), tsc --noEmit 0 errors, lint 0 errors / 114 warnings (exact baseline), full `corepack pnpm test:e2e` run at the merged tree.**

Files: `e2e/federated-search.spec.ts` (15 legs, NEW), `e2e/weather-motion.spec.ts` (3 legs, NEW), `e2e/sweep-regressions.spec.ts` (2 legs, NEW). Suite total 48. No app/ or lib/ file touched by me; the dev server was never restarted; probe scripts + evidence in session `probes/` (probe-stories-dom/check/app/second).

### T2.4 federated e2e — per-leg outcomes (15)

| # | leg (term / flow) | pinned behavior | outcome |
|---|---|---|---|
| 1 | 'sala' from home hero | ONE grouped list: groups ⊆ registry order (subsequence, unique), labels = registry labels, per-group countText grammar exact vs rendered rows (0/2–19/„N de" mirror of countNoun), ≥10 rows, domain-news rows carry external „La sursă" https href | ✅ 9 groups, 34 rows observed consistently |
| 2 | diacritics 'școli' vs 'scoli' | identical group list + identical sorted row titles (normalizeSearch fold across places + catalog + directory families) | ✅ byte-identical snapshots (local + educatie groups incl.) |
| 3 | long multi-word 'ateneul român bucurești' | every word must match (queryMatcher AND semantics): gallery 'Ateneul Român' row in cultura group | ✅ |
| 4 | chip collision 'Brașov' (typed hero term == chip label) | typed term = search: location strip stays default city (no city-context steal); 7 explore filter chips intact, 'Locuri' still filters the editorial gallery; federated list unaffected by chips | ✅ |
| 5 | 'avocați' | justitie group: OSM lawyer-office rows with side label 'Avocați · OpenStreetMap'; IFEP family never silent — rows OR honest `source-warning` note | ✅ (places rows ✓; lawyers family surfaced its honest unavailable note — the 'avocați'-query IFEP parse class, verified stable across calls) |
| 6 | 'notari' | notaries surface via the OSM „Notari" subcategory (side label 'Notari · OpenStreetMap'), ≥2 rows in justitie group | ✅ (18 matching places server-side) |
| 7 | lawyers click-through 'popescu' → row click | domain justitie + `tab=lawyers` in hash + LawyersWorkspace registry input seeded with the clicked name | ✅ |
| 8 | CUI '427282' (numeric) | firme group eager 'Firma cu CUI 427282' row → click → company view: data-view=company, h1 'Verifică o firmă după CUI.', CUI field 427282, hash #view=company&id=427282 | ✅ |
| 9 | dosar '123/45/2024' → row click | justitie/legal + `tab=legal` hash, courts form seeded: 'Număr dosar' input = 123/45/2024, numberScope='all' (Toate instanțele și stadiile), NOT submitted (no .court-results, no busy line) — zero SOAP calls | ✅ the seed-only contract pinned exactly |
| 10 | catalog click-through 'urbanism' | domain local + `tab=data` hash, LiveCatalog input seeded with the dataset title, dataset card surface after 'Întregul catalog național' scope | ✅ (row choice = inventory-local-classified dataset — see V2 for why non-local rows cannot work) |
| 11 | stories 'harap' → row click + external link | povesti group row 'Povestea lui Harap-Alb' + 'La sursă' href `https://ro.wikisource.org/wiki/Povestea_lui_Harap-Alb` → povesti/stories tab + seeded library input + the story card in the grid | ❌ **RED = failing-first pin of bug V1** (row never renders on the first search) |
| 12 | gallery click-through 'castelul peles' | 'Prezentare editorială' row → place view: data-view=place, h1 'Castelul Peleș', hash #view=place&id=peles | ✅ |
| 13 | 'zzqxvqm' (no matches anywhere) | global honest empty (federated-empty + honest copy + reset works and clears the section); every anchored group shows 0 rows with 'Nicio potrivire în această categorie.'; editorial gallery keeps its OWN empty below | ✅ (design renders anchored zero-row groups — asserted their honesty, not their absence) |
| 14 | 'ab' (2-char boundary) | lawyers min-3 gate note verbatim in justitie group ('Tabloul avocaților: Introdu cel puțin 3 caractere…'), other families still search, count/label parity holds | ✅ |
| 15 | 205-char term | honest >200 note (exact copy), zero groups/rows/busy | ✅ |

### T3.3 weather-motion e2e — per-leg outcomes (3)

| # | leg | pinned behavior | outcome |
|---|---|---|---|
| 1 | motion-on sanity | computed animationName matches the per-condition contract read off the scene's OWN class (rain/snow: rain-far/near + snow-far/near pseudos; sunny: glow on the span; night: twinkle+drift comma list on both pseudos (set-matched); cloudy: drift-far/near; img=aflivra-weather-sky; metric-chip + grid icons=aflivra-weather-icon) | ✅ (encountered 'cloudy' + 'sunny' runs — class-driven, no fixed state) |
| 2 | prefers-reduced-motion: reduce emulated | every tracked element/::before/::after computed animationName === 'none'; ambient span stays rendered (static texture) | ✅ |
| 3 | forecast readability under reduce | kicker + condition h2 + temperature + 3 metric chips non-empty; metric-grid ≥12 articles all with non-empty text; forecast table rows non-empty; period chips present | ✅ |

### T1 honest pins — per-leg outcomes (2)

| # | leg | pinned behavior | outcome |
|---|---|---|---|
| 1 | AFIR dedupe (agricultura news) | [data-testid="feed-article"] list: unique h3 titles (Set size == count), ZERO React duplicate-key console errors (the original defect's evidence channel) | ✅ 9 articles, 9 unique titles, 0 duplicate-key errors (route-level probe: 9/9 unique URLs) |
| 2 | /catalog SSR h1 | `page.request.get('/catalog')` 200 + `<h1>Catalogul de date publice ale României</h1>` in the server-rendered HTML | ✅ |

### V1 — REAL BUG (OUR-BUG, T2.4 route): the stories eager family is invisible on the FIRST search of a fresh page

- **Where**: `app/search-results.tsx:19` — `const [result,setResult]=useState<FederatedSearchResult>(base)` snapshots the mount-time `base` (stories corpus still `[]` — it loads via `snapshotJson('/stories/manifest.json')` → `/stories/index.json` ~1s after mount); `app/search-results.tsx:26` — `const current=result.term===settled?result:base` then prefers the stale `result` whenever the term is unchanged, so the corpus-backed `base` recompute never reaches the render. Only a NETWORK collect (`setResult` in the fan-out effect, :21) or a term change updates `result`.
- **Effect**: on the first search of a fresh page (or a `#view=explore&q=…` deep-link), the Povești group always renders „0 rezultate — Nicio potrivire în această categorie." even for terms that match the 233-item corpus; the stories data arrives and is silently dropped. Second searches on the same mounted list work (base is preferred once the term changes).
- **Repro (probes/probe-stories-*;mjs, evidence in session dir)**: open `/#view=explore`, fill 'harap' → `povesti:0`; fill 'creanga' → `povesti:6` (Azima mergătoare, Capra cu trei iezi…); fill 'harap' again → `povesti:2` (Balaurul cel cu șapte capete, Povestea lui Harap-Alb). The corpus itself loads fine (browser-level fetch + sha256 proof verified: 3,692,521 bytes, proof matches, 233 items; StoriesWorkspace on `#view=domain&id=povesti` shows „233 fișe") — the transport is healthy; the loss is purely the React state flow.
- **Fix path (Builder-B's file)**: fold eager recomputes into the rendered state — e.g. keep collecting only the pending-family overlay keyed by term and derive `current` from the fresh `base` (or `setResult(base)` whenever `result.term===base.term` and base changed while no in-flight collect for that term). My leg 11 is the failing-first regression: it goes green the moment the fix lands. NOT fixed by me per dispatch (no new app code).
- **Note**: legs 1/13 pass today partly because stories=0 is indistinguishable from no-match for those terms; after the fix nothing changes for them (zzqxvqm matches no story; 'sala' gains povesti rows symmetrically in the count-parity assertions only).

### V2 — REAL BUG (OUR-BUG, T2.1/T2.3 routing contract): catalog federated rows always target the LOCAL domain regardless of the dataset's own classification, and non-local datasets are unreachable from the seeded tab

- **Where**: `lib/live/federated.ts:117-119` — `catalogItem` derives `domain` from `record.categories`; the `/api/catalog` **national-scope response rows carry no category field at all** (verified keys: id, license, metadata, modified, name, notes, organization, resourceCount, resources, title, url — the geo-context branch at `app/api/catalog/route.ts:12` DOES serve inventory rows with `categories`, but the seeded national path used by the federated fan-out does not), so `categories.find(c=>groupLabels.has(c))||'local'` falls back to `'local'` for EVERY catalog row.
- **Effect**: a dataset the inventory classifies `educatie` (e.g. „Plati Programul național „Școli sigure și sănătoase” (PNSS)”, which the 'școli' legs surface in the local group) click-throughs to `#view=domain&id=local&q=<title>&tab=data`, where LiveCatalog runs under `category=catalogTopic('local')='local'` and the `r.categories.includes(activeCategory)` filter (`app/catalog-workspace.tsx`, filtered useMemo) excludes it — the seeded search honestly reports “0 seturi · Nu sunt seturi pentru acești parametri.” and the clicked object is NOT reachable in the landed workspace (R2's „each entry navigates to the object inside its own category workspace"). 212 of 5,251 inventory datasets are local-classified; the rest can all hit this.
- **Repro (evidence in session + my first failing run)**: search 'școli' → click the catalog row „…Școli sigure…” → local data tab, seeded input correct, result „0 seturi" even after switching 'Context geografic' to 'Întregul catalog național' (it is a category exclusion, not geography). Same title IS in the inventory with `categories:['educatie']` and surfaces under the educatie data tab.
- **Test handling**: leg 10 pins the contract on the subset that honors it end-to-end (urbanism rows — inventory-local-classified) so the click-through path itself stays guarded green; the divergence is reported, not papered over. Fix path (API + Builder-B): map the dataset's category into the `/api/catalog` national response (seed pool rows already carry `category:'educatie'`) and let `catalogItem` target that domain — or seed LiveCatalog's category from the item; either way it needs a route/mapper change, not test changes. NOT fixed by me per dispatch.

### Rate-limit discipline accounting

- **Zero dosar SOAP submits**: leg 9 pins the courts-form seed WITHOUT submitting (asserted no `.court-results`, no 'Se verifică' busy — the one allowed external probe was not needed). No direct upstream fetch of any kind made by me (all curl/python/browser probes hit `127.0.0.1:5173` local dev routes or local files only).
- The federated legs exercise the app's own fan-out (local cached routes; lawyers/IFEP + AFIR/agricultura loaders follow the app's per-query 1h-TTL + failure-backoff machinery — 'avocați' lawyers state verified stable-unavailable, 'popescu' cached). Distinct fan-out terms per first run ≈ 13, each a single upstream attempt per TTL window by the app's design — same class as Builder-B's earlier fan-out curls.

### Verification (final, all run at the merged tree with the 3 new specs)

| Check | Exit | Result |
|-------|------|--------|
| `corepack pnpm test:e2e --reporter=list` (full suite) | 1 | ⚠️ **47/48 passing** — 28/28 existing green (zero regressions) + 19/20 new green; the single red is leg 11 = the V1 failing-first pin (kept red deliberately; never weaken an assertion to green) |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 114 warnings — exact pre-existing baseline |
| targeted eslint on the 3 new spec files | 0 | ✅ 0 problems |

**Final line: FAILED — 1 leg failing (V1, documented with file:line + repro; fix belongs to Builder-B in app/search-results.tsx), V2 documented as the second routing defect; both routed to the orchestrator per dispatch. Suite 47/48.**

## Builder-B Findings (V1/V2 fixes)

**Status: DONE — both bugs fixed with failing-first evidence; leg 11 and the extended leg 10 green; full suite 48/48; tsc 0; lint 0 errors / 114 warnings (exact baseline); verify-federated-search ×2 exit 0 (extended honestly, see below); verify-source-errors 19 families / 114 cells exit 0 (extended honestly, see below); full CI battery 16/16 green.**

### V1 — stories corpus dropped from the first search (fixed)

- **Root cause (1 sentence):** `app/search-results.tsx` snapshotted the mount-time `base` into `useState` (stories corpus still `[]`) and the `result.term===settled?result:base` guard then preferred that stale snapshot for an unchanged term, so the corpus-backed recompute never reached the render.
- **Fix (derived state, no effect-setState — the lint-error class DevOps's liaison flagged):** the only state kept from the fan-out is a **term-keyed overlay of raw network responses** (`CollectedResponse[]{term,family,payload}`, appended with a same-term prune so the array stays bounded at one fan-out ≈ ≤0.5 MB), and the rendered result is **derived every render**: `useMemo` folds `federatedCollect` over the overlay onto the fresh `base` (stale-term entries skipped; `federatedCollect`'s duplicate/late-drop contract gives the dedupe). The mount snapshot and the term-shadow guard are gone; eager families (stories, gallery) recompute from current props on every render.
- **TDD:** the Validator's leg 11 was the failing-first pin (re-confirmed RED this dispatch: story row never rendered, `element(s) not found`); post-fix green end-to-end (row + Wikisource href + povesti click-through + seeded library + story card).
- **Spec repair disclosed (assertions unchanged):** with V1 fixed, leg 11's next assertion surfaced a latent locator defect in the Validator's spec — `storyRow` resolved to the row **button**, but `a.federated-row-source` is a **sibling** of that button inside the `li` (a link inside a button would be invalid HTML), so `storyRow.locator('a.federated-row-source')` could never match. The app provably rendered the exact href (`https://ro.wikisource.org/wiki/Povestea_lui_Harap-Alb` in the aria snapshot of the failed run). Repaired the scoping to the list item (`li{hasText}` → `getByTestId('federated-row')` for the click, `li.locator('a.federated-row-source')` for the href); every expected value is byte-identical to the original pin.

### V2 — catalog rows ignored the dataset's own category (fixed)

- **Root cause (1 sentence):** the `/api/catalog` national-scope response (parseCatalog/D1 shape) carries no classification at all, so `catalogItem`'s `categories.find(c=>groupLabels.has(c))||'local'` fell back to `'local'` for every row — group AND target — and non-local datasets click-throughed to a data tab whose category filter hides the clicked object.
- **Fix (both sides of the seam):**
  - **Route** (`app/api/catalog/route.ts`, national branch only — the geo branch already serves inventory rows): after `readSource`, every served result row is enriched with its classification from the **same integrity-verified inventory snapshot** the client workspace filters by (`localInventory` id-join, sha256-proven like the geo branch, classes map memoized per isolate; a row's own seed-pool `category` string takes precedence; rows already carrying `categories` untouched). Inventory-read failure degrades honestly — rows serve unclassified exactly as before, never 5xx.
  - **Mapper** (`lib/live/federated.ts` `catalogItem`): accepts both served shapes — `categories` (array: enriched/geo rows) **or** `category` (string: seed-pool fallback rows) — and the dataset's own category picks BOTH the item's group (`item.category`) and `target.domain/tab:'data'`, so the click lands where the object is visible. All 14 catalog category ids are domain ids (identity mapping through `groupLabels`, the existing semantics the module already had); unclassified rows keep the documented `'local'` fallback.
- **Live evidence:** `/api/catalog?q=școli&geoScope=national` now returns the 6 PNSS „Școli sigure" rows with `categories:["educatie"]` (21 of 24 rows classified, incl. multi-category rows like `['bani','mediu','cultura']`, 1 honest `[]` fallback); click-through lands `#view=domain&id=educatie&q=<title>&tab=data` and the dataset card is visible on its own category tab.

### Harness extensions (both honest, both exit-0 — disclosed per dispatch)

- **`scripts/verify-federated-search.mjs` LEG 5** + the new category field: a seed-pool-shaped row `category:'educatie'` (real PNSS row from `lib/live/catalog-seed.json`) must land in the educatie group + target, and a row with no classification must keep the local fallback. RED pre-mapper-fix (`un rând servit din copia de rezervă…` assertion failure) → GREEN ×2.
- **`scripts/verify-source-errors.mjs`**: the mock env gains an `ASSETS` binding serving the real `public/catalog/index.json.gz` (mirrors the deployed worker's binding surface + the `verify-geographic-scope.mjs:33` shim precedent — the enrichment reads the inventory through `env.ASSETS`, never the mocked global fetch, so the "doar adresele familiei" zero-unexpected gate keeps holding); the ckan fixture id becomes the real PNSS inventory id and the catalog success + warm-500 cells pin `payload.data.results[0].categories` deep-equal `['educatie']`. RED pre-route-fix (`actual: undefined`) → GREEN (19 families / 114 cells).
- **`e2e/federated-search.spec.ts` leg 10 extended** per dispatch: after the existing urbanism (local-classified) flow, it searches 'școli', clicks the 'Școli sigure' row **inside the educatie group**, and pins hash `#view=domain&id=educatie&q=.+&tab=data`, h1 'Educație & viitor', the seeded LiveCatalog input, and the dataset card visible on that tab (no geo crutch — PNSS is national-coverage). RED pre-fix (row lived in the local group, locator empty) → GREEN.

### Verification (all run this dispatch, final tree)

| Check | Exit | Result |
|-------|------|--------|
| `corepack pnpm test:e2e` (full suite) | 0 | ✅ **48/48 passed** — leg 11 green, extended leg 10 green, 28/28 pre-existing + weather/sweep legs green, zero regressions |
| federated spec alone (mid-cycle) | 0 | ✅ 15/15 (after the leg-11 locator repair; 13/15 pre-fix with both pins RED as evidence) |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 114 warnings — exact pre-existing baseline (targeted eslint on all 6 touched files: 0 problems) |
| `node scripts/verify-federated-search.mjs` ×2 | 0, 0 | ✅ extended harness, both runs green |
| `node scripts/verify-source-errors.mjs` (mock) | 0 | ✅ `{"result":"ok","families":19,"cells":114}` — incl. the enriched-categories cell pins |
| Full CI battery, workflow order (15 scripts) + `verify-geographic-scope` | 0 ×16 | ✅ live · cache · export-formats · legal-refresh · catalog · snapshot-transport · refresh-sweep · ro-text · source-errors · sweep-inventory · model-contracts · federated-search · legal-records · expanded · audit-controls · downloads · geographic-scope (route change is compiled by source-errors + geographic-scope — both re-proven) |
| Live route curl ×2 | 200 | ✅ national rows now carry categories (PNSS → `['educatie']`); geo branch unchanged |

### Files touched (mine, this dispatch)

`app/search-results.tsx` (V1 derived-state rewrite), `app/api/catalog/route.ts` (V2 enrichment, national branch), `lib/live/federated.ts` (V2 mapper), `scripts/verify-federated-search.mjs` (LEG 5 extension), `scripts/verify-source-errors.mjs` (ASSETS shim + fixture id + catalog cell pins), `e2e/federated-search.spec.ts` (leg 10 extension + leg 11 locator repair — the Validator's file, extensions mandated/disclosed), this STATUS append.

### Self-review (four lenses)

- **Completeness:** both register bugs fixed at root cause (state flow; category seam both sides), no scaffolding, harness/spec coverage added for every new behavior (module-level pin, route-level mock pin, e2e click-through pin).
- **Quality:** enrichment joins the exact snapshot the client renders (no second classifier to drift); honest degrade preserved on inventory failure; overlay stays bounded via same-term pruning; comments are one-line business rules; the ASSETS shim reuses the established verify-geographic-scope pattern.
- **Discipline:** no refactors beyond the bugs (e.g. `catalogItem`'s pre-existing `record.note`-vs-`notes` snippet gap left untouched — out of scope); no git commits/branch ops; dev server never restarted; zero external fetches (all probes hit the local dev routes + offline corpora).
- **Testing:** every fix has RED evidence captured this dispatch before its change and a green run after; the full battery re-run because the route file is compiled by two other harnesses.

**Final line: DONE — V1 + V2 fixed and verified (48/48, tsc 0, lint baseline, battery 16/16); harness + spec extensions disclosed above.**

## DevOps Findings (T4.1)

**Status: T4.1: PASSED — the full ordered chain green end-to-end; the stop-and-report contract was never triggered (no step failed, nothing fixed — verification-only dispatch).** Chain run at the current tree: HEAD 9f4d332 + the uncommitted V1/V2 post-commit files (app/api/catalog/route.ts, app/search-results.tsx, lib/live/federated.ts, scripts/verify-federated-search.mjs, scripts/verify-source-errors.mjs + the 3 untracked e2e specs) — the chain certifies exactly this merged state. All scratch logs under /tmp/t41 (outside the repo), removed after this report. Dev server :5173 pre-existing, never restarted; e2e reused it.

### The chain (ordered, every exit code recorded)

| # | check | exit | verdict |
|---|-------|------|---------|
| 1 | `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors |
| 2 | `corepack pnpm lint` | 0 | ✅ 0 errors / **114 warnings = exact baseline** (nothing new) |
| 3 | Full verify battery, workflow order (17 steps) | 0 ×17 | ✅ per-step table below |
| 4 | `corepack pnpm test:e2e` | 0 | ✅ **48/48 passed (38.3s)** — federated 15/15 (incl. leg 11 = the V1 stories pin + the extended leg 10 = the V2 catalog pin), weather-motion 3/3, sweep-regressions 2/2, all 28 baseline legs green |
| 5 | Live parity pass (the SINGLE budget-capped run) | 0 | ✅ result ok — 19 families: 17 ok + 2 source-blocks-egress; 1 direct source probe spent (cap ≤2/family) |
| 6a | `corepack pnpm build` | 0 | ✅ Build complete |
| 6b | `git checkout -- lib/live/seed-snapshots.json` | 0 | ✅ churn quirk reproduced then restored byte-identical (md5 fe9e8e64bd2cdb9db72d445758e3aac3 → 538642e939e36865dbf7efcf106ceb52 → fe9e8e64bd2cdb9db72d445758e3aac3; post-restore `git diff` on the file: empty) |
| 6c | `node scripts/deploy.mjs --dry-run` | 0 | ✅ "wrangler deploy --dry-run exit 0." |
| 6d | `node scripts/db-migrate.mjs --local` (run 1) | 0 | ✅ migration applied — tables source_budget, source_cache |
| 6e | `node scripts/db-migrate.mjs --local` (run 2) | 0 | ✅ **byte-identical no-op** (cmp of both runs' full outputs: identical; „deja aplicată — nimic de făcut") |

### Battery per-step (workflow order, `pr-validation.yml`)

15-script block: live 0 · cache 0 · export-formats 0 (pdftotext present locally — the full generated-PDF re-read leg ran) · legal-refresh 0 · catalog 0 · snapshot-transport 0 („all 6534 snapshots and 676679112 original bytes") · refresh-sweep 0 (5 groups / 21 members, budget sub plafonul de 40 subrequest-uri) · ro-text 0 · source-errors 0 (`{"result":"ok","mode":"mock","families":19,"cells":114}`) · sweep-inventory 0 (16 domenii / 46 secțiuni / 14 categorii catalog / 73 subcategorii / 38 familii de surse, toate acoperite) · model-contracts 0 (offline 4,988 ms, strict post-P1 state — „acord integral", cunoscut-clasă register printed, 0 OUR-BUG) · federated-search 0 (6 legs) · legal-records 0 · expanded 0 · audit-controls 0. Then: verify-downloads 0 (2,101 CSV rows / 37,488 PDF bytes). Then: verify-legal-pdf — **SKIP înregistrat** (python3 pypdf absent locally, same as the CI runner image; the guarded step's overall exit 0). Battery ran ×1 this session per dispatch (idempotence already proven per-script in T1.1/T1.2/T1.6/T1.4c).

### Live parity verdict table (single `--live` run; base http://127.0.0.1:5173, deployedBase https://aflivra.brebu.workers.dev)

| family | verdict | notes |
|---|---|---|
| weather/open-meteo | ok | app 200/cached, worker 200/fresh, no error either leg |
| company/anaf | ok | both legs 200/cached |
| courts/portal.just | ok | app 200/stale, worker 200/fresh |
| feeds/stiri | **source-blocks-egress** | honest NEW surfacing: worker 200/stale with envelope „3 surse au copii vechi sau sunt temporar indisponibile. Celelalte informații rămân disponibile." → direct probe spent **1** (of the ≤2 cap): source itself ok → egress class (3 of the 7 feed hosts degrade on the deployed worker; dev leg 200/cached, no error; per-host `surfaced` register: feed:all-institutions et al.) |
| catalog/ckan | ok | both cached |
| transport/tpbi | ok | worker stale, no error |
| directory/schools | ok | worker stale, no error |
| directory/health | ok | worker stale, no error |
| directory/pharmacies | ok | worker stale, no error |
| directory/hospitals | ok | both cached |
| localities/siruta | ok | both cached |
| lawyers/ifep | ok | both stale, no error surfaced |
| legal/law | ok | both fresh |
| feeds/agricultura | **source-blocks-egress** | the pre-classified AFIR class confirmed WITHOUT spending a direct fetch (worker 200/stale, honest „Sursa a răspuns cu HTTP 500." envelope) — exactly as designed |
| feeds/filme | ok | worker stale, no error |
| events/odeon | ok | both cached |
| cinema/cinemacity | ok | worker stale, no error |
| stories/wikisource | ok | both fresh |
| transport/realtime | ok | app stale, worker fresh |

Totals: **17 ok + 2 source-blocks-egress · 0 our-bug · direct-fetch spending 1 of the ≤2/family cap (stiri only) · script result "ok", exit 0.** Both egress-class verdicts are the documented honest-degrade behavior (last valid copy + Romanian envelope + direct-to-source path) — informational, never a failure verdict. The feeds/stiri surfacing is the honest new datapoint this pass exists to catch: 3 feed hosts hold stale-unavailable copies on the deployed worker while the sources themselves respond — the same Workers-egress class as AFIR, now visible per-host through the surfaced register. Classified and reported per dispatch; no action taken (the honest-degrade UX is the shipped behavior for this class — an upstream/infra fix would live outside this session's scope).

### Post-chain hygiene (read-only checks)
- `git status` after the chain: identical to pre-chain (the V1/V2 modified files + 3 untracked e2e specs + session probes; nothing added by the verification itself — build artifacts untracked/ignored, seed-snapshots restored to zero diff).
- Environment: node v24.19.0; pdftotext present; pypdf absent (guarded-skip parity with the CI runner); .dev.vars present for the gated refresh API specs.

**Final line: T4.1: PASSED — all seven chain steps green: tsc 0 errors · lint 0 errors / 114 warnings (exact baseline) · battery 17/17 (incl. the guarded recorded skip) · e2e 48/48 · live parity ok (17 ok + 2 honest egress classes, 1 direct probe of the ≤2/family cap) · build + seed-restore + deploy-dry-run + db-migrate ×2 byte-identical idempotent.**

## Spec Reviewer Findings

Stage 1 spec-compliance review (independent, distrust-first): every claim re-derived from the tree at HEAD 74b2917 (`git status` clean — the entire session is in 9f4d332 + 74b2917); all mandated re-runs executed locally this review.

**Verdict: Spec Compliance - FAILED — 3 gaps, 0 scope creep. R2 (federated search) and R4 (no regressions) FULLY VERIFIED; the three gaps are small, precisely located, and each has a one-line-ish fix.**

### Per-requirement evidence table

| Req | Status | Evidence (file:line) | Confidence |
|---|---|---|---|
| R1a sweep-inventory gate | ✅ VERIFIED | scripts/verify-sweep-inventory.mjs:24-123 — 16 domains/46 sections ( :24-35), DomainWorkspace content() coverage incl. RecordBrowser 4-kind literal (:36-42), catalogTopic↔catalogCategories both directions (:43-48), places manifest categories↔domains-with-places-section + local-all==178,868==count (:49-57), subcategory master list (:58-63), feeds/afirLoader/filmsLoader (:64-74), transit/directories/cinema/courts/refresh-groups (:75-89), coverage gate reading the parity table LIVE from verify-source-errors.mjs (:90-92, 111-122); wired pr-validation.yml:62 + README.md:187; re-run exit 0 | HIGH |
| R1b source-errors 19 families + classifier + deployed leg | ✅ VERIFIED | verify-source-errors.mjs:59-78 — 19 families enumerated (6 original + directory×4, siruta, lawyers, legal/law, feeds/agricultura `known:'source-blocks-egress'` :73, feeds/filme, odeon, cinema, wikisource, transport/realtime); deployed leg `AFLIVRA_VERIFY_DEPLOYED_BASE` :13-14, skip-when-empty :100, known-class without direct fetch :115; verdict classes ok/our-bug(only exit-1)/source-blocks-egress/source-down/budget/recovered :104-117; mock matrix 6 scenarios × 19 families :387-391 (114 cells) incl. ASSETS shim :19-22 + V2 catalog category cell pins :261/263; re-run `{"result":"ok","families":19,"cells":114}` exit 0 | HIGH |
| R1c model-contracts harness | ✅ exists/wired/green — but narrower than PLAN T1.4 (gap G3) | verify-model-contracts.mjs: LEG1 places :24-141 (full 178,868 walk, 848 sha256 proofs, index↔record parity ×13, spatial exact-once, cities, P1 STRICT gate :96-102 — auto-flips when the runtime normalizer handles all marks), LEG2 dosar :143-199 (fond<apel<recurs + evidence-only + 3 negative extraction probes), LEG3 CKAN :201-276 (raw keys confined, seed pool), LEG4 live corpora :278-414; pr-validation.yml:63 + README.md:188; re-run exit 0 — "acord integral pe 724858 intrări" | HIGH (existence) — gap G3 below |
| R1d-P1 normalizer unification | ✅ VERIFIED | lib/live/query.ts:2-3 (enumerated ccc≠0 class, business-rule pairing comment) vs scripts/finalize-places.py norm() (`unicodedata.combining(c)!=0` + contract comment). **Independent verification this review: Python enumeration of the shipped regex = 934 codepoints, exactly equal to the Python ccc≠0 set (Unicode 16.0) — 0 missing, 0 extra.** Model-contracts strict gate confirms live ("acord integral") | HIGH |
| R1d-F1 AFIR dedupe | ✅ VERIFIED | lib/live/feeds.ts parseAfir flatMap + `uniqueRecords(items, canonicalUrl)`; app/api/domain/route.ts — the `if(state.data)` mapping now routes EVERY kind through `uniqueRecords(...canonicalUrl)`; app/record-workspace.tsx `data-testid="feed-article"`; e2e sweep-regressions leg (unique titles + zero duplicate-key errors) green in the 48/48 run | HIGH |
| R1d-F2 sources-registry copy | ⚠️ PARTIAL (gap G2) | S01/S08/S12 notes + S19.name rewritten in BOTH public/catalog/sources.json and public/data/sources.json (datastore_search/OD_FIRME/SIRUTA_s1/numeParte-family gone — grep 0 hits); BUT residual same-class ops language remains (G2) | HIGH |
| R1d-F3 /catalog h1 | ✅ VERIFIED | app/catalog/page.tsx: `<h1>Catalogul de date publice ale României</h1>` on the .page-intro kicker; e2e sweep-regressions h1 leg green | HIGH |
| R2 federated layer | ✅ VERIFIED | lib/live/federated.ts: 13 families (:81-94: places, catalog, lawyers, directory×4, stiri, agricultura, stories, gallery, cui, dosare); exclusions documented with rationale in the module head (cinema/events locality-day-scoped, transport București-Ilfov coverage gate, SIRUTA reference-lookup, notaries = places subcategory „Notari" only per flag #1); validDomainTab :96-99 (topicSections + 'data'); courtNumberTerm :100-103 (regex gates + slash normalize); federatedSearch >200 cap + honest note, min/max char gates; federatedCollect immutable + duplicate/late drop :204-218; assembleGroups registry order. verify-federated-search.mjs 6 legs re-run exit 0 | HIGH |
| R2 grouped UI + navigation + seeds | ✅ VERIFIED | app/search-results.tsx:14-61 — ONE grouped list in federatedGroups order, headers = label + countText(count,'rezultat','rezultate'), per-group busy/gate/unavailable notes, total>shown "N rezultate găsite la sursă — afișăm primele m", global honest empty + reset, external La sursă link for article/dataset/story, keys family:id:index; V1 fix structure verified (:23-28: term-keyed response overlay + per-render useMemo — no mount-time snapshot, no effect-setState). app/page.tsx:119 FederatedResults above gallery when q≠''; :140 DomainWorkspace key={domain+':'+domainTab} + initialTab/initialQuery/initialSub/initialCourtNumber; go() writes `tab` ONLY for domain AND after validDomainTab; sync() accepts tab only domain+registry+valid; openFederated per target kind (place/company/domain+sub+courtNumber). Seeds: LawyersWorkspace({initialQuery}), RecordBrowser({kind,initialQuery}), LegalWorkspace({initialQuery,initialCourtNumber}→Courts({initialNumber}) prefills the dosar-number form, tab defaultValue 'courts'), StoriesWorkspace({initialQuery}), PlacesWorkspace initialSub. Federated e2e legs 7/8/9/10/11/12 (click-throughs + dosar seed-No-submit + CUI shortcut) green | HIGH |
| R3 weather animations | ⚠️ 10/11 animations real (gap G1) | app/workspaces.css:56-89: all 5 conditions (rain far/near, snow far/near, sunny glow, night twinkle+drift ×2, cloudy drift ×2) + icon pops; every DEFINED keyframe is transform/opacity-only; all selectors `.v2`-scoped → covered by BOTH blanket gates (modern.css `@media(prefers-reduced-motion:reduce){.v2 *,.v2 *:before,.v2 *:after{animation:none!important…}}` + `.v2.no-motion *`); palette reuse verified (#d9eaff/#f3f7ff = pre-existing scene text colors workspaces.css:51/53, #ffffff55 chip border pre-existing, hover #afbcce + 0 8px 24px #1532470a = exact modern.css:9 values — no new hue); weather-workspace.tsx changes are key={background}/key={d.current.time} + aria-hidden ambient span only — zero JS timers, zero libraries (no dependency change in the diff). BUT the 11th animation is dead (G1) | HIGH |
| R4 no regressions | ✅ VERIFIED | e2e legs COUNTED from spec files: federated-search 15 + weather-motion 3 + sweep-regressions 2 + baseline 28 (9 specs) = **48**; re-run: **48 passed (39.2s), exit 0**; `tsc --noEmit` exit 0; `pnpm lint` exit 0 — 0 errors / 114 warnings exact baseline; battery steps in the workflow: 15-script block + verify-downloads + guarded verify-legal-pdf = **17**, zero continue-on-error (grep); drift trio re-run: verify-expanded / verify-legal-records / audit-controls all exit 0 | HIGH |
| T4.1 runtime tails (--live parity table, build, deploy --dry-run, db-migrate ×2) | ⚠️ CANNOT VERIFY | Recorded in T4.1's table; deliberately not re-run by Stage 1 — a second `--live` pass would spend direct source fetches against the user's ≤2/family/session budget; build/dry-run/migrate are re-proved by CI on push (pr-validation.yml:78-103 encodes build + seed-restore + deploy-dry-run + migrate ×2 idempotency). The verdict-ENGINE code itself is verified under R1b. | — |

### Gaps (numbered fix tasks — do NOT proceed to Stage 2 until resolved)

1. **G1 — missing `@keyframes aflivra-weather-sky` (Confidence: HIGH).** app/workspaces.css:57 references `animation:aflivra-weather-sky .55s ease both` on the scene `<img>`; no `@keyframes aflivra-weather-sky` exists in ANY css file, source or dist (repo-wide grep: 10 defined weather keyframes — rain-far/near, snow-far/near, glow, twinkle, night-drift, drift-far/near, icon — vs 11 referenced; dist live-data chunk likewise carries icon but no sky). The claimed condition-change crossfade (STATUS T3.1/T3.2: "scene img fade-in aflivra-weather-sky (.55s, opacity) on every condition change" / "Sky transitions between conditions… gentle crossfade") is INERT — the `key={background}` remount exists but nothing animates. The e2e pin is vacuous for this element: e2e/weather-motion.spec.ts:58 asserts computed `animationName === 'aflivra-weather-sky'`, which returns the declared ident even with no matching keyframes rule — every automated gate passes while the effect never runs. Fix (Builder, app/workspaces.css): add `@keyframes aflivra-weather-sky{from{opacity:0}to{opacity:1}}` beside the other weather keyframes (opacity-only, inherits both blanket gates); optionally strengthen the e2e img assertion to a keyframed property so a missing rule fails CI.
2. **G2 — F2 ops-language cleanup incomplete (Confidence: HIGH).** The T1.5-F2 rewrite fixed the named leaks (S01 data.gov.ro note, S08 ONRC note, S12 portal-just note, S19 name — all verified clean) but the SAME class remains in the user-facing registries, both files: `sources[].note` S44 „Rețeaua școlară 2024-2025" → "…Nu importa date nominale de elevi." (imperative import instruction, exactly the F2 class) and the `personal` ROeID entry → "…nu este sursă universală de date și nu este cerință a MVP-ului." (internal project-phase language). probes/probe-f2-sources-copy.mjs reports GREEN honestly for its scope but UNDER-SCOPES the finding: its 8-token list has no "Nu importa" and it never scans `data.personal`. Fix (Builder): rewrite both strings in user-facing Romanian; extend the probe (add the Nu-importa/MVP-inflected tokens + scan the personal section) so the class is gated, not the 13 original instances.
3. **G3 — permanent model-contracts harness narrower than PLAN T1.4's corpus list (Confidence: HIGH).** PLAN T1.4 and the exhaustive-vs-sampled rule name the model-contract harness corpora as: places ✅, catalog ✅, CNAS ×3 ✅, **SIRUTA ❌, legal snapshots (consolidation asOf/verified shape) ❌, stories corpus ❌**, transport GTFS ✅, cinema ✅ — plus T1.4's "forecast current/hourly/daily+units shape" ❌ and "events corpus shape" ❌ (grep of scripts/verify-model-contracts.mjs: 0 hits siruta/forecast; story/event hits are courtHistory/eventCount). Those corpora WERE fully audited once, offline, by the T1.4 register (13.755 SIRUTA items, forecast 0 unlabeled variables, 233 stories, 19 events — STATUS table) and siblings re-gate slices (stories text sha256 via verify-snapshot-transport; served shapes via source-errors fixtures; legislative mechanics via verify-legal-records on fixtures rather than the real snapshots) — but the STATUS T1.4c phrase "the Validator's T1.4 register made permanent" overstates: 4-5 register legs are not in any permanent gate over the REAL corpora. Fix (DevOps): fold the SIRUTA-items, forecast-labels, stories-corpus and events-corpus legs from the probe register into verify-model-contracts.mjs LEG 4 (all data already on disk; all offline).

### Scope creep: NONE
Every file in `git diff main...HEAD` maps to R1-R4, a justified fix finding (P1/F1/F2/F3, V1/V2), or the sanctioned session-dir artifacts. Noted deviations, not gaps: federated row styles live in app/experience.css rather than the PLAN T2.2-listed workspaces.css ("only if tokens demand" — workspaces.css was the weather agents' serialized partition this session); session probe files/screenshots ARE committed on the branch (sanctioned review artifacts — the T1.3/T3.2 "not committed" prose predates the session-wrap commits).

### Stage 1 re-runs (executed this review, dev server :5173 left untouched)
| Check | Exit | Result |
|---|---|---|
| corepack pnpm exec tsc --noEmit | 0 | 0 errors |
| corepack pnpm lint | 0 | 0 errors / 114 warnings — exact baseline |
| corepack pnpm test:e2e | 0 | **48 passed (39.2s)** |
| node scripts/verify-sweep-inventory.mjs | 0 | full inventory coherent, 38 registry families covered |
| node scripts/verify-model-contracts.mjs | 0 | 4 legs; "acord integral pe 724858 intrări" (strict post-P1) |
| node scripts/verify-federated-search.mjs | 0 | 6 legs |
| node scripts/verify-source-errors.mjs (mock) | 0 | {"families":19,"cells":114} |
| verify-expanded / verify-legal-records / audit-controls | 0 ×3 | drift trio green |

**Spec Compliance - FAILED — 3 gaps (G1 missing weather-sky keyframes at app/workspaces.css:57; G2 residual ops language + under-scoped probe in the two public/*/sources.json; G3 model-contracts permanent coverage vs PLAN T1.4 corpus list), 0 scope creep. R2 and R4 fully verified. Stage 2 blocked until G1-G3 land.**

## Builder-B Findings (G1/G2)

**Status: DONE — both spec-review gaps fixed exactly as prescribed, failing-first probe evidence; 11/11 keyframes consistency; tsc 0 errors; lint 0 errors / 114 warnings (exact baseline); full e2e suite 48/48 with the weather-motion legs 3/3 green on real keyframes.**

### G1 — missing `@keyframes aflivra-weather-sky` (fixed, RED→GREEN)

- **Fix:** `app/workspaces.css` gained exactly one line — `@keyframes aflivra-weather-sky{from{opacity:0}to{opacity:1}}` — inserted directly after the referencing rule `.v2 .weather-scene>img{animation:aflivra-weather-sky .55s ease both}`, matching the file's usage→keyframes adjacency pattern of the other ten weather keyframes. Opacity-only (the transform/opacity token rule), exactly the reviewer's prescribed shape; implements the declared condition-change crossfade on the scene img (`key={background}` remount restarts the fade). Top-level `@keyframes` like its ten siblings — the *referencing rule* is `.v2`-scoped, so both blanket gates (modern.css `prefers-reduced-motion:reduce` + `.v2.no-motion`) freeze it; e2e reduce leg re-proven (img computes `none`).
- **11/11 proof (grep + paren-aware probe):** 11 unique `animation:` idents referenced in workspaces.css (sky, rain-far/near, snow-far/near, glow, twinkle, night-drift, drift-far/near, icon — comma-combined night lists counted once; `cubic-bezier(.2,.8,.3,1.2)` commas are NOT list separators, handled paren-aware) vs 11 `@keyframes` defined in the file, `missing: 0` — was 10/11 before (sky dead).

### G2 — residual ops language in the sources registries (fixed, RED→GREEN)

Surgical string replacements in BOTH `public/catalog/sources.json` and `public/data/sources.json` (compact-JSON formatting preserved, both files re-parse post-edit):
- **S44.note** „Rețea de unități. Verifică anul fiecărei resurse. ~~Nu importa date nominale de elevi.~~" → **„…Nu conține date nominale despre elevi."** — the imperative import instruction becomes a factual statement of what the source does not contain.
- **`personal[5]` ROeID entry (4th element)** ~~„Opțional ulterior; nu este sursă universală de date și nu este cerință a MVP-ului."~~ → **„Acoperire parțială a companiilor din România; nu este un registru complet."** — project-phase language dropped; the data-limit information („nu este sursă universală") kept, in the sibling entries' short factual style.

### TDD evidence

Session probe `probes/probe-g1g2-fix.mjs` (the F2 probe's class, extended per the reviewer's under-scoping note: token list + /Nu importa/i; scans `data.personal` — both elements and both files):
- **RED (pre-fix, exit 1):** exactly the reviewer's two findings — `G1: 10/11 referenced animation idents have @keyframes rules` + `FAIL … animation 'aflivra-weather-sky' is referenced with no @keyframes rule in any shipped css file` (definitions collected across every shipped app css file — the reviewer's repo-wide form) + 4 G2 hits (S44.note ×2 files, personal[5][3] ×2 files).
- **GREEN (post-fix, exit 0) ×2 (idempotent):** `G1: 11/11 referenced animation idents have @keyframes rules` + `G1+G2 GREEN`, zero failures.

### Verification (all run this dispatch, dev server :5173 untouched)

| Check | Exit | Result |
|---|---|---|
| `node probes/probe-g1g2-fix.mjs` (RED → GREEN, GREEN ×2) | 1 → 0, 0 | ✅ both reviewer findings reproduced pre-fix; 11/11 + 0 ops hits post-fix, stable on re-run |
| grep proof: `@keyframes` in workspaces.css vs referenced idents | — | ✅ **11 defined / 11 referenced / 0 missing** (full ident list enumerated above) |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 114 warnings — exact pre-existing baseline |
| `corepack pnpm test:e2e` (full suite) | 0 | ✅ **48 passed (39.7s)** — zero regressions |
| `playwright test e2e/weather-motion.spec.ts` alone | 0 | ✅ 3/3 — the motion-on contract leg (img = `aflivra-weather-sky`), the reduce leg (img = `none`, blanket gates hold with the new keyframes) and the readability leg all green |

### Files touched (mine, this dispatch)

`app/workspaces.css` (1 line: the missing @keyframes), `public/catalog/sources.json` + `public/data/sources.json` (2 string rewrites each), `ssnc-agent-orch/…/probes/probe-g1g2-fix.mjs` (session probe, failing-first evidence), this STATUS append. **NOT touched, per dispatch:** e2e specs, scripts/, CI, README — the permanent gates for the G1/G2 classes (a keyframed-property e2e assertion so a missing rule fails CI; the committed F2 probe's "Nu importa" token + personal[] scan) belong to the parallel DevOps agent.

### Self-review (four lenses)

- **Completeness:** both gaps fixed exactly as the reviewer prescribed, nothing else; no scaffolding. The 11th animation now genuinely runs (the `key={background}` remount was already in weather-workspace.tsx — only the keyframes rule was dead).
- **Quality:** the keyframes is the ten-sibling pattern (opacity-only, adjacent to its referencing rule, gate-inheriting); the rewrites keep the informational value (data limits: no nominal pupil data; partial company coverage, not a complete registry) in clean user-facing Romanian matching the sibling registry prose.
- **Discipline:** minimal diff — 1 CSS line + 4 string replacements; no git commits/branch ops; dev server never restarted; zero external fetches (all verification local); stayed inside the dispatch partition (permanent-gate work explicitly left to DevOps).
- **Testing:** failing-first probe reproduced BOTH reviewer findings before any change; green and idempotent after; full battery of the dispatch's verify commands re-run at the final tree.
- **Known limits (honest):** e2e's `animationName` assertions (weather-motion.spec.ts:58) still read the declared ident rather than a keyframed property — a missing keyframes rule would not fail THAT leg even now (the reviewer's vacuous-pin note); my session probe gate closes it locally, the permanent form is DevOps's per dispatch.

**Final line: DONE — G1 + G2 fixed and verified (11/11 keyframes, registries clean, tsc 0, lint baseline, e2e 48/48 incl. weather-motion 3/3).**

## DevOps Findings (G3/gates)

**Status: PASSED — G3 corpora folded into verify-model-contracts LEG 4 (exit 0 ×2 idempotent, ~5.2 s, fully offline); the G1 class gated permanently by a NEW scripts/verify-css-keyframes.mjs (exit 0 ×2, 5 negative/positive scratch proofs incl. the exact G1 regression shape); the G2 class gated permanently inside verify-ro-text.mjs (exit 0 ×2 on the Builder's post-fix registries, every token class proven to bite on a scratch registry); full battery in workflow order green ×1 (17 verify steps incl. the guarded skip); tsc --noEmit 0; lint 0 errors / 114 warnings (exact baseline); YAML valid, zero continue-on-error.**

### G3 complete — verify-model-contracts.mjs LEG 4 extended with the corpora the PLAN named but the harness omitted

LEG 4 banner now reads "…transport network, SIRUTA localities, legal snapshots, stories, events, forecast labels"; distill source: the T1.4 register (probe-legal.mjs / probe-live.mjs — session artifacts, never permanent). Per-corpus counts printed (new "Corpuri de referință" line):
- **SIRUTA** (server-seed `siruta`, full walk): **13.755 localități** — item shape (id/name, parent/postal string-when-present, environment ∈ Urban|Rural), non-empty corpus, period present → exit-1 classes; ~0 without county (register's data-gap noted), 13.755/13.755 without `details` → `siruta-details-dropped=13.755` known-state line (the documented seed-copy drop, LocalitySearch falls back to the row).
- **Legal snapshots** (public/legal-snapshots manifest.json + historical-manifest.json, 12 items): stored fileSha256/fileBytes + decompressed content sha256/bytes proofs (**24 dovezi**), characters-count agreement, textProvided non-empty, consolidation contract via the REAL `verifiedConsolidation` (transpiled live from lib/live/legal-consolidation.ts + its text.ts import — not a copied predicate) + explicit versionDate ≤ asOf — **1 cu consolidare asOf** (CODUL PENAL 2026-07-23 ≤ 2026-10-05). Matches the register's clean row exactly.
- **Stories corpus** (public/stories/index.json.gz, full): **233 povestiri, 233 dovezi text** — index shape (id/title/url/characters integer >40/file), every text file present, every sha256/bytes proof verified.
- **Events corpus** (server-seed `events:odeon`, full): **19 spectacole** — parsed contract (id/title/start & end `YYYY-MM-DDTHH:mm` — the ODEON seconds-dropped normalize rule, url valid, media array, content string, sourceName) + global start-sorted.
- **Forecast labels**: every variable in currentVariables/hourlyVariables/dailyVariables (transpiled live from lib/live/forecast.ts) must carry a Romanian label in app/weather-workspace.tsx (**60 variabile ceruse, toate cu etichete** — raw-key leak gate) + parseForecast round-trip envelope (current/hourly/daily/units/timezone; parsed rows stay within the requested variables).
- Idempotence + auto-discovery: exit 0 ×2 back-to-back; every corpus read from disk paths that live with the repo (new seeds/snapshots flow in without harness edits). Register corrections inherited from T1.4c remain the harness's headers (13.971 cities etc.).

**Negative proofs (scratch scaffold under the sanctioned temp dir, repo untouched, cleaned after):** baseline green, then 5 mutations each exit 1 with the exact check name — SIRUTA environment='Oraș' → `siruta-item-shape`; CODUL PENAL versionDate→2026-12-31 (> asOf) → `legal-snapshot-consolidation`; a story proof sha256 zeroed → `stories-text-proof`; events[0].start moved later → `events-order`; `temperature_2m:` label renamed in a scratch weather-workspace copy → `forecast-raw-label-leak`. Restored baseline green after each.

### G1 gate — scripts/verify-css-keyframes.mjs (NEW, own script — static source analysis is a different class than the data-contract corpora)

- Every `animation:`/`animation-name:` declaration in EVERY `app/*.css` (13 files, auto-discovered) is tokenized paren-depth-aware (comma- and space-safe inside `var()`/`cubic-bezier()`); CSS-wide + animation keywords, times, iteration counts and timing functions are dropped per the spec's animation-name ident space; **every remaining custom ident must have a `@keyframes` definition in the app css set** (cross-file). `var()` in an animation value must resolve from the stylesheets or carry a literal fallback (the runtime inline-style side of the contract — motion.ts sets `--reveal-delay`, whose `0ms` fallback resolves to the time class). Definitions-only or references-only drift both visible; per-file definition counts printed in Romanian.
- Current state: **22 referințe / 16 definiții / toate conforme** — the Builder's landed `@keyframes aflivra-weather-sky` (workspaces.css:58) is now a gated fact, not a review observation. The vacuous-e2e class can never land again: a referenced-but-undefined ident fails CI at the static layer, independent of the `animationName` computed-style read.
- **Negative/positive proofs (scratch scaffold, cleaned after):** undefined ident appended → exit 1 `[app/workspaces.css:103] [aflivra-weather-sky-x] animation referențiază @keyframes nedefinit`; unresolved `var()` without fallback → exit 1; `var(--x,.2s)` with time fallback → green; cross-file + `animation-name:` longhand + comma-combined night lists → green; the exact original G1 shape (sky definition deleted, reference kept) → exit 1 at `app/workspaces.css:57 [aflivra-weather-sky]` — the reviewer's finding location reproduced. Repo runs ×2 green.
- Real-bug fixes made while proving it: (1) the function-stripping regex ate `var(...)` before the var branch ever ran (dead code — caught by the unresolved-var scratch mutation); (2) top-level comma splitting broke `var(--reveal-delay,0ms)` into two bogus idents — replaced with the paren-depth tokenizer.

### G2 gate — verify-ro-text.mjs extended into the permanent ops-language gate

- The countText battery is untouched; a second section discovers **every** `public/*/sources.json` registry (currently catalog + data; auto-discovers future ones) and scans the user-visible string fields for the internal-ops token class: sources[].name/note/access/refresh/license/integration/checked/domain + every other string field EXCEPT `endpoint`/`evidence`/`url` (the sanctioned „Toate detaliile inventarului" labeled disclosure + address fields), top-level scopeNote, and every personal[] entry (strings and [name,url,label,note] arrays — the ROeID row where the Builder's MVP residual lived). Embedded and standalone urls are stripped before tokenizing (the CNPP `intrebari_frecvente` address path is not prose).
- **Token list (T1.3 findings + G2 residuals + the F2 probe's originals):** `/\bmvp\b/i` (project-phase), `/\bnu importa(?:ți)?\b/i` (imperative import instructions — the S44 residual class; first-person privacy statements do not match), the SOAP camel idents `numeParte|numarDosar|obiectDosar`, ALL-CAPS snake `\b[A-Z][A-Z0-9]*(_[A-Za-z0-9]+)+\b` (OD_FIRME/SIRUTA_s1 class), lowercase snake `\b[a-z][a-z0-9]*(_[a-z0-9]+)+\b` (datastore_search/datastore_active class). Per-token regex flags — the snake classes stay case-sensitive (an /i there double-reports the same token, found and fixed in the scratch run).
- **Timing note (the dispatch's wait-state branch, resolved):** the Builder's G1/G2 fixes landed on the tree BEFORE my gates were first run (S44 note and personal[5] already in user-facing Romanian; `@keyframes aflivra-weather-sky` present at workspaces.css:58) — both gates were green from their first run; re-run green again after their STATUS section appeared (dispatch protocol).
- **Negative proofs (scratch registry `scratchreg/sources.json`, temp dir, cleaned after):** all 5 token classes bite with exit 1 + one hit per token with its label (OD_FIRME name, MVP + Nu importa note, datastore_search/datastore_active, numeParte scopeNote, MVP in personal[0][3]); the deliberate non-hits hold — `endpoint`/`evidence` carrying raw ops language NOT flagged (labeled disclosure), the CNPP url snake path NOT flagged, clean Romanian variant exit 0.

### Battery + README wiring (same change as the scripts)

- `.github/workflows/pr-validation.yml`: verify battery block 15 → **16 scripts** (+ `node scripts/verify-css-keyframes.mjs` after audit-controls.mjs); total verify steps 17 → **18** (block + verify-downloads + guarded verify-legal-pdf). Zero continue-on-error (grep 0; unchanged).
- `README.md`: the sh pipeline block gains the same `node scripts/verify-css-keyframes.mjs` line (after audit-controls, matching the workflow position); verify paragraph gains the verify-css-keyframes blurb + the verify-ro-text registry-scan sentence + the verify-model-corpus extension (SIRUTA, legal snapshots asOf, stories proofs, events order, forecast labels) — docs and code in the same change per repo rule.

### Verification (all run this dispatch, final tree)

| Check | Exit | Result |
|-------|------|--------|
| `node scripts/verify-model-contracts.mjs` ×2 (+post-STATUS confirm) | 0, 0, 0 | ✅ PASS — idempotent; "Corpuri de referință: SIRUTA 13755 localități, 12 copii legale verificate (24 dovezi sha256, 1 cu consolidare asOf), 233 povestiri cu 233 dovezi text, 19 spectacole ordonate cronologic, prognoză: 60 variabile cerute, toate cu etichete românești"; 5.223 ms offline |
| `node scripts/verify-css-keyframes.mjs` ×2 (+confirm) | 0, 0, 0 | ✅ PASS — 22 referințe / 13 foi / 16 definiții, toate cu definiție prezentă; 5 scratch proofs (incl. the exact G1 shape at workspaces.css:57) |
| `node scripts/verify-ro-text.mjs` ×2 (+confirm) | 0, 0, 0 | ✅ PASS — count grammar + "Registrele de surse (catalog/sources.json, data/sources.json) scanate…"; every token class proven to bite |
| Full CI battery, workflow order (18 verify steps incl. guarded legal-pdf) | 0 ×18 | ✅ live · cache · export-formats · legal-refresh · catalog · snapshot-transport · refresh-sweep · ro-text · source-errors · sweep-inventory · model-contracts · federated-search · legal-records · expanded · audit-controls · **css-keyframes** · downloads · legal-pdf (SKIP înregistrat — pypdf absent, same guard as the CI image) |
| Scratch negative mutations (G3 ×5, G1 ×5, G2 ×3) | 1 ×13 | ✅ every gate bites with the exact check name; restored baselines green after each |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ PASS |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 114 warnings — exact pre-existing baseline; targeted eslint on the 3 touched scripts: 0 problems |
| `ruby -ryaml` workflow parse + continue-on-error grep | OK / 0 | ✅ PASS |

- [devops] Files touched (exactly the dispatch set): scripts/verify-model-contracts.mjs (LEG 4 extension), scripts/verify-css-keyframes.mjs (NEW), scripts/verify-ro-text.mjs (G2 section), .github/workflows/pr-validation.yml (battery line), README.md (pipeline line + 3 blurb edits), this STATUS append. No app/ or public/ file touched (the G1/G2 app-side prose/keyframes edits observed on the tree belong to the parallel Builder-B dispatch, confirmed by their STATUS section above).
- [devops] **G3 + G1 gate + G2 gate: PASSED — all checks successful.**

## Debugger Findings (image reload loop)

**Issue (user report, Romanian):** „la explorare locuri, la cele cu imagine se încarcă prin refresh imaginea în continuu" — on the Explore view, the place cards' images keep reloading continuously after a page refresh.

**Root cause:** `app/page.tsx:95-96` (pre-fix lines) declared **`SaveButton` and `PlaceCard` inside the `Aflivra` function body** — the "component defined during render" anti-pattern. Every Aflivra render produced new function identities, so the reconciler treated `<PlaceCard>` / `<SaveButton>` as a *different component type* at the same tree position and **unmounted + remounted the whole card subtree — every `<img>` destroyed and re-created, restarting its load**. The recurring re-render drivers present after every refresh, with zero interaction: **`useLiveData`'s 60-second interval refresh** (`app/live-data.tsx:16`: `setInterval(60000)` → `setBusy(true)` + `setData`/`setBusy(false)` = two back-to-back renders per tick), the initial `/api/live` + local-weather + cities arrivals in the first seconds, and (with device location saved, `aflivra.location.v1 mode:device`) every `watchPosition` fix. Re-created `loading="lazy"` imgs re-request or cache-decode + flash on every tick → the visible "image loads forever" loop. Both definitions (and the drivers) date from v1 (`69ae6c9`, git -S verified); not introduced by this session's changes.

### Phase 1 — reproduce + isolate (probe scripts in the session dir, evidence JSONs in `probes/`)

Instrumentation: Playwright + dev-server probes tracking (1) every network request (timestamp + resourceType), (2) img element identity via MutationObserver serials (added/removed elements + `src` attribute mutations), sampled per 5s. Rate discipline held: local dev server only, observation windows capped 66-75s, no scripted external fetches.

- **Run 1** (`probe-image-reload.mjs` → `probes/image-reload-run1.json`, default geo, photos filter, reload): network silent after settle — but the DOM observer was blind (attached to `documentElement` too early — lesson learned); run 2's observer attaches to `document`.
- **Run 2** (`probe-image-reload2.mjs` → `probes/image-reload-run2.json`, mobile 390×844, `mode:device` saved, refresh + 66s drift window): **12 gallery `<img>`s destroyed and re-created en masse, twice within 109ms** (serials 116-127 at t=60234, 128-139 at t=60343 on the post-reload page clock) — gallery-only; the PlacesWorkspace entity grid (module-level memo'd components) untouched. Earlier same-signature bursts at t=4432/4482 (50ms apart) when the filter response + live data settled; initial SSR→hydrate→explore swap at t=237/706.
- **Run 3** (`probe-image-reload3.mjs` → `probes/image-reload-run3.json`) — deterministic isolation, no geolocation, no interaction: **at exactly the 60s `useLiveData` tick: 24 gallery img adds / 24 removes / 24 src sets at t=60232 & t=60337 (two renders ~105ms apart = `setBusy(true)` then `setData`/`setBusy(false)` of one refresh tick)**. CONTROL: a PlacesWorkspace-internal state change (sort select) → gallery churn **0** (churn requires an Aflivra-scope render). One Aflivra-scope state change (search `setQ`) re-created the whole visible gallery. Post-reload gallery img creations total: **96** (pre-fix).

Alternatives from the dispatch list, ruled out with the probe evidence: (a) same-img src churn — src values identical, churn only on *creation*, zero value churn on kept elements (control run); (b) **remount loop — CONFIRMED as the mechanism**; (c) onError→retry — gallery imgs have no onError, EntityCard's failed-flag is one-shot per mount and the entity grid never churned; (d) state/poll loop → **CONFIRMED as the driver damage-wise** (60s interval + arrivals; `/api/places` itself serves `status:'cached'` with no `sources` array → no useSource polling was involved — entity grid add-count 0 at the tick); (e) useSource/poll re-keying — not involved (previous point; `key={item.id||item.url}` in ContentReader is on a different surface and stable across responses); (f) CSS animation flicker — DOM nodes literally replaced, not animated (all card CSS is transitions/one-shot reveals); (g) federated overlay / go() / sync() / geo.key — the repro reproduces with zero interaction, no query, default geo.

### Phase 2 — root cause (file:line + mechanism)

`app/page.tsx:95` `const SaveButton=…` and `:96` `const PlaceCard=…` (pre-fix) — inline component definitions → per-render type identity → unmount/remount of every PlaceCard (explore gallery, home recommended, place-detail suggestions, recommendations, saved) and the hero SaveButton; every `<img>` re-created on every Aflivra re-render; the 60s `useLiveData` tick (live-data.tsx:16) + initial data arrivals (+ geo fixes with device mode) make it recur "continuously" after a refresh. eslint's own `react-hooks/static-components` rule was already flagging exactly this (HEAD warnings at old lines 123/128/143: SaveButton + 2× CompanyCard).

### Phase 3 — RED spec first (permanent e2e leg)

`e2e/place-image-stability.spec.ts` (NEW, 1 test): tags every `.exploration-gallery img` with `data-stab` serials in the live DOM, then (1) an Aflivra-scope re-render with unchanged gallery content ('Locuri cu galerii' chip) must keep the same DOM img elements; (2) a 64s still window containing the 60s live-refresh tick must keep the same elements AND re-fetch zero `/media` images (`page.on('request')` counting); zero page errors.
**RED (pre-fix run):** `Expected: 12, Received: 0` — one chip click replaced all 12 tagged gallery images. **GREEN (post-fix):** 1 passed (1.3m) — both parts, zero re-fetches.

### Phase 4 — fix at the root (minimal, no refactor beyond it)

`app/page.tsx`: `SaveButton` + `PlaceCard` **hoisted to module scope** beside the sibling helper components (Badge/SectionHead/Stat/Empty pattern), with explicit props threading exactly what the bodies used to close over: PlaceCard gains `{p, onOpen, savedIds, onToggle, compareIds, onCompare, position}`, SaveButton gains `{id, name, saved, onToggle, withText}`; all user-facing strings/classes/aria byte-identical to the originals. `openPlace=(id)=>go('place',id)` added inside Aflivra; all 6 PlaceCard call sites + the hero SaveButton call site pass the props. The dead `wide` prop dropped with the shape change (zero call sites used it — verified). `CompanyCard` stays inline (uses Aflivra-scope `go`/`latest`/`financial`, imageless — outside the defect's blast radius; its 2 `react-hooks/static-components` warnings remain, noted here, not silently fixed).
**Post-fix probe** (`probes/image-reload-run3-postfix.json`): identical census — **all-zero deltas through the full 75s window incl. the 60s tick** (was 24/24/24); total gallery img creations after reload **12** (the initial render only; was 96); setQ now diffs only the legit content change.

### Verification (final tree)

| Check | Exit | Result |
|-------|------|--------|
| RED: `playwright test e2e/place-image-stability.spec.ts` (pre-fix) | 1 | 🔴 `Expected: 12, Received: 0` — the failing-first pin |
| GREEN: same spec (post-fix) | 0 | ✅ 1 passed (1.3m) — both assertions |
| `corepack pnpm test:e2e` (full suite) | 0 | ✅ **49 passed** (48 baseline + 1 new), zero regressions |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors |
| `corepack pnpm lint` | 0 | ✅ **0 errors / 113 warnings** — baseline 114 minus ONE resolved `react-hooks/static-components` warning (the old inline `<SaveButton id={place.id} withText/>`, HEAD page.tsx:128; page.tsx 19→18). No new warnings. |
| `node scripts/audit-controls.mjs` (pins page.tsx) | 0 | ✅ 347 controls |
| `node scripts/verify-exploration-media.mjs` (pins explore gallery wiring) | 0 | ✅ 28 destinations / explorer navigation |
| Post-fix DOM probe census incl. the 60s tick | 0 | ✅ zero img remounts, zero re-fetches (was 24/24/24 per tick) |

CSS not touched (`verify-css-keyframes` N/A), no lib/live or data change (`verify-model-contracts` N/A), no new lib module (closed stub resolvers N/A — confirmed against conventions).

### Conventions Applied

**Source:** `ssnc-agent-orch/2026/10/06/sweep-federated-search/conventions.md` (read before coding).

- No comments in code except business rules — the fix adds none; the spec file documents itself in the existing spec-comment style (explore-place.spec.ts precedent).
- Romanian user strings preserved byte-identical; no new user strings.
- e2e RED spec first against the unmodified tree; suite green (49/49).
- Source budget discipline: zero direct upstream fetches (all probes local dev server; windows capped; page's own `<img>` tags only).
- macOS discipline: `corepack pnpm` only, dev server reused (:5173 never restarted), no git commits/branch ops.

### Files touched (this dispatch)

`app/page.tsx` (hoist + props threading + openPlace), `e2e/place-image-stability.spec.ts` (NEW, permanent regression leg), this STATUS append. Session-dir evidence (untracked): `probe-image-reload.mjs`, `probe-image-reload2.mjs`, `probe-image-reload3.mjs`, `probes/image-reload-run1.json`, `probes/image-reload-run2.json`, `probes/image-reload-run3.json`, `probes/image-reload-run3-postfix.json`.

**RESOLVED — root cause: SaveButton/PlaceCard components defined inside the Aflivra render body (app/page.tsx, pre-fix lines 95-96) gave every re-render new component identities, unmounting/remounting all place-card `<img>`s; the 60s useLiveData tick (and data arrivals / geo fixes) made the churn recur continuously after refresh. Fixed by hoisting to module scope with explicit props; regression-pinned by e2e/place-image-stability.spec.ts (RED 12→0, GREEN, suite 49/49).**

## Spec Reviewer Findings

Stage 1 spec-compliance **re-verification (round 2, post-remediation)**: all six mandated checks independently re-derived from the remediated tree; every gate re-executed by this review (distrust-first — no Builder/DevOps/Debugger claim accepted without independent execution or code reading). Verdict below supersedes round 1's FAILED (G1/G2/G3).

**Verdict: Spec Compliance - PASSED — 0 gaps, 0 scope creep. Stage 2 (Code Quality Review) UNBLOCKED.**

### Per-check evidence (all re-run/re-derived this review)

| Check | Status | Evidence (file:line) | Confidence |
|---|---|---|---|
| G1 — keyframes | ✅ VERIFIED | `node scripts/verify-css-keyframes.mjs` → exit 0 ("22 referințe / 16 definiții, toate conforme"); reviewer's independent paren-aware cross-derivation over every app/*.css: 16 referenced custom idents = 16 defined, 0 missing, 0 orphaned; `aflivra-weather-sky` referenced app/workspaces.css:57, `@keyframes aflivra-weather-sky{from{opacity:0}to{opacity:1}}` :58 (opacity-only, the prescribed shape); all 11 weather idents grep-verified (rain-far/near, snow-far/near, glow, twinkle, night-drift, drift-far/near, icon, sky — each ref+def) | HIGH |
| G2 — ops language | ✅ VERIFIED | `node scripts/verify-ro-text.mjs` → exit 0; reviewer grep (both files, all fields): 0 hits for Nu importa/MVP/SIRUTA_s1/OD_FIRME/datastore_search/datastore_active/numeParte-family; glob confirms exactly 2 registries (public/catalog/sources.json + public/data/sources.json); the two residual strings rewritten in BOTH: S44.note "…Nu conține date nominale despre elevi." + ROeID personal entry "Acoperire parțială a companiilor din România; nu este un registru complet."; gate scope read in script: personal[] scan (verify-ro-text.mjs:49-53) + scopeNote (:48) + 5 token classes incl. /nu importa(?:ți)?/i + /\bmvp\b/i (:35) — under-scoping closed; reviewer regex-proof: every token class bites on the old G2 strings, clean on the rewrites | HIGH |
| G3 — model-contracts coverage | ✅ VERIFIED | scripts/verify-model-contracts.mjs LEG 4 extended with every PLAN-named corpus the harness omitted: SIRUTA (:416-431 shape incl. environment ∈ Urban\|Rural + period), legal snapshots with the REAL transpiled `verifiedConsolidation` + versionDate ≤ asOf (:437-453), stories index + text sha256/bytes proofs (:459-470), events parsed contract + global start-sorted (:474-489), forecast labels live-transpiled from lib/live/forecast.ts + parseForecast envelope (:492-507); re-run → exit 0: "SIRUTA 13755 localități, 12 copii legale verificate (24 dovezi sha256, 1 cu consolidare asOf), 233 povestiri cu 233 dovezi text, 19 spectacole ordonate cronologic, prognoză: 60 variabile cerute, toate cu etichete românești" — counts match the T1.4 register; data sources all real repo corpora (lib/live/server-seed.json :279, public/legal-snapshots, public/stories/index.json.gz) | HIGH |
| NEW — image-reload fix (R1 rendering correctness) | ✅ VERIFIED | app/page.tsx:44 SaveButton + :45 PlaceCard hoisted to module scope, explicit props, zero Aflivra-scope closures (bodies reference only module imports + props — read line-by-line); all 6 PlaceCard call sites (:111, :121, :136, :141, :143, :144) + hero SaveButton (:129) thread the props; `openPlace` :77; dropped `wide` prop passes nowhere (verified against every call site); e2e/place-image-stability.spec.ts is a genuine element-identity oracle (data-stab serials + chip re-render part 1 + 64s window over the 60s tick + zero /media re-fetch + zero page errors, :25-67) — green in the 49/49 run; CompanyCard stays inline as disclosed (imageless, 2 acknowledged static-components warnings — deliberate, not a gap) | HIGH |
| Battery integrity | ✅ VERIFIED | Full battery re-run this review in pr-validation.yml workflow order: 17 steps — live · cache · export-formats · legal-refresh · catalog · snapshot-transport · refresh-sweep · ro-text · source-errors · sweep-inventory · model-contracts · federated-search · legal-records · expanded · audit-controls · css-keyframes · downloads — **all exit 0** (source-errors: `{"result":"ok","mode":"mock","families":19,"cells":114}`); `grep -r continue-on-error .github/workflows/` → **0 hits**; battery block order 1:1 with the workflow (:53-70) incl. verify-css-keyframes at :68; guarded verify-legal-pdf skips-with-record locally (pypdf absent — same guard as the CI runner image, the recorded T1.6 design) | HIGH |
| Suite + tsc + lint | ✅ VERIFIED | `corepack pnpm test:e2e` → exit 0, **49 passed (1.3m)** including e2e/place-image-stability.spec.ts green (both assertions) and all 28 baseline + federated 15 + weather-motion 3 + sweep-regressions 2 legs; `corepack pnpm exec tsc --noEmit` → exit 0; `corepack pnpm lint` → exit 0, **0 errors / 113 warnings** ≤ 114 — the −1 is the hoist-resolved `react-hooks/static-components` warning (page.tsx module-scope :44 verified = the claim's mechanism) | HIGH |

### Standing requirements (round 1, remediation-independent — unchanged)
R1a sweep-inventory gate, R1b source-errors 19 families + deployed-worker leg, R1c model-contracts harness wired, R1d-P1 normalizer unification (934-codepoint ccc≠0 class, strict gate "acord integral" re-confirmed in this review's battery run), R1d-F1 AFIR dedupe, R1d-F3 /catalog h1, R2 federated layer + grouped UI + navigation + seeds, R4 no regressions — all VERIFIED HIGH in round 1; the three remediated gaps (G1/G2/G3) are closed per the table above. The Debugger's mid-session image-reload fix is in-scope via R1's rendering-correctness mandate (user-reported defect, latent since v1 — not scope creep) and R4 (suite green, zero regressions). T4.1 runtime tails (--live parity pass, build, deploy --dry-run, db-migrate ×2) remain recorded-not-re-run by Stage 1 per round 1's budget rationale — CI re-proves build/restore/dry-run/migrate on every push (pr-validation.yml:79-104).

### Gaps: NONE. Scope creep: NONE (round 1 assessment stands).

**Spec Compliance - PASSED — 0 gaps, 0 scope creep. All requirements verified through code inspection and re-executed gates; all six mandated re-verification checks hold. Stage 2 unblocked.**

## Quality Reviewer Findings

Stage 2 code quality review over the full shipping state (`git diff main...HEAD` = commits 9f4d332 + 74b2917 + the dirty working tree incl. G1/G2/G3 remediation + the image-reload fix + place-image-stability spec). Prerequisite verified: Stage 1 round-2 PASSED stands (line 796). Independent verification re-run by this review (not inherited): `verify-css-keyframes` ✓ exit 0 (22 referințe / 16 definiții — G1 fix in tree), `verify-ro-text` ✓ (both registries clean incl. the new ops-language prose scan), `verify-sweep-inventory` ✓ (16 domenii / 46 secțiuni / 73 subcategorii / 178.868 locuri / 38 familii toate acoperite), `verify-federated-search` ✓ (6 LEGs), `verify-model-contracts` ✓ exit 0 (SIRUTA 13.755 / 12 copii legale cu 24 dovezi / 233 povestiri / 60 variabile prognoză), `tsc --noEmit` ✓ 0 errors, `lint` ✓ 0 errors / 113 warnings (≤ 114, −1 = the hoist), fresh e2e spot-runs on the live dev server: federated-search 15/15 (31.2s), weather-motion 3/3, sweep-regressions 2/2. Stage 1's fresh full-battery (17 gates exit 0) and 49/49 suite run from today accepted as the remaining evidence.

**Verdict: Code Quality Review - APPROVED — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 6 LOW. Ship it.** The MEDIUMs are polish (a dead conditional that reads like a bug; a once-per-mount double fan-out), neither blocks.

### Findings

| ID | Severity | Confidence | Location | Finding |
|---|---|---|---|---|
| QR-1 | MEDIUM | HIGH | lib/live/federated.ts:152 | `asObjects(family==='places'?data.items:data.items)` — both branches identical; the ternary reads like an intended shape difference that isn't there. Collapse to `asObjects(data.items)`. |
| QR-2 | MEDIUM | HIGH (mechanism) | app/search-results.tsx:24-27 | Fan-out effect keys on the whole `base` object; the async stories-corpus load (null→items) re-creates `base`, so the first search of every mount fires the 9-family fan-out twice (abort+refetch; duplicates dropped by `federatedCollect`, so correctness holds — only duplicated requests against our own no-store routes). Key the effect on the request plan (settled term + URLs). |
| QR-3 | LOW | HIGH | lib/live/federated.ts:197-199 | `courtNumberTerm(text)` re-derived inside `if(dosar)` plus a `!` assertion — `dosar` already holds the value; `const number=dosar`. |
| QR-4 | LOW | HIGH | lib/live/federated.ts:190 | Local `text` shadows the module-level `text()` helper inside `federatedSearch`; harmless (helper unused in that scope) but a hazard for the next reader — rename. |
| QR-5 | LOW | HIGH | app/search-results.tsx:29-31 | During the 300 ms settle window after a term change, the section renders the NEW term's heading over the OLD term's settled groups with no busy marker (busy appears only while families are pending). Show busy while `settled !== term.trim()`. |
| QR-6 | LOW | MEDIUM | app/api/catalog/route.ts:14-20 | `enrichCatalogClasses` swallows the inventory integrity failure with `catch{}` while the geographic branch 503s on the same corruption; serving unclassified rows is the right degrade for live search, but the deliberate asymmetry deserves a one-line business-rule comment. |
| QR-7 | LOW | HIGH | lib/live/federated.ts:1-45 | Header cites session/plan task references (T2.2/T2.3/T2.4, conventions.md) that rot after the session; keep the v1-exclusion rationale (genuine business rules) but reference consumers by module name (FederatedResults, page.tsx, verify-federated-search.mjs). |
| QR-8 | LOW | HIGH | scripts/verify-sweep-inventory.mjs:8-10 | New Romanian multi-line comment vs conventions.md "comments in English, one line" (repo majority is English: query.ts, federated.ts, verify-css-keyframes). verify-source-errors.mjs:8-13 keeps its pre-existing Romanian comment (main precedent) — align on English for new comments. |

### Verified clean (review's own checks)

- **House rules**: no scaffold/TODO/FIXME markers in the diff ("placeholder" hits are the React input prop only); no secrets (registries carry URLs and honest copyleft notes only); Romanian user-facing copy correct with diacritics, counts via countText everywhere incl. the independently re-derived parity grammar in e2e/federated-search.spec.ts:13-17 (matches countNoun exactly: 1/21/101 singular, 0 & 2-19 plural, 20+ „de"+plural).
- **YAGNI**: no dead exports (every new federated.ts export consumed by page.tsx / search-results.tsx / the harness); dropped `wide` prop passes nowhere; seed props added are all threaded.
- **Federated layer**: immutable collect confirmed (LEG 5 asserts the input never mutates); registry-order invariance under late responses gated (LEG 6); the federatedGroups mirror of v2-model.domains is deliberate (closed-resolver constraint — v2-model imports a public JSON asset) and drift-gated, not silent duplication; honest degrade on every path (unavailable/malformed/stale-with-data/late-duplicate/unknown-family, all assert-covered).
- **Derived-state overlay (search-results.tsx)**: no effect-setState loops, responses array bounded (per-term filter + one entry per family per run; duplicates dropped on collect) — no memory growth; gallery prop is the stable module constant.
- **Weather CSS**: transform/opacity-only keyframes on composited layers inside `isolation:isolate` (no z-fighting with map credit/labels — separate stacking contexts), palette drawn from the scene's existing token family, double gating (matchMedia + `.v2.no-motion` + media blankets) proven by the emulated reduced-motion legs; scene/metric re-mount re-keys (`key={background}`, `key={d.current.time}`) replace effect-driven animation resets. G1 fixed in tree (definition beside its reference, opacity-only).
- **/api/catalog enrichment join**: id-join failure degrades honestly — uncategorized rows keep the reserved local group (assert-covered in both harness LEG 5 and the e2e „școli" leg); stale-copied rows carry their own category (the 74b2917 fix, pinned).
- **page.tsx hoist**: module-scope SaveButton/PlaceCard with explicit props at all 6 PlaceCard + 1 hero call sites, `openPlace` helper, zero Aflivra-scope closures (read line-by-line); CompanyCard stays inline (imageless, disclosed, acceptable); regression-pinned by e2e/place-image-stability.spec.ts (identity oracle + zero /media re-fetch over the 60 s tick — the 64 s window is the oracle, not an anti-pattern).
- **Harness scripts**: all honest-failure (no silent-pass classes — empty corpus exit 1, per-violation file:line, buckets→exit 1, internalError→exit 1); LEG 4b verifies the real transpiled modules (verifiedConsolidation, parseForecast, workspace labels) instead of hand-copied shapes; the 934-codepoint ccc≠0 normalizer parity is corpus-proven both directions (index↔runtime) — the enumerate-in-TS vs unicodedata-in-Python asymmetry is documented at both sites.
- **Workflow/README**: 4 `continue-on-error` crutches removed; verify-legal-pdf records an explicit skip; battery block and README runbook list the same 17 steps in order incl. verify-css-keyframes; README prose matches the code (19 families, deployed-leg default, our-bug-only non-zero exit, 73 subcategories).
- **Tests**: 21 new legs assert behavior (labels, hash params, honest states, element identity) not brittle selectors (data-testid used sparingly: feed-article, federated-*); countText parity assertions re-derive the grammar instead of importing it — meaningful.

**Code Quality Review - APPROVED.**

## Builder-B Findings (QR polish)

**Status: DONE — exactly the three dispatched findings applied (QR-1, QR-2, QR-8; the remaining LOWs QR-3–QR-7 stay registered, untouched per dispatch); QR-2 has failing-first probe evidence (RED 9×2 → GREEN 9×1); tsc 0 errors; lint 0 errors / 113 warnings (exact baseline, zero new); e2e 49/49; verify-federated-search ×1 exit 0; verify-sweep-inventory ×1 exit 0 — all re-run at the final tree.**

### QR-1 — dead ternary in mapFamily (lib/live/federated.ts:152)

Collapsed `asObjects(family==='places'?data.items:data.items)` → **`asObjects(data.items)`** (reviewer's note, both branches identical). The sibling mapping ternary `family==='places'?placeItem:r=>lawyerItem(r,term)` is real and untouched. Behavior-identical by construction (a refactor, not a behavior change) — proven by `verify-federated-search` LEG 5 mapping places + lawyers rows against the collapsed expression (exit 0) and the full e2e suite.

### QR-2 — first-search double fan-out (app/search-results.tsx effect re-key)

- **Root cause (reviewer-confirmed, reproduced this dispatch):** the fan-out effect keyed on `[base]` — the whole `federatedSearch` result object — and the async stories-corpus arrival (`null → items`, ~1s after mount) re-creates `base`, re-triggering the effect: the first search of a fresh mount fired the 9-family fan-out twice (wave 1 aborted + wave 2 re-issued; duplicates dropped by `federatedCollect`, so only duplicated requests remained).
- **Fix (identity semantics only — overlay/derived-state architecture untouched):** the effect now keys on **what it actually consumes**: `deps:[requestPlan,planTerm]`, where `planTerm=settled.trim()` and `requestPlan=useMemo(()=>federatedSearch(planTerm).requests,[planTerm])` — a term-derived plan that is content- and identity-stable across corpus/gallery arrivals. The effect body no longer reads `base`; responses are tagged with `planTerm` (= `base.term`, both the trimmed settled term, so the V1 derive memo's `response.term!==base.term` filter still folds every response). The `base` memo, the response overlay state, the derive memo and all render markup are byte-unchanged.
- **Load-bearing invariant, pinned as session evidence:** planned requests are a pure function of the settled term alone — options (gallery/stories corpora) never influence request planning (eager families never produce requests; gates+builders are term-only). Probe LEG 0 transpile-imports the shipped federated.ts and asserts bare-vs-full-options `requests` are identical for 'harap'/'ab'/blank.
- **TDD evidence (`probe-qr2-fanout.mjs`, evidence `probes/qr2-fanout.json`):** **RED (pre-fix, exit 1):** deep-link `#view=explore&q=harap` on a fresh mount → all 9 family URLs fired **2×** each (timeline: corpus `/stories/index.json.gz` at t≈800ms, second wave t≈1110–1308ms — the exact mechanism, recorded in the evidence log). **GREEN (post-fix, exit 0):** every family URL fired **1×**, corpus arrival still inside the window (the trigger case exercised, not avoided), federated rows still render (V1 fold preserved — stories flow through the `base` recompute, never through the effect). Term changes still refire and abort correctly (requestPlan content changes with the term).
- Lint-clean re-key by construction: the effect reads only `requestPlan`, `planTerm` and the stable setState/import identifiers — `react-hooks/exhaustive-deps` fully satisfied, zero new findings on a file where compiler rules run at error severity.

### QR-8 — Romanian multi-line comment (scripts/verify-sweep-inventory.mjs:10-13)

The 4-line Romanian block replaced with the one-line English business rule: **"Inventory gate: enumerate the app's full surface from the registries (offline) and refuse any refresh-groups source family that neither parity nor a named harness covers."** — detail-list dropped (it restated the code's own asserts), the two actual rules kept. Comment-only change; `verify-sweep-inventory` re-run exit 0 (16 domenii / 46 secțiuni / 73 subcategorii / 178.868 locuri / 38 familii toate acoperite).

### Verification (all run at the final tree, dev server :5173 untouched)

| Check | Exit | Result |
|---|---|---|
| `node probes/../probe-qr2-fanout.mjs` (RED pre-fix → GREEN post-fix) | 1 → 0 | ✅ 9 family URLs ×2 each → ×1 each; corpus arrival in-window both runs; LEG 0 plan-invariance green |
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ 0 errors |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 113 warnings — exact baseline, zero new (targeted eslint on the 3 touched files: 0 findings) |
| `corepack pnpm test:e2e` (full suite) | 0 | ✅ **49 passed (1.4m)** — incl. federated leg 11 (stories first-search, the V1 pin) and all weather/sweep/image-stability legs; zero regressions |
| `node scripts/verify-federated-search.mjs` ×1 | 0 | ✅ 6 legs — LEG 5 maps places+lawyers over the collapsed `asObjects(data.items)` |
| `node scripts/verify-sweep-inventory.mjs` ×1 | 0 | ✅ full inventory coherent, 38 registry families covered bidirectionally |

### Files touched (mine, this dispatch)

`lib/live/federated.ts` (QR-1: 1 line), `app/search-results.tsx` (QR-2: effect re-key + term-derived plan memo + 1 business-rule comment), `scripts/verify-sweep-inventory.mjs` (QR-8: comment), session probe `probe-qr2-fanout.mjs` + evidence `probes/qr2-fanout.json`, this STATUS append. NOT touched: the other QR findings' targets (QR-3/QR-4 `lib/live/federated.ts` low-polish lines, QR-5 settle-window busy, QR-6 catalog-route comment, QR-7 module-header refs — all stay registered for the orchestrator), e2e specs, CI, README.

### Self-review (four lenses)

- **Completeness:** exactly the dispatch's three findings, no more (QR-3–QR-7 deliberately left registered), no scaffolding; the probe's RED was captured against the unmodified tree before any edit.
- **Quality:** house compact indent preserved (a +1-space drift my first edit introduced was caught against `git show HEAD` and normalized); the new comment is one line, English, business-rule; effect deps exactly cover its reads.
- **Discipline:** no git commits/branch ops; dev server never restarted; zero external fetches (probe = localhost dev routes + offline transpile-import; all 9 fan-out URLs are the app's own cached local routes).
- **Testing:** the one behavioral fix (QR-2) has failing-first browser evidence incl. the corpus-arrival timeline; the two behavior-identical fixes are proven by their existing gates + the full suite re-run at the final tree.
- **Known limits (honest):** the plan-invariance invariant (requests never depend on options) is pinned at session level (probe LEG 0), not as a permanent harness leg — the permanent gate lives in verify-federated-search LEG 4's per-term request contract; promoting the options-independence assertion there is a DevOps/scripts-owner decision, recorded here so it is a choice rather than an omission.

## Builder-B Findings (hero provenance hidden)

**Task**: Hide the homepage hero's inline provenance (user: "ascunde astea sau fă să nu mai fie acoperite") — the caption stack, the "Fotografia originală" button and the per-image "Proveniență și transformări" export widget — while the CC BY-SA 2.0 attribution stays available in the existing "Surse și licențe" panel.

### What was removed (app/page.tsx, hero section, one JSX div)

The entire `<div className="hero-side">` block: `ILUSTRAȚIE EDITORIALĂ · STILIZARE AI` kicker, the `Munții Bucegi / După o fotografie de xulescu_g · CC BY-SA 2.0.` caption stack, the "Fotografia originală" lightbox button and the `AssetExport path="/media/hero-style.json" title="Proveniență și transformări"` widget (combobox "Format pentru proveniență și transformări" + PDF + "Salvează fișierul PDF"). The hero keeps: image (unchanged, `hero-graphite-blue.webp`), gradient, heading, subtitle, search, suggestion chips, DERULEAZĂ scroll hint. Untouched: the ROMÂNIA ÎN IMAGINI area and the CategoryDirectory footer "Surse și licențe" export (different widget, kept), `hero-style.json` (canonical provenance record, sha-checked by the battery), the About-page manifest export, the shared lightbox/photo-credit code.

### Where the credit lives now

`public/media/category-manifest.json` — the manifest the "Surse și licențe" export in the CategoryDirectory footer serves — gained an `editorial-hero` entry: caption "Munții Bucegi — ilustrație editorială derivată…", credit `xulescu_g / Wikimedia Commons`, license `CC BY-SA 2.0` (+ licenseUrl), `sourceUrl` (Commons file page) and `originalUrl` (original photograph) — attribution moved, it didn't disappear. The `category: "editorial-hero"` value is outside `CategoryPhoto`'s mapping, so no new banner renders. README's "Fotografia originală rămâne disponibilă în galerie." (true only via the removed button) now states the credit lives in the licenses export.

### TDD cycle (RED → GREEN → REFACTOR)

- **RED**: added e2e leg `home-smoke.spec.ts:69` ("home hero shows no inline provenance; the licenses panel keeps the hero credit") + `verify-catalog.mjs` invariants (manifest length 29, hero-credit field assertions, 14×2 category-photo invariant scoped to category photos). Verified failing: `node scripts/verify-catalog.mjs` → `AssertionError: 28 !== 29`; the e2e leg failed on `Expected substring: not "ILUSTRAȚIE EDITORIALĂ"` against the live hero.
- **GREEN**: hero-side removal + manifest entry + README wording. Re-ran: verify-catalog exit 0; home-smoke 5/5.
- **REFACTOR**: no orphaned imports (`Mountain`, `AssetExport` still used elsewhere); `.hero-side` CSS rules left in place (inert — no matching element; pre-existing code I did not write), recorded here as a deliberate keep.

### Tests / battery / gates (all this dispatch's final tree)

| Check | Exit | Result |
|---|---|---|
| `corepack pnpm exec tsc --noEmit` | 0 | ✅ |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 113 warnings — exact documented baseline, zero new |
| `corepack pnpm test:e2e` (full suite) | 0 | ✅ **50 passed (1.3m)** — 49 pre-existing legs + the new hero-provenance leg; zero regressions |
| `node scripts/verify-ro-text.mjs` | 0 | ✅ count agreement + sources-registry language scan |
| `node scripts/verify-sweep-inventory.mjs` | 0 | ✅ full inventory coherent |
| `node scripts/verify-catalog.mjs` | 0 | ✅ 29 attributed photos (28 category + hero credit incl. original-photograph link); 14×2 category coverage intact |
| `node scripts/audit-controls.mjs` | 0 | ✅ hero-graphite-blue.webp + CategoryDirectory×2 asserts still hold |
| `node scripts/verify-css-keyframes.mjs` | 0 | ✅ |
| `node probe-hero-provenance.mjs probes/hero-provenance.json` | 0 | ✅ verdict PASS |

### Probe proof lines (probes/hero-provenance.json)

```
PASS — hero provenance hidden; credit exported in the licenses panel
ssrProvenanceLeaks: []
domHeroLeaks: []
heroSideElements: 0
licensesSelect: "Format pentru surse și licențe"
manifestEntries: 29
heroCredit: credit "xulescu_g / Wikimedia Commons", license "CC BY-SA 2.0",
  sourceUrl https://commons.wikimedia.org/wiki/File:Bucegi_…,
  originalUrl https://upload.wikimedia.org/…Bucegi_….jpg
```
SSR HTML (status 200) contains zero removed strings and both licenses-panel strings; rendered DOM: hero essentials intact (image + h1 + search label `Caută în Aflivra` + 3 chips + scroll hint), 0 page errors.

### Files touched (this dispatch only)

`app/page.tsx` (hero-side div removed), `public/media/category-manifest.json` (+1 editorial-hero credit entry), `scripts/verify-catalog.mjs` (invariants for the new state — strengthened, not weakened: hero-credit fields asserted, 14×2 scoped), `e2e/home-smoke.spec.ts` (+1 leg), `README.md` (1 sentence made true again), session `probe-hero-provenance.mjs` + `probes/hero-provenance.json`. Pre-existing uncommitted work in `page.tsx`/`README.md` from the earlier session left as found.

**Status: DONE** — hero provenance UI removed, CC BY-SA 2.0 attribution preserved and pinned (e2e + battery + probe), 50/50 e2e, 0 lint errors/113 baseline warnings, tsc clean.

## DevOps Findings (afir relay workflow)

**Status: PASSED — the GitHub Actions relay tour + zero-dep relay runner + ghRelayed registry class delivered and frozen by a new permanent harness (13 legs, exit 0 ×2); both AFIR relay harnesses (route-side + runner-side) green ×2 at the merged tree; tsc 0; lint 0 errors / 113 warnings (exact baseline); YAML valid, zero continue-on-error; registry/battery/README wired in the same changes.**

### T1 delivered — the relay tour (new, production infra)

- **`.github/workflows/afir-refresh.yml`** — schedule **`cron: "0 */2 * * *"`** (the user-decided every-2-hours cadence) + `workflow_dispatch`; `permissions: contents: read`; `concurrency: afir-refresh, cancel-in-progress: true`; `timeout-minutes: 10`; steps: sparse `actions/checkout@v4` (cone `scripts` — the tour needs one file) → `actions/setup-node@v4` (Node 22) → `node scripts/relay-afir.mjs`. **No commit/push step** (the relay POSTs data; git history stays clean — the D1 store IS the store; per-run audit lives in the workflow logs). Exit-2 mapping is explicit, not a `continue-on-error` (the repo invariant stays 0): the step script captures the code and turns **only** class 2 (afir.ro itself errored) into a `::warning::` annotation + exit 0; class 1 (our infrastructure) stays red. Env: `AFLIVRA_SEED_BASE: ${{ vars.AFLIVRA_SEED_BASE }}` (repo-variable override; empty → script default) + `AFLIVRA_REFRESH_TOKEN: ${{ secrets.AFLIVRA_REFRESH_TOKEN }}`.
- **`scripts/relay-afir.mjs`** — pure Node, zero deps, dual-mode (CLI via argv[1] import-meta guard; exports constants + `relayAfir(env)` for the harness). Flow: validate config → **fail-fast exit 1 before any contact** when `AFLIVRA_REFRESH_TOKEN` is unset → GET the feed at **`https://www.afir.ro/`** (the EXACT `afirLoader.url` — same URL, same data; UA `Aflivra/1.0 gh-relay`, the app connector's Accept header, 18 s AbortController bound, 5 MB read cap — the app's own connector budgets) → POST phase `feed` `{phase:'feed',body:<raw page>}` with `Authorization: Bearer` → read `{want:[urls]}` → dedupe + **same-origin transport rule** (the relay only carries pages from the origin it fetched the feed from — a broken or compromised seed route cannot turn the runner into a proxy; foreign wants are refused, relayed-with the valid subset, and reported loud at exit 1) → cap 10 (route caps too — belt and braces) → fetch each wanted URL sequentially (same UA/Accept; per-item honest lines; failures dropped, never invented) → POST phase `articles` `{phase:'articles',items:[{url,html}≤10]}` **only when items is non-empty** (the route 400-rejects empty lists; empty `want` = complete cycle, fast exit) → read `{stored:[urls],failed:[{url,error}]}`.
- **Exit classes (parity verdict mirrors)**: 0 = source reachable + relay completes (even 0 articles); **1 = our infrastructure** (worker unreachable, 401/403 auth rejected, non-OK worker responses, foreign want, contract-violating worker replies); **2 = informational, still 0** (afir.ro network/timeout/HTTP errors on the feed; all wanted article pages failed at the source; the route's 400 boundary rejecting the source's content — the route's Romanian error message is surfaced verbatim in the log).

### T3 — the stub test, made permanent: `scripts/verify-relay-afir.mjs` (NEW)

Loopback double of the source AND the seed route (one http server, request-log asserted) + async `spawn` of the relay script (a **`spawnSync` would block the parent event loop and starve the very server the child needs — found the hard way, fixed with async spawn**). 13 legs, all against the loopback — **zero external fetches from this machine** (the script runs on the GH runner in production): full protocol (POST bodies deep-equal **byte-for-byte** against the fixture raw feed + article pages; `want` drives fetching — the source GET log is exactly 1 feed + the wanted articles; the Bearer token appears ONLY on seed POSTs, **never on source GETs**; UA + the app's Accept on every request); want-empty cycle-completion (single POST, no empty items); the 10-item cap of 11 wanted (first 10 in `want` order, `[limită]` line); feed 500 → exit 2, zero POSTs; hung source → abort fires at the real 18 s bound (elapsed asserted ≥ 16 s, kind 'unreachable' class pinned), zero POSTs; dead seed route → exit 1; 401 → exit 1, one POST; 400-rejected feed → exit 2 with the route's error message surfaced; foreign `want` → valid subset relayed + exit 1 with `[refuzat]`; missing token → exit 1 **before any contact** (both logs empty); all article pages failing at the source → no empty-items POST, exit 2; per-article route rejections → honest `stored=N, failed=M` + `[eșuat]` lines, exit 0; total route rejection → exit 2. Static gates: URL parity with `afirLoader` (live regex over `lib/live/feeds.ts`), the workflow text pins (`0 */2 * * *`, dispatch, the runner invocation, the secret wiring, no continue-on-error, no git push/commit), the registry classification, and the route-harness `stored`/`failed` contract pin. Fixtures are REAL: feed page rebuilt from the verified `server-seed.json` `feed:agricultura` items (real slugs, real titles, real dates in the `card-body news-content` shape `parseAfir` accepts — the same generator family the route harness uses), article pages in the Builder's `articleHtml` shape.
- Output: `node scripts/verify-relay-afir.mjs` → **exit 0 ×2** (13/13 legs; `{"result":"ok","legs":13,"feedItems":8,"articlesCap":10,"feedUrl":"https://www.afir.ro/","route":"/api/seed/afir"}`), re-proven ×2 more at the final tree.

### T4 — registry/harness alignment (shared state, resolved)

- **`lib/live/refresh-groups.json`** — the tree was clean when I made the change (Builder hadn't touched it): `feed.agricultura` moved out of the `registers` cron members (estimate 31 → 30; sweep total 161 → 160) into the new **`ghRelayed`** class with a published Romanian reason naming the relay mechanism (no duplicated cadence constant — the workflow owns the schedule, the harness gates it). Single-writer semantics: the cron sweep never touches AFIR; the relay tour is the only writer of its freshness.
- **`scripts/verify-refresh-sweep.mjs`** — frozen pins updated (registers membership minus `feed.agricultura`; unique members 21 → 20 ×2 places; the member-key pin moved out with the member) + the new block: `ghRelayed` entries carry family+reason, pinned to `['feed.agricultura']`, and **a relayed family is never also cron-swept** (single-writer gate).
- **`scripts/verify-sweep-inventory.mjs`** — the coverage gate reads `ghRelayed` families into the registry universe (still **38 distinct families covered bidirectionally**: 20 members + 9 seedBacked + 8 onDemand + 1 ghRelayed); `feed.agricultura` coverage entry moved from the member table to the explicit family table with **both** its parity family (`feeds/agricultura`) and the named harness (`verify-afir-relay.mjs`).
- **`scripts/verify-source-errors.mjs`** — classifier documentation updated for the relayed state (code-read proof, no behavior change needed): a clean deployed AFIR leg (relay fresh) falls through the verdict engine to **`ok`** — no branch fires; the stale+envelope leg (relay data aged past TTL, in-worker fetch hitting the still-egress-blocked source) keeps the pre-classified `source-blocks-egress` class, and the known-class note now names the relay context. Both states are informational (exit 0) — `our-bug` remains the only exit-1 verdict.
- **`.github/workflows/pr-validation.yml`** — battery gains two lines after `verify-css-keyframes`: `node scripts/verify-afir-relay.mjs` (the Builder's route-side TDD gate) + `node scripts/verify-relay-afir.mjs` (the runner-side gate) — block 16 → **18 scripts**, 20 verify steps total incl. downloads + guarded legal-pdf. Zero continue-on-error (grep: 0).
- **`README.md`** — same two pipeline lines; two blurb sentences; the group table (registers minus `feed.agricultura`, 30, totals 160/160 + „20 de reîmprospătări"); the new `ghRelayed` table + a relay-tour paragraph (protocol, cadence, exit classes, the token story, both harnesses); the refresh-sweep blurb gains the single-writer sentence.

### Contract reconciliation with the Builder (their route landed mid-flight — three divergences from the dispatch's provisional spec, all resolved against the authoritative implementation)

The Builder's STATUS section is not yet appended, but their **committed artifacts are the contract**: `scripts/verify-afir-relay.mjs` (route-side TDD harness) landed first, then `app/api/seed/afir/route.ts` + the `cache.ts`/`content.ts` publishing chain. I read both line-by-line and aligned:

1. **The dispatch's provisional articles reply `{stored,fresh}` is NOT what the route returns** — the actual contract is `{result:'ok'|'partial',phase:'articles',stored:[urls],failed:[{url,error}],servedAt}`: `stored` is a LIST, `fresh` does not exist. The relay requires the `stored`+`failed` arrays, prints honest counts + per-article `[eșuat]` lines. (Noted as the dispatch's mismatch #1.)
2. **Empty items POST**: my provisional design always POSTed phase `articles`; the route 400-rejects an empty list (`Lipsește lista de articole de preluat.`) — the relay now completes the cycle at the feed phase when `want` is empty (also the mandated "fast exit when nothing to relay"). (Mismatch #2.)
3. **Auth and caps aligned without change**: `Authorization: Bearer` vs `env.REFRESH_TOKEN` (the same shape as `/api/refresh`), feed body cap 5 MB (= the route's `FEED_CAP` = my read cap), `want` capped at 10 in feed order by the route itself, article html ≤8 MB (route) > 5 MB (my read cap) — compatible.
- **File-name collision, resolved**: the Builder's route harness overwrite of `scripts/verify-afir-relay.mjs` clobbered my first runner harness mid-flight (both agents chose the name). I moved my runner-side gate to **`scripts/verify-relay-afir.mjs`** (verb-object mirroring the `relay-afir.mjs` script name) — no further collision; both files are in the battery, each gating its own side.
- **Ops wiring note (for the Builder/runbook)**: the GitHub secret `AFLIVRA_REFRESH_TOKEN` must carry the same value as the worker's `wrangler secret put REFRESH_TOKEN` — the relay sends it as the Bearer token; it never reaches afir.ro (harness-pinned).
- **For the Builder (lib/ is theirs)**: `lib/live/refresh-sweep.ts:39` still maps `'feed.agricultura':()=>afirLoader` — now orphaned by the registry move (the member left every cron group; the mapping is unreachable through the sweep, harmless dead config, tsc-green). Removal is theirs to decide; nothing pins it.

### Verification (all run at the final merged tree — my files + the Builder's landed route/harness/lib changes)

| Check | Exit | Result |
|---|---|---|
| `node scripts/verify-relay-afir.mjs` ×2 (+×2 during +×2 final) | 0, 0, 0, 0, 0, 0 | ✅ 13/13 legs each run — the two-phase contract, byte-exact bodies, want-drives-fetch, token placement, exit classes |
| `node scripts/verify-afir-relay.mjs` (Builder's route harness) ×2 + earlier | 0, 0, 0 | ✅ 8 legs green at the merged tree (route landed mid-session; was RED before it landed — their TDD gate) |
| `node scripts/verify-refresh-sweep.mjs` ×3 | 0, 0, 0 | ✅ `{"result":"ok",groups:5,members:20,relayed:"feed.agricultura",...}` — ghRelayed single-writer pinned |
| `node scripts/verify-sweep-inventory.mjs` ×3 | 0, 0, 0 | ✅ 16 domenii / 46 secțiuni / 38 familii de surse din registry, toate acoperite (incl. ghRelayed via parity + harness) |
| `node scripts/verify-source-errors.mjs` (mock) ×3 | 0, 0, 0 | ✅ `{"result":"ok","mode":"mock","families":19,"cells":114}` — with the Builder's cache.ts changes compiled in |
| `node scripts/verify-model-contracts.mjs` + `verify-federated-search.mjs` (final tree) | 0, 0 | ✅ offline corpora + federated layer green at the merged tree |
| `corepack pnpm exec tsc --noEmit` ×2 (pre- and post-route-landing) | 0, 0 | ✅ 0 errors — incl. the Builder's route/lib changes + my registry JSON change (structural typing tolerates the `ghRelayed` key) |
| `corepack pnpm lint` | 0 | ✅ **0 errors / 113 warnings — exact documented baseline**; targeted eslint on my 5 touched scripts: 0 problems |
| `ruby -ryaml` both workflows + `grep -r continue-on-error .github/workflows/` | OK / 0 | ✅ YAML valid; the invariant holds — exit 2 is mapped explicitly in the step script, never silently downgraded |

- [devops] Files touched (exactly the dispatch set): `.github/workflows/afir-refresh.yml` (NEW), `scripts/relay-afir.mjs` (NEW), `scripts/verify-relay-afir.mjs` (NEW, the relay-contract harness), `lib/live/refresh-groups.json` (ghRelayed classification), `scripts/verify-refresh-sweep.mjs`, `scripts/verify-sweep-inventory.mjs`, `scripts/verify-source-errors.mjs` (classifier relay documentation), `.github/workflows/pr-validation.yml` (2 battery lines), `README.md` (pipeline lines + blurbs + registry tables + relay tour), this STATUS append. **No app/ or lib/ file touched by me** (app/api/seed/afir/route.ts + lib/live/cache.ts + lib/live/content.ts + scripts/verify-afir-relay.mjs belong to the parallel Builder dispatch, confirmed on the tree).
- [devops] The relay was NEVER run against afir.ro or the deployed worker from this machine (zero external fetches — it runs on the GH runner in production; first real run happens on GitHub after the secret is set).
- [devops] **afir relay workflow: PASSED — all checks successful.**

## Builder Findings (afir relay route)

**Status: DONE — the Worker relay route `/api/seed/afir` is implemented with TDD (RED harness exit 1 → GREEN ×2), reuses the exact AFIR feed parser, the reader's exact article parse chain and the reader's exact cache setter/predicate (behavior-preserving extraction proven by the 114-cell source-errors matrix), verified on the pre-existing dev server with seed-derived fixtures (full protocol round-trip + zero-fetch reader proof + byte-exact state restore), and everything re-proven green at the merged tree incl. the parallel DevOps runner; the DevOps-routed orphaned sweep mapping removed with all gates re-run: tsc 0 errors · lint 0 errors / 113 warnings (exact baseline) · full offline battery 20/20 · e2e 50/50 twice (+ refresh-api 4/4 after the orphan removal).**

### The contract (exact shapes — the DevOps runner `scripts/relay-afir.mjs` already codes against these, verified 1:1 by my read of their script)

**`POST /api/seed/afir`** — `Authorization: Bearer $REFRESH_TOKEN` (env secret only; fail-closed 401 when unset/wrong/missing — identical SHA-256 + timingSafeEqual gate as `/api/refresh`), `Content-Type: application/json`; **every** response carries `Cache-Control: no-store`.

**Phase feed — request:** `{"phase":"feed","body":"<afir.ro homepage HTML, raw bytes as fetched>"}` — `body` string 1..5,000,000 chars (mirrors afirLoader's getSource cap). Side effect: parses via the EXISTING `parseAfir` and publishes the result at the EXACT `feed:agricultura` key (afirLoader's), adapter_version `afir.headlines.v1`, `last_success_at` = relay moment (the „ultima preluare validă" the freshness panels surface).

**Phase feed — 200:** `{"result":"ok"|"partial","phase":"feed","items":<parsed count after canonical dedupe>,"want":[article URLs, ≤10, in feed order],"feedStored":true,"error":"…" (present only when feedStored=false),"servedAt":ISO}`. `want` = feed item URLs whose full-text cache row does not serve under the reader's freshness semantics — no row/no data, `error` set, adapter-version mismatch, or past expiry (composed with the nightly 03:00 Bucharest day-boundary rule). Runner protocol: repeat {feed → fetch want → articles} until `want=[]` (each cycle ≤10).

**Phase articles — request:** `{"phase":"articles","items":[{"url":"https://www.afir.ro/comunicate/…","html":"<raw article page>"}, … 1..10 items]}` — boundary validation (400): items 1..10; each item `{url,html}` both strings; url ≤2000 chars, https, host `afir.ro`/`www.afir.ro`, passes the canonical `articleUrl` rules; html 1..8,000,000 chars (mirrors articleLoader's getSource cap). Side effect per item: parses via the reader's EXACT chain and publishes at the EXACT `article:sha256(canonical url)` keys, adapter_version `official.article-body.v3`, loader-ttl expiry (`expires_at = now+3600s`), relay timestamp as `last_success_at`.

**Phase articles — 200:** `{"result":"ok"|"partial","phase":"articles","stored":[input urls echoed],"failed":[{"url","error"}],"servedAt":ISO}` — unparseable pages are per-item honest failures in `failed`, never a 400; duplicate canonical URLs collapse to one write.

**Other:** 401 `{"error":"Acces interzis."}` · 503 `{"error":"Starea persistentă a surselor este temporar indisponibilă."}` when D1 is unbound or unreadable (runner retries later; no wasted source fetches) · 400 `{"error":"…"}` Romanian for malformed JSON / unknown phase (`Faze valide: feed, articles.`) / shape+bound violations, echoing the item index. Logging: `console.warn` JSON events only (no tokens, no payloads).

### How the "exact parsers + cache setters" reuse is guaranteed (extracted, not duplicated)

- `lib/live/cache.ts` — the success path of `readSource`'s refresh is extracted verbatim into the exported **`publishLoaded(db,loader,prior,loaded)`** (same `storePayload` chunking, same validated-copy invariants, same UPDATE, same `retireCopies` retention, same view tail); `readSource` now delegates to it, so loader-loaded and relayed data go through ONE setter. The exported **`cachedCopyServes(row,version)`** predicate (data present + no error + version match + unexpired, under the nightly day-boundary rule) is now also what `view()` computes status from — the want decision and the served status share one predicate. `Row`/`CachedCopyRow` exported for typed consumers.
- `lib/live/content.ts` — the article loader's parse chain (parseArticle + h1 title + articleAttachments) is extracted into the exported **`parseArticlePage(html,url)`**; `articleLoader.load` uses it — the relay parses through the exact reader chain, no copy to drift.
- The relay does NOT call `readSource` for writes on purpose: readSource short-circuits on backoff (`next_attempt_at>now`) and locks (`lock_until>now`) — exactly the states the deployed-worker articles sit in after every failed AFIR fetch — so the relay publishes directly through the shared setter, bypassing only the egress-bound fetch, never the cache semantics.
- Seed-restore interplay verified: relay timestamps are always newer than the seed snapshot's `fetchedAt` (2026-10-04), so `readSource`'s seed-overwrite rule never reverts a relayed row.

### TDD evidence

- **RED**: `node scripts/verify-afir-relay.mjs` before the route existed → exit 1 (`RED: app/api/seed/afir/route.ts nu există încă — implementează ruta de relay ca să devină verde acest ham.`).
- **GREEN ×2** (stable on re-run), 8 legs: (1) Bearer fail-closed incl. unset env token + zero writes on 401; (2) boundary validation (unknown phase, malformed JSON, all shape/bound violations, non-AFIR + non-https hosts refused, exact `Structura comunicatelor AFIR s-a schimbat.` passthrough); (3) want matrix (fresh row excluded; expired/error/version-mismatch/missing wanted, feed order) + the feed row landing at `feed:agricultura` with parser-identical data (deep-equal vs a direct `parseAfir` of the same fixture), published_at = feed's newest comunicat, relay-window expiry/last_success, zero failures; (4) articles write `parseArticlePage`'s exact output at `articleLoader(url).key` (deep-equal vs a direct parse of the same fixture) + re-relay idempotence; (5) per-item honest failure (invalid page → `failed` with the exact parser message, the valid sibling still stored); (6) full-cycle closure (want shrinks to `[]` as articles land — the repeat-until-empty runner contract); (7) the zero-egress proof — with `globalThis.fetch` replaced by a thrower, `readSource` on both a seeded article and `afirLoader` serves the relayed copies with **0 source fetches** (the deployed-worker class); (8) cap = 10 wanted, feed order, on a 12-item feed.
- Fixtures are built FROM the seed snapshot (`lib/live/server-seed.json` `feed:agricultura` — the 8 real comunicate), and the harness proves the round-trip: `parseAfir(reconstructed homepage)` deep-equals the seed items exactly.

### Dev-server smoke (the dispatch minimum; :5173 pre-existing, NOT started by me, NOT killed — reuse-only)

`probe-afir-relay-smoke.mjs` (session dir, exit 0): 401 no/wrong token + 400 malformed JSON over HTTP → phase feed with the seed-derived fixture → `want` == exactly the 8 seed URLs in order (none cached locally, verified by pre-smoke snapshot) → phase articles (8/8 stored, 0 failed) → re-feed → `want == []` → reader proofs: `GET /api/content?url=<seed url>` serves the relayed article (`status:"cached"`, full text + h1 title + attachment, `lastSuccessAt` = relay moment) and `GET /api/domain?kind=agricultura` serves the 8 relayed comunicate — then the honest partial (invalid page → `failed` with `Publicația nu a furnizat o pagină validă.`, its sibling still stored). **State restored byte-exact after** (`probe-afir-relay-restore.mjs`): the feed row back to its 2,834-byte live-captured snapshot, the 8 test article rows deleted, `source_budget` untouched — pre/post verified via the wrangler CLI on the same `.wrangler/state` D1 the dev server binds.

### The DevOps-routed orphan, actioned

Their note routed me `lib/live/refresh-sweep.ts:39` (`'feed.agricultura':()=>afirLoader` — unreachable after the ghRelayed registry move). Removed the orphaned mapping + the now-unused `afirLoader` import (dead config my relay made unreachable; nothing pins it — their updated verify-refresh-sweep already moved the member pin out). Gates re-run after: verify-refresh-sweep ✓, verify-sweep-inventory ✓, tsc 0, lint 0/113, e2e refresh-api 4/4.

### Verification (all run this dispatch; final tree = my route/harness/lib changes + the parallel DevOps runner/workflow/registry)

| Check | Exit | Result |
|---|---|---|
| `node scripts/verify-afir-relay.mjs` (RED → GREEN ×2 + final re-run) | 1 → 0, 0, 0 | ✅ 8 legs; fixtures round-trip the seed items exactly |
| Dev-server smoke + byte-exact restore | 0 / 0 | ✅ full protocol round-trip; feed row byte-restored (2,834 B), 8 test rows deleted, budget untouched |
| `corepack pnpm exec tsc --noEmit` (incl. merged tree with the DevOps runner + post-orphan state) | 0 | ✅ 0 errors |
| `corepack pnpm lint` | 0 | ✅ 0 errors / 113 warnings — exact baseline; targeted eslint on my files: 0 findings |
| Full offline battery (workflow order) | 0 ×20 | ✅ live · cache · export-formats · legal-refresh · catalog · snapshot-transport · refresh-sweep (5 groups / 20 members / ghRelayed single-writer) · ro-text · source-errors (**19 families / 114 cells** — the behavior-preservation proof of the cache.ts extraction) · sweep-inventory · model-contracts · federated-search · legal-records · expanded · audit-controls · css-keyframes · downloads · **afir-relay (mine)** · location · search-ui · geographic-scope |
| `node scripts/verify-relay-afir.mjs` (DevOps's runner gate, at merged tree) | 0 | ✅ 13 legs — their script consumes my contract 1:1 (want / stored / failed / result, 400/401/503 classes) |
| `corepack pnpm test:e2e` ×2 (pre- and post-merged-tree) | 0, 0 | ✅ **50 passed both runs** — count held exactly, zero regressions (+ refresh-api 4/4 targeted after the orphan removal) |

### Files touched (mine, this dispatch)

`app/api/seed/afir/route.ts` (NEW — the relay route), `scripts/verify-afir-relay.mjs` (NEW — the route's own harness, the repo's transpile-import pattern per conventions.md), `lib/live/cache.ts` (behavior-preserving extraction: publishLoaded/cachedCopyServes/Row exports; readSource + view delegate), `lib/live/content.ts` (parseArticlePage extraction; articleLoader reuses it), `lib/live/refresh-sweep.ts` (the DevOps-routed orphaned memberLoaders mapping + unused afirLoader import removed). Session dir: `probe-afir-relay-snapshot.mjs` / `probe-afir-relay-smoke.mjs` / `probe-afir-relay-restore.mjs` + `probes/relay-smoke-snapshot.json` / `probes/relay-smoke.json`. **NOT touched by me** (parallel DevOps dispatch, observed + attributed): `.github/workflows/afir-refresh.yml`, `scripts/relay-afir.mjs`, `scripts/verify-relay-afir.mjs`, `.github/workflows/pr-validation.yml`, `README.md`, `lib/live/refresh-groups.json`, their edits to `verify-refresh-sweep`/`verify-source-errors`/`verify-sweep-inventory`. No git commits/branch ops (branch discipline); zero external fetches from this machine (smoke = local dev routes only).

### Self-review (four lenses)

- **Completeness:** both phases implement the dispatched protocol exactly (state/knowledge stays in the Worker — the runner is a byte relay; `want` uses the reader's freshness semantics; articles land in the same cache entries the reader/feed serve; last_success semantics unchanged for the freshness panels). No scaffolding, no TODOs. The DevOps counterpart's reconciliation note confirms the runner round-trips the contract; the mid-flight file-name collision they describe was resolved on their side (verify-relay-afir vs my verify-afir-relay) with both gates green.
- **Quality:** setter/predicate reuse is by extraction (one source of truth, no duplicated SQL shapes); validation at the boundary with indexed Romanian errors; dense house style; one-line English business-rule comments only; D1 parameterized everywhere; `console.warn` event-JSON without tokens or payloads.
- **Discipline:** no CI/README/battery wiring (counterpart's serial ownership per the dispatch — they did it, verified green); the pre-existing dev server was reused, never restarted or killed; no commits.
- **Testing:** every behavior has a failing-first or byte-exact proof (harness legs, live smoke, restore, the 114-cell matrix re-run covering the refactor, e2e count held), run this dispatch at the final merged tree.

### Known limits (honest, routed)

1. **Real AFIR article-page parseability is unverified from this environment** (zero afir.ro fetches allowed — the GH runner does the fetching in production). `parseArticlePage` covers the 9 content-class selectors + ld+json `articleBody`; if afir.ro comunicate pages match none, the relay reports each item honestly in `failed` (the feed still serves titles + external links — the shipped honest-degrade UX) and the first real `afir-refresh` tour will surface it in the Action log.
2. **Runner origin-guard note for DevOps**: keep `AFLIVRA_AFIR_SOURCE_URL` at the `https://www.afir.ro/` default — `parseAfir` emits `www.afir.ro` item URLs, and a non-www base would mismatch their (correct) same-origin refusal rule.
3. **TTL semantics are the loaders' own** (3600s) — between the 2-hour workflow tours the feed/articles serve as stale-with-valid-copy + the honest envelope until the next tour refreshes them; that is the existing honest-degrade design (their `ghRelayed` registry note documents „the relay is the single writer of its freshness"), not a gap.

**Final line: DONE — relay route + shared setter/predicate/parse-chain extraction + own harness + live smoke with byte-exact restore; contract verified 1:1 against the parallel DevOps runner; 20/20 battery, tsc 0, lint baseline, e2e 50/50 twice.**
