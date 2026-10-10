# STATUS — Runda 5 (audit extern A01–A30)

**Sesiune:** /build standalone · `SESSION_DIR = ssnc-agent-orch/2026/10/10/runda5-audit/`
**Commit de referință:** `b351e961130ff876844eea62976f1ad5ff424afa` (HEAD main la data auditului, 09.10.2026 22:52 +03:00).
**Fază:** Plan scris. Implementarea nu a început.

**Architect: plan scris — 21 items FIX COD / 6 DOC-LIMITĂ / 3 EXTERN.**

Progres: [`PLAN.md`](PLAN.md) — clasificarea completă A01–A30, loturile 1–6, riscuri, pașii de migrare A09, contractul MCP 2025-06-18 (A24/A25/A26).

| Lot | Conținut | Stare |
|---|---|---|
| 1 — Corectitudine | A20, A29, A03, A05, A02, A01 | neființat |
| 2 — Catalog & identitate | A22, A11, A09 (migrare §6) | neființat |
| 3 — Contract MCP | A19, A23, A24, A25, A26 | neființat |
| 4 — Observabilitate | A30 (migrare D1), A06, A27 | neființat |
| 5 — Conținut + DOC | A16, A17, A21 + DOC A04/A10/A12/A13/A14/A15/A18/A07/A08 | neființat |
| 6 — Validare + deploy + live | baterii țintite → complete → build → deploy → verify-mcp-live | neființat |

Notă proces (directiva utilizatorului): remedierile se implementează toate întâi, pe loturi; celulele de poartă se scriu odată cu codul; **bateriile rulează la final** (Lot 6), apoi deploy și audit live.

## Architect Findings

**Tech stack detectat:** TypeScript (Cloudflare Workers: D1, ASSETS, cron; rute Next-style `app/api/**`; `vinext` dev server), Node `.mjs` baterii de verificare (`scripts/verify-*.mjs`), Python 3 utilitare (`import-catalog-snapshot.py`, `pack-live-seeds.py`), Playwright e2e (chromium pinat), pnpm/corepack. Detalii în [`conventions.md`](conventions.md).

**Specialiști recomandați:** niciunul obligatoriu. Opțional: `orchestrate-devops` pentru consult A28 (path filters + branch protection — cea din urmă e configurație GitHub externă, notată follow-up). A26 e conformanță transport fixată prin directivă, fără suprafață nouă de auth.

**Rezumatul defalcării sarcinilor:** 21 remedieri cod-fixabile (A01, A02, A03, A05, A06, A09, A11, A16, A17, A19, A20, A21, A22, A23, A24, A25, A26, A27, A28, A29, A30), 6 documentări oneste de limită (A04, A10, A12, A13, A14, A15 — docs/mcp.md capitol per tool + descrieri), 3 extern/infra cu degradare onestă (A07, A08, A18). Fiecare remediere cod are celulă de poartă atribuită (VSE/VM/E2E/verify-ro-text/verify-catalog/verify-cache etc. — tabelul din PLAN.md).

**Fișiere-cheie identificate:** `lib/live/legal.ts`, `lib/live/forecast.ts` + `app/api/weather/route.ts`, `lib/live/flights.ts` + `lib/live/records.ts`, `lib/live/cache.ts` (+ `catalog-seed.json`/`seed-snapshots.json`/`pack-live-seeds.py` pentru A09), `app/api/catalog/route.ts`, `lib/live/housing.ts` (`anlRecordId`), `lib/live/resources.ts` + `app/api/resource-file/route.ts`, `lib/mcp/server.ts` + `lib/mcp/tools.ts` + `app/api/mcp/route.ts`, `lib/live/content.ts`, `lib/live/stories.ts`, `lib/live/events.ts`, `lib/live/refresh-sweep.ts` + `lib/live/date.ts`, `scripts/verify-mcp-live.mjs`, `scripts/verify-mcp.mjs:150-158`, `.github/workflows/pr-validation.yml`.

**Decizii de coordonare luate:**
1. **A01** — sursa SOAP nu separă anul publicării de data intrării în vigoare (verificat în `parseLawSearch`): păstrăm un singur an, redesemnat onest ca „anul din DataVigoare"; adăugăm `filterVerification` + post-filtrare; NU inventăm `actYear`/`publicationYear` (recomandarea auditorului nu e fezabilă ca scrisă — alternativa documentată în PLAN.md).
2. **Loturile** urmează livrările 1–5 din audit, rearanjate după dependențe: A09 ultima în Lot 2 (migrare atomică), A25 după A24 (ambele ating același contract de transport), A30 înainte de A06/A27 (câmpul de diagnostic ajută fixture-ele).
3. **Docs înainte de deploy:** docs/mcp.md §Conectare se actualizează în Lot 3 (A24/A25 sunt breaking declaate), nu la Lot 5 — deploy-ul de la Lot 6 trebuie să găsească documentația deja sincronizată.
4. **Versiuni de cache la orice formă nouă de date** (A16 v4→v5, A17 v1→v2, A09 v3→v4) — `cachedCopyServes` compară `adapter_version`; fără bump, copiile D1 vechi supraviețuiesc remedierii.
5. Diagnostic LSP `municipalitySector` la `app/api/localities/route.ts:3` = fals-pozitiv (exportul există la `lib/geographic-scope.ts:15`); baseline-ul rămâne curat.
