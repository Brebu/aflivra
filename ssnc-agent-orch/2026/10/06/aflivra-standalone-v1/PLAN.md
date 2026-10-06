# Implementation Plan

## Feature
Aflivra v1 — Standalone Cloudflare Deploy + Data Cron + PWA (+ Playwright)

## Goal
Turn the ChatGPT Sites archive export (rev 35) into a self-standing product: a git repo
that runs locally, deploys on the user's own Cloudflare account (free workers.dev URL),
refreshes all live source families daily at 03:00 Europe/Bucharest, and installs as a PWA
on web/iOS/Android — with a Playwright E2E suite over the critical flows.

## Requirements
(From approved DESIGN.md — source of truth; see also `..`/DESIGN.md in this directory.)

1. **Bootstrap repo** — ✅ EXECUTED INLINE 2026-10-06 (user directive: push the code now):
   extraction of all 8 archives into repo root DONE; SHA-256 integrity verified against
   `Aflivra_Pachete.csv` (9/9 byte-exact; only the 4 older PDF guides are absent, as
   shipped); `git init -b main` + `feat/aflivra-v1-standalone` branch (no direct commits
   to main, per house rules); `.gitignore` (`node_modules/`, `.sites-runtime/`,
   `.wrangler/`, `dist/`, `.next/`, `*.tsbuildinfo`, `.env*`, `.dev.vars`,
   `.playwright-mcp/`, `archives/`, `public/downloads/Aflivra_*.zip`, `playwright-report/`,
   `test-results/`, `.DS_Store`); `.nvmrc` = `22`; originals relocated to `archives/`
   (regenerable via `scripts/package-source.py`, out of git per DESIGN); README gained a
   „Rulare locală rapidă (macOS/Linux)" section (corepack install, NOT `install:ci`).
   `corepack pnpm install` runs detached; verification evidence recorded in STATUS.md.
   DISCOVERY: the export already ships `public/manifest.webmanifest`, `icon-192.png`,
   `icon-512.png`, `sw.js`, `offline.html` — PWA base exists (see Req 5).
2. **Cloudflare deploy** (Advocate D3 adopted — patch set completed): `scripts/deploy.mjs`
   patches the generated `dist/server/wrangler.json` post-build with (a) real `database_id`
   (export carries a placeholder UUID), (b) worker `name` → `aflivra` (package name today
   is `site-creator-vinext-starter`), (c) `triggers.crons` (a deploy replaces the whole
   cron list) — asserting each expected key exists and exiting non-zero otherwise instead
   of silently deploying placeholders; applies `drizzle/0000_thin_demogoblin.sql` to remote
   D1; runs `wrangler deploy`. New package scripts `deploy`, `db:migrate:local`,
   `db:migrate:prod`. Target URL: `aflivra.<user-subdomain>.workers.dev` (free).
3. **Cron data sweep** (Advocate D2 adopted — UTC fix; D1 PENDING user decision):
   cron expression `0 0 * * *` UTC = 03:00 Europe/Bucharest summer (EEST) / 02:00 winter
   (EET) — always deep night, ±1h DST drift documented (the original `0 3 * * *` intent
   meant 06:00 Bucharest in summer — factually wrong). SWEEP SHAPE RESOLVED (user decision
   D1, 2026-10-06): **FREE-plan grouped sweep** — `lib/live/refresh-sweep.ts` defines named
   groups sized ≤ ~40 subrequests each (e.g. legislation / fast sources / registers /
   catalog), `scripts/deploy.mjs` maps groups to up to 5 cron expressions around 00:00–00:30
   UTC (= 03:00+ Bucharest summer), heavy families stay on bundled seeds (surfaced as such
   in `/api/refresh/status`); upgrading to a single full sweep later on Workers Paid is a
   group-map change only. `lib/live/refresh-sweep.ts` must be group-aware from day one;
   per-family try/catch isolation; existing hourly budgets/backoff stay enforced; results
   into existing `source_cache`/`source_budget` tables — no new schema.
4. **Manual trigger + status API** (Advocate D4 adopted): `POST /api/refresh` (optional
   `?source=<family>`) AND `GET /api/refresh/status` both gated by
   `Authorization: Bearer $REFRESH_TOKEN` (status publishes source health on a public URL —
   must not be open); local dev value lives in `.dev.vars` (gitignored — note plain `.env*`
   does NOT match it), production via `wrangler secret put REFRESH_TOKEN`. Structured
   per-source logs (name, status, `lastSuccessAt`).
