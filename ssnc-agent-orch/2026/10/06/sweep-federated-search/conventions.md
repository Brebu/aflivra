# Code Conventions

**Detected Stack:** TypeScript (`tsconfig.json` strict, ES2020, bundler resolution, `@/*` → repo root).

Runtime: Cloudflare Workers via **vinext** (React 19, RSC-capable dev server on 127.0.0.1:5173 via
`run-framework.mjs dev`), D1 + drizzle (`drizzle/0000*.sql` schema), `env.ASSETS` for snapshots.
Tooling: `corepack pnpm` (never bare npm — macOS discipline), eslint 9 flat, Playwright 1.63 e2e
(`@playwright/test`, `reuseExistingServer`, never `ng test`-style browser MCP — dead this session).

## MANDATORY

READ the convention file before writing any code.

**Convention Source (read first existing):**
1. `.conventions/convention.md` (project-specific override) — **absent** (checked 2026-10-06)
2. Session constitution: `ssnc-agent-orch/2026/10/06/search-ux-validation-pass/STATUS.md` — the
   canonical record of this repo's house conventions (STATUS history is canonical per PLAN.md)

Do NOT proceed with implementation until you have read the applicable convention source.
Apply ALL rules from the convention file to your code.

## House conventions this repo has already proven (from STATUS history — binding)

- **No comments in code except business rules** (English, one line, e.g. `lib/live/query.ts:12`).
  No Jira IDs, no banners, no "match the file's comment style" — say it in every subagent prompt.
- **Romanian user-facing strings**; diacritics-folded comparison via `norm`/`normalizeSearch`; count
  phrases ALWAYS via `countText`/`countNoun` (Academy rule: unit-1-except-11 → singular).
- **TDD harness pattern**: new testable logic gets a `scripts/verify-*.mjs` transpile-import harness
  (`ts.transpileModule`, in-memory D1 or fixture payloads, mocked `globalThis.fetch`, exit non-zero),
  wired into `.github/workflows/pr-validation.yml` battery + README runbook in the SAME change.
- **⚠️ New top-level lib modules break closed stub resolvers**: `scripts/verify-location.mjs` and
  `scripts/verify-search-ui.mjs` hold explicit per-import rewrite lists. Prefer extending
  `lib/live/query.ts`; if a new module is unavoidable, extend BOTH resolver lists in the same change.
- **Source budget discipline**: ≤2 direct upstream fetches per source family, ONLY for surfaced
  failures; local dev-server routes and snapshot/manifest reads are free of that budget; the
  deployed worker is our own infra (parity leg, also free); never re-fetch served families.
- **Honest degrade**: routes never 5xx from a source outage — serve last valid copy + Romanian
  envelope + retry-pause; AFIR class (source-blocks-Workers-egress) ships the honest-degrade UX
  (last copy + "Deschide direct la sursă" + explanation) — do not "fix" it at the fetch layer.
- **e2e**: new behavior = RED spec first against the unmodified tree; suite stays green
  (28/28 baseline this session); assertions tolerant of source freshness states, never of wrong data.
- **Motion**: every animation gated by BOTH `prefs.motion` (`.v2.no-motion`) and
  `prefers-reduced-motion` (matchMedia + CSS `@media`); the blanket CSS overrides in
  globals/modern/live/workspaces css cover new keyframes only if authored inside `.v2` scope.
- **macOS/no-destroy discipline**: no `timeout`, no rm -rf on $HOME, `corepack pnpm` only,
  build rewrites `lib/live/seed-snapshots.json` — `git checkout` it back after builds.
