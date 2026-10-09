# PLAN — remedierea retestării de defecte (9 octombrie 2026)

**Sursa:** retestul `/Users/cbrebu/Downloads/Aflivra_Defecte_2026-10-09 (1)_7656.md` pe commit `be5fcbc` (deploy ~10:08 UTC).
**Regula valabilă pe tot planul:** test de regresie ÎNTÂI, apoi codul; porțile `scripts/verify-*.mjs` se actualizează în aceeași schimbare; version bump pentru orice loader a cărui formă de date se schimbă (mecanismul de invalidare D1); comentarii doar reguli de business, în română.

## Advocate Review
Status: Not Run
Key decisions incorporated: — (fără ADVOCATE-REVIEW.md în sesiune)
External dependencies: —

---

## Faza A — P1: D11 (tabel de stiluri Office) și N02 (sosirile de tren)

### D11 — rândurile de gradient Office nu mai ajung tabel „complet”
**Cauza (confirmată prin probă):** gardianul din `lib/live/source-xml.ts:214-215` este corect pe fișierul REAL (pachet Word 2003 XML, `pkg:package`, namespace-urile `openxmlformats.org/drawingml|officeDocument|wordprocessingml` prezente; 11 elemente `<a:gs>`, toate coloanele cu „@") — dar producția servește încă tabelul `gs` vechi pentru că `resourceLoader` a rămas pe `resource.complete-index.v6` (neschimbat de fix), deci rândul `resource:387e35f7-…` din D1 (TTL 86400) servește parsarea PRE-fix. Probe: `git show be5fcbc^:lib/live/resources.ts` are identic `resource.complete-index.v6`; MCP live: status `cached`, adapterVersion `resource.complete-index.v6`, sheets[0].name `gs`, 11 rânduri.

- [ ] Celulă de regresie ÎNTÂI: scenariul `format-word-package` în `scripts/verify-source-errors.mjs` (assigned: Builder)
  - Test: fixture ce oglindește rădăcina reală — `<?mso-application progid="Word.Document"?><pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">` cu `fillStyleLst/gradFill/gsLst` + 2-3 `<a:gs pos="…"><a:schemeClr val="phClr">` (namespace `drawingml/2006/main` declarat) — peste 2 apariții, sub pragul 128 coloane.
  - Implement: familia existentă `resource/xml-table` (scenariile de la linia 211; aserțiune nouă după modelul `format-office-theme`, linia 1194): `assert.equal(payload.data.kind,'text')` + `format:'XML'`; assert și că `resourceLoader(uuid).version==='resource.complete-index.v7'` (pin anti-drift pentru mecanismul de invalidare).
  - Verify: `node scripts/verify-source-errors.mjs`
  - Files: scripts/verify-source-errors.mjs
- [ ] Version bump + întărire vocabular (assigned: Builder)
  - Test: celula de mai sus.
  - Implement: `lib/live/resources.ts:76` — `version:'resource.complete-index.v7'` (DOAR acest string; `resource.chunk.v2`/`resource.document.v1`/`ckan.datastore-pages.v1` rămân — cheile de chunk sunt hashuite pe conținut). Întărire opțională în `lib/live/source-xml.ts` (gardian secundar, apărare în adâncime pentru Office-XML fără URL-uri OpenXML): respinge câștigătorul când numele de rând ∈ vocabularul de stil DrawingML {gs, schemeClr, srgbClr, sysClr, gsLst, gradFill, solidFill, blipFill, pattFill, clrScheme, fmtScheme, themeElements} — aceleași condiții ca gardianul actual (rânduri doar-cu-atribut).
  - Verify: `node scripts/verify-source-errors.mjs` (celula nouă + `format-office-theme` veche rămâne verde)
  - Files: lib/live/resources.ts, lib/live/source-xml.ts
- [ ] Validare live post-fix (assigned: Validator)
  - Test: MCP `dataset_table` cu id `387e35f7-47d6-40a4-a9b3-d8ecbe6f8ca9` întoarce `kind:'text'`/document, nu tabel `gs`.
  - Verify: apel POST `/api/mcp` local (`npm start`) + după deploy, proba publică.
  - Files: —

### N02 — sosirile false + TIMPII panourilor (adâncire de probă: atribuirea OreiP/OraS e inversată)
**Cauza (confirmată prin probă + ancoră `StationareSecunde`):** `scripts/import-mers-tren.mjs:54` — `stops.push({code:origin, arrive:e.OraP, depart:e.OraS, …})`. Semantica reală dovedită pe trenul 7901 (sntfc): la stația 70029, `StationareSecunde="30"` pe elementul plecat din 70029 arată că `OraP` = plecarea din `CodStaOrigine`, `OraS` = sosirea în `CodStaDest` — deci **OraP = plecare din CodStaOrigine, OraS = sosire în CodStaDest**. Importatorul publică deci, pentru fiecare escală: sosire = proprul timp de plecare, plecare = timpul de sosire al STANȚIEI URMĂTOARE. Consecințe măsurate: 7901 pleacă real din Nord la 00:30 (nu 00:36), iar „sosirea" 00:30 cu `f` = gara proprie (una din 237 la Nord / 125 la Brașov) e timpul de formare etichetat sosire. Toate timpurile panoului decalate cu o limită de escală (ex. Pajura: afișat dep 00:40:30, real 00:36; 70029: afișat arr 00:41, real 00:40:30).

- [ ] Regresie ÎNTÂI în `scripts/verify-mers-tren.mjs` (assigned: Builder)
  - Test (fixture-uri sintetice, înainte de orice modificare de importator — trebuie să pic verzui):
    1. *trenul care începe în stație*: prima escală NU produce rând de sosire; plecarea poartă OraP-ul primului element (7901-formă: OraP="1800" OraS="2160" → Nord: plecare t=1800, zero sosiri);
    2. *invarianta de staționare*: la o escală cu dwell 30 (`StationareSecunde="30"`), plecare − sosire = 30s, cu sosirea = OraS al elementului INTRAT și plecarea = OraP al elementului PLECAT (ancora probei: 70029 arr 2430 / dep 2460);
    3. *stația de tranzit* păstrează ambele rânduri comerciale;
    4. *sosirea finală tip T* = OraS al ultimului element real (nu OraP), fără plecare;
    5. *trenul circular*: sosirea de retur la origine se păstrează, sosirea false de formare NU apare.
  - Implement: extinde blocul de fixture-uri existent (model: capitolul 2, D14).
  - Verify: `node scripts/verify-mers-tren.mjs` (roșu înainte de fix, verde după)
  - Files: scripts/verify-mers-tren.mjs
- [ ] Rescrierea buclei de escală în `scripts/import-mers-tren.mjs` (assigned: Builder)
  - Test: cele 5 fixture-uri de mai sus.
  - Implement: înlocuiește liniile 47-63: parcurge elementele reale (markerul origine==dest rămâne sărit) și construiește per-stație perechi sosire/plecare — `sosire(stația X) = OraS(elementul cu CodStaDest===X)`, `plecare(X) = OraP(elementul cu CodStaOrigine===X)`; escală intermediară = îmbinarea celor două; final = doar sosirea, `tip:'T'`; prima escală a trenului = doar plecare. Dedup `code:depart:arrive` și eticheta `f:uniq[0].name` rămân; nu inventa sosire la origine.
  - Verify: `node scripts/verify-mers-tren.mjs` verde.
  - Files: scripts/import-mers-tren.mjs
- [ ] Regenarea corpusului + validare (assigned: Builder / Validator)
  - Test: `node scripts/import-mers-tren.mjs` (XML-urile edițiilor sunt cache-uite în `ssnc-agent-orch/2026/10/06/media-expansion/probes/` — fără re-fetch).
  - Implement: rulare import (rescrie `public/trains/*`, 128 shards + manifest + `public/data/snapshot-transport.json`).
  - Verify (probă nod, parte din validare): la 10017 — sosiri cu `f` egal cu numele stației scad 237→~0 (rămân doar retururi circulare reale); 7901: plecare t=1800 (00:30), fără rând de sosire la Nord; la 70029 arr 2430/dep 2460; totaluri în scădere onestă. PLUS: ochire pe un orar publicat (CFR/aplicația operatorului) pentru 7901 Nord — confirmare externă că plecarea reală e 00:30 (ancora internă e concludentă, publicația e proba finală).
  - Files: public/trains/**, public/data/snapshot-transport.json (regenerate, nu editate de mână)

## Faza B — contracte P2: N01 (URL absolut XLSX), N03+N04 (fereastra meteo), N07 (coordonate localități)

### N01 — linkul de export relativ
**Cauza (confirmată):** `app/api/mcp/route.ts:64` construiește `url=call.path+query` fără origine (linia 53 folosește deja bazaworkers.dev doar pentru apelul intern). Proba publică a infirmat blocarea pe origine: atât UA Chrome cât și `curl/8.7.1` primesc 200 + XLSX valid 572.762 bytes — 403/1010 este comportamentul clientului Python-urllib al auditorului (deja documentat în `docs/mcp.md:21`).

- [ ] Origine absolută în callRoute (assigned: Builder)
  - Test: e2e `e2e/mcp.spec.ts` LINK_CLASS — ÎNTÂI întărește aserțiunea de la linia 92: `result.content[0].uri` începe cu `http` și are `pathname==='/api/resource-file'` (păstrează `toContain('/api/resource-file')`), iar `structuredContent.url` rămâne descărcabil (linia 99 deja descarcă).
  - Implement: `app/api/mcp/route.ts` — mută `callRoute` în closure-ul POST-ului sau derivă originea: `const origin=new URL(request.url).origin`; linia 64 devine `const url=origin+call.path+(…query…)`; baza internă de la linia 53 poate rămâne `https://aflivra.brebu.workers.dev/` (folosită doar pentru fetch-ul intern de asset-uri).
  - Verify: `npm run test:e2e -- mcp.spec.ts` (linia 99 `request.get(url)` ia acum URL absolut — works cu baseURL fie fără)
  - Files: app/api/mcp/route.ts, e2e/mcp.spec.ts

### N03 — defaultul hours=48 promis de schemă
**Cauza (confirmată):** `lib/mcp/tools.ts:54` transmite `hours` doar când e dat explicit; ruta (`app/api/weather/route.ts:6-10`) întoarce copia integrală (168 rânduri). Proba live: fără hours → 168.

- [ ] Defaultul în build (assigned: Builder)
  - Test: `scripts/verify-mcp-live.mjs` proba `weather_forecast` (linia 23): assert `data.hourly.length===48` fără hours explicit + `hoursApplied===48`.
  - Implement: `lib/mcp/tools.ts:54` — când `args.hours` lipsește/null/nefiniț, trimite `'48'`; explicit → clamp 1..168 ca acum. Ruta rămâne cu fereastra integrală implicit (UI-ul `app/local-weather.tsx:9` cheamă fără hours și are nevoie de copia completă).
  - Verify: verify-mcp-live proba de mai sus; e2e mcp.spec rămâne verde.
  - Files: lib/mcp/tools.ts, scripts/verify-mcp-live.mjs

### N04 — fereastra orară începe la miezul nopții
**Cauza (confirmată):** `app/api/weather/route.ts:10` — `hourly.slice(0,hours)` taie de la index 0 (startul zilei locale din copia Open-Meteo).

- [ ] Fereastră de la ora curentă (assigned: Builder)
  - Test: verify-mcp-live proba weather: cu `hours=1` → exact 1 rând orar cu `time` >= ora curentă (bucket în curs), răspunsul poartă `windowStart` (ISO) când `hours` se aplică; `hours=48` → 48 rânduri care încep din bucket-ul curent.
  - Implement: în ramura `hours` a rutei: `const now=Date.now(); const start=hourly.findIndex(h=>Date.parse(h.time)+3600e3>now); const from=start<0?hourly.length-1:start;` apoi `hourly.slice(from,from+hours)` + `windowStart:hourly[from]?.time` (publicat numai când hours se aplică). Elementul orar are `time` ISO (lib/live/forecast.ts:6).
  - Verify: verify-mcp-live; ochire manuală UI (fără hours = copie integrală, neatinsă).
  - Files: app/api/weather/route.ts, scripts/verify-mcp-live.mjs

### N07 — localities_search promite coordonate
**Cauza (confirmată):** `app/api/localities/route.ts:5` servește doar câmpurile SIRUTA; corpusul urban `public/data/geographic-localities.json` (326 intrări cu lat/lon; intrarea „Brașov" city 45.65251/25.610565 EXISTĂ) nu e join-uit. Atenție probă: câmpul `county` din corpus amestecă `Braşov` (ş, U+015F) cu `Brașov` (ș, U+0219) — join-ul TREBUIE prin fold (`sameLocality` + `countyName`, ambele diacritice-transparente).

- [ ] Join de coordonate onest (assigned: Builder)
  - Test: verify-mcp-live proba `localities_search` q=„Brașov" — cel puțin intrarea oraș Brașov (siruta ~40498…): are `lat`+`lon`; o localitate rurală de pe aceeași pagină NU are (documentat onest).
  - Implement: în ruta localities, după `matches`: `const urban=(item)=>{const hits=geographicLocalities.filter(c=>sameLocality(c.name,item.name)&&countyName(c.county)===countyName(item.county));return hits.length===1?{lat:hits[0].lat,lon:hits[0].lon}:null}` — enrich doar la potrivire unică; altfel rândul rămâne fără coordonate. Descrierea tool-ului `lib/mcp/tools.ts:46` se schimbă în „coordinates for the urban localities that have them (partial coverage; rural rows carry no point)".
  - Verify: verify-mcp-live proba nouă.
  - Files: app/api/localities/route.ts, lib/mcp/tools.ts, scripts/verify-mcp-live.mjs

## Faza C — semnificația datelor P2: D21 (bump + etichete), N05 (publishedAt), N06 (edition=all)

### D21 — selecția firmelor
**Starea (infirmată cauza „SPARQL nou pică"):** sonda exactă a query-ului curent (VALUES + OPTIONAL P31 + label service) → HTTP 200 în 0,97s; în producție filtrul org e LIVE (eMAG Q23827008, EMAG, Emagic, Emagister, EMAG Elektrizitäts-AG — toate org-classed; Émagny Q484170/commună și Emaga laevis Q16521/taxon EXCLUSE; retailerul eMAG Q23827008 nu are P3608 în Wikidata — `cui:null` e sursă, nu bug). Persistența din retest = rând PRE-fix servit sub același `wikidata.company-name.v3` (versiunea exista DEJA înainte de fix — probă git), într-un moment când refresh-ul era în stale/backoff.

- [ ] Version bump (assigned: Builder)
  - Test: celula `company/name-search` existentă în verify-source-errors (classes fixture, linia 331) rămâne verde.
  - Implement: `lib/live/adapters.ts:126` — `version:'wikidata.company-name.v4'` — invalidează rândurile cu forma veche (fără `org`) servite sub v3.
  - Verify: `node scripts/verify-source-errors.mjs`
  - Files: lib/live/adapters.ts
- [ ] Eticheta de rezervă din wbsearchentities (polish) (assigned: Builder)
  - Test: extinde fixture-ul detail (linia 331) cu un rând al cărui `itemLabel` e QID-ul golit de label; assert: numele afișat e eticheta seed din wbsearchentities („Emagister"), nu QID-ul.
  - Implement: `lib/live/adapters.ts:112` — `name` folosește seed-ul când `fact.name` lipsește SAU e /^Q\d+$/ (label service-ul returnează QID-ul când nu are etichetă ro/en).
  - Verify: verify-source-errors celula extinsă.
  - Files: lib/live/adapters.ts, scripts/verify-source-errors.mjs

### N05 — publishedAt ±3h între feed și fișa articolului
**Cauza (confirmată prin probe; sursa se contrazice singură):** feedul TPBI publică `pubDate=Thu, 08 Oct 2026 15:08:21 +0000` (parse corect → 15:08Z, stabil) iar WP-REST `date_gmt=2026-10-08T15:08:21` (GMT, fără offset) — ambele spun 15:08Z. Pagina HTML poartă `<meta article:published_time content="2026-10-08T15:08:21+03:00">` — ora GMT căreia i s-a lipit +03:00 → 12:08Z (cu 3h înainte). cititorul de articol (`lib/live/content.ts:5` parseArticle) citește meta-ul deci servește 12:08Z; feedul (feeds.ts:9) servește 15:08Z. GMT-ul WP (RSS +0000 și date_gmt) e înregistrarea mașinală canonică — 15:08Z e adevăratul moment.

- [ ] WP-REST întâi pentru gazdele WordPress + bump (assigned: Builder)
  - Test: celulă în verify-source-errors pentru familia article: mock wp-json întoarce `date_gmt:'2026-10-08T15:08:21'` + content, iar HTML-ul meta-ul contradictoriu +03:00; assert `publishedAt==='2026-10-08T15:08:21.000Z'` și conținutul integral.
  - Implement: `lib/live/content.ts:9` articleLoader — pentru url-uri cu host în setul WP: încearcă ÎNTÂI endpoint-ul `wp-json/wp/v2/posts` (slug/p), `parseWordPress` dejaprechen `date_gmt+'Z'`; fallback HTML rămâne (parseArticlePage, meta) pentru gazdele fără WP. Version bump: `official.article-body.v3`→`official.article-body.v4` (publishedAt-ul din rândurile cache se schimbă).
  - Verify: verify-source-errors celula nouă + `feeds/stiri` existentă; probă live: același articol → 15:08Z în ambele fluxuri.
  - Files: lib/live/content.ts, scripts/verify-source-errors.mjs

### N06 — edition=all schimbă expired și activeOperators
**Cauza (confirmată):** `app/api/trains/route.ts:22` — `expired:edition==='current'&&!(…)` leagă expirarea de selecție; linia 21 — `activeIds` include tot arhivul la edition=all, deci `editionContext.activeOperators` (linia 36/42) duce 9 operatori în loc de 7.

- [ ] Metadate de ediție independente de selecție (assigned: Builder)
  - Test: verify-mcp-live proba `trains_schedule` extinsă: `station=30691&edition=all` → `cfm` și `regiotrans` au `expired:true`, `editionContext.activeOperators` are 7 (valabilе la data cerută), `editionContext.includedOperators` (nou) are 9; `edition=current` → 7/7.
  - Implement: `expired:!(operator.validFrom<=ymd&&operator.validTo>=ymd)` (numai din interval vs data cerută); `activeOperators=[...validIds]` (valabilе la data), `includedOperators:[...activeIds]` (rândurile efectiv servite); `rowFilter` rămâne pe `activeIds`.
  - Verify: verify-mcp-live proba extinsă; e2e mcp.spec trains rămâne verde (transport-level).
  - Files: app/api/trains/route.ts, scripts/verify-mcp-live.mjs

## Faza D — documentație (aceeași schimbare cu codul)

- [ ] `docs/mcp.md` (assigned: Scribe)
  - weather (linia 79): „implicit 48" devine real; adaugă semnificația ferestrei: începe din ora curentă, `windowStart` se publică când `hours` se aplică; fără `hours` pe ruta directă = copia integrală (UI).
  - trains (linia 138-139): capitolul primesște semnificația `expired` (din interval vs data cerută), `activeOperators` (valabilе la data) vs `includedOperators` (rânduri servite — arhivă la edition=all).
  - export binar/N01: URL-ul `resource_link` e absolut (originea cererii); menține notația despre clienții Python-urllib / CF 1010 (linia 21).
  - localities_search (capitolul de căutare localități): coordonatele sunt acoperire parțială (localități urbane), rândurile rurale rămân fără punct.
  - Files: docs/mcp.md

## Version bumps — lista exactă
| String | Fișier:linie | De la → la | De ce |
|---|---|---|---|
| `resource.complete-index.v6` | lib/live/resources.ts:76 | → `v7` | D11: rândurile `resource:<id>` D1 servesc parsarea pre-fix până la TTL |
| `wikidata.company-name.v3` | lib/live/adapters.ts:126 | → `v4` | D21: rândurile v3 populate fix-ul vechi servesc lista fără filtrul org |
| `official.article-body.v3` | lib/live/content.ts:9 | → `v4` | N05: publishedAt-ul din rândurile cache trece de la meta la date_gmt |
| NU se bump-uiesc | `resource.chunk.v2`/`resource.document.v1` (chei hashuite pe conținut), `weather.forecast.complete.v2` (felierea e la stratul rutei, nu în cache), `ckan.datastore-pages.v1`, `trains.planned.v1` (corpusul se regenerează integral prin import) | | |

## Agent Assignments

### Builder
Fazele A→D, în ordinea sarcinilor de mai sus (regresia întâi, la fiecare).

### Validator
- Rularea lanțului local: `npm run build`, porțile atinse (`verify-source-errors`, `verify-mers-tren`, `verify-mcp-live --live`, restul neatinse rămân verzi), `npm run test:e2e`.
- Proba corpusului N02 (numărătoarea f==stație, 7901) + ochirea orarului publicat.
- După deploy: `dataset_table` 387e35f7 → document; `search_companies` eMAG → formă v4; `weather_forecast` fără hours → 48 + windowStart; `trains` edition=all → N06; XLSX `resource_link` absolut.

### Scribe
- `docs/mcp.md` (Faza D).

### Specialists Recommended
- orchestrrate-api — supraveghează contractele MCP care se schimbă (N01 URL absolut, N03 default 48, N04 windowStart, N06 editionContext), pentru consistența schemei/tool descriptions.
- Fără orchestrate-security/devops/database: schimbările sunt în stratul de date/contract, nu infrastructură; fără migrări D1 (schema neschimbată).

## Riscuri (declarate, nu blocaje)
1. **Burst CKAN după bump-ul v7** — fiecare `resource:<id>` citit după deploy re-fetch-ează (bounded de bugetul `ckan` 500/h, lib/live/cache.ts:72); sursele care rate-limitează în fereastră servesc `stale` onest până la retry.
2. **N02 validează publicarea** — invarianta internă (dwell=StationareSecunde) e demonstrată, dar confirmarea externă (orar publicat 7901 Nord 00:30) trebuie ochită înainte de merge; corpusul se ресcrie integral (128 shards + checksums).
3. **N02 schimbă numerele publicate** — sosirile scad (237 false la Nord, 125 la Brașov); consumatorii care comparaau totalurile vechi vor vedea diferența (UI-ul doar afișează listele).
4. **N05 WP-first** — gazdele WP fără endpoint funcțional cad pe fallback-ul HTML (comportamentul de azi); un fetch suplimentar pe articol la gazdele WP lente.
5. **N03 default 48** — răspunsul MCP implicit se micșorează de la ~178k caractere la ~56k (dorit, audit D26); clienții care așteptau 168 fără hours explicit trebuie să ceară `hours=168`.
6. **N01** — URL-ul absolut reflectă originea cererii (workers.dev sau domeniu viitor); e2e folosește baseURL local → aserțiunea pe pathname, nu pe origin hardcodat.
