# Aflivra — plan de implementare a remedierilor și date verificate offline

**Verificat la 10 octombrie 2026.** Repository: [Brebu/aflivra](https://github.com/Brebu/aflivra). Versiune analizată: [`12a12999d1f0f5762357c6156992fb2747c8cca9`](https://github.com/Brebu/aflivra/commit/12a12999d1f0f5762357c6156992fb2747c8cca9), commitul `main` obținut prin fetch în această verificare. Toate legăturile către cod de mai jos sunt fixate la această versiune.

## 1. Concluzia verificării

Cele 11 probleme din retestarea anterioară au cauze identificabile în cod. Am identificat și un defect suplimentar în workflow-ul de actualizare a corpusurilor: directoarele folosite la `git add` nu corespund directoarelor în care importatoarele scriu fișierele. Reproducerea locală întoarce `fatal: pathspec 'public/data/situr' did not match any files`, cod de ieșire 128.

Verificarea datelor a fost făcută de mine la sursele oficiale. Pachetul `Aflivra_Fixuri_Probe_Offline_2026-10-10.zip` conține descărcările, comparațiile și un corpus EIDA candidat corectat. Dezvoltarea și verificarea remedierilor nu depind de accesul din mediul tău la site-urile instituțiilor.

**Starea lucrării:** analiză de cod, verificare de date, fixture-uri și migrare EIDA pregătite. Repository-ul, branch-ul utilizatorului și platforma publicată nu au fost modificate. Testele propuse pentru aplicația reparată sunt criterii de implementare, nu rezultate pretins executate pe un cod deja reparat.

### Dovezi noi, obținute în această verificare

| Sursă | Întinderea verificării | Rezultat |
|---|---|---|
| SITUR cazare | Toate cele 32.058 de rânduri × 18 coloane | Identice, inclusiv ordinea, cu datele din commit |
| SITUR alimentație | Toate cele 9.063 de rânduri × 13 coloane | Identice; **387** au județul `MUNICIPIUL BUCUREŞTI` |
| SITUR agenții | Toate cele 3.104 de rânduri × 13 coloane | Aceleași rânduri și duplicate; două rânduri și-au schimbat ordinea |
| EIDA evenimente | Toate cele **1.157** de evenimente returnate pentru feliile anuale 2015–2025 | Identificatorii și valorile numerice coincid; **toate cele 1.157 de rânduri au câmpurile descriptive deplasate** în corpusul actual |
| EIDA stații | Toate înregistrările returnate pentru rețeaua RO | **150** de înregistrări de stație/perioadă; corpusul are 151 deoarece include antetul |
| LMI București | PDF oficial complet, 233 de pagini; 12 rânduri inspectate vizual pe pagina PDF 28, foliul tipărit 525 | **10 din cele 12** diferă de corpus; cele 2.651 de rânduri ale corpusului nu sunt validate semantic integral prin acest eșantion |
| Transelectrica SEN | GET direct, JSON și câmpuri numerice | URL-ul configurat răspunde **404**; `https://www.transelectrica.ro/sen-filter` răspunde **200** |
| MCP, contraprobe actuale | Alimentație București, evenimente EIDA 2019, SEN | București întoarce încă total 0; EIDA păstrează câmpurile greșite; SEN este `unavailable` cu HTTP 404 |

SITUR a fost comparat pe **44.225 de rânduri**, cu toate coloanele originale și duplicatele păstrate. Schimbarea ordinii celor două rânduri de agenții nu reprezintă o diferență de conținut. La EIDA, limita este explicită: M≥3 în dreptunghiul 43–49°N / 20–30°E; răspunsul pe 2026 este HTTP 204, **inconcludent pentru absența cutremurelor**. Datele verificate sunt cele returnate de aceste interogări, nu întregul catalog seismic al României.

Retestarea anterioară rămâne baza pentru celelalte reproduceri: 206 apeluri, 41/41 tool-uri MCP și 40 de verificări de consistență. Aceste numere descriu acoperirea testării și nu demonstrează corectitudinea tuturor valorilor din platformă. În acest pas nu am repetat toate cele 206 de apeluri.

## 2. Harta defectelor în repository

P1 = afectează funcționalitatea, selecția ori sensul datelor; P2 = validare, contract sau interpretare care trebuie reparată înainte de a considera funcționalitatea verificată.

| ID | Prioritate | Problemă | Locul cauzei | Remediere principală |
|---|---|---|---|---|
| D01 | P1 | SEN indisponibil din cauza URL-ului | [`lib/live/sen.ts:17`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/live/sen.ts#L17) | URL rădăcină verificat și reluare cu versiune nouă a adaptorului |
| D02 | P1 | SITUR București întoarce zero fals | [`lib/live/situr.ts:78–85`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/live/situr.ts#L78) | Canonicalizarea județului de pe ambele părți ale comparației |
| D03 | P1 | Câmpurile EIDA sunt deplasate | [`scripts/import-eida-snapshot.mjs:33`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/scripts/import-eida-snapshot.mjs#L33) | Parser după antet, corpus v2 și dovadă SHA regenerate |
| D04 | P1 | Filtrul `county` singur este ignorat la avocați | [`app/api/lawyers/route.ts:10`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/app/api/lawyers/route.ts#L10), [`lib/geographic-scope.ts:26`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/geographic-scope.ts#L26) | Aplicarea județului în ruta avocaților independent de localitate |
| D05 | P2 | Antetul FDSN este numărat ca stație | [`scripts/import-eida-snapshot.mjs:20–23`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/scripts/import-eida-snapshot.mjs#L20) | Excluderea antetului/comentariilor și validarea coordonatelor |
| D06 | P2 | Ora SEN folosește permanent UTC+2 | [`lib/live/sen.ts:24–31`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/live/sen.ts#L24) | Conversie cu regulile Europe/Bucharest și tratamentul orelor ambigue |
| D07 | P2 | LMI amestecă adresa cu datarea | [`scripts/import-lmi-snapshot.mjs:45–80`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/scripts/import-lmi-snapshot.mjs#L45) | Extragere pe coordonate de coloană, probe vizuale, corpus regenerat |
| D08 | P2 | Data imposibilă `2026-02-30` este acceptată la cinema | [`app/api/cinema/route.ts:4`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/app/api/cinema/route.ts#L4) | Validator calendaristic strict înainte de apelarea sursei |
| D09 | P2 | Foaia inexistentă devine indisponibilitate cu HTTP 200 | [`lib/live/resources.ts:113`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/live/resources.ts#L113), [`app/api/resource/route.ts:12`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/app/api/resource/route.ts#L12) | HTTP 400 pentru argument invalid, distinct de eroarea de citire |
| D10 | P2 | Exemplul MCP `Odeon` nu trece resolverul | [`lib/mcp/tools.ts:70`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/mcp/tools.ts#L70), [`lib/live/events.ts:10`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/live/events.ts#L10) | ID-uri canonice în exemple și compararea normalizată a ID-ului |
| D11 | P2 | Zero în afara corpusului nu are indicator explicit de acoperire | [`lib/live/eida.ts:58–70`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/lib/live/eida.ts#L58), [`app/api/earthquakes/route.ts:6–16`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/app/api/earthquakes/route.ts#L6) | Interval validat și contract explicit pentru acoperire |
| N01 | P1, nou | Actualizarea corpusurilor nu poate face commit cu path-urile actuale | [`.github/workflows/corpora-refresh.yml:57,67`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/.github/workflows/corpora-refresh.yml#L57) | Directoarele reale, oprire fără diferențe și publicarea explicită a branch-ului |

## 3. Ordinea implementării

| PR | Conținut | Dependență | Criteriu de închidere |
|---|---|---|---|
| 1 | N01, import din fișiere locale, integrarea fixture-urilor în CI | Niciuna | Workflow-ul stagează fișierele reale; importul și verificările pot rula fără rețea |
| 2 | D01 + D06, SEN | Fixture SEN din pachet | Endpoint corect, ore corecte iarna/vara, copie veche tratată explicit |
| 3 | D02 + D04, filtre geografice | Fixture SITUR și sursă IFEP simulată | București găsește cele 387 de rânduri; `county` singur ajunge în `ddlCompany` |
| 4 | D03 + D05 + D11, EIDA | PR 1; utilitarul de dată strictă din PR 6 poate fi extras mai devreme | 1.157 de evenimente corecte, 150 de stații/perioade, acoperire declarată |
| 5 | D07, LMI | PR 1 și PDF-ul din pachet | Parser pe coloane și validare vizuală extinsă înainte de corpusul v2 |
| 6 | D08 + D09 + D10, validare API/MCP | Niciuna; helperul de dată trebuie disponibil înainte de PR 4 | Inputurile invalide întorc 400; exemplele trec ruta reală |

Numerele sunt ordinea de livrare propusă, nu o obligație de a implementa consecutiv tot codul. Helperul calendaristic comun se poate adăuga în PR 1 pentru a elimina dependența PR 4 → PR 6. Nu este necesară adăugarea unor tool-uri MCP noi pentru a închide aceste defecte.

## 4. Remedieri detaliate

### N01 — workflow-ul de actualizare a corpusurilor

**Cauză verificată:** `writeSnapshot()` din [`scripts/snapshot-register.mjs:18–20`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/scripts/snapshot-register.mjs#L18) scrie în `public` + path. Importatoarele folosesc `/situr/`, `/amccrs/`, `/eida/`, `/lmi/`; fișierele sunt în `public/situr`, `public/amccrs`, `public/eida`, `public/lmi`. Workflow-ul folosește `public/data/...`. Comentariile unor importatoare repetă aceleași path-uri greșite și trebuie corectate.

**Implementare:**

1. Folosește directoarele reale la staging, împreună cu `public/data/snapshot-transport.json`.
2. Stagează înainte de verificarea diferențelor, apoi folosește `git diff --cached --quiet`. Astfel sunt detectate și fișierele generate noi.
3. Dacă nu există diferențe, setează un output `changed=false`; pașii de commit, push și PR trebuie să aibă condiția `changed == 'true'`, inclusiv pentru `workflow_dispatch`.
4. Publică branch-ul explicit înainte de `gh pr create`. Gestionează rerularea fără duplicarea necontrolată a branch-ului/PR-ului.
5. Adaugă `--input-dir`/`--source-dir` pentru importatoarele SITUR, EIDA și LMI. Modul local citește fixture-urile; nu face fetch. Manifestul fixture-urilor trebuie validat înainte de import.
6. Menține separate validarea structurală a unui candidat și aprobarea diferențelor reale de date. Numerele pin-ate în testele de baseline nu trebuie schimbate automat pentru a obține verde în CI.

**Verificare:** repository temporar cu fișiere în directoarele reale → staging reușit; fără diferențe → fără commit/PR; fișier nou → detectat. Proba pathspec din pachet este executată local; nu este un rezultat inventat al unei rulări GitHub Actions.

**Îmbunătățire după repararea blocajului:** `fetchedAt` schimbă octeții chiar dacă datele sunt identice. Pentru „zi fără schimbări”, compară și un hash al conținutului semantic, cu duplicate păstrate, distinct de metadatele descărcării. Rândurile de agenții cu ordine variabilă nu trebuie confundate cu modificări de conținut.

### D01 + D06 — SEN: endpoint și fus orar

**Fișiere:** `lib/live/sen.ts`, `app/api/power/route.ts`; helper calendaristic în `lib/live/date.ts` dacă este comun; fixture-uri în verificatorul de integrare.

**D01:** înlocuiește URL-ul cu `https://www.transelectrica.ro/sen-filter`. Păstrează parsarea JSON din corp, independent de Content-Type. Validează că `PROD`, `CONS` și `SOLD` sunt valori numerice, pentru a evita un succes aparent cu toate câmpurile goale. Nu limita artificial componentele la valori pozitive: sursa poate publica valori negative.

**D06:** elimină `h-2` din `parseSourceTimestamp()`. Folosește regulile `Europe/Bucharest`, validate prin `Intl.DateTimeFormat(...).formatToParts()` și conversie cu verificare inversă. Un helper poate încerca offseturile UTC+2/UTC+3 și accepta numai candidatul care reproduce exact data și ora locală. Validează separat ziua, luna, ora, minutul și secunda înainte de conversie.

- Iarnă: `26/01/10 12:00:00` → `2026-01-10T10:00:00Z`.
- Vară: `26/10/10 19:07:52` → `2026-10-10T16:07:52Z`; codul actual produce `17:07:52Z`.
- Ora lipsă la trecerea de primăvară → timestamp invalid și motiv explicit.
- Ora repetată la trecerea de toamnă → ambiguitate declarată; nu alege arbitrar un UTC.

Păstrează `observedAtText` și mențiunea că fusul orar este o presupunere, deoarece JSON-ul sursei nu îl declară. Pentru un timestamp invalid sau ambiguu, `observedAt`/vechimea trebuie să rămână neconfirmate. `Math.max(0, age)` nu trebuie să mascheze o observație viitoare produsă de conversia greșită.

**Cache și migrare:** crește adaptorul la `energy.power-system.v2` pentru a ocoli backoff-ul vechi, legat de aceeași versiune. Doar creșterea versiunii nu repară payload-ul vechi: `view()` îl poate servi ca `stale`. Recalculează ora din valoarea brută când servești o copie v1 sau declară acea oră nevalidată până la refresh. Nu șterge întregul cache.

**Gata când:** fixture-ul JSON furnizează cele trei puteri numerice; exemplele iarnă/vară și tranzițiile DST trec; timestamp invalid nu produce vârstă zero „proaspătă”; un rând de cache v1 cu backoff poate fi actualizat de v2. La verificarea live, răspunsul sursei trebuie să fie disponibil sau degradarea să aibă o cauză actuală, nu URL-ul vechi 404.

### D02 — filtrarea județului SITUR

**Cauză:** `countyName(query.county)` canonicalizează cererea la `București`, dar `foldTrainText(record.judet)` lasă prefixul `municipiul`. Cele 387 de rânduri există în export și în corpus; defectul este în selecție.

**Implementare în `readSitur()`:** compară `countyName(record.judet)` cu județul canonicalizat al cererii. Păstrează județul original în câmpul afișat. Pentru un județ explicit nerecunoscut, întoarce 400, în loc să transformi neobservat cererea într-o selecție națională.

**Teste pe fixture-ul congelat:** `București`, `Bucuresti`, `MUNICIPIUL BUCUREŞTI` și `B` produc fiecare total 387 la alimentație. Verifică toate paginile și păstrarea rândurilor, apoi județe de control Brașov și Cluj. Pentru celelalte două registre, fixture-ul conține 2.491 de rânduri de cazare și 893 de agenții pentru București; sunt rânduri de registru, nu firme distincte.

**Date/cache:** nu este necesară regenerarea corpusului pentru această corecție. Nu elimina rândurile cu CUI ori adresă lipsă și nu deduplica automat agențiile. Aceste lipsuri și duplicate sunt în sursa oficială.

### D04 — filtrul de barou la avocați

**Cauză:** `readGeographicContext()` setează `active` doar pentru localitate sau coordonate, iar ruta aplică județul numai dacă `active` este adevărat. Cererea `q=Popescu&county=București` ajunge națională. În retestare a întors 542 de rezultate, față de 285 când contextul de localitate a activat selecția București. Aceste totaluri sunt probe datate, nu valori de pin-uit pentru totdeauna.

**Corecție recomandată:** local în `app/api/lawyers/route.ts`, calculează `barCounty` când `context.scope !== 'national'` și există un județ canonicalizat, independent de `context.active`. Respinge un județ explicit invalid. Păstrează sensul explicit al `geoScope=national`.

`lawyerLoader()` are deja suport pentru formularul IFEP `ddlCompany`, iar cheia cache include `barCounty`; nu este necesar un nou parser sau o invalidare globală. Dacă sursa nu suportă selecția și se folosește filtrarea paginii naționale, păstrează `sourceTotal`, nota și faptul că selecția locală completă este necunoscută.

**Teste:** apelează funcția reală `GET()` cu `county` singur, `locality` singur, ambele și `geoScope=national`; sursa IFEP simulată trebuie să înregistreze valoarea `ddlCompany`. Verifică `barScope`, totalul și paginarea, inclusiv fallback-ul. Extinde `scripts/verify-lawyers.mjs`; testele existente ale loaderului nu probează acest parametru în ruta reală.

**Limită de implementare:** nu schimba direct semantica globală a lui `active` pentru toate rutele. `registryMatchesLocation(..., 'schools')`, de exemplu, cere și localitate; o activare globală pentru județ singur poate produce alte selecții goale. O eventuală refactorizare comună trebuie să aibă teste pentru fiecare consumator.

### D03 + D05 — parser și corpus EIDA

**Antetul oficial validat:**

```text
#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType
```

**D03:** importatorul mapează coloanele 9/11/12/13 la `eventType`, `magnitudeType`, `magnitudeAuthor`, `eventLocationName`, în loc de `magnitudeType`, `magnitudeAuthor`, `eventLocationName`, `eventType`. Nu s-au pierdut valorile: s-au pus sub cheile greșite.

| Câmp corect | Din corpusul v1, înainte de reparare |
|---|---|
| `magnitudeType` | `old.eventType` |
| `magnitudeAuthor` | `old.magnitudeType` |
| `eventLocationName` | `old.magnitudeAuthor` |
| `eventType` | `old.eventLocationName` |

Am verificat această corespondență pe toate cele 1.157 de evenimente, față de cele 11 răspunsuri anuale cu HTTP 200. Identificatorii și toate câmpurile neschimbate coincid. Candidatul din pachet este reconstruit după antetul oficial, nu doar rotit fără contraprobă.

**D05:** `parseFdsnText()` nu elimină liniile `#`; antetul stațiilor are suficiente câmpuri și devine un obiect cu `network='#Network'` și coordonate text. După eliminarea lui, toate cele 150 de înregistrări coincid cu sursa. Nu deduplica înregistrările legitime pentru perioade diferite ale unei stații.

**Implementare:**

1. Extrage parserul într-un modul pur, fără fetch la import, de exemplu `scripts/lib/fdsn-text.mjs`.
2. Validează antetul și mapează după etichetele lui. Ignoră liniile goale și comentariile; o schimbare neașteptată de antet trebuie să oprească importul.
3. Validează numărul coloanelor, câmpurile numerice, coordonatele și datele. Raportează rândurile invalide; nu le elimina neobservat.
4. Păstrează felia anuală, filtrul M≥3, dreptunghiul și detectarea limitei 1.000. Raportează separat 204, trunchiere și rânduri returnate.
5. Corectează `EidaEvent` în `lib/live/eida.ts`, inclusiv `magnitudeAuthor`, și adaugă metadatele `coverageByYear`.
6. Publică schema `aflivra-eida-v2`, adaptorul `eida.seismic-history.v2`, asset-ul și intrarea SHA din `snapshot-transport.json` în același commit.
7. Verifică în test integritatea exactă a corpusului și dovada sa, plus semantica fiecărui rând din fixture.

**Candidatul pregătit:** `candidates/eida-seismic-v2.json(.gz)` are 1.157 de evenimente, 150 de stații/perioade și statusul inconcludent pentru 2026. `candidates/eida-proof-candidate.json` are câmpurile compatibile cu registrul de transport: `path`, `file`, `bytes`, `sha256`, `storedBytes`, `storedSha256`.

**Migrare offline:** `apply_eida_candidate.py` verifică baseline-ul, scrie doar asset-ul EIDA și dovada lui și refuză un input necunoscut. Migrarea nu ține loc de repararea importatorului: altfel următorul import va recrea câmpurile greșite.

**Gata când:** toate evenimentele din fixture au aceleași câmpuri ca sursa; nu apare `#Network`; numerele derivă din rândurile validate; SHA și dimensiunile corespund; filtrul `q=earthquake` găsește tipul real, iar câmpul locației nu mai conține artificial `earthquake`.

### D11 — acoperirea și validarea intervalului EIDA

Răspunsul actual include `window`, deci perioada nu este complet ascunsă. Problema este lipsa unui semnal explicit care să distingă „zero în datele verificate” de „cerere în afara datelor”. `from=2030&to=2030` întoarce zero, iar consumatorul trebuie să deducă singur limita din metadate. În plus, validarea actuală acceptă prefixuri calendaristice imposibile și nu respinge intervalul inversat.

**Contract recomandat, fără ruperea răspunsului existent:**

```json
{
  "coverage": {
    "status": "outside",
    "requested": {"from": "2030-01-01", "to": "2030-12-31"},
    "effective": null,
    "outsideCoverage": true,
    "note": "Intervalul cerut nu este acoperit de corpusul verificat."
  },
  "items": [],
  "total": 0
}
```

Adaugă `available` și metadatele feliilor validate/inconcludente în contractul complet. `full`, `partial`, `outside`, `inconclusive` descriu acoperirea cererii de către datele verificate, nu existența unui catalog seismic complet.

- 2019 → `full` pentru datele returnate de felia validată.
- 2014–2016 → `partial`, cu interval efectiv și partea neacoperită.
- 2030 → `outside`, fără afirmarea absenței evenimentelor reale.
- 2026 → `inconclusive`, deoarece răspunsul oficial verificat este 204.
- Interval mixt 2019–2026 → `partial`, cu 2026 identificat separat.
- `minMagnitude < 3` → nu pretinde acoperirea magnitudinilor sub pragul corpusului.

Validează prefixurile `YYYY`, `YYYY-MM`, `YYYY-MM-DD` calendaristic, normalizează limitele inclusiv pentru lună/an și respinge `from > to` cu HTTP 400. O cerere validă în afara corpusului poate rămâne HTTP 200 cu indicatorul explicit; un argument calendaristic invalid trebuie să producă `isError=true` la MCP. Modul `stations` are propriul profil și nu moștenește afirmații despre acoperirea evenimentelor.

### D07 — LMI: separarea geometrică a adresei și datării

**Cauză:** `panels()` separă fiecare cuvânt, nu celulele tabelului. Detectarea datării inspectează ultimul cuvânt, iar poziția de datare poate fi preluată de la rândul anterior. Expresiile `sf. sec. XIX`, `1702, 1915`, `1935 - 1939` ajung astfel în adrese sau sunt tăiate. Comentariul de început descrie benzi de coloană, dar implementarea nu extrage efectiv aceste benzi.

**Probe validate vizual:**

| Cod LMI | Adresă corectă în PDF | Datare corectă |
|---|---|---|
| B-II-m-B-17930 | Str. Academiei 3-5 sector 1, Bd. Elisabeta 15-19 | sf. sec. XIX |
| B-II-m-A-17931 | Str. Academiei 22 sector 1 | 1702, 1915 |
| B-II-m-B-21008 | Str. Academiei 39-41 sector 1 | 1935 - 1939 |

Toate sunt pe pagina PDF 28 / foliul tipărit 525. În corpus, prima adresă conține `sf. sec. XIX`, a doua `1702,`, iar a treia `1935 -`. Pachetul include PDF-ul complet, imaginea inspectată, coordonatele cuvintelor și 12 rânduri de referință corectate.

**Implementare în `scripts/import-lmi-snapshot.mjs`:**

1. Înlocuiește heuristica după ultimul cuvânt cu `pdftotext -bbox-layout`. Poți folosi un helper Python cu XML din biblioteca standard, invocat de orchestratorul Node.
2. Determină geometria tabelului pe fiecare pagină, folosind antetul, alinierea celulelor și, unde este necesar, liniile tabelului. Nu transforma coordonatele paginii 28 într-un offset universal.
3. Ancorează începutul rândului pe numărul curent/codul LMI; alocă liniile de continuare coloanei după coordonate.
4. Tratează explicit continuările între pagini, antetele repetate, notele de subsol și textul marginal rotit.
5. Păstrează separat `pdfPage` și `printedPage`. Foliul din publicație nu este indexul PDF-ului.
6. Extinde referințele vizuale la 20–30 de rânduri repartizate pe mai multe pagini: date multiple, secole, intervale, nume/adrese pe mai multe linii și rânduri la limită de pagină.
7. Generează un diff pe cod LMI; separă modificările de număr de rânduri de modificările de adresă/datare. O variație față de 2.651 nu trebuie „reparată” prin forțarea numărului.
8. Publică schema/cititorul v2 și `/lmi/monuments-bucuresti.json.gz` împreună cu dovada SHA regenerată. Păstrează baza 2015 și nota despre actualizările ulterioare neincluse.

**Gata când:** cele 12 referințe livrate și eșantionul extins coincid cu PDF-ul; nu se amestecă adresa cu datarea; referințele de pagină sunt verificabile; diff-ul integral este revizuit. Nu livrez în acest pachet un corpus LMI complet „corectat”: ar depăși validarea semantică efectuată.

### D08 — dată strictă pentru cinema

`Date.parse()` poate normaliza `2026-02-30` la o zi din martie. Regex-ul plus `Number.isFinite()` verifică forma, fără a garanta existența zilei cerute.

Adaugă `isValidCalendarDate()` în `lib/live/date.ts`: regex strict `YYYY-MM-DD`, parsare UTC, apoi verificare că `toISOString().slice(0, 10)` este exact inputul. Aplică validatorul înainte de `cinemaLoader()`; folosește același helper pentru datele complete EIDA.

**Teste:** 2026-02-30, 2026-04-31 și 2025-02-29 → HTTP 400, `isError=true`, zero apeluri upstream; 2024-02-29 și 2026-10-11 → acceptate calendaristic. Nu confunda acceptarea unei date valide cu garanția că sursa are program pentru acea zi.

### D09 — foaie de tabel inexistentă

`resourceSheetRows()` aruncă un `SourceError` pentru un index de foaie care nu există. `app/api/resource/route.ts` transformă orice excepție în HTTP 200 cu `status=unavailable`. În retestare, `dataset_table(sheet=999)` nu a fost eroare MCP, în timp ce exporturile CSV/XLSX pentru o foaie invalidă au fost respinse corect.

**Implementare:** după citirea metadatelor, validează indexul față de `state.data.sheets` înainte de citirea chunk-urilor. Pentru datastore, acceptă numai foaia 0. Dacă un helper trebuie să semnaleze un argument invalid, folosește un tip distinct de eroare de query pe care ruta îl transformă în 400. Lipsa unei copii/eroarea SHA rămâne o problemă a sursei sau integrității, nu devine argument invalid.

`lib/mcp/server.ts` setează deja `isError` din `response.ok`; corecția HTTP 400 rezolvă contractul MCP. Nu este necesară transformarea globală a tuturor stărilor `unavailable` în erori MCP și nici creșterea versiunii cache-ului de import al resursei.

**Teste:** foaie invalidă în tabel și datastore → 400; imediat după, aceeași resursă cu `sheet=0` rămâne utilizabilă; rândurile și cache-ul nu sunt alterate. Păstrează testele CSV/XLSX deja corecte. Retestarea nu a demonstrat otrăvirea cache-ului prin cererea invalidă.

### D10 — exemplele de calendar din contractul MCP

Resolverul normalizează numele și aliasurile, dar compară `venue.id` case-sensitive. În registru există `id='odeon'`, `short='Teatrul Odeon'`; exemplul `Odeon` nu coincide cu acestea. **`Opera Cluj` este deja un alias/nume scurt valid**; `OperaCluj` fără spațiu este o altă valoare și nu trebuie confundată cu exemplul.

**Implementare:** în exemplele MCP și documentație folosește ID-uri canonice precum `odeon`, `operacluj`, `teatruldearta`. În `eventVenue()`, compară și ID-ul prin `foldVenue(venue.id) === key`; astfel `Odeon` devine o variantă acceptată a ID-ului existent. Păstrează numele și aliasurile existente.

Nu restrânge schema la un enum cu doar trei ID-uri dacă vrei să păstrezi numele/aliasurile acceptate. Nu este necesar un nou tool de enumerare pentru această remediere.

**Teste:** fiecare exemplu din schema MCP și `docs/mcp.md` trece resolverul real și ruta `/api/events`; o valoare necunoscută întoarce 400. Extinde testul care acum trece `Odeon` unui route-caller simulat: verificarea că parametrul este transmis nu dovedește că ruta îl acceptă.

## 5. Date, versiuni și cache — schimbări necesare

| Componentă | Regenerare de date | Versiune/migrare | Ce trebuie păstrat |
|---|---|---|---|
| SEN | Refresh live după schimbarea URL-ului | `energy.power-system.v2`; ora copiilor v1 reinterpretată/invalidată explicit | Timestamp brut, presupunerea de fus, diagnoza reală |
| SITUR | Nu este necesară pentru filtrul de județ | Corecție în cititor; versiunea poate documenta schimbarea, fără a rescrie datele | Coloane originale, rânduri incomplete, duplicate |
| Avocați | Nu | Cheia include deja baroul; schimbare de routing | Totalul sursei și limitele fallback-ului |
| EIDA | Da, candidat verificat integral în pachet | Corpus și adaptor v2; asset + SHA în același commit | M≥3, bbox, perioade de stație, 2026 inconcludent |
| LMI | Da, după parser și validare extinsă | Corpus/cititor v2; asset + SHA în același commit | Baza 2015, codul, folio și pagina PDF |
| Resurse tabelare | Nu | Validare de query; fără invalidare generală | Copii complete, chunk-uri și dovezi SHA |
| Cinema/evenimente/MCP | Nu pentru aceste defecte | Validatoare și exemple compatibile | Numele și aliasurile acceptate anterior |

Cititorii EIDA/LMI au cache de proces pentru corpus. După publicarea perechii asset/manifest cu codul nou, verifică rezultatul pe instanța nouă; nu interpreta un răspuns din copia veche drept probă că migrarea a eșuat. În toate cazurile, invalidarea trebuie limitată la datele cu semantică schimbată.

## 6. Verificarea disponibilă offline și verificarea aplicației reparate

### Executat deja în această lucrare

- Fetch `main` și inspecția codului la SHA-ul indicat; în arborele verificat nu există un `AGENTS.md` urmărit de Git.
- Descărcări oficiale complete SITUR, EIDA și LMI; statusuri și SHA în `source-probes.json`.
- Comparație integrală SITUR cu toate coloanele; EIDA pe identificatori și fiecare câmp.
- Inspecție vizuală LMI: 12 rânduri, 10 diferențe; probă geometrică păstrată.
- GET SEN pe ambele URL-uri; interpretare de timp iarnă/vară.
- Contraprobe MCP actuale pentru București, EIDA și SEN.
- Reproducere pathspec și verificarea utilitarului de migrare: dry run fără scriere, migrare corectă, păstrarea altor dovezi, a doua rulare fără schimbări, refuzul inputului necunoscut.
- Verificarea pachetului offline și a integrității arhivei la livrare.

### De adăugat în CI pentru aplicația reparată

În [`.github/workflows/pr-validation.yml`](https://github.com/Brebu/aflivra/blob/12a12999d1f0f5762357c6156992fb2747c8cca9/.github/workflows/pr-validation.yml) există deja multe verificatoare, inclusiv `verify-surse-noi-corpus.mjs` și `verify-mcp.mjs`. Nu am identificat în bateria citită rularea explicită a `verify-lawyers.mjs` și `verify-geographic-scope.mjs`; adaugă-le, împreună cu testele de regresie ale rutelor.

Păstrează stilul proiectului: scripturi Node cu assertions, TypeScript transpiled și surse/Cloudflare simulate. Nu este obligatoriu un framework nou de testare. Un fișier propus este `scripts/verify-integration-regressions.mjs`, care importă implementările reale ale parserelor și rutelor, nu reimplementează condițiile în test.

| Grup de teste | Ce trebuie să dovedească |
|---|---|
| Parser FDSN | Antet respectat, fiecare câmp corect, comentarii excluse, rând invalid detectat |
| Cititori statici | Asset + manifest SHA corecte, paginare și filtre pe corpusul v2 |
| API → loader | County-only la avocați ajunge în formular; input invalid este respins înainte de sursă |
| API → MCP | HTTP 400 este `isError=true`; disponibilitatea sursei rămâne în envelope-ul documentat |
| Dates/DST | Zile inexistente, an bisect, vară/iarnă și tranziții de oră |
| Registry → examples | Exemplele venue rezolvă în registrul și ruta reale |
| Workflow | Path-uri reale, staging, zi fără schimbări, fișier nou, pereche asset/SHA |
| Live după deploy | Selecție și semantică, nu doar răspuns HTTP 200 |

Comenzi de validare **după implementare**, adaptate scripturilor existente și noului verificator:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm exec tsc --noEmit
node scripts/verify-cache.mjs
node scripts/verify-lawyers.mjs
node scripts/verify-geographic-scope.mjs
node scripts/verify-surse-noi-corpus.mjs
node scripts/verify-snapshot-transport.mjs
node scripts/verify-mcp.mjs
node scripts/verify-integration-regressions.mjs
corepack pnpm build
corepack pnpm exec playwright test e2e/events-venues.spec.ts e2e/resource-flow.spec.ts
```

`verify-integration-regressions.mjs` este un fișier propus, nu unul deja existent. Instalarea dependențelor poate avea nevoie de acces la registrul de pachete; verificatorul livrat în ZIP folosește numai Python standard și nu cere acest acces.

După publicarea remedierilor, rulează separat verificarea live și extinde cazurile county-only, date/sheet invalide, EIDA semantic și acoperire:

```bash
node scripts/verify-mcp-live.mjs https://aflivra.brebu.workers.dev
```

Nu declara repararea doar din faptul că schema are 41 de tool-uri sau că un răspuns are HTTP 200. Porțile existente de număr/SHA pot trece și când adresa, datarea ori tipul evenimentului sunt greșite.

## 7. Cum lucrezi dacă mediul de reparare nu are acces la surse

1. Dezarhivează pachetul și rulează `python3 verify_offline.py` din directorul lui. Nu necesită internet.
2. Folosește `validated/situr-*.json` și XLSX-urile originale pentru corecția D02; nu trebuie să reconstruiești date care sunt deja corecte.
3. Folosește textele anuale FDSN și `validated/eida-verification.json` pentru testarea parserului D03/D05.
4. Rulează `python3 apply_eida_candidate.py /cale/catre/aflivra` pentru verificarea migrării, fără scriere.
5. După fixarea parserului/cititorului, poți aplica în copia locală `--write`. Revizuiește diff-ul și include asset-ul și manifestul împreună cu codul corectat.
6. Pentru LMI, PDF-ul complet și referințele vizuale sunt în pachet. Implementează parserul pe coordonate și extinde validarea; cele 12 corecții nu sunt un substitut pentru repararea integrală a extracției.
7. Pentru SEN, fixture-ul JSON permite testarea parserului și timpului. Disponibilitatea reală după deploy trebuie verificată din mediul publicării sau printr-o verificare externă separată.
8. Pentru avocați și validarea argumentelor, folosește surse simulate și apeluri reale ale rutelor. Faptul că mediul local nu ajunge la IFEP nu împiedică verificarea transmiterii filtrului.

Migrarea EIDA este protejată prin amprenta corpusului verificat. Dacă repository-ul local are alt corpus, utilitarul se oprește; nu șterge guard-ul și nu aplica o rotație de câmpuri de două ori. Verifică mai întâi diferența dintre noul input și baseline.

## 8. Criteriul final de acceptare

Remedierea este completă când cele 12 elemente din tabel sunt închise cu probe la nivelul potrivit: valoare din sursa oficială, parser, rută, MCP, corpus și workflow. În particular:

- SEN folosește endpoint-ul verificat și nu are diferența de o oră în sezonul de vară.
- SITUR alimentație București returnează **387 pe fixture-ul livrat**, indiferent de variantele de județ acceptate.
- Toate cele **1.157** de evenimente din fixture au cheile și valorile corecte; stațiile/perioadele sunt **150**, fără antet.
- `county` singur la avocați activează selecția de barou, cu total și paginare corespunzătoare sursei.
- LMI separă adresa/datarea și păstrează referințe de pagină verificabile pe eșantionul extins.
- Ziua imposibilă și foaia inexistentă produc 400 înainte de operațiunile nepotrivite și `isError=true` în MCP.
- Exemplele venue sunt acceptate de implementarea reală.
- Cererile EIDA în afara datelor sau în felia 2026 sunt identificate explicit prin acoperire.
- Actualizarea corpusurilor stagează și publică asset-urile reale, împreună cu dovezile SHA.

Îmbătrânirea unor alte seturi de date, disponibilitatea variabilă a surselor și lipsa prețurilor tranzacțiilor imobiliare sunt limite operaționale/de acoperire distincte de aceste defecte. Nu se rezolvă prin schimbarea textului MCP sau prin declararea automată a tuturor datelor drept actuale.

## 9. Sursele și probele livrate

Surse primare descărcate direct:

- [SITUR cazare](https://se.situr.gov.ro/OpenData/ExportToExcel?type=listaCazari), [SITUR alimentație](https://se.situr.gov.ro/OpenData/ExportToExcel?type=listaAlimentatie), [SITUR agenții](https://se.situr.gov.ro/OpenData/ExportToExcel?type=listaAgentii).
- [INFP/EIDA stații RO](https://eida-sc3.infp.ro/fdsnws/station/1/query?net=RO&level=station&format=text) și [serviciul oficial de evenimente](https://eida-sc3.infp.ro/fdsnws/event/1/); URL-ul exact al fiecărei felii anuale este păstrat în `source-probes.json`.
- [Lista Monumentelor Istorice — INP](https://patrimoniu.ro/ro/profiles/lista-monumentelor-istorice); URL-ul exact al PDF-ului descărcat și SHA-ul său sunt în pachet. PDF-ul nou coincide byte-for-byte cu cel oficial descărcat în verificarea anterioară din aceeași zi.
- [Transelectrica SEN, JSON verificat](https://www.transelectrica.ro/sen-filter).

Probe importante în arhivă: `validated/situr-verification.json`, `validated/eida-verification.json`, `validated/lmi-verification.json`, `validated/sen-verification.json`, `validated/mcp-crosschecks.json`, `validated/prior-audit-reproductions.json`, `validated/corpora-pathspec-proof.json`, `validated/migration-checks.json`. `manifest.json` enumeră amprentele și dimensiunile fișierelor pachetului.
