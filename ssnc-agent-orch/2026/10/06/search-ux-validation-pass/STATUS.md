# Implementation Status

## Session
search-ux-validation-v1 — branch fix/search-ux-validation-v1, subagents mode

## Current Phase
Phase 1.5: Advocate review — REVIEW WRITTEN, awaiting user responses on Decision 1 (Monitorul chip target) and Decision 2 (footer label) before Architect

## Session Log
- [orchestrator] Requirements consolidated from /analyse synthesis (5 areas) + user directives (source 5xx parity, perfect UI/UX, start implementation)
- [orchestrator] PLAN.md written: 4 waves, disjoint file ownership; specialists: DevOps, API (advisory), UI/UX, Content (folded)
- [advocate] ADVOCATE-REVIEW.md written (Phase 1.5). Evidence read: page.tsx routing/chips/gating, v2-model domains, legal-workspace vs live-company targets,
  dashboard-topics justitie default tab, catalog-workspace, source-packages.tsx + public/downloads (5 PDFs only; index.html+manifest+ zips all 404),
  README:59/325 claims, cache.ts budgets+locks, adapters.ts TTLs (company=4 HTTP, courts=2 SOAP), api/domain stiri feed fan-out, pagination.tsx, all
  missing-value phrase sites, pr-validation.yml (verify job has NO server), e2e specs (15 tests; count/pattern regexes mapped), verify-live.mjs mock-fetch precedent.
  Verdicts: D1 Monitorul chip → CHANGE to domain/justitie (gazette semantics; RA-relabel alternative) [ASKED]; D2 downloads removal ADOPT + footer detail [ASKED];
  D3 verify-source-errors.mjs → CHANGE to mock-first CI gate + --live opt-in manual (never live-in-CI; ~25-30 upstream reqs cold, feeds fan-out trap) [default applied];
  D4 polish pass bounded to registered defects + own-pass re-audit findings [default applied, user may expand]; D5 missing-value → word unification with
  per-noun gender declension, not one frozen string (date.ts feminine is correct for "dată") [default applied]; D6 plural helper must add the 20+ "de" rule +
  Task 1.2 owns updating transit-view.spec.ts:40 / places-workspace.spec.ts:44 / catalog-flow+compare-planner count regexes [default applied].
  Risk flags R1-R5 recorded (empty-state/company-card coherence at page.tsx:116, domain-workspace.tsx:25 sibling gating, README rewrite, verify-downloads.mjs untouched).
  No CRITICAL findings — nothing blocked. Enforcement: ADVOCATE_ENFORCE=true default, coordination mode none.

## Builder Findings

### T1.2 — Romanian plural correctness — starting note (pre-implementation)
- TDD order: scripts/verify-ro-text.mjs FIRST (transpile-import harness cloned from verify-cache.mjs pattern), then the helper, then the 21 call-sites, then pinned assertions.
- **Design decision — helper placement**: `countText`/`countNoun` go into **lib/live/query.ts** (the shared display-helpers module: paginate/compareNames/ro- Collator precedent), NOT a new `lib/ro-plural.ts` file. Evidence from reading the harnesses first (as instructed): the suggested new module breaks two closed stub resolvers —
  - verify-location.mjs:38-41 compiles `app/api/domain/route.ts` with an explicit per-import rewrite list (`from '@/lib/live/query'` → './query', etc.); any NEW spec like '@/lib/ro-plural' survives transpile un-rewritten and Node fails the import → battery breaks.
  - verify-search-ui.mjs:16 stubs metadata-fields' imports by suffix (`name.endsWith('/text')`, `name.includes('/query')`...); a new spec falls through to `require('@/lib/ro-plural')` → MODULE_NOT_FOUND.
  Extending the existing `@/lib/live/query` import lines in those two files is handled by both resolvers with zero harness edits, matches where every result surface already imports its display helpers, and requires no new-file wiring. Generic resolvers (verify-courts-workspace '@/lib/' prefix; verify-geographic-scope prepare()) would have accepted either placement — checked before deciding.
- **Known deviation I will make (flagging up front)**: `scripts/verify-courts-workspace.mjs:46` pins the old ungrammatical string `/22\s+ședințe/`; the grammar fix renders "22 de ședințe" and the assertion has to follow (same class of edit as the e2e regexes Task 1.2 owns per ADVOCATE D6b). The file is not owned by any other task this pass (checked the wave file lists). One surgical regex edit, reported here; orchestrator to veto if they disagree.
- Harness impact map (read, not guessed): my app-file edits are compiled where resolvers are generic (verify-courts-workspace → courts files; verify-geographic-scope → api/domain) or nowhere (pagination/places/record/lawyers/transit/experience are stubbed or never compiled); lib/live/query.ts additions ride along in verify-live/verify-cache/verify-search-ui/verify-location/verify-law-navigation/verify-geographic-scope with no export assertions on query.
- e2e blast radius verified by grep: only e2e/transit-view.spec.ts:40 and e2e/catalog-flow.spec.ts:44 assert strings my sites render (both get `(?:de )?` + `rezultate?` tolerance); compare-planner's "seturi" assertions read catalog-workspace.tsx strings I do NOT touch → no edit; legal-flow asserts no counts; places-workspace.spec.ts:44 `/rezultate/` survives at any n≥2 (substring) — flips only at total=1, noted for cross-agent awareness below.

