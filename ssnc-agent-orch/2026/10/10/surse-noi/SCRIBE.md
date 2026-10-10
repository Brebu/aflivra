# Surse românești noi — documentația integrării MCP (livrabile pentru sesiunea de implementare)

**Mandat:** directiva utilizatorului — «implementează toate aceste noi surse, bagă-le sub categoriile existente și expune-le în MCP» — aplicată la 5 surse recomandate (SITUR, AMCCRS, INS TEMPO, ANRE/POSF, Transelectrica SEN) + 2 reținute (INFP/EIDA, INP/LMI), testate 10.10.2026 în `~/Downloads/Aflivra_Surse_Romanesti_Testate_2026-10-10_3070.md` (commit de referință `b351e96`).

**Rol:** Scribe, read-only pe cod — scriu **doar** aici. Acest document aliniază livrabilele de documentație la **ARCHITECT.md** (analiza de record a sesiunii, același director): schemele/doc-urile de mai jos urmează §1, §4, §5 și §8 din el; unde draftul meu inițial divergea, am adoptat decizia arhitectului și am notat divergența. Runda 5 (`runda5-audit`) nu se atinge.

---

## 0. Contractul de proces — cum aterizează livrabilele

1. **Capitolele docs/mcp.md și intrările tools.ts aterizează împreună, în aceeași schimbare** — poarta `scripts/verify-mcp.mjs` §15 (:251–270) asertează că titlurile `### \`tool\`` din documentație sunt exact registrul de tool-uri; o schiță lipită fără tool-ul din tools.ts pârlește poarta. Antetul „## Tool-uri (34)" devine **(39)**. Capitolele se adaugă la finalul listei, înainte de paragraful „Întreținere".
2. **Fiecare exemplu JSON din docs trece validarea schemei lui** (§15 :262–270) — exemplele de mai jos sunt scrise exact contra schemelor din §3.
3. **Fiecare parametru emis de `build` trebuie citit de rută** (§12–13 :213–238: `.get('key')`/`.has('key')`). Rutele noi (ARCHITECT §5): `app/api/tourism/route.ts`, `app/api/seismic/route.ts`, `app/api/ins/route.ts`, `app/api/energy-offers/route.ts`, `app/api/power/route.ts`.
4. **Seturile închise → `enum` la granița MCP cu valorile exacte în descriere** (lecția R01): `kind` (`cazare|alimentatie|agentii`), `sector` (1–6), `matrix` (`POP105A` — altă matrice se respinge onest până la validare separată), `geoScope` (`context|local|national`). Validarea integer/min/max (A19) se moștenește pentru `consumptionMonthly`, `sector`, `page`.
5. **`scripts/verify-mcp-names.json`** se regenerează din pin la fiecare trecere verde (§14) — nu se editează de mână.
6. **Probele live-semantice** pentru cele 5 intră în `verify-mcp-live.mjs` **la varianta rescrisă A27, la momentul implementării** (ARCHITECT §9) — nu acum, în timpul rundei 5.
7. **Porți de corpus + probe SHA** (ARCHITECT §1.1–1.2): `verify-situr-corpus.mjs` (32.058/9.063/3.104 rânduri + SHA-256 + contor CUI lipsă) și `verify-amccrs-corpus.mjs` (2.798 + unicitate ID + contorul celor 48 forme); probele `/situr/*`, `/amccrs/*` se înscriu în `public/data/snapshot-transport.json`. Celule VSE per rută (fixture mock) + pinuri VM + capitol docs — toate laolaltă, per practica rundei.
8. **Stările/plicul rămân ale platformei:** `fresh|cached|stale|unavailable`, `observedAt`/`publishedAt`/timpul descărcării distincte. Bugete noi de familie în `lib/live/cache.ts`: `ins` 60/h, `posf` 60/h, `transelectrica` 120/h onDemand (TTL 60 s; ARCHITECT §1.3–1.5). Importul SITUR + fluxul nonce AMCCRS trăiesc **offline, în script** (`import-situr-snapshot.py`), nu în Worker.

---

## 1. Harta pe categorii — decizia arhitectului (§4 ARCHITECT) + nota mea

