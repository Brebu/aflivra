# Code Conventions

**Detected Stack:** TypeScript (Cloudflare Workers — D1, Workers Assets, cron triggers; rute Next-style în `app/api/**/route.ts`; dev server `vinext`), Node `.mjs` pentru baterii de verificare, Python 3 pentru utilitare de import/pack, Playwright e2e (chromium pinat exact), pnpm prin corepack.

## MANDATORY

READ the convention file before writing any code.

**Convention Source (read first existing):**
1. `.conventions/convention.md` (project-specific override) — nu există în acest repo
2. `plugins/agent-orch/conventions/typescript.md` (default)

Do NOT proceed with implementation until you have read the applicable convention file.
Apply ALL rules from the convention file to your code.

## Reguli de stack specifice acestei sesiuni (runda 5 — audit A01–A30)

1. **Fără refactorări dincolo de remedieri.** Stilul existent se păstrează: identificatori engleză, comentarii doar reguli de business (în stilul existent, română), mesaje/aserțiuni română, „lipsă" ≠ zero, feedback onest.
2. **Fără corecții automate ale datelor sursei.** Contradicțiile se semnalează (`qualityFlags`, `filterVerification`, `qualityProfile`), nu se „repară" — valoarea sursei se servește cum e.
3. **Fiecare remediere primește o celulă de poartă** în `scripts/verify-source-errors.mjs` (familie per-rută, fixture-uri mock), pin în `scripts/verify-mcp.mjs` (seam + schema + WIRED) sau celulă e2e (`e2e/mcp.spec.ts`); pentru conținut literar `verify-ro-text.mjs`, pentru catalog `verify-catalog.mjs`, pentru cache `verify-cache.mjs`. Bateriile rulează LA FINAL (Lot 6), țintit pe ce s-a schimbat.
4. **Orice loader cu formă nouă de date își face bump de versiune** (`adapter_version`) — `cachedCopyServes` în `lib/live/cache.ts` respinge copiile cu versiune veche; fără bump, remedierea nu se vede pe D1.
5. **Seed-urile packed:** `lib/live/catalog-seed.json` + `server-seed.json` → `scripts/pack-live-seeds.py` → `seed-snapshots.json`; `verify-packed-seeds.mjs` verifică egalitatea de octeți cu corpusul de pe disc. Orice schimbare de seed = regenerare + re-pack în aceeași livrare (A09).
6. **MCP:** transport 2025-06-18 strict (un singur mesaj per POST; header de versiune nesuportat → 400; Origin = originea proprie + fără Origin pentru server-to-server). Tool descriptions în engleză (stilul existent), `docs/mcp.md` capitol per tool în română — sincronizate în aceeași livrare (poarta VM §15 verifică docs).
7. **Timpuri:** timestamp-uri de observație UTC (ISO); date calendaristice românești prin `romanianDate()` (`lib/live/date.ts`, Intl `Europe/Bucharest`) — niciodată `toISOString().slice(0,10)` pentru „azi RO".
8. **Securitate:** descrierile și fixture-ele fără PII; fără chei/tokenuri în mesaje sau diagnostic (A30 persistă diagnostic sanitizat — url/category/status/attempts, fără corpuri).
9. **Test commands:** `corepack pnpm lint` · `corepack pnpm exec tsc --noEmit` · `node scripts/verify-*.mjs` (rulate din lista din `.github/workflows/pr-validation.yml`) · `corepack pnpm build` · `corepack pnpm test:e2e` · deploy: `node scripts/deploy.mjs` · live: `node scripts/verify-mcp-live.mjs` (exit 0/2 onest, exit 1 blocant).
10. **Nu se tastează directoare din afară muncii:** fișiere de lucru ale sesiunii doar în `ssnc-agent-orch/2026/10/10/runda5-audit/`.