### T1.2 milestone — helper RED → GREEN
- RED: `node scripts/verify-ro-text.mjs` → `TypeError: countText is not a function`, exit 1 (script written first; helper absent).
- Implementation draft 1 used the literal `n%100===1` pseudocode from the dispatch; the RED matrix caught it: 21 read "21 de rezultate" (AssertionError, exit 1). The dispatch's own test vector ("1/21/101 singular") is authoritative: the correct Academy rule is the **unit-digit** rule — counts ending in digit 1 (except 11) take the singular. Fixed to `unit===1&&lastTwo!==11 → singular`.
- GREEN: `node scripts/verify-ro-text.mjs` → "Romanian count agreement verified: …", exit 0. Matrix asserted: [1,2,0,11,19,20,21,34,100,101,111,119,120,1000,2001,8655,178868] + adjective/verb phrase pairs + countNoun (strong-split markup) variants.

### T1.2 completion — call-sites, assertions, gates

**Rule implemented** (lib/live/query.ts, one business-rule comment line): counts ending in digit 1 except 11 → singular without "de" (1, 21, 101, 201); 0 and 2-19 → plain plural; every other count (20-99, exact multiples of 100 within larger numbers, exact hundreds/thousands) → "de" + plural. Numbers formatted ro-RO ("1.000", "8.655", "178.868") — identical to the existing `format`/toLocaleString rendering the sites used.

