# Advocate Review

**Date**: 2026-10-06T09:45:00Z
**Feature**: Aflivra v1 — Standalone Cloudflare Deploy + Data Cron + PWA (+ Playwright)
**Enforcement Mode**: *(pending user choice — recommended: advisory with hard-block for CRITICAL security findings; no findings in the CRITICAL security/compliance categories were found in this review)*
**Reviewer**: Advocate Agent (Staff SWE / CISSP / CCSP / Cloud Architect)

## Executive Summary

The edges-only architecture is right and unusually disciplined: cron over the existing
`lib/live` loaders, no new schema, the vendored sites-plugin untouched. The one place where
the design's stated success criterion ("next morning the sources are pre-refreshed") does not
survive contact with reality is the **Workers FREE plan's scheduled-invocation limits** —
10 ms CPU and 50 subrequests (D1 queries included) per invocation make an all-families sweep
infeasible in one (or even two) cron invocations. Second hard error: `0 3 * * *` is
06:00 Bucharest in summer, not 03:00 — cron runs UTC only. Both are fixable inside the
existing design: group the sweep across the account's cron-trigger budget (5 on free,
not 3), prioritize families, or lift everything with Workers Paid ($5/mo). The deploy
patch seam (`dist/server/wrangler.json` post-build) is the correct one, but it must also
patch the worker **name** (package name is `site-creator-vinext-starter`, not `aflivra`)
and must assert-or-fail on the generated config's shape.

## Evidence Base (verified this session)

- Reference extraction read at `/var/folders/.../alfivra-analysis/cod`: `build/sites-worker.ts`
  (29-line default `{fetch}` export — the `scheduled` handler extends this object),
  `build/sites-vite-plugin.ts` (closeBundle only copies `.openai/hosting.json` + `drizzle/`
  into `dist/.openai/` — it does **not** generate wrangler.json; that is `@cloudflare/vite-plugin`
  1.37.1 fed by `vite.config.ts` lines 17–38 with placeholder `database_id`).
- `lib/live/cache.ts` readSource state machine: per-load ~5–15 D1 ops (SELECT, seed INSERT,
  lock-UPDATE with RETURNING, budget UPSERT, storePayload UPDATE + optional chunk INSERTs,
  retireCopies UPDATEs, final SELECT) + 1–4 external fetches (loadCompany=4 parallel).
- Loaders verified in `lib/live/*.ts`: bnr (ttl 900s), weather (600s), alerts (300s),
  transport-realtime (30s), company (86400s), catalog (3600s/page), law (3600s), courts,
  siruta (2 fetches + full CSV parse), transport GTFS zip ≤15 MB/20 s parse.
- Cloudflare docs fetched 2026-10-06 (limits page Sep 5, 2026; cron-triggers page Sep 4, 2026;
  D1 limits Apr 21, 2026): CPU per Cron Trigger free = **10 ms** (paid = 30 s <1 h interval /
  15 min ≥1 h); subrequests **50/invocation free** (10,000 paid); D1 queries per invocation
  50 free / 1000 paid and count as subrequests; cron wall time 15 min; **Cron Triggers per
  account: 5 free / 250 paid**; "Cron Triggers execute on UTC time"; cron changes propagate
  ≤15 min; a deploy **replaces** the cron list (empty array deletes all).
- Local cron testing path exists on both servers: `/cdn-cgi/local/scheduled` works under
  `wrangler dev` **and** the Cloudflare Vite plugin (docs, "Test Cron Triggers locally").
- Public data tree measured: ~137 MB / ~7,180 files across the 8 zips, **largest single file
  2 MB** (`public/places/cities.json`) — no git 100 MB violations. `public/offline.html`
  exists; `sw.js` is network-first for navigations, caches `/data/*`.
- README licensing is documented in place: per-photo attribution + licenses in
  `public/media/manifest.json` / `category-manifest.json`, OSM ODbL attribution (README:229),
  Inter OFL fonts, Open-Meteo commercial trigger documented for ads/subscriptions (README:182).

## Decision Points for User

