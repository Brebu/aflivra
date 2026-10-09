# Code Conventions

**Detected Stack:** TypeScript (Cloudflare Worker + React 19 + Next 16 via @cloudflare/vite-plugin/wrangler), Python scripts pentru importuri de corpus, Playwright e2e, baterie de porți `scripts/verify-*.mjs`. Node >= 22.13 (`.nvmrc`), pnpm.

## MANDATORY

READ the convention file before writing any code.

**Convention Source (read first existing):**
1. `.conventions/convention.md` (project-specific override) — **nu există**
2. `plugins/agent-orch/conventions/[stack].md` (default) — **nu există în acest repo**

Ambele lipsesc ⇒ convențiile de mai jos (deriveate din codul real, HEAD `b3b056d`) sunt sursa pentru această sesiune. Constructorii verifică orice fapt de cod pe fișierul real înainte de a-l scrie — nu pe memoria altor repo-uri.

**Reguli de stil derivate din cod (obligatorii pentru oriceschimbare viitoare):**

- **Limba:** cod/identificatori în engleză; mesajele de eroare către utilizator și textele contractului MCP sunt în **română** (ex. `Alege o localitate și filtre valide.`). Comentariile existente documentează reguli de business — nuBlocks de journaling; nu adăuga comentarii care explică ce face codul, doar de ce e o regulă.
- **Rute API:** `app/api/*/route.ts`, `export const dynamic='force-dynamic'`, validare explicită la intrare + `Response.json({error:'…'},{status:400})`. Mesajele de 400 identifică situația, nu generezăm stack-uri.
- **Porți offline (`scripts/verify-*.mjs`):** fiecare comportament pinat are o poartă autonomă (`node scripts/verify-*.mjs`, exit 1 la prima aserțiune pierdută, mesaje RO cu `label+': …'`). O remediere vine **în același PR** cu celula de regresie care pică fără ea. Porțile se adaugă în job-ul „Verify battery" din `.github/workflows/pr-validation.yml`.
- **E2E:** `corepack pnpm test:e2e` (Playwright, `e2e/*.spec.ts`). Clasificare existentă: `SEED_CLASS` (determinist), `ENVELOPE_CLASS` (contractul JSON-RPC fără date upstream), `LINK_CLASS` (`dataset_export` — resource_link + descărcare reală). Testele network-bound folosesc `test.skip` cu motiv, nu aserțiuni tari pe surse externe.
- **Fără writes în repo din partea architect/scribe în această sesiune** — doar `ssnc-agent-orch/2026/10/09/round3/`.
- **Snapshot-uri publice** (`public/**`): regenerate doar prin scriptele Python/`.mjs` din `scripts/`, cu SHA-uri re-pin-uite în porți în același PR (pattern-ul D12/N07 din acest plan).
- **Fără dependențe noi** fără nevoie dovedită — `xlsx` vine din `vendor/xlsx-0.20.3.tgz` (file:), fflate/xlsx se importă în porți prin `require.resolve`/transpile (pattern `verify-snapshot-transport.mjs:12-16`).

Do NOT proceed with implementation until you have re-read the applicable source files listed in PLAN.md. Apply ALL rules above to your code.