**Consumatorii reali de categorii** (de reținut înainte de orice „bagare"): `lib/live/catalog-categories.ts` (14 categorii) clasifică **seturile CKAN** — alimentează tab-urile `app/catalog-workspace.tsx` și interogările `app/api/catalog/route.ts`. Cele 5 surse sunt **directe, nu seturi CKAN** → `catalog-categories.ts` **nu se modifică**; categoria se aplică în capitolele docs, familiile de date UI și eventualele feed-uri viitoare. `energie` există deja ca `kind` în `federated_search`/`news_feed` — POSF/SEN se pot alătura acolo ulterior, decizie separată de produs.

| Sursă | Categorie (ARCHITECT §0/§4) | Raționament | Nota Scribe |
|---|---|---|---|
| SITUR | **firme** — «cea mai puțin greșită» | registru de clasificare/licențiere a operatorilor economici (denumire, CUI, autorizație) — exact limbajul registrului comercial; «turism» lipsește din cele 14 și adăugarea ei e decizie de produs | acceptat; alternativa culturală din draftul meu inițial e respinsă corect — datele sunt licențiere economică, nu patrimoniu |
| AMCCRS | **local** — «cea mai puțin greșită» | registru urban al PMB despre clădiri; «construcții/locuințe» nu există; `mediu` (vreme/poluare) ar fi greșit | acceptat |
| INS TEMPO (POP105A) | **local** — parțial, pe materie | serie demografică pe județe/teritorii = context teritorial; **principiu per materie** (ARCHITECT §1.3): serii economice→`bani`, sanitare→`sanatate` | draftul meu inițial propunea `bani` — **corectat după arhitect**: POP105A e demografie teritorială, nu «bani & economie»; per-materie e regula bună |
| ANRE / POSF | **energie** | curat | — |
| Transelectrica SEN | **energie** | curat | — |
| INFP / EIDA (reținut) | mediu *(dacă se face)* | fenomene naturale, monitorizare | — |
| INP / LMI (reținut) | cultura | interogarea categoriei include deja «patrimoniu OR monument*» | — |

---

## 2. Capitole docs/mcp.md — textul exact, la stilul existent (română, clauze de onestitate inline)

### `tourism_registry`

> Registrele turistice naționale clasificate (SITUR · Direcția Generală de Turism): trei registre — `cazare`, `alimentatie`, `agentii` — cu operator, categorie, localitate/județ, numărul autorizației sau licenței cu data emiterii și capacitatea declarată (la cazare); filtre geografice pe `locality`/`county`/`geoScope`, paginat. E un registru de clasificare și licențiere: NU conține prețuri de camere, rezervări, grad de ocupare sau dovada că unitatea funcționa în ziua interogării. Un `cui` lipsă nu înseamnă operator neautorizat — 7.259 de cazări nu au CUI în export, servite `null` cu numărul lipsurilor declarat, niciodată inventat; numărul de înregistrări nu estimează piața, iar listele includ și operatori persoane fizice — nu toate rândurile sunt firme distincte. Rândurile cu CUI valid alimentează dosarul ANAF prin `company_profile` (potrivire fiscală dovedită, nu lexicală). Ambele date ale sursei se servesc separate — `exportDate` (din titlul exportului) și `pageDate` (din pagina de index) — fără uniformizare. Licență: reutilizare comercială neconfirmată — sursă oficială; proveniența la vedere.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "tourism_registry", "arguments": {"kind": "cazare", "county": "Brașov"}}}
```

### `seismic_buildings`

> Lista imobilelor cu expertiză seismică din București (AMCCRS · Primăria Municipiului București; lista declarată actualizată la 06.10.2026, 2.798 de imobile): adresă (stradă, număr, sector), anul construirii, regimul de înălțime, numărul de apartamente, anul expertizei, ultima încadrare și încadrările anterioare. Fiecare rând poartă ambele clase: `originalClass` — textul integral al sursei (48 de forme text distincte în câmpul clasei, inclusiv un nume de persoană și o valoare goală) — și `normalizedClass` (`RsI`–`RsIV`, `consolidata`, `urgenta`, `neincadrata`, `neclasificabila`): normalizarea e a platformei, iar categoriile de urgență rămân distincte de clasele Rs, fără echivalare automată. Acoperirea e doar București. O adresă fără înregistrare înseamnă «nu am găsit o înregistrare», NU «clădire sigură»; potrivirile pe adresă poartă încrederea (`exact`/`ambiguous`). Registrul nu spune nimic despre situația cadastrală sau juridică a imobilului. Licență: reutilizare comercială neconfirmată.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "seismic_buildings", "arguments": {"q": "Mihai Bravu"}}}
```

### `ins_series`

