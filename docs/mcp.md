# Aflivra MCP — connectorul de date publice românești

[Aflivra](https://aflivra.brebu.workers.dev/) expune toate suprafețele ei publice ca un
server **MCP** (Model Context Protocol) — pentru Claude, ChatGPT și orice client MCP.
Datele revin în română, cu proveniența la vedere; fiecare tool e o rută publică reală a
platformei, cu validarea și mesajele de eroare ale rutei — niciodată reinterpretate.

## Conectare

- **Endpoint**: `https://aflivra.brebu.workers.dev/api/mcp`
- **Transport**: Streamable HTTP — un singur endpoint `POST` (JSON-RPC 2.0), stateless,
  fără sesiuni; `GET`/`DELETE` răspund onest 405. CORS deschis pentru conectori.
- **Versiuni de protocol**: `2024-11-05`, `2025-03-26`, `2025-06-18` (negociate la `initialize`).
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
ascunsă. Excepție: exporturile binare (XLSX) nu vin ca text — deschid cu un `resource_link`
cu MIME și numele fișierului, iar `structuredContent` poartă `url`-ul absolut de descărcare, utilizabil direct de client; o
căutare validă fără potriviri (total 0) NU e `unavailable` — starea descrie sursele. Paginarea e `page` (de la 0) aproape peste tot; `legal_acts` e singura paginare
pe cursor. Contextul geografic (`locality`/`county`, opțional `lat`/`lon`/`radius` 1–100)
ancorează unele rute; `geoScope` poate fi `context` | `local` | `national`.

## Ce NU expune conectorul (deliberat)

„Urmărește" și abonamentele push (stare per instalație), `refresh`/`seed`/`resource-import`
(administrativ), fișierele GTFS integrale (`transit-file` — mase de rânduri care nu încap
într-o conversație) și diagnosticul UI `/api/live`. Toată suprafața publică de date e mai jos.

## Tool-uri (34)

### `search_companies`
Firme după nume, din registrul deschis de cunoștințe (etichete RO+EN îmbinate): doar entitățile cu clasă de organizație/firmă sau cu identificator TVA citit se listează ca firme — speciile și localitățile omonime nu apar; fiecare rând poartă `country` (țara entității, `null` onest când registrul nu o declară — organizațiile internaționale omonime se văd prin ea) și `matchNote` — motivul determinist al listării (identificator TVA citit sau doar potrivire de nume pe clasă de organizație). Cele fără CUI rămân marcate onest „fără CUI citit”: registrul de cunoștințe nu atribuie identitate fiscală românească.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "search_companies", "arguments": {"name": "Banca Transilvania"}}}
```

### `company_profile`
Dosarul fiscal complet pe CUI (ANAF): identitate, starea TVA, bilanțuri anuale, registre publice, conducere, contacte — cu proveniență per câmp.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "company_profile", "arguments": {"cui": "427282"}}}
```

### `places_search`
Harta națională de locuri (inventarul OSM): spitale, farmacii, școli, muzee — după text, categorie, contact, centru+rază (1–100 km), sortare `name|recent|distance`. Categoriile sunt exact cheile inventarului — `agricultura, bani, cultura, educatie, energie, filme, firme, justitie, local, mediu, munca, sanatate, stiri, transport` (`local` acoperă instituțiile publice și sportul/timpul liber) — iar o categorie necunoscută se respinge la granița MCP cu lista celor valide.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "places_search", "arguments": {"q": "spital", "lat": 44.427, "lon": 26.103, "radius": 10}}}
```

### `directory_registry`
Registrele naționale ca tabele: `schools` | `health` | `pharmacies` | `hospitals` — căutare text pe `q`, filtre geografice pe `locality`/`county`/`geoScope`, paginat.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "directory_registry", "arguments": {"kind": "pharmacies", "q": "farmacia"}}}
```

