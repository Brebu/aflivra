# Surse românești noi — analiză de arhitectură (10.10.2026)

**Sursa faptelor:** `~/Downloads/Aflivra_Surse_Romanesti_Testate_2026-10-10_3070.md` (citit integral; 57 probe HTTP reale, 4 apeluri MCP, referință commit `b351e96`). Directivele utilizatorului: «implementează toate aceste noi surse, bagă-le sub categoriile existente și expune-le în MCP».
**Mod:** sesiune de analiza r, read-only pe cod — acest ARCHITECT.md este singurul artefact. Implementarea se face într-o sesiune /build ulterioară, **după runda 5** (`ssnc-agent-orch/2026/10/10/runda5-audit/PLAN.md` nu se replanifică).
**Constituție:** CLAUDE.md global + convențiile durabile din rundele 1–5: fără date inventate (lipsă ≠ zero), qualityFlags nu corecții, stări explicite fresh/cached/stale/unavailable, proveniență, descrieri MCP în engleză cu numele exacte ale câmpurilor, erori în română.
**Extensibilitate:** `.claude/ssnc-agent-orch/agents.yaml` și `git-workflow.yaml` absente — rol standard, fără ținte de extensie.

---

## 0. Verdict pe surse (11 evaluate)

| # | Sursă | Verdict |categorie | Pattern | Tool MCP |
|---|---|---|---|---|---|
| 1 | SITUR (se.situr.gov.ro) | **RDY** — corpus static | firme (cea mai puțin greșită) | (b) import offline + servire din corpus static | `tourism_registry` |
| 2 | AMCCRS (amccrs-pmb.ro) | **RDY** — corpus static | local (cea mai puțin greșită) | (b) import offline (flux nonce în script) + index adresă | `seismic_buildings` |
| 3 | INS TEMPO (:8077) | **RDY condiționat** — probă live din Workers pe HTTP:8077 | local (POP105A; pe materie) | (a) loader direct cu payload matrice | `ins_series` |
| 4 | ANRE/POSF (posf.ro) | **RDY condiționat** — probă live din Workers | energie (curat) | (a) loader direct, parametri exacți + deduplicare + flag eligibilitate | `energy_offers` |
| 5 | Transelectrica SEN | **RDY condiționat** — probă live din Workers | energie (curat) | (a) loader direct, TTL scurt, onDemand | `power_system` |
| 6 | INFP/EIDA | **HOLD** — doar istoric (204 pe 2026, timeout pe 2025–2026) | mediu (dacă se face) | (a) FDSN text | `seismic_events` (nu v1) |
| 7 | INP/LMI | **HOLD** — bază 2015, structura de rânduri nereconstruită | cultura (dacă se face) | (b) corpus | — (nu v1) |
| 8 | ONRC | **BLOCKED/RETEST** — 502 proxy-TLS; degradare onestă existentă în catalog | firme | — (fără implementare) | — |
| 9 | SEAP/ADR | **BLOCKED/RETEST** — metadate din cache (04.10.2026), resursa `unavailable` onest | bani | — (degradarea existentă e deja onestă) | — |
| 10 | admitere.edu.ro | **BLOCKED/RETEST** — 502 ×3 (listă 2026, start, arhivă 2025) | educatie | — | — |
| 11 | RNMCA calitateaer.ro | **BLOCKED extern** — 401; cere credențiale de la instituție; spec OpenAPI fără `securitySchemes` (nu se deduce acces anonim din spec) | mediu | — (decizie externă, nu code-fix) | — |

Sursele blocate **nu se implementează** — se documentează ca degradări oneste (§3). Cele două HOLD rămân opcionale, la cerere de produs.

---

## 1. Sursele RDY — detalii de integrare

### 1.1 SITUR — registrele turistice (prioritatea 1)

**Fapte testate:** 3 exporturi XLSX complete — cazare 32.058 rânduri / 18 câmpuri (3,9 MB, SHA `2eb48e82ab68`), alimentație 9.063 / 13 (835 KB), agenții 3.104 / 13 (400 KB). CUI lipsă: 7.259 / 23 / 124; detaliu de adresă lipsă: 2.443 / 1.806 / 33. Titlul exportului declară actualizare 10.10.2026; pagina index afișa 09.10.2026 — două date separate, nu se uniformizează. Foia „Listă": rândurile 1–4 goale, rândul 5 titlu, rândul 6 antet. Rute: `GET https://se.situr.gov.ro/OpenData/ExportToExcel?type=listaCazari|listaAlimentatie|listaAgentii`.

**Categorie:** `firme` — registru de **clasificare/licențiere a operatorilor economici** (denumire operator, CUI, autorizație/licență cu data emiterii — exact limbajul registrului comercial); turismul e forma de activitate, nu categoria de date. Nu există categorie „turism" printre cele 14; adăugarea uneia e decizie de produs, nu se inventează aici. Documentat ca „cea mai puțin greșită".

