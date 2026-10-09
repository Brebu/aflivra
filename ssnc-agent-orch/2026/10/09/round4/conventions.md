# Code Conventions

**Detected Stack:** TypeScript (Cloudflare Worker + React 19 + Next 16 via @cloudflare/vite-plugin/wrangler), Python scripts pentru corpusuri (SIRUTA/OSM), Playwright e2e, bateria de porți `scripts/verify-*.mjs`. Node >= 22.13 (`.nvmrc`), pnpm.

## MANDATORY

READ the convention file before writing any code.

**Convention Source (read first existing):**
1. `.conventions/convention.md` (project-specific override) — **nu există**
2. `plugins/agent-orch/conventions/[stack].md` (default) — **nu există în acest repo**

Ambele lipsesc ⇒ convențiile de mai jos (derivate din codul real, HEAD `3d3b116`, continuând `2026/10/09/round3/conventions.md`) sunt sursa pentru această sesiune. Constructorii verifică orice fapt de cod pe fișierul real înainte de a-l scrie.

**Reguli derivate din cod (obligatorii pentru orice schimbare, runda 4):**

- **Limba:** cod/identificatori în engleză; mesajele de eroare către utilizator și proza `docs/mcp.md` în **română**; descrierile tool-urilor MCP din `lib/mcp/tools.ts` sunt în **engleză** (stilul existent — păstrează-l la extends). Comentariile documentează reguli de business, nu journaling.
- **Registrul geografic** (`public/data/geographic-localities.json`): se regenerează DOAR prin `python3 scripts/build-geography.py`; nu se editează de mână. Orice regenerare vine în același PR cu celulele de regresie din `scripts/verify-geographic-scope.mjs` care pică fără ea (pattern round-3/round-4).
- **Rute API:** `app/api/*/route.ts`, validare explicită la intrare, `Response.json({error:'…'},{status:400})`. Joinul de coordonate din `app/api/localities/route.ts:9-13` e singurul loc unde SIRUTA primește puncte — nu se adaugă alte surse de coordonate fără decizie.
- **Granița MCP** (`lib/mcp/server.ts`): -32602 = argument invalid/lipsă, cu parametrul numit în mesaj; un 400 onest de la rută devine `isError:true`, niciodată eroare de transport. Orice tool nou trece prin pinul de la `scripts/verify-mcp.mjs` §4 (tools/list) + §11 (pin de fire) + §15 (docs/mcp.md validată contra schemei).
- **Porți offline:** o remediere vine **în același PR** cu celula de regresie care pică fără ea; porțile se adaugă în jobul „Verify battery" din `.github/workflows/pr-validation.yml`.
- **E2E:** `corepack pnpm test:e2e` (Playwright `e2e/*.spec.ts`); celula geografică existentă e `e2e/mcp.spec.ts:262-274`.
- **Fără writes în repo din partea architect/scribe în această sesiune** — doar `ssnc-agent-orch/2026/10/09/round4/`.
- **Fără dependențe noi.** Diacriticele: SIRUTA poartă forme vechi (Ş/T cedilla, U+015E/U+0162), OSM forme moderne (Ș/Ț comma-below, U+0218/U+021B) — orice comparare de județ/nume pe text SIRUTA vs OSM trece prin fold (NFD + strip combining marks — `lib/live/query.ts:3`, `scripts/build-geography.py:6`).

Do NOT proceed with implementation until you have re-read the source files listed in PLAN.md. Apply ALL rules above to your code.
