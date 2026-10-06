# Design: Aflivra v1 — Standalone Cloudflare Deploy + Data Cron + PWA

## Status
APPROVED — 2026-10-06T06:27:10Z

## Problem & Goal
Aflivra exists today as archives exported from ChatGPT Sites (rev 35: `Aflivra_Cod.zip` + 7
`Aflivra_Date_*.zip` volumes, SHA-256 inventoried), dependent on the platform that generated it:
the published ChatGPT site and refresh scripts that call that site. It has no repository, no
standalone deployment, no scheduled data updates of its own, no tests, and is not installable
on mobile.

**Goal of v1:** make Aflivra a self-standing product:

1. A git repository that anyone can clone and run locally (`pnpm install && pnpm dev`).
2. Deployed on the user's own Cloudflare account at the free
   `aflivra.<user-subdomain>.workers.dev` URL (no purchased domain required).
3. A scheduled job refreshing **all source families** daily at 03:00 Europe/Bucharest, with
   per-source isolation, hourly budgets enforced, and visible status.
4. An installable PWA (web + iOS + Android via "Add to Home Screen"; no app-store binaries).
5. A Playwright E2E suite covering the critical user flows.

**Success looks like:** clone → run → deploy are each one command; the app is installable from
a phone browser; the next morning the sources are pre-refreshed; a failed source never blocks
the others and its failure is logged with the source name.

## Users / Context
Solo developer (the user) plus end users of the Romanian public-data explorer. Development is
on macOS ARM, Node 22, pnpm 11.25.0. No team Jira project, no existing CI. The only external
resource required is a free Cloudflare account (`wrangler login` at deploy time). No Apple or
Google developer accounts are needed for v1 (PWA only).

## Approach
Keep the exported stack exactly as-is — Next.js 16 App Router on `vinext` (1.0.0-beta.5) over
Vite 8 + `@cloudflare/vite-plugin`/workerd with D1/ASSETS bindings and the vendored
`sites-vite-plugin` — and add only the missing pieces at the edges: a real D1 database, a
patch-and-deploy script, a `scheduled` cron handler over the existing `lib/live` loaders, a
PWA manifest, and Playwright.

Rejected alternatives: (B) migration to standard Next.js + `@opennextjs/cloudflare` — weeks of
work re-plumbing the vinext/sites-plugin glue with zero user-visible gain and high regression
risk; (C) static SPA + separate API worker — loses the existing RSC/SSR layer and refactors
all 20 API routes. Dual hosting on Vercel was dropped by explicit user decision (Q2); the app
is Cloudflare-native and Vercel can be added later if a concrete driver appears.

## Architecture

### Reused (untouched or configuration only)
- `app/**` — the SPA and its 20 API route groups. No UI changes for deploy.
- `lib/live/**` — ~44 source connectors and `readSource` (D1 cache + hourly budgets +
  429 backoff + 5xx retry cap + bundled-seed fallback). **The cron sweep calls these loaders**;
  no parallel refresh implementation is created.
- `build/sites-worker.ts`, `vite.config.ts`, `build/sites-vite-plugin.ts` — build pipeline kept;
  the worker entry is extended with a `scheduled` handler.
- `drizzle/0000_thin_demogoblin.sql` + `db/schema.ts` — the single migration (`source_cache`,
  `source_budget`), applied to the real D1 at deploy.
- `scripts/verify-*.mjs` (approx. 30) — remain the unit-tier checks in CI.
- `public/sw.js` — the existing service worker is the PWA offline base.

### New
1. **Bootstrap repo**: extract all 8 archives into the repo root (per `CITESTE_ARHIVELE.txt`),
   integrity-check with `python3 scripts/verify-source-packages.py`, `git init`, `.gitignore`
   (`node_modules/`, `.sites-runtime/`, `.wrangler/`, `dist/`, `.next/`, `*.tsbuildinfo`,
   `.env*`, `archives/` with the source zips moved there), `.nvmrc` = `22`, and a
   "Dezvoltare locală" README section with the real runbook (plain `pnpm install` —
   `install:ci` is Linux-sandbox-only and fails on macOS).
2. **Deploy**: `scripts/deploy.mjs` — patches the build output (`dist/server/wrangler.json`)
   with the real `database_id` from the user's account (the export carries a placeholder
   UUID), applies migrations to remote D1, runs `wrangler deploy`. New package scripts:
   `deploy`, `db:migrate:local`, `db:migrate:prod`.
3. **Cron sweep**: handler `scheduled` in `build/sites-worker.ts` + new module
   `lib/live/refresh-sweep.ts` iterating all source families (legislation: 6 codes + open
   acts; ANM observations/forecast/warnings; BNR; TPBI live transport; RSS feeds;
   registers/companies; courts + confirmed dosar index; catalog CKAN). Per-family try/catch;
   existing hourly budgets stay enforced; results written to the existing `source_cache` /
   `source_budget` tables — **no new schema**. Trigger scheduling: `0 3 * * *`; if the legal
   SOAP sweep exceeds the free plan's per-invocation CPU limit, split into
   `0 3 * * *` (legislation) + `30 3 * * *` (the rest).
