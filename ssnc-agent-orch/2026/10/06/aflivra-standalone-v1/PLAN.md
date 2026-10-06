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
   meant 06:00 Bucharest in summer — factually wrong). SWEEP SHAPE PENDING D1: free-plan
   limits are 10ms CPU + 50 subrequests per scheduled invocation and ~44 loaders ≈ 300–800
   subrequests — a single all-families sweep is NOT possible on the free plan; options
   (a) grouped sweep ≤ ~40 subrequests per group mapped to cron expressions (free allows
   5 crons; heavy families stay on bundled seeds), (b) Workers Paid $5/mo (15 min CPU,
   10k subrequests — original design verbatim), (c) manual-trigger only for v1.
   `lib/live/refresh-sweep.ts` must be group-aware from day one either way; per-family
   try/catch isolation; existing hourly budgets/backoff stay enforced; results into
   existing `source_cache`/`source_budget` tables — no new schema.
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
   timeouts (loaders budget 6-18s); local cron E2E can hit `/cdn-cgi/local/scheduled`
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

### Phase 1: Bootstrap (Builder; sequential — everything depends on it)
- [ ] Task 1.1: extract all 8 archives into repo root; verify with `verify-source-packages.py` (Builder)
- [ ] Task 1.2: move originals to `archives/`; `.gitignore`; `.nvmrc`; git init + feature branch; initial commits (Builder)
- [ ] Task 1.3: `pnpm install` (corepack) — confirm install works on macOS; `pnpm dev` boots at :5173 (Builder)
- [ ] Task 1.4: `db:migrate:local` script; apply `drizzle/0000_thin_demogoblin.sql` to `.wrangler/state` (Builder)
- [ ] Task 1.5: README „Dezvoltare locală" runbook section (Scribe)

### Phase 2: Deploy (DevOps + Builder)
- [ ] Task 2.1: `scripts/deploy.mjs` (patch database_id, remote migration, wrangler deploy) + `deploy`/`db:migrate:prod` scripts (DevOps)
- [ ] Task 2.2: deploy dry-run against user's account at handoff (`wrangler login` needed from user) (DevOps)

### Phase 3: Cron + refresh API (API + Database + Builder)
- [ ] Task 3.1: `lib/live/refresh-sweep.ts` — all families, per-source try/catch, budgets enforced, TDD first (Builder + Database review)
- [ ] Task 3.2: `scheduled` handler in `build/sites-worker.ts` + cron trigger wiring in deploy config (Builder)
- [ ] Task 3.3: `POST /api/refresh` (+`?source=`) and `GET /api/refresh/status`, Bearer-token gated (API + Security review)
- [ ] Task 3.4: REFRESH_TOKEN env plumbing (local dev value + dashboard secret doc) (Security)

### Phase 4: PWA (UI/UX + Builder)
- [ ] Task 4.1: `public/manifest.webmanifest` + icons + iOS meta in `app/layout.tsx` (Builder + UI/UX review)

### Phase 5: Playwright + CI (Validator + DevOps)
- [ ] Task 5.1: `playwright.config.ts` + `e2e/` seven flows; statuses-tolerant assertions (Validator)
- [ ] Task 5.2: verify-* battery wired as unit tier; CI workflow (GitHub Actions) if repo gains a remote (DevOps)

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
(Preliminary scan of this plan's text against the Specialist Trigger Reference — finalized
in Phase 2 Step 1.5 after the Architect pass:)
- [x] Database Architect — matched: "migration", "schema", "database", "D1"
- [x] DevOps — matched: "deploy", "deployment", "CI", "pipeline"
- [x] Security — matched: "auth", "secret", "token"
- [x] API Designer — matched: "api", "endpoint", "request", "response", "dto"
- [x] UI/UX — matched: "ui" (PWA installability, meta, layout), "frontend"
- [x] Performance — matched: "cache", "caching" (TTL layers)
- [x] Migration — matched: "migration" (D1 migration application path)
- [x] Content Specialist — matched: "documentation", "readme", "runbook"

## Coordination
Mode: none (Advocate S2 decision — user elected to skip tracker coordination; solo personal
project, no remote tracker; GitHub issues may be adopted later)
Session Ticket: (none)

## Coordination Mode
Mode: SUBAGENTS (native team tooling unavailable in this harness)
Reason: single-tree work with dependency-ordered bootstrap; subagents launched per wave
Complexity Score: (final score set by Architect in Phase 2)
Preliminary Complexity Score: 6 (TS+Python stacks; auth/deploy/database-schema keywords;
frontend+backend+database+api+devops domains)

## Constitution Reference
Using standards from: global CLAUDE.md house rules (project root has no CLAUDE.md yet —
operative standards are embedded in "Implementation Standards" above; the README runbook,
not a CLAUDE.md, is the v1 doc deliverable per the approved design).

## Session Directory
ssnc-agent-orch/2026/10/06/aflivra-standalone-v1