5. **PWA** (Advocate D6 adopted + bootstrap discovery): the export ALREADY ships
   `public/manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `sw.js`, `offline.html` —
   Phase 4 is AUDIT + COMPLETE, not create: verify manifest fields (name, display, start_url,
   scope on workers.dev), add what's missing (`apple-touch-icon` 180×180,
   `mobile-web-app-capable` meta in `app/layout.tsx`, maskable icon variants if absent,
   manifest cache-busting), verify `target="_blank"` on external links.
6. **Playwright** (Advocate D5 adopted): `playwright.config.ts` with
   `webServer: {command: 'pnpm dev', url: 'http://127.0.0.1:5173', timeout: >=120_000
   (vinext/workerd cold start), reuseExistingServer: !process.env.CI}`; generous per-test
   timeouts (loaders budget 6-18s); local cron E2E can hit `/cdn-cgi/handler/scheduled`
   exposed by the Cloudflare Vite plugin. Specs in `e2e/` for the seven flows (home smoke;
   explore → place → lightbox → bookmark → Saved; catalog filter+pagination+geo; places
   workspace; legal workspace + consolidated reader + exports; transit graceful
   degradation; compare/planner + standalone `/catalog`). Assertions on `data-view`,
   Romanian labels, and `fresh|cached|stale|unavailable` statuses.
7. **GitHub remote** (added 2026-10-06 by user directive — PAT provided out-of-band,
   stored transiently outside the repo, rotation advised): private repo
   `Brebu/aflivra` created with auto-init `main` (PR base), branch
   `feat/aflivra-v1-standalone` pushed, PR opened with verification evidence. Commit
   trailer format enforced by the AI-attribution guard (Co-authored-by, harness format).

## Advocate Review
Status: Completed (2026-10-06) — all decision points resolved by user
Key decisions incorporated: D1 free-plan grouped sweep (≤5 crons, ≤~40 subrequests/group,
heavy families on bundled seeds); D2 UTC `0 0 * * *`-based crons (03:00+ Bucharest summer,
±1h DST drift documented); D3 deploy patch set (name + database_id + triggers.crons +
assert-or-fail, patched copy never overwrites build output; seam now VERIFIED by a real
build + `wrangler deploy --dry-run` exit 0 — see Tasks preamble); D4 token gates BOTH
refresh routes, `.dev.vars` dev plumbing (gitignored), `wrangler secret put` in prod;
D5 Playwright webServer hardening + `/cdn-cgi/handler/scheduled` + status-semantics
assertions; D6 PWA audit-and-complete (export already ships manifest/icons/sw/offline);
D7 `archives/` in .gitignore + public tree committed.
External dependencies: none (solo project, no tracker, no platform repos)

## Architecture
Keeps the exported stack untouched (Next 16 App Router on vinext/Vite 8 + workerd, D1
binding `DB`, ASSETS, vendored sites-vite-plugin). All new code sits at the edges: a deploy
script patching generated config, a sweep module over existing `lib/live` loaders, a
scheduled handler, two gated API routes, a manifest, and Playwright. D1 gains no tables.

Environment facts (verified in the /analyse session):
- dev = `node scripts/run-framework.mjs dev` → vinext on :5173; build requires `python3`
  (`compress-snapshots.py`, `pack-live-seeds.py`); `pnpm start` = wrangler dev on :8787
  against `dist/server/wrangler.json` (build output).
- `install:ci` is Linux-sandbox-only (flock/GNU timeout) and fails on macOS — use
  `corepack pnpm install`; `pnpm-workspace.yaml`: `minimumReleaseAge: 10080`,
  `strictDepBuilds`, project-local store `.sites-runtime/pnpm-store`.
- `.openai/hosting.json` has `d1: "DB"` and a placeholder database_id — deploy patches it.
- Reference read-only extraction for planning: `/var/folders/jn/y8p5cqhx31b2n_6z3c0fbl9c0000gp/T/opencode/alfivra-analysis/cod`.

## Tasks

Assignment-ready graph (Architect pass 2026-10-06, evidence from the actual code and a
real `corepack pnpm build` on this branch). Bootstrapping (old Phases 1 + PR baseline)
is DONE — see Requirements 1 and 7. All task data below is FROZEN design; group
membership is data (one JSON file), rebalance = edit file + redeploy.

### Frozen design data (verified evidence)

**Deploy seam.** `corepack pnpm build` (18s wall; python3 prep steps deterministic)
emits `dist/server/wrangler.json` with exactly: `name:"site-creator-vinext-starter"`,
`main:"index.js"`, `compatibility_date:"2026-05-15"`, `compatibility_flags:
["nodejs_compat"]`, `d1_databases:[{binding:"DB",database_name:"site-creator-d1",
database_id:"00000000-0000-4000-8000-000000000000"}]`, `triggers:{}` (no crons today),
`assets:{binding:"ASSETS",directory:"../client"}`, `no_bundle:true`. A patched copy
`dist/server/wrangler.deploy.json` IN THE SAME DIRECTORY (name→`aflivra`, fake
database_id, `"triggers":{"crons":["0 0 * * *","7 0 * * *"]}`) passed
`wrangler deploy --dry-run --config dist/server/wrangler.deploy.json` — **exit 0**,
6,838 assets read from `dist/client`, 80 modules attached (wrangler 4.92.0). A deploy
REPLACES the whole cron list — always carry all 5 expressions. Build gotchas: (1) every
build rewrites `lib/live/seed-snapshots.json` (2 bytes of gzip-header entropy inside
`gzipBase64`, semantically identical) — deploy/migrate scripts must snapshot and restore
the pre-build bytes; (2) `next-env.d.ts` is generated untracked at root → .gitignore.

**Sweep substrate.** `readSource(loader,{waitForRefresh:true})` (lib/live/cache.ts:61)
refreshes INLINE (never backgrounded), reusing hourly budgets (`anaf`120/h,
`legislation`120/h, `courts`60/h, `ckan`500/h, `open-meteo`400/h — cache.ts:43-47),
locks, 429 backoff, seed fallback — no bypass, no parallel implementation. From 03:00
Bucharest, all yesterday's rows are force-expired on first read (cache.ts:38) — the
00:00–00:28 UTC sweep sits exactly in that window. Cold loader ≈ 6-8 D1 ops + 1-4
fetches ≈ 7-11 subrequests (D1 queries count; 50/invocation free). Per-source failures
are already caught inside readSource — one dead source never kills a group.

**Group map** (`lib/live/refresh-groups.json` — single source of truth; deploy.mjs
reads the crons from this file, refresh-sweep.ts the members):

| Group     | Cron (UTC)   | Members (tokens)                                                          | Est. subreq |
|-----------|--------------|---------------------------------------------------------------------------|-------------|
| live      | `0 0 * * *`  | bnr, weather.anm, company.default, catalog.default                        | 33          |
| weather   | `7 0 * * *`  | weather.alerts, forecast.bucuresti, events.odeon, cinema.bucuresti.today  | 29          |
| news      | `14 0 * * *` | feed.munca, feed.stiri, feed.sanatate, feed.educatie, feed.justitie       | 35          |
| legislation | `21 0 * * *` | law.search.default, law.search.codcivil, lawyers.default, knowledge.company.default | 33 |
| registers | `28 0 * * *` | directory.schools.page0, catalog.category.bani, catalog.category.sanatate, feed.agricultura | 31 |

(member→loader registry in `lib/live/refresh-sweep.ts` uses the app's OWN defaults:
`bnrLoader`, `weatherLoader` (adapters.ts), `companyLoader()` default CUI 427282,
`catalogLoader()` page 0 + categories `bani`/`sanatate` from catalog-categories.ts,
`alertsLoader`/`forecastLoader(<exact rounded București coords used by the app — read
app/location.tsx + v2-model.tsx so the key matches first load>)` (weather.ts),
`feedLoader('munca'|'stiri'|'sanatate'|'educatie'|'justitie')` + `afirLoader` (feeds.ts),
`lawLoader({title:codeTopics[0].title,text:'',number:'',year:'',page:0})` (legal.ts),
`lawyerLoader('',0,'recent')` (lawyers.ts), `knowledgeLoader('427282')` (knowledge.ts),
`directoryLoader('schools','',0)` (directories.ts), `odeonLoader` (events.ts),
`cinemaLoader(<default București site from cinema.ts>, <today ISO>)` (cinema.ts).
Unknown token → module throws at import (fail loud, verify script asserts full coverage.)

Seed-backed heavy (NOT swept on free — 10ms CPU/50 subreq; surfaced by status endpoint):
transport GTFS zip, siruta CSV, films + film-detail (Wikidata), directories
health/pharmacies/hospitals (XLSX), law `full:true` consolidation (1.4MB text + chunks),
catalog v3 org/format pages, resource/datastore loaders. On-demand freshness (never
sweepable: ttl ≤ 600 or query-keyed): transport:realtime×3 (ttl 30), courts (ttl 300 by
number), forecast other coords, company/knowledge other CUIs, article/story/cinema other
keys, feeds energie+transport, datastore pages.

**Sweep status storage — NO new schema (open question closed).** One summary row per
group in the EXISTING `source_cache` table: key `sweep:group:<name>`, data JSON
`{group,cron,startedAt,finishedAt,sources:[{key,name,status,lastSuccessAt,error}]}`,
`last_attempt_at`=started, `last_success_at`=finished, `adapter_version:'sweep.groups.v1'`.
Precedent: `law-tracked:v1:*`, `court-reference:v1:*`, `payload:*` rows already store
arbitrary JSON in this table. Status endpoint reads the 5 rows via key-range SELECT
(precedent legal-registry.ts:12) + the group/heavy/on-demand map from the module.

**TDD vehicle.** `scripts/verify-cache.mjs` is the harness to clone: it transpiles
lib/live/*.ts in-memory (typescript.transpileModule + import rewrites:
`cloudflare:workers`→`globalThis.__aflivraTestEnv`, seeds→globalThis fixtures), applies
the real `drizzle/0000_thin_demogoblin.sql` to `node:sqlite` DatabaseSync as fake D1,
and asserts. Also mirror `scripts/verify-legal-refresh.mjs` (fixture fetch via
spawnSync + Romanian one-line success output).

### Wave 1 — parallel launch (zero file overlap)

- [ ] T1.1 Fix pre-existing tsc error: hooks/use-mobile.ts (assigned: Builder)
  - Test: `corepack pnpm exec tsc --noEmit` fails today at components/ui/sidebar.tsx:8
    (`@/hooks/use-mobile` missing); passes after
  - Implement: new file `hooks/use-mobile.ts` (REPO ROOT — tsconfig maps `@/*`→`./*`;
    no hooks/ dir exists today). Standard shadcn `useIsMobile`:
    `useState<boolean|undefined>` + `useEffect` on `matchMedia('(min-width: 768px)')`
    with change listener, returns `!!isMobile`. `use client` directive; dense one-line
    style matching app/*; `import * as React from 'react'`
  - Verify: `corepack pnpm exec tsc --noEmit && corepack pnpm lint`
  - Files: hooks/use-mobile.ts (new)

- [ ] T1.2 Refresh sweep module + group map, TDD-first (assigned: Builder)
  - Test FIRST (RED): `node scripts/verify-refresh-sweep.mjs` — clone the verify-cache.mjs
    harness (in-memory transpile of lib/live/refresh-sweep.ts + its lib/live deps + the
    import rewrites; node:sqlite fake D1 with real drizzle SQL). Assert: (a) every token
    in refresh-groups.json resolves (unknown token fails); (b) each cron maps to exactly
    one group and each group to one cron; (c) runGroup invokes exactly the group's
    loaders (fixture globalThis.fetch counts calls; no real network); (d) one loader
    fixture throwing does not stop the others — the failing source is recorded with its
    error and the group still writes its summary row; (e) summary row `sweep:group:<n>`
    written with per-source `{key,name,status,lastSuccessAt,error}` and
    adapter_version 'sweep.groups.v1'; (f) unknown cron → no-op + console.warn JSON
    event; (g) Romanian one-line success output
  - Implement: `lib/live/refresh-groups.json` (pure data: groups[name,cron,members[]] +
    seedBacked[] + onDemand[]); `lib/live/refresh-sweep.ts` — member→loader registry
    (imports per the frozen token table above), `runGroup(name)` runs its loaders
    SEQUENTIALLY via `await readSource(loader,{waitForRefresh:true})`, writes the
    summary row via env.DB (INSERT ... ON CONFLICT(key) DO UPDATE), returns the summary;
    `runSweep(cron)` finds the group by exact cron match (assert exactly one) and runs
    it; business-rule comments only, Romanian user-facing strings, one-line dense style
  - Verify: `node scripts/verify-refresh-sweep.mjs` (green)
  - Files: lib/live/refresh-sweep.ts (new), lib/live/refresh-groups.json (new),
    scripts/verify-refresh-sweep.mjs (new)

- [ ] T1.3 Refresh API routes + env typing (assigned: Builder; API review T2.7, Security pass T2.5)
  - Test: local curl proof (after `.dev.vars` with `REFRESH_TOKEN=dev-refresh-token`):
    POST/GET without token → 401 `{"error":"Acces interzis."}`; wrong token → 401;
    valid token → 200 with group summary / status shape. Full e2e lands in T2.3 spec 8
  - Implement: `app/api/refresh/route.ts` — `export const dynamic='force-dynamic'`,
    POST(request): Bearer compare against `env.REFRESH_TOKEN` (import {env} from
    'cloudflare:workers'; unset token → always 401, never open); `?source=` validated
    against the group names enumerated from the refresh module (invalid/missing → 400
    with Romanian message listing the 5 group names — on the free plan one call = one
    group; omitting source runs all groups sequentially, writing each group's summary
    row as it completes — the paused Workers Paid path, documented in README);
    `await runGroup(source)`; Response.json({source,results:[per-source]}, no-store).
    `app/api/refresh/status/route.ts` — GET, same gate; key-range SELECT of
    `sweep:group:` rows (legal-registry.ts:12 pattern); merges module group map +
    last-run rows → {groups:[{name,cron,at,lastSuccessAt,sources,seedBacked}],servedAt},
    401/404-style Romanian errors consistent with siblings. Hand-rolled validation,
    NO zod (app code doesn't use it — scripts only). Match the one-line dense style of
    app/api/live/route.ts and app/api/weather/route.ts exactly
  - Verify: with `corepack pnpm dev` + .dev.vars: `curl -s -o /dev/null -w '%{http_code}'
    -X POST 'http://127.0.0.1:5173/api/refresh?source=live'` → 401; with
    `-H 'Authorization: Bearer dev-refresh-token'` → 200; same pair on GET
    /api/refresh/status
  - Files: app/api/refresh/route.ts (new), app/api/refresh/status/route.ts (new),
    cloudflare-env.d.ts (edit: interface Env += `REFRESH_TOKEN?: string;`)

- [ ] T1.4 PWA completion (assigned: Builder; UI/UX audit T2.8)
  - Test: home page DOM contains `<link rel="manifest" href="/manifest.webmanifest?v=2">`
    + `<link rel="apple-touch-icon" href="/icon-192.png">` + `theme-color` +
    `mobile-web-app-capable` metas (asserted by T2.3 home-smoke); manual install check
    documented by Scribe (Chrome DevTools → Application → Manifest: no issues)
  - Implement (diff-level): `app/layout.tsx` — metadata.icons += `apple:'/icon-192.png'`
    (iOS takes 180×180; 192 scales — padded 180 artwork optional later, no image
    toolchain in repo); metadata.manifest → `/manifest.webmanifest?v=2` (cache-bust;
    iOS pins manifests); metadata.other += `{'mobile-web-app-capable':'yes'}` (modern
    spelling; `appleWebApp` stays for the apple-* metas); ADD `export const viewport:
    Viewport={themeColor:'#0071e3',width:'device-width',initialScale:1}` (Next 16 moved
    themeColor to viewport). `public/manifest.webmanifest` — both icons' purpose
    `'any'` → `'any maskable'` (single-line JSON preserved; icon set already complies:
    id/name/short_name/start_url/scope/display/background/theme colors present).
    `app/public-map.tsx` + `app/v2-charts.tsx` — append `target="_blank"` to the
    attribution anchors (OSM tile attribution, Natural Earth map-credit) so the iOS
    standalone shell never navigates away; audit any other raw external anchors
  - Verify: `corepack pnpm exec tsc --noEmit`; dev server:
    `curl -s http://127.0.0.1:5173/manifest.webmanifest` (purposes updated) +
    `curl -s http://127.0.0.1:5173/ | grep -c 'apple-touch-icon\|theme-color\|mobile-web-app-capable'`
  - Files: app/layout.tsx, public/manifest.webmanifest, app/public-map.tsx,
    app/v2-charts.tsx

- [ ] T1.5 Deploy + migrate scripts + package wiring (assigned: DevOps specialist)
  - Test: dry-run against real build output; guarded local migrate ×2 (second no-ops)
  - Implement: `scripts/deploy.mjs` — (1) snapshot `lib/live/seed-snapshots.json` bytes,
    run `corepack pnpm build`, restore those bytes (build churns 2 bytes of gzip header);
    (2) `wrangler whoami` — no login → exit 1 with Romanian+English message pointing at
    the README runbook; (3) resolve D1: `wrangler d1 list --json` → find `name==='aflivra'`,
    else `wrangler d1 create aflivra --json` → read uuid; (4) guarded remote migrate:
    `wrangler d1 execute aflivra --remote --command "SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('source_cache','source_budget')" --json` → 0 rows ⇒
    `wrangler d1 execute aflivra --remote --file drizzle/0000_thin_demogoblin.sql --yes`
    (plain CREATE TABLE — guarded, since naive re-run errors); (5) read
    `dist/server/wrangler.json`, ASSERT exact shape before patching (name ✕
    'site-creator-vinext-starter', main ✕ 'index.js', compatibility_date ✕ '2026-05-15',
    assets ✕ {binding:'ASSETS',directory:'../client'}, d1_databases[0].binding ✕ 'DB' &&
    database_id ✕ placeholder uuid, triggers ✕ {}) — any mismatch ⇒ exit 1 naming the
    key, NEVER silently deploy a placeholder; (6) write patched copy
    `dist/server/wrangler.deploy.json` (same dir ⇒ relative main/assets stay valid):
    name→'aflivra', database_name→'aflivra', database_id→resolved,
    triggers.crons→FULL list from lib/live/refresh-groups.json; (7) `wrangler deploy
    --config dist/server/wrangler.deploy.json` (skip with `--dry-run` flag passthrough
    for local verification); (8) print worker URL + next steps. Idempotent re-runs.
    `scripts/db-migrate.mjs` — `--local`: ensure dist/server/wrangler.json (build if
    missing + same restore dance), sqlite_master-guarded `wrangler d1 execute DB --local
    --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/
    0000_thin_demogoblin.sql --yes` — targets the placeholder-id local DB that BOTH
    `pnpm dev` (vite plugin) and `pnpm start` (`--config dist/server/wrangler.json
    --persist-to .wrangler/state`) use; `--remote`: the deploy.mjs step (shared export
    or spawn). package.json scripts: `"deploy":"node scripts/deploy.mjs"`,
    `"db:migrate:local":"node scripts/db-migrate.mjs --local"`,
    `"db:migrate:prod":"node scripts/db-migrate.mjs --remote"`. `.gitignore` +=
    `/next-env.d.ts`
  - Verify: `node scripts/deploy.mjs --dry-run` → exit 0 (patched config passes
    `wrangler deploy --dry-run`; git status clean — seed-snapshots.json restored);
    `corepack pnpm db:migrate:local` twice → second run skips; `corepack pnpm dev` +
    GET /api/live → 200 proves the dev worker sees the migrated local D1
  - Files: scripts/deploy.mjs (new), scripts/db-migrate.mjs (new), package.json (edit),
    .gitignore (edit)

### Wave 2 — after Wave 1 (parallel launch groups with zero file overlap)

- [ ] T2.1 scheduled handler (assigned: Builder; depends T1.2)
  - Test: dev endpoint per the Cloudflare Vite plugin docs:
    `curl 'http://127.0.0.1:5173/cdn-cgi/handler/scheduled?cron=0%200%20*%20*%20*'` →
    sweep runs (summary rows appear; GET /api/refresh/status with dev token shows the
    group result)
  - Implement: `build/sites-worker.ts` default export += `scheduled(controller:
    ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext)` —
    `return withLiveContext(ctx,()=>runSweep(controller.cron))` (same wrap as fetch;
    ScheduledExecutionContext supplies waitUntil). runSweep already asserts the exact
    cron→group match and no-ops + console.warn on unknown cron
  - Verify: `corepack pnpm exec tsc --noEmit`; then curl each of the 5 cron expressions
    (URL-encoded) against the dev server; status endpoint reflects each
  - Files: build/sites-worker.ts (edit — one handler added)

- [ ] T2.2 README runbooks (assigned: Scribe)
  - Test: every documented command copy-paste runnable (spot-check each on the branch)
  - Implement: README.md — expand „Rulare locală rapidă": `.dev.vars`
    (`REFRESH_TOKEN=dev-refresh-token` sample; gitignored; `.dev.vars.example`
    committed), `db:migrate:local`, and a pointer to the E2E section. New „Publicare pe Cloudflare":
    `wrangler login` (once, user), `corepack pnpm deploy` one command (build → D1
    create/verify → migrate → patch → deploy; prints URL
    `https://aflivra.<subdomeniu>.workers.dev`), `wrangler secret put REFRESH_TOKEN
    --name aflivra` (ONCE, after first deploy; random real value — never in code),
    cron table (5 groups, UTC ↔ 03:00–03:28 EEST, ±1h winter drift — D2), manual
    refresh + status curl examples with the Bearer header, free-plan limits note +
    Workers Paid upgrade path (single full sweep = one group-map change), empirical
    per-group check via Workers Logs (CPU ms / subrequests). New „Instalare pe telefon"
    (iOS Safari: Adaugă la ecranul de start; Android Chrome: Instalează aplicația;
    maskable note). Keep the README's existing Romanian prose style
  - Verify: run the local-runnable commands verbatim; Romanian language review
  - Files: README.md (edit)

- [ ] T2.3 Playwright suite (assigned: Validator; depends T1.4 for icon asserts)
  - Test: `corepack pnpm test:e2e` green locally on the dev server
  - Implement: devDep `@playwright/test` (exact pinned version;
    `corepack pnpm exec playwright install chromium`); package.json +=
    `"test:e2e":"playwright test"` (package.json is free after T1.5; lockfile committed).
    `playwright.config.ts`: testDir './e2e', timeout 120_000, expect timeout 20_000,
    fullyParallel:false, workers: process.env.CI?1:undefined, use:{trace:
    'on-first-retry', acceptDownloads:true} — NOTE: sw.js needs NO disabling in tests
    (network-first navigations, caches only /data/*; app tolerates registration
    failure). webServer:{command:'corepack pnpm dev', url:'http://127.0.0.1:5173',
    timeout:180_000, reuseExistingServer:!process.env.CI} (vinext/workerd cold start;
    leftover-server reuse per Advocate D5; `pnpm start` on :8787 documented as the
    deterministic variant for the scheduled-handler flow). projects:[{name:'chromium'}].
    8 specs — assertions on `data-view` (main#vcontent), Romanian labels, and the
    `fresh|cached|stale|unavailable` semantics (NEVER raw HTTP 200s of live APIs;
    seed fallbacks are `stale` and valid):
    1. e2e/home-smoke.spec.ts — home loads, data-view="home", manifest + apple-touch-icon
       + theme-color + mobile-web-app-capable present (T1.4), live sections render a
       valid status, header nav Romanian labels
    2. e2e/explore-place-saved.spec.ts — explore view; open place card (data-view place);
       open lightbox; bookmark → localStorage `reper.v2.saved` contains id; saved view
       lists it; toast confirms
    3. e2e/catalog-flow.spec.ts — national catalog section: category filter + pagination
       next + set locality (LocationCityPicker) → geographic context active; standalone
       `/catalog` page renders LiveCatalog
    4. e2e/places-workspace.spec.ts — places workspace opens from a place entry,
       place-source details render
    5. e2e/legal-workspace.spec.ts — legal view: open Codul civil reader (seed-backed),
       TOC article navigation, export PDF/CSV/XLSX buttons → download events fire
       (waitForEvent('download'))
    6. e2e/transit-degradation.spec.ts — locality Cluj (outside TPBI coverage
       București–Ilfov): explicit coverage message, no error state; locally București:
       status semantics valid, no hard `isLive` assert
    7. e2e/compare-planner.spec.ts — add 2-3 places to compare → comparison renders;
       planner: add places + budget → plan renders
    8. e2e/refresh-api.spec.ts — 401 both routes without/with wrong token; with
       `.dev.vars` token: GET status 200 shape valid; POST ?source=weather 200 with
       per-source statuses (network-touching; serial; tolerate per-source `unavailable`)
  - Verify: `corepack pnpm exec playwright install chromium && corepack pnpm test:e2e`
  - Files: playwright.config.ts (new), e2e/*.spec.ts (8 new), package.json +
    pnpm-lock.yaml (edit — devDep + script)

- [ ] T2.4 CI workflow (assigned: DevOps specialist; frozen script names, no package.json edit)
  - Test: push branch → Actions green (verified at handoff; locally rehearse the exact
    command loop)
  - Implement: `.github/workflows/ci.yml` — on push/PR for main + feat branches;
    ubuntu-latest; corepack enable (pnpm 11 via packageManager); `corepack pnpm install
    --frozen-lockfile` (verify pnpm-lock.yaml is committed on the branch); verify
    battery: `node -e` loop running every scripts/verify-*.mjs to exit 0 (now includes
    verify-refresh-sweep.mjs); `corepack pnpm exec tsc --noEmit`; `corepack pnpm lint`;
    Playwright: `corepack pnpm exec playwright install --with-deps chromium` then
    `corepack pnpm test:e2e` with CI=true (reuseExistingServer off; webServer boots
    `corepack pnpm dev`, python3 present on ubuntu; no deployed-URL dependency). NO
    deploy step (needs Cloudflare auth — manual per README). NOTE: if CI runs
    `corepack pnpm build` anywhere, it must restore lib/live/seed-snapshots.json
    (same 2-byte churn as deploy.mjs)
  - Verify: `git status` clean, push, watch the run; locally:
    `for f in scripts/verify-*.mjs; do node "$f" || exit 1; done`
  - Files: .github/workflows/ci.yml (new)

- [ ] T2.5 Security pass on the refresh routes (assigned: Security specialist; owns app/api/refresh/* after T1.3)
  - Test: e2e 401 paths (T2.3 spec 8) + grep proof
  - Implement: `git grep -n 'REFRESH_TOKEN'` must show only cloudflare-env.d.ts (optional
    string), the two routes (reads), .dev.vars.example (the dev-only sample value),
    README (runbook). Create `.dev.vars.example`:
    `REFRESH_TOKEN=dev-refresh-token`. Route hardening (bounded edits): constant-time
    compare via crypto.subtle.timingSafeEqual when available, fallback to equality
    (optional per Advocate D4 — implement only if it stays 1-2 lines in house style);
    confirm env.REFRESH_TOKEN unset ⇒ always 401; confirm no token/secret/payload body
    ever reaches a log (routes log only console.warn JSON events with error messages,
    like app/api/legal/route.ts does); confirm .gitignore `.dev.vars` + `.dev.vars.*`
    entries (already present — verify only)
  - Verify: `git grep -n 'REFRESH_TOKEN' -- ':!.dev.vars.example' ':!README.md'`
    shows no literal token values; e2e spec 8 green
  - Files: .dev.vars.example (new), app/api/refresh/route.ts +
    app/api/refresh/status/route.ts (bounded edits; coordinate with T2.7 findings via
    the Architect)

- [ ] T2.6 Database review — D1 migration mechanics + sweep rows (assigned: Database specialist; owns scripts/db-migrate.mjs + deploy.mjs steps 3-4 after T1.5)
  - Test: `corepack pnpm db:migrate:local` twice (idempotent) → `corepack pnpm dev` →
    /api/live 200 → sweep summary rows visible via /api/refresh/status (dev token)
  - Implement (review + bounded fixes): sqlite_master guard correct for BOTH tables;
    `d1 execute --file` accepts the whole drizzle file (two CREATE TABLE statements,
    `--> statement-breakpoint` comment line — verify wrangler's SQL splitting handles
    it; if not, execute statements individually); local keying really matches the dev
    servers' placeholder-id DB (run migrate, boot `pnpm dev`, hit /api/live, then boot
    `pnpm start`, read the same rows — both servers must see the migrated data); sweep
    INSERT respects all source_cache NOT NULL-with-default columns; no index needed
    (5 rows); confirm zero new tables (assert only source_cache/source_budget in
    sqlite_master after sweep)
  - Verify: the Test sequence above, both servers, second run no-ops
  - Files: scripts/db-migrate.mjs / scripts/deploy.mjs (edits only if defects found)

- [ ] T2.7 API contract review (assigned: API specialist — READ-ONLY advisory; edits route through T2.5 owner)
  - Implement (review): refresh routes vs the 20 sibling routes — Response.json +
    Cache-Control no-store, `error` key, Romanian strings, force-dynamic, query-param
    validation style, correct 400/401/200 semantics, response shape stable for
    Playwright + future consumers, group names sourced from the module not duplicated
  - Verify: findings report into STATUS.md (Architect routes any blocking fix to the
    T2.5 owner)
  - Files: none (advisory)

- [ ] T2.8 UI/UX PWA audit (assigned: UI/UX specialist; owns app/layout.tsx + public/manifest.webmanifest + app/public-map.tsx + app/v2-charts.tsx after T1.4)
  - Test: `curl -I http://127.0.0.1:5173/manifest.webmanifest` → Content-Type
    application/manifest+json; DevTools manifest no-issues (manual step documented by
    Scribe)
  - Implement (review + bounded fixes): manifest field set vs Chrome installability
    (192+512 icons ✓, name ✓, start_url/scope '/' ✓, display standalone ✓, maskable ✓
    via T1.4); iOS metas (apple-touch-icon, mobile-web-app-capable, apple-mobile-web-app-
    status-bar-style via appleWebApp, theme-color via viewport export); hash-routing OK
    on scope '/'; external-link target audit complete (SourceLine/courts/ANRE/OSM/Natural
    Earth); installability edge cases (offline.html reachable)
  - Verify: curl Content-Type; grep all external anchors carry target="_blank" rel
  - Files: app/layout.tsx, public/manifest.webmanifest, app/public-map.tsx,
    app/v2-charts.tsx (edits only if defects found)

### Wave 3 — integration + handoff (after Waves 1-2)

- [ ] T3.1 Local integration verification (assigned: Builder + DevOps joint; commands only, evidence appended to STATUS.md)
  - All must pass, in order: `corepack pnpm exec tsc --noEmit` · `corepack pnpm lint` ·
    `for f in scripts/verify-*.mjs; do node "$f" || exit 1; done` ·
    `node scripts/deploy.mjs --dry-run` → exit 0 with `git status` clean (seed restore
    proven) · `corepack pnpm db:migrate:local` ×2 idempotent · `corepack pnpm dev` +
    smoke: GET / 200, /api/live 200, POST /api/refresh?source=live (dev token) 200,
    GET /api/refresh/status 200, curl all 5 `/cdn-cgi/handler/scheduled?cron=` variants ·
    `corepack pnpm test:e2e` green · exit dev server, `git status` clean
  - Files: none (verification only)

- [ ] T3.2 Production deploy + empirically arm the crons (assigned: DevOps + USER at handoff)
  - USER once (runbook): `wrangler login` (browser auth; no PAT/token in repo).
  - DevOps then: `corepack pnpm deploy` → prints https://aflivra.<subdomeniu>.workers.dev;
    verify GET / 200; `wrangler secret put REFRESH_TOKEN --name aflivra` (real random
    value); POST /api/refresh?source=<each group> with the real token — Advocacy D1's
    empirical step: watch Workers Logs for CPU ms + subrequest counts per invocation; a
    group over limit → split its members in lib/live/refresh-groups.json and redeploy
    (data-only change). Next morning: dashboard Cron Events + GET /api/refresh/status
    show all 5 groups ran (~03:00-03:28 EEST)
  - Files: none (operations; evidence to STATUS.md)

- [ ] T3.3 PR finalize (orchestrator, not a subagent): commit batch with AI-attribution
  trailer, PR #1 updated with T3.1/T3.2 evidence, user merge decision

## Quality Targets

| Target | Value | Override |
|--------|-------|---------|
| Coverage | 100% of NEW modules (refresh-sweep, refresh routes, deploy script) via verify-style node checks + Playwright | Set `COVERAGE_TARGET` in `.claude/rules/build-overrides.md` to override |
| Branch Coverage | best-effort on new modules (degradation paths asserted) | Set `BRANCH_COVERAGE_TARGET` to override |
| Pass Rate | 100% (`pnpm lint` clean, `tsc --noEmit` clean, verify-*.mjs battery green, Playwright green) | Set `PASS_RATE_TARGET` to override |
| TDD Mode | enforced for new modules (refresh-sweep first: failing verify check → implementation) | Set `TDD_MODE: optional` to override |
| Playwright E2E | required (7 flows) | Set `PLAYWRIGHT_TESTS: optional` to override |
| Integration Verification | required (dev boot, build, local D1, deploy dry-run) | Set `INTEGRATION_VERIFICATION: optional` to override |

## Implementation Standards

- **TDD**: Builder follows RED-GREEN-REFACTOR for new modules (refresh-sweep, refresh API).
- **No Scaffolding**: fully functional code; no TODOs/stubs/placeholders.
- **House rules (global CLAUDE.md, inherited by orchestrator)**: English artifacts; no
  comments in code except business rules, no ticket IDs in code; secrets are references
  (REFRESH_TOKEN never literal in committed files — local dev value goes in a gitignored
  `.env.local`-style file or is documented as a wrangler secret); every new endpoint is
  gated and the gate is testable; timestamps `Instant`-style (the repo's own conventions
  win — match existing `lib/live` patterns).
- **Stack conventions (from /analyse)**: runtime env via `import {env} from 'cloudflare:workers'`
  (never `process.env` in app code); degrade-never-fail with status semantics; SHA-256
  with proofs for any new data artifact; Romanian user-facing strings, English identifiers;
  one-line dense-file style; build tooling = Node .mjs + Python 3 stdlib only; victims of
  `install:ci` avoided (never run it on macOS).

## Specialists Recommended
(Final — Architect pass 2026-10-06; the pre-scan trigger set, resolved after reading the
actual work. Focused, non-overlapping file scopes; all are `orchestrate-*` subagents.)

- [x] DevOps — T1.5 deploy.mjs + db-migrate.mjs + package scripts, T2.4 CI workflow,
      T3.2 production deploy + cron arming at handoff.
- [x] Database Architect — T2.6: D1 guarded-migration semantics, local keying across
      `pnpm dev`/`pnpm start`, sweep summary-row shape vs source_cache schema.
- [x] Security — T2.5: Bearer gating of both refresh routes (public workers.dev URL),
      REFRESH_TOKEN plumbing audit (.dev.vars example, secret-as-reference), optional
      constant-time compare, no-secrets-in-logs.
- [x] API Designer — T2.7 (advisory): refresh routes contract vs the 20 sibling routes
      (dense style, no-store, Romanian errors, hand-rolled validation).
- [x] UI/UX — T2.8: PWA installability audit (manifest completeness, iOS meta set,
      maskable icons, external-link targets, MIME type).
- [x] Performance — advisory, folded into T3.2: empirical per-group CPU/subrequest
      measurement against the free-plan 50-subrequest/10ms-CPU caps; status endpoint
      read count (5 rows, well under cap). Group sizes are data — rebalance is one file.
- [ ] Migration — DROPPED: no framework/stack migration in scope; the "D1 migrations"
      trigger is migration-application mechanics owned by the Database specialist.
- [ ] Content Specialist — DROPPED: README/runbook/doc work is owned by the Scribe team
      role (T2.2); a second doc agent would overlap the same files (README.md).

## Coordination
Mode: none (Advocate S2 decision — user elected to skip tracker coordination; solo personal
project, no remote tracker; GitHub issues may be adopted later)
Session Ticket: (none)

## Coordination Mode
Mode: SUBAGENTS (native team tooling unavailable in this harness)
Reason: single-tree work with dependency-ordered bootstrap; subagents launched per wave
Complexity Score: 14 (final — Architect pass 2026-10-06: 6 specialist dispatches + 2
cross-layer (deploy/worker/API/UI/docs stack) + 3 waves + 3 hard dependencies
(T2.1←T1.2 sweep module; T2.3←T1.4 icon asserts; T2.5/2.7←T1.3 routes))
Preliminary Complexity Score: 6 (TS+Python stacks; auth/deploy/database-schema keywords;
frontend+backend+database+api+devops domains)

## Constitution Reference
Using standards from: global CLAUDE.md house rules (project root has no CLAUDE.md yet —
operative standards are embedded in "Implementation Standards" above; the README runbook,
not a CLAUDE.md, is the v1 doc deliverable per the approved design).

## Session Directory
ssnc-agent-orch/2026/10/06/aflivra-standalone-v1