4. **Manual trigger + status API** (also used by Playwright): `POST /api/refresh` accepts
   optional `?source=<family>`, gated by `Authorization: Bearer $REFRESH_TOKEN` (secret stored
   in the Cloudflare dashboard, never in code; a known dev value locally).
   `GET /api/refresh/status` returns the last sweep result per family. Structured logs per
   source (name, status, `lastSuccessAt`) are the v1 observability, viewable in Cloudflare
   dashboard logs.
5. **PWA**: `public/manifest.webmanifest` + icons + iOS meta tags in `app/layout.tsx`.
6. **Playwright**: `playwright.config.ts` with `webServer: { command: 'pnpm dev', url:
   'http://127.0.0.1:5173' }`, specs in `e2e/` for the seven critical flows: home smoke;
   explore → place detail → lightbox → bookmark → Saved (localStorage `reper.v2.saved`);
   catalog filter + pagination + geographic context; places workspace; legal workspace +
   consolidated reader + exports (PDF/CSV/XLSX); transit graceful degradation; compare/planner
   + standalone `/catalog` page. Assertions target `data-view`, Romanian labels, and the
   `fresh|cached|stale|unavailable` status semantics (never raw 200s).

## Key Decisions
- Cloudflare as the single v1 target; Vercel dropped — chosen over dual hosting because the
  app is workerd-native and no concrete Vercel driver exists (user decision, Q2).
- PWA over Capacitor/Expo — installable on all three platforms in days, zero store fees;
  Capacitor remains the upgrade path to store binaries later (user decision, Q3).
- Keep `vinext` beta + sites-plugin untouched — chosen over Next-standard migration; the beta
  risk is consciously accepted and mitigated by the fact that `app/` is standard App Router
  code that can be migrated later if vinext dies.
- Cron over ALL source families (user decision, Q4, against the YAGNI recommendation) —
  mitigated by existing hourly budgets and per-source isolation: worst case is a day without
  pre-warm for one source, never data corruption or blocked sweeps.
- The two-layer freshness model: on-demand `readSource` with TTLs stays the freshness layer;
  the cron is the consistency/pre-warm layer on top. The cron never replaces per-request
  revalidation for fast-moving data (weather, alerts).
- Deploy patches the generated `dist/server/wrangler.json` instead of forking
  `vite.config.ts`/sites-plugin — the repo stays absorbable if ChatGPT Sites emits rev 36.
- The ~150 MB `public/` data tree (SHA-256 verified) is committed to git — self-contained
  repo, reproducible CI and Playwright fixtures.

## Out of Scope
- Vercel deployment (revisit when a concrete driver appears).
- Native app-store binaries (Capacitor/Expo) — possible phase 2.
- Custom domain purchase and DNS wiring (2-minute optional upgrade later).
- Internationalization/English UI; UI rewrite; multi-user auth; analytics.
- Migration to standard Next.js.
- Publishing/updating the ~5,251 catalog datasets individually — the cron refreshes source
  families and catalog metadata, not every dataset resource.

## Open Questions / Risks
- `vinext` is 1.0.0-beta.5 (young project). Escape hatch: `app/` is portable Next App Router.
- Free-plan cron CPU limit per invocation — decide empirically at build: single sweep vs split
  cron triggers vs Workers Paid ($5/month).
- Some of the ~74 external sources are historically flaky (e.g. Infotrafic was down during
  rev 35 checks). Sweep treats them as best-effort, isolated.
- D1 free tier (100k writes/day): a daily sweep is marginal; monitor and upgrade if traffic
  grows.
- Build must verify that `dist/` assets include the `public/` data volumes (the ASSETS
  binding serves the `.json.gz` snapshots) and that `scripts/deploy.mjs` cleanly replaces the
  placeholder `database_id` / project id from `.openai/hosting.json`.

## Rough Phasing
1. **Bootstrap**: extraction + verification + git + `.gitignore` + `.nvmrc` + README runbook +
   local run confirmed (`pnpm dev` :5173) + D1 local migration script.
2. **Deploy**: account wiring (`wrangler login`), real D1 creation + remote migration, deploy
   script, live URL verified with real data.
3. **Cron**: `refresh-sweep` module + `scheduled` handler + `/api/refresh` + status endpoint,
   manual trigger verified in production, cron schedule armed and observed one full run.
4. **PWA**: manifest, icons, iOS meta, install verified on iOS + Android + desktop.
5. **Playwright**: config + the seven flows, green locally; CI wiring (GitHub Actions) last.

## Provenance
- Seed prompt: (interactive — requirements evolved through Socratic refinement; see Key
  Decisions for the four user choices: no-Vercel v1, PWA, all-source cron, keep-stack)
- Jira: (none)
- Created by: /brainstorm