### `localities_search`
Localitățile din SIRUTA: nume, județ, clasificare, mediu (urban/rural). Coordonatele cartografiate (lat/lon, centrul localității) au garantat municipiile, orașele și satele pe care SIRUTA le poartă în mediul urban — componentele unităților urbane — acolo unde registrul cartografiat le potrivește unic pe nume+județ; satele rurale și potrivirile ambigue rămân onest fără punct geografic. Folosește-o să rezolvi un nume înainte de vreme/evenimente/transport.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "localities_search", "arguments": {"q": "Câmpulung"}}}
```

### `weather_forecast`
Prognoza pe coordonate (open data): starea curentă plus fereastra orară `hours` (1–168, implicit 48) din copia completă — fereastra începe la ora curentă (`windowStart` în răspuns), nu la începutul zilei sursei.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "weather_forecast", "arguments": {"lat": 44.427, "lon": 26.103}}}
```

### `weather_alerts`
Avertizările ANM active; fără avertizări, fluxul XML gol se servește onest ca „fără avertizări".
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "weather_alerts", "arguments": {"geoScope": "national"}}}
```

### `events_search`
Spectacole și concerte în calendarele publice validate (teatre, operă): textul, sala (`venue` — id-ul sau denumirea uzuală, ambele se rezolvă) și localitatea se aplică împreună; o căutare fără potriviri rămâne succes onest cu total 0.
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
Traficul aerian românesc (ADS-B comunitar): căutare pe indicativ.
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
Căutare în legislație: titlu, cuvinte din text, număr, an — paginat.
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
Catalogul național de date deschise: seturi după titlu/organizație, cu resursele din spate.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "catalog_datasets", "arguments": {"q": "buget"}}}
```

### `dataset_table`
Cititorul de tabele al platformei (CSV/XLSX/XML/JSON): foi, coloane, rânduri paginate (într-un workbook cu mai multe foi, `sheet` selectează fișă cu fișă) — onest despre documentele netabelare. Documentele Office Word (pachetul „Flat OPC”) nu se toarnă ca XML brut: răspunsul servește textul vizibil extras din `word/document.xml` (`textComplete: false` onest, `originalCharacters` cu dimensiunea integralului), iar integralul rămâne un fișier descărcabil prin `data.file` (legătură absolută, `format=xml`).
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dataset_table", "arguments": {"id": "1088e792-54f4-43ad-8e4c-9b351b82d31c", "sheet": 0, "page": 0}}}
```

### `dataset_export`
Export integral al unui tabel importat și verificat: `csv` (text, citibil în conversație) sau `xlsx` (binar — rezultatul e o legătură `resource_link` cu numele fișierului și numărul de rânduri; `sheet` selectează foia în ambele formate, fișă cu fișă într-un workbook cu mai multe foi); altfel ruta răspunde 409 onest. Descărcarea prin client programatic: Cloudflare respinge semnăturile de browser cunoscute ca bot (ex. Python-urllib primește HTTP 403/1010) — un client real (curl, node, browser) primește fișierul; legătura din `resource_link` e absolută, utilizabilă direct.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "dataset_export", "arguments": {"id": "1088e792-54f4-43ad-8e4c-9b351b82d31c"}}}
```

### `article_read`
Textul integral al unei publicații oficiale, pe URL (izvoare instituționale: ANOFM, MAI, CNAS, MEC, MJ, energie, TPBI, AFIR, Poliția); atașamentele sunt listate, nu citite.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "article_read", "arguments": {"url": "https://www.anofm.ro/"}}}
```

### `film_detail`
Fișa Wikidata completă a unui film românesc pe Q-id; descoperă id-urile cu `federated_search` kind `filme`.
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "film_detail", "arguments": {"id": "Q1084"}}}
```

### `story_read`
O lucrare din domeniul public (Wikisource RO), pe id descoperit cu `stories_list`.
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
Registrul de locuințe ANL, pe județ.
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