**Pattern — (b) corpus static, model trenuri** (`lib/live/trains.ts`):
- Script offline `scripts/import-situr-snapshot.py` (rulează local/la PR, **nu în Worker**): descarcă cele 3 XLSX, detectează antetul **după conținut** (precedent: `parseAnlSites` din `lib/live/housing.ts:34-41` — `headerIndex` pe regex de coloane, niciodată offset fix), scrie corpus JSON compact: index pe județ/localitate + shard-uri de rânduri cu **coloanele originale** (18/13/13), gzip + SHA-256 înregistrate în `public/data/snapshot-transport.json` (alături de probele `/trains/*`).
- Fiecare rând păstrează: numărul autorizației/licenței, data emiterii, categoria, localitatea/județul original, CUI (`null` onest acolo unde lipsește — 7.259 la cazare; numărul lipsurilor declarat în profilul corpusului, model `qualityProfile` din `lib/live/resources.ts:63`).
- Cititor `lib/live/situr.ts` (model `trains.ts`: `fetchAsset` cu verificare SHA-256, cache in-memory 10 min, servire paginată `paginate` + `matchesQuery`).
- Index secundar pe CUI (doar rândurile cu CUI valid) pentru lanțul `tourism_registry → company_profile` (ANAF) — potrivire fiscală dovedită, nu lexicală.
- Normalizare județe/localități la servire: `foldTrainText` (cedilla ş/ţ → ș/Ț **înainte** de `normalizeSearch` — `lib/live/query.ts` nu pliază cedilla) + `countyName`/`localityName` din `lib/geographic-scope.ts:12-14`.
- Ediții: `exportDate` (din titlul exportului) separat de `pageDate` (din pagina index) — ambele servite, fără suprascriere.
- Refresh: ritual declarat — rulare script + PR (path-urile CI A28 acoperă deja `scripts/**` și `public/**`).

**Tool:** `tourism_registry` — schema în §5. Descrierea (EN) declară onest: registru de licențiere, NU prețuri/ocupare/rezervări; `cui: null` la rândurile fără CUI; licență de reutilizare comercială neconfirmată.

**Poartă:** `scripts/verify-situr-corpus.mjs` (model `verify-trains-corpus.mjs`: numerele de rânduri 32.058/9.063/3.104 + SHA-256 + contor CUI lipsă declarat) + celulă VSE per rută (`verify-source-errors.mjs`) + VM schemă/denumiri + capitol `docs/mcp.md`.

### 1.2 AMCCRS — încadrarea seismicăpedia București (prioritatea 2)

**Fapte testate:** Ninja Tables `table_id=2383`, 2.798 rânduri cu ID-uri unice, 1,6 MB JSON, pagina declară actualizare 06.10.2026. Cerere: `GET /wp-admin/admin-ajax.php?action=wp_ajax_ninja_tables_public_action&table_id=2383&target_action=get-all-data&...&ninja_table_public_nonce=<extras din pagina curentă>`. Paginarea 10+10 validată identică cu segmentele descărcării complete. 48 forme text distincte în „ultima încadrare" (inclusiv un nume de persoană și o valoare goală). Normalizare exploratorie (calcul de test, nu rezumat oficial): RsI 415, RsII 491, RsIII 163, RsIV 11, consolidate 118, urgență 1.454, neîncadrate 144, neclasificabile 2. Categoriile de urgență se păstrează distincte — fără echivalare automată cu clasele Rs.

**Categorie:** `local` — registru urban al PMB despre clădiri; „Localități / urban" e cea mai puțin greșită. Încadrarea seismică NU e `mediu` (vreme/poluare) și NU e `sanatate`. Nu există categorie „construcții/locuințe" (nici ANL n-are categorie de locuri — e tool de sine stătător).