> Seriile statistice oficiale INS (TEMPO Online): `POP105A` — populația rezidentă la 1 ianuarie — valorile pe teritoriul cerut (județ sau municipiu; potrivirea pliază diacriticele) pentru anii cei mai recenți ai matricei, cu unitatea și perioada de referință. Anii se derivă din metadatele matricei la fiecare încărcare — nu sunt hardcodați. Statutul revizuit/provizoriu există la sursă ca marcare (îngroșat/subliniat în clientul oficial; exportul CSV al sursei o pierde) — dacă fluxul de date nu-l poartă explicit, valorile se servesc fără statut inventat, cu nota onestă; valorile 2026 la POP105A sunt provizorii conform legendei. Granularitatea e a matricei — județe și municipii, nu de cartier. Doar `POP105A` e validat; alt cod de matrice se respinge onest până la o validare separată. Licența CC BY 4.0 e declarată pe intrarea de catalog TEMPO (data.gov.ro); aplicarea ei la fluxul API direct rămâne de verificat — atribuirea INS și proveniența se servesc la vedere.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "ins_series", "arguments": {"matrix": "POP105A", "territory": "Brașov"}}}
```

### `energy_offers`

> Comparatorul ANRE de oferte de energie electrică (POSF), pe profilul casnic testat: ofertele valabile în zona de furnizare a județului — zona se rezolvă prin lista publicată de POSF, nu e hardcodată — la data comparatorului (servită în răspuns), pe profilul de consum cerut: furnizor, preț final în `lei/kWh`, componente de tarif, factura calculată de comparator, perioade de ofertare și de aplicare, cu link spre documentul ofertei. Duplicatele integral-identice după identificator se elimină, cu numărul servit onest (`duplicateIdenticalRows`: 170 brute → 85 distincte în zona București); printre ele, ~20 de oferte per răspuns sunt pentru prosumatori și poartă `prosumator: true` — nu se elimină, nu se recomandă, iar minimul de preț nu se citește niciodată ca «disponibil oricui». Factura calculată e ipoteza comparatorului pe consumul introdus, nu o ofertă fermă; validitatea la data comparatorului nu confirmă eligibilitatea contractuală. Endpoint-ul e cel al clientului web public POSF, nu un API de integrare cu contract de stabilitate; ofertele de gaze și schimbarea furnizorului nu sunt expuse (netestate). ANRE menține o restricție de copiere fără acord scris pe pagina comparatorului — declarată aici, fără extindere automată la date. Licență: reutilizare comercială neconfirmată.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "energy_offers", "arguments": {"county": "Brașov", "consumptionMonthly": 200}}}
```

### `power_system`

> Starea sistemului energetic național (Transelectrica · SEN): consum, producție și sold în MW. Marcajul temporal al sursei se servește în ambele forme — `observedAtText` original (anul cu două cifre, apoi luna și ziua) și `observedAt` ISO, sub convenția de fus orar Europe/Bucharest declarată ca presupunere documentată, neconfirmată de sursă; `observationAgeSeconds` arată vechimea observației. Observațiile sursei vin la 1–2 minute, nu sub-secundă — nu e telemetrie de precizie, iar o vechime de ~2 minute e normală, nu avarie; când sursa nu reușește, ultima copie validă se servește marcată `stale`, cu vârsta declarată. Soldul și puterea NU sunt tarife de energie. Componentele de producție se servesc așa cum le publică sursa, cu nota că agregarea lor nu e reconciliată de sursă (discrepanță de 161 MW la testare; contract de agregare nedefinit). Licență: reutilizare comercială neconfirmată.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "power_system", "arguments": {}}}
```

### Schițe scurte — cele două reținute (HOLD, ARCHITECT §2 — nu v1)

**`seismic_events`** (INFP/EIDA — numele de la arhitect; dacă se face, la cerere de produs):
> Evenimentele seismice istorice și stațiile rețelei naționale de monitorizare (INFP · EIDA), pe interval, dreptunghi geografic și limită: timp, coordonate, adâncime, magnitudine. Istoric și infrastructură documentate — NU flux de evenimente curente (interogările recente răspund 204 fără date, ceea ce nu dovedește lipsa cutremurelor) și NU predicție sau evaluare a siguranței unei clădiri. Licențele rețelelor și produselor se păstrează separate.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "seismic_events", "arguments": {"from": "2019-12-01", "to": "2020-01-01"}}}
```

