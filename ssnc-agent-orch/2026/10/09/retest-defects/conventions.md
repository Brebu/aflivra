# Code Conventions

**Detected Stack:** TypeScript 5.9 · Next.js 16.3 (Vinext, Cloudflare Workers) · React 19 · pnpm 11 · Node ≥ 22 · xlsx (vendor) · fflate · Playwright e2e

## MANDATORY

READ this file before writing any code. No `plugins/agent-orch/conventions/` exist in this repo — the repo's own conventions are the source of truth:

- **Stil compact pe o linie** — codul nou urmează stilul dens al fișierului editat (export-uri pe o singurie linie, fără blocuri goale decorative). Nu reformata fișierele existente.
- **Comentarii doar reguli de business**, în română, ca în tot repo-ul; niciun ID de tiket în cod.
- **SourceState onest** — fiecare raspuns API/MCP poarta plicul {status, error, lastSuccessAt…}; o sursa degradata se declara `stale`/`unavailable`, niciodata mascata.
- **Porți de verificare** — `scripts/verify-*.mjs`; fiecare comportament reparat își dobândeste celulă/fixture în poarta potrivită în ACEEAȘI schimbare cu codul.
- **Invalideare cache prin version bump** — `Loader.version` (lib/live/*) este mecanismul de invalidare al rândurilor `source_cache`; un loader a cărui formă de date se schimba PRIMESTE bump, altfel rândurile vechi servesc forma veche pana la expirare.
- **Fără rulare DDL/INSERT manuală** — datele trec prin loadere/porți; corpusurile publice (public/trains, public/data) se regenerează prin scriptul lor de import, nu editate de mână.
- Verificare locală: `npm run build` + porțile `node scripts/verify-*.mjs` atinse de schimbare; e2e cu `npm run test:e2e`.

Do NOT proceed with implementation until you have read this file.
Apply ALL rules above to your code.
