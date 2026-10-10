# Runda 5 — Plan de remedieri după auditul extern (A01–A30)

**Sursă:** `~/Downloads/Aflivra_Defecte_Si_Remedieri_Cod_2026-10-10_1954.md` — 30 de constatări, prins pe commit `b351e961130ff87684462976f1ad5ff424afa` (= HEAD main la analiză; liniile citate au fost re-confirmate în cod în această sesiune).
**Mod:** sesiune /build standalone. `SESSION_DIR = ssnc-agent-orch/2026/10/10/runda5-audit/`. Constituție = `CLAUDE.md` global + convențiile din runda 3/4 (feedback onest, „lipsă" ≠ zero, qualityFlags-nu-reparare).

## Directive de proces (obligatorii, de la utilizator)

1. **Întâi toate remedierile cod-fixabile**, structurate pe loturi de implementare — nu ciclu TDD-per-task.
2. Fiecare remediere primește **celula de poartă scrisă odată cu codul** (verify-source-errors.mjs / verify-mcp.mjs / e2e), dar **bateriile rulează la final**, țintit pe ce s-a schimbat, apoi complet.
3. După baterii: **build → deploy → audit live** (`scripts/verify-mcp-live.mjs`; exit 2 = sursă degradată onest = acceptabil, exit 1 = avarie de transport = blocant).
4. Fără refactorări dincolo de remedieri; păstrăm stilul existent (denumiri românești în aserțiuni/mesaje, etichete oneste).
5. Runda 1–4 rămâne livrată și verificată — nu se replanifică nimic din ea (auditul confirmă: Săcele/Predeal, q gol, pointKind, XML Office, D25, law_document summary).

## 0. Sinteză clasificare

| Clasă | Nr. | Itemi |
|---|---|---|
| (a) FIX COD — se implementează acum | 21 | A01 A02 A03 A05 A06 A09 A11 A16 A17 A19 A20 A21 A22 A23 A24 A25 A26 A27 A28 A29 A30 |
| (b) DOC/LIMITĂ — se documentează onest, fără code-fix | 6 | A04 A10 A12 A13 A14 A15 |
| (c) INFRA/EXTERN — depinde de sursă/infra, se degradează onest + diagnostic | 3 | A07 A08 A18 |

## 1. Tabel de clasificare A01–A30

Legenda coloanei Poartă: VSE = `scripts/verify-source-errors.mjs` (celulă per-rută cu fixture-uri mock), VM = `scripts/verify-mcp.mjs` (seam + schemă + pin-uri), E2E = `e2e/mcp.spec.ts`, DOC = `docs/mcp.md` (capitol per tool, verificat de poarta VM §15).

| ID | Prio | Clasă | Fișiere (audit → confirmat) | Schiță remediere | Poartă |
|---|---|---|---|---|---|
| A01 | P1 | (a) FIX | `lib/live/legal.ts:38-43` (year = anul din `DataVigoare`; zero post-filtrare), `:73-81` (lawLoader acceptă SOAP brut), `lib/mcp/tools.ts:206-209` (descrierea zice „Publication year") | Post-filtrare locală: `items=items.filter(i=>i.year===query.year)`; `data.filterVerification='post-filtered'` + `yearUnknownExcluded:n` (rânduri fără an) + `pageBasis:'source-page'`; `hasMore` rămâne la baza paginii sursei + mesaj „pagina filtrată ≠ total". Descriere tool + docs: **anul din data intrării în vigoare (DataVigoare)**. NU inventăm actYear/publicationYear — SOAP-ul nu le separă (vede Titlu/Numar/DataVigoare/TipAct/Emitent/Publicatie/LinkHtml) | VSE celulă law: fixture 1991/1992/1993 + republicare → doar 1991; unknown-year exclus cu motiv; VM WIRED neschimbat; DOC §law_search |
| A02 | P1 | (a) FIX | `lib/live/forecast.ts:6` (parse validează doar structură/finite), `lib/live/weather.ts:7` (passthrough) | În `parseForecast`, după parsare: dacă `dailyUnits` confirmă mm la `precipitation_sum`/`rain_sum` → ziua cu `rain_sum − precipitation_sum > 0.1mm` primește `qualityFlags:[{day,type:'precipitation-total-inconsistent',…}]`; snowfall (cm) exclus din comparație numerică; **fără corecție, fără însumare automată**; tolerăm rotunjirea (0.05mm nu flag) | VSE celulă forecast cu răspunsul real păstrat (total 0 + rain 1.8 → flag; 0.05 → fără flag); DOC §weather_forecast |
| A03 | P1 | (a) FIX | `app/api/weather/route.ts:16-19` (start<0 → `rows.slice(0,hours)` servește trecutul) | `start<0` → `hourly=[]` + `warning:'forecast-horizon-expired'` + `hoursRequested/hoursReturned/horizonEnd/windowComplete:false, windowStart:null` (snipped-ul auditului). 168→163 rămâne legitim: `windowComplete:false` + `horizonEnd` explică fereastra sursei | VSE celulă weather (C03 reprodus: prognoză expirată → 0 ore servite); eventual pin E2E window 48/30 |
| A05 | P2 | (a) FIX | `lib/live/flights.ts:37-44` (uniqueRecords păstrează prima; observedAt=boards[0]), `lib/live/records.ts:2` | `uniqueRecordsLatest(rows,key,moment)` în records.ts: per hex **normalizat** (toLowerCase) păstrează înregistrarea cu `observedAt` maxim; la egalitate → prima în ordinea sursei (determinist). `data.observedAt = publishedAt = latest`; expunem `observedMinAt/observedMaxAt`. Merge + seed-relay folosesc aceeași functie | VSE celulă flights (C05: 4 comenzi ale board-urilor → aceeași alegere; hex cu majuscule nu dublează) |
| A06 | P2 | (a) FIX | `app/api/flights/route.ts:11-15` (`stalenessMinutes` din lastSuccessAt), ref. bun: `app/api/transport-live/route.ts:24-28`, `tranzy-live:19-23` ok | Flights route aliniat la contractul TPBI/Tranzy: `observationAgeSeconds` (din observedAt) + `fetchedAgeSeconds` (din lastSuccessAt) + `isLive`; `stalenessMinutes` dispare sau devine derivat explicit din observationAgeSeconds | VSE celulă; DOC §flights_status |
| A09 | P2 | (a) FIX **cea mai riscantă** | `lib/live/cache.ts:15` (seed fallback: aliasuri agricultura→mediu, 3 ani hardcodați, câmp unic `category`), `app/api/catalog/route.ts:17-19` (`row.category` > inventar), `scripts/import-catalog-snapshot.py:22` (clasificare din `catalog-categories.ts` — sursa unică corectă), `lib/live/catalog-seed.json` (rând cu `category` singular), `lib/live/adapters.ts:52` (versiune `ckan.all-datasets.v3`) | §6 de mai jos — migrare completă: seed cu `categories[]` din inventar, fără aliasuri, clasificator unic = `catalog-categories.ts` (multi-etichetă, fără excluderi forțate), bump versiune cache, `ageFilterApplied` + `totalBasis` în fallback | verify-catalog.mjs extins; verify-packed-seeds.mjs; audit-dead-data.mjs:79 actualizat; verify-recency-policy.mjs; VSE celulă fallback; §6 |
| A10 | P1 | (b) DOC | `lib/live/resources.ts:28,77` (cititorul generic nu deduce unități) — Sector 2/2025 „Pret tranz" fără monedă | DOC: §dataset_table + §anl — `currency:null`, unități ale sursei până la confirmarea editorului (data dictionary extern); **fără** atribuire RON/EUR și fără conversii. Câmp nou de cod nu adăugăm fără consumator (YAGNI — decizia e la editor) | DOC |
| A11 | P2 | (a) FIX | `lib/live/resources.ts:44-45` (coloane = etichete goale → „Coloana N"), `:62-67` (indexTable), `:105-108` (resourcePage) | La indexTable: per-foaie `qualityProfile:{rows,exactDuplicateRows,columns:[{id:'c<i>',label,displayLabel,missingCount,zeroCount}]}` — aditiv în `dataset_table`; `displayLabel` dezenambiguează duplicatele („zona (2)"); exportul CSV/XLSX rămâne cu etichetele originale, identic; nu eliminăm rânduri duplicate | VSE celulă resource: fixture cu 2× „zona" + lipsă/zero → profil reprodus; CSV identic |
| A12 | P2 | (b) DOC | `lib/live/directories.ts:6,18`, `housing.ts:128-136`, `justice.ts:10`, `company-registries.ts:6` — ediții fixate în cod, `fresh` = succes, nu actualitate | DOC: per registru — ediția curentă servită (școli 2025–2026, CNAS, ANCPI agregate lunare, BT bilanț 2024), `period`/editia deja expusă unde există; „descărcare reușită azi ≠ ediție nouă"; nu inventăm câmp `editionCurrent` fără sursă de verificare | DOC (capitolele registrelor) |
| A13 | P2 | (b) DOC | `lib/live/adapters.ts:81,131`, `knowledge.ts:6` — Wikidata labels; fără CUI pentru potriviri fără TVA | DOC: §search_companies — limită de acoperire (nu registru complet de firme), CUI doar cu TVA dovedit (regula există), omonime separate, `country` onest. Index autorizat extern = decizie separată (licență) | DOC |
| A14 | P3 | (b) DOC | `app/api/localities/route.ts:9-13` (pointKind deja onest), `lib/mcp/tools.ts:50-53` (descrierea declară municipality-center) | DOC: §localities_search — municipiu-centrul = aproximare pentru vreme generală, NU adresă; nearby după adresă cere punct precis; sectoarele Bucureștiului au centru comun. Fără câmpuri noi — declarația e deja onestă | DOC |
| A15 | P2 | (b) DOC | `app/api/places/route.ts:7`, `lib/places-query.ts:4`, `scripts/finalize-places.py:17` | DOC: §places_search — obiecte OSM, nu inventar certificat de instituții; lipsuri adrese/oraș declarate; potrivire lexicală ≠ recensământ pe tipuri. Filtre tag/grupări = schimbare de produs, scoasă din rondă | DOC |
| A16 | P2 | (a) FIX | `lib/live/content.ts:5` (lista regex fără `edu-article__body`), `lib/live/source-html.ts:5-22` (sourceElements/sourceAttributes există) | Adaptor edu.ro în `parseArticle`: container `article.edu-article`/`div.edu-article__body` adăugat la listă; titlu din h1; `publishedAt` din `time.edu-article__datevalue[datetime]` (via sourceAttributes); strip `edu-article__related`/meta/acțiuni; când corpul nu se extrage → sumar + `textComplete:false`. **Bump `official.article-body.v4→v5`** (invalidare cache) | VSE celulă content cu fixture HTML real edu.ro (SHA `69f838bb…` din audit): corp + dată, fără recomandate/butoane |
| A17 | P3 | (a) FIX | `lib/live/stories.ts:9-10` (doar mw-editsection eliminat), `lib/live/text.ts:10` (sourceText — tag-uri, nu blocuri) | Înainte de `sourceText`: eliminare **structurală** a blocurilor de navigație/noexport (`ws-noexport` + containerele de navigație Wikisource, identificate pe clasă cu sourceElements); autor/titlu/licență/capitole rămân separate. **Bump `wikisource.complete-story.v1→v2`** | verify-ro-text.mjs extins cu fixture Aleodor: corpul + ordinea paragrafelor păstrate, fără proiecte surori/săgeți/autor repetat |
| A18 | P2 | (c) EXTERN | `docs/mcp.md:21` (UA-notat), `app/api/resource-file/route.ts:5` (ruta servește MIME/nume/dimensiune/hash) | Verificarea regulii Cloudflare (1010 pe urllib) = infra externă; nu dezactivăm protecții. DOC §dataset_export: compatibilitate client HTTP (UA de client real); testarea cu clienții MCP reali intră în Lot 6 (live). 403 raportat ca acces refuzat, nu XLSX corupt — acoperit și de A23 (isError) | DOC + Lot 6 |
| A19 | P3 | (a) FIX | `lib/mcp/tools.ts:7-12` (ToolDef fără integer/min/max), `:56-59` (hours number + clamp silențios în build), `lib/mcp/server.ts:28-49` (validator fără limite numerice) | ToolDef: `type:'integer'`, `minimum`, `maximum`, `minLength`; validator: integer/minimum/maximum → -32602 explicit („Argument „hours" must be an integer between 1 and 168."). `hours` integer 1–168; `page` ≥0; `pageSize` 1–200; `sheet` integer ≥0. `additionalProperties:false` în schema publică (validatorul respinge deja unknown args — consistent). Clamp-ul din build devine inaccesibil (rămâne apărare) | VM celule: hours=0.5 / page=-1 / pageSize=201 / sheet=1.5 → -32602 predictibil; E2E una; DOC tabelele parametrilor |
| A20 | P3 | (a) FIX | `app/api/resource-file/route.ts:14-19` (verificarea `sheet>=d.sheets.length` doar în ramura XLSX; CSV cade în catch generic → 503) | Mută verificarea intervalului foii **înainte** de ramura de format, după veriful 409 (complet/verificat). 409 rămâne la neimportat; 503 doar la eșec real de integritate | VSE celulă: sheet=999 → 400 la ambele formate; workbook 2 foi exportă foaia cerută (D23) |
| A21 | P3 | (a) FIX | `lib/live/events.ts:10` (resolver exact id/name/short), `:15-18` (localStamp fără oră), `offers` (price=0), `app/api/events/route.ts:9` (lista venue la 400 — deja), `public/events/venues.json` | `aliases:[]` în registru (validate la commit), resolver le caută; per item `timeKnown` (are oră publicată) și `priceKnown` (preț publicat — 0 nu înseamnă gratuit, neconfirmat rămâne necunoscut); data fără oră NU devine 00:00. Descoperirea: lista deja în mesajul de 400 + docs | VSE celulă events (alias → aceeași copie; fară oră → timeKnown:false); DOC §events_search |
| A22 | P2 | (a) FIX | `lib/live/housing.ts:138-141` (ID: județ + amplasament tăiat 24 + an; fără localitate; pliere lipsă), consumator `app/api/anl/route.ts:17` | `anlRecordId` = `'anl-'+sha256(județ|localitate|amplasament normalizate NFD complet).slice(0,16)` — fără an, fără tăiere; `editionYear` separat (din `data.edition`), nu în identitate. Diacriticele variantelor → același ID | VSE: extinde celula housing/anl (C15: prefix comun + localități diferite → ID-uri distincte; diacritice → identic); actualizăm aserțiunile vechi de format ID |
| A23 | P2 | (a) FIX | `lib/mcp/server.ts:60-63` (ramura binary ignoră `response.ok`), `app/api/mcp/route.ts:58-66` (orice non-JSON/text → binary, inclusiv 4xx/5xx fără Content-Type) | `makeCallRoute`: BinaryExport doar dacă `response.ok` **și** MIME în allowlist-ul exporturilor (xlsx/csv/pdf/xml); altfel textul erorii devine body → `callTool` produce `isError:true` cu status+mesaj păstrate. `callTool`: `if(response.binary&&response.ok)` | VM celulă seam (C04: 503 fară content-type → isError:true, fără resource_link); E2E opțional |
| A24 | P2 | (a) FIX | `app/api/mcp/route.ts:80,85-87` (header citit + ecou arbitrar), `lib/mcp/server.ts:9-10,72-76` (lista suportată nefolosită la POST) | §7. `SUPPORTED_PROTOCOL_VERSIONS=['2025-06-18']` centralizat; POST cu header nesuportat → 400 cu mesaj (numește versiunile suportate); header absent → 2025-06-18 implicit (compat stateless); header-ul de răspuns = versiunea negociată, niciodată ecou arbitrar; initialize negociază (răspunde 2025-06-18 dacă.clientul cere altceva) | VM (helper exportat + celule) + E2E (2099-01-01→400; fără header→200; 2025-06-18→OK) + DOC §Conectare |
| A25 | P3 | (a) FIX | `lib/mcp/server.ts:88-96` (array acceptat la orice versiune; o intrare invalidă → tot lotul 400), `scripts/verify-mcp.mjs:150-158` (batch tratat ca comportament obligatoriu) | `handleRpc`: body Array → 400 cu un singur mesaj de eroare („la 2025-06-18 un POST = un singur mesaj JSON-RPC"); notificările single (fără id) rămân 202. **Rescriem aserțiunile batch din VM:150-158 în așteptare de respingere** | VM rescris (array valid/mixt/gol → 400); E2E nu folosește batch (verificat) |
| A26 | P2 | (a) FIX | `app/api/mcp/route.ts:46-48` (CORS `*`, Origin neverificat) | §7: `originAllowed = !origin (server-to-server) || origin === new URL(request.url).origin (originea proprie)`. POST/OPTIONS cu Origin străin → 403 fără headere CORS; `Access-Control-Allow-Origin` = ecou origine permisă, nu `*`. Client MCP autorizat fără Origin rămâne funcțional (verify-mcp-live NU trimite Origin) | E2E mcp.spec (Origin străin→403; fără Origin→OK; same-origin→OK) + VM helper; DOC §Conectare |
| A27 | P1 | (a) FIX | `scripts/verify-mcp-live.mjs:54-89` (PROBE = șiruri de log), `:118-129` (hasData = prezență), `:27` (data UTC) | PROBE → funcții de validare semantică per tool (fără eval): an legislativ post-filtrat, paginare fără duplicate, lanț search_companies→company_profile pe CUI-descoperit, ediții trenuri active/expirate, windowComplete prognoză, categorii catalog nemapate, export comparat rânduri/celule cu dataset_table. Discoveries din pași precedenți; **output JSON la final**; păstrăm clasificarea OK/degradat(SURSĂ)/avarie și codurile de exit 0/1/2 | Self-reproducerea offline unde se poate; poarta reală = Lot 6 (live) |
| A28 | P2 | (a) FIX | `.github/workflows/pr-validation.yml:3-4` (doar `workflow_dispatch`) | `on:` primește `pull_request:` (branches `[main]`, paths: `app/**, lib/**, e2e/**, scripts/**, public/**, package.json, pnpm-lock.yaml, config wrangler, docs/mcp.md, .github/workflows/pr-validation.yml` — cod + scripturi + contracte de date) și `push:` (branches `[main]`, aceleași paths). `workflow_dispatch` rămâne. Bateriile offline = poarta per PR; audit live rămâne separat (programat/manual) | Inspectare: primul PR declanșează CI-ul (Lot 6); branch protection = configurație GitHub externă (notăm follow-up) |
| A29 | P2 | (a) FIX | `lib/live/refresh-sweep.ts:25` (`todayIso` = UTC), `scripts/verify-mcp-live.mjs:27` (cinema date UTC), `lib/live/date.ts` (există — îl extindem) | `export function romanianDate(date=new Date())` în `lib/live/date.ts` — `Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',…}).formatToParts` (snipped-ul auditului); `todayIso()` din refresh-sweep o folosește; verify-mcp-live o importă transpilată (pattern-ul verify-cache.mjs). UTC rămâne corect pentru timestamp-uri de observație | VSE/verify-refresh-sweep celulă: 00:30 vara și iarna → ziua românească; DST nu mută data; cereri cu dată explicită rămân neschimbate |
| A30 | P2 | (a) FIX | `lib/live/cache.ts:75-77` (catch persistă doar `e.message`), `lib/live/adapters.ts:6-8` (SourceDiagnostic există și se pierde), view `cache.ts:45-48` | Coloană `error_diagnostic TEXT` în `source_cache` (migrare D1 prin pattern-ul existent — `scripts/db-migrate.mjs` + `scripts/dev-d1-schema.mjs`; idempotentă verificată în CI cu dublă rulare); la catch: persistăm JSON sanitizat `{sourceKey,stage:'load',category,httpStatus,attempts,retryAfter,delay,observedAt}` — fără chei/API headers/corpuri; `view()` expune `errorDiagnostic` în SourceState | verify-cache.mjs: fixture SourceError cu diagnostic → rândul stale servește errorDiagnostic; migrarea idempotentă |

Notă la A02 — auditorul sugera și „blochează recomandările dependente de câmpurile inconsistente": în produs nu există recomandări care să depindă de totaluri, deci rămâne doar `qualityFlags` (declarat, nu corectat).

## 2. Loturi de implementare

Ordinea respectă prioritățile auditului (P1 întâi) și livrările 1–5 din planul auditorului (liniile 625–635), rearanjate după dependențe și risc. Fiecare remediere = implementare + **scrierea** celulei de poartă; rularea completă = Lot 6.

### Lot 1 — Corectitudine (audit Livrarea 1)
1. **A20** — mută verificarea foii (10 minute, izolat).
2. **A29** — `romanianDate()` + înlocuiri (refresh-sweep, verify-mcp-live).
3. **A03** — fereastră meteo fără trecut + metadatele orei.
4. **A05** — fuziune ADS-B pe observedAt maxim + hex normalizat.
5. **A02** — qualityFlags contradicții precipitații (unități verificate).
6. **A01** — post-filtrare an legislativ + filterVerification + descriere onestă.
   *Verificare înainte de închidere: nicio prognoză trecută servită drept viitor; filtre și momente coerente.*

### Lot 2 — Catalog și identitate (audit Livrarea 2)
1. **A22** — ID ANL hash stabil + editionYear + actualizarea aserțiuniluo vechi.
2. **A11** — qualityProfile + columnMeta aditiv pe foile de tabel.
3. **A09** — §6, ultima în lot (atinge seed, cache, route, versiune, patru porți). A10 (DOC) se leagă aici topic, se scrie în Lot 5.
   *Verificare: migrare seed/cache atomică; categorii identice live vs fallback; agricultura nu mai cade în mediu; APIA găsit în agricultură.*

### Lot 3 — Contract MCP și prevenție (audit Livrarea 4)
1. **A19** — scheme integer/min/max + validator + respingeri explicite.
2. **A23** — binary doar pe ok + MIME allowlist.
3. **A24** — versiuni centralizate + 400 pe necunoscut.
4. **A25** — un singur mesaj per POST; rescriere celule VM:150-158.
5. **A26** — Origin allowlist (originea cererii + fără Origin) + 403 străin.
   *Verificare: matrice pe versiuni; erori binare; CI pregătit; docs §Conectare actualizat ÎNAINTE de deploy (breaking declarat).*

### Lot 4 — Observabilitate și date oneste (partea de cod a Livrării 3)
1. **A30** — diagnostic persistat (migrare D1) — înainte de A06 ca să prindă câmpul în fixture-e.
2. **A06** — uniformizare observationAgeSeconds/fetchedAgeSeconds pe flights + tranzy.
3. **A27** — rescrierea auditului live cu probe semantice (cel mai mare script).
   *Verificare: diagnostice pe etapă; vârste uniforme; auditul live execută semantic.*

### Lot 5 — Conținut, experiență și trecerea DOC (audit Livrarea 5)
1. **A16** — adaptor edu.ro + bump v5.
2. **A17** — corp literar fără navigație + bump v2.
3. **A21** — aliases registru + timeKnown/priceKnown.
4. **Trecerea DOC** (A04, A10, A12, A13, A14, A15, A18, A07, A08): docs/mcp.md — capitol per tool + descrierile tool-urilor afectate + §„Ce NU expune conectorul"; limitările intră onest („ultima observație disponibilă", currency null, edițiile, obiecte OSM, descoperirea instituțiilor).
   *Poarta VM §15 (docs-coverage) trebuie să rămână verde — capitolele noi fac parte din verificare.*

### Lot 6 — Validare finală, deploy, live
1. Baterii țintite pe ce s-a schimbat (VSE pe familiile atinse, VM, verify-catalog, verify-cache, verify-ro-text, verify-refresh-sweep, verify-packed-seeds, verify-recency-policy, audit-dead-data).
2. `corepack pnpm lint` + `corepack pnpm exec tsc --noEmit`.
3. `corepack pnpm build` + seed-snapshots restore/clean-tree (pas din CI).
4. `node scripts/deploy.mjs` (deploy real).
5. `node scripts/verify-mcp-live.mjs` — accept `exit 0` sau `exit 2` (degradări oneste de sursă), blocăm la `exit 1`.
6. A28: confirmăm că PR-ul care aduce remedierile declanșează pr-validation automat.
7. STATUS.md wrap-up („Wiki Changes"-style rezumat per remediere).

## 3. Riscuri și capcane

**Top 3:**

1. **A09 — migrarea seed-ului trebuie atomică.** Regenerarea `catalog-seed.json` + `pack-live-seeds.py` + bump `ckan.all-datasets.v3→v4` + rescrierea `cache.ts:15` + `enrichCatalogClasses` — toate în aceeași livrare; altfel fallback-ul servește clasificarea veche sau porțile plesnesc: `audit-dead-data.mjs:79` citește `r.category` din seed (trebuie `categories`), `verify-catalog.mjs`, `verify-geographic-scope.mjs` (server seeds conțin chei `catalog:`), `verify-recency-policy.mjs` (fereastra de 3 ani rămâne politică declarată, acum cu `ageFilterApplied` vizibil). Pașii exacți în §6.
2. **A24+A25 — breaking pentru clienți reali.** Clienți care trimit header de versiune vechi (2025-03-26/2024-11-05) sau batch-uri JSON-RPC vor primi 400. Conform transportului 2025-06-18, dar **docs/mcp.md §Conectare se actualizează înainte de deploy** și rescriem `verify-mcp.mjs:150-158` (batch-ul devine respingere, nu comportament). Batch-ul nu apare în e2e (verificat) — poarta e VM.
3. **Versiuni de cache la formă nouă de date (A16/A17/A09).** `cachedCopyServes` compară `adapter_version` — fiecare loader cu formă nouă își face bump (`official.article-body.v4→v5`, `wikisource.complete-story.v1→v2`, `ckan.all-datasets.v3→v4`), altfel copiile D1 vechi supraviețuiesc și servesc forma veche. La A22 ID-urile `_id` se schimbă per rând la servire (consumatorii externi ai `_id`-ului văd identități noi) — declarat în docs.

**Alte capcane:**
- **A03:** UI-ul poate citi `hoursApplied` — înainte de a-l înlocui cu `hoursRequested/hoursReturned`, grep pe consumator (`app/`) și actualizare în același pas.
- **A19:** clamp-ul din `build()` devine inaccesibil (validatorul respinge înainte) — nu-l ștergem, rămâne apărare în profunzime; verificăm pin-urile VM WIRED existente (hours:'48' default rămâne pentru absență).
- **A25:** notificările single (fără `id`) rămân 202 — nu se ating; doar body Array devine 400.
- **A26:** în dev, Playwright nu trimite Origin → OK (server-to-server); same-origin browser → OK; testăm și preflight (OPTIONS străin → 403 fără headere CORS).
- **A23:** allowlist MIME-ul exporturilor ca să nu ageze legitimi noi binari la viitor (xlsx/csv/pdf/xml — exact ce servește ruta).
- **A30:** migrarea D1 intră și în `scripts/dev-d1-schema.mjs` (e2e cold-start) + fixture-ul sqlite din verify-cache.mjs; rularea dublă idempotentă e deja în CI.
- **A27:** scriptul folosește descoperiri din pași precedenți (IDs reale), fără date hardcodate per一定是 run; toleranță la stările `stale/unavailable` (clasă 2), exit 2 nu blochează deploy-ul.
- **A28:** path filters trebuie să includă `lib/live/seed-snapshots.json` (e sub `lib/**`) și `public/**` (contracte de date); fără paths, orice PR de docs ar arde minute de CI.
- **A01:** `hasMore` nu se „repară" prin numărare totală — sursa nu o oferă; declarăm baza paginii (`pageBasis:'source-page'`) și `yearUnknownExcluded`.

## 4. Recomandare specialiști

**Niciun specialist obligatoriu** — remedierile sunt în-repo (TypeScript Workers, scripturi .mjs, yml, migrare D1 trivială) și eu coordonez direct cu Builder/Validator. Note:
- `orchestrate-devops` — opțional, consult scurt pentru A28 (path filters + recomandarea de branch protection). Branch protection rules = configurație GitHub externă, nu code-fix → intră ca follow-up extern.
- `orchestrate-security` — nu e nevoie: A26 este conformanță transport fixată prin directivă (allowlist = originea proprie + fără Origin), fără suprafețe noi de auth; A18 nu atinge reguli Cloudflare (rămân externe).

## 5. Advocate Review

Status: **Not Run** (nu există `ADVOCATE-REVIEW.md` în SESSION_DIR).
Key decisions incorporated: clasificarea (a)/(b)/(c) respectă recomandările auditorului per item; loturile urmează planul pe livrări din audit (liniile 625–635), rearanjate după dependențe.
External dependencies: fără (A07/A08/A18 sunt degrade-onest, nu ticker-e externe).

## 6. A09 — pașii exacți de migrare (seed catalog)

**Țintă:** aceleași `categories` pe toate căile (live CKAN, inventar local `public/catalog/index.json`, fallback seed), fără aliasuri care schimbă sensul; `categories` = reprezentare canonică multi-etichetă din `catalog-categories.ts` (o singură sursă de clasificare).

1. **Regenerăm `lib/live/catalog-seed.json` din inventar** (`public/catalog/index.json`, generat de `scripts/import-catalog-snapshot.py`): păstrăm câmpurile folosite de fallback (`id,title,organization,notes,modified,url,license,resourceCount,formats,resources`) + înlocuim `category` (singular) cu `categories` (array din inventar). Script de derivare comis (one-shot, ex. `scripts/derive-catalog-seed.mjs`) — nu editare de mână.
   - Nu forțăm excluderi între categorii (multi-eticheta rămâne: un set poate fi și `agricultura` și `cultura` dacă ambele interogări se potrivesc) — evită supracorectarea „set cultural real exclus".
2. **`scripts/pack-live-seeds.py`** → re-pack `seed-snapshots.json` (procedura build; `verify-packed-seeds.mjs` verifică egalitatea de octeți cu corpusul de pe disc).
3. **Bump versiune loader** `lib/live/adapters.ts:52`: `ckan.all-datasets.v3` → `ckan.all-datasets.v4` → rândurile D1 vechi nu mai sunt servite (`cachedCopyServes` respinge `adapter_version` diferit) și se reîmprospătează la prima cerere (budget `ckan` 500/h acoperă).
4. **`lib/live/cache.ts:15` (`getSeed` pentru `catalog:`):** eliminăm mapa de aliasuri `{energie:'mediu',agricultura:'mediu',filme:'cultura',stiri:'justitie'}`; filtrul devine `r.categories?.includes(category)`; păstrăm fereastra de 3 ani (politică verificată de `verify-recency-policy.mjs`) și expunem onest: `ageFilterApplied:true, totalBasis:{seedRows:N, afterAgeFilter:M}` în data fallback.
5. **`app/api/catalog/route.ts:17-19` (`enrichCatalogClasses`):** inversează precedența — clasificarea din inventarul verificat întâi (`classes.get(id)`), `row.category` vechi doar ca rezervă explicită (etichetată `categorySource:'legacy-seed'`), niciodată în fața inventarului.
6. **Porți actualizate în același pas:** `verify-catalog.mjs` (categorii identice live/fallback; căutarea `agricultura` nu returnează generic „mediu"; parcele APIA găsite în agricultură; set cultural real păstrat), `audit-dead-data.mjs:79` (citește `categories`, nu `category`), `verify-geographic-scope.mjs` (cheile `catalog:` din server seeds), `verify-recency-policy.mjs` (disclosure `ageFilterApplied`), celulă VSE pentru fallback.

**Regula de aur:** seed + pack + bump + cod + porți se livrează împreună — repararea funcției de afișare fără bump de versiune lasă filtrarea de rezervă pe clasificarea veche.

## 7. Contractul MCP 2025-06-18 (A24/A25/A26)

Centralizat în `lib/mcp/server.ts`:

```ts
export const MCP_PROTOCOL_VERSION='2025-06-18';
export const SUPPORTED_PROTOCOL_VERSIONS=[MCP_PROTOCOL_VERSION]; // doar 2025-06-18
```

- **Versiune (A24):** POST cu `Mcp-Protocol-Version` prezent și nesuportat → `400` (eroare JSON-RPC cu mesajul care numește versiunea suportată). Header absent → `2025-06-18` implicit (stateless). Header de răspuns = versiunea efectivă, niciodată ecou al șirului cerut. `initialize` negociază: răspunde `2025-06-18` dacă clientul cere altă versiune (contract documentat).
- **Mesaj unic (A25):** body Array la POST → `400`, mesaj unic de eroare; notificarea single fără `id` rămâne `202`. Update obligatoriu: `scripts/verify-mcp.mjs:150-158` (batch → respingere).
- **Origin (A26):** `originAllowed = !origin || origin === new URL(request.url).origin`. Origine străină → `403` la POST și OPTIONS, fără headere CORS; origine permisă → `Access-Control-Allow-Origin` = originea cererii (nu `*`); fără Origin (server-to-server, clienți MCP, audit live) → OK.
- **Breaking declarat:** docs/mcp.md §Conectare se actualizează înainte de deploy (A24/A25 resping clienți vechi — intenționat, conform transport 2025-06-18).

## 8. Fișiere-cheie returnate echipei

- `ssnc-agent-orch/2026/10/10/runda5-audit/PLAN.md` (acest fișier) — clasificarea + loturile + pașii A09/A24-26.
- `ssnc-agent-orch/2026/10/10/runda5-audit/STATUS.md` — progres + Architect Findings.
- `ssnc-agent-orch/2026/10/10/runda5-audit/conventions.md` — convențiile de stack pentru toți agenții.
- Audit sursă: `~/Downloads/Aflivra_Defecte_Si_Remedieri_Cod_2026-10-10_1954.md`.
- Istorice rundele 1–4: `ssnc-agent-orch/2026/10/09/round3/`, `round4/`.