**`heritage_monuments`** (INP/LMI — cel mult un index cod→denumire cu baza 2015 declarată, la cerere de produs):
> Lista Monumentelor Istorice (INP) — baza 2015, publicată în 2016: cod LMI, denumire, adresă, localitate. Servește ca bază istorică: clasificările ulterioare vin din ordinele Ministerului Culturii și nu sunt incluse; semnalează posibila apartenență la patrimoniu, fără verdict juridic actual automat. Numărul de coduri extras la testare (2.474 distincte în PDF-ul București, 233 de pagini) e rezultat de extragere, nu un număr oficial validat. Licență: reutilizare comercială neconfirmată.

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "heritage_monuments", "arguments": {"county": "București"}}}
```

---

## 3. Descrieri tool MCP (tools.ts, engleză) — text exact de lipit, schemele din ARCHITECT §5

Familia existentă: denumiri `snake_case`, each tool 1:1 pe o rută publică care își rețin validarea, registre multi-fel cu `kind`, filtre `q`/`locality`/`county`/`geoScope`/`page`, descrieri în engleză cu numele exacte ale câmpurilor, fără parametri pentru citiri simple (`ancpi_integrals`). **Cele 5 nume din fișierul de testare sunt acceptate de arhitect (§5)** — cu aceste scheme. Versiunea de față corectează draftul meu inițial conform ARCHITECT §5: `geoScope` intră la tourism; `ins_series` primesc `territory` (nu selection cu id-uri de opțiuni); `energy_offers` primesc `consumptionMonthly` + `q` (fără parametru de dată — data comparatorului se servește); rutăle sunt `/api/energy-offers` și `/api/power`.

```ts
{
  name:'tourism_registry',
  description:'The classified national tourism registries (SITUR / General Directorate for Tourism): three registries — cazare (accommodation), alimentatie (public food structures), agentii (travel agencies) — with operator, category, locality/county, authorization/license number with issue date, and declared capacity (accommodation). A classification and licensing registry: no room prices, bookings, occupancy or proof of operation at query time. A missing CUI never means an unauthorized operator (7,259 accommodation rows carry none in the export — served as cui: null with the absence counted, never invented); row counts are registrations, not market estimates, and rows include sole-trader operators, not distinct firms only. Rows with a valid CUI feed the ANAF dossier through company_profile — a proven fiscal match, never a lexical one. Both source dates are served separately — exportDate (export title) and pageDate (index page) — never unified. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
  inputSchema:{type:'object',properties:{
    kind:{type:'string',enum:['cazare','alimentatie','agentii'],description:'Which registry to read: cazare (accommodation), alimentatie (public food structures) or agentii (travel agencies) — source naming, like forensic_experts'},
    q:{type:'string',description:'Free-text row filter (unit or operator name)'},
    locality:{type:'string',description:'Locality name — filters rows to the locality'},
    county:{type:'string',description:'County name — filters rows to the county (normalized)'},
    geoScope:{type:'string',enum:['context','local','national'],description:'Geographic scope of the filter (default national)'},
    page:{type:'number',description:'Zero-based result page'}
  },required:['kind']},
  build:args=>({path:'/api/tourism',query:query([['kind',pick(['cazare','alimentatie','agentii'],args.kind)],['q',str(args.q)],['locality',str(args.locality)],['county',str(args.county)],['geoScope',pick(['context','local','national'],args.geoScope)||'national'],['page',num(args.page)]])}),
},
{
  name:'seismic_buildings',
  description:'The seismic classification list of Bucharest buildings (AMCCRS / City Hall): address (street, number, sector), construction year, height regime, apartment count, expertise year, latest and previous seismic classifications. Each row serves both the source\'s originalClass text (48 distinct text forms in the source field, kept integral — including a person name and an empty value) and the platform\'s normalizedClass (RsI, RsII, RsIII, RsIV, consolidata, urgenta, neincadrata, neclasificabila); urgency categories stay distinct from Rs classes without automatic equivalence. Coverage is Bucharest only. An address without a record means "no record found" — never "safe building"; address matches carry their confidence (exact/ambiguous). The registry says nothing about the cadastral or legal status of a property. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
  inputSchema:{type:'object',properties:{
    q:{type:'string',description:'Free-text address query (street name, number), e.g. "Mihai Bravu"'},
    sector:{type:'string',enum:['1','2','3','4','5','6'],description:'Sector of Bucharest (1–6)'},
    page:{type:'number',description:'Zero-based result page'}
  },required:['q']},
  build:args=>({path:'/api/seismic',query:query([['q',str(args.q)],['sector',pick(['1','2','3','4','5','6'],args.sector)],['page',num(args.page)]])}),
},
{
  name:'ins_series',
  description:'Official INS statistical series (TEMPO Online): POP105A — resident population at January 1 — values for a requested territory (county or municipality name, diacritics-folded matching) over the matrix\'s most recent years, with unit and reference period. Years derive from the matrix metadata on every load — never hardcoded. The revised/provisional status exists at the source as a typographic mark (bold/underline in the official client; the source CSV export loses it); if the data flow does not carry it explicitly, values are served without an invented status, with the honest note — 2026 values at POP105A are provisional per the source legend. Granularity is the matrix\'s own — counties and municipalities, not neighborhoods. Only POP105A is validated; another matrix code is rejected honestly until separate validation. CC BY 4.0 is declared on the TEMPO catalog entry (data.gov.ro); its application to the direct API flow remains to be verified — INS attribution and provenance are served visibly. Commercial reuse license (beyond the catalog entry): unconfirmed — official source, verification use.',
  inputSchema:{type:'object',properties:{
    matrix:{type:'string',enum:['POP105A'],description:'Matrix code — only POP105A (resident population at January 1) is validated; other matrices until separate validation'},
    territory:{type:'string',description:'Territory name (county or municipality, e.g. "Brașov", "Cluj", "Municipiul București") — matched with folded diacritics'},
    page:{type:'number',description:'Zero-based result page'}
  },required:['matrix']},
  build:args=>({path:'/api/ins',query:query([['matrix',pick(['POP105A'],args.matrix)],['territory',str(args.territory)],['page',num(args.page)]])}),
},
{
  name:'energy_offers',
  description:'The ANRE electricity offer comparator (POSF) on the tested household profile: offers valid in a county delivery zone (zone resolved from the POSF-published county list, never hardcoded) at the comparator\'s served date, for a monthly consumption — supplier, final price in lei/kWh, tariff components, the comparator-computed bill, offering/application periods and each offer document. Identical duplicate rows are deduplicated by offer id with the count served honestly (duplicateIdenticalRows: e.g. 170 raw → 85 distinct in the Bucharest zone); about 20 offers per response are prosumer-only and carry prosumator: true — never removed, never recommended, and the minimum price is never "available to anyone". The computed bill is the comparator\'s hypothesis on the entered consumption, not a binding quote; validity at the comparator\'s date does not confirm contractual eligibility. This is the public web client\'s endpoint, not a contracted integration API; gas offers and supplier switching are not exposed (untested). ANRE maintains a no-copying-without-written-consent restriction on the comparator page — declared here, not automatically extended to the data. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
  inputSchema:{type:'object',properties:{
    county:{type:'string',description:'County name — the route resolves it to the POSF delivery zone from the POSF county list (e.g. "Brașov" → zone 3, "București" → zone 7)'},
    consumptionMonthly:{type:'number',description:'Monthly consumption in kWh, 1–20000 (default 200) — anchors the household profile; the annual figure derives from it'},
    q:{type:'string',description:'Free-text filter (supplier name)'},
    page:{type:'number',description:'Zero-based result page'}
  },required:['county']},
  build:args=>({path:'/api/energy-offers',query:query([['county',str(args.county)],['consumptionMonthly',num(args.consumptionMonthly)],['q',str(args.q)],['page',num(args.page)]])}),
},
{
  name:'power_system',
  description:'Romanian power system status (Transelectrica SEN): production, consumption and balance in MW. The source timestamp is served raw (observedAtText — two-digit year first, then month and day) alongside observedAt ISO under a declared Europe/Bucharest timezone assumption (documented presumption, unconfirmed by the source); observationAgeSeconds carries the observation age. Source observations arrive at a 1–2 minute cadence, not sub-second — not precision telemetry; an age of about 2 minutes is normal, not an outage. When the source fails, the last valid copy is served marked stale with its age declared. Balance and power are not energy tariffs. Generation components are served as published, with the note that their aggregation is not reconciled by the source (a 161 MW discrepancy at testing; aggregation contract undefined). Commercial reuse license: unconfirmed — official source, personal study and verification use.',
  inputSchema:{type:'object',properties:{}},
  build:()=>({path:'/api/power',query:{}}),
},
```

**Note de implementare reținute din testare** (wiring, complement la ARCHITECT §1 și §7 — numai ce nu e deja acolo):

- **SITUR** — marcajele JSON ale hărții (`listalatlng`: 31.281 cazare / 8.973 alimentație / 3.085 agenții) nu concordă cu numărul de rânduri din registru și 3+7 marcaje cad în afara dreptunghiului de control 43–49°N/20–30°E — nu se sincronizează forțat cu rândurile; listele radiate/retrase sunt listate în index dar **netestate** în această rundă (etapă ulterioară, declarată ca atare).
- **AMCCRS** — paginarea `skip_rows=0,10 × limit_rows=10` a răspuns identic cu rândurile 0–19 ale descărcării complete: bună celulă de regresie pentru fluxul din scriptul offline; totalurile normalizate din test (RsI 415; RsII 491; RsIII 163; RsIV 11; consolidate 118; urgență 1.454; neîncadrate 144; neclasificabile 2) sunt calcul de test, nu rezumat oficial — nu se publică ca atare.
- **TEMPO** — payload-ul POST `arr` are etichete cu **spații finale** („Total " pentru nomItemId 105/108) — se reproduc exact cum le servește sursa; ruta funcțională e `http://…:8077` (HTTPS-ul variantei vechi: 502 prin proxy, inconcludent); condiția RDY = proba live din Workers pe portul 8077, altfel fallback ghRelayed sau HOLD (ARCHITECT §1.3).
- **POSF** — `data_start_aplicare` e în **format românesc ZZ-LL-AAAA**; `Content-Type`-ul răspunsului e HTML deși corpul e JSON — parsarea pe corp, nu pe header; 422 cu explicații la parametri nemapați — se suprafațează eroarea onestă cu diagnostic (contractul A30); `valoare_factura_curenta` rămâne punct deschis (parametru opțional documentat sau omisiune — ARCHITECT §1.4).
- **SEN** — structura e listă de obiecte cu câte o cheie = **o observație**, nu un tabel; controlul aritmetic `consum − producție − sold = 1 MW` în ambele probe: bună celulă de regresie.

