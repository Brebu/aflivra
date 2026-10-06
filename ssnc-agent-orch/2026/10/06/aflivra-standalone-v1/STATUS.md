# Implementation Status

## Session
aflivra-standalone-v1 — direct /build, subagents mode, anchored to /Users/cbrebu/Projects/alfivra

## Current Phase
Phase 1.5: Advocate review (mandatory — preliminary complexity score 6)

## Session Log

### 2026-10-06T06:31:59Z
- [orchestrator] /build started from approved DESIGN.md (ssidir 2026/10/06/aflivra-standalone-v1)
- [orchestrator] Anchor: direct mode, /Users/cbrebu/Projects/alfivra (repo not yet initialized)
- [orchestrator] Preliminary complexity score 6 → Advocate gate mandatory
- [orchestrator] Revert guard: not armed
- [orchestrator] prompt.md + PLAN.md created; specialist pre-scan: database, devops, security, api, uiux, performance, migration, content

### Phase 1.5 — Advocate review (returned)
- [advocate] No CRITICAL security findings. 1 HIGH (D1 cron sweep impossible as single job on free plan), 3 MEDIUM (D2 UTC cron semantics, D3 deploy patch set incomplete without worker name + crons + assertions, D4 status endpoint token + .dev.vars), advisory D5-D7. Full report: ADVOCATE-REVIEW.md.
- [orchestrator] Adopted into PLAN.md: D2, D3, D4, D5, D6, D7. D1 (free-grouped vs paid) PENDING user decision. S1 default: advisory-with-CRITICAL-block, no CRITICAL findings this session. S2: tracker coordination skipped (user's operational style; GitHub remote chosen instead).

### User directive mid-phase (2026-10-06)
- user provided a github.com PAT (out-of-band; stored transiently at an untracked temp path, NEVER in repo files; rotation advised since it was pasted in chat) and instructed: push the code + whatever is necessary
- [orchestrator] Executed Phase-1 bootstrap INLINE (extraction → verify → git → GitHub):
  - 8 archives extracted into repo root; SHA-256 verified 9/9 byte-exact vs Aflivra_Pachete.csv
  - git init -b main; branch feat/aflivra-v1-standalone; commit 1 = pristine import (6,987 files)
  - archives relocated to archives/ (gitignored); .gitignore, .nvmrc, README local-run section → commit 2
  - DISCOVERY: PWA base already in export (manifest, icons 192/512, sw.js, offline.html) — Phase 4 becomes audit+complete
  - corepack pnpm install running detached (PID in /tmp/aflivra-install.pid; first attempt aborted by user — ~700 pkgs, cold store, strictDepBuilds; resumed from populated store)
- [orchestrator] GitHub identity resolved: owner `Brebu` (not cbrebu); token scopes include `workflow` (CI pushes enabled later)

### Phase 1.5 resolution + GitHub baseline live
- [advocate/user] ALL Advocate decision points resolved: S1 advisory+CRITICAL-block; S2 skip tracker; D1 **free-grouped sweep** (≤5 crons, ≤~40 subrequests/group, heavy families on seeds); D2 UTC `0 0 * * *`-based; D3 deploy patch set (name/database_id/crons + assertions); D4 token on both endpoints + .dev.vars; D5/D6/D7 adopted. Gate PASSED.
- [orchestrator] GitHub destination CONFIRMED by user: stay on Brebu/aflivra (Quizz repo untouched — it holds a separate quiz project; link was account confirmation). Accidental enterprise repo code.ssnc.dev/cbrebu/aflivra pending MANUAL deletion by user (enterprise token lacks delete_repo).
- baseline verification: install DONE (24s warm); `GET /` 200 in ~9s; `/api/live` 200; tsc: 1 pre-existing export error (components/ui/sidebar.tsx:8 '@/hooks/use-mobile' missing) — scheduled fix; branch pushed; PR https://github.com/Brebu/aflivra/pull/1 (merge commit 08e6048 reconciles unrelated auto-init history)

### 2026-10-06 — Architect pass (assignment-ready task graph)
- [Architect] starting evidence pass: deploy seam (sites-vite-plugin/wrangler emit), refresh sweep substrate (lib/live loaders + cache.ts), PWA audit, Playwright surfaces, sidebar ts error

## Architect Findings

**Mode**: standalone /build (SESSION_DIR = ssnc-agent-orch/2026/10/06/aflivra-standalone-v1).
Artifacts updated: PLAN.md (## Advocate Review inserted; ## Tasks replaced with
assignment-ready wave graph; ## Specialists Recommended finalized; Complexity Score 14).
Requirements 1–7 untouched. No side-files.

**Tech stack detected**: TypeScript 5.9 (strict, `@/*`→`./*`), Next 16.3.4 App Router on
vinext 1.0.0-beta.5 / Vite 8 + workerd (wrangler 4.92, @cloudflare/vite-plugin 1.37.1,
vendored sites-vite-plugin — closeBundle copies hosting.json + drizzle into dist/.openai,
does NOT emit wrangler.json), Python 3.14 build prep (both scripts gzip-deterministic),
pnpm 11.25.0 via corepack, Node 24 (.nvmrc 22). No test runner today — verify-*.mjs node
scripts are the unit tier; Playwright is the new e2e tier. Conventions: one-line dense
files, hand-rolled validation (zod only in scripts/), Romanian user-facing strings,
`env` from 'cloudflare:workers' (typed via cloudflare-env.d.ts), one `source_cache`/
`source_budget` schema pair.

**Deploy seam RESOLVED (Advocate D3 MEDIUM→verified)**: dispatched a read-only
investigation run (build + dump + dry-run; NO source edits) — `corepack pnpm build`
(18s) emits `dist/server/wrangler.json` (name site-creator-vinext-starter, main
index.js, compatibility_date 2026-05-15, d1 placeholder uuid, triggers {}, assets
../client, no_bundle true). A patched copy in the same dir (name→aflivra, fake
database_id, triggers.crons[2]) passed `wrangler deploy --dry-run --config` exit 0
(6,838 assets, 80 modules). Patch surface frozen: name, database_name, database_id,
triggers.crons (full list every deploy). `d1 migrations apply` has NO --migrations-dir
flag in wrangler 4.92 → guarded `d1 execute` chosen (sqlite_master existence check),
matching the Advocate's parenthetical fallback.

**Two build gotchas found**: (1) every build rewrites `lib/live/seed-snapshots.json`
(2 bytes gzip-header entropy inside gzipBase64 — semantically identical): deploy.mjs
and db-migrate.mjs must snapshot+restore; CI note added; (2) root `next-env.d.ts`
generated untracked → .gitignore task added.

**Refresh sweep design RESOLVED (Advocate D1/D2)**: mechanism = `readSource(loader,
{waitForRefresh:true})` — no bypass; budgets anaf 120/h, legislation 120/h, courts
60/h, ckan 500/h, open-meteo 400/h stay enforced; per-source failures caught inside
readSource (isolation free); 03:00-Bucharest force-expire makes the 00:00–00:28 UTC
window exactly the morning revalidation. GROUP MAP frozen in plan: 5 groups
(live 33, weather 29, news 35, legislation 33, registers 31 subrequests — each ≤ 50
free cap, 5 crons = account cap) at crons 0/7/14/21/28 `0 * * * *` UTC (~03:00–03:28
EEST). Heavy CPU families stay on seeds (GTFS, SIRUTA, films, XLSX directories, law
full-text consolidation) — surfaced by the status endpoint. Ttl≤600/query-keyed
sources excluded (realtime ttl 30, courts ttl 300).

**Status storage — zero new schema (open question closed by evidence)**: sweep summary
rows `sweep:group:<name>` in the existing source_cache (precedent: law-tracked:v1:*,
court-reference:v1:*, payload:* already store arbitrary JSON there); status endpoint =
5-row key-range SELECT + module map — well under the 50-subrequest cap.

**Tests**: TDD vehicle for the sweep is scripts/verify-cache.mjs's harness (in-memory
ts.transpileModule + import rewrites cloudflare:workers→globalThis, node:sqlite fake D1
with the real drizzle SQL).

**Pre-existing ts error fix**: `hooks/use-mobile.ts` at REPO ROOT (tsconfig `@/*`→`./*`;
no hooks/ dir exists; shadcn useIsMobile), assigned T1.1.

**PWA audit**: manifest already compliant except maskable purpose; layout needs
apple-touch-icon (reuse icon-192.png), viewport themeColor export, mobile-web-app-capable
meta, manifest ?v=2 cache-bust; attribution anchors need target=_blank (public-map.tsx,
v2-charts.tsx).

**Specialists recommended (see PLAN Specialists section)**: DevOps, Database, Security,
API, UI/UX, Performance (empirical fold into T3.2). Dropped with reason: Migration
(covered by Database), Content (covered by Scribe team role — same files).

**Coordination decisions**: wave model with zero file overlap inside a wave
(W1: use-mobile | refresh-sweep+groups+verify | refresh routes+env | PWA | deploy+migrate
+package/gitignore; W2: scheduled handler | README | Playwright | CI | security pass |
database review | api advisory | uiux audit; W3: local integration verification, then
production deploy at handoff with USER's wrangler login). package.json ownership:
W1-T1.5 (scripts) then W2-T2.3 (test:e2e + devDep). Route files owned by T1.3→T2.5.
Waves: 3. Complexity Score: 14 (6 specialists + 2 cross-layer + 3 waves + 3 deps).

**Open risks the plan now carries**:
1. Group subrequest counts are ESTIMATES (7-11/loader from the readSource protocol);
   empirical measurement at T3.2 via Workers Logs per Advocacy D1 — mitigated by
   ~15-20 unit headroom per group and data-only rebalance.
2. Free-plan 10ms CPU per cron invocation — group parses are light by construction but
   only measured live; a group over limit splits by editing refresh-groups.json.
3. seed-snapshots.json churn (2 bytes/build) — handled in deploy/migrate scripts; CI must
   do the same if it ever runs build.
4. Local D1 keying assumption (placeholder-id DB shared by vite dev :5173 and pnpm start
   :8787) — verified as task T2.6's acceptance test; if wrong, db-migrate gets a second
   config path (bounded fix).
5. vinext-beta dev server under Playwright — mitigated by reuseExistingServer + generous
   timeouts + documented `pnpm start` variant (Advocate D5).
6. `wrangler d1 execute --file` behavior with the drizzle statement-breakpoint comment —
   verified in T2.6; fallback is statement-by-statement execution.

- [Architect] done: evidence pass complete, PLAN.md task graph waves 1–3 written,
  specialists finalized, complexity score 14. Key output for the orchestrator: launch
  Wave 1 (5 parallel dispatches, zero file overlap).

### Builder-A start — T1.2 (refresh sweep module + group map)
- [builder-A] starting T1.2: TDD-first — scripts/verify-refresh-sweep.mjs (RED) → lib/live/refresh-groups.json + lib/live/refresh-sweep.ts (GREEN). Studying lib/live substrate first.

### Builder-B start — T1.1 + T1.3 + T1.4 (Wave 1 parallel dispatch)
- [builder-B] starting T1.1 first (pre-existing tsc error: components/ui/sidebar.tsx:8 imports missing '@/hooks/use-mobile'; tsconfig maps '@/*'→repo root). Then T1.4 (PWA audit+complete), T1.3 last (refresh routes — delays until Builder-A's lib/live/refresh-sweep.ts lands, per the refreshSweep(env,ctx,source) contract).
- [builder-B] evidence read: exemplar routes app/api/{live,catalog,legal}/route.ts (dense one-liners, Response.json + no-store, {error:'...'} Romanian bodies, hand-rolled validation); D1 key-range SELECT precedent lib/live/legal-registry.ts:12; no X-Request-Id convention exists in app/ (routes will not invent one); no auth/Bearer precedent (first gated routes); cache-bust precedent for asset links exists (app/source-packages.tsx '?v=35' → manifest '?v=2' matches codebase pattern).
- [builder-B] T1.1 DONE: hooks/use-mobile.ts created at repo root ('use client', useState<boolean|undefined> + useEffect matchMedia('(max-width: 767px)') listener per dispatch, returns !!isMobile, dense one-line style matching app/* conventions). Verification: `corepack pnpm exec tsc --noEmit` → exit 0, ZERO errors (pre-existing sidebar.tsx:8 export error resolved; also proves later files type-check against the same strict config).
- [builder-B] starting T1.4 (PWA audit + complete). Audit facts: layout.tsx already has manifest link, appleWebApp{capable,title,statusBarStyle}, icons{icon,shortcut} — missing: apple-touch-icon icon, mobile-web-app-capable meta, viewport themeColor export, manifest cache-bust. manifest.webmanifest already has id/name/short_name/description/lang/start_url='/'/scope='/'/display:standalone/background/theme — missing: maskable purpose on icons (PLAN freezes 'any'→'any maskable'). External-anchor audit: ONLY non-compliant anchor in the app is the OSM attribution HTML string in app/public-map.tsx:9 (Leaflet attribution, no target) — v2-charts.tsx Natural Earth anchor (line 29) ALREADY carries target="_blank" rel="noreferrer"; courts-workspace.tsx, transit-workspace.tsx, live-data.tsx, places-workspace.tsx anchors all compliant.
- [builder-B] T1.4 implementation DONE (layout + manifest + anchor): app/layout.tsx gained `export const viewport: Viewport = {themeColor:'#0071e3', width:'device-width', initialScale:1}` (Next 16 themeColor export), icons.apple='/apple-touch-icon.png', manifest='/manifest.webmanifest?v=2' (cache-bust justified: codebase already busts asset links, e.g. app/source-packages.tsx '?v=35'), metadata.other={'mobile-web-app-capable':'yes'}; appleWebApp stayed (it renders the apple-* metas incl. apple-mobile-web-app-status-bar-style). public/manifest.webmanifest: both icons purpose 'any' → 'any maskable' (PLAN-frozen), single-line JSON preserved. app/public-map.tsx:9 OSM attribution anchor gained target="_blank" rel="noreferrer" (only non-compliant external anchor in the app — iOS standalone shell must never navigate away; Leaflet attribution is an HTML string, JSX anchors already compliant incl. v2-charts.tsx:29 Natural Earth which needed NO change). apple-touch-icon: generated with one-off sharp command (documented, not saved as script — 3 lines): `node -e` require .pnpm/sharp@0.35.4 → sharp('public/icon-512.png').flatten({background:'#f5f5f7'}).resize(180,180,{fit:'cover',kernel:'lanczos3'}).png({compressionLevel:9}).toFile('public/apple-touch-icon.png')` — source icon-512.png HAS alpha (4ch), so flattened onto the manifest background_color #f5f5f7 (Apple masks transparent icons poorly). Result: 180×180, 3ch, NO alpha, 11259 bytes (verified by re-reading metadata).
- [builder-B] T1.4 static verification: `corepack pnpm exec tsc --noEmit` → exit 0 (clean). ⚠️ `corepack pnpm lint` FAILS PRE-EXISTING: package.json defines `eslint . --ignore-pattern dist --ignore-pattern .next` but the repo has NEVER tracked any eslint config (no .eslintrc*, no eslint.config.*; ESLint 9.39.4 exits 2 'couldn't find an eslint.config file'; git ls-files confirms none ever committed since import 4434877). NOT caused by my edits; outside my file allowlist to fix (eslint.config.* not writable for me). ORCHESTRATOR/T2.4 NOTE: CI's planned `corepack pnpm lint` step will fail unless the config gap is fixed by its owner.
- [builder-B] starting T1.3 (refresh API routes + env typing). Substrate first: cloudflare-env.d.ts REFRESH_TOKEN?: string + .dev.vars local dev value. Value decision: REFRESH_TOKEN=dev-refresh-token in .dev.vars (matches PLAN T1.3's verbatim verify command + T2.2 README sample + T2.5 .dev.vars.example + T2.3 e2e spec 8; dispatch's 'e.g. aflivra-local-dev' was illustrative — choosing the PLAN-frozen token keeps the whole pipeline coherent).

### DevOps — T1.5 (deploy + migrate scripts + package wiring)
- [devops] starting T1.5: ground-truth build first, then scripts/deploy.mjs (patch-assert-deploy) + scripts/db-migrate.mjs (guarded local/remote D1 migrate) + package.json scripts (deploy / db:migrate:local / db:migrate:prod). Pre-flight facts verified: vite.config.ts localBindingConfig (dev) AND dist/server/wrangler.json (build) both key local D1 on placeholder id 00000000-0000-4000-8000-000000000000 (binding DB, database_name site-creator-d1, persistence .wrangler/state/v3); drizzle/0000_thin_demogoblin.sql = 2 CREATE TABLE (source_budget, source_cache) split by a `--> statement-breakpoint` line; port 5173 currently free; wrangler 4.92 bin at node_modules/wrangler/bin/wrangler.js.
- [builder-A] substrate study done: readSource({waitForRefresh:true}) refreshes inline (cache.ts:61); budgets anaf120/open-meteo400/legislation120/courts60/ckan500 (43-47); night force-expire ≥03:00 Bucharest (38); loader keys pinned: bnr, weather, weather-alerts, forecast:44.43:26.1 (defaultCity 44.4268/26.1025 rounded, matches /api/weather first load), company:427282, catalog:v2:::0 + catalog:v2:bani::0 + catalog:v2:sanatate::0, feed:{munca,stiri,sanatate,educatie,justitie} + afirLoader feed:agricultura, law:search.v5:{blank + codcivil}, lawyers hash, knowledge-company:427282, directory:schools::0, events:odeon, cinema:1824:<today> (Park Lake default from app/api/cinema/route.ts). law-tracked:v1 INSERT..ON CONFLICT precedent read (legal-registry.ts:9). Verify harness pattern: verify-cache (sqlite fake D1 + globalThis env + seed rewrites) + verify-live (full lib/live transpile closure + xlsx/fflate require.resolve + JSON inlines).
- [devops] GROUND-TRUTH BUILD DONE: `corepack pnpm build` exit 0, 19.9s wall (matches Architect's 18s). dist/server/wrangler.json verbatim (single-line JSON): name "site-creator-vinext-starter", main "index.js", compatibility_date "2026-05-15", compatibility_flags ["nodejs_compat"], d1_databases [{binding "DB", database_name "site-creator-d1", database_id "00000000-0000-4000-8000-000000000000"}], triggers {}, assets {binding "ASSETS", directory "../client"}, no_bundle true (+ inert keys topLevelName/dev/vars/rules/build/observability left untouched). Assertions in deploy.mjs hard-code exactly this frozen shape.
- [devops] SEED-SNAPSHOTS CHURN QUIRK REPRODUCED + RESTORED: the build rewrote lib/live/seed-snapshots.json — git diff = 1 line, the ONLY semantic delta is gzipHeader FLG byte inside gzipBase64 ("H4sIAAAAAAACA" → "H4sIAAAC/") — raw bytes/sha256/length identical. Restored with `git checkout -- lib/live/seed-snapshots.json` → clean. ⚠️ WAVE-2 CI TASK (T2.4) MUST REPLICATE: any CI step running `corepack pnpm build` must restore lib/live/seed-snapshots.json afterwards or the tree is dirty. deploy.mjs/db-migrate.mjs do NOT build (they require build output present; fail with exit≠0 otherwise) so the restore stays a build-side concern.
- [builder-B] T1.4 DEV-SERVER VERIFICATION (corepack pnpm dev on :5173, PID 61023, boot ~10s): GET /manifest.webmanifest → HTTP 200, Content-Type application/manifest+json, valid JSON with both icons purpose 'any maskable' ✓; GET / head contains <link rel="manifest" href="/manifest.webmanifest?v=2"/> + <link rel="apple-touch-icon" href="/apple-touch-icon.png"/> + <meta name="theme-color" content="#0071e3"/> + <meta name="mobile-web-app-capable" content="yes"/> + <meta name="apple-mobile-web-app-capable" content="yes"/> + <meta name="apple-mobile-web-app-status-bar-style" content="default"/> (note: Next 16.3.4 appleWebApp{capable} does NOT emit apple-mobile-web-app-capable — only title+status-bar-style — so the legacy spelling was added via metadata.other per the fill-if-absent list; modern spelling also present) ✓; GET /apple-touch-icon.png → HTTP 200, image/png, 11259 bytes ✓. occurrence counts: apple-touch-icon ×5, mobile-web-app-capable ×5 (incl. apple- spelling ×3), theme-color ×2, manifest?v=2 ×3.
- [builder-B] T1.3 implementation drafted: app/api/refresh/route.ts (POST only; Bearer gate env.REFRESH_TOKEN — unset token ⇒ always 401 'Acces interzis.'; ?source=<group> → 404 Romanian error listing valid groups when unknown [dispatch-mandated 404 vs PLAN's earlier 400 — flagged for T2.7]; no source → refreshSweep(env,ctx,undefined) all-groups sequential; ctx = liveContext() ambient from the worker's withLiveContext wrap, with a rejecting-sink fallback; 200 pass-through of the sweep summary JSON; module-level failure → 503 Romanian + console.warn JSON event, no token/secret logged) + app/api/refresh/status/route.ts (GET only; same Bearer gate; key-range SELECT 'sweep:group:'..'sweep:group;' per legal-registry.ts:12 pattern; corrupt-row skip with business-rule comment; response {groups:[{name,cron,seedBacked,lastSweepAt,perSource:[{key,status,lastSuccessAt}]}],servedAt}; lastSweepAt := row startedAt; empty/unmigrated D1 degrades to 200 with lastSweepAt:null + perSource:[]). Group map sourced from lib/live/refresh-groups.json directly (the frozen single-source-of-truth file deploy.mjs and the sweep module both read — avoids guessing in-flight module exports beyond the documented refreshSweep; noted for T2.7's 'names from the module' review point). .dev.vars created (REFRESH_TOKEN=dev-refresh-token) — verified GITIGNORED (git status clean of it; git check-ignore -v .dev.vars → .gitignore:8, plus .dev.vars.* at :9).
- [devops] FILES IMPLEMENTED: scripts/deploy.mjs (patch-assert-deploy: asserts the frozen dist/server/wrangler.json shape — name/main/compatibility_date/compatibility_flags/triggers{}/assets{ASSETS,../client}/no_bundle/d1 binding DB+database_name+PLACEHOLDER database_id — exit 1 naming the key on any drift, never silently deploys; patches a COPY dist/server/wrangler.deploy.json same-dir: name→aflivra, database_name→aflivra, database_id→resolved(AFLIVRA_D1_DATABASE_ID | --database-id | wrangler d1 list match 'aflivra'), triggers.crons→full list from lib/live/refresh-groups.json; ≤5 groups + cron-per-group + non-empty + valid contract enforced), scripts/db-migrate.mjs (guarded migrate, exports resolveDatabaseId/migrateLocal/migrateRemote/runWrangler to deploy.mjs; --local default via DB binding + --config dist/server/wrangler.json + --persist-to .wrangler/state = SAME placeholder-id miniflare DB the dev servers use; --remote resolves id like deploy.mjs else exits 1 with the runbook line; guard = sqlite_master SELECT for source_cache+source_budget, apply only missing → whole-file --file when both missing / per-statement --command on partial; spawns node node_modules/wrangler/bin/wrangler.js with WRANGLER_SEND_METRICS/WRANGLER_WRITE_LOGS=false). EMPIRICAL: `wrangler d1 execute --file` with the RAW drizzle file incl. `--> statement-breakpoint` WORKS (exit 0, 2 result sets — wrangler 4.92 splits correctly; marker is a `--` comment to SQLite) → migrate uses --file for the both-missing case; naive re-apply proven to error "table source_budget already exists" → guard REQUIRED. package.json scripts added: deploy / db:migrate:local / db:migrate:prod (scripts block only, deps untouched).
- [devops] VERIFY (b) node scripts/deploy.mjs --dry-run → EXIT 0. Printed plan: name "site-creator-vinext-starter"→"aflivra", database_name "site-creator-d1"→"aflivra", database_id ⚠️ PLACEHOLDER NEREZOLVAT (neautentificat — expected, no wrangler login allowed this wave), triggers.crons ⚠️ LIPSĂ (refresh-groups.json încă nelansat de T1.2 — dry-run reports + exit 0 per contract; non-dry-run would exit 1). Copy dist/server/wrangler.deploy.json written + content verified: {"name":"aflivra","db":{"binding":"DB","database_name":"aflivra","database_id":"00000000-0000-4000-8000-000000000000"},"triggers":{}, assets/main/no_bundle unchanged}. Will re-run dry-run at completion if refresh-groups.json lands (to exercise the full crons + wrangler deploy --dry-run validation path).
- [devops] VERIFY (c) node scripts/db-migrate.mjs --local ×2 → RUN 1 EXIT 0: guard found 0 tables → applied drizzle/0000_thin_demogoblin.sql via --file (wrangler: "🚣 2 commands executed successfully" on "local database DB (00000000-0000-4000-8000-000000000000) from .wrangler/state/v3/d1") → re-guard OK. RUN 2 EXIT 0: "Migrația … este deja aplicată — nimic de făcut. Tabele: source_budget, source_cache." → IDEMPOTENCY PROVEN (second run is a clean no-op). Pre-check proved the SAME sqlite file (faaf2b04…) the dev server creates is addressed — no second miniflare hash file appeared when querying via the dist config.
- [builder-A] RED: scripts/verify-refresh-sweep.mjs written FIRST and run → exit 1, ENOENT lib/live/refresh-groups.json (module missing — the failing state). Test asserts: 5 groups/≤5 crons unique bidirectional, member lists = frozen table, estimatedSubrequests ≤40 per group, all 20 tokens resolve via memberLoader with pinned exact source keys, unknown token throws at import (broken-variant import), mocked-fetch runGroup(weather) end-to-end with one 503×3 loader isolated, open-meteo budget row + 3-attempt retry cap, cached/budget-exhaustion second sweep, summary row sweep:group:weather with adapter_version sweep.groups.v1 + per-source {key,name,status,lastSuccessAt,error}, refreshSweep by name (ctx) and by cron (no ctx), unknown cron/group/trigger no-op + JSON warn events, groupForCron deterministic.
- [builder-A] GREEN: node scripts/verify-refresh-sweep.mjs → exit 0. Implementation: lib/live/refresh-groups.json (5 groups crons 0/7/14/21/28 0 * * *, estimates 33/29/35/33/31 ≤ 40, 21 member tokens, seedBacked×9 + onDemand×8 with Romanian reasons) + lib/live/refresh-sweep.ts (memberLoader registry with app-own defaults: companyLoader() CUI 427282, catalogLoader() page 0, forecastLoader(defaultCity 44.4268/26.1025 → forecast:44.43:26.1), lawLoader blank + codeTopics[0], lawyerLoader (,0,recent), knowledgeLoader 427282, directoryLoader schools page 0, cinemaLoader 1824 <today ISO>, feedLoader×5 + afirLoader; import-time unknown-token guard; runGroup sequential readSource {waitForRefresh:true} with per-source isolation; summary row sweep:group:<name> in source_cache, adapter_version sweep.groups.v1, INSERT..ON CONFLICT per law-tracked:v1 precedent; runSweep/groupForCron/listGroups/listSeedBacked/listOnDemand; refreshSweep(env,ctx,name-or-cron) with withLiveContext when ctx.waitUntil). Debug iterations (all caught by the test itself): ()= typo in listGroups; 21-vs-20 member count; catalog-metadata in transpile closure; 2 colon typos in my own pinned key constants — actual derivations were correct.

### Builder-A — T1.2 complete (refresh sweep module + group map)

- [builder-A] Files (mine only): lib/live/refresh-sweep.ts (new), lib/live/refresh-groups.json (new), scripts/verify-refresh-sweep.mjs (new). No other production file touched (other modified/untracked files in the worktree belong to parallel T1.1/T1.3/T1.4/T1.5 builders).

TDD evidence:
- RED: scripts/verify-refresh-sweep.mjs written first → exit 1 (ENOENT lib/live/refresh-groups.json — module missing, the intended failing state).
- GREEN: implemented refresh-groups.json + refresh-sweep.ts → node scripts/verify-refresh-sweep.mjs → exit 0. Debug iterations before green, each caught by the test itself: listGroups arrow typo; member count 21 (frozen table is 4+4+5+4+4, my constant said 20); catalog-metadata missing from transpile closure (imports @/public/catalog/audit.json); two colon typos in my pinned key constants (catalog:v2:bani::0, directory:schools::0 — the implementation derivations were correct, the test constants were wrong).
- REFACTOR: refreshSweep param renamed sweepEnv (was shadowing the imported env binding); nullish-tolerant env signature; type-alias cleanup. Re-ran: exit 0.

Verification (commands run this turn):
```
node scripts/verify-refresh-sweep.mjs → exit 0
  Mocked sweep verified: an isolated 503 source stays recorded without blocking its group, the open-meteo hourly budget caps further calls, and the sweep summary row lands in source_cache with per-source statuses.
  {"result":"ok","groups":5,"members":21,"swept":"weather",...,"adapterVersion":"sweep.groups.v1",...}
node scripts/verify-cache.mjs → exit 0 (no regression)
node scripts/verify-live.mjs → exit 0 (no regression)
corepack pnpm exec tsc --noEmit → clean (whole tree; the T1.1 sidebar fix has landed)
```

Design notes for downstream waves (T1.3/T2.1/T2.2/T1.5):
- SweepResult result field is named `sources` (frozen PLAN contract: summary row `sweep:group:<name>` data {group,cron,startedAt,finishedAt,sources:[{key,name,status,lastSuccessAt,error}],ok,failed}); the dispatch prompt described the array as "perSource[]" — followed the frozen contract T1.3/T2.1 build against. ok=fresh+cached, failed=stale+unavailable.
- API surface: refreshSweep(sweepEnv,ctx,nameOrCron) [handler entry; env.DB is the explicit summary-write target, ctx.waitUntil wraps withLiveContext], runSweep(cron) / runGroup(name[,db]) [module-env default — identical binding in production], groupForCron(cron) [deterministic, null when unknown], listGroups() / listSeedBacked() / listOnDemand() [status endpoint data], memberLoader(token) [registry accessor, throws /necunoscut/ on unknown — module also self-validates all JSON tokens at import].
- refresh-groups.json is the single source of truth: {groups:[{name,cron,estimatedSubrequests,members}],seedBacked:[{family,reason}],onDemand:[{family,reason}]} — deploy.mjs (T1.5) reads groups[].cron for triggers.crons (all 5, always); README cron table (T2.2) uses the same file; reasons are Romanian (user-facing via /api/refresh/status).
- Cron staggering 0/7/14/21/28 min past 00:00 UTC = 03:00–03:28 EEST; night force-expire (cache.ts:38, ≥03:00 Bucharest) makes every prior-day row refresh on first read, so the sweep sits exactly in the revalidation window.
- Budgets untouched by the sweep (readSource enforces anaf 120/h, open-meteo 400/h, legislation 120/h, courts 60/h, ckan 500/h): proven in-test — preloading open-meteo budget to 400 caps further upstream calls, statuses stay valid (cached), error carries "Limita temporară".

Self-review (4 lenses):
- Completeness: all 5 prompt assertions (a–e) + PLAN T1.2 (a–g) implemented and asserted; no stubs, no TODOs; unknown-token import guard, summary-row write failure path (best-effort + warn event) present.
- Quality: dense one-line house style; comments only for business rules (free-plan subrequest ceiling + seed-backed heavy families, per-source isolation); Romanian user-facing strings, English identifiers; summary write follows the law-tracked:v1 INSERT..ON CONFLICT precedent; ZERO new tables/columns.
- Discipline: TDD order honored (verify ran RED before implementation existed); scope kept to the 3 new files + STATUS; no gold-plating (listSeedBacked/listOnDemand are one-liner accessors for the documented T1.3 status endpoint consumer).
- Testing: the battery exercises real transpiled app code against real drizzle SQL in node:sqlite with fetch mocked per-URL — one 503 source isolated, retry count exactly 3, budget cap, cached/fresh/stale/unavailable statuses, summary row shape, warn-event JSON, deterministic cron mapping, both refreshSweep dispatch modes.

Status: DONE — T1.2 complete: 3 files, verify exit 0, tsc clean, siblings unregressed.
- [devops] VERIFY (d) dev-server proof — PORT SHARE resolution: port 5173 was busy for 3+ min with a sibling Wave-1 agent's `corepack pnpm dev` server (PID 61023, cwd = THIS worktree, booted 10:36:28 BEFORE my migration applied — i.e. against a table-less local D1). Per dispatch wait-30s-and-retry was exercised (6×30s, still held). Because it is the exact same command, code, worktree and placeholder-id D1, I verified THROUGH it without disturbing it (not my server to kill; I booted none of my own — none left running): GET / → HTTP 200 (0.03s); GET /api/live → HTTP 200 (1.17s), body {bnr,weather,company,catalog,servedAt} all status 'stale' with data (valid fresh|cached|stale|unavailable semantics — seeds written as initial cache rows). KILLER CROSS-PROOF: source_cache=4 rows / source_budget=2 rows through the script's --config dist/server/wrangler.json --persist-to .wrangler/state path — rows the DEV SERVER wrote into the SAME sqlite my migrate created (it booted against 0 tables, so every row proves dev now writes through the migrated faaf2b04… DB). Local-keying assumption VERIFIED (T2.6's remaining half: pnpm start :8787 variant).
- [devops] VERIFY fail-loud + contract trip-wires (sandboxed under /tmp, real build output untouched): build-shape assertions exit 1 naming the key on name drift / database_id drift (pre-patched output) / triggers already non-empty; missing dist config → exit 1 "run corepack pnpm build first"; groups contract → exit 1 on 6 groups (free-plan cap), duplicate cron ("un cron = un singur grup"), malformed JSON (with file path). FULL HAPPY PATH in sandbox: map-form groups (array + object-map both supported) + AFLIVRA_D1_DATABASE_ID override → plan printed with resolved id, copy written with all 5 crons + overridden database_id, wrangler deploy --dry-run exit 0. db-migrate --remote without login → exit 1 with the full runbook line (wrangler login → d1 create aflivra). deploy WITHOUT --dry-run + unresolved D1 → exit 1 "nu deployim placeholder" (Advocate D3 satisfied).
- [devops] VERIFY (b) FINAL, real tree, after Builder-A's lib/live/refresh-groups.json landed (groups = array of {name,cron,estimatedSubrequests,members} + seedBacked + onDemand): `node scripts/deploy.mjs --dry-run` → EXIT 0, plan: name→aflivra, database_name site-creator-d1→aflivra, database_id ⚠️ PLACEHOLDER (neautentificat — expected this wave), triggers {} → ["0 0 * * *","7 0 * * *","14 0 * * *","21 0 * * *","28 0 * * *"] (live/weather/news/legislation/registers), then `wrangler deploy --dry-run --config dist/server/wrangler.deploy.json` PASSED on the REAL build: 80 modules attached, 6,839 assets read from dist/client, Total Upload 12268 KiB, bindings env.DB (aflivra) + env.ASSETS, exit 0. Both scripts re-passed `node --check`.
- [devops] T1.5 COMPLETE — handoff notes: (1) deploy.mjs intentionally does NOT auto-create D1 and does NOT build (requires dist/server/wrangler.json present, else exit 1 pointing at `corepack pnpm build`) — per dispatch spec; PLAN T1.5's older step-3 auto-create is superseded, T2.6 Database specialist owns resolve/create refinements if wanted; (2) remote migrate before deploy is shared from db-migrate.mjs (deploy.mjs imports migrateRemote — Requirement 2's "applies migration to remote D1" honored); (3) .gitignore += /next-env.d.ts was in PLAN T1.5's file list but .gitignore is OUTSIDE my write scope — next-env.d.ts still untracked/unignored, orchestrator to assign; (4) T2.4 CI: build якщо run must restore lib/live/seed-snapshots.json (see quirk entry above); (5) known leftover: sibling dev server PID 61023 on :5173 still up (theirs, untouched).

## DevOps Findings — T1.5 verification summary

| Check | Status | Details |
|-------|--------|---------|
| Ground-truth build | ✅ PASSED | corepack pnpm build exit 0, 19.9s; wrangler.json shape frozen + asserted |
| seed-snapshots churn | ✅ RESTORED | 2-byte gzip-header flip reproduced; git checkout restored; T2.4 must replicate |
| deploy.mjs --dry-run | ✅ PASSED | exit 0; plan printed; PLACEHOLDER marked; wrangler deploy --dry-run validated real build (80 modules / 6,839 assets / crons 5/5) |
| db-migrate --local ×2 | ✅ PASSED | run 1 applies via --file (2 commands OK); run 2 "deja aplicată" no-op — idempotent; 3rd run after dev traffic still no-op |
| Local D1 keying | ✅ PROVEN | dev server (vite, placeholder id) writes land in the same faaf2b04… sqlite the script migrates (4 cache + 2 budget rows) |
| Fail-loud gates | ✅ PASSED | build-shape drift / unresolved D1 / missing or invalid groups / cap / dup cron → exit 1 with named key + runbook |
| package.json | ✅ PASSED | deploy / db:migrate:local / db:migrate:prod added; JSON valid; deps untouched; no servers of mine left running |

**DevOps: PASSED — all T1.5 checks successful**
- [builder-B] T1.3 contract reconciliation (module landed): Builder-A's lib/live/refresh-sweep.ts exports refreshSweep(env:{DB?:D1Database}, ctx:{waitUntil}|null|undefined, groupNameOrCron: string) → SweepResult|null — group name is REQUIRED (no all-groups mode), ctx accepts undefined (module awaits inline). POST route rewritten to the real contract: ?source=<group> → refreshSweep(env,ctx,source); NO source → route loops all 5 groups SEQUENTIALLY (per-group try/catch isolation — one catastrophic group failure logs refresh_sweep_failure + degraded entry {group,cron,startedAt:null,ok:0,failed:0,sources:[]} and the loop continues); uniform envelope {groups:[SweepResult,...],servedAt} mirrors the status route's {groups:[...],servedAt} (stable for Playwright/T2.7; T2.3 spec 8 reads groups[0].sources). Status route matched the landed refresh-groups.json schema unchanged (groups[name,cron,estimatedSubrequests,members] / seedBacked[{family,reason}] / onDemand).
- [builder-B] T1.3 LIVE VERIFICATION (dev server :5173, .dev.vars token dev-refresh-token): POST /api/refresh?source=live NO token → HTTP 401 {"error":"Acces interzis."} ✓; wrong token → 401 same body ✓; GET /api/refresh/status no/wrong token → 401 ✓; GET /api/refresh (POST-only route) → HTTP 405 auto ✓; POST ?source=inexistent (dev token) → HTTP 404 {"error":"Grupul de surse „inexistent” nu există. Grupuri valide: live, weather, news, legislation, registers."} ✓; GET status (dev token) BEFORE any sweep → 200 {groups:[5×{name,cron,seedBacked(9),lastSweepAt:null,perSource:[]}],servedAt} — degrade path proven ✓; POST ?source=live (dev token) → HTTP 200, 37ms, group live 4/4 ok (bnr/weather/company:427282/catalog:v2:::0 all 'cached') ✓; GET status AFTER → live.lastSweepAt=2026-10-06T07:44:59.489Z + perSource populated (sweep:group:live row round trip: POST trigger → module row write → status key-range read) ✓; POST no-source MANUAL FULL TRIGGER → HTTP 200, 22.5s, ALL 5 groups sequential, 21/21 sources ok (17 fresh + 4 cached — real network refreshes ran) ✓. `corepack pnpm exec tsc --noEmit` → exit 0 against the REAL module (contract check). Dev server killed (PIDs 61006/61023 dead, port released).
- [builder-B] NOTES FOR T2.5/T2.7 (review owners, deliberate shape decisions): (1) unknown ?source → 404 per Builder-B dispatch (PLAN said 400 — one-line change if API review rules otherwise); (2) seedBacked repeated per group entry per the twice-frozen shape (dispatch + PLAN both nest it in the group object) — hoistable to top level if T2.7 prefers; (3) group map read from lib/live/refresh-groups.json (the single source of truth deploy.mjs + the module also read), NOT from module exports beyond refreshSweep — satisfies 'names not duplicated' via the shared data file; (4) Bearer compare is plain string equality — constant-time compare is T2.5's bounded-edit decision per PLAN; (5) POST response envelope {groups:[...],servedAt} (uniform for ?source= and full trigger).
- [builder-B] FINAL STATE: files touched (exactly the allowlist): hooks/use-mobile.ts (new), app/api/refresh/route.ts (new), app/api/refresh/status/route.ts (new), cloudflare-env.d.ts (+REFRESH_TOKEN?: string), .dev.vars (new, GITIGNORED — git status clean of it, check-ignore OK), app/layout.tsx (viewport themeColor + icons.apple + manifest ?v=2 + mobile-web-app-capable/apple-mobile-web-app-capable metas), public/manifest.webmanifest (any maskable ×2), public/apple-touch-icon.png (new, 180×180 opaque), app/public-map.tsx (OSM attribution target="_blank" — justified PWA edit); app/v2-charts.tsx read+audited, NO edit needed (already compliant). Final `corepack pnpm exec tsc --noEmit` → exit 0. Known pre-existing gap (not mine, outside allowlist): `corepack pnpm lint` exits 2 — eslint 9 finds no eslint.config.* and none was ever tracked in git since import 4434877; T2.4 CI step 'corepack pnpm lint' will fail until its owner adds a config. Self-review (4 lenses): Completeness — all three sub-tasks implemented+verified, no stubs/TODOs; Quality — house style (dense one-liners, Romanian errors, no-store, hand-rolled validation, business-rule comment only), no secrets in logs; Discipline — allowlist respected incl. read-before-edit justification for public-map.tsx and justified no-edit for v2-charts.tsx, no gold-plating (ctx sink dropped after the module's real signature made it unnecessary); Testing — every branch proven with real HTTP codes captured above.
- [builder-B] Builder-B: T1.1+T1.3+T1.4 DONE.

### Wave 1 COMPLETE (orchestrator summary)
- T1.1 DONE — hooks/use-mobile.ts; tsc --noEmit exit 0 (pre-existing export error fixed)
- T1.2 DONE — refresh-sweep + refresh-groups.json (5 groups, crons 0/7/14/21/28 0 * * * UTC, 9 seedBacked, 8 onDemand) + verify-refresh-sweep.mjs; RED→GREEN→REFACTOR; verify exit 0; verify-cache/verify-live regression green
- T1.3 DONE — /api/refresh + /api/refresh/status, Bearer-gated (Romanian error bodies); live: 401×4, 405, 404 unknown group, 200 single-group, 200 status, 200 FULL trigger 22.5s/5 groups/21 sources (17 fresh); .dev.vars gitignored verified
- T1.4 DONE — apple-touch-icon 180 opaque, layout head tags verified live, OSM anchor fix; manifest + icon 200
- T1.5 DONE — deploy.mjs (dry-run exit 0; wrangler dry-run: 80 modules/6,839 assets/5 crons), db-migrate.mjs (idempotent ×2 proven; 4 cache + 2 budget rows through dev), package scripts
- OPEN ITEMS routed to Wave 2: pnpm lint broken (no eslint config ever tracked — T2.4 owns), /next-env.d.ts needs gitignore entry (T2.4), 404-vs-400 ruling (T2.7), constant-time compare (T2.5), pnpm start :8787 local-keying proof (T2.6)
