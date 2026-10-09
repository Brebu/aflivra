# STATUS — runda 3 audit MCP (dovezi + documentație)

Sesiune: `2026/10/09/round3` · HEAD: `b3b056d` · mod: read-only pe repo (scriere doar în acest director).

## Scribe Findings

**Docs create:**
- `mcp-audit-evidence.md` — raportul complet de dovezi și gap-uri pentru runda 3:
  1. **Tabel de dovezi D03/D24/D25/D27/D28** — fiecare cu porțile existente (verify-mcp.mjs §7/§2/§10+e2e/verify-mcp-live.mjs byStatus/e2e „semantic regressions"+bateria de 43 porți verify-*.mjs+CI pr-validation.yml), aserțiuni citate file:line și proba concretă de dat auditorului. 3 lacune de acoperire declarate onest: R02 fără celulă de regresie („0 0" nu e în mock-uri), R01 fără pin pe lista de categorii, N07 fără aserțiune negativă.
  2. **Gap-uri docs/mcp.md** cu formulări RO gata de lipit: R01 (lista exactă de 15 categorii din manifest — `comert`/`administratie`/`sport` NU există; `firme` necitat), R02 (garantul `_id` per persoană — defect deschis la HEAD: justice.ts:79 tratează „0 0" ca legitimație nenulă), N07 (coordonate garantate doar municipii/orașe OSM city/town, ~326 intrări; satele UAT-urilor urbane rămân fără punct), D21 (rândul {cui,vat,qid,name,websites,org,sourceUrl}; țara/nota de potrivire = decizie de produs), D11/D26 (livrare viitoare fișier+extragere pentru Office XML), D01/1010 (nota UA extinsă la descărcarea din resource_link, nu doar la apelul JSON-RPC).
  3. **Coerență tools.ts ↔ docs/mcp.md ↔ llms.txt/llms-full.txt**: llms*.txt delegă spre docs (fără drift); drift activ la R01 (tools.ts:35 promite 3 categorii inexistente) și N07 (ambele „urban→lat/lon" greșite față de date); restul aliniat.
  4. **6 întrebări de clarify/decizie** (enum vs descriere la category, aliasuri, politica _id/placeholder, completarea coordonatelor vs onestitate, câmpurile de identitate D21, operațional vs documentat pentru 1010).

**Verificat contra cod (HEAD b3b056d):** verify-mcp.mjs, verify-mcp-live.mjs, e2e/mcp.spec.ts (+company-name-search, justice-registries), rutele company/legal/places/localities/experts/notaries, lib/mcp/tools.ts, lib/live/justice.ts, lib/live/adapters.ts, directories.ts, build-geography.py, finalize-places.py, import-places.py (clasificarea categoriilor), public/places/manifest.json (categoriile reale), public/data/geographic-localities.json, docs/mcp.md (258 linii + capitole reparate în #44-#47), public/llms.txt, public/llms-full.txt, .github/workflows/pr-validation.yml, session PLAN/STATUS din retest-defects.

**Stare:** COMPLETE — toate docs cerute scrise. Read-only pastrat: zero modificări în afara `ssnc-agent-orch/2026/10/09/round3/`.

## Architect Findings

**Rol:** Architect · mod standalone (`SESSION_DIR=ssnc-agent-orch/2026/10/09/round3/`) · HEAD analizat `b3b056d` · **read-only pe cod** (zero modificări în repo; scrise doar `conventions.md`, `PLAN.md`, această secțiune). Fără extensii (`agents.yaml`/`git-workflow.yaml` absente), fără Advocate (Skipped).

**Tech stack detectat:** TypeScript pe Cloudflare Workers (React 19 + Next 16 + @cloudflare/vite-plugin/wrangler), Python pentru corpusuri, Playwright e2e, bateria `scripts/verify-*.mjs` (43+ porți, CI `pr-validation.yml`). Detalii în `conventions.md`.

**Metodă:** root-cause pe fișier (file:line) + probe live pe `https://aflivra.brebu.workers.dev` (UA de browser + curl + node; Python-urllib blocat de Cloudflare 1010, confirmat) + counts pe corpusul local. Două subagenți de probe (live + corpus), repo neatins.

**Rezumat pe cele 8 puncte** (detalii complete (a) rădăcină / (b) probă / (c) fix / (d) test în `PLAN.md`):

1. **R01** — `tools.ts:35` promite `comert`/`administratie`/`sport` inexistente; `places/route.ts:9` respinge generic; **enum-ul se validează deja la graniță** (`server.ts:44` → -32602 cu parametrul numit) — doar schema nu-l folosește. Fix: enum cu cele 14 categorii reale + docs; **fără aliasuri**. Probe live: comert/administratie/sport → „Alege o localitate și filtre valide.", firme → 214.
2. **R02** — `justice.ts:79` ia `Legitimatie` nenulă ca `_id`; placeholder-ul „0 0" e nenul → 7 persoane色 share `_id`. Live: 1319 total București, 20/14 ID-uri, 7× „0 0"; câmpuri disambiguatoare disponibile (Telefon/Adresa/Specializare). Fix: `plausibleRegistryNumber` (reject doar-zERouri) + fallback hash extins.
3. **N07** — `build-geography.py:26` filtrează OSM la `city|town` (326 intrări); **cele 6 localități lipsă există în `cities.json` ca village cu lat/lon** (13.971 itemi, 13.081 village). Două opțiuni cu costuri: A redescriere (docs-only) vs **B extindere țintită la componentele urbane SIRUTA** (recomandată: B + A); bundle + re-pin-uri costs detaliat.
4. **D21** — `adapters.ts:140` SPARQL fără P17; fix minimal: `OPTIONAL P17` + `country` (label, null onest) + `matchNote` determinist; fără CUI inventat; UI mirror + stub e2e.
5. **D11/D26** — `resources.ts:52` servește XML-ul integral (351.674 chars; sub pragul de 1MB indexare `:82`); fix: `wordPackageText` extrage rulările `w:t` din `/word/document.xml` (`textComplete:false`) + `data.file` cu URL absolut + `format=xml` în `resource-file`. Celula existentă `format-word-package` se rescrie.
6. **D12** — nicio poartă nu leagă boards↔manifest (`verify-mers-tren.mjs` = fixture-uri sintetice, `verify-snapshot-transport.mjs` = bytes/SHA zero semantică). Fix: `distinctTrains` în importer + **poartă nouă `verify-trains-corpus.mjs`** (distinct-in-boards === distinctTrains per operator). „Corect" per operator = mulțimea distinctă a ediției publicate; 294 SNTFC la Nord NU e invariant (per-stație, scădere corectă post-N02/D14). Σ=2363=counts.trains ✓ la HEAD.
7. **D23** — live: 0 din 6 resurse XLSX „tranzactii" au >1 foaie → regresia cu fixture xlsx 2 foi pe unitatea `parseResource` (`resources.ts:41-44`) + selectare `resourceSheetRows`/`resource-file`, scenariu nou `format-xlsx-two-sheets` în familia resource.
8. **D01/N01** — **1010 e la edge-ul Cloudflare, în fața întregului Worker** (root blocat identic; Chrome/curl/UA-gol → 200 fișier identic 572.762 B PK-valid). Remediere: nota UA mutată și în capitolul `dataset_export`; decizie ISC2: **fără excepție WAF** pe endpoint public neautentificat.

**Specialiști recomandați:** orchestrate-api (R01/D21/D11 contracte), orchestrate-performance (N07-B bundle, D11 payload), orchestrate-devops (D12 poartă CI), orchestrate-security (D01 decizie BFM — recomandare NU), orchestrate-validator (baterie + probe live).

**Fișiere-cheie** (index complet în PLAN.md): `lib/mcp/tools.ts`, `lib/mcp/server.ts:44`, `app/api/places/route.ts:9`, `lib/live/justice.ts:78-81`, `app/api/experts/route.ts:19`, `scripts/build-geography.py:23-29`, `public/places/cities.json`, `app/api/localities/route.ts:9-13`, `lib/live/adapters.ts:140`, `lib/live/resources.ts:41-53,:82,:85-93`, `lib/live/source-xml.ts:209-216`, `app/api/resource/route.ts`, `app/api/resource-file/route.ts`, `app/api/mcp/route.ts:58-66`, `scripts/import-mers-tren.mjs:104,:166`, `scripts/verify-mers-tren.mjs`, `scripts/verify-source-errors.mjs:211/:343/:393/:1199`, `scripts/verify-mcp.mjs:99-111`, `docs/mcp.md`.

**Decizii de coordonare:** enum fără aliasuri (R01); placeholder=`/[1-9]/` heuristică conservatoare (R02); N07 = B+A (pending confirmare owner — mărime bundle); matchNote nu matchScore (D21); importer numără doar trenuri cu ≥1 escală reală (D12); phantom diagnostic LSP `courtInstitution` — fals, `lib/live/legal.ts:51` îl exportă.