### Decision 1: The all-families daily sweep cannot run as one cron on the FREE plan
**Severity**: HIGH (blocks the design's success criterion, not a security CRITICAL)
**Proposed**: single `scheduled` sweep over ALL families; fallback "split into 2 crons if CPU exceeded".
**Challenge**: Math from the docs + the readSource D1 protocol: ~44 loaders ≈ 300–800
subrequests (50 limit) and the heavy parsers alone (15 MB GTFS zip, SIRUTA CSV, consolidated
law text) plausibly exceed 10 ms CPU by themselves — splitting in **two** does not close a
~10× gap. The fallback as written would "verify empirically" into a dead end.
**Recommendation**: build `lib/live/refresh-sweep.ts` **group-aware from day one** — the
sweep exports named groups (e.g. `legislation`, `finance-weather`, `catalog`, `registers`,
`heavy:gtfs`) each sized to ≤ ~40 subrequests and light CPU; `deploy.mjs` maps groups to
cron expressions (≤5 on the free account, e.g. `0 0`, `10 0`, `20 0`, `30 0`) and the same
groups back the manual `POST /api/refresh?source=<group>` trigger. Heavy families (GTFS,
SIRUTA) get measured via the manual trigger in production; if a group can't fit free-plan
limits, **either drop it from the sweep** (its data changes rarely — seed fallback already
covers it) **or move to Workers Paid $5/mo**, which lifts CPU to 15 min and subrequests to
10,000 and makes the original single-sweep design work verbatim.
**Trade-off**: free = curated, grouped sweep + heavy families possibly left on seeds;
$5/mo = the design exactly as approved. The user chose "cron over ALL families" — that
choice is only fully realizable on the paid plan.
**Confidence**: HIGH on the limits (official docs); MEDIUM on which specific groups fit
(must be measured empirically via `/api/refresh?source=` + Workers Logs CPU/subrequest fields).

### Decision 2: `0 3 * * *` is NOT 03:00 Europe/Bucharest
**Severity**: MEDIUM (factual error in DESIGN.md and PLAN.md)
**Proposed**: `0 3 * * *` labeled "(Europe/Bucharest semantics)".
**Challenge**: Cron Triggers run on UTC only (docs, explicit). Romania is UTC+3 in summer /
UTC+2 in winter. `0 3 * * *` fires at **06:00 Bucharest (summer)** / 05:00 (winter) — after
the intended pre-warm window, and inconsistent year-round.
**Recommendation**: `0 0 * * *` UTC = 03:00 EEST (summer) / 02:00 EET (winter) — always in
the deep-night window, ±1 h DST drift documented in the README. If 03:00 winter matters more,
`0 1 * * *` UTC (04:00 summer / 03:00 winter). A timezone-stable 03:00 year-round is not
expressible in UTC cron and does not merit two season-swapped expressions.
**Trade-off**: ±1 h seasonal drift vs. exact 03:00 local — for a pre-warm, drift is free.
**Confidence**: HIGH.

### Decision 3: Endorse the deploy seam, but the patch must cover `name` + `crons` and fail loud
**Severity**: MEDIUM
**Proposed**: `scripts/deploy.mjs` patches `database_id` into `dist/server/wrangler.json` post-build.
**Challenge (answered)**: patching generated output is the **right** seam — a second root
wrangler config would drift from the actual build output (assets dir, main, compat flags)
that `pnpm start` already consumes, and editing `vite.config.ts` gives up rev-36
absorbability for one line. The build cannot overwrite the patch (build → patch → deploy is
the script's own order). The real risks: (a) the plugin derives the worker **name** from
`package.json` `site-creator-vinext-starter` → deploys as
`site-creator-vinext-starter.<sub>.workers.dev`, not `aflivra.*` — patch `name` too, or the
target URL in the design silently fails; (b) a plugin bump can reshape the generated JSON —
deploy must **assert** the expected keys exist before patching and exit non-zero otherwise
(never silently deploy the placeholder); (c) cron wiring must ride in the same patch
(`triggers.crons`) — and since a deploy **replaces the whole cron list**, the script must
carry the full list every time, never an increment.
**Recommendation**: accept the seam; add `name` + `triggers.crons` to the patch set;
assert-or-fail pre-patch; idempotent re-runs; D1 migration via `wrangler d1 migrations apply
--remote` with `migrations_dir` pointed at `drizzle/` (or `d1 execute` guarded for
idempotency — the SQL has plain `CREATE TABLE`, so a naive re-run errors).
**Trade-off**: none of substance — strictly fewer failure modes than the alternatives.
**Confidence**: HIGH on seam choice; MEDIUM on exact key layout of `dist/server/wrangler.json`
(verify on the first real build output — nobody has seen this file yet; PLAN already says so).

### Decision 4: REFRESH_TOKEN plumbing — accept static bearer for v1, but close two gaps
**Severity**: MEDIUM
**Proposed**: `Authorization: Bearer $REFRESH_TOKEN`, "secret stored in the Cloudflare
dashboard… a known dev value locally".
**Challenge**: two concrete gaps. (1) A public workers.dev URL means `GET /api/refresh/status`
must be gated by the same token — as drafted it would publish per-source health, source
names, timestamps to anyone. (2) The local dev value belongs in **`.dev.vars`**, which the
planned `.env*` gitignore pattern does **not** match — `@cloudflare/vite-plugin` and
`wrangler dev` both read `.dev.vars`; without an explicit ignore entry the token gets
committed. Prod: `wrangler secret put REFRESH_TOKEN` (not vars — secrets are the right
store and work with both `wrangler dev --remote` and deploy).
**Recommendation**: accept the static bearer for v1 (single operator, no PII, refresh flood
is already capped by the source_budget machinery); gate both routes; `.dev.vars` +
`.dev.vars.*` in `.gitignore`; document the token's rotation in the README runbook; a
constant-time compare is cheap but optional at this threat model.
**Trade-off**: Cloudflare Access would be stronger but adds an org requirement the v1
constraints (personal free account) reject.
**Confidence**: HIGH.

### Decision 5: Playwright on `pnpm dev` — keep it, with webServer hardening
**Severity**: LOW (advisory)
**Proposed**: `webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:5173' }`.
**Challenge**: vinext+workerd cold start can exceed the default readiness budget; a
leftover server on :5173 makes webServer spawn a second one that fails; and some flows hit
live government APIs whose loaders budget 6–18 s timeouts — per-test timeouts must tolerate
`unavailable`-but-correct rendering (the planned `fresh|cached|stale|unavailable`
assertions are exactly right — keep them, never assert live 200s).
**Recommendation**: `reuseExistingServer: !process.env.CI` (explicit), `timeout` ≥ 120 s
for the server itself, generous per-test timeouts for network-touching views, and use the
documented `/cdn-cgi/local/scheduled` route (works under the Vite plugin on :5173 **and**
`wrangler dev` on :8787) to E2E the cron handler locally without deploying. Keep
`pnpm start` (prod-parity, built output) as the variant of record for the scheduled-handler
E2E and as fallback if vite-dev flakiness bites.
**Trade-off**: dev server = fast inner loop but HMR/websocket noise; `pnpm start` =
deterministic but pays a full build per run.
**Confidence**: MEDIUM-HIGH (the `/cdn-cgi/local/scheduled` path is documented; cold-start
timing is empirical).

### Decision 6: PWA — sound; the details that actually break installability
**Severity**: LOW (advisory)
**Proposed**: `public/manifest.webmanifest` + icons + iOS meta on the existing hash-routed SPA.
**Challenge/Recommendation**: hash routing does **not** hurt installability (scope `/`
covers it; `sw.js` at root, network-first navigations, `offline.html` exists — verified).
What does break it, per platform: Chrome needs 192 px + 512 px PNG icons (maskable ideally)
plus an active fetch-handler SW (have it); iOS ignores most of the manifest and needs
`apple-touch-icon` 180×180 PNG, `<meta name="mobile-web-app-capable" content="yes">`
(modern spelling of the deprecated `apple-` one), status-bar-style, and `theme-color`.
Also: cache-bust the manifest (`?v=1` on the link href — iOS pins manifests aggressively),
and ensure external links use `target="_blank"` so the iOS standalone shell doesn't
navigate away. No cross-origin concern on `*.workers.dev` (same-origin, HTTPS).
**Trade-off**: none — pure checklist.
**Confidence**: HIGH.

### Decision 7: Committing ~137 MB of `public/` — acceptable; fix the archives/ inconsistency
**Severity**: LOW (advisory + one PLAN bug)
**Proposed**: commit the immutable public/ tree; move source zips to `archives/`.
**Challenge**: verified safe on the numbers — ~137 MB, ~7,180 files, largest file 2 MB
(no GitHub 100 MB-per-file or repo-size issue; clone cost is one-time). Licensing is
documented in-repo (per-photo attribution manifests, OSM ODbL, OFL fonts, Open-Meteo
commercial trigger noted for the no-ads v1). **Real bug**: DESIGN.md gitignores `archives/`;
PLAN.md's `.gitignore` list omits it — as planned, ~120 MB of zips would sit **untracked**
in the working tree forever (or worse, get committed by a stray `git add .`).
**Recommendation**: accept the commit (it is the product + Playwright fixtures); add
`archives/` to `.gitignore` in PLAN (orchestrator reconciliation); expect repo history to
grow with each data snapshot update — fine at this cadence.
**Trade-off**: reproducibility and self-contained clones vs. 137 MB clone weight — the user
already decided; no argument.
**Confidence**: HIGH.

## Decision Outcomes
*(to be updated after user responses)*
- Decision 1: pending
- Decision 2: pending
- Decision 3: pending
- Decision 4: pending
- Decision 5: pending
- Decision 6: pending
- Decision 7: pending

## Jira Session Ticket
**Issue**: none — coordination mode pending user choice (see Coordination).

## Team Activity
No tracker context exists (`.claude/rules/jira.md` absent). Options presented to user:
skip tracker coordination (recommended — solo personal project, repo not yet initialized,
no remote) vs. local markdown board (`ssnc-agent-orch/TEAM-BOARD.md`) vs. Jira setup.

## Conflicts Detected
None. No other sessions, no active work, no platform repos. Pending: none.

## Existing Solutions Found
- [x] `lib/live/cache.ts` readSource — the sweep substrate; locks/backoff/budgets/seed
  fallback all reused as-is. The sweep must pass `waitForRefresh: true` (line 61) so
  refreshes complete within the invocation instead of backgrounding into a canceled context.
- [x] `build/sites-worker.ts` default export — extend the same object with `scheduled`;
  wrap in `withLiveContext(ctx,…)` exactly as `fetch` does (works: ScheduledExecutionContext
  supplies `waitUntil`).
- [x] `scripts/verify-*.mjs` pattern (e.g. `verify-legal-refresh.mjs`: node:assert/strict +
  controlled `globalThis.fetch` fixtures + spawnSync + one-line Romanian success line) —
  the TDD vehicle for `refresh-sweep.ts` the PLAN already prescribes.
- [x] `public/sw.js` + `offline.html` — PWA offline base, no new service worker needed.
- [x] `/cdn-cgi/local/scheduled` (documented for both `wrangler dev` and the Vite plugin) —
  local cron-trigger test path the plan hasn't yet exploited.
- [x] Cloudflare platform (D1, Cron Triggers, Workers Static Assets) — everything in the
  design is a first-party platform feature; **no third-party infra is needed or recommended**.
- [x] Searched for platform/shared-service repos (`../totalis`, `../platform`, `../shared`):
  none exist; this is a self-contained personal project. Nothing to reuse, nothing to extend.

## Infrastructure Recommendations
- Cloudflare-only, wrangler-CLI-based deployment from local (as designed). No K8s/Helm/
  Terraform warranted for a single Worker + D1 + static assets — the wrangler config IS the
  IaC. If a GitHub remote appears (PLAN Task 5.2), a single GHA workflow running
  `pnpm build` + verify battery + Playwright + (manual-gated) deploy is the right ceiling
  for v1 CI; secret via `wrangler-action` API token stored as a GitHub secret, never in repo.
- Group-aware sweep registry (Decision 1) with groups mapped 1:1 to cron expressions by
  `deploy.mjs`, ≤5 expressions total on the free account.
- Record per-invocation diagnostics: Workers Logs already surface CPU ms + wall time +
  invocation outcome (`exceededCpu`) — the v1 "observability" story (structured per-source
  logs + dashboard Logs + Cron Events history) is adequate as designed; add a single
  `sweep:last` summary JSON stored under one `source_cache` key (arbitrary-key JSON storage
  already supported — no new schema) so `/api/refresh/status` reads **one** row instead of
  ~44 D1 queries (brushing the free 50-subrequest limit on the status endpoint itself).

## Shipping & Infrastructure
**IaC Location**: none in the archives (expected — repo not yet initialized); the deploy
story is `scripts/deploy.mjs` + `wrangler deploy --config dist/server/wrangler.json`, i.e.
Wrangler-as-IaC for a Worker + D1 + Static Assets.
**Deployment Method**: Cloudflare Workers (free plan) via wrangler 4.92; manual, from the
user's laptop; no CI/CD yet (GHA optional in Phase 5 if a remote appears).
**Environments**: local (vite-plugin :5173, wrangler dev :8787) + one production worker
(`aflivra.<sub>.workers.dev`).
**Finding**: PASS for v1 scope — a single Worker with wrangler-as-config is appropriate;
revisit CI gating when the repo gains a remote.

## Security Concerns
- **MEDIUM — unauthenticated `/api/refresh/status` as drafted**: gate it with the same
  Bearer token (public URL exposes source names/health/timestamps). Evidence: PLAN.md L36–39.
- **MEDIUM — `.dev.vars` not covered by `.gitignore` plan**: the `.env*` pattern misses it;
  add `.dev.vars*` explicitly (Decision 4).
- **LOW — non-constant-time bearer compare**: acceptable at this threat model; optional hardening.
- Verified-acceptable: static bearer for v1; ` getSource` validates redirects
  (same-host, no downgrade: `adapters.ts` L9-12) and caps response sizes (5 MB default,
  GTFS 15 MB explicit); secrets-as-references house rule respected by the plan;
  no PII in the cached source payloads beyond public registry data.
- No CRITICAL-category findings (no PII without encryption, no unauthenticated destructive
  operations — POST /api/refresh mutates only cache rows and is token-gated, no hardcoded
  secrets, no known-vulnerable pinned deps — pnpm-workspace `minimumReleaseAge: 10080`
  already biases against fresh-broken releases).

## Cross-Team Dependencies
None — solo project, no platform repos, no other teams. No tickets to create.

## Checklist Results
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Complexity | PASS | edges-only additions to a running system; no new schema; no parallel refresh impl. The one complexity risk is answered by D1 (group-aware sweep). |
| 2 | Build vs Reuse | PASS | exemplary — cron over existing loaders, existing sw.js, verify-*.mjs pattern; `/cdn-cgi/local/scheduled` added as a reuse point. |
| 3 | Infrastructure | CONCERN | free-plan CPU (10 ms) + subrequest (50) limits vs all-family sweep (D1); Wrangler-as-IaC otherwise appropriate; cron list replacement semantics handled in D3. |
| 4 | Security | CONCERN→PASS after D4 | static bearer accepted for v1; gate status endpoint; `.dev.vars` ignore; no CRITICAL. |
| 5 | Operational | PASS | Workers Logs + Cron Events = v1 observability; cron propagation ≤15 min documented; failure isolation by design (per-family try/catch + seeds). |
| 6 | Business Alignment | PASS | all four ratified user choices honored (no relitigation); the free-tier goal vs all-families sweep tension surfaced honestly as D1. |
| 7 | Cross-Team Impact | PASS/N-A | solo, no tracker, no platform repos. |

## Platform Discovery
**Platform Repo**: none (checked `../totalis`, `../platform`, `../shared` — absent). Self-contained personal project.
**Existing Services Found**: none relevant — Cloudflare first-party (Workers/D1/Cron/Assets) covers everything.
**Reuse Recommendations**: N/A; and explicitly **against** introducing queues (paid-only), service mesh, or event streaming for a v1 personal data app.

## Coordination
**Mode**: pending user choice (recommendation: skip — solo personal project, repo not yet initialized, no remote, no team to coordinate with).
