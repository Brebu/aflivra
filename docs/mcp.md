# Aflivra MCP — connectorul de date publice românești

[Aflivra](https://aflivra.brebu.workers.dev/) expune toate suprafețele ei publice ca un
server **MCP** (Model Context Protocol) — pentru Claude, ChatGPT și orice client MCP.
Datele revin în română, cu proveniența la vedere; fiecare tool e o rută publică reală a
platformei, cu validarea și mesajele de eroare ale rutei — niciodată reinterpretate.

## Conectare

- **Endpoint**: `https://aflivra.brebu.workers.dev/api/mcp`
- **Transport**: Streamable HTTP — un singur endpoint `POST` (JSON-RPC 2.0), stateless,
  fără sesiuni; `GET`/`DELETE` răspund onest 405. Un `POST` = un singur mesaj JSON-RPC:
  la 2025-06-18 loturile (array) se resping cu 400 — nu se execută parțial și nu se
  pierde tăcerii nicio cerere validă.
- **Versiuni de protocol**: `2025-06-18` singură. Un header `Mcp-Protocol-Version`
  nesuportat se respinge cu 400 (mesajul numește versiunile suportate); headerul
  lipsă înseamnă `2025-06-18`; headerul de răspuns poartă mereu versiunea efectivă,
  niciodată ecoul șirului cerut.
- **Origin**: validată la transport — originea proprie a aplicației (browser) și
  clienții server-to-server fără `Origin` (conectorii MCP) trec; orice altă origine
  primește 403 fără headere CORS.
- **Autentificare**: niciuna — date publice, „fără cont", ca pe site. (Listarea publică în
  magazinele Claude/ChatGPT va cere OAuth — până atunci, conectorii custom funcționează.)

**Instalare în Claude**: Settings → Connectors → *Add custom connector* → adaugă URL-ul
de mai sus. **În ChatGPT**: Settings → Connectors → *Create* (developer mode) → același URL.

Client JSON-RPC brut (reține: Cloudflare respinge UA-uri de bot cunoscute înainte de
Worker — `Python-urllib` primește 1010; UA-urile clienților reali — Claude, ChatGPT,
node/curl — trec):

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"localities_search","arguments":{"q":"Câmpulung"}}}
```

## Plicul de răspuns

Aproape fiecare tool întoarce plicul sursă al platformei: `status` (`fresh` | `cached` |
`stale` | `unavailable`), `data`, `lastSuccessAt`/`lastAttemptAt`, `error` (română).
În MCP: răspunsul rutei vine în `structuredContent`, oglindit ca text în `content[0].text`.
O eroare a rutei (400 cu mesaj românesc) = `isError: true` cu mesajul întreg — niciodată
ascunsă. Excepție: exporturile binare reale (XLSX, PDF, XML de document) nu vin ca text —
deschid cu un `resource_link` cu MIME și numele fișierului, iar `structuredContent` poartă
`url`-ul absolut de descărcare, utilizabil direct de client; un răspuns eșuat de rută nu devine
niciodată descărcare — rămâne `isError: true` cu codul și mesajul păstrate; CSV-ul rămâne
text lizibil în conversație. O
căutare validă fără potriviri (total 0) NU e `unavailable` — starea descrie sursele. Paginarea e `page` (de la 0) aproape peste tot; `legal_acts` e singura paginare
pe cursor. Contextul geografic (`locality`/`county`, opțional `lat`/`lon`/`radius` 1–100)
ancorează unele rute; `geoScope` poate fi `context` | `local` | `national`.

Două limite oneste, valabile peste tot: **`fresh` înseamnă „preluarea a reușit acum", nu
„ediția e cea mai nouă publicată"** — un registru descărcat azi poate servi ediția 2025
aflată încă la sursă (ediția e etichetată în răspuns unde sursa o publică); iar la o sursă
care nu a reușit ultima tură, plicul `stale`/`unavailable` poate purta și `errorDiagnostic`
— diagnoza structurată, sanitizată, a eșecului (etapa, categoria, codul HTTP, încercările,
pauza), fără chei sau corpuri de cerere, ca degradarea să fie analizabilă, nu doar văzută.

## Ce NU expune conectorul (deliberat)

„Urmărește" și abonamentele push (stare per instalație), `refresh`/`seed`/`resource-import`
(administrativ), fișierele GTFS integrale (`transit-file` — mase de rânduri care nu încap
într-o conversație) și diagnosticul UI `/api/live`. Toată suprafața publică de date e mai jos.

## Tool-uri (41)

### `search_companies`
Firme după nume, din registrul deschis de cunoștințe (etichete RO+EN îmbinate): doar entitățile cu clasă de organizație/firmă sau cu identificator TVA citit se listează ca firme — speciile și localitățile omonime nu apar; fiecare rând poartă `country` (țara entității, `null` onest când registrul nu o declară — organizațiile internaționale omonime se văd prin ea) și `matchNote` — motivul determinist al listării (identificator TVA citit sau doar potrivire de nume pe clasă de organizație). Cele fără CUI rămân marcate onest „fără CUI citit”: registrul de cunoștințe nu atribuie identitate fiscală românească. Căutarea pe nume **nu e un registru complet al firmelor din România** — e descoperire prin etichete publice de cunoștințe; firmele omonime rămân separate, iar CUI-ul confirmat e exact cheia folosită de `company_profile` și de registrele asociate.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "search_companies", "arguments": {"name": "Banca Transilvania"}}}
```