---

## 4. Proveniență & licențe — tabel sursă → URL → licență → statut

Procedura de documentare e decidată în ARCHITECT §8 (propoziție finală în descrierea EN — aplicată în §3; `license: null` + `licenseNote` în datele servite; paragraf de licență în capitolul docs; POSF + mențiunea restricției ANRE; TEMPO CC BY 4.0 declarat exact cât acoperă). Tabelul de mai jos e materia pentru `licenseNote` și pentru eventuala secțiune „## Proveniență și licențe" din docs/mcp.md (poarta §15 n-o atinge — pin-ul e doar pe capitolele de tool).

| Sursă | URL oficial | Licență | Statut confirmare |
|---|---|---|---|
| SITUR · DGT | `https://se.situr.gov.ro/OpenData/OpenDataMain` | nedeclarată pe fluxul de export («date publice») | **neconfirmată** — reutilizare comercială neconfirmată |
| AMCCRS · PMB | `https://amccrs-pmb.ro/lista-imobile-2/` | nedeclarată pe fluxul Ninja Tables (tabel „Lista Cladiri 2026", id `2383`) | **neconfirmată** |
| INS TEMPO | `http://statistici.insse.ro:8077/tempo-online/` | **CC BY 4.0** pe intrarea TEMPO din catalogul data.gov.ro | **parțial confirmată** — aplicarea la fluxul API direct (port 8077) rămâne de verificat; atribuirea INS se servește oricum |
| ANRE / POSF | `https://posf.ro/comparator` (indicat de `https://arhiva.anre.ro/ro/info-consumatori/comparator-de-tarife`) | pagina ANRE declară **restricție la copiere fără acord scris** | **neconfirmată + restricție declarată** — declarată, fără extindere automată la date |
| Transelectrica SEN | `https://www.transelectrica.ro/web/tel/sistemul-energetic-national` (fluxul real `/sen-filter`) | nedeclarată | **neconfirmată** |
| INFP / EIDA *(reținut)* | `https://infp.ro/index.php?i=eida`; FDSN `https://eida-sc3.infp.ro/fdsnws/…` | licențe per rețea de monitorizare, păstrate separate | declarată per rețea; reutilizare comercială **neconfirmată** |
| INP / LMI *(reținut)* | `https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice` (PDF LMI 2015, publicat 2016) | nedeclarată pe fișier | **neconfirmată** |

*Verificată la 10.10.2026 (data fișierului de testare); accesul anonim nu e dovadă de licență — clauză repetată în fiecare capitol.*

---

## 5. Goluri și întrebări de clarificare

**(a) Harta pe categorii.** Decidată de arhitect (§1, §4): SITUR→`firme`, AMCCRS→`local`, TEMPO/POP105A→`local` cu principiul per materie, POSF→`energie`, SEN→`energie`; `catalog-categories.ts` nu se modifică. **Residual pentru utilizator:** se dorește și atașarea POSF/SEN la domeniul `energie` din `federated_search`/`news_feed` (există deja ca `kind`), sau rămân only-tool-uri în prima livrare? (Feed-urile federate sunt anunțuri instituționale; POSF/SEN sunt tabel/live — nu se potrivesc natural, dar `energie` e deja acolo.)

**(b) INFP/EIDA și INP/LMI — în sau în afara primei livrări?** Arhitect: **HOLD amândouă** (§2) — EIDA: fluxul de evenimente curente nevalidat (204 pe interogările recente; nu se deduce lipsa cutremurelor), tool planificat `seismic_events` doar la cerere; LMI: bază 2015 cu structura de rânduri nereconstruită — cel mult un index cod→denumire cu baza declarată. Directiva «implementează toate» se interpretează ca cele 5 recomandate (exact verdictul fișierului de testare). **Residual:** confirmă utilizatorul că HOLD e acceptabil sau le vrea în prima livrare — dacă da, deschid puncte de lucru pe `seismic_events` + indexul LMI.

**(c) Licențele neconfirmate — ce atitudine?** Procedura e decidată (ARCHITECT §8): disclaimer onest peste tot (descriere EN + docs + `license: null`/`licenseNote`), mențiunea explicită a restricției ANRE la POSF. **Residual singur:** POSF — se servește cu disclaimer (recomandarea arhitectului, adoptată și de mine) sau se amână până la un răspuns ANRE? Argument pentru a servi: sursă oficială indicată de ANRE, acces anonim public; argument pentru a amâna: restricția de copiere e text activ pe pagina indicatoare, nu doar absența unei licențe.

**(d) Numele tool-urilor și ale parametrilor.** Toate 5 acceptate de arhitect (§5), cu precedentele date: `tourism_registry` (familia `-registry`), `seismic_buildings` (substantiv_domeniu ca `flight_board`), `ins_series` (scurt ca `ancpi_integrals`), `energy_offers` (domeniul, nu editorul — ca `weather_forecast`), `power_system` (fără parametri, precedent `ancpi_integrals`). Alternativele discutate și respinse/marcate: `sen_live` (prezentul `_live` e pentru transport live multi-orășeanesc; SEN e o singură observație de sistem — se poate ridica din nou dacă se face polling), `seismic_registry` (unitatea de date e imobilul), `situr_registry`/`posf_offers` (domeniu > sursă în familie). Numele parametrilor urmează §5 arhitectului: `consumptionMonthly` (nu `monthlyKwh` — în payload-ul către sursă câmpul rămâne `consum_lunar`, cum îl publică POSF; al tool-ului e al platformei), `territory`, fără parametru de dată la energy_offers. **Residual:** niciunul asupra numelor finalificate — unica discuție care poate reînvia e `sen_live`, dacă polling-ul SEN devine când suprafață expusă.

**(e) Goluri de proces observate (de știut, nu de reparat din docs):** antetul „Tool-uri (34)"→(39) sincronizat; `public/llms.txt`/`llms-full.txt` deleagă spre docs/mcp.md — fără schimbări proprii; dependențele de runda 5 (A19/A23/A24–A26/A27/A05/A11/A29/A30) sunt inventariate în ARCHITECT §9 — noile tool-uri se expun sub contractul final MCP.

---

## 6. Tabel de dovezi — runda de testare a surselor, 10.10.2026

Stil: runda 3 (`ssnc-agent-orch/2026/10/09/round3/mcp-audit-evidence.md`). Sursa: fișierul de testare — 57 cereri HTTP înregistrate + 4 apeluri MCP, fără mock-uri; probele primesc cereri reale cu TLS activ. Amprentele complete provin din anexa «Fișiere și răspunsuri principale»; probele secundare cu prefix de 12 caractere.

| Sursă | Rute testate | Probe principale (SHA-256) | Ce certifică |
|---|---|---|---|
| SITUR / DGT | `GET …/OpenData/OpenDataList?type=listaCazari`; `GET …/OpenData/ExportToExcel?type={listaCazari, listaAlimentatie, listaAgentii}` | `tourism-xlsx-cazari` `2eb48e82ab681802e12a555cf162417d1ee3a6994f19b663808c978e917d6b2e`; `tourism-xlsx-listaAlimentatie` `0fcefbb6b76f80415d81f943b66eec2697cb81270c0294f70518d4086383bf64`; `tourism-xlsx-listaAgentii` `c946337716ef8b5cc796c17d7f95b2325f8da9cb42803f0310ac3ee015c6799a` | 3 exporturi XLSX descărcate integral și parsate: 32.058 cazări (18 câmpuri; 7.259 fără CUI; 2.443 fără detaliu de adresă), 9.063 alimentație, 3.104 agenții; concordanță cu listele HTML; titlurile exportului declară actualizare 10.10.2026 (indexul afișa 09.10.2026 — datele se păstrează separate) |
| AMCCRS / PMB | `GET /wp-admin/admin-ajax.php?action=wp_ajax_ninja_tables_public_action&table_id=2383&target_action=get-all-data…` + paginile `skip_rows=0,10 & limit_rows=10` | `amccrs-data` `09983475cb3439b64f032c43ecd6f18c1b1accb0024f508741e650141ae1ae3f`; pagini `bc9cec5b4068`, `9953832d5a56` | JSON integral: 2.798 rânduri, 2.798 id-uri unice; paginile 0 și 1 identice cu rândurile 0–19 ale descărcării complete (paginare validată); 48 forme text de încadrare inspectate; tabel declarat actualizat 06.10.2026 |
| INS TEMPO | `GET http://statistici.insse.ro:8077/tempo-ins/matrix/POP105A`; `POST …/matrix/POP105A`; `POST …/pivot` | `ins-pop-values` `d10d40bca6dd040fbcd245c733e366de8968546a754da7c2d7260e4fea97d6d1`; `ins-pivot-csv` `00af5287c63fe5c78d3fb1ee4cc9aac4009763dce3bf9d33cd40f4b73f757c27`; runtime `778844ae0088` | 9 valori (3 teritorii × 3 ani) concordante cu CSV-ul (9 rânduri × 7 coloane); legenda revizuit/provizoriu (îngroșat/subliniat) păstrată din răspunsul original; `ins-api-http` `af4b545208fa` certifică ruta HTTP:8077 (probele HTTPS: 502 prin proxy, inconcludente); metadatele declară actualizare 10.09.2026 |
| ANRE / POSF | `GET https://posf.ro/comparator/api/index.php?request=get-judete`; `GET …?request=comparator-electric&…` (parametrii exacți ai clientului public) | `posf-offers-bucuresti-valid` `33f78e4c259f3fc9146570074083b974f41b9b05200d5e81cc25d66ba20de75c`; `posf-offers-brasov-valid` `8b10c0502c0c861f7459144fa0dfb9df304c382104c11b5f7fa3f971daf7c344`; 422 inițial `6d0218595e11`; `posf-counties` `2cafbb45fd36` | Răspunsuri JSON parseabile 200 pe două zone (7 = București/Muntenia Sud, 3 = Brașov/Transilvania Sud, zonele din lista POSF): 170/148 rânduri brute, 85/74 oferte distincte, 46/38 furnizori; unitate uniformă `lei/kWh`; date de valabilitate parseabile, fereastră acoperind 10.10.2026; 422-ul inițial documentează mapările obligatorii de parametri |
| Transelectrica SEN | `GET https://www.transelectrica.ro/web/tel/sen-filter` (fluxul paginii oficiale), de două ori | `sen-data` `1173fe43ea8f8899c560fc47b980e90bf2379215153782f8a2fba3d89c2ce895`; repet `0dd96a30cccb` | Două observații JSON complete, distincte (consum/producție/sold + timestamp sursă `26/10/10 8:28:02` / `8:28:28`); controlul aritmetic `consum − producție − sold = 1 MW` în ambele probe; ceasul sursei 61/106 s în urmă la momentele cererilor |
| INFP / EIDA *(reținut)* | `GET https://eida-sc3.infp.ro/fdsnws/station/1/query?net=RO&level=station&format=text`; `GET …/event/1/query?…&format=text&limit=10` (+ filtre bbox 43–49°N/20–30°E) | `infp-stations` `6b99477d5fb830e1ff50c629b7e8693e695478e5e60007d4482a206417115d0d`; `infp-historic-bbox` `19e16da71ffc0c19671d239fa745f83893ba715402f4776e94a8f56bc6ed6105` | 150 rânduri de stații rețeaua RO (8 coloane); 10 evenimente istorice cu 14 coloane, filtrele de coordonate și limita respectate; interogările recente 204 = certificat negativ pentru fluxul de evenimente curente |
| INP / LMI *(reținut)* | PDF-ul oficial București (legătura de pe pagina INP) | `lmi-buc-pdf` `fc258bcbb1bf1c71ceb1a48a61e485de0b3220f0506f1c9c0f3fca63bf46570e` | 3.181.446 bytes, 233 de pagini, extras cu `pdftotext`: 2.651 apariții de cod, 2.474 coduri LMI distincte (rezultat de extragere, nu număr oficial) — bază 2015 |
| **Surse blocate** (documentate ca degradări oneste — ARCHITECT §3) | ONRC/SEAP: CKAN direct + `catalog_datasets`/`dataset_table` prin MCP; admitere.edu.ro ×3; RNMCA OpenAPI + cerere anonimă | `ckan-onrc`/`ckan-seap`/`onrc-*`/`seap-page` `b2b8e93a7005` (502 mitmproxy, certificat upstream expirat); `admitere-*` `81074a9c8dfb` ×3; `air-openapi` `6bb42f2d0875fed5dfe55cba7edecd1343191fd65f0ea796a5f5141b26219c39`; `air-config-anon` 401 `d84163aee31b` | Nu certifică indisponibilitate globală — certifică blocajul din mediul de testare (proxy/TLS) pentru ONRC/SEAP/admitere și **control de acces confirmat** la RNMCA (401 anonim; spec OpenAPI 3.0.1 valid, 17 căi/17 operații, fără `securitySchemes` — adaptorul nu deduce acces anonim din spec) |

*Toate probele: `curl -L`, TLS verificat, UA `Aflivra-Integration-Evaluation/1.0`, timeout 10/25/55 s (anexa fișierului de testare). «Transfer complet» ≠ «date valide» (502/204 se primesc integral).*

---

## 7. Errata ARCHITECT.md (nu-l editez — nu e artefactul meu; pentru sesiunea de implementare)

Simple typos observate la citire, fără impact pe decizii: «seismicăpedia» (§1.2 titlu → „seismică a clădirilor din București"), «căți» → «căi» (§3 RNMCA), «affichat» → «afișat» și «tool-uluideclară» → «tool-ul declară» (§1.4), «suprafațăca» → «suprafațează» (§1.4), «declat» → «declarat» (§1.3, §7.1), «exploreă»/«se探索ă» → «se explorează» (§1.4), «anali za r» / «Verdict |categorie |» spații rupte în antete (§0), «n-are» → «nu are» (§1.2). Nimic ce schimbă vreo decizie.

---

## Stare

**COMPLETE — livrabilele Scribe pentru sesiunea următoare, aliniate la ARCHITECT.md:** 5 capitole docs/mcp.md cu clauzele de onestitate obligatorii („Tool-uri" 34→39) + schițele celor 2 reținute; 5 descrieri tool MCP complete (description + schema + build, în stilul tools.ts, cu propoziția de licență §8); tabelul proveniență/licențe; harta pe categorii aliniată (TEMPO→`local`, corectat din draftul meu `bani`); întrebările reziduale (a–d); tabelul de dovezi cu amprentele complete din anexa testării; errata arhitectului.
