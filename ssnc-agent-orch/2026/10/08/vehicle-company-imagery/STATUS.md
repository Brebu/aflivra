# STATUS — vehicle-company-imagery

## Builder-T2

**Mandate**: the firm/company surface — (1) search by NAME (today CUI-only), (2) "cine este în conducere" (directors on the company card, provenance + honest absence) · **Status: DONE** (all gates green on the final shared tree; the full e2e CI=true fleet result + one pre-existing gate finding are recorded below)

### Probes ledger (every external spend this session, spaced ≥5 s, UA `Aflivra/1.0 public-data-source-check`)

| # | Host | Request | Result |
|---|---|---|---|
| 1 | data.gov.ro | `package_show?id=firme-02-09-2026` (the newest quarterly ONRC „Informații firmă" dataset — the 2023+ series the mission named) | 200 — **6 CSV resources, none datastore_active**: `OD_SUCURSALE_ALTE_STATE_MEMBRE.CSV` 19 KB · `OD_REPREZENTANTI_IF.CSV` 13.3 MB · `OD_STARE_FIRMA.CSV` 91 MB · `OD_REPREZENTANTI_LEGALI.CSV` **336 MB** · `OD_CAEN_AUTORIZAT.CSV` 431 MB · **`OD_FIRME.CSV` 693 MB** — fixture `fixtures/onrc-firme-package-show.json` |
| 2 | data.gov.ro | Range GET on `OD_REPREZENTANTI_LEGALI.CSV` (first attempt, `r.text()` — server streams whole file, Range honored but body ignored) | timed out at 45 s — **spent, recorded** |
| 3 | data.gov.ro | Range `bytes=0-4095` read-first-chunk+cancel on `OD_REPREZENTANTI_LEGALI.CSV` | 200, `content-range: …/336717481` — **columns: `COD_INMATRICULARE ^ PERSOANA_IMPUTERNICITA ^ CALITATE ^ DATA_NASTERE ^ LOCALITATE_NASTERE ^ JUDET_NASTERE ^ TARA_NASTERE ^ LOCALITATE ^ JUDET ^ TARA`** (the official legal-representatives registry; joinable by trade-registry number = ANAF `nrRegCom`; first rows are lichidatori) — fixture `fixtures/onrc-reprezentanti-legali-head.csv` |
| 4 | data.gov.ro | Range head on `OD_FIRME.CSV` | 200 — **columns: `DENUMIRE ^ CUI ^ COD_INMATRICULARE ^ DATA_INMATRICULARE ^ EUID ^ FORMA_JURIDICA ^ ADR_* (tara/judet/localitate/strada/nr/bloc/scara/etaj/apartament/cod_postal/sector/completare) ^ WEB ^ TARA_FIRMA_MAMA`** — the complete official name→CUI registry; some rows carry CUI `0` (PFAs without CUI) — fixture `fixtures/onrc-firme-head.csv` |
| 5 | data.gov.ro | `package_show?id=date_de_identificare_platitori_actualizate_iunie_2026` (MFP) | 200 — 2× ~435 MB CSV/TXT pairs, none datastore_active — fixture `fixtures/mfp-platitori-package-show.json` |
| k1..k5 total | data.gov.ro | **5/5 budget spent** | — |
| m1 | mfinante.ro → mfinante.gov.ro | the old name-lookup form page (HTTPS, then plain HTTP follow of the 302) | HTTPS `ECONNREFUSED`; http 302 → `www.mfinante.gov.ro`; `infocodfiscal.html` on the current domain → **404 — the public name-lookup page is retired** — fixture `fixtures/mfinante-infocodfiscal.html` |
| fp1 | finantepublice.ro | root (HTTPS then HTTP) | HTTPS `ECONNRESET`; plain HTTP 200 — **a parked domain-sale page, no ministry content** — fixture `fixtures/finantepublice-root.html` |
| a1 | webservicesp.anaf.ro | root | 404 with a redirect-to-anaf.ro stub — **no listing/search endpoint**; the two wired services (`/bilant`, `/api/PlatitorTvaRest/v9/tva`) are CUI-only, probe-pinned already in the wave-B fixtures |
| dg1 | kreports.ro / monitoruloficial.ro | landing GET each (the mission's directors leads) | kreports.ro **DNS ENOTFOUND — domain dead**; monitoruloficial.ro 200 — the Official Gazette's public site (issue indexes); the per-firm/full-text search is the paid parteneri service, no open per-firm API — fixtures `fixtures/directors-*.html` |
| w1..w9 | query.wikidata.org | 3 through **our own running machinery** (`/api/company?name=…` on the shared dev server — own infra + the upstream hits), 6 direct verify/debug (`ssnc …/probe-wikidata-*.mjs`) | the first, CONTAINS-scan query form **timed out at the loader's 18 s upstream budget on cold queries** (2× unavailable, 1× slow-empty) — the measured defect; the index-backed **EntitySearch** form answers in 388–905 ms — live evidence: `Banca Transilvania` → Q806161 `RO5022670` + site; `Monitorul Oficial` → Q3047092 `RO012329` + site; `Petrom` → 0 (its Wikidata item carries no P3608 — honest absence) |

**Source verdicts (probe-settled)**

- **Name→firm (ask 1)**: the official registries that carry `DENUMIRE+CUI` (ONRC `OD_FIRME.CSV` 693 MB quarterly; MFP payer identification 2×435 MB) publish **no server-side name query and no CKAN datastore**, and exceed every fetch/commit cap the app has (25 MB read cap; seeds ride the ≤1 MB-gzipped Worker script; 693 MB ≫ D1 row bounds) — the committed-seed pattern is infeasible for the full registry, and a partial seed would be a biased registry. mfinante's lookup page is retired, ANAF has no name endpoint, finantepublice is parked. **The one honest upstream is the open-knowledge registry the firm family already reads** (query.wikidata.org) — searched through Wikidata's own indexed **EntitySearch** service, restricted to entries carrying the Romanian VAT id (P3608), rate-budgeted per the house pattern. Coverage honestly disclosed in the UI: firms without a knowledge-registry entry are an honest absence, never invented.
- **Directors (ask 2)**: ANAF balance = financial indicators only (fixture `wave …/company-anaf.txt` — no person fields); the **official** ONRC legal-representatives registry exists (`OD_REPREZENTANTI_LEGALI.CSV` — person, role, birth/residence, keyed by registration number) but is 336 MB integral with no query API — unserveable, uncommittable; K-Reports is DNS-dead; Monitorul Oficial has no per-firm API. Wired sources: Wikidata P169/P488 **+ P1037 (director/manager — added)**. Honest absence names the unserveable official registry in user-visible text.

### TDD cycle (RED → GREEN → REFACTOR)

- **RED (e2e)**: `e2e-RED.log` — 6 new legs, all failed for the intended reasons (no `.company-name-results` surface, no `Conducere` tab, no validation alert); the 2 pre-existing registries legs stayed green throughout.
- **RED (matrix)**: `matrix-RED.log` — the new `company/name-search` cells failed on the unmodified route (`?name=` fell through to the CUI branch: status `stale` + company payload instead of the name-search envelope) — cells before loader/route changes.
- **GREEN**: 8/8 e2e legs isolated (6 s/run; re-run green after every subsequent change — final ×2 below); matrix **34 families / 226 cells** green ×2 (was 33/219: +`company/name-search` 7 cells + the company/anaf leadership assertions).
- **REFACTOR**: name-search rows reuse the shared outline `Button` + `entity-row` classes (zero new CSS — no CSS file is in this partition); the CONTAINS→EntitySearch query switch after the live timing finding (same response shape, matrix unchanged); no behavior changes beyond the disclosed repairs.

### What landed (files, my partition)

- **`lib/live/adapters.ts`** — `parseCompanyNameSearch(raw, term)` + `companyNameSearchLoader(name)` (SPARQL via the index-backed EntitySearch service; `?item wdt:P3608 ?vat` required; CUI validated `^[1-9]\d{1,9}$` from the VAT id, rows without a valid CUI unlisted; Q-id + website kept; `LIMIT 50` disclosed as `limited`; `SourceError` on non-JSON bodies; key `company-name:<term>`, ttl 3600, version `wikidata.company-name.v1`).
- **`lib/live/knowledge.ts`** (company part only) — leadership query gains **`?item wdt:P1037 ?person. BIND("Director sau manager indicat de sursă" AS ?role)`** beside P169/P488 — the third management role the source itself carries.
- **`app/api/company/route.ts`** — `?name=` branch (trim, 2..100 length gate → 400 `Nume invalid.`, then `readSource(companyNameSearchLoader(name))`, full status+data envelope); the CUI branch unchanged.
- **`app/live-company.tsx`** — (a) the name-search form (`DraftForm` + `Input aria-label="Nume firmă"` + client validation `<2`/`>100` with `role="alert"`) + results panel (`.company-name-results` vpanel: h2, Freshness, the visible coverage line naming the ONRC integral files „fără interogare pe nume la sursă”, countText, result rows as outline Buttons that open the clicked CUI **and switch to the „Registre publice” tab** per the deliverable; honest-absence paragraph when 0); (b) new **„Conducere” tab** (`CompanyManagement`: h2 „Conducerea firmei”, join statement on the identical VAT id, knowledge-source Freshness, persons table Persoană/Rol indicat/Proveniență „Wikidata · aceeași înregistrare TVA”, the standing caveat, and the honest-absence text naming the ONRC reprezentanților legali registry it cannot carry); (c) Tabs became controlled (`value/onValueChange`) so a name-result click can land on the registries tab; the old Contact-tab leadership paragraph became a pointer to the dedicated section.
- **`e2e/company-name-search.spec.ts`** (NEW, 4 legs — happy path with coverage sentence, click-through to card+registries tab, honest absence naming the unqueryable national registry, too-short rejection with 0 source requests) and **`e2e/company-registries.spec.ts`** (+2 legs — directors section with per-row provenance + roles incl. the manager role; no-leadership honest absence with 0 invented rows). Every stub is a full **status+data envelope** (the saved STATUS-envelope lesson).
- **`scripts/verify-source-errors.mjs`** — new family `company/name-search` (7 cells: http500/429/timeout/malformed/invalid/success + warm-http500) with its fixture `companyNameSearchWikidata()` (double row de-dup → one firm; second firm with own CUI; `RO0` row unlisted); `company/anaf` cells extended with the real knowledge fixture `companyKnowledgeWikidata()` + leadership/roles/provenance assertions; summary sentence clause added.

### Cross-partition completions (disclosed, each load-bearing; Builder-C/D1 precedent)

1. **`lib/live/cache.ts`** — one budget line: `company-name:*` and `knowledge-company:*` share **`budget(db,'wikidata',120)`** (the host now serves two user-driven families; every user-driven upstream is rate-budgeted per the house pattern — without the line the name search rides ungated).
2. **`scripts/verify-sweep-inventory.mjs`** — parity: `'company-knowledge':{parity:['company/anaf','company/name-search']}` (truthful: the onDemand knowledge family reads the same Wikidata source through the same route; the one-registry/two-matrix-families pattern already used by `law.search`).
3. **`scripts/verify-recency-policy.mjs`** — pin move `cache.ts:70 → 73` for the ANAF-company-history anchor (my budget lines sit above it; pinned content unchanged; the gate's own header procedure), documented in the pin's comment.
4. **`scripts/verify-cache.mjs`** + **`scripts/import-legal-snapshots.mjs`** — `'media'` added to both transpile lists (my adapters change imports `publicUrl` from `./media`; without it both harnesses break at import — the same one-line completion Builder-D1 made for `source-xml`).

### Fields surfaced

- Name search: firm name, CUI (validated from RO-VAT), Q-id, website — per firm found; `count` + `limited` disclosure.
- Conducerea tab: person name, role-as-indicated-by-source (3 roles), provenance column; knowledge source state (Freshness) inside the section; absence text when no source carries people.
- Provenance: `leadership`, `websites` remain in the combineCompany per-field map; no field is joined by name anywhere (rows link onward only on the validated CUI).

### Verification (commands run on the final tree, this session)

- `corepack pnpm exec tsc --noEmit` — **0 errors**
- `corepack pnpm lint` — **0 errors, 115 warnings** (= the ≤115 budget; **zero added by my files** — targeted eslint on my changed/new files: 1 pre-existing warning in `live-company.tsx` (the `initialCui` effect, present at HEAD), 0 in everything else; the transient 117 counted T1's mid-flight edits and settled to 115)
- `node scripts/verify-source-errors.mjs` — **GREEN ×2 — 34 families / 226 cells** (incl. `company/name-search` 7 cells, `company/anaf` leadership extension)
- `corepack pnpm exec playwright test e2e/company-name-search.spec.ts e2e/company-registries.spec.ts` — **8/8 passed ×2** isolated on the final tree
- Family + collateral gates green on the final tree: `verify-live`, `verify-cache` (with the media completion), `verify-sweep-inventory` (49 registry families, parity both directions), `verify-enrichment-joins` (my files pass LEG 1–5 unchanged — join keys stay CUI/VAT), `verify-refresh-sweep` (5 groups frozen — no 6th), `verify-recency-policy` (pin moved with the anchor), `verify-ro-text`, `verify-model-contracts`, `verify-federated-search`, `verify-watch-sweep`, `verify-watch-api`, `verify-packed-seeds`, `verify-snapshot-transport` (6673 snapshots intact), `verify-css-keyframes`, `verify-downloads`, `audit-dead-data` (26/26 clean, report-only)
- Live end-to-end through the app's own machinery (shared dev server, own infra): `/api/company?name=banca%20transilvania` → **status fresh, CUI 5022670 / Q806161 / site bancatransilvania.ro**; the CONTAINS query form's cold-18 s timeout caught and fixed by the EntitySearch switch (probe timing 388–905 ms)

### Full e2e fleet (CI=true)

Two fleet attempts in port windows taken from the shared branch (the 5173 listener all session belonged to Builder-T1 — never mine to kill; each run started its own Playwright webServer on a verified-free port and tore it down at exit — port confirmed clean after each):

- **Run 1** (23:55–00:06): 205 passed / 9 skipped / **1 failed** — `e2e/geo-drift-dialogs.spec.ts:119` „a cinema film dialog survives a same-locality position drift" (failed + retry1). **Triage**: the leg passed **6/6 in isolation** on the same tree immediately after (16 s); Builder-T1 was mid-edit on `app/public-map.tsx`, `app/workspaces.css`, `app/places-workspace.tsx` during the fleet's 10.7-minute window — the shared-server HMR mid-run failure class Builder-D documented on 2026-10-08. No company-family leg failed; none of my files feed the cinema/map dialog surfaces. Explained, not papered over.
- **Run 2** (00:24–00:32, clean port window): **206 passed / 9 skipped / 0 failed (7.7m), exit 0** — the registered hardware-premise legs are the skips. My 6 new legs green in both fleets.

Full record: `fleet-CI-true.log` in this dir.

### Battery / README registration list (for the orchestrator — README/pr-validation are not my files)

- `verify-source-errors.mjs` cells: **33→34 families / 219→226 cells** — README's two mentions (the "…familii / …celule" sentence at the battery list and the second count further down) both need the 34/226 correction plus the family clause: *`company/name-search` — căutarea firmei după nume: registrul deschis de cunoștințe interogat pe nume (EntitySearch), restrâns la înregistrările cu TVA românesc, rândul fără CUI valid rămâne nelistat, numele prea scurt/lung respins cu 400 fără interogarea sursei*.
- No battery registration needed elsewhere: `verify-source-errors.mjs` is already in `pr-validation.yml`; the new e2e spec is auto-discovered; no new cron (refresh-groups frozen — the parity rides the existing `company-knowledge` onDemand family), no new endpoint host (query.wikidata.org already in the company family's allowed set).
- Rate math (registered): name search + firm knowledge share `wikidata 120/hour` (cache.ts budget line); searched terms D1-cache with 1 h TTL — worst case 120 distinct-term upstream hits/hour system-wide, each one WDQS request.
- README prose proposals if the orchestrator wants them: one sentence on the firm surface (name search coverage + the Conducere tab) and the onDemand `company-knowledge` reason line optionally gaining „căutarea după nume citește aceeași sursă, la cerere”.

### Pre-existing gate finding (raised, NOT fixed — outside my partition)

`scripts/audit-controls.mjs` is **red at HEAD itself** (proved by running it in a clean archive worktree of commit `a1efe5b`): the merged „Card text clamps” PR (a1efe5b) introduced `-webkit-line-clamp:2` into `app/complete-data.css`, which the gate forbids (`assert(!css.includes('line-clamp:2'))`). No file of mine feeds that assertion. My new surfaces pass the control mechanics (12 controls, 0 issues — replicated the audit's walker on `app/live-company.tsx`).

### Self-review (four lenses)

- **Completeness**: both asks delivered end-to-end — name search UI → firms with CUI → the existing card with the Registre publice tab as destination; directors as a proper card-level section with per-row provenance and honest absence naming the real official registry; no scaffolding, no TODOs.
- **Quality**: every element composes existing machinery (DraftForm, InfoHint, Freshness, countText, outline Button + entity-row, the combineCompany provenance model); Romanian UI copy, English code comments; probe ledger complete with the timing defect caught and fixed rather than papered over.
- **Discipline**: partition held — the four cross-partition completions are disclosed above with their load-bearing reason, all one-liners except the parity entry; no README/.github writes; no new cron; Wikidata was the only non-named probe host and every spend is in the ledger; range probes read 4 KB and cancelled.
- **Testing**: RED evidence kept for both layers; matrix green ×2 and re-run on the final tree; 8/8 e2e legs green ×2 on the final tree plus green in both CI=true fleets; live verification through the app's own loaders produced a real finding (the CONTAINS timeout) that became a fix with the fast query form — outputs read, not assumed; the single fleet transient was reproduced-in-isolation-green and closed by the clean second fleet.

**Status: DONE** — both asks delivered and verified on the shared final tree: name search (Wikidata-EntitySearch-backed, honestly disclosed coverage, rate-budgeted with the knowledge family) and the Conducere section (roles incl. P1037 director/manager, per-row provenance, honest absence naming the unserveable ONRC registry); exit gate green (tsc 0, lint 0/115, matrix 34/226 ×2, family + collateral gates, **CI=true fleet 206/206·9-skip green**); the four cross-partition completions and the pre-existing audit-controls HEAD finding are disclosed above for the orchestrator's review.

## Builder-T3

**Mandate (user ask, ro):** „pentru parcuri, școli, farmacii, judecătorii vreau integrare cu Wikidata pentru imagini; vreau imagini mai reprezentative, poate ceva de promovare turistică dacă există" — delivered as the Wikidata/Commons imagery relay + attested register, renderer wiring and the locality tourism teaser, per the wave plan. · **Status: DONE** (all gates green on the final shared tree; full e2e CI=true fleet: **206 passed · 9 skipped (pre-existing CI-conditional legs) · 0 failed, 7.8 m**, all four imagery legs included).

*Note: an earlier version of this section was lost to a sibling's wholesale STATUS rewrite (write race); this is the same content, re-merged below Builder-T2's section — nothing of T2 was altered.*

### T3.1 — Q-id classes covered (committed corpus, offline census)

Census scripts (offline, zero network): `probe/probe-qid-census.mjs`, `probe/probe-qid-values.mjs` → artifacts `probe-qid-census.json`, `probe-qid-values.json`.

| class | corpus category · OSM key | records | with exact Q-id | distinct Q-ids | eligible tags (imagery roles) |
|---|---|---|---|---|---|
| park   | mediu · `leisure=park`        | 4 930 |  54 | 53 | `wikidata` → entity |
| school | educatie · `amenity=school`   | 4 651 |  46 | 30 | `wikidata` → entity (operator-only rows excluded: `operator:wikidata` ×16 rows point at an operator ministry — its photo is not a photo of the school) |
| pharmacy | sanatate · `amenity=pharmacy` | 4 059 | 1 267 | 15 | `wikidata` → entity, `brand:wikidata` → **brand** (honest label; 1 266 rows are chain brands: Dr Max ×444+4, Catena ×403+1, Help Net ×192, Dona ×186…) |
| court  | justitie · `amenity=courthouse` | 207 | 9 | 9 | `wikidata` → entity |
| TOTAL distinct Q-ids | | | | **107** | |

D4 exact-id rule: `/^Q[1-9]\d{0,9}$/` single value only — multi-valued/malformed ids never key (the same rule the `app/places-workspace.tsx` link-out builder uses). `network:wikidata` present in corpus but excluded for the same honesty reason as operator.

### T3.2 — Probe ledger (network, budgeted)

Budget: ≤10 Wikidata/Commons **API** calls this session. **Used: 5.** UA `Aflivra/1.0 (contact: contactretetesecrete@gmail.com)`, calls spaced 2 s.

| # | call | purpose | result |
|---|---|---|---|
| 1 | `wbgetentities` 49 ids (34 park entity + 15 pharmacy brand) | claims shape probe | 30/49 have P18/P158 |
| 2 | Commons `imageinfo` extmetadata ×25 titles | license/artist/thumb shape probe | validated; `sha1` is of the ORIGINAL — the relay must hash the downloaded thumb bytes itself (implemented) |
| 3–4 | `wbgetentities` 50+7 ids (remaining parks/schools/pharmacy/courts) | full claims ledger | 65/92 entity Q-ids imaged (park 36, school 20, court 5, pharmacy entity 0) |
| 5 | Commons `imageinfo` ×14 titles (the starter set) | license check before download | 14/14 licensed+authored |

Image downloads (bytes, not API calls): 14 × `Special:FilePath?width=800`, 1 s spacing, all in the 105–455 KB band. Artifacts: `probe-wikidata-imagery.json`, `probe-qid-claims-full.json`, `probe-qid-claims-merged.json`, `probe-starter-rows.json`.

**No production relay run**: the relay binary itself was exercised only through the offline loopback harness below; the starter set was produced by `probe/probe-attest-starter.mjs`, which imports the relay's exported pure pieces (corpus reader with sha256 proofs, classifier, parsers, download guard, asset-row builder) so starter rows are byte-identical to what the weekly relay produces.

### T3.3 — The weekly relay (scripts/relay-imagery.mjs, NEW)

Zero-dep (node:crypto/fs/zlib/url only), headerless like `relay-afir.mjs`. Two phases:
1. **Query** — reads the committed corpus *with the places-manifest sha256 proofs* (the same integrity rule as `/api/places`; a broken proof exits 1 before any network), classifies the four classes via exported `classifyImageryRecords` (single module — one rule set everywhere), batches `wbgetentities` (≤50 ids/call, ≤250 ids/tour) for P18/P158, then Commons `imageinfo` extmetadata (≤50 titles/call, `iiurlwidth=800`).
2. **Apply** — downloads `Special:FilePath/[title]?width=800` with redirect-manual hops (max 3), every hop host-validated against the Wikimedia family (a foreign redirect is refused + logged; the runner never becomes an open proxy), keeps exact bytes, sha256-hashes them itself, writes `public/media/wiki-q<id>.<ext>` + appends the manifest rows + rebuilds `public/media/imagery-register.json` (assets + full records map + per-class stats).

Guardrails: license+author REQUIRED from extmetadata (unlicensed claims skipped honestly and retried next tour); one asset per Commons title (dedup guard); per-tour download cap 40; wave cap 2 000 register rows; per-file ≤25 MiB; pre-attested Q-ids skipped (steady state ≈ 2 cheap API calls/week); exit classes 0/1/2 as the AFIR precedent. Politeness: UA with contact, 250 ms inter-request spacing.

Offline harness **`scripts/verify-relay-imagery.mjs` (NEW)** — loopback double of Wikidata+Commons+Special:FilePath on 127.0.0.1 against a synthetic corpus root with real sha256 proofs. **12 legs, all green ×2**: full-cycle classification (operator excluded, malformed ids rejected), idempotence, per-tour cap, wave cap, Wikidata 500 → 2, Commons 500 → 2, all-downloads-fail → 2 (no partial writes), foreign redirect → refused → 2, corpus sha mismatch → 1 with zero API contact, Commons-title dedup (two Q-ids → one file), stable cycle (only unattested keys queried), classifier D4 rules, workflow contract assertions.

### T3.4 — Workflow .github/workflows/imagery-refresh.yml (NEW)

`workflow_dispatch` + `cron: "0 6 * * 4"` — **Thursday 06:00 UTC**, outside the frozen Mon(03)/Tue(04)/Wed(05) relay slots, outside the 5-cron Worker cap (**no `refresh-groups.json` change** per partition; the imagery family is GH-relayed like afir/bia/flights). `permissions: contents: write` (the tour commits). Flow: full checkout → pnpm frozen install → `node scripts/relay-imagery.mjs` (exit-2 → `::warning`, skip, exit 0; our failures red) → if `public/media` dirty: `verify-exploration-media.mjs` + `verify-media-budget.mjs` **before** commit → `git add public/media` + commit + push as `aflivra-imagery-relay`. No `continue-on-error`.

Disclosed shared-infra touch (one line, follows the three relay precedents): `verify-relay-imagery.mjs` added to the pr-validation verify battery, right after `verify-relay-flights.mjs`.

### T3.5 — Starter attested set (images added this session)

14 files in `public/media/` (+3.1 MB total, each ≤455 KB — well inside per-file 25 MiB; public/media now 697 files; manifest 624 rows). Register: `public/media/imagery-register.json` (schema `aflivra-imagery-v1`), mapping **459 corpus rows**.

| class | app_id | subject |
|---|---|---|
| park | wiki-q959632 · wiki-q2052075 · wiki-q2074133 · wiki-q715958 · wiki-q4118458 · wiki-q2284372 | Cișmigiu, Carol I, Herăstrău, Central Cluj, Copou Iași, Nicolae Romanescu Craiova |
| school | wiki-q12744205 · wiki-q3067523 · wiki-q18539127 | Școala Centrală, Sfântul Sava, Costache Negruzzi Iași |
| pharmacy (brand, honestly labeled) | wiki-q56317371 · wiki-q117706903 | Dr Max (444+3 rows mapped), Подорожник (3 rows) |
| court | wiki-q5755230 · wiki-q43113639 · wiki-q18548695 | ÎCCJ, Tribunalul Sibiu, Tribunalul București |

Wave soft cap 2 000: 14 shipped this session; the weekly relay grows coverage honestly (65+ imaged Q-ids already in the claims ledger: 36 parks, 20 schools, 5 courts; pharmacy brands re-checked weekly for newly-published P18/P158 or newly-licensed files).

### T3.6 — Extended media gates (RED-proven)

- `scripts/verify-exploration-media.mjs` (+ imagery block): register schema; every asset row proves exact Q-id, P18/P158 claim, honest role (entity/brand), class scoping, author/license/https license-url/Commons-file source page; **register↔manifest parity**; sha256+bytes on the exact shipped file; no Commons title attested twice; **full corpus parity** — the records map and per-class stats recompute via the relay's own `classifyImageryRecords` and must match exactly (no drift, no dangling records, no inflated coverage).
- `scripts/verify-media-budget.mjs` (+ imagery block): wave cap 2 000; every register row complete + sha/bytes proven + manifest face present; every `wiki-*` file on disk claimed by the register (no orphan binaries).
- RED proof (mutation test, both caught, register restored byte-identical): dropping one mapped record row → the corpus-parity assertion fires; faking an asset sha256 → the SHA-256 proof assertion fires.
- Also fixed a real pre-existing lint warning in my partition file (`module` assignment in verify-exploration-media's compile harness → renamed `compiled`), keeping the wave lint ledger at exactly 115/0 with my partition net-zero (the tourism teaser's plain `<img>` adds one no-img-element warning, offset by the real fix; no `eslint-disable` — the repo uses none).

### T3.7 — Renderer wiring

- `lib/places-view.ts` (+ imagery types + `imageryFor` / `imageryChip` / `imageryGalleryItem`): register lookup, the honest chip vocabulary, gallery item builder.
- `app/places-workspace.tsx` — image/gallery wiring only: session-cached register loader (one fetch per session like the places manifest; missing file degrades honestly to the AI illustration, never an invented photo); **EntityCard** priority = source hotlink (`entry.image`) → attested register image → AI illustration, chip per provenance: `Fotografie atestată local · Wikidata/Commons · [licență]` / `Fotografie de brand · Wikidata/Commons` (brand ≠ this pharmacy) / `Ilustrație reprezentativă · AI` (unchanged), with honest failure fallback to the AI illustration; **EntityDetail** prepends the attested image to `PublicMediaGallery` with author, license, Commons source page and license link; **tourism teaser** — one attested gallery photo per locality (exact city match on the attested exploration register only — WLM + curated galleries, no new scraping), labeled `PROMOVARE TURISTICĂ · [oraș]` with the explicit honesty note „Nu este o fotografie a acestui loc.", deep-linking `#view=place&id=…`.
- `app/workspaces.css`: new `.imagery-teaser` block only (+ mobile rule); one-line append to the pr-validation battery.
- **Same-field coordination disclosure (per partition rule):** before editing `app/places-workspace.tsx` I checked the wave STATUS files — no sibling had claimed it at session start. My edit touches only the image/gallery wiring lines (imports, loader, EntityCard figure, EntityDetail gallery prepend + teaser). T1's concurrent edits live in `transit-workspace.tsx`/api/company/scripts-verify per `git diff --stat`; the travel/transit workspace file itself was NOT touched by me; T2's rewrite of this STATUS file lost my first section (noted above, re-merged without touching T2's).

### T3.8 — E2E (e2e/imagery-attribution.spec.ts, NEW)

4 legs, all green (isolated run 9.2 s, plus green inside the full fleet): park card (Cișmigiu) renders `/media/wiki-q959632…` + license chip + full gallery attribution (author, license link, Commons source page); the Dr Max brand card shows the brand photo with the *brand* chip while chain rows without the brand Q-id keep the AI chip; the independent pharmacy (2NA Farm) keeps the honest AI chip; the Sibiu courthouse shows its attested photo AND the locality teaser with the honesty note + gallery deep link; the kindergarten query keeps AI chips (0 attestation claims). The legs failed RED first for real reasons (justitie/sanatate need `&tab=places`; the search fill needs the client-ready wait after hydration) — fixed in the spec, not the app.

### T3.9 — Exit gates evidence (run on the final tree, this session)

- `corepack pnpm exec tsc --noEmit` → **exit 0**.
- `corepack pnpm lint` → **115 problems (0 errors, 115 warnings)** — at the wave ceiling, my partition net-zero (T3.6).
- `node scripts/verify-exploration-media.mjs` ×2 → **exit 0 ×2** („14 attested Commons images (park 6/54 · school 3/30 · pharmacy 447/1267 · court 3/9) mapping 459 corpus rows on exact Q-ids").
- `node scripts/verify-media-budget.mjs` ×2 → **exit 0 ×2** („14 wiki-* files, all claimed by the imagery register (14 rows within the 2000 wave cap)").
- `node scripts/verify-model-contracts.mjs` ×2 → **exit 0 ×2** (manifest integrity untouched).
- `node scripts/verify-relay-imagery.mjs` ×2 → **exit 0 ×2** (12 legs).
- **`CI=true corepack pnpm test:e2e` → 206 passed · 9 skipped · 0 failed (7.8 m)** — the 9 skips are pre-existing `test.skip(!!process.env.CI, …)` shared-runner legs, none imagery-related. Sequenced honestly: sibling builders were running their own suites against the shared 5173 dev server; I polled the port to drain (killed none of their processes) and ran the fleet on Playwright's own CI boot.

### T3.10 — Registration list (files T3 added/changed)

**NEW:** `scripts/relay-imagery.mjs` · `scripts/verify-relay-imagery.mjs` · `.github/workflows/imagery-refresh.yml` · `public/media/imagery-register.json` · `public/media/wiki-q{117706903,12744205,18539127,18548695,2052075,2074133,2284372,3067523,4118458,43113639,56317371,5755230,715958,959632}.jpg` (14) · `e2e/imagery-attribution.spec.ts` · session probes (`ssnc-agent-orch/2026/10/08/vehicle-company-imagery/probe/*`, 6 scripts + 6 artifacts).
**CHANGED (my partition):** `public/media/manifest.json` (+14 attested rows, formatting unchanged) · `scripts/verify-exploration-media.mjs` (import block, compile var rename, imagery parity gate) · `scripts/verify-media-budget.mjs` (import block, imagery budget gate) · `lib/places-view.ts` (imagery types/helpers) · `app/places-workspace.tsx` (image/gallery wiring lines only) · `app/workspaces.css` (teaser styles only) · `.github/workflows/pr-validation.yml` (one battery line).
**NOT touched (per partition):** transit files, company files, `lib/live/refresh-groups.json` (no worker cron — the imagery family is GH-relayed only; its register classification is deferred to the register owner by explicit partition instruction), `README.md` (registered here instead).

### Four-lens self-review

- **Completeness:** all four phases of the wave plan shipped (Q-id mapping, relay+workflow, renderer, tourism teaser; e2e legs as specified). No TODOs, no stubs. Not done by design: negative caching of unlicensed Q-ids (re-checked weekly so newly-licensed photos get picked up), operator/network images (honesty exclusion documented in T3.1), teaser for cities without attested galleries (hidden).
- **Quality:** one rule set for classification (relay exports consumed by probe + gates); one attestation builder; register↔manifest↔disk parity hard-gated; honest labels everywhere (entity vs brand vs AI vs hotlink; tourism teaser explicitly "not a photo of this place").
- **Discipline:** TDD held (RED harness before the relay existed; mutation-tested register gates; RED-failing e2e legs fixed for real reasons). Network within the ≤10 API-call budget (5 used). No commits (per session rules). No transit/company/refresh-groups/README touches.
- **Testing:** loopback harness 12 legs ×2, gates ×2, mutation RED proof, e2e legs green multiple times, full fleet green under CI=true.

**Status: DONE**