### `company_profile`
Dosarul fiscal complet pe CUI (ANAF): identitate, starea TVA, bilanțuri anuale, registre publice, conducere, contacte — cu proveniență per câmp.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "company_profile", "arguments": {"cui": "427282"}}}
```

### `places_search`
Harta națională de locuri (inventarul OSM): spitale, farmacii, școli, muzee — după text, categorie, contact, centru+rază (1–100 km), sortare `name|recent|distance`. Categoriile sunt exact cheile inventarului — `agricultura, bani, cultura, educatie, energie, filme, firme, justitie, local, mediu, munca, sanatate, stiri, transport` (`local` acoperă instituțiile publice și sportul/timpul liber) — iar o categorie necunoscută se respinge la granița MCP cu lista celor valide. Rezultatele sunt obiecte OSM cartografiate, nu un recensământ certificat de instituții fizice: potrivirea e lexicală pe nume și etichete, lipsa adresei sau a orașului rămâne vizibilă, iar un hotel al cărui nume conține „restaurant" nu devine restaurant certificat.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "places_search", "arguments": {"q": "spital", "lat": 44.427, "lon": 26.103, "radius": 10}}}
```

### `directory_registry`
Registrele naționale ca tabele: `schools` | `health` | `pharmacies` | `hospitals` — căutare text pe `q`, filtre geografice pe `locality`/`county`/`geoScope`, paginat.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "directory_registry", "arguments": {"kind": "pharmacies", "q": "farmacia"}}}
```

### `localities_search`
Localitățile din SIRUTA: nume, județ, clasificare, mediu (urban/rural). Coordonatele cartografiate (lat/lon) au garantat municipiile, orașele și satele din mediul urban (componentele unităților urbane) — registrul cartografiat le potrivește strict pe perechea nume+județ, fără nicio potrivire pe nume global; satele rurale și potrivirile ambigue rămân onest fără punct. Rândul cu punct poartă și `pointKind`: `locality` — centrul cartografiat al localității — sau `municipality-center` — punctul municipiului, nu centrul unității proprii; sectoarele Bucureștiului primesc punctul municipiului București, declarat `municipality-center`. Folosește-o să rezolvi un nume înainte de vreme/evenimente/transport.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "localities_search", "arguments": {"q": "Câmpulung"}}}
```

