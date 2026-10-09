# STATUS — remedierea retestării de defecte

Sesiune: `2026/10/09/retest-defects` · bază: commit `be5fcbc` (deploy ~10:08 UTC; retest 10:12–10:27 UTC — la ~4 minute după deploy).
Stiva detectată: TypeScript 5.9 · Next 16.3 / Vinext / Cloudflare Workers · React 19 · pnpm 11 · Playwright.
Mod: standalone `/build` (fără `.specify/`; fără `agents.yaml`; fără git-workflow extern).

## Architect Findings

### Verdicturi per defect (probă + cod)

| Defect | Verdict | Cauza confirmată |
|---|---|---|
| D11 tabel Office | **CONFIRMAT — cache, nu gardian** | Gardianul (`lib/live/source-xml.ts:214-215`) e corect pe fișierul REAL; rândul D1 pre-fix servește sub același `resource.complete-index.v6` (TTL 86400) |
| D21 firme | **IPOTEZA „SPARQL-ul nou pică" INFIRMATĂ; persistența = cache pre-fix sub v3 neschimbat** | Fix-ul e live și corect în producție; retestul a citit un rând pre-fix în moment stale |
| N02 sosiri trenuri | **CONFIRMAT + ADÂNCIT** | Falsa sosire de origine confirmată; proba a descoperit și inversarea sistematică OraP/OraS (toate timpurile panoului decalate) |
| N03 default 168 | CONFIRMAT | `lib/mcp/tools.ts:54` omite `hours` când lipsește |
| N04 fereastra de la 00:00 | CONFIRMAT | `app/api/weather/route.ts:10` — `hourly.slice(0,hours)` |
| N05 publishedAt ±3h | **CONFIRMAT — sursa se contrazice singură; cititorul de articol citește meta-ul greșit al sursei** | Meta `15:08:21+03:00` (→12:08Z) vs RSS `+0000` & `date_gmt` (→15:08Z, canonic) |
| N06 edition=all | CONFIRMAT | `app/api/trains/route.ts:21-22` — `expired` legat de selecție; `activeIds` înghite arhivul |
| N01 URL relativ | **CONFIRMAT relativul; INFIRMATĂ blocarea workers.dev** | `app/api/mcp/route.ts:64`; probă: 200 + XLSX valid și cu Chrome UA și cu `curl/8.7.1` — 403/1010 e clientul Python-urllib al auditorului (documentat `docs/mcp.md:21`) |
| N07 coordonate | CONFIRMAT + noroi de corpus | 326 intrări urbane cu lat/lon există (Brașov: 45.65251/25.610565); `county` amestecă ş/ș în același fișier — join-ul prin fold |

### Probele decisive (2026-10-09)

1. **git `be5fcbc^`**: `resources.ts` avea DEJA `resource.complete-index.v6`; `adapters.ts` avea DEJA `wikidata.company-name.v3` (SPARQL fără `?class`, fără `ORG_CLASSES`, fără `wdt:P31`); `source-xml.ts` fără `officeStyles` (gardian adăugat de fix). Fix-ul nu a bump-uit nicio versiune → rândurile D1 cu forma veche servesc până la expirarea TTL.
2. **Resursa D11 reală**: `resource_show` → format „XML", „Plan anual achizitii publice 2026", 351.883 bytes, **pachet Word 2003 XML** (`<?mso-application progid="Word.Document"?><pkg:package …>`); namespace-urile `schemas.openxmlformats.org/drawingml|officeDocument|wordprocessingml` SUNT prezente (gardianul se aprinde); 11 `<a:gs>` (gradient stops). Rețetă: numai bump-ul de versiune forțează re-pararea.
3. **MCP producție**: `dataset_table` 387e35f7 → încă tabel `gs` (status cached, v6); `search_companies` eMAG → ACUM formă nouă (5 org-classed, Émagny/Emaga laevis excluse; Q23827008 fără P3608 — sursă, nu bug); `weather_forecast` fără hours → 168.
4. **SPARQL exact** (VALUES ~50 + `OPTIONAL {?item wdt:P31 ?class}` + label service) → **HTTP 200 în 0,97s**, binding-uri complete cu clase.
5. **TPBI**: RSS `pubDate: +0000` → 15:08Z; WP `date_gmt` (fără offset) 15:08 → 15:08Z; pagina `<meta article:published_time> = 15:08:21+03:00` → 12:08Z (ora GMT cu offset lipit — sursa greșește, cititorul de articol o preia fidel).
6. **Tren 7901 raw**: e1 Nord→Pajura `OraP=1800 OraS=2160 StationareSecunde=0`; e2 Pajura→70029 `OraP=2160 OraS=2430`; e3 70029→70031 `OraP=2460 OraS=2580 StationareSecunde=30` → **OraP=plecare din origine, OraS=sosire în destinație** (dwell 30s = 2460−2430 exact). Corpusul comis: Nord plecare afișată 00:36 (real 00:30) + „sosire" 00:36 f=stația; 237/481 sosiri false la Nord, 125/267 la Brașov.
7. **XLSX**: 200 + ZIP valid (572.762 bytes) pentru ambele UA-uri pe workers.dev.
8. **Localități urbane**: Brașov city există cu lat/lon; `county` „Braşov" (ş) pe intrarea oraș vs „Brașov" (ș) pe frați — fold obligatoriu.

### Decizii de coordonare
- N02 se repară la nodul de timp, nu doar la sosirea de origine: aceeași rescriere de importator, același rerun — invarianta de regresie e dwell-ul (`plecare − sosire === StationareSecunde`), plus confirmarea externă pe un orar publicat înainte de merge.
- Semantica publicată rămâne „sosire comercială" — markerul de formare de la origine nu devine niciodată rând de panou; returul circular (tip T) rămâne.
- N03 se aplică în build-ul MCP (default 48), NU pe ruta directă (UI-ul folosește copia integrală fără `hours`).
- Toate bump-urile de versiune (tabelul din PLAN: v7, v4, v4) sunt mecanismul de invalidare — fără ele, fixurile D11/D21/N05 servesc forma veche din cache până la expirare.

### Fișiere-cheie
`lib/live/resources.ts:76` · `lib/live/source-xml.ts:195-222` · `lib/live/adapters.ts:81-139` · `scripts/import-mers-tren.mjs:32-68` · `scripts/verify-mers-tren.mjs` · `lib/mcp/tools.ts:45-55` · `app/api/weather/route.ts:6-11` · `app/api/mcp/route.ts:50-71` · `e2e/mcp.spec.ts:90-102` · `app/api/trains/route.ts:21-36` · `app/api/localities/route.ts:5` · `lib/geographic-scope.ts:10-17` · `lib/live/feeds.ts:8-12` · `lib/live/content.ts:5-9` · `scripts/verify-source-errors.mjs` · `scripts/verify-mcp-live.mjs` · `docs/mcp.md:21,79,138,187` · `public/data/geographic-localities.json` · `public/trains/**`.

Specialiști recomandați: orchestrate-api (contractele MCP N01/N03/N04/N06). Fără devops/database/security — strat de date, fără schimbări de schemă.