**Files modified (T1.2):**
- lib/live/query.ts — added countText/countNoun (see placement decision above)
- scripts/verify-ro-text.mjs — NEW, transpile-import harness (verify-cache.mjs pattern), full rule matrix
- app/pagination.tsx — total phrase "· N rezultat(e) / de rezultate"
- app/courts-workspace.tsx — CourtCase "N ședință publicată/ședințe publicate"; summary 4 nouns (dosar/fișă/ședință/fișă primită variants); missing-value word 'Neprecizat'→'Nefurnizat de sursă' (generic mixed-noun slot, masculine per ADVOCATE D5)
- app/court-history-panel.tsx — "fișă disponibilă · ședință publicată" string-concat pair
- app/places-workspace.tsx — header: strong-wrapped number + countNoun('rezultat') (keeps `<strong>` on the number only); "loc în categoria națională"; manifest "loc reunit din extractul național"
- app/record-workspace.tsx — "înregistrare găsită" (L19) + "rezultat" (L20)
- app/lawyers-workspace.tsx — "înregistrare în căutarea sursei"
- app/transit-workspace.tsx — RouteReader "oprire" (variant option) + "cursă a variantei circulă"; network "rezultat · copia integrală: linie/stație/cursă" (4 phrases); route card "stație"/"cursă în export"; exports note "cele N de opriri planificate"
- app/experience.tsx — DatasetReader "resursă publicată"; PagedTableExplorer "rezultat" + "înregistrare în întregul set" + "cele N rând"; TableExplorer "rând în vizualizare"/"rând indicat de sursă" + "primele N rând" (dropped now-unused `format` import — lint 0-errors gate)
- app/metadata-fields.tsx — "N din X câmp/câmpuri" (total through helper; filter position stays plain)
- app/api/domain/route.ts — feeds error "1 sursă are copii vechi sau este temporar indisponibilă…" vs plural "N de surse au…" via countText (server-side import works — verified through verify-location's compiled-route harness)
- lib/live/date.ts — 'Neprecizată de sursă' → 'Nefurnizată de sursă' (word unified, feminine kept for "dată" per ADVOCATE D5)
- e2e/transit-view.spec.ts:40 — count regex now `(?:de )?` + singular-tolerant for all four nouns (`(?:linie|linii)` etc.) — first draft only made "de" optional; the run caught the real render "201 rezultat · … 201 linie" (201 routes → singular per rule) and the regex was fixed to match
- e2e/catalog-flow.spec.ts:44 — pagination count regex `(?:de )?rezultate?`
- scripts/verify-courts-workspace.mjs:46 — **documented deviation** (see starting note): `/22\s+ședințe/` → `/22 de ședințe/` — pins the grammar fix; same class of edit as the e2e regexes; file unowned by other tasks this pass

**Verification (commands run this session, all after final edits):**
- `node scripts/verify-ro-text.mjs` → exit 0 (rule matrix, 17 boundary numbers + phrase pairs + noun-only variants)
- `corepack pnpm exec tsc --noEmit` → clean
- `corepack pnpm lint` → 0 errors, 114 pre-existing warnings (count unchanged from before my edits; my new script adds none)
- CI verify battery, all exit 0: verify-live, verify-cache, verify-export-formats, verify-legal-refresh, verify-catalog, verify-snapshot-transport, verify-refresh-sweep
- Local harnesses that compile my files, all exit 0: verify-courts-workspace (incl. updated '22 de ședințe' assertion), verify-search-ui (metadata-fields), verify-geographic-scope (api/domain route), verify-location (api/domain route), verify-law-navigation
- `corepack pnpm test:e2e` → **19/19 passed** (full suite, local dev server; includes the concurrent agents' home-smoke chip-routing tests and explore-place — no cross-agent string failures, nothing to coordinate)

**Pre-existing failure found, NOT mine (proven):** `scripts/verify-lawyers.mjs` exits 1 — it compiles app/api/lawyers/route.ts rewriting only two imports; the route's `import … from '@/lib/geographic-scope'` (first line, HEAD content, `git diff HEAD` empty for both files) survives un-rewritten and Node fails ERR_MODULE_NOT_FOUND. Reproduced identical on a pristine detached-HEAD worktree of 2039d9f → pre-existing runbook drift (the class pr-validation.yml already marks continue-on-error for five drifted scripts; verify-lawyers is not in the CI battery). Left untouched — routing to DevOps (T1.3/T3.1) with this evidence.

**Same-family plural sites OUTSIDE my dispatch's file list (hand-offs, unfixed by design):**
- app/catalog-workspace.tsx — `{format(result.count)} seturi · {rows.length} pe această pagină` and `{format(inventory?.items.length||0)} seturi.` — Builder-A owns this file in Wave 1; both catalog-flow/compare-planner "seturi" assertions currently PASS against the unchanged string.
- app/weather-workspace.tsx:18 — `Toate cele {keys.length} variabile disponibile…` (missing "de" at N≥20).
- app/cinema-workspace.tsx:27 — `{d.filmCount} filme · {d.eventCount} proiecții · …`.
- app/page.tsx:111,134 — already sequenced to Wave 2 by PLAN.
- Statuses noted for cross-agent awareness: places-workspace.spec.ts:44 `/rezultate/` passes at any total ≥ 2 (verified live in the suite run); it would only flip at total=1 with the current seeded inventory.

**T1.3 hand-off:** add `node scripts/verify-ro-text.mjs` to the pr-validation verify job and the README runbook battery list.

**Four-lens self-review:**
- Completeness: all ~13 dispatched sites + 8 more found by scouting the same files (transit network summary/card/exports, experience DatasetReader/TableExplorer/chart notes, places manifest count, record-workspace L19) are wired; missing-value words unified at the two flagged spots with gender kept; no TODOs/scaffolding left.
- Quality: helper is 2 lines + 1 business-rule comment in the established display-helpers module; every call-site keeps its surrounding copy and number formatting (ro-RO identical output for the plain-plural cases — zero visual churn at n=2..19); adjectives/verbs carried inside the phrase pairs per call-site.
- Discipline: TDD followed (RED caught a genuine rule bug — the dispatch's own `n%100===1` pseudocode contradicted its test vector for 21); scope kept to my file list except the one flagged-and-justified deviation; other agents' files untouched.
- Testing: matrix unit test (17 boundaries incl. 111/119/120/2001 to lock modulo-100 behavior), compiles clean under tsc, 5 harness scripts exercising the compiled call-sites, full e2e green — the assertions test rendered text, not mocks.

**Status: DONE_WITH_CONCERNS** — all gates green (verify-ro-text exit 0, tsc clean, lint 0 errors, verify battery green, e2e 19/19); concerns for orchestrator review: (1) the verify-courts-workspace.mjs:46 regex edit outside the enumerated file list (necessary — the old assertion pinned the ungrammatical string; grammar fix + assertion updated together), (2) helper placed in lib/live/query.ts rather than a new lib/ro-plural.ts (harness-proven: a new module breaks the closed stub resolvers in verify-location.mjs and verify-search-ui.mjs; both constrained call-sites already import query), (3) the four hand-off sites above need owners (catalog-workspace sits with Builder-A's file; weather/cinema unowned — recommend folding into Wave 2).

## Builder Findings (T1.1 — semantic search routing)

### Started
- [builder-A] T1.1 begun on fix/search-ux-validation-v1 (tree clean @ 2039d9f, only session dir untracked). PLAN Req 1 + Final decisions + ADVOCATE D1/R1-R3 re-read. Key evidence re-verified: page.tsx:73 `go()`, :77 numeric→company shortcut, :97 one generic `go('explore',undefined,s)` chip handler, :82 search string lacks `p.region`, :104 city-story precedent (selectCity+setPrefs+go domain/local, cityPositions brasov entry), :114 CompanyCard gate, :116 Monitorul empty-state suppression; catalog-workspace.tsx:13 initialQuery seeding. Landed-view headings pinned for tolerant assertions: place `.place-hero h1` 'Castelul Peleș' (static model), company h1 'Verifică o firmă după CUI.' + CUI input value 427282 (local state, no live-data dependency), domain local h1 'Orașul tău' (static v2-model), location-strip label 'Brașov' (selectCity semantics). Baseline e2e = 15 tests; grep-verified none touch hero chips, the explore empty state or `explore&q` → no blast radius from chip relabel. TDD order: RED = 4 new e2e tests (3 chip-routing in home-smoke, region-match + genuine-empty in explore-place) failing against current routing → GREEN = page.tsx chip handlers + p.region + suppression removal.


## Builder Findings (T1.4 — downloads honesty)

### T1.4 starting (Builder-C)
- Reality re-verified before editing: `public/downloads/` contains exactly the 5 committed PDF guides (`Aflivra_v30/v32/v33/v34/v35_Documentatie.pdf`, ~135 KB total, revije 30–35, fără v31); `Aflivra_*.zip` is gitignored, `source-packages.json`/`index.html` are not committed and do not exist — the old component fetched/linked only 404s.
- Mount contract read: `app/page.tsx:136` renders `<SourcePackages/>` (named export, no props) inside the About view → component is rebuilt in place with the same export signature; **zero page.tsx changes needed** (page.tsx is not mine this wave).
- Blast radius checked: no e2e spec references the old section (only `compare-planner.spec.ts:57` "Descarcă planul", unrelated); `ExportActions`/`snapshotJson` are used by many other components, so dropping their imports here is safe; CSS classes `.source-downloads`/`.source-download` (workspaces.css:69) + responsive rules (complete-data.css:193-195) are reused as-is — zero CSS edits.
- Guide content sourced from the committed PDFs themselves (pdftotext: "Aflivra · Ghidul versiunii NN") and the README revision headings for the per-guide one-line summaries.

### T1.4 complete (Builder-C) — STATUS: DONE

**TDD cycle note (per orchestrator's verification contract — static surface):** this component is static markup with no runtime behavior to drive with a test; the RED state was the three stale references in app/ (`source-packages.json` fetch, `index.html` link, `Descarcă ZIP` links — all 404 by construction), GREEN is their elimination with every guide href resolving to a committed file (set-equality verified), REFACTOR was not needed (single-pass minimal shape, existing CSS classes reused). The runtime drift guard (a listed guide 404ing after future regeneration) is deliberately delegated to DevOps as the manifest assert below — it is the checkable form of this surface's honesty.

**Files modified (owned scope only):**
- `app/source-packages.tsx` — rebuilt: the broken fetch+ZIP inventory (`/downloads/source-packages.json?v=35` 404, `index.html` 404, `Descarcă ZIP` 404s) is now a static list, "Ghidurile platformei": kicker `DOCUMENTAȚIA PLATFORMEI`, h2 `Ghidurile platformei`, one-line description, 5 guide cards (latest first: v35, v34, v33, v32, v30) each with a per-revision summary and a `Descarcă PDF` link to the real `/downloads/Aflivra_v*_Documentatie.pdf`. **Same named export `SourcePackages`, no props → zero page.tsx changes** (mount `app/page.tsx:136` `<SourcePackages/>` untouched). No fetch, no state, no error branch — degrade-never-fail by construction. Reuses existing `.source-downloads`/`.source-download`/`.panel-top` CSS + `BookOpen` (icon already in the app's set); no CSS edits.
- `README.md` — 10 false/stale downloads claims rewritten in the README's voice: v35/v34/v33 revision tails now point at the exact `/downloads/*.pdf` path + "codul reviziei în acest depozit"; v32 tail replaced the chatgpt.site "pagina permanentă de descărcări" link with `/downloads/` + repo + local-regeneration pointer; v31 `/downloads/index.html` paragraph now states the guides+repo+clone truth; v31 lawyers "arhive descărcabile" → local regeneration; v30 hosting-package claim de-zipped; the dev-runbook note ("Dezvoltare și verificări") now holds the full zip-volumes inventory description as local-only tooling (script output paths, gitignore coverage, `archives/`, repo-as-source-of-truth); "Disponibilitate și reutilizare" zips paragraph → published guides (v30–v35) + repo + local tooling; the export/inventory claim in "Descărcări PDF, CSV și Excel" updated to the new About section ("Ghidurile platformei", documentation not a source substitute).

**Verification (all local/static, run this turn):**
- `ls public/downloads/` → exactly the 5 committed PDFs (v30/v32/v33/v34/v35).
- GUIDES entries vs disk: `diff` of sorted sets → empty (5 = 5 set equality; href construction `'/downloads/'+g.file` confirmed).
- `corepack pnpm exec tsc --noEmit` → exit 0.
- `corepack pnpm lint` → 0 errors (114 warnings, all pre-existing in `scripts/`, zero mentions of my file).
- `grep 'source-packages\.json' app/` → **0 references remain** anywhere in app/; `/downloads/index.html` and `Descarcă ZIP` refs in app/ → 0.
- README: `chatgpt.site` + `pagina permanentă` → 0 matches; markdown structure valid (inline code spans balanced; only odd-backtick lines are the 7 correctly-paired ```sh fences); brackets balanced.
- About-view neighbor links (report-only): `public/media/manifest.json`, `media/category-manifest.json`, `catalog/audit.json` all exist — no adjacent 404 left behind.
- `git diff --stat` shows my edits confined to the two owned files (e2e spec changes in the stat are parallel Builder-A wave-1 work, untouched by me).

**Four-lens self-review:**
1. *Completeness* — all four task items done: component rebuilt drop-in (same mount contract, verified), DevOps assert specified below, README downloads+inventory claims rewritten, all four verification gates executed with output. No scaffolding, no TODOs.
2. *Quality* — static data is drift-free (no hardcoded byte sizes or render dates that a guide regeneration would falsify; per-guide summaries are the frozen revision facts from the README headings); markup mirrors the sibling `SourcesRegistry` panel-top pattern; Romanian user-facing strings throughout.
3. *Discipline* — stayed inside the three owned paths (component, README, STATUS append). One incidental out-of-scope word slip during the v31 lawyers edit ("Adaptorul"→"Arhitectura") was caught in self-review and reverted immediately — final diff confirmed clean. No page.tsx, scripts/, CSS, or .gitignore edits.
4. *Testing* — the specifiable behavior (every link resolves to a committed file) is verified structurally by set equality; runtime-failure impossibility is by construction (no fetch); e2e blast radius checked (no spec referenced the old section). The remaining runtime risk is drift across future regenerations — covered for DevOps below.

**DevOps recommendation (manifest assert — the structural guard for this surface):**
Every guide PDF named in the component must exist in `public/downloads/`, and every committed guide PDF must appear in the component (bidirectional — catches both a dead link and an unlisted guide). ~10 lines in `scripts/verify-downloads.mjs` (or a standalone verify script, placement at your discretion per Advocate decision 2): read `app/source-packages.tsx`, regex the `file:'…'` entries of `GUIDES`, `readdir` `public/downloads/*.pdf`, assert set equality with a diff message on mismatch. This is the checkable form of "the About section lists the real downloads"; it would have failed on the old component zero times only because the old one fetched a manifest that itself 404'd.

**Notes for orchestrator / wave-2 (no action this wave — files not mine):**
- Component keeps the name `SourcePackages` purely for the zero-page.tsx-changes contract; a semantic rename (e.g. `PlatformGuides`) is a page.tsx-owned follow-up for a later wave.
- Footer relabel "Ghidurile platformei" (Builder-A, page.tsx) lands on the About view; my guides section is its landing content, rendered after SourceOverview + SourcesRegistry. If a closer landing (anchor order) is wanted, that reordering belongs to a page.tsx owner.
- `scripts/render-guide.py:41,106` still embeds retired chatgpt.site links ("Deschide Aflivra" / "Deschide pagina de cod și documentație" → …chatgpt.site/downloads/). Local-only tooling, but the next guide regeneration would bake a dead link into the PDF — flag for the next pass that owns scripts/.
- `.gitignore` excludes `public/downloads/Aflivra_*.zip` and `archives/` but NOT `public/downloads/source-packages.json` + `index.html` — a local `package-source.py` run leaves them as untracked noise (README wording is exact about this; a gitignore line is a cheap future fix for whoever owns .gitignore).
- Guide PDFs carry their render dates in footters; I deliberately did not surface dates in the cards (drift-free minimal list).

## DevOps Findings

### T1.3 started — verify-source-errors.mjs (source-5xx parity gate)
- [devops] STARTED per PLAN Req 4 + Final decision 3 (mock-first CI gate + `--live` opt-in one-pass-per-family parity, exit 1 only when source OK but app errors; `--live` runs once at T3.1, never in CI).
- [devops] Contract mapping read: readSource (cache.ts:29 — never throws, internal catch at cache.ts:57-62; statuses fresh/cached/stale/unavailable; SourceError messages carry the source HTTP code — adapters.ts:9 'Sursa a răspuns cu HTTP N.' / 429 pause / timeout), adapters.ts family URL table (anaf, ckan, bnr), legal.ts courtLoader/loadCourtSearch (portalquery.just.ro SOAP; diagnostic/retryAfter break rule at legal.ts:118), feeds.ts feedConfigs (stiri = mai.gov.ro; /api/domain?kind=stiri fans out to all 7 feeds), weather.ts forecastLoader (open-meteo via withForecastSlot + forecast:44.43:26.1), transport.ts transportLoader (gtfs.tpbi.ro zip via fetchWithServerRetry direct), knowledge.ts companyLoader composite (webservicesp.anaf.ro ×4 + wikidata background).
- [devops] Route contracts read: /api/weather (forecast via waitForRefresh), /api/company (composite combineCompany), /api/legal POST court (readSource + courtReferences + buildCourtHistories; needs explicit Content-Length on the mocked Request), /api/domain?kind=stiri (merged 7-feed state with per-source statuses), /api/catalog (default national path = readSource(catalogLoader())), /api/transport (readSource(transportLoader) + local filtering). Harness precedent adopted from verify-cache.mjs + verify-refresh-sweep.mjs (ts.transpileModule, in-memory node:sqlite D1 on drizzle/0000 schema, mocked globalThis.fetch, exit non-zero on failure).

### T1.1 complete (Builder-A) — semantic search routing
Status: **DONE_WITH_CONCERNS** — all doors green; one deliberate Advocate-R1 divergence flagged below for orchestrator review (one-line change available if the R1 shape is preferred).

TDD evidence (RED → GREEN → REFACTOR):
- Feature 1 chip routing (RED) — wrote 3 tests in e2e/home-smoke.spec.ts (Hero suggestion chips route semantically: Peleș → `#view=place&id=peles`; Monitorul Oficial RA → `#view=company&id=427282` + CUI field seeded `427282` + landed catalog NOT seeded; Brașov → `#view=domain&id=local` + location-strip shows Brașov). Run vs unmodified code: **4 failed / 2 passed** — every failure the current generic routing (`data-view` stuck on `explore`, chip label `Monitorul Oficial` not found): the right reason.
- Feature 1 (GREEN) — app/page.tsx:97 one generic `go('explore',undefined,s)` handler replaced by three per-chip buttons: `go('place','peles')`; Brașov = exact :104 city-story pattern (`geo.selectCity(cityPositions brasov entry)` + `setPrefs` + `go('domain','local')`); third chip relabeled **"Monitorul Oficial RA"** → `go('company','427282')`. Same wrapper/`.hero-suggestions` markup, buttons stay buttons+ArrowUpRight — visual design identical. Rerun: **6/6 passed**.
- Feature 2 region match (RED) — e2e/explore-place.spec.ts new test: typed `Brașov` in hero search → `.exploration-gallery` must contain a `Castelul Bran` card. Failed pre-change (Bran's `region:"Brașov"` not in the :82 search string — only Piața Sfatului surfaced via city).
- Feature 2 (GREEN) — app/page.tsx:82 search string now `p.name+' '+p.city+' '+p.region+' '+p.kind+' '+features`: typed `Brașov` surfaces Bran (+ any region match), existing `norm()` style, zero new deps. Same test green; the second leg of the same test additionally pins the genuine no-result path (`zzqxv` → h2 "Niciun rezultat în selecția editorială" visible).
- Feature 3 empty-state suppression (handled with Feature 2's test) — app/page.tsx:116 `&&!(norm('Monitorul Oficial 427282 firma').includes(norm(q)))` clause removed entirely per task instruction; :114 CompanyCard search-results gate left as-is; pulse-row/company entries (:98, :128, saved-view card) untouched — git diff confirms page.tsx changes are exactly lines 82/97/116.
- REFACTOR — none needed: three explicit buttons is the minimal typed shape (a tuple array forces a cast); fixed a 2-space indentation drift my edit introduced on :116 to match sibling lines.

Item 4 catalog initialQuery — **no code change needed, verified at the source**: `initialQuery` reaches LiveCatalog only from page.tsx:116 (`initialQuery={q}`, explore view); `q` is set only by typed searches (hero/search forms) or the router `?q=` param, and chips now navigate elsewhere with no `q` (hash carries only view/id). Pinned in e2e: the Monitorul chip's landed company view has `Caută în catalogul național` input empty; typed free-text still legitimately seeds the explore catalog (Brașov region test exercises it). Matches Advocate R3.

Verification doors (run this session):
- `corepack pnpm exec tsc --noEmit` → exit 0, clean (whole tree incl. parallel colleagues' edits).
- `corepack pnpm exec eslint app/page.tsx e2e/home-smoke.spec.ts e2e/explore-place.spec.ts` → 0 errors / 19 warnings, all pre-existing rule families (no-img-element on the pre-existing hero-photo img sharing line 97, react-hooks render-component house pattern; none from my edits).
- `corepack pnpm test:e2e` FULL SUITE → **19 passed (10.5s)**: 15 baseline + 4 new, zero failures — no colleague-string cross-agent failures to report at run time.

Files modified:
- app/page.tsx — :97 per-chip semantic handlers (Peleș/Brașov-city-story/Monitorul Oficial RA→company 427282), :82 `p.region` in the gallery search string, :116 empty-state suppression removed (:114 gate unchanged).
- e2e/home-smoke.spec.ts — +`waitForClientReady` local helper, +describe "Hero suggestion chips route semantically" (3 tests).
- e2e/explore-place.spec.ts — +1 test (region query surfaces Bran; genuine no-match shows the generic empty state). Existing test untouched — only gained.

Four-lens self-review:
1. *Completeness* — all 5 task items done or explicitly verified-not-needed (item 4); no scaffolding, no TODOs; chips route to real views verified by hash + data-view + heading + local-state assertions tolerant of company/legal data states (never freshness).
2. *Quality* — dense house style, no comments added to app code, Romanian user-facing strings ("Monitorul Oficial RA"), zero new deps/components; e2e comments are English contract notes per the specs' existing convention.
3. *Discipline* — only assigned files touched (page.tsx diff = exactly 3 lines; catalog-workspace.tsx read + verified, deliberately unmodified per R3); TDD RED→GREEN→REFACTOR followed; R2 (domain-workspace.tsx:25) not my file — untouched, noted.
4. *Testing* — tests exercise real chip clicks, hash routing, locality context and gallery matching against local dev; not mock-assertions; outputs read this session.

Flagged for orchestrator (concern behind DONE_WITH_CONCERNS):
- **Advocate R1 divergence (deliberate)**: task item 3 said "remove the :116 Monitorul suppression entirely", R1 preferred collapsing into one `companyMatches` condition so a typed company-intent query (e.g. `monitorul`) with geo OFF renders the CompanyCard XOR the empty state. Post-change both render together. I followed the task wording; the empty text ("Niciun rezultat **în selecția editorială**") is factually true of the gallery scope, so it reads coherently, and the geo-ON case (previously a silent dead page: card hidden AND empty suppressed) now gets the explanatory empty state — the actual UX win. If the R1 shape is wanted instead, it is a one-line condition change at :116 + a small spec note; say the word.
- Dev server note: a `run-framework dev` server (PID 3764) has been listening on 127.0.0.1:5173 since ~2h before my session — NOT started by me (Playwright reused it per `reuseExistingServer`). Left alive deliberately; whoever owns it should kill it.

- [devops] MILESTONE — scripts/verify-source-errors.mjs default (mock) matrix COMPLETE: 36 cells = 6 families (weather/open-meteo, company/anaf, courts/portal.just, feeds/stiri, catalog/ckan, transport/tpbi) × 6 scenarios (cold http500 retry-exhaust ×3 / http429 immediate / timeout-abort / malformed / success + warm http500 after a verified copy). All 36 green via the transpiled route modules + in-memory D1 (drizzle/0000 schema) + mocked globalThis.fetch with per-response choreography — house pattern from verify-cache.mjs/verify-refresh-sweep.mjs (incl. db.batch/all added for court-references/legal-registry). Runtime ~37 s (dominated by the twelve real 1s/2s retry-cadence pauses on 500 cells).
- [devops] Contract drift found while building the matrix → R property of the wave, not a deviation of the gate: lib/live/weather.ts parseForecast re-wraps ANY parse error as SourceError(error.message) (weather.ts:6), so a malformed-JSON upstream leaks the raw V8 text ("Unexpected token…") into the forecast error envelope instead of the Romanian 'Prognoza nu are o structură validă.' (which only fires for valid-JSON-wrong-shape). The gate asserts the actual contract today (non-empty envelope + 200 + unavailable); RAISING for the lib owner (Builder-B / lib/live is outside my file allowance) — one-line fix candidates: keep the explicit Romanian message for parse failures, or whitelist the wrap only for the structural Error.
- [devops] Milestone notes during the run: (a) /api/domain?kind=stiri grammar text on this branch is now singular-correct ("1 sursă … indisponibilă" — Builder-B's fix landed mid-run; assertion matched the live contract, regex loosened to /indisponibil/i); (b) the merged-state `sources` array lives in payload.data.sources (company composite + feeds merge), not top-level — asserters read the actual payload shape.
- [devops] T1.3 COMPLETE — PASSED, all checks successful:
  - scripts/verify-source-errors.mjs (new): default = CI hard gate, zero network (`node scripts/verify-source-errors.mjs` → exit 0, `{"result":"ok","mode":"mock","families":6,"cells":36,...}`); `--live` = manual, opt-in one-pass-per-family parity (app route at AFLIVRA_VERIFY_SOURCE_BASE default http://127.0.0.1:5173; ≤2 direct source fetches per family, only for surfaced failures, never re-fetching served families; verdicts ok / budget (informational, 'Limită temporară') / source (direct also fails — informational) / recovered (pause honored, source recovered — informational) / our-bug (source OK but app in hard error — exit 1 with the diff evidence); precondition failure (dev server down) → exit 2 with the Romanian hint). Per-mode evidence: default exit 0 (36/36); live precondition exit 2 proven against a dead loopback port; live verdict engine (ok/budget classification, per-source extraction, feeds one-feed sampling, JSON summary) proven against a throwaway loopback fixture serving canned payload states — no external source was contacted this wave (--live NOT run this wave, planned single run at T3.1 integration per Final decision 3).
  - .github/workflows/pr-validation.yml: verify battery gains `node scripts/verify-ro-text.mjs` + `node scripts/verify-source-errors.mjs` as hard-gate lines (no continue-on-error) inside the existing 'Verify battery — README pipeline scripts that must pass' block, matching its style. scripts/verify-ro-text.mjs EXISTS on this branch (created by the sibling agent mid-wave) and exits 0 locally today.
  - YAML validated (ruby YAML.load_file — PyYAML unavailable on this machine): parses, jobs lint-typecheck/verify/build-restore/e2e intact.
  - eslint on the new script: 0 problems; .mjs is outside tsc's include scope (tsconfig covers *.ts/tsx only).
  - Files touched (within allowance): scripts/verify-source-errors.mjs (new), .github/workflows/pr-validation.yml (battery lines only), this STATUS.md append. No app/ or lib/ file touched; README untouched (owned by Task 1.4/3.1).
- [devops] README runbook line proposal for the README owner (matches the existing battery blurbs, romanian, to place near the verify-*.mjs list around README.md:174-190):
  `node scripts/verify-source-errors.mjs` verifică, fără nicio rețea reală, matricea completă de avarie a surselor (HTTP 500 cu cele trei încercări epuizate, pauza 429, expirarea timpului, răspunsul nevalid și răspunsul de succes, plus reîncercarea după o copie validă) pe cele șase familii de surse prin rutele real compilate: ruta locală nu returnează niciodată 5xx, păstrează copia validă, prezintă codul HTTP al sursei în plicul de eroare în română și nu reinteroghează sursele servite corect. Varianta `--live` (manuală, doar cu serverul local pornit; `ALFIVRA_VERIFY_SOURCE_BASE` pentru altă adresă) face un singur acces la ruta locală per familie și, doar pentru stările de eroare ale sursei, maximum două verificări directe ale aceleiași adrese prin același contract de încărcare: sursa care cade și direct → problemă a sursei (informativ), sursa care răspunde dar aplicația raportează eroare → bug-ul nostru (ieșire non-zero cu dovada); stările de buget orar epuizat sunt raportate informativ, prin construcție.
- [devops] DevOps T1.3 — PASSED — all checks successful.

### Wave 1 COMPLETE (orchestrator summary)
- T1.1 DONE — chips semantic (Peleș→place, Brașov→city context, Monitorul Oficial RA→company 427282) + region match + empty-state fix; e2e 19/19 (15+4 noi)
- T1.2 DONE — countText/countNoun în lib/live/query.ts + 21 site-uri (13 livrate + 8 găsite la fața locului) + valori lipsă declinate corect; verify-ro-text exit 0 (matricea Academy 1/21/101→singular)
- T1.4 DONE — "Ghidurile platformei" static cu cele 5 PDF-uri reale; README 10 claim-uri rescrise; 0 referințe source-packages.json în app/
- T1.3 DONE — verify-source-errors.mjs (matrice mock 36 celule, exit 0; --live contract dovedit pe fixture) + CI battery; a ridicat: lib/live/weather.ts:6 parse-error sare V8 text brut în plicul românesc (fix 1 linie → Wave 2)
- Cross-agent cleanliness: 0 conflicte de fișiere; pre-existing: verify-lawyers.mjs pică identic și pe HEAD pristine (harness gap, nu al nostru — fix Wave 2)
- NEW USER REQUIREMENT (wave 2): schimbarea localității → actualizare INSTANT a tuturor suprafețelor dependente de localitate