### `weather_forecast`
Prognoza pe coordonate (open data): starea curentă plus fereastra orară `hours` (1–168, întregi, implicit 48) din copia completă — fereastra începe la ora curentă (`windowStart` în răspuns), nu la începutul zilei sursei. Metadatele ferestrei se declară onest: `hoursRequested`, `hoursReturned`, `windowComplete` (sursa pornește ziua la miezul nopții, deci 163 la o cerere de 168 e fereastră incompletă, nu eroare) și `horizonEnd` — orizontul real al copiei. O copie complet expirată nu se livrează niciodată ca prognoză: fereastra rămâne goală cu motivul `forecast-horizon-expired`. Contrazicerile interne ale sursei nu se repară: o zi cu totalul de precipitații sub componenta de ploaie (ambele confirmate în mm) primește `qualityFlags` cu numele contradicției și valorile originale rămân neschimbate.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "weather_forecast", "arguments": {"lat": 44.427, "lon": 26.103}}}
```

### `weather_alerts`
Avertizările ANM active; fără avertizări, fluxul XML gol se servește onest ca „fără avertizări".
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "weather_alerts", "arguments": {"geoScope": "national"}}}
```

### `events_search`
Spectacole și concerte în calendarele publice validate (teatre, operă): textul, sala și localitatea se aplică împreună, iar `q` trebuie nevid — un `q` gol se respinge la granița MCP cu mesajul exact `Argument "q" must be a non-empty string.`; o căutare fără potriviri rămâne succes onest cu total 0. `venue` primește id-ul, denumirea uzuală sau un **alias validat** al registrului („Teatrul de Artă București" rezolvă la „Teatrul de Artă"; lista completă de instituții și aliasuri o dă mesajul de 400 al rutei la un `venue` necunoscut); orele și prețurile se declară, nu se inventează: un spectacol publicat cu ziua, fără oră, poartă `timeKnown: false` (ora nu devine miezul nopții), iar `priceKnown` cere un preț publicat pozitiv — prețul zero nu se pretinde gratuit.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "events_search", "arguments": {"q": "teatru", "locality": "București"}}}
```

### `cinema_sites`
Locațiile operatorului de cinema: id, nume, oraș, adresă, coordonate — id-ul alimentează `cinema_program`.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "cinema_sites", "arguments": {}}}
```

### `cinema_program`
Programul de cinema pe o locație (id din `cinema_sites`) și o dată ISO `YYYY-MM-DD`; forma implicită e compactă (filme și proiecții, fără dublura corpului sursă) — `detail: "full"` readuce tot.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "cinema_program", "arguments": {"locality": "București", "county": "București", "id": "1806", "date": "2026-10-09"}}}
```

### `transport_network`
Rețeaua programată TPBI București–Ilfov (GTFS): `routes` sau `stops`, cu căutare, paginare și sortare după distanță.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "transport_network", "arguments": {"kind": "stops", "locality": "București", "county": "București"}}}
```

### `transport_positions`
Transportul live TPBI: `vehicles` (poziții cu linie; `route` primește numărul scurt, ex. `41`, sau id-ul), `arrivals` (panou pe stație, dă `stop`), `alerts`. Vechimea pozițiilor e a observației (`observationAgeSeconds`), separat de vechimea preluării (`fetchedAgeSeconds`).
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "transport_positions", "arguments": {"kind": "vehicles", "county": "București", "locality": "București"}}}
```

### `tranzy_live`
Operatorii Tranzy open-data, live: Iași (SCTP), Cluj (CTP), Chișinău, Botoșani, Oradea. București nu e pe Tranzi azi — live-ul lui e TPBI. Vechimea pozițiilor e a observației (`observationAgeSeconds`), separat de preluare (`fetchedAgeSeconds`).
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "tranzy_live", "arguments": {"locality": "Iași", "county": "Iași"}}}
```

### `flights_status`
Traficul aerian românesc (ADS-B comunitar): căutare pe indicativ, înregistrare sau squawk. Fiecare aeronavă apare o singură dată pe adresa Mode-S normalizată (majuscule/minuscule nu dublează avionul), păstrând observația **cea mai recentă** primită pe ea — nu prima venită; `observedAt`, `publishedAt` și maximul observației sunt un singur moment, iar `observationTimeRange` (`min`/`max`) arată intervalul real al observațiilor reunite. Vechimea se declară ca la toate fluxurile de poziții: `observationAgeSeconds` (față de momentul observat) separat de `fetchedAgeSeconds` (față de ultima preluare reușită); `isLive` înseamnă observații sub două minute. Fluxul se reîmprospătează printr-o tură de intermediar extern orară — dacă tura nu a alergat, copia servește ultima observație disponibilă, etichetată onest, nu revendicată ca „acum".
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "flights_status", "arguments": {"q": "W6"}}}
```

### `flight_board`
Panoul aeroporturilor București: `henri-coanda` (OTP) sau `baneasa-aurel-vlaicu` (BBU).
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "flight_board", "arguments": {"airport": "henri-coanda"}}}
```