**Pattern — (b) corpus static, flux nonce în script:** la fel ca SITUR, cu diferența că scriptul de import execută fluxul în doi pași: GET pagina `https://amccrs-pmb.ro/lista-imobile-2/` (204 KB) → extragere nonce + table_id din HTML-ul configurării → GET JSON-ul complet. **Nonce-ul trăiește în scriptul offline, nu în Worker** — izolează volatilitatea (expirare necunoscută, „nu presupune că nonce-ul sau ID-ul tabelului sunt permanente").
- Fiecare rând păstrează **ambele** clase: `originalClass` (textul sursă, integral, inclusiv cele 48 de forme) și `normalizedClass` (enum: `RsI|RsII|RsIII|RsIV|consolidata|urgenta|neincadrata|neclasificabila`) + numărătoarea formelor în profilul corpusului.
- Index pe adresă fold (stradă + număr + sector, diacritice pliate cedilla+comma-below) cu încredere de potrivire: `exact` (un singur rezultat) / `ambiguous` (mai multe) — precedate de o căutare liberă `q`.
- **Onestitate obligatorie:** adresă absentă = „nu am găsit o înregistrare", NU „clădire sigură" — în descrierea tool-ului, în docs și în mesajul rezultatului. Nu se deduce situația cadastrală/juridică.

**Tool:** `seismic_buildings` — schema în §5. Descrierea declară: acoperire **doar București**; clasele publicate, nu un verdict de siguranță.

**Poartă:** `verify-amccrs-corpus.mjs` (2.798 + unicitate ID-uri + SHA-256 + contorul celor 48 forme) + VSE + VM + docs.

### 1.3 INS TEMPO — serii statistice (prioritatea 3)

**Fapte testate:** POP105A („Populația rezidentă la 1 ianuarie..."), rutele HTTP pe port 8077 au funcționat: `GET/POST http://statistici.insse.ro:8077/tempo-ins/matrix/POP105A`, `POST /tempo-ins/pivot`. 9 rânduri × 3 județe × 3 ani verificate (Cluj 693.413→701.564; Brașov 557.143→564.632; București 1.721.475→1.713.832). Metadatele declară actualizare 10.09.2026. În HTML, 2024 = îngroșat (revizuit), 2026 = subliniat (provizoriu); CSV pierde marcajele. Limite oficiale client: 30.000 combinații / 500 selecții pe dimensiune. Varianta HTTPS `/tempoins` a dat 502 prin proxy — inconcludent.

**Categorie:** `local` pentru POP105A (serie demografică pe județe/teritorii — context teritorial). **Principiu de clasificare pe materie, nu pe sursă:** dacă adaptorul se extinde la serii economice → `bani`, sanitare → `sanatate`. Nu se schimbă nimic în `catalog-categories.ts` pentru asta (clasifică doar seturile CKAN).

**Pattern — (a) loader direct** (`lib/live/tempo.ts`, model weather/housing):
1. `GET /tempo-ins/matrix/POP105A` → metadatele matricei (unitate, perioadă, legendă revizuire, `dimensionsMap`) — **nu se hardcodează ID-urile de ani**: nomItemId 4893/4912/4931 sunt anii 2024–2026 și îmbătrânesc; anii recenți se derivă din `dimensionsMap` la fiecare încărcare.
2. `POST /tempo-ins/matrix/POP105A` cu payload-ul `arr` construit din `dimensionsMap` (structura exactă testată e în anexa fișierului-sursă; atenție la etichetele cu spații finale — „Total " pentru nomItemId 105/108 — se reproduc exact cum le servește sursa).
3. Statut revizuit/provizoriu: marcat **tipografic** în HTML și pierdut în CSV — **punct de verificare deschis la implementare**: dacă răspunsul JSON nu poartă statutul, NU se inventează; se servește fără statut, cu nota onestă că sursa îl marchează doar vizual.
4. Limitele 30.000/500: adaptorul v1 se limitează la subsetul validat (total vârstă/sex/mediu + max 3 teritorii + max 3–5 ani); payload-ul construit rămâne sub limite prin construcție.

**TTL:** 86400 (date anuale, revizuite rar); **buget** — cheie nouă `ins` (60/h) în mapa de bugete din `lib/live/cache.ts:74-81`.

**Condiție RDY (blochează expunerea MCP):** probă live din Workerul deployat pe `http://...:8077` — fetch din Workers către HTTP pe port non-standard e **neconfirmat** (testul a rulat local, nu din infrastructura Cloudflare; fișierul-sursă avertizează explicit). Poarta: o probă de diagnostic din deployment (extensie a `verify-mcp-live.mjs`). Dacă Workers nu poate: **fallback declat** — intermediar extern ghRelayed (model AFIR/flights/bia din `refresh-groups.json`) care face GET/POST și predă la o rută `/api/seed/ins`; dacă nici asta nu e dorită → HOLD onest. Nu se dezactivează nicio verificare.

**Tool:** `ins_series` — schema în §5. Descrierea: unitatea (persons), data de referință 1 ianuarie, statutul provizoriu/revizuit ce există la sursă, limitele declarate; catalogul CKAN are intrarea TEMPO cu CC BY 4.0 — întinderea asupra fluxului API direct rămâne de verificat.

### 1.4 ANRE/POSF — oferte energie electrică (prioritatea 4)

**Fapte testate:** `GET https://posf.ro/comparator/api/index.php?request=get-judete` + `request=comparator-electric&...` cu parametri exacți (anexa fișierului-sursă). Zona 7 = București/Muntenia Sud: 170 rânduri brute → 85 oferte distincte, 46 furnizori; zona 3 = Brașov/Transilvania Sud: 148 → 74, 38. Unitate uniformă `lei/kWh`; 20 rânduri brute per răspuns menționează „prosumator" în denumire sau linkul PDF. Varianta cu etichete nemapate → 422 cu explicații. `Content-Type` HTML, corp JSON.

**Categorie:** `energie` — curat, fără rezerve.

**Pattern — (a) loader direct** (`lib/live/posf.ts`):
1. `get-judete` cached (TTL 86400) → harta județ→`id_zona` din lista publicată de POSF, **nu hardcodată** (7/3 confirmate prin test; restul se validează la implementare pe eșantion).
2. `comparator-electric` cu parametri exacți testați: `tip_client=casnic`, `tip_oferta=0`, `tip_pret=nediferentiat`, `nivel_tensiune=JT_`, `tip_produs=0`, `data_start_aplicare=ZZ-LL-AAAA` (format românesc!), `consum_lunar` + `consum_anual` (= lunar × 12), `id_zona`. Celelalte câmpuri goale ca în anexă.
3. Parser: `JSON.parse` pe corpul text indiferent de `Content-Type` (getSource nu filtrează pe content-type — textul se parsează direct); eșec de parsare → `SourceError` românesc explicit. 422 → `SourceError` cu `httpStatus:422` + explicațiile sursei în diagnostic (contractul A30), NU reinterpretate.
4. Deduplicare: `uniqueRecords` (`lib/live/records.ts`) pe identificatorul ofertei + zonă; contorul duplicatelor identice servit (`duplicateIdenticalRows: 85` etc.) — onest, fără eliminare silențioasă.
5. Eligibilitate: rândurile prosumator primesc flag `prosumator:true` (detectat din denumire/link PDF, affichat); **nu se elimină și nu se recomandă** — descrierea tool-uluideclară explicit că prețul cel mai mic nu e o ofertă disponibilă oricui.
6. Se păstrează: preț lei/kWh, componentele de tarif, componenta fixă, factura calculată de comparator (valori near-round), perioada de ofertare separată de cea de aplicare, linkul PDF.

**TTL:** 86400 (ofertele se schimbă rar; data comparatorului servită); **buget** `posf` 60/h. `valoare_factura_curenta=300` a fost ipoteză de test — la implementare fie parametru opțional (`currentBillLei`, documentat ca bază de calcul a comparatorului), fie se探索ă omisiunea; nu se inventează factura utilizatorului. Punct deschis de verificat.

**Condiție RDY:** endpointul e clientul web public, nu un API de integrare cu contract de stabilitate — **probă live din Workers** înainte de expunere (WAF/UA `Aflivra/1.0 public-data-source-check`); fallback ghRelayed sau HOLD, la fel ca la TEMPO.

**Tool:** `energy_offers` — schema în §5.

### 1.5 Transelectrica SEN (prioritatea 5)

**Fapte testate:** `GET https://www.transelectrica.ro/web/tel/sen-filter` → JSON ~1 KB, HTTP 200, fără autentificare, de două ori. Structură: **listă de obiecte cu câte o cheie** → se transformă într-un singur obiect (o observație), nu un tabel de observații independente. Probe: `26/10/10 8:28:02` → 3.864 MW producție / 5.462 consum / 1.597 sold; `8:28:28` → 3.870 / 5.468 / 1.597. `consum − producție − sold` = 1 MW. Suma celor 7 componente de producție selectate diferă de total cu 161 MW — contractul de agregare nedefinit. Ceasul sursei era ~61–106 s în urmă (interpretat în ora României — convenție neconfirmată de sursă).

**Categorie:** `energie` — curat.

**Pattern — (a) loader direct, onDemand** (`lib/live/sen.ts`):
- TTL **60 s**; familia intră în `onDemand` din `refresh-groups.json` (model `transport.realtime`) — **nu în grupurile cron**, ar arde bugetele pe ture. Buget `transelectrica` 120/h.
- Transformarea listă→obiect se face la parsare; câmpurile servite cu denumirile sursă.
- Timestamp `YY/MM/DD HH:MM:SS` (an cu 2 cifre): parse cu fereastră 2000+YY; se păstrează `observedAtText` original + `observedAt` ISO **cu convenția declarată** Europe/Bucharest (română onestă: presupunere documentată, nu confirmată de sursă — legătură cu `romanianDate` A29).
- Vechimea: `observationAgeSeconds` pe `observedAt` sursă (contractul A06) — sursa observă la 1–2 min, deci o vârstă de ~2 min e **normală**, nu avarie; staleness pe `observedAt`, nu pe `lastSuccessAt`.
- Mix energetic (componentele producției): există în răspuns, dar discrepanța de 161 MW la agregare → v1 servește doar producție/consum/sold + componentele **așa cum le publică sursa**, cu nota că reconcilierea completă nu e definită. Fără inventare de agregare.

**Tool:** `power_system` — fără parametri (precedent `ancpi_integrals`), schema în §5. Descrierea: observație de sistem (MW), NU tarife/energie facturabilă.

**Condiție RDY:** proba live din Workers (același gate ca TEMPO/POSF).

---

## 2. HOLD — opționalii istorici (nu v1)

**INFP/EIDA:** stațiile RO (150 rânduri text, 8 coloane) + evenimente istorice filtrate (43–49°N / 20–30°E, 14 coloane) sunt validate; dar septembrie–octombrie 2026 → **204 fără date**, iar 2025–2026 larg → timeout. Endpointul **nu e flux validat de evenimente curente** — nu se deduce lipsa cutremurelor din 204. Dacă se implementează (la cerere): (a) loader FDSN text, TTL 604800 (istoric), tool `seismic_events` cu from/to/bbox-ul validat. Licențele per rețele se păstrează separate. Rămâne HOLD — istoric și infrastructură, fără produs curent.

**INP/LMI:** PDF 3,18 MB / 233 pagini / 2.474 coduri LMI distincte (extras regex) — dar structura completă a rândurilor nereconstruită, baza e 2015, ordinele de actualizare ulterioare se obțin de la Ministerul Culturii. Import de corpus peste un PDF cu structură nereconstruită e fragil. HOLD până la o sursă structurată sau la o decizie de produs (cel mult un index cod→denumire, cu baza 2015 declarată).

## 3. Blocate — documentate ca degradări oneste, NU implementate

| Sursă | Stare observată | Cum se degradează onest |
|---|---|---|
| ONRC | 502 de la `mitmproxy` (certificat expirat upstream), HTTP→HTTPS identic; apel MCP catalog indisponibil | Rutele de catalog existente servesc deja `stale`/`unavailable` cu eroare — comportament corect, se lasă așa. Index denumire→CUI rămâne **candidat pentru retestare**; până atunci, căutarea pe nume rămâne pe registrul deschis (research verdict existent în `lib/live/adapters.ts:53-60`: OD_FIRME 693 MB peste orice plafon). |
| SEAP/ADR | Catalog MCP: 4 intrări din cache (ultima reușită 04.10.2026, setul 2026 declară 14 resurse, modificat 13.07.2026); `dataset_table` pe resursa reală → `unavailable` (timeout) | Degradarea există deja onest în produs (`unavailable` + `stale`); nu se adaugă cod. Retestare după remedierea data.gov.ro/CKAN. |
| admitere.edu.ro | 502 ×3 (listă 2026 București, pagina de start, arhiva statică 2025) | Nicio integrare; retestare sezonieră. Nu s-au accesat și nu se accesează date de elevi. |
| RNMCA | OpenAPI 3.0.1 valid (17 căți, 17 operații); `GET /main/measurements/recent/config/all` anonim → **401**; spec fără `securitySchemes` | 401 = control de acces confirmat, nu defect. Cererea de cont e **decizie externă** (instituție + termeni), nu code-fix; adaptorul nu va deduce acces anonim din spec. |

Toate patru intră în `docs/mcp.md` doar dacă capitolul „surse în așteptare" devine necesar — nu ca tool-uri.

---

## 4. Mapa pe categoriile canonice — și unde se aplică

Cele 14 categorii din `lib/live/catalog-categories.ts` (agricultura, bani, cultura, educatie, energie, filme, firme, justitie, local, mediu, munca, sanatate, stiri, transport) clasifică **seturile CKAN ale catalogului**. Cele 5 surse noi sunt **surse directe, nu seturi CKAN** — prin urmare:

- **nu se modifică** `catalog-categories.ts` pentru ele (nu ar avea efect — interogările CKAN nu se ating);
- categoriile propuse se aplică la: capitolele `docs/mcp.md` (grupare/descriere),UI/familiile de date (dacă sunt expuse), și eventualele feeds viitoare;
- `energie` există deja ca `kind` în `federated_search`/`news_feed` — POSF/SEN se pot alătura acolo ulterior, decizie separată de produs.

| Sursă | Categorie | Curat? | Raționament scurt |
|---|---|---|---|
| POSF | `energie` | da | oferte de energie electrică — exact materia categoriei |
| SEN | `energie` | da | sistemul energetic național |
| SITUR | `firme` | **nu — cea mai puțin greșită** | operatori economici, CUI, licențe; „turism" lipsește din cele 14 — adăugarea e decizie de produs |
| AMCCRS | `local` | **nu — cea mai puțin greșită** | registru urban PMB al clădirilor; „construcții" nu există; `mediu` ar fi greșit |
| TEMPO/POP105A | `local` | parțial | serie pe teritorii; **principiu per materie**: serii economice→`bani`, sanitare→`sanatate` |

---

## 5. Tool-uri MCP — evaluare nume și scheme de parametri

**Convenții constatate în `lib/mcp/tools.ts`** (34 tool-uri): denumiri `snake_case`; fiecare tool e 1:1 pe o rută publică `/api/*` și **refolosește validarea rutei** (400-ul onest al rutei ajunge eroarea tool-ului); registre multi-fel cu `kind` enum; filtre `q`/`locality`/`county`/`geoScope`/`page` (zero-based); descrieri în engleză cu numele exacte ale câmpurilor; fără parametri pentru citiri simple (`ancpi_integrals`, `cinema_sites`). Validarea la granița MCP (A19: integer/min/max/enum → -32602 cu parametrul numit) e activă la momentul implementării.

Cele 5 propuneri din fișierul-sursă se **acceptă** pe toate, cu ajustări mici:

| Tool propus | Verdict nume | Schema parametrilor (moștenind convențiile) |
|---|---|---|
| `tourism_registry` | **OK** — urmează `directory_registry`/`lawyers_registry`/`notaries_registry` | `{kind: enum ['cazare','alimentatie','agentii'] (required; valorile românești urmează numele sursă — precedent `forensic_experts`), q, locality, county, geoScope: enum ['context','local','national'], page}` — identic ca formă cu `directory_registry` |
| `seismic_buildings` | **OK** — substantiv_domeniu ca `flight_board`/`transport_positions` | `{q (required, adresă liberă), sector: enum ['1'..'6'], page}` — fără county (acoperirea e doar București, declarată) |
| `ins_series` | **OK** — scurt, ca `ancpi_integrals`; genericul e onest pentru că enum-ul limitează | `{matrix: enum ['POP105A'] (required — altă matrice se respinge onest până se validează separat), territory (nume județ/municipiu, fold la potrivire), page}` |
| `energy_offers` | **OK** — convenția numește domeniul, nu editorul (`weather_forecast` nu `anm_forecast`) | `{county (required — zona se rezolvă prin get-judete, nu hardcodat), consumptionMonthly: integer 1–20000 implicit 200, q (furnizor), page}` |
| `power_system` | **OK** — scurt; starea e oricum în plicul sursă | `{}` — fără parametri (precedent `ancpi_integrals`); răspunsul poartă producție/consum/sold MW + `observedAt` + `observationAgeSeconds` |

Rute publice noi: `app/api/tourism/route.ts`, `app/api/seismic/route.ts`, `app/api/ins/route.ts`, `app/api/energy-offers/route.ts`, `app/api/power/route.ts` — fiecare cu propria validare onestă (400 românesc numind parametrul), tool-ul doar `build()` pe ele.

**Livrabile obligatorii laolaltă per tool** (practica runda 5): intrarea în `TOOLS` + capitol `docs/mcp.md` (headerul „Tool-uri (34)" devine 39 + câte un capitol cu licență declarată) + celula VSE per rută (fixture-uri mock) + pinuri VM (+ docs-coverage §15) + proba semantică în `verify-mcp-live.mjs` (la varianta rescrisă A27 — adăugată **la momentul implementării**, nu acum).

---

## 6. Fișiere-cheie de înțeles pentru implementare (20)

| # | Fișier | De ce |
|---|---|---|
| 1 | `lib/live/types.ts` | contractul `Loader`/`Loaded`/`SourceState` — tot ce e (a) sau (b2) îl respectă |
| 2 | `lib/live/adapters.ts` | `getSource` (redirect/TLS/DNS/timeout diagnostics, maxBytes), `SourceError`, precedent loaderi (`bnr`, `weather`, `catalog`), validarea CUI `/^[1-9]\d{1,9}$/` |
| 3 | `lib/live/cache.ts` | `readSource` (seed fallback, lock/expires, bugete per familie la :59, :74-81 — aici se adaugă `ins`/`posf`/`transelectrica`), `cachedCopyServes` |
| 4 | `lib/live/weather.ts` | precedentul loader direct cu gate (`withForecastSlot`) |
| 5 | `lib/live/housing.ts` | precedentul parsării XLSX cu detectarea antetului după conținut (:34-41) + fold ID pe diacritice (:139-147) |
| 6 | `lib/live/resources.ts` | `parseResource`/`indexTable` (D1 chunks + SHA-256 + `qualityProfile` :63), `downloadResource` cu allowlist de hosts (:84-89) — **neatins** pentru sursele noi (importul SITUR/AMCCRS e offline, în script) |
| 7 | `lib/live/trains.ts` | modelul corpus static: `fetchAsset` cu SHA-256 (:34-42), `foldTrainText` cedilla (:29), cache 10 min |
| 8 | `public/data/snapshot-transport.json` | registrul de probe SHA-256 — aici se înscriu probele `/situr/*`, `/amccrs/*` |
| 9 | `lib/live/refresh-groups.json` | unde se declară familiile noi: `onDemand` = SEN; corpusurile statice nu au grup cron (refresh ritual manual) + precedentul `ghRelayed` pentru fallback TEMPO/POSF |
| 10 | `lib/live/refresh-sweep.ts` | înregistrarea loaderilor per membru — doar dacă se adaugă ceva în ture (altfel nu se atinge) |
| 11 | `lib/live/records.ts` | `uniqueRecords` (deduplicare POSF) + `uniqueRecordsLatest` (A05) |
| 12 | `lib/live/query.ts` | `normalizeSearch` (NFD — **nu** pliază cedilla!), `matchesQuery`, `paginate` (20/rând), `compareValues` |
| 13 | `lib/geographic-scope.ts` | `countyName`/`localityName`/`sameLocality`/`registryMatchesLocation` — filtrele geografice ale SITUR/TEMPO |
| 14 | `lib/mcp/tools.ts` | array-ul `TOOLS`, `ToolDef`, convențiile de parametri; aici intră cele 5 definiții |
| 15 | `lib/mcp/server.ts` | validatorul (A19: integer/enum/-32602), `callTool` (A23: binary doar pe ok), versiuni protocol (A24) — noile tool-uri moștenesc totul de aici |
| 16 | `app/api/mcp/route.ts` | wiring-ul tool→rută, headere, Origin (A26) |
| 17 | `scripts/import-mers-tren.mjs` | precedentul importului offline de corpus (descărcare → verificare → shard-uri → probe → commit) |
| 18 | `scripts/verify-trains-corpus.mjs` | precedentul porții de corpus (numere + integritate) |
| 19 | `scripts/verify-source-errors.mjs` + `scripts/verify-mcp.mjs` | celulele VSE per rută (fixture mock) + seam/schemă/pinuri/docs-coverage §15 |
| 20 | `scripts/verify-mcp-live.mjs` + `docs/mcp.md` | probele live semantice (rescrise la A27 — noile surse se adaugă atunci) + documentația per tool cu licențele |

---

## 7. Riscuri și capcane

**Top 3:**

1. **Accesul din rețeaua Cloudflare Workers neconfirmat pentru sursele live** — tot testul a rulat din afara infrastructurii Aflivra (fișierul-sursă o declară explicit). TEMPO pe `http://…:8077` (port non-standard, plus HTTPS 502 inconcludent prin proxy), POSF pe un endpoint de client web (fără contract de integrare), SEN și fluxul nonce AMCCRS — toate pot fi respinse de la egress Workers (WAF, UA, porturi). **Poartă dură:** probă live din deployment înainte de expunerea MCP; fallback declat = intermediar `ghRelayed` (precedente AFIR / flights / bia, cu rute `/api/seed/*`) sau HOLD onest. Nicio dezactivare de verificări TLS.
2. **AMCCRS nonce + table_id volatile** — nonce extras din pagina curentă, expirare necunoscută, „nu presupune că nonce-ul sau ID-ul tabelului sunt permanente"; plus 48 forme text de încadrare (inclusiv nume de persoană în câmpul clasei și valoare goală). Mitigare: fluxul nonce există **doar în scriptul offline**; produsul servește exclusiv corpusul verificat; clasa originală + clasa normalizată ambele păstrate, contorul formelor declarat.
3. **POSF — calitatea și contractul răspunsului**: duplicate identice (170→85), `Content-Type: HTML` cu corp JSON (parserul parsează corpul, nu headerul), 422 cu explicații la parametri greșiți (se suprafațăca eroare onestă cu diagnostic, contractul A30), 20 rânduri prosumator per zonă (flag onest, nu eliminare, nu recomandare de preț minim), format românesc de dată `ZZ-LL-AAAA`. Plus: `valoare_factura_curenta` — ipoteză de test, nu se inventează factura utilizatorului (parametru opțional documentat sau omisiune — de verificat la implementare).

**Capcane per sursă (restul):**

- **SITUR:** antetul la rândul 6 cu 4 rânduri goale și titlu la 5 — detectare după conținut (precedent ANL), nu offset; CUI lipsă 7.259 → `null` + contor, fără inventat; județe cu cedilla („Constanţa", „Bistriţa-Năsăud") → trebuie `replace(/[şŞ]/g,'ș')` înainte de `normalizeSearch` (capcana dovedită de `foldTrainText`); data exportului (10.10) ≠ data paginii (09.10) — două câmpuri; numbers: registru de licențiere, nu piață completă (segmentare Brașov 3.071/607/177 e număr de înregistrări).
- **TEMPO:** ID-urile de ani îmbătrânesc (derivate din `dimensionsMap`, nu hardcodate); labels cu spații finale („Total ") se reproduc exact; statutul revizuit/provizoriu e tipografic — dacă JSON-ul nu-l poartă, se declară lipsa, nu se inventează; limitele 30.000/500 rezervate prin construcția payload-ului; nu se extrapolează POP105A la alte matrici (validare separată fiecare).
- **SEN:** an cu 2 cifre (`26/10/10…` → 2026, fereastră 2000+YY); fus orar presupus Europe/Bucharest — declarat onest ca presupunere; structura listă-de-obiecte-cu-o-cheie = o observație, nu un tabel; discrepanța de 161 MW la agregarea componentelor → componentele servite ca publicate + notă; vechimea ~1–2 min la observare e normală (staleness pe `observedAt`).
- **Toate:** fiecare loader nou cu `version` propriu (ex. `situr.tourism-registries.v1`) — bump la orice schimbare de formă (convenția cache-ului); migrările/poartele se scriu **odată cu codul** (directiva runda 5); fără-uri `editionCurrent`-like inventate.

---

## 8. Licențe neconfirmate — cum se documentează

Toate cele 5 surse au licența de reutilizare comercială **neconfirmată**. Procedura (practica existentă):

1. **Descrierea tool-ului (engleză)** în `lib/mcp/tools.ts` — propoziție finală per tool: `"Commercial reuse license: unconfirmed — official source, personal study and verification use"`; câmpul `license` din datele servite = `null` + explicație, nu o licență presupusă.
2. **`docs/mcp.md`** — capitolul tool-ului poartă paragraf „Licență": ce s-a confirmat tehnic vs. ce nu (accesul anonim nu e dovadă de licență); POSF primește în plus mențiunea restricției de copiere de pe pagina ANRE (fără extindere automată la date, dar declarată).
3. **Profilul corpusului** (SITUR/AMCCRS): câmp `license: null` + `licenseNote` cu sursa oficială și data verificării.
4. TEMPO: intrarea CKAN a TEMPO e CC BY 4.0, dar întinderea ei asupra fluxului API direct (:8077) rămâne de verificat — se declară exact așa.

---

## 9. Dependențe de runda 5 (nu se replanifică) și ordinea recomandată

**Runda 5 rămâne exact cum e planificată** (`runda5-audit/PLAN.md`, Loturile 1–6). Dependențe pentru sesiunea „surse noi" (se rulează după, sau ca sesiune separată):

- **A19** (validator integer/enum/min-max la granița MCP) — noii parametri (`consumptionMonthly`, `sector`, `page`) îl moștenesc; fără el, clamp-urile automate ar minți.
- **A23** (binary doar pe `response.ok` + isError) — POSF 422/HTML va fi tratat corect de contractul rescris.
- **A24–A26** (transport 2025-06-18, mesaj unic, Origin) — noile tool-uri se expun doar sub contractul final.
- **A27** — `verify-mcp-live.mjs` rescris cu probe **semantice** per tool: probele celor 5 surse noi se adaugă **la varianta rescrisă, la momentul implementării** (nu se atinge runda 5).
- **A05** `uniqueRecordsLatest` — POSF îl poate refolosi dacă e livrat; altfel `uniqueRecords` pe identificator.
- **A11** `qualityProfile` — profilul corpusurilor SITUR/AMCCRS urmează câmpurile lui.
- **A29** `romanianDate` — parsarea fusului orar SEN/POSF (`data_start_aplicare`) folosește aceeași convenție declarată.
- **A30** diagnosticul persistat — noii loaderi suprafețează `errorDiagnostic` inclusiv pentru 422/401/(timeout-uri).

**Ordinea recomandată pentru sesiunea de implementare:**

- **Lot A — corpusuri statice (fără risc de conectivitate):** SITUR + AMCCRS (scripturi offline + cititori + rute + tool-uri + porți corpus/VSE/VM/docs). Se poate livra independent; proba live verifică doar servirea din ASSETS (mereu disponibilă).
- **Lot B — surse live, fiecare după poarta de probă din Workers (deploy de test):** SEN (cel mai simplu) → POSF → TEMPO (condiționat de HTTP:8077). Ordinea = complexitatea crescândă a parsei și a parametrilor.
- **Lot C — extinderea `verify-mcp-live.mjs` (varianta A27)** cu probele semantice ale celor 5 (numere de rânduri la SITUR/AMCCRS, matrice concordantă la TEMPO, deduplicare + flag la POSF, vechime la SEN) — la finalul Loturilor A+B.

**Verify per livrare:** porțile scrise odata cu codul (directiva runda 5), apoi `corepack pnpm lint` + `tsc --noEmit` + `build` (+ restore/clean-tree seed-snapshots) + deploy + `verify-mcp-live.mjs` (exit 0 sau 2 = acceptabil, 1 = blocant).

---

## 10. Recomandare specialiști

- `orchestrate-security` — **consult scurt** (nu mandat) la Lot B: noile suprafețe rămân publice/fără auth ca tot produsul, dar se confirmă: nicio introducere de secret în cod (nonce-ul AMCCRS rămâne în scriptul offline, nu un credential comis), validarea parametrilor POSF la rută (`@Validated`-echivalent JS: schema rutei respinge înainte de fetch), nicio extindere a `downloadResource`/`resourceHosts`.
- `orchestrate-devops` — opțional, pentru ritualul de refresh al corpusurilor (script + PR + CI paths deja acoperite de A28) dacă se dorește programare.
- Restul — nu; toate lucrările sunt in-repo (TypeScript Workers + scripturi .mjs/.py + docs).
