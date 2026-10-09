# PLAN — regresiile + explicitările runda 4 audit MCP (analysis-first)

**Sesiune:** `2026/10/09/round4` · HEAD analizat: `3d3b116` (live https://aflivra.brebu.workers.dev) · **mod: read-only pe cod** — acest document e diagnosticul și planul de remediere, nu implementarea.
**Sursa auditului:** `~/Downloads/Aflivra_Defecte_2026-10-09 (3)_2198.md` (runda 4, 21:35–21:46 EEST) — liniile relevante: 11, 22, 57, 61–75 (restul istoric).
**Probele mele:** python3 direct pe `public/places/cities.json` (13.971 itemi), `public/data/geographic-localities.json` (2.139 itemi), `public/data/locality-counties.json` și `lib/live/seed-snapshots.json` (gzip+base64 → `['siruta']['data']['items']`, 13.755 itemi, SHA verificat) — fără rețea; valori concrete în fiecare punct.
**Context:** regresiile P1/P2 le-a introdus extinderea N07 din runda 3 (commit `c6b12546`, 326→2139 intrări la `scripts/build-geography.py:27-37`); P3 și P4 sunt explicitări cerute de audit, nu regresii.

## Advocate Review
Status: Skipped (niciun `ADVOCATE-REVIEW.md` în sesiune; promptul cere direct analiza celor 4 puncte)
Key decisions incorporated: —
External dependencies: —

---

## Punct 1 · SĂCELE (40447) și PREDEAL (40312) au pierdut lat/lon

**(a) Rădăcina + dovada sondei — două rânduri omonime în același județ real → garda `hits.length===1` întoarce null:**

1. `scripts/build-geography.py:33` — rezolvarea județului `county=city.get('county') or known.get(folded) or urban_known.get(folded) or ''` pulsează, pe nume-goală (nume ambiguu în SIRUTA), județul **unui omonim urban** altfel decât OSM:
   - `cities.json` idx 10392: `{"name":"Săcele","lat":44.487248,"lon":28.642937,"type":"village","county":""}` — satul Săcele din **Constanța**; idx 9593: `{"name":"Predeal","lat":45.188185,"lon":26.101347,"type":"village","county":""}` — satul Predeal din **Prahova** (corespund SIRUTA 62887 Rural Constanța / 134764 Rural Prahova).
   - `known['sacele']`/`known['predeal']` **nu există** (numele apare în SIRUTA în 3, respectiv 2 județe) → cade pe `urban_known`: `locality-counties.json` → `urbanItems['sacele'] = 'Braşov'` și `urbanItems['predeal'] = 'Braşov'` — **cu Ş-cedilla U+015F** (SIRUTA `.title()` la `build-geography.py:14`), în timp ce intrările OSM poartă `county:'Brașov'` cu **Ș-comma-below U+0219**.
2. `scripts/build-geography.py:34-36` — dedupe-ul `key=(folded,county)` compară stringul BRUT de județ: `('sacele','Brașov'-comma) ≠ ('sacele','Braşov'-cedilla)` → ambele rânduri supraviețuiesc. Dovadă în registrul generat (2.139 itemi):
   - idx 1547 `{"name":"Săcele","lat":45.616651,"lon":25.69103,"county":"Brașov"(U+0219),"type":"city"}` ← orașul real
   - idx 1548 `{"name":"Săcele","lat":44.487248,"lon":28.642937,"county":"Braşov"(U+015F),"type":"village"}` ← satul din Constanța, cu județ greșit
   - idx 1379/1380 identic pentru Predeal (town 45.502688/25.576158 vs village-Prahova cu 'Braşov'-cedilla).
3. `app/api/localities/route.ts:11-12` — joinul `geographicLocalities.filter(l=>countyName(l.county)===countyName(item.county)&&sameLocality(l.name,item.name))` **normalizează ambele forme de Ș** (`lib/live/query.ts:3` NFD+strip combining: U+015E→S+U+0327, U+0218→S+U+0326 → ambele → 'Brașov') → pentru SIRUTA 40447/40312 (`countyName('JUDEŢUL BRAŞOV')='Brașov'`) **hits.length===2** → garda `hits.length===1` → `null` → audit „None, None".
- Ipotezele din prompt, verdict: „duplicate cu county gol vs plin" — **confirmată, cu nuanță**: orașele NU au dispărut din registru (Săcele city idx 10391 cu punct, Predeal town idx 9592 cu punct — ambele sunt în `geographic-localities.json`); a devenit ambiguu joinul, iar pagina SIRUTA pierde punctul. Efect identic și la `lib/geographic-scope.ts:26` (rezolvarea locality→punct pentru vreme/evenimente): filtrul acolo e pe aceleași 2 rânduri → `known.length!==1` → fără punct.
- Bonus (blast radius): clasă de bug, nu caz izolat — orice sat OSM cu `county:''` al cărui nume e urban exact în alt județ moștenește acel județ cu Ş-cedilla.

**(b) Fix — pseudocod complet (înlocuirea buclei `build-geography.py:27-37`; unicul fișier .py modificat, zero cod TS pentru P1):**

```python
# după :18-19 (known/urban_known rămân neschimbate pentru locality-counties.json)
def county_key(county):
  value=unicodedata.normalize('NFD',str(county or '')).encode('ascii','ignore').decode().lower()
  value=re.sub(r'^(judetul|municipiul)\s+','',value)   # post ascii-fold: 'ţ'→'t', 'ş'→'s'
  return ' '.join(value.replace('-',' ').split())      # 'Brașov' și 'Braşov' → 'brasov'
urban_pairs={(fold(item['name']),county_key(item['county']))
             for item in source['data']['items'] if item.get('environment')=='Urban'}
rank={'city':0,'town':1,'village':2,'hamlet':3}
best={}
for position,city in enumerate(cities):
  folded=fold(city['name'])
  if city.get('type') not in ['city','town','village','hamlet']:continue
  core=city.get('type') in ['city','town']
  # județul vine din OSM; rezolvarea pe nume doar când numele e unic în SIRUTA —
  # satul cu județ necunoscut nu mai moștenește județul unui omonim urban
  county=city.get('county') or known.get(folded) or ''       # era: ... or urban_known.get(folded) or ''
  if not core and (folded,county_key(county)) not in urban_pairs:continue   # era: folded not in urban_names (global pe nume)
  key=(folded,county_key(county))                            # era: (folded, county-raw) — cedilla ≠ comma
  if key not in best or (core and not best[key][2]) or (rank[city['type']]<rank[best[key][1]['type']]):
    best[key]=(position,city,core,county)                    # la egalitate: intrarea urbană, apoi prima în fișier
urban=[{k:city[k] for k in ['name','lat','lon']}|{'county':county,'type':city['type']}
       for _,(position,city,core,county) in sorted(best.items(),key=lambda item:item[1][0])]
```

- Efect pe cele 4 probe: satul Săcele-Constanța (county ''→nerezolvabil) **iese**; satul Săcele-Călărași (OSM county 'Călărași', perechea urbană nu există în CL) **iese**; rămâne exact rândul orașului → 40447 ia punct 45.616651/25.69103. Predeal identic (40312 → 45.502688/25.576158). Cele 6 localități câștigate în runda 4 (Poiana Brașov, Pârâu Rece, Timișu de Jos/Sus, Fișer, Tohanu Nou) au perechea urbană în Brașov → **rămân**.
- `locality-counties.json` + `transit/coverage.json` ies byte-identice (logica lor nu se atinge); se schimbă doar `geographic-localities.json` (numărul scade cu homonimele scoase — se tipărește la rulare la `:43`).
- Dedupe pe `county_key` (fold), nu pe stringul brut — cedilla/comma nu mai pot dubla; prioritatea core-first elimină dependența de ordinea din fișier.

**(c) Testul de regresie țintit:**

1. **Invariant de clasă (celula principală, prinde toată clasa, pică azi la 'sacele|Brașov')** — `scripts/verify-geographic-scope.mjs`, lângă celula runda-3 de la :42-46:
```js
  // runda 4: cel mult un rând per (nume pliat, județ real) — joinul route.ts:11
  // depinde de el (hits.length===1)
  const byJoinKey=new Map();
  for(const row of geo.geographicLocalities){
    const county=geo.countyName(row.county);if(!county)continue;
    const key=geo.localityName(row.name)+' | '+county;
    assert.ok(!byJoinKey.has(key),"cheie de join duplicată: "+key+" — "+byJoinKey.get(key)+" vs "+row.name);
    byJoinKey.set(key,row.name);
  }
```
2. Celule punctuale, imediat dedesubt (păstrează celula Bod):
```js
  for(const [name,lat,lon] of [['Săcele',45.616651,25.69103],['Predeal',45.502688,25.576158]]){
    const hits=geo.geographicLocalities.filter(c=>geo.sameLocality(c.name,name)&&geo.countyName(c.county)==='Brașov');
    assert.equal(hits.length,1,name+': exact o potrivire pe nume pliat+județ');
    assert.deepEqual([hits[0].lat,hits[0].lon],[lat,lon],name+': punctul orașului rămâne');
  }
```
3. La nivel de API (SIRUTA fixture e deja pornit la :103): `GET /api/localities?q=Săcele` → `items.find(id==='40447')` are lat/lon finite; celelalte 2 (105507 Călărași, 62887 Constanța) nu au `lat`; `q=Predeal` → 40312 cu punct, 134764 fără.
4. e2e `e2e/mcp.spec.ts:262-274` (celula N07 existentă, `q:'Brașov'`"): adaugă aserțiunile `id==='40447'` și `id==='40312'` cu `Number.isFinite(lat)`.

**(d) Ce se republică:** `python3 scripts/build-geography.py` → commit `public/data/geographic-localities.json` regenerat (+ porțile extinse, în același PR, convențiile round-3/4). Fișierul intră în bundle prin import static (`lib/geographic-scope.ts:4`) → un singur `wrangler deploy` repune totul live; fără migrări D1, fără re-pin de SHA (poarta citește semantic, nu byte-hash). Bundle-ul Workerului **se micșorează** (rânduri scoase) — bun pentru `verify-media-budget`.

---

## Punct 2 · SOHODOL (40660, Rural, Brașov) a câștigat punct

**(a) Rădăcina + dovada — filtrul urban pe nume GLOBAL, cheia perechii e în alt județ:**

1. `scripts/build-geography.py:32` — `if not core and folded not in urban_names:continue`, unde `urban_names` (`:17`) e un dict pe **nume-goală** (`urban_names.setdefault(name,set()).add(county)` — carența de județ e în value, membership test-ul e pe name). SIRUTA are 7 SOHODOL:
   - urban **doar** `{"id":"82519","name":"SOHODOL","county":"JUDEŢUL GORJ","environment":"Urban"}` — județ **Gorj**;
   - `{"id":"40660","name":"SOHODOL","county":"JUDEŢUL BRAŞOV","environment":"Rural"}` — Brașov (sat în com. Moieciu), plus 5 rurale (Alba 2283+7455, Bacău 20457, Bihor 28120, Hunedoara 90100).
2. Drept urmare `'sohodol' ∈ urban_names` (din cauza lui Gorj!) → satul OSM `cities.json` idx 11395 `{"name":"Sohodol","lat":45.529707,"lon":25.400741,"type":"village","county":"Brașov"}` intră în registru (GEO idx 1736, county 'Brașov'-comma) — **nu satul urban din Gorj, ci omonimul rural din Brașov**.
3. `app/api/localities/route.ts:11-12` — pentru SIRUTA 40660 (countyName→'Brașov'): exact 1 hit → punct `45.529707, 25.400741` — valoarea exactă din auditul runda 4 (linia 71). Contrazice promisiunea „rural villages honestly carry none" (`lib/mcp/tools.ts:51` + `docs/mcp.md:73`).
- Ipoteza din prompt: **confirmată integral** — „satul rural omonim cu un sat urban din ALT județ".
- Blast radius ascuns (auditul a prins doar 40660): aceeași mecanică dă puncte și ruralelor Alba 2283+7455 (ambele pe singurul rând Alba rămas — dedupe-ul first-wins păstrase hamlet-ul idx 1733), Bacău 20457, Bihor 28120, Hunedoara 90100 — **6 fals-pozitive rurale** în total la HEAD. Fixul din Punct 1 le scoate pe toate (perechea urbană a fiecăruia nu există în județul lui).
- Nuanță: punctul însuși e corect geografic (satul real Sohodol-BV), dar regula era „rulal fără punct" — și, după regula perechii, unicul Sohodol care TREBUIE să aibă punct e 82519 (Gorj, urban), din rândul OSM Gorj idx 11396. — și, după regula perechii, unicul Sohodol care TREBUIE să aibă punct e 82519 (Gorj, urban), din rândul OSM Gorj idx 11396.

**(b) Fix:** inclus în diful din Punct 1 (linia `if not core and (folded,county_key(county)) not in urban_pairs:continue`) — filtrarea urbană devine pe perechea (nume-pliat, județ-normalizat), județul rezolvat din intrarea OSM sau din `known` (nume unic). Sohodol-BV: `('sohodol','brasov') ∉ urban_pairs` (doar `('sohodol','gorj')` există) → iese; Sohodol-Gorj rămâne → 82519 primește punct legitim. Zero cod TS.

**(c) Testul de regresie țintit:**
1. `scripts/verify-geographic-scope.mjs` — celula negativă de lângă Bod (:46):
```js
  // runda 4: SOHODOL 40660 e Rural în Brașov; omonimul urban e în Gorj (SIRUTA 82519)
  assert.ok(!geo.geographicLocalities.some(c=>c.name==='Sohodol'&&geo.countyName(c.county)==='Brașov'),
    'satul rural Sohodol (BV) rămâne onest fără punct; perechea urbană e în Gorj');
```
2. API-level (tot lângă :103): `GET /api/localities?q=Sohodol` → `id==='40660'` fără `lat`; `id==='82519'` CU lat/lon (probează că fixul nu supra-scot) — aserțiuni simetrice la cele din Punct 1(c).3.
3. e2e `e2e/mcp.spec.ts:272-273` — lângă celula BOD: `id==='40660'` → `lat` undefined.

**(d) Ce se republică:** același regen din Punct 1(d) — un singur artefact (`geographic-localities.json`), un singur deploy.

---

## Punct 3 · Cele 6 sectoare București primesc toate `44.436141, 26.102684`

**(a) Rădăcina + dovada — plierea sector→bucurești (by design) + un singur rând București + join unic:**

1. `lib/geographic-scope.ts:14` — `localityName` aplică `.replace(/^bucuresti(?:\s+sector(?:ul)?\s*\d)?$/,'bucuresti')`: `localityName('BUCUREŞTI SECTORUL 1') === 'bucuresti'` (identic cu `fold` din Python, `build-geography.py:8`). `lib/geographic-scope.ts:15` — `sameLocality('București','BUCUREŞTI SECTORUL N')` → ambii alias → `'bucuresti'` → **true**.
2. Registrul are exact UN rând care pliază la 'bucuresti': GEO idx 258 `{"name":"București","lat":44.436141,"lon":26.102684,"county":"București","type":"city"}` (OSM `cities.json` idx 1795, county '' → rezolvat prin `known['bucurești']='București'`, cazul special `:15` din build). **44.436141/26.102684 = valoarea exactă din audit, pe toate cele 6 sectoare.**
3. `app/api/localities/route.ts:11-12` — pentru fiecare din cele 6 intrări SIRUTA (`179141`..`179196`, `county:'MUNICIPIUL BUCUREŞTI'` → `countyName→'București'`): `hits length===1` (rândul unic București) → toate iau același punct — mecanism confirmat integral. Punctul NU e o „avarie vizuală" ci centrul cartografiat al municipiului; ce lipsește e **declarația explicită** cerută de audit (linia 75: tip punct, sursă, precizie, fallback declarat).

**(b) Fix minimal — `pointKind` pe rândurile cu punct (3 fișiere, fără schimbare de date):**

```ts
// lib/geographic-scope.ts — după :15
/** Un sector al municipiului București nu are punct propriu în registrul
 *  cartografiat: împrumută centrul municipiului — declarat, niciodată sugerat
 *  drept centrul sectorului. */
export const municipalitySector=(value:unknown)=>/^bucuresti sector(?:ul)? \d+$/.test(fold(value));

// app/api/localities/route.ts:3 (import) + :13 (alipire)
const enriched=matches.map((item:any)=>{const point=coordinates(item);
  return point?{...item,lat:point.lat,lon:point.lon,
    pointKind:municipalitySector(item.name)?'municipality-center':'locality'}:item});
```
- Rândurile FĂRĂ punct nu primesc `pointKind` (absent = onest). Sectoarele → `'municipality-center'`; municipiile/orașele/satele urbane cu potrivire proprie → `'locality'`. Regex-ul `municipalitySector` e simetric cu plierea existentă din `:14` (aceleași forme „sector"/„sectorul N").
- **tools.ts:51** (descriere EN, stil existent) — se adaugă la finalul descrierii `localities_search`:
  `Rows carrying a point declare its kind: "locality" (the mapped center of that very locality) or "municipality-center" (the six Bucharest sectors share the municipality's mapped center — city-level, not sector-precise).`
- **docs/mcp.md:73** (capitolul `localities_search`) — se adaugă propoziția RO:
  `Rândurile cu punct poartă pointKind: locality (centrul cartografiat al localității înseși) sau municipality-center — cele șase sectoare ale Bucureștiului împrumută centrul cartografiat al municipiului, potrivit pentru o prognoză a orașului, nu pentru căutări precise în interiorul sectorului.`
- De ce NU câmpuri separate `pointSource`/`pointPrecision`: sursa (OSM, centrul cartografiat) e deja spusă în docs:73 + tools:51, iar precizia e acoperită de propoziția adăugată; forma minimală cerută explicit de audit este tipul punctului + fallback-ul declarat — un singur câmp le poartă pe amândouă.

**(c) Testul de regresie țintit:** `scripts/verify-geographic-scope.mjs`, lângă bucla buc de la :103 (care solicită deja `/api/localities?locality=București&county=București` cu fixture SIRUTA):
```js
  {const page=await (await localities.GET(new Request('https://example.test/api/localities?'+new URLSearchParams({locality:'București',county:'București'})))).json();
   const sectors=page.data.items.filter(r=>/SECTORUL/.test(r.name));
   assert.equal(sectors.length,6,'cele 6 sectoare servite în contextul municipiului');
   for(const sector of sectors){
     assert.equal(sector.pointKind,'municipality-center',sector.name+': centrul municipiului, declarat ca atare');
     assert.equal(sector.lat,44.436141);assert.equal(sector.lon,26.102684);
   }}
```
Opțional e2e: `q:'București'` → fiecare rând SECTORUL are `pointKind==='municipality-center'`.

**(d) Ce se republică:** cod TS (`geographic-scope.ts`, `localities/route.ts`, `tools.ts`) + `docs/mcp.md` — în același PR/deploy cu Punctele 1-2; fără regen de date.

---

## Punct 4 · `q:""` la events_search → MCP -32602 „Missing required argument „q""

**(a) Rădăcina + dovada:**

1. `lib/mcp/server.ts:32-35` — bucla required: `if(value===undefined||value===null||typeof value==='string'&&value.trim()==='')return {…message:\`Missing required argument "${name}".\`}` — **șirul gol prezent e tratat ca lipsă**, cu mesaj care minte (argumentul a fost trimis). `:53-54` îl servește ca `-32602` — exact perechea din auditul linia 57. Atribuirea pe care auditorul n-o putea face e **confirmată**: textul provine verbatim din `server.ts:34` al Aflivra, nu dintr-un intermediar.
2. `q:''` nu ajunge niciodată la rută (validateArguments rulează înainte de `tool.build`) — deci nu afectează nici validările proprii ale rutelor: `app/api/events/route.ts:6-8` validează `q.length>200` etc. și tratează `q:''` pe HTTP direct ca „calendar implicit" — flow rămas neatins.
3. Blast radius: toate tool-urile cu argument string required (`search_companies.name`, `company_profile.cui`, `places_search.q`, `localities_search.q`, `events_search.q`, `cinema_program.locality/date`, `transport_positions.county`, `tranzy_live.locality`, `flights_status.q`, `federated_search.q`, `catalog_datasets.q`, `dataset_table.id`, `dataset_export.id`, `story_read.id`, `lawyers_registry.q`, `forensic_experts.locality`, `notaries_registry.q`, `anl_housing.q`, `film_detail.id`, `article_read.url`, `law_document.exactTitle`) trec prin ACELAȘI `validateArguments` → o singură corectură le acoperă pe toate, forma identică.

**(b) Fix (păstrează integral forma -32602 — singura schimbare e distingerea prezent-gol de absent):**

```ts
  for(const name of tool.inputSchema.required||[]){
    const value=input[name];
    if(value===undefined||value===null)return {ok:false,message:`Missing required argument "${name}".`};
    const schema=tool.inputSchema.properties[name] as {type?:string;enum?:string[]}|undefined;
    // Un șir gol la un argument required string nu e „lipsă": argumentul e prezent
    // și gol. Enum-urile rămân pe „must be one of" (:44, mai precis).
    if(schema&&!schema.enum&&schema.type==='string'&&typeof value==='string'&&value.trim()==='')
      return {ok:false,message:`Argument "${name}" must be a non-empty string.`};
  }
```
- Enum-urile required cu șir gol (`weather_alerts.geoScope`, `forensic_experts.kind` etc.) **nu trec** pe noul mesaj — cad pe `:44` cu „must be one of: …", mai informativ; de aceea garda `!schema.enum`.
- **tools.ts:70** (`events_search.q`, descriere EN): `'Free-text event query — required, non-empty: an empty string is rejected at the boundary'` (restul tool-urilor cu required-string rămân neschimbate la descriere — mesajul centralizat le acoperă; schimbarea de text se face doar pe cel auditat, KISS).
- **docs/mcp.md** capitolul `events_search` (linia 90-94): se adaugă propoziția RO: „`q` trebuie să fie nevid — un șir gol se respinge la granița protocolului cu `Argument "q" must be a non-empty string.` (-32602)." — **doar proză, fără bloc ```json```**: §15 din `verify-mcp.mjs` (:259-267) validează fiecare exemplu JSON din docs prin `validateArguments` — un exemplu cu `q:''` ar cădea poarta.

**(c) Testul de regresie țintit:** `scripts/verify-mcp.mjs` §7 (:103-118, matricea „Validarea la graniță"):
```js
    ['șir gol la required string',{name:'events_search',arguments:{q:''}}],   // în matricea existentă
```
 + aserțiuni dedicate imediat după buclă:
```js
  const emptyArg=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'events_search',arguments:{q:''}}});
  assert.equal(emptyArg.body.error?.code,-32602,'șirul gol păstrează forma -32602');
  assert.equal(emptyArg.body.error?.message,'Argument "q" must be a non-empty string.','prezent-gol nu se raportează drept lipsă');
  const whitespaceArg=await server.handleRpc(callRoute,{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'search_companies',arguments:{name:'   '}}});
  assert.equal(whitespaceArg.body.error?.message,'Argument "name" must be a non-empty string.','aceeași formă pe orice tool cu required string');
```
- Aserțiunea `['argument lipsă',{name:'company_profile',arguments:{}}]` existentă rămâne verde cu mesajul vechi — dovedeşte că NU s-a stricat shape-ul existent.

**(d) Ce se republică:** `lib/mcp/server.ts` + `lib/mcp/tools.ts` + `docs/mcp.md` — în același PR/deploy; fără regen de date, fără migrări.

---

## Rezumat pe fișiere

| Punct | Fișiere de remediat | Porți de executat |
|---|---|---|
| 1 (Săcele/Predeal) + 2 (Sohodol) | `scripts/build-geography.py` (dif complet la (b)); `public/data/geographic-localities.json` regenerat | `verify-geographic-scope.mjs` (invariant de clasă + celule punctuale + API-level), e2e `mcp.spec.ts:262-274` extins |
| 3 (sectoare) | `lib/geographic-scope.ts`, `app/api/localities/route.ts`, `lib/mcp/tools.ts:51`, `docs/mcp.md:73` | `verify-geographic-scope.mjs` (celula sectoare), `verify-mcp.mjs` §15 (docs↔schema rămân valide) |
| 4 (q gol) | `lib/mcp/server.ts:32-35`, `lib/mcp/tools.ts:70`, `docs/mcp.md` (events) | `verify-mcp.mjs` §7 extins + mesaj exact |

## Agent Assignments

### Builder
- [ ] build-geography.py: diful din P1(b) + `python3 scripts/build-geography.py` + commit regen (P1/P2)
- [ ] geographic-scope.ts + localities/route.ts: `municipalitySector` + `pointKind` (P3)
- [ ] server.ts: despărțirea mesajului prezent-gol vs absent, cu garda `!schema.enum` (P4)
- [ ] tools.ts: descrierea `localities_search` (+pointKind) și `events_search.q` (non-empty)
- Files: `scripts/build-geography.py`, `public/data/geographic-localities.json`, `lib/geographic-scope.ts`, `app/api/localities/route.ts`, `lib/mcp/server.ts`, `lib/mcp/tools.ts`

### Validator
- [ ] verify-geographic-scope.mjs: invariantul de clasă join-key + celulele Săcele/Predeal/Sohodol/82519 + celula sectoarelor (P1/P2/P3) — RED la HEAD, GREEN după remediere
- [ ] verify-mcp.mjs §7: rândul „șir gol" + aserțiunile de mesaj exact (P4)
- [ ] e2e/mcp.spec.ts:262-274 extins (40447/40312 finite, 40660 fără punct)
- Verify: `python3 scripts/build-geography.py` → `node scripts/verify-geographic-scope.mjs` → `node scripts/verify-mcp.mjs` → `corepack pnpm test:e2e` (restul bateriei în `pr-validation.yml` „Verify battery")

### Scribe
- [ ] docs/mcp.md: propoziția pointKind la `localities_search` (:73) + nota q-nevid la `events_search` (:90-94) — fără exemple JSON noi
- [ ] Verifică `public/llms.txt`/`llms-full.txt` — deleghează spre docs (fără drift, runda 3), doar dacă citeau formulări de-ale lor

### Specialists Recommended
- orchestrate-api — contractul `pointKind` la localities_search (descriere EN în tools + proză RO în docs, forma minimală declarată)
- orchestrate-performance — bundle-ul după regen (scade; confirmă `verify-media-budget` / bugetele la deploy)
- orchestrate-validator — celulele noi + rularea completă a bateriei înainte de PR

## Ordinea de publicare (un singur flux)
fix build-geography → regen → porți extinse (RED→GREEN) → fix TS (P3/P4) + docs → e2e → un PR → `wrangler deploy` (bundle-ul include JSON-ul static prin import, `lib/geographic-scope.ts:4`). Auditrul extern re-verifică: `localities_search q=Săcele/Predeal/Sohodol/București` + `events_search q:""` — toate patru trebuie acum consecvente cu docs/mcp.md și tools.ts.