### `trains_schedule`
Trenurile CFR Infra: indicele de stații sau panoul unei stații (id numeric); cu stație, `q` filtrează pe numărul/categoria trenului, iar `date`+`edition` (`current` implicit, `all` arhiva) țin panoul la edițiile valabile — `d` e capătul real al traseului, `nx` următoarea escală. Sosirile exclud trenurile care își încep ruta în gara panoului (momente tehnice, nu sosiri comerciale; circularele care se întorc în gară rămân). `expired` se calculează de la data cerută, indiferent de mod; `activeOperators` conține doar edițiile valabile la dată, `includedOperators` pe toate cele incluse în răspuns.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "trains_schedule", "arguments": {}}}
```

### `legal_acts`
Actele aflate la reverificare pe platformă (legislatie.just.ro), paginare pe cursor.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "legal_acts", "arguments": {}}}
```

### `court_dosar_search`
Dosare judecătorești (portal.just): număr dosar (ex. `6236/111/2017`), parte, obiect, instanță (id de registru sau denumirea uzuală — ambele se rezolvă), interval; `locality`/`county` ajung în cerere și ancorează instanțele zonei active.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "court_dosar_search", "arguments": {"number": "6236/111/2017"}}}
```

### `law_search`
Căutare în legislație: titlu, cuvinte din text, număr, an — paginat. `year` înseamnă anul din data intrării în vigoare (`DataVigoare`) purtat de act — nu anul emiterii sau al publicării, pe care serviciul nu le separă. Filtrul sursei nu e suficient singur: pagina intoarsă se filtrează local pe anul cerut (`filterVerification: "post-filtered"`), actele din alți ani se exclud numărate (`yearFilter.excludedMismatched`, `yearFilter.yearUnknownExcluded` — actele fără an deloc), iar `hasMore` rămâne la baza paginii **sursei** (`pageBasis: "source-page"`): pagina filtrată nu se pretinde niciodată total.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "law_search", "arguments": {"title": "codul civil"}}}
```

### `law_document`
Un act consolidat, verificat pe portal: titlul, data consolidării, bibliografia — nu textul integral (ajunge la 1,4 MB). Citirea înregistrează actul pe fluxul de reverificare, ca și cititorul web.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "law_document", "arguments": {"exactTitle": "CODUL CIVIL din 17 iulie 2009 (*republicat*)"}}}
```

### `federated_search`
Căutarea federată a platformei: anunțuri instituționale (`stiri` = toate feeds-urile îmbinate), agricultura (AFIR), filme, sau un feed instituțional (`munca`, `sanatate`, `educatie`, `justitie`, `energie`, `transport`).
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "federated_search", "arguments": {"q": "buget", "kind": "stiri"}}}
```

### `news_feed`
Anunțurile oficiale: `stiri` (toate feeds-urile), sau un feed instituțional; filtre pe publisher, `sort` (`recent|oldest|title`), interval de date; `publishedAt` e un singur moment UTC, identic în feed și în fișa `article_read` a aceluiași articol.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "news_feed", "arguments": {"kind": "stiri", "q": "buget"}}}
```

### `catalog_datasets`
Catalogul național de date deschise: seturi după titlu/organizație, cu resursele din spate. Clasificarea e canonică pe toate căile: `categories` cu etichete multiple (un set poate fi și `agricultura` și `cultura` dacă inventarul îl are acolo), identică între live, inventarul local și rezerva de cădere — fără aliasurile vechi care mutau agricultura în mediu; la cădere, fereastra deliberată de trei ani a rezervei se declară (`ageFilterApplied`, `totalBasis` cu `seedRows`/`afterAgeFilter`), iar totalul nu se pretinde altfel.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "catalog_datasets", "arguments": {"q": "buget"}}}
```

