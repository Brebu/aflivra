# Code Conventions — content-enrichment-ux session

**Detected Stack**: Next.js 16.3 (App Router, `app/`) on vinext + React 19.2 · Cloudflare Workers + D1 (`DB` binding, drizzle migrations under `drizzle/`) · TypeScript 5.9 (`tsc --noEmit`, strict) · Tailwind 4 · Leaflet 1.9 (`preferCanvas`, OSM attribution) · lucide-react icons · Playwright e2e (Chromium, `e2e/`, 120s/15s budgets) · Node ≥22.13, `corepack pnpm`. Language: **Romanian UI strings, English code/comments/artifacts**.

**MANDATORY — READ BEFORE WRITING ANY CODE.** Session-relative conventions below carry the binding Advocate decisions (`ADVOCATE-REVIEW.md` → Decision Outcomes D1–D6, all ACCEPTED). Project-absolute truth: `README.md` (per-revision documentation + the verify battery list) and `ADVOCATE-REVIEW.md` in this session dir.

## 1. Live-source polling contract (Wave A1 and any future live surface)

All client live polling goes through `useSource` (`app/use-source.ts`) — never a hand-rolled interval. The hook already provides, and every change must preserve:

- **Visibility + online gate** — poll ticks fire only when `document.visibilityState==='visible' && navigator.onLine` (`use-source.ts:54`, resume on `visibilitychange`/`online` `:55`).
- **Abort on unmount / URL change** (`:52`) — closing a dialog must never leak a request.
- **Byte-identical SWR** — an identical response body does not re-render (`:39-40`); the session-scoped last-good copy replays instantly on remount (`:8-14`, limit 48 — per-route transit artifacts are exempt from long-lived memory by design, `app/snapshot-store.ts:18`).
- **Error keeps the good copy** — failure never evicts displayed data; retry back-off 60s (`:41-50`), user `retry()` resets attempts.
- **Numbers** (`pollMs`, `timeoutMs`) are per-surface, chosen at the call site and justified in the wave brief + README: per-line vehicles = `{pollMs: 3000, timeoutMs: 8000}` (D2); the workspace-wide 30s poll (`app/transit-workspace.tsx:50`) and every other surface keep their current cadence.
- **Honesty of the label over the freshness of the fetch**: staleness is derived from the payload's own `observedAt`/`lastSuccessAt` — never from serve time. Under one minute it reads in **seconds** (the new tier: `stalenessSeconds` from `app/api/transport-live/route.ts:18`, rendered by `stalenessText`, `app/transit-workspace.tsx:36-41`); the minute/hour/day scale above stays.
- **No payload logging** on any live route (log the row's state fields, never bodies). `Cache-Control: no-store` stays the default; the edge micro-cache (`public, max-age=2, stale-while-revalidate=2`) is a pre-designed contingency for THIS route only, applied only when traffic demands it (D2).

## 2. Loader / TTL / D1-cache discipline (`lib/live/`)

- Every source is a `Loader{key,name,url,version,ttl,load}` read exclusively via `readSource` (`lib/live/cache.ts:51`) — one D1 row per key, **single writer** (60s lease), last-good-copy semantics, hourly budgets (`cache.ts:65-69`), Retry-After respected.
- **TTL is per loader-kind and now policy**: `realtimeLoader('vehicles')` TTL = **15s** (TPBI positions — D2); `arrivals`/`alerts` stay 30s; **Tranzy vehicles stays 30s** (`lib/live/transit-realtime.ts:24, :70`). Any TTL change updates the loader constant **and** the family's reason string in `lib/live/refresh-groups.json` **and** the README onDemand/coverage table, in the same change — the registry text is a contract, not prose.
- A loader contract change bumps `version` (invalidates stale rows via `adapter_version`) — never reuses a key with a changed shape.
- **No 6th cron** — 5 Cron Trigger slots frozen (`verify-refresh-sweep.mjs`); new data ride existing loaders/TTLs or the weekly relay classes, never a new trigger.
- Source shapes are probed (curl, politeness ledger in the session STATUS, ≤4 TPBI fetches/min) and pinned as fixtures/cells in `scripts/verify-source-errors.mjs` **before** loader changes.

## 3. Cross-source enrichment — merge-with-attribution (Wave B, D4)

- **Join only on validated keys**: CUI (`/^[1-9]\d{1,9}$/`), dosar number (`\d{1,8}/\d{1,5}/\d{4}(/…)?`), act id (`officialLawUrl`), SIRUTA, venue id (validated registry), OSM/Wikidata Q-id. **Never** name similarity; **never** destructive dedup at storage level; where no key exists, **link** (federated) instead of joining.
- Every enriched field carries the existing per-field provenance shape — the `combineCompany` (`lib/live/knowledge.ts:6`) model: `provenance[field]={source,url,verifiedAt,referenceDate}`; each surface renders fields **grouped by their source** with a per-source `Freshness` line; the raw `MetadataFields` disclosure stays untouched beneath the typed rows.
- **Ambiguity is honest, never resolved silently**: multiple matches for one key → warning, no auto-merge (the knowledge.ts multi-match precedent); no data → the surface's honest-absence note, never a search guess, never an invented field.
- Copyrightable assets from joins (imagery) go through the **attestation/hotlink register** (`public/media/manifest.json` completeness rows: author/license/license_url/source_page_url + sha256 + bytes, enforced by `verify-media-budget.mjs`). **No bulk downloads.**

## 4. Recency policy (Wave A2, D3)

- Recency is **per family class**, pinned by the coded anchors and the new gate `scripts/verify-recency-policy.mjs`. The table (Advocate D3, binding) is reproduced in `PLAN.md` §Wave A2. Summary: rolling 3y applies ONLY to catalog browsing, company *history*, CNAS editions and news feeds; legislation is in-force-governed; court dosare, places, films, professional registries, geography are **exempt**; events are future-facing.
- **"Dead" = no-content / expired-source / irreversible-stale** — identified per family by the census script and the probe pass, **never by age alone**. Age is never a deletion criterion outside the table.
- Corpus regeneration goes only through the established importers (`import-places.py`+`finalize-places.py`, `import-transit.py`, …) so the sha256/byte proofs and pinned census counts stay truthful (`verify-sweep-inventory.mjs` pin edits must cite the policy row).

## 5. e2e discipline

- **RED-first**: write the failing spec against unmodified code first, run it, keep the failure log in the session artifacts; then GREEN; then REFACTOR (adjusting assertions to the real contract is allowed; weakening one to green is never).
- Interception over live dependencies: `page.route('**/api/…')` with operator-shaped payloads (see `e2e/transit-view.spec.ts:83`). Hidden-tab guardrails via CDP `Emulate.setPageVisibilityState`. Budgets generous (`timeout:120_000`, `expect:15_000`) — never weaken an assertion to make a budget.
- Every new script named `verify-*.mjs`/`audit-*.mjs` in `scripts/` MUST be registered in `.github/workflows/pr-validation.yml` (battery job, in order) **and** the README verify list, in the same change.

## 6. Repository identity rules (standing)

- Working tree facts: `.specify/` absent — this is the standalone `/build` mode; session artifacts under `ssnc-agent-orch/2026/10/08/content-enrichment-ux/`.
- `README.md` documents per revision ("Revizia NN") — every wave ships its README sentences with the code, same change. `update-sitemap.mjs` only for new page routes (none in this session).
- Secrets stay env references (`TRANZY_API_KEY`, `REFRESH_TOKEN` via `wrangler secret put`) — never in code or committed files; D1 queries always parameterized (`.bind`).
- Keep apparently-dead code you did not write; remove only what your own branch added and no longer uses.
