# Aflivra — dovezi & gap-uri de documentație pentru auditul MCP, runda 3

Sesiune: `2026/10/09/round3` · HEAD `b3b056d` (PR-urile #44–#47: e9f652e, be5fcbc, 2e5e5df, b3b056d) · audit extern: `~/Downloads/Aflivra_Defecte_2026-10-09 (2)_4086.md` (runda 3, 15:50–16:04 EEST).
Rol: Scribe, read-only pe repo. Acest raport analizează (1) dovezile pentru cele 5 constatări „neretestate" (D03, D24, D25, D27, D28), (2) gap-urile de documentație pentru constatările rundei 3, (3) coerența tools.ts ↔ docs/mcp.md ↔ llms.txt/llms-full.txt, (4) întrebările de clarify/product.

Structura reală a `docs/mcp.md`: 34 de capitole `### tool` + 4 secțiuni introductive (Conectare, Plicul de răspuns, Ce NU expune, Întreținere) — nu „15 capitole"; fiecare capitol are un exemplu JSON validat de poarta `verify-mcp.mjs` §15 (docs/mcp.md examples ↔ schema tool-ului).

---

## 1. Tabel de dovezi — cele 5 „neretestate" (D03, D24, D25, D27, D28)

Auditorul externalCong nu le poate testa prin apeluri MCP tipizate; fiecare are deja o poartă sau un test existent, citabile file:line, pe HEAD `b3b056d`.

| ID | Poarta / testul existent | Ce asertă exact (citate scurte, file:line) | Ce dovadă i-am da auditorului |
|---|---|---|---|
| **D03** — argumente omise/null la JSON-RPC ocolesc `required` și întorc firma implicită; `POST /api/company` fără CUI | **Poarta offline** `scripts/verify-mcp.mjs` §7 + **e2e boundary** `e2e/mcp.spec.ts` + **rută** `app/api/company/route.ts` | verify-mcp.mjs:99-111 — trei forme pin-ate la graniță: `['argument lipsă',{name:'company_profile',arguments:{}}]` (:100), `['fără arguments',{name:'company_profile'}]` (:101), `['arguments null',{name:'company_profile',arguments:null}]` (:102) → `assert.equal(response.body.error?.code,-32602, label+' se respinge cu -32602')` (:109, toate cele 7 cazuri, inclusiv tip greșit, argument necunoscut, enum invalid, tool necunoscut). e2e/mcp.spec.ts:134-135 `missing` (arguments:{}) → -32602; :141-142 `noArgs` → -32602; :143-144 `nullArgs` → -32602. Fallback-ul de demonstrație eliminat: e2e/mcp.spec.ts:148-149 — `GET /api/company` fără parametri → **400**, mesaj de aserțiune „fără parametri, ruta firmei refuză: fără CUI implicit"; app/api/company/route.ts:15 — `if(!/^[1-9]\d{1,9}$/.test(cui))return Response.json({error:'CUI invalid.'},{status:400})` (probele auditorului: `company_valid` 427282 → profil; `company_invalid` „abc" → „CUI invalid.") | `node scripts/verify-mcp.mjs` (secțiunea 7 trece) + `corepack pnpm test:e2e -- e2e/mcp.spec.ts` (cele 3 probe boundary la serverul real de dev). Sau probe HTTP brute prin curl (cu UA real — vezi §D01): `POST /api/mcp` cu `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"company_profile"}}` → răspuns cu `error.code=-32602`, NU un dosar cu CUI 427282; `GET /api/company` → 400. Notă: poarta offline rulează pe seam cu fixture-uri (stratul de protocol); e2e este proba pe serverul real |
| **D24** — notificările JSON-RPC (fără `id`) execută ruta și răspund cu `id:null`; `notifications/*` cu id | **Poarta offline** `scripts/verify-mcp.mjs` §2 + §10 + **e2e** | verify-mcp.mjs:47-61 — notificarea se decide după **absența lui id, nu după nume**: `notifications/initialized` fără id → body `null` (:50); `ping` fără id → 202 + body null (:51-53); `tools/call` fără id → 202 + body null **și nu execută ruta**: `calls.length=0` înainte (:54), apoi `assert.equal(calls.length,0,'tools/call fără id nu execută ruta')` (:58); `notifications/initialized` **cu** id → 200 + `assert.equal(idNotification.body.error?.code,-32601)` (:59-61, „notifications/* cu id se respinge onest cu -32601"). §10 loturi: răspunsuri doar pentru cererile cu id (:140-146), `assert.equal(calls.length,0,'notificarea tools/call din lot nu execută ruta')` (:146). e2e/mcp.spec.ts:71-72 (`notifications/initialized` → 202) și :145-147 (`silent` = tools/call fără id → 202 + `expect(await silent.text()).toBe('')`) | `node scripts/verify-mcp.mjs` + `pnpm test:e2e -- e2e/mcp.spec.ts`. Probe brute: `POST /api/mcp` cu `{"jsonrpc":"2.0","method":"tools/call","params":{...}}` (fără id) → **HTTP 202, corp gol, zero efect**; aceeași metodă `notifications/initialized` **cu** id → `{"error":{"code":-32601,...}}`. Exact criteriul de acceptare din audit: „nicio notificare validă nu generează un răspuns RPC; cererile cu id primesc răspunsul corelat ori eroare" |
| **D25** — `POST /api/legal` cu corp JSON `null` produce 500 | **e2e boundary pe ruta directă** `e2e/mcp.spec.ts` + ruta `app/api/legal/route.ts` | e2e/mcp.spec.ts:150-151 — `legalNull`: `POST /api/legal` cu `data:null` → `expect(legalNull.status(),'JSON null la rută: 400, nu 500').toBe(400)`; :152-153 scalar `5` → 400; :154-155 array `[]` → 400. Sursa fixului: app/api/legal/route.ts:15-16 — `p=JSON.parse(raw)` în try/catch → 400 „Interogare invalidă." la parse; apoi `if(typeof p!=='object'||p===null||Array.isArray(p))return Response.json({error:'Interogare invalidă.'},{status:400})` — null, scalari și array-uri respinse cu 400 înainte de accesarea câmpurilor | `corepack pnpm test:e2e -- e2e/mcp.spec.ts`. Probe brută: `curl -X POST https://aflivra.brebu.workers.dev/api/legal -H 'content-type: application/json' -d null` → **HTTP 400** „Interogare invalidă." (nu 500). Exact reperul auditorului („nefacută în această rundă" — dar existsă ca probă e2e executabilă) |
| **D27** — auditul live numea cached/stale „date proaspete" | **Contoarele byStatus** `scripts/verify-mcp-live.mjs` | :91 — acoperirea fiecărui tool din pin (`assert.deepEqual([...names].sort(), Object.keys(ARGUMENTS).sort(), 'auditul acoperă fiecare tool din pin')`); :5-8 — clasele oneste în header: „stările stale/unavailable de sursă se raportează ca clasă 2 (informațional)"; :117-129 — `byStatus[status]` numără **separat** `fresh`/`cached`/`stale`/`direct`, cu comentariul „un plic în copie (cached) sau vechi (stale) are DATE DISPONIBILE, nu «date proaspete»" (:126-127); :131-132 — sumarul: „${fresh} proaspete, ${cached} în copie validă, ${stale} vechi (copie păstrată, sursa nu a reușit ultima tură), ${directT} răspunsuri directe; ${degraded} degradări oneste; ${failed} avarii"; :133 — „NOTĂ: plicurile «stale» servesc ultima copie validă cu eroarea sursei etabelată — nu sunt date proaspete."; :134 — coduri de ieșire `failed?1:degraded?2:0`. Bonus UA: :3-4, :99 — folosește UA de client real (Python-urllib primește 1010 de la Cloudflare) | `node scripts/verify-mcp-live.mjs https://aflivra.brebu.workers.dev` pe HEAD-ul curent (auditorul a spus „nu am reinspectat/rulat scriptul pe versiunea nouă") — output-ul numără prospețimea și disponibilitatea separat; un plic stale NU poate produce o linie/sumar „date proaspete". Exit 2 = degradări oneste de sursă, exit 0 = totul verde |
| **D28** — porțile treceau fără verificare semantică | **Suita e2e „semantic regressions"** `e2e/mcp.spec.ts` + **bateria de porți** `scripts/verify-*.mjs` + **CI** `.github/workflows/pr-validation.yml` | e2e/mcp.spec.ts:161-261, per-defect cu conținut asertat („fiecare apel dovedește comportamentul promis, nu doar plicul"): D02 sort asc/desc ordine reală (:164-180) · D05/D06/D19 events — text+localitate+venue împreună, zero potriviri = succes cu total 0, NU `unavailable` (:182-198) · D07/D08 orice ortografie a județului/camerei (:200-215) · D13/D14/D15/N02/N06 trenuri — `q` filtrează panoul, destinația ≠ gara, `expired` la `edition=all` cu `activeOperators` ≠ `includedOperators` (:217-237) · N03/N04 fereastra orară de la ora curentă, `windowStart` (:239-246) · N07 BRAȘOV urben are lat/lon (:248-255) · D18 mesajul numește instanța (:257-261). Boundary D03/D23/D24/D25 la :131-158. Suport: e2e/company-name-search.spec.ts (D21 — rândurile fără CUI listate onest, „never an invented CUI"), e2e/justice-registries.spec.ts. **Bateria locală: 43 porți `scripts/verify-*.mjs`** (+3 `audit-*.mjs` + `verify-source-packages.py`); `verify-source-errors.mjs` = matrice mock de avarii per familie/celulă, autoreportată la final (:1247 `families:families.length,cells:cellCount`; la auditul 1: 35 familii/232 celule; de atunci au crescut — include celula D11 `format-word-package` la :211/:390/:1199). `verify-mcp.mjs`: pin tools/list (:66-77), pin de fire per-tool „cale, metodă, parametri, corp" (:154-196), acoperirea rutelor wire-uite vs. tool-uri (:200-211), fiecare parametru emis se citește în ruta țintă (:213-229), **docs/mcp.md validată împotriva schemei fiecărui tool** (:241-260). CI pr-validation.yml: job `Verify battery` (:49-95; verify-mcp la :84, verify-source-errors la :62, ~35 de scripturi + 3 audituri), job `build-restore` (:97-122 — build + deploy dry-run + migrare D1 idempotentă), job `e2e` (:124-145 — `corepack pnpm test:e2e`) | (a) rularea locală: `corepack pnpm test:e2e` + bateria din pr-validation.yml; (b) `node scripts/verify-mcp-live.mjs` (live); (c) istoricul PR-urilor #44–#47 — fiecare fix a venit cu regresia lui ÎNTÂI (ex. `format-word-package` pentru D11 în verify-source-errors). **Onest de declarat auditorului:** `pr-validation.yml` rulează doar manual (`on: workflow_dispatch`, :3-4), nu automat la PR; `verify-mcp-live.mjs` nu e în CI (apelează producția — intenționat); `verify-legal-pdf.mjs` e condiționat de pypdf (:90-95) |

**Lacune oneste în acoperirea de probe (de declarat și, pe urmă, de reparat):**
1. **R02 nu are celulă de regresie**: mock-ul `experti-judiciari` din verify-source-errors.mjs (:343) generează numai `Legitimatie` pline (`20001…20012`) — nu există scenariul „placeholder „0 0"" care să pice pe fix. Nicio aserțiune `_id` nici în e2e (`grep _id` în e2e/: zero).
2. **R01 nu are pin pe lista de categorii**: verify-mcp.mjs §11 folosește doar `category:'sanatate'` în probele wire; lista exhaustivă de categorii acceptate nu e pin-ată nicăieri (manifest.categories e adevărul, dar liber să dribleze).
3. **N07 are doar aserțiunea pozitivă** (BRAȘOV urben are lat/lon, e2e/mcp.spec.ts:248-255); nu există aserțiunea negativă „satul din UAT-ul urban rămâne fără punct" (promisiunea de acoperire parțială).

---

## 2. Gap-uri de documentație pentru constatările rundei 3

Pentru fiecare: ce secțiune din `docs/mcp.md` se schimbă și cum (formulări RO scurte, gata de lipit), plus schimbările oglindă în `lib/mcp/tools.ts` (schema live e contractul pe care auditorul l-a urmat la R01).

### R01 — categoria `comert` documentată e respinsă

**Adevărul din cod** (auditorul a urmat schema `tools/list`, nu docs): `places_search.category` se validează la `app/api/places/route.ts:8-9` împotriva cheilor `manifest.indices` din `public/places/manifest.json`. Categoriile reale (manifest, live): **`local-all`(intern), `agricultura`(1.313), `bani`(4.580), `cultura`(8.540), `educatie`(7.113), `energie`(1.508), `filme`(171), `firme`(54.428), `justitie`(2.411), `local`(21.657), `mediu`(28.527), `munca`(31), `sanatate`(9.702), `stiri`(31), `transport`(46.227)**. Taxonomia se naște în `scripts/import-places.py` `classify()` (:138-260). **`comert`, `administratie` și `sport` NU există ca categorii** — `tools.ts:35` le enumeră ca exemple („e.g. sanatate, educatie, cultura, administratie, comert, transport, sport"); „Sport și timp liber" și „Instituții publice" sunt *subcategorii* ale categoriei `local`. `firme` — categoria pe care auditorul a confirmat-o funcțional — nu e exemplificată deloc.

**Schimbări:**
- `lib/mcp/tools.ts:35`: descrierea `category` devine lista exactă: „Category filter, one of: sanatate, educatie, cultura, transport, firme, bani, energie, mediu, agricultura, justitie, filme, munca, stiri, local (instituții publice, sport și timp liber)". (And/or: `enum` pe property — dar cere pin suplimentar în verify-mcp §11; de decis la clarify.)
- `docs/mcp.md` § `### places_search` (linia 60-63) primește lista exactă:

> „Categoriile exacte ale inventarului național: `sanatate`, `educatie`, `cultura`, `transport`, `firme`, `bani`, `energie`, `mediu`, `agricultura`, `justitie`, `filme`, `munca`, `stiri`, `local` (instituții publice, sport și timp liber). O categorie necunoscută e respinsă cu 400."

- (Fix код opțional, separat de docs): mesajul generic „Alege o localitate și filtre valide." (route.ts:9,12) nu numește parametrul invalid — auditorul cere explicit identificarea parametrului în mesaj.

### R02 — `_id` duplicat („0 0") la experții judiciari — **deschis la HEAD**

**Adevărul din cod**: fiecare înregistrare primară primește `_id` prin `justiceRecordId` (`lib/live/justice.ts:78-81`, aplicat în `app/api/experts/route.ts:19` și `app/api/notaries/route.ts:15`): la `experti-judiciari` întoarce `Legitimatie` nenulă (:79), la `traducatori` `Nr Autorizatie` (:80), altfel hash determinist `sha256(kind+NUME+JUDET/CAMERA).slice(12)` (:81). Defectul: valoarea-marcaj a sursei „0 0" trece testul „nenul" de la :79 → 7 persoane distincte partajează `_id="0 0"`. Registrul tehnic are un număr legitim repetat pentru același nume (menționat de auditor) — hash-ul de fallback îl tratează deja.

**Garantul de documentat după fix** (docs/mcp.md § `### forensic_experts`, linia 228-231, și § `### notaries_registry`):

> „Fiecare înregistrare poartă un `_id` stabil per persoană: numărul legitimației (experți judiciari) sau al autorizației (traducători) când sursa îl publică real; altfel o cheie derivată deterministă (registru + nume + județ). Persoanele distincte nu partajează niciodată același `_id`; valorile-marcaj ale sursei (ex. „0 0") nu devin chei."

+ celulă de regresie în `verify-source-errors.mjs` (familia `justice/experti-judiciari`): rând cu `Legitimatie="0 0"` și nume/județ diferite → `_id` distincte.

### N07 — promisiunea coordonatelor urbane rămâne parțială

**Adevărul din cod**: coordonatele NU vin din SIRUTA — se alipesc la `app/api/localities/route.ts:9-13` prin potrivire unică (nume pliat + județ) cu `geographicLocalities` = `public/data/geographic-localities.json`, care conține **doar centrele OSM `place=city|town`** (`scripts/build-geography.py:26` — `if city.get('type') not in ['city','town']:continue`), ~326 de intrări. Între timp, `environment` e `MED==1 → 'Urban'` din SIRUTA (`lib/live/directories.ts:16`) — deci satele componente ale UAT-urilor urbane (PÂRÂUL RECE, TIMIŞU DE JOS/SUS, FIŞER, TOHANU NOU — TIP 18) și POIANA BRAŞOV (TIP 10) apar cu `environment:"Urban"` **și legitim fără lat/lon**, pentru că nu sunt în registrul city/town. Promisiunea actuală „localitățile urbane poartă lat/lon" e deci inexactă: adevărul e „municipiile și orașele cartografiate poartă lat/lon".

**Schimbări:**
- `docs/mcp.md` § `### localities_search` (linia 73) — înlocuiește propoziția „localitățile urbane poartă lat/lon (centrul cartografiat), cele rurale rămân onest fără punct geografic" cu:

> „Coordonatele (centrul cartografiat) au garantat doar municipiile și orașele cartografiate — acoperire parțială; satele, inclusiv satele componente ale unităților urbane (SIRUTA le poartă ca mediu «Urban»), rămân onest fără punct geografic."

- `lib/mcp/tools.ts:46` — oglinda EN: „Coordinates (mapped center) are guaranteed only for municipalities and mapped towns — partial coverage; villages and other component localities honestly carry no point."

### D21 — căutarea firmelor nu rezolvă identitatea juridică

**Adevărul din cod** (`lib/live/adapters.ts:110-127`): rândul curent = `{cui, vat, qid, name, websites, org, sourceUrl}` — `org` boolean (clasă de organizație din `ORG_CLASSES` :110 sau CUI citit), filtrează speciile/localitățile (remedierea D21 runda 1-2, live), păstrează max 5 potriviri fără CUI (`nameSearchNoCuiLimit`, cu nota „Se afișează primele potriviri" și flagul `limited`). **Nu există câmp de țară (P17) și nici motiv/scor de potrivire** — de aceea „EMAG Elektrizitäts-AG" (organizație nemțească) apare nediferențiat. `cui=null/vat=null` afișate onest — confirmat și în e2e/company-name-search.spec.ts:45-60.

**Ce putem promite onest azi** (fără decizie de produs): „potrivirile sunt organizații din registrul deschis (Wikidata) — inclusiv organizații internaționale omonime; fără CUI citit în registru, rămân `cui:null`, niciodată CUI inventat". Câmpuri noi posibile (țară, `matchNote`/scor) = decizie de produs (vezi §4).

**Formulare docs/mcp.md § `### search_companies` (linia 49), adăugire:**

> „Rezultatele sunt organizații din registrul deschis — pot include organizații internaționale omonime (rândul poartă `qid` și legătura Wikidata); fără identificator TVA citit în registru, `cui`/`vat` rămân `null`, afișate onest. Se listează cel mult primele 5 potriviri fără CUI (`limited:true` în răspuns când lista e mărginită). Țara entității și o notă de potrivire rămân de adăugat."

### D11/D26 — livrarea documentelor Office pe viitor

**Adevărul din cod**: documentele Office XML (pachet Word 2003 / Flat OPC) nu mai ajung tabel — vin `kind:"text"`, `textComplete:true` (gardian în `lib/live/source-xml.ts`; celula de regresie `format-word-package` în verify-source-errors.mjs:211). Răspunsul rămâne însă un document XML brut uriaș (376.981 caractere la proba auditorului).

**Schimbare docs/mcp.md** — § `### dataset_table` (linia 187), adăugire (și oglindă scurtă la § `### dataset_export`, linia 193):

> „Documentele Office XML (pachet Word/Flat OPC) nu se servesc drept tabel: vin ca document text integral (`kind:\"text\"`, `textComplete:true`), cu volumul aferent. Direcție: livrare ca fișier descărcabil (ca la export) + extragere separată a textului/tabelelor relevante, cu metadate de completitudine."

Pentru D26 (volum): formularea actuală a capitolului cinema („forma implicită e compactă… `detail:\"full\"` readuce tot", linia 103) și weather („1–168, implicit 48", linia 79) acoperă deja compactarea; rămâne menținut onest în capitolul dataset_table despre volumul documentelor mari.

### D01/1010 — nota UA pentru descărcări programatice

**Adevărul**: nota UA există deja la `docs/mcp.md:20-22` (Conectare) — „Cloudflare respinge UA-uri de bot cunoscute înainte de Worker — `Python-urllib` primește 1010; UA-urile clienților reali — Claude, ChatGPT, node/curl — trec". Auditorul a descărcat URL-ul XLSX cu urllib → 403/Cloudflare 1010 — **același filtru, pe rută de descărcare**, iar nota stă doar în secțiunea Conectare, nu în capitolul unde un consumator programatic al `resource_link` se uită.

**Schimbare** — § `### dataset_export` (sub linia 193), adăugire scurtă:

> „Descărcarea prin client programatic: Cloudflare respinge UA-uri de bot cunoscute (Python-urllib → HTTP 403/1010); folosește un UA de client real (curl, node, browser). URL-ul din `resource_link` e absolut, utilizabil direct."

+ dacă vrem simetrie completă: o propoziție în `lib/mcp/tools.ts:136` (descrierea dataset_export) — „a download client UA policy applies (see docs)". Opțional.

---

## 3. Coerența tools.ts ↔ docs/mcp.md ↔ llms.txt / llms-full.txt

`llms.txt` (44-55) și `llms-full.txt` (82-93) **delegă** integral spre docs/mcp.md („Catalogul complet cu exemple pe fiecare tool: docs/mcp.md") și nu fac nicio afirmație despre categorii places, coordonate localități, CUI la căutare sau export XLSX → **fără drift peAceste puncte în llms***. Drift-ul real e între **schema live (tools.ts, expusă prin tools/list)** și **docs/mcp.md**:

| Punct | tools.ts (schema live) | docs/mcp.md | Verdict drift |
|---|---|---|---|
| Categorii places (R01) | :35 — „e.g. sanatate, educatie, cultura, **administratie, comert**, transport, **sport**" — trei exemple inexistente; `firme` (categoria cea mai populată) necitată | :61 — „spitale, farmacii, școli, muzee — după text, categorie…" — nu enumerează nimic, nici categoriile reale | **DRIFT ACTIV** — auditorul a urmat tools.ts; ambele de reparat simultan (altfel poarta docs ↔ registru nu prinde, pentru că exemplele din docs trec validarea pe categorii valide) |
| Coordonate localități (N07) | :46 — „urban localities carry lat/lon… rural ones honestly do not" | :73 — „localitățile urbane poartă lat/lon (centrul cartografiat), cele rurale rămân onest fără punct geografic" | **DRIFT vs REALITATE** — ambele promit „urban→lat/lon"; adevărul: doar municipii/orașe cartografiate (~326). Formulările sunt aliniate între ele, dar ambele greșite față de date |
| Căutare firme (D21) | :22 — onest: „matches without [VAT] are listed honestly as such" | :49 — onest + detaliat („speciile și localitățile omonime nu apar… «fără CUI citit»") | **ALINIATE și oneste**; ambele lasă implicit faptul că organizațiile internaționale intră — câmpul de țară/nota de potrivire lipsește din ambele (decizie de produs) |
| Documente Office (D11) | :130 — „honest about non-tabular documents" | :187 — „onest despre documentele netabelare" | **ALINIATE**; ambele nu descriu încă livrarea viitoare fișier+extragere (roadmap de adăugat) |
| Export binar / UA (D01) | :136 — „never the raw bytes as text" (fără mențiune UA) | :20-22 nota UA la Conectare; :35 URL absolut („utilizabil direct de client") | **PARȚIAL** — nota UA acoperă apelul JSON-RPC, nu descărcarea din `resource_link`; de extins în capitolul dataset_export |
| Capitolele reparate în #44-#47 (vreme, trenuri, publishedAt) | :53 („default 48"), :100-101 (editions/expired/activeOperators), :142-143 (stiri) | :79 („implicit 48… windowStart"), :139 („expired se calculează de la data cerută… includedOperators"), :175 („publishedAt e un singur moment UTC") | **ALINIATE** — Faza D din PLAN.md s-a livrat; verify-mcp.mjs §15 (:241-260) ține docs ↔ registru ↔ scheme pin-ate |

---

## 4. Zone neclare → /speckit.clarify sau decizii de produs

1. **R01` — enum sau listă în descriere?** Facem `category` un `enum` în schema MCP (eroare -32602 la graniță, cu parametrul numit — cerința auditorului „identifică parametrul invalid") sau păstrăm `type:string` cu lista exactă în descriere (eroarea rămâne 400-ul generic al rutei)? Enum-ul cere pin nou în verify-mcp §11 și schimbă contractul pentru clienții existenți.
2. **R01 aliasuri?** Acceptăm `comert`→`firme` ca alias (remedierea A a auditorului: „acceptă aliasul sau documentează valorile exacte") sau doar documentăm exact? (Recomandarea scribe: doar exact + enum; aliasul e datorie pe viață.)
3. **R02 — politica `_id`:** cheia e numărul-sursei când e nenul, sau numai când e nenul **și non-placeholder**? Sursa publică „0 0" — tratăm valorile care nu contin cifre-unice/nu se conformează unui format de legitimție ca marcă și derivăm hash mereu? Cine validează formatul legitimției (avem unul documentat de la Ministerul Justiției)?
4. **N07 — completare vs onestitate:** extindem registrul de coordonate la satele UAT-urilor urbane (OSM le cartografiază — `cities.json` conține `place=village|hamlet`, filtrate azi în build-geography.py:26) sau păstrăm acoperirea parțială documentată? Extinderea n-ar fi doar docs — schimbă garantul publicat.
5. **D21 — contractul de identitate:** adăugăm `country` (P17) și un câmp de motivație (`matchNote`/`matchScore`) în răspunsul search_companies și separăm/etichetăm organizațiile fără legătură cu România? Ce promitem: „firme românești + internaționale marcate" sau „doar entități legate de România"?
6. **D01 — operational vs documentat:** cerem operațional (Bot Fight Mode/waf-rul care produce 1010 — whitelist pentru UA-uri de biblioteci programatice, dacă e sub controlul nostru pe workers.dev) sau menținem doar nota onestă din docs? Auditorul a primit 403 din „acest mediu de audit" — nu e neapărat permisibil pe toate clienții; decizia e a cui reputații îi aparține fricțiunea.

---

## Anexă — surse citate (HEAD b3b056d)

- `scripts/verify-mcp.mjs` (§2 :47-61 notificări; §7 :97-111 validare graniță; §11 :154-196 pin de fire; §12-13 :198-229 acoperire rute/parametri; §15 :241-260 docs ↔ schemă)
- `scripts/verify-mcp-live.mjs` (:91 acoperire; :117-134 byStatus/exit code; :3-4,:99 UA)
- `e2e/mcp.spec.ts` (:131-158 boundary; :161-261 semantic regressions; :90-105 LINK_CLASS export binar; :110-116 vreme default)
- `e2e/company-name-search.spec.ts`, `e2e/justice-registries.spec.ts`
- `app/api/company/route.ts:7-15`, `app/api/legal/route.ts:14-16`, `app/api/places/route.ts:7-13`, `app/api/localities/route.ts:5-13`, `app/api/experts/route.ts:19`, `app/api/notaries/route.ts:15`
- `lib/mcp/tools.ts` (:22, :35, :46, :130, :136), `lib/live/justice.ts:78-81`, `lib/live/adapters.ts:110-142`, `lib/live/directories.ts:16`
- `lib/geographic-scope.ts`, `scripts/build-geography.py:23-29`, `scripts/finalize-places.py:103-126`, `scripts/import-places.py:138-260`
- `public/places/manifest.json` (categoriile reale), `public/data/geographic-localities.json` (registrul city/town)
- `docs/mcp.md` (258 linii; :20-22, :35, :49, :60-63, :73, :79, :139, :187, :193), `public/llms.txt` (:44-55), `public/llms-full.txt` (:82-93)
- `.github/workflows/pr-validation.yml` (:49-95 verify battery; :97-122 build-restore; :124-145 e2e; `on: workflow_dispatch`)
- Audit extern: `~/Downloads/Aflivra_Defecte_2026-10-09 (2)_4086.md`