### `dataset_table`
Cititorul de tabele al platformei (CSV/XLSX/XML/JSON): foi, coloane, rânduri paginate (într-un workbook cu mai multe foi, `sheet` selectează fișă cu fișă) — onest despre documentele netabelare. Documentele Office Word (pachetul „Flat OPC”) nu se toarnă ca XML brut: răspunsul servește textul vizibil extras din `word/document.xml` (`textComplete: false` onest, `originalCharacters` cu dimensiunea integralului), iar integralul rămâne un fișier descărcabil prin `data.file` (legătură absolută, `format=xml`). Foaia indexată poartă un `qualityProfile`: identificatori stabili de coloană (`columnId`) cu eticheta originală, coloanele cu etichetă dublă primesc `displayLabel` dezenambiguat („zona (1)" / „zona (2)"), iar valorile lipsă (`missingCount`) se numără separat de valorile zero (`zeroCount`) — lipsa nu e zero; rândurile identice repetate se semnalează (`exactDuplicateRows`), nu se șterg: normalizarea pentru analiză rămâne separată de export, care păstrează întotdeauna fișierul original al sursei. Coloanele monetare ale surselor fără monedă publicată rămân `currency: null` — unitatea nu se deduce din ordinul de mărime.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dataset_table", "arguments": {"id": "1088e792-54f4-43ad-8e4c-9b351b82d31c", "sheet": 0, "page": 0}}}
```

### `dataset_export`
Export integral al unui tabel importat și verificat: `csv` (text, citibil în conversație) sau `xlsx` (binar — rezultatul e o legătură `resource_link` cu numele fișierului și numărul de rânduri; `sheet` selectează foia în ambele formate, fișă cu fișă într-un workbook cu mai multe foi); altfel ruta răspunde 409 onest, iar o foaie inexistentă primește același 400 la ambele formate — verificarea intervalului se face înainte de alegerea formatului, nu numai pe ramura binară. Descărcarea prin client programatic: Cloudflare respinge semnăturile de browser cunoscute ca bot (ex. Python-urllib primește HTTP 403/1010) — un client real (curl, node, browser) primește fișierul; legătura din `resource_link` e absolută, utilizabilă direct.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dataset_export", "arguments": {"id": "1088e792-54f4-43ad-8e4c-9b351b82d31c"}}}
```

### `article_read`
Textul integral al unei publicații oficiale, pe URL (izvoare instituționale: ANOFM, MAI, CNAS, MEC — pagina oficială edu.ro cu corpul `edu-article__body`, data sursei din elementul `time` al articolului și fără blocurile de articole înrudite/acțiuni —, MJ, energie, TPBI, AFIR, Poliția); atașamentele sunt listate, nu citite. Când structura unei publicații nu are încă cititor, eroarea onestă numește asta — textul fluxului rămâne disponibil, iar integralul nu se promovează niciodată din sumar.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "article_read", "arguments": {"url": "https://www.anofm.ro/"}}}
```

### `tourism_registry`
Registrele turistice clasificate SITUR (exporturi Excel oficiale): `cazare` (32.058 de înregistrări), `alimentatie` (9.063) și `agentii` (3.104 de licențe) — operator, număr de autorizație/certificat cu data emiterii, capacitate unde se publică, localitate/județ, CUI acolo unde registrul îl poartă (`cui: null` e lipsă onestă, numărată în `profile.cuiLipsa`). Registru de clasificare și licențiere — nu prețuri de camere, rezervări, grad de ocupare sau dovada funcționării în ziua cerută. `exportDate` (titlul exportului) și `pageDate` (pagina index) rămân date separate, fără uniformizare. Licență: neconfirmată.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "tourism_registry", "arguments": {"kind": "cazare", "county": "Brașov"}}}
```

### `seismic_buildings`
Registrul seismic AMCCRS al Bucureștiului („Lista Cladiri 2026"): adresa cu strada, numărul și sectorul, anul construirii, regimul de înălțime, numărul de apartamente, expertiza — cu ambele clase: textul original integral (48 de forme distincte la sursă) și clasa normalizată (`RsI|RsII|RsIII|RsIV|consolidata|urgenta|neincadrata|neclasificabila`; categoriile de urgență rămân distincte de clasele Rs). O adresă care nu apare în registru înseamnă „nu am găsit o înregistrare" — niciodată „clădire sigură"; registrul nu spune nimic cadastral sau juridic despre apartament. Acoperire: doar municipiul București. Licență: neconfirmată.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "seismic_buildings", "arguments": {"q": "Academiei 1", "sector": "3"}}}
```

### `seismic_events`
Istoricul seismic INFP/EIDA al României și împrejurimilor: cutremure resimțite de magnitudine ≥ 3 în dreptunghiul auditat 43–49°N / 20–30°E, pe ani comiși (rețeaua de stații RO se servește cu `kind: "stations"`). Istoric și infrastructură — nu avertizare de cutremur în timp real: răspunsurile 204 pe ferestrele recente au rămas inconcludente la audit, fereastra comisă se declară în fiecare răspuns, iar evenimentele din afara ei nu se pretind inexistente. Dreptunghiul nu definește exclusiv teritoriul României. Licențele rețelelor se păstrează separate; licență de reutilizare: neconfirmată.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "seismic_events", "arguments": {"from": "2024", "minMagnitude": 4}}}
```

### `historic_monuments`
Lista Monumentelor Istorice 2015 — secțiunea București, din PDF-ul oficial al Ministerului Culturii (Monitorul Oficial, Partea I, Nr. 113 bis/15.II.2016): cod LMI, denumire, localitate, adresă, datare și foliul tipărit al Monitorului (nu numărul de pagină al PDF-ului). Baza 2015 se declară: ordinele ministeriale ulterioare se obțin de la minister și nu sunt înglobate; semnalarea unei posibile apartenențe la patrimoniu nu e verdict juridic actual automat. Numerele extragerii se servesc ca numere, nu ca recensământ validat. Licență: neconfirmată.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "historic_monuments", "arguments": {"q": "B-II-a-A-00188"}}}
```

### `ins_series`
Seriile statistice oficiale INS TEMPO pe matricea validată `POP105A` (populația rezidentă la 1 ianuarie, pe județe și teritorii): ultimii trei ani publicați, cu unitatea („Numar persoane") și statutul fiecărei valori marcat tipografic de sursă după legenda oficială — îngroșat = revizuit, subliniat = provizoriu, ambele = semidefinitiv; „:" (date lipsă) și „c" (confidențiale) rămân goale marcate, niciodată zero. Id-urile de selecție se derivă din metadatele matricei la fiecare încărcare; alte matrici se resping onest până la validare separată. Localitățile nu fac parte din matricea validată. Intrarea CKAN a TEMPO e CC BY 4.0; întinderea ei asupra fluxului API direct rămâne de verificat.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "ins_series", "arguments": {"territory": "Cluj"}}}
```

### `energy_offers`
Comparatorul public POSF/ANRE de oferte de energie electrică pentru casnici: ofertele pe profilul de consum `consumptionMonthly` kWh/lună (implicit 200) în județul cerut — zona se rezolvă prin lista publicată de județe a POSF, nu hardcodat. Duplicatele integrale identice se deduplică onest (`duplicateIdenticalRows` servit); rândurile „prosumator" primesc flag, nu se elimină și nu se recomandă — prețul cel mai mic nu e o ofertă disponibilă oricui. Factura calculată de comparator (`valoare_factura_furnizor_fc`, cu `billBasisLei` ca bază de calcul declarată — ipoteză, nu factura utilizatorului), componentele de tarif și ferestrele de ofertare/licență rămân cum le publică sursa. Endpointul e clientul web public al comparatorului, nu un API cu contract de stabilitate verificat. Pagina ANRE care îl indică poartă o restricție de copiere fără acord scris; accesul anonim nu e dovadă de licență de reutilizare.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "energy_offers", "arguments": {"county": "București"}}}
```

### `power_system`
Observația live a sistemului energetic național (Transelectrica SEN): producție, consum și sold de schimb în MW, cu componentele de producție exact cum le publică sursa — reconcilierea completă a agregării nu e definită de contractul sursei și se declară în răspuns. `observedAt` parsează marcajul de timp al sursei (an cu două cifre) pe convenția declarată Europe/Bucharest, păstrând textul original alături; `observationAgeSeconds` măsoară observația, iar o vechime de 1–2 minute e normală la sursă, nu avarie. Soldul și puterea nu sunt tarife de energie sau cantități de facturat. Licență: neconfirmată.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "power_system", "arguments": {}}}
```

### `film_detail`
Fișa Wikidata completă a unui film românesc pe Q-id; descoperă id-urile cu `federated_search` kind `filme`.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "film_detail", "arguments": {"id": "Q1084"}}}
```

### `story_read`
O lucrare din domeniul public (Wikisource RO), pe id descoperit cu `stories_list`. Corpul servit e corpul literar: navigația Wikisource (antetul dinamic cu „proiecte surori", subsolul printat de licență) e scoasă structural înainte de text — autorul, titlul, licența și capitolele rămân câmpuri separate ale fișei, iar proza păstrează ordinea paragrafelor sursei.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "story_read", "arguments": {"id": "11889"}}}
```

### `stories_list`
Biblioteca de lucrări din domeniul public: id, titlu, categorie — poarta către `story_read`.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "stories_list", "arguments": {"page": 0}}}
```

### `lawyers_registry`
Tabloul național al avocaților (UNBR): căutare pe nume verificată (un panou fără termenul cerut nu se servește drept căutare), sortare `name|recent`; cu `locality`/`county`, baroul se aplică pe serverul sursei — totalul și paginarea descriu exact selecția.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "lawyers_registry", "arguments": {"q": "Popescu"}}}
```

### `forensic_experts`
Registrele justiției: `experti-judiciari` | `experti-tehnici` | `traducatori`, pe județ — orice ortografie normală a județului rezolvă la același set; cere `locality` pentru contextul geografic. Fiecare înregistrare are un `_id` stabil care identifică persoana: numărul legitimției/autorizației când sursa îl publică real, altfel o cheie derivată deterministă (nume, județ, contact, specializare) — marcajele sursei („0 0”) nu devin niciodată cheie, deci persoanele distincte nu partajează `_id`.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "forensic_experts", "arguments": {"kind": "experti-judiciari", "locality": "Oradea", "judet": "Bihor"}}}
```

### `notaries_registry`
Registrul notarilor publici (CECNJ), pe cameră — camera se cere prin numele uzual al județului, cu orice ortografie normală.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "notaries_registry", "arguments": {"q": "popa"}}}
```

### `anl_housing`
Registrul de locuințe ANL, pe județ. Fiecare amplasament are un `_id` stabil: hash-ul identității complet normalizate (județ + localitate + adresa întreagă, diacriticele pliate) — două adrese cu prefix comun dar localități diferite nu colizionează, variantele de diacritice ale aceluiași loc rămân un loc, iar anii de raportare nu intră în identitate (`_id`-ul nu se schimbă la actualizarea anuală; perioada servește separat).
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "anl_housing", "arguments": {"q": "bloc"}}}
```

### `ancpi_integrals`
Dinamica ipotecilor ANCPI pe luna cea mai recentă publicată în setul de date: totalul național, pe felul proprietății și pe județe, cu perioada etichetată (`monthLabel`). Indicator de piață — nu fișier de carte funciară și nu adrese individuale.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "ancpi_integrals", "arguments": {}}}
```

---

Întreținere: lista de mai sus e proză scrisă de mână, ținută de poarta
`scripts/verify-mcp.mjs` — fiecare tool documentat o singură dată, fiecare exemplu
validat contra schemei lui, fiecare tool din registru documentat. Auditul live al
tuturor tool-urilor: `node scripts/verify-mcp-live.mjs` (0 = totul verde, 1 = avarie,
2 = degradări oneste de sursă).
