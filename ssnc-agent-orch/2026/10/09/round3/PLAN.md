# PLAN — remedieri runda 3 audit MCP (analysis-first)

**Sesiune:** `2026/10/09/round3` · HEAD analizat: `b3b056d` (deploy live `b8c78c20`, https://aflivra.brebu.workers.dev) · **mod: read-only pe cod** — acest document e planul de remediere, nu implementarea.
**Sursa auditului:** `~/Downloads/Aflivra_Defecte_2026-10-09 (2)_4086.md` (runda 3, 15:50–16:04 EEST) + `mcp-audit-evidence.md` (Scribe, același dir).
**Probele mele:** live (browser/curl/node UA, 2026-10-09) + corpus local — detaliate per punct.

## Advocate Review
Status: Skipped (niciun `ADVOCATE-REVIEW.md` în sesiune; promptul cere direct analiza)
Key decisions incorporated: —
External dependencies: —

---

## R01 · P2 — categoria documentată `comert` e respinsă cu eroare generică

**(a) Rădăcina (3 puncte de cod):**
1. `lib/mcp/tools.ts:35` — descrierea `places_search.category` promite „e.g. sanatate, educatie, cultura, **administratie, comert**, transport, **sport**" — **trei exemple inexistente**; `firme` (54.428, a doua categorie ca mărime) nu e deloc exemplificată. Categoriile reale vin din `manifest.indices` (`scripts/finalize-places.py:103-126`, taxonomia în `scripts/import-places.py` `classify()`): `agricultura, bani, cultura, educatie, energie, filme, firme, justitie, local, mediu, munca, sanatate, stiri, transport` (+ `local-all` intern; `category=local` (default) se mapează la `local-all` în `app/api/places/route.ts:8-9`).
2. `app/api/places/route.ts:9` — validarea `!manifest.indices[category==='local'?'local-all':category]` → 400 cu mesajul generic **„Alege o localitate și filtre valide."** — același mesaj pentru orice parametru invalid; nu numește parametrul.
3. Mecanismul de enum **există deja** la granița MCP și nu e folosit pe `category`: `lib/mcp/server.ts:44` — `if(schema.enum&&…)!schema.enum.includes(value)` → **-32602 cu `Argument "category" must be one of: …`** — exact cerința auditorului, zero cod protocol nou.

**(b) Proba (live, 2026-10-09):** `places_search {q:"București",category:"comert",scope:"nearby",lat:44.420665,lon:26.149551,radius:1,pageSize:20,sort:"distance"}` → `isError:true`, „Alege o localitate și filtre valide." Identic pentru `administratie` și `sport`. Cu `category=firme` → 200, `total=214`. Manifest live: 15 chei categorii (cele 14 publice + `local-all`), fără `comert`/`administratie`/`sport`.

**(c) Fix (pseudocod):**
```ts
// lib/mcp/tools.ts — places_search.category
const PLACE_CATEGORIES=['agricultura','bani','cultura','educatie','energie','filme','firme',
 'justitie','local','mediu','munca','sanatate','stiri','transport'];
category:{type:'string',enum:PLACE_CATEGORIES,
  description:'Category filter — one of the national inventory categories: sanatate (hospitals, pharmacies), educatie (schools), cultura, firme (shops, businesses), transport, bani, energie, mediu, agricultura, justitie, filme, munca, stiri, local (public institutions, sport and leisure); default local'},
build:…['category',pick(PLACE_CATEGORIES,args.category)||'local']…
```
- Granița -32602 (server.ts:44) numește parametrul și lista validă — cerința auditului îndeplinită fără cod nou în protocol.
- Oglindă docs: `docs/mcp.md` la capitolul `### places_search` (:60-63) — lista exactă + „o categorie necunoscută e respinsă la granița protocolului (-32602)".
- **Aliasuri `comert`→`firme`: NU.** Taxonomia nu are `comert`; un alias e strat de traducere permanent care drift-ează la fiecare evoluție `classify()` și le dă clienților totaluri care contrazic filtrul documentat. Auditorul acceptă explicit doar documentarea exactă.

**(d) Testul de regresie:**
1. `scripts/verify-mcp.mjs` §7 (:99-111, lista de cazuri): caz nou `['categorie places documentată', {name:'places_search', arguments:{q:'București', category:'comert'}}]` → -32602 (bucla existentă asertă deja codul+mesajul); + o aserțiune dedicată că mesajul conține `category` și `firme`.
2. Pin nou în `verify-mcp.mjs` (lângă §15, docs↔schema): `enum` din schema `places_search.category` === cheile `categories` din `public/places/manifest.json` minus `local-all` — prinde drift-ul viitor al taxonomiei (finalize-places adaugă categorie → poarta pică până când enum+docs se actualizează).
3. `e2e/mcp.spec.ts` boundary (:131-158): `POST /api/mcp` `tools/call places_search {q:'București',category:'comert'}` → `error.code===-32602`.

---

## R02 · P2 — 7 experți judiciari diferitși au același `_id="0 0"`

**(a) Rădăcina:**
- `lib/live/justice.ts:78-81` — `justiceRecordId`: la `experti-judiciari` întoarce `String(record.Legitimatie).trim()` **doar dacă e nenulă/nevidă** (`:79`); valoarea-marcaj a sursei „0 0" e nenulă și netrunchiată → devine cheia `_id` pentru oricine o poartă. Aplicat în `app/api/experts/route.ts:19` (`_id:justiceRecordId(kind,record)`) și `app/api/notaries/route.ts:15`.
- Fallback-ul `:81` — `sha256(kind+JSON.stringify([NUME/Nume/'Nume și prenume', JUDET/Judet/Județul/CAMERA]))` se aplică doar la coloană vidă; doi omonimi în același județ ar coliziona pe fallback.
- `traducatori` (`:80`, `Nr Autorizatie`) are aceeași clasă de risc cu placeholder-ele.

**(b) Proba (live):** `forensic_experts {kind:"experti-judiciari",locality:"București",judet:"București"}` → `total=1319`, pagina 0 = 20 înregistrări, **14 `_id` distincte**, 7 persoane cu `_id="0 0"` (Clapon Virgil, Costea Vasile, Iancu Stefan, Milea Dan, Serban Dumitru, Tenea Alexandru Dan, Constantin Marian). Câmpuri disponibile pe înregistrare: `Legitimatie, Judet, Nume, Telefon, Adresa, Specializare` — Telefon/Adresa/Specializare sunt disambiguatori reali. Eșantion: `{"Legitimatie":"0 0","Judet":"Bucureşti","Nume":"Clapon Virgil","Telefon":"3242020  ; 0726137602","Adresa":"Bucuresti, Str. Dristorului …","Specializare":"Aeronave şi motoare de aviaţie","_id":"0 0"}`.
Comparație: notarii n-au `Legitimatie` (merg pe fallback NUME+CAMERA — fără risc de placeholder); avocații (`/api/lawyers`) nu folosesc `justiceRecordId` (D10 remediat, pagini fără ID-uri comune).

**(c) Fix (pseudocod):**
```ts
// lib/live/justice.ts — înlocuiește :78-81
const plausibleRegistryNumber=(value:unknown):string|null=>{
  const text=String(value??'').trim();
  if(!text)return null;
  if(!/[1-9]/.test(text))return null;   // „0 0", „0", „-": doar zerouri/spații → marcă, nu număr
  return text;
};
export const justiceRecordId=(kind,record)=>{
  const primary=kind==='experti-judiciari'?plausibleRegistryNumber(record.Legitimatie)
                :kind==='traducatori'?plausibleRegistryNumber(record['Nr Autorizatie']):null;
  if(primary)return primary;             // numărul real rămâne cheia
  return createHash('sha256').update(kind+JSON.stringify([
    record.NUME||record.Nume||record['Nume și prenume'],
    record.JUDET||record.Judet||record.Județul||record.CAMERA||record['Curte de Apel'],
    String(record.Telefon??'').trim(), String(record.Adresa??'').trim(),
    String(record.Specializare??'').trim(),
  ])).digest('hex').slice(0,12);
};
```
- Valoarea `Legitimatie:"0 0"` **rămâne vizibilă** pe înregistrare (auditorul: numărul și placeholder-ele se păstrează separat) — se schimbă doar derivarea cheii.
- De ce `/[1-9]/` și nu regex de format legitimție: formatul nu e invariant documentat; un regex strict ar arunca numere REALE în fallback la viitoare schimbări de export MJ — fallback-ul rămâne oricum unic, deci modul de a greși e benign (熟 doar cheile se schimbă en-masse; `_id` nu e persistat nicăieri — se derivează per răspuns).
- Notă: excluderea lui Specializare din hash ar lăsa omonimii exacti (nume+județ+telefon+adresă identice) să colizioneze — cazul e duplicat real de sursă, acceptabil (auditul îl tratează deja ca atare la registul tehnic).

**(d) Testul de regresie:**
1. `scripts/verify-source-errors.mjs` — mock-ul `:343` (`experti-judiciari` generează doar `Legitimatie` pline `20001…20012`): adaungă 2-3 rânduri placeholder — `['0 0','Timiș','POPESCU ANA-13',…]`, `['-','Timiș','POPESCU ANA-14',…]` + un caz omonim (același Nume+Judet, Telefon/Adresă diferite). Aserțiuni în blocul justiției: niciun `_id` „0 0"/„-"; numărul de `_id` distincte === numărul de persoane distincte; omonimii au `_id` distincte; `_id` determinist între două apeluri.
2. `e2e/mcp.spec.ts` semantic regressions (lângă :200-215, unde forensic_experts e deja apelat cu 3 ortografii): la `judet:'București'`, dacă `!isError`: `new Set(records.map(r=>r._id)).size===records.length`.

---

## N07 · P2 — localități „Urban" fără coordonate (sate componente + Poiana Brașov)

**(a) Rădăcina (lanțul complet):**
1. `app/api/localities/route.ts:9-13` — `coordinates()` lipește punctul doar la potrivire **unică** (nume pliat + județ) contra `geographicLocalities`.
2. `lib/geographic-scope.ts:4,17` — `geographicLocalities` = `public/data/geographic-localities.json`.
3. `scripts/build-geography.py:23-29` — acel fișier se construiește din `public/places/cities.json` (sursa OSM Geofabrik) **păstrând doar `type in ['city','town']`** (`:26`: `if city.get('type') not in ['city','town']:continue`) → **326 intrări** (102 city + 224 town, verificat).
4. Componentele localităților urbane (SIRUTA TIP 18 sat component, TIP 10 — Poiana Brașov) primesc `environment:'Urban'` din SIRUTA (MED==1 în `lib/live/directories.ts`), dar în OSM sunt `place=village` → filtrate la :26 → fără punct, deși contractul („urban localities carry lat/lon", `tools.ts:46`; „localitățile urbane poartă lat/lon", `docs/mcp.md:73`) le promite.
5. **Fapt-cheie (probă): cele 6 localități lipsă EXISTĂ în `public/places/cities.json` ca `village` CU lat/lon** (în același fișier, la doi pași de înregistrarea OSM): Poiana Brașov 45.59671/25.556189, Pârâul Rece 45.51182/25.509676, Timișu de Jos 45.594733/25.638108, Timișu de Sus 45.527604/25.578342, Fișer 46.079703/25.144749, Tohanu Nou 45.552428/25.384526. Corpus: cities.json = 13.971 itemi (13.081 village, 564 hamlet, 224 town, 102 city); dintre village/hamlet, 9.997 au `county` OSM, 3.648 goale (județ reibilabil din SIRUTA la `build-geography.py:27` prin `known`/`urban_known`).

**(b) Proba (live):** `localities_search {q:"Brașov"}` → 165 total; pagina 0 = 40; **10 cu lat/lon, 30 fără**: 6 Urban (lista auditului: POIANA BRAŞOV TIP 10, PÂRÂUL RECE/TIMIŞU DE JOS/TIMIŞU DE SUS/FIŞER/TOHANU NOU TIP 18) + 24 Rural (TIP 22/23). Fluxul Brașov→vreme funcționează (BRAŞOV 40205 = 45.65251/25.610565).

**(c) Două opțiuni, cu costuri:**

**Opțiunea A — redescriere onestă (doar docs, zero risc):** `tools.ts:46` + `docs/mcp.md:73` spun adevărul: „Coordonatele (centrul cartografiat) sunt garantate doar pentru municipii și orașele cartografiate (~326); satele — inclusiv satele componente ale unităților urbane, pe care SIRUTA le poartă ca «Urban» — rămân onest fără punct." Formulările exacte le-a pregătit scribe (`mcp-audit-evidence.md` §N07). **Cost:** 30 min, fără build. **Pierdere:** fluxul localitate→vreme rămâne indisponibil pentru satele componente; promisiunea se micșorează definitiv.

**Opțiunea B — extindere țintită a registrului (recomandată):** `build-geography.py` include la extinderea intrărilor village/hamlet **doar numele prezente în setul SIRUTA urban** (`urban_names`, construit la `:17`) — exact populația pe care contractul o promite, nu toate satele:
```python
# build-geography.py — înlocuiește :26
urban_from_siruta=set(urban_names.keys())        # SIRUTA, environment=='Urban'
for city in cities:
    t=city.get('type')
    keep=t in ('city','town') or (t in ('village','hamlet') and fold(city['name']) in urban_from_siruta)
    if not keep: continue
    county=city.get('county') or known.get(fold(city['name'])) or urban_known.get(fold(city['name'])) or ''
    if t in ('village','hamlet') and not county: continue   # fără județ nu se poate alipi onest
    urban.append({k:city[k] for k in ['name','lat','lon']}|{'county':county,'type':t})
```
`localities/route.ts:11-12` găsește apoi POIANA BRAȘOV — județ «Brașov» → potrivire unică → coordonate; fluxul vreme se deblochează. **Costuri:** (1) mărime — extinderea e marginită la componentele urbane (ordinul 10²–10³ intrări, nu 13.645), fișierul crește de la 326 la ~câteva sute–~2.000 intrări (~+100–180 KB raw, ~+40–60 KB gzip), importat STATIC în bundle prin `geographic-scope.ts:4` → de urmărit prin `verify-media-budget.mjs`/limitele Worker-ului la deploy; (2) fiabilitate — join-ul rămâne la potrivire unică: sat component cu nume omonim în același județ rămâne onest fără punct; fără județ reizolvabil → exclus; (3) re-pin-uirile porților care contează intrările (verificat în același PR).
**Recomandare: B + A împreună** — extinderea țintită PLUS formularea exactă („municipalități, orașe și componentele cartografiate ale unităților urbane; satele rurale SIRUTA rămân fără punct").

**(d) Testul de regresie:**
1. `e2e/mcp.spec.ts` (:248-255 există doar pozitivul BRAȘOV): adaugă — la `q:'Brașov'`: POIANA BRAŞOV și TIMIŞU DE JOS (după opțiunea B) au lat/lon finit; un sat rural (BOD, TIP 22) rămâne **fără** lat/lon (aserțiunea negativă „acoperire parțială, onestă").
2. `scripts/verify-geographic-scope.mjs` — pin: cele 6 localități audit-uite se rezolvă la intrare unică cu punct finit; rural-mente nu; contele de intrări re-pin-uit.
3. Regenerare: `python3 scripts/build-geography.py` (citește copia SIRUTA verificată — `seed-snapshots.json` cu SHA asertat `:11`), apoi `verify-snapshot-transport.mjs` + `verify-geographic-scope.mjs` în același PR.

---

## D21 · P2 — search_companies: 5 organizații Wikidata, cui=null, fără țară/motiv

**(a) Rădăcina:** `lib/live/adapters.ts`:
- `:140` — SPARQL-ul cere doar `?vat (P3608)`, `?website (P856)`, `?class (P31)` + label service **ro,en**. **Nu cere P17 (țara entității)** și nici descrieri.
- `:100`/`:116` — rândul servit: `{cui, vat, qid, name, websites, org, sourceUrl}` — `org` e booleanul claselor ORG_CLASSES (`:110`); EMAG Elektrizitäts-AG trece ca organizație fără niciun semnal de țară.
- `:126` — filtrul (cui || org, max 5 fără CUI) e singura „motivare" existentă, neexpusă în răspuns.

**(b) Proba (live):** `search_companies {name:"eMAG"}` → `count=5, limited=true`, toate `cui:null, vat:null, org:true`: eMAG Q23827008 (3 site-uri, incl. emag.ro), EMAG Q1275154, Emagic Q875408, Emagister Q17630500, EMAG Elektrizitäts-AG Q107088170. Chei exacte: `cui, vat, qid, name, websites, org, sourceUrl`.

**(c) Fix minimal (fără CUI inventat — P17 e disponibil gratis în SPARQL):**
```ts
// adapters.ts :140 — SPARQL
SELECT ?item ?itemLabel ?vat ?website ?class ?country ?countryLabel WHERE {
  VALUES ?item { … }
  OPTIONAL { ?item wdt:P3608 ?vat. }
  OPTIONAL { ?item wdt:P856 ?website. }
  OPTIONAL { ?item wdt:P31 ?class. }
  OPTIONAL { ?item wdt:P17 ?country. }        // țara entității
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ro,en". }   // ?countryLabel vine gratis
}
// :100 facts; :116 servire:
{…, country: clean(row.countryLabel?.value)||null,      // „România" | „Germania" | null — onest la P17 absent
   matchNote: record.cui
     ? 'identificator TVA (P3608) citit în registrul deschis'
     : 'potrivire de nume pe clasă de organizație (P31), fără identificator fiscal românesc citit în registru',
   …}
```
- Separarea internaționalilor: cu `country` în rând, clientul filtrează `country!=='România'` — fără câmp derivat suplimentar (matchScore subiectiv refuzat; **matchNote determinist** înlocuiește „scorul" cerut de auditor).
- Cost: +1 OPTIONAL per entitate (≤50 entități) pe un query deja batch — neglijabil.
- Contract: descriere `tools.ts:22` + `docs/mcp.md` capitolul `search_companies` (sub :49): „Fiecare rând poartă țara entității când registrul o publică și o notă de potrivire; potrivirile internaționale omonime rămân listate cu țara lor, fără CUI inventat."
- UI mirror: rândul din `components` care afișează „fără CUI citit în registrul deschis" arată și țara când `country && country!=='România'` — actualizează stub-ul de e2e.

**(d) Testul de regresie:** `e2e/company-name-search.spec.ts:56-61` — stub-ul `nameSearchState()` primește `country`+`matchNote` pe cele 3 rânduri ('România' cu CUI, 'România' fără CUI = eMAG, 'Germania' fără CUI) + un rând internațional nou; aserțiuni UI: țara se afișează, marker internațional vizibil, niciun CUI inventat (existent la :98-103). Envelope în `e2e/mcp.spec.ts`: la `search_companies {name:'Banca Transilvania'}` (network class), dacă `!isError`: fiecare item are `country===null||typeof string` și `matchNote` non-vid.

---

## D11/D26 · P2 — resursa Word Flat OPC servită ca 351.674 caractere XML brut

**(a) Rădăcina (lanțul):**
1. `lib/live/source-xml.ts:214-216` — detecția `officeStyles` (DrawingML/OfficeDocument/WordprocessingML) întoarce **null** la tabelul fără coloane de text — remedierea D11 din #47, corectă.
2. `lib/live/resources.ts:47-53` — XML-ul fără strat de tabel → `{kind:'text', text: <XML INTEGRAL>, format:'XML', textComplete:true}` — tot documentul brut, nu conținutul citibil.
3. `resources.ts:82` — doar `byteLength(text)>1_000_000` se indexează ca document pe bucăți (`indexDocument`); 351.674 chars rămân inline în cache.
4. `app/api/resource/route.ts` — `expandDocument(resourcePage(...))` servește textul ca atare; `resourcePage` (:91-93) întoarce starea nemodificată pentru `kind!=='table'`.
5. `app/api/resource-file/route.ts` — export doar `kind==='table'` (csv/xlsx, `:11`) sau PDF (`:24`) — nu există livrare fișier pentru documente text.
6. Mecanismul D01 resource_link (`app/api/mcp/route.ts:58-66` + `lib/mcp/server.ts:58-62`) se declanșează doar la Content-Type non-JSON — documentul JSON nu-l poate folosi direct.

**(b) Proba (live):** `dataset_table {id:"387e35f7-47d6-40a4-a9b3-d8ecbe6f8ca9"}` → `kind:'text', format:'XML', textComplete:true`, titlu „Plan anual achizitii publice 2026", **text = 351.674 caractere** (cele 376.981 ale auditului = lungimea JSON-escaped a `content[0].text` — același document), începe cu `<?xml…?><?mso-application progid="Word.Document"?><pkg:package …>`, conține `pkg:package` ✓, un singur `pkg:part pkg:name="/word/document.xml"` ✓, 1.143 potriviri `<w:t` (atenție: prefixul `<w:t` include și `<w:tab`/`<w:tc` — extractorul trebuie să potrivească `<w:t[\s>/]` exact).

**(c) Fix (pseudocod — extragerea servește, integralul se descarcă):**
```ts
// 1) lib/live/source-xml.ts — extractor lângă officeStyles
export function wordPackageText(raw:string):string|null{
  if(!/pkg:package|wordprocessingml/i.test(raw))return null;
  const part=raw.match(/<pkg:part\s+[^>]*pkg:name="\/word\/document\.xml"[^>]*>([\s\S]*?)<\/pkg:part>/)?.[1];
  if(!part)return null;                      // fără partea document → document integral onest
  const rows:string[]=[];
  for(const p of part.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g)){
    rows.push([...p[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>/g)]
      .map(m=>m[1]??'').map(fragmentText).join(''));     // fragmentText există (:60-67)
  }
  return rows.join('\n');
}
// 2) lib/live/resources.ts — în ramura XML (:47-53), înainte de întoarcerea integrală:
const extracted=table?null:wordPackageText(text);
if(extracted!==null)return{publishedAt:null,data:{kind:'text',text:extracted,
  format:'Word package (extras)',textComplete:false,          // extragerea, nu documentul integral
  sourceShape:'word-flat-opc',originalFormat:'XML',originalCharacters:text.length,
  note:'Text extras din /word/document.xml al pachetului Word (Flat OPC); stilurile nu se servesc; documentul integral se descarcă.'}};
// 3) app/api/resource/route.ts — în data, blocul fișier cu URL ABSOLUT (origin din request.url):
data.file={url:new URL('/api/resource-file?id='+id+'&format=xml&download=1',request.url).href,
           mimeType:'application/xml',fileName:d.title+'.xml'};
// 4) app/api/resource-file/route.ts — ramură nouă format=xml:
if(p.get('format')==='xml'){
  if(d?.kind!=='text'||d.sourceShape!=='word-flat-opc')return 409 onest („documentul nu are livrare de fișier");
  const text=d.documentChunks?(await expandDocument(state)).data.text:d.text;
  return new Response(text,{headers:{'Content-Type':'application/xml; charset=utf-8',
    'Content-Disposition':fileDisposition(id,d.title,'xml',true)}});
}
```
- Forma răspunsului MCP rămâne cea existentă pentru documente (JSON `kind:'text'`); `file.url` călătorește în `structuredContent.data.file` (nu înlocuiește `content[0].text` — extragerea citește în conversație; integralul e un click). Aserțiunea de paritate text↔structuredContent (`e2e/mcp.spec.ts:126`) nu e afectată.
- `textComplete:false` + `originalCharacters` țin D26 onest despre volum.
- Stilurile (a:theme) nu pot ajunge în extragere — ea citește **doar** partea document.

**(d) Testul de regresie:**
1. `scripts/verify-source-errors.mjs`, familia `resource/xml-table` (`:211`): scenariul existent `format-word-package` (`:1199-1203`, fixture `:393`) se **rescrie**: `data.kind='text'`, `data.sourceShape='word-flat-opc'`, `data.textComplete=false`, `data.text` conține „Plan anual de achizitii publice." dar **NU** conține `pkg:package`/`schemeClr`; `data.file.url` țintește `/api/resource-file…format=xml`. Scenariu nou `format-word-package-no-document-part` (pachet doar cu theme1.xml) → comportament vechi: document integral, `textComplete:true`, fără `file`. Fixture-ul actual trebuie îmbogățit cu ≥2 rânduri `w:t` reale.
2. `scripts/verify-export-formats.mjs` — pin ramura `format=xml`: 200+`application/xml` pe starea word-package; 409 pentru resurse tabulare.
3. e2e envelope (`e2e/mcp.spec.ts` ARGUMENTS `dataset_table`) — fără schimbare tare (network class); facultativ un assert moale pe id-ul `387e35f7…`: dacă `!isError`, `structuredContent.data.sourceShape==='word-flat-opc'` și `data.text.length < data.originalCharacters`.

---

## D12 · parțial — integritatea importului de trenuri, per operator

**(a) Rădăcina/starea:** `scripts/import-mers-tren.mjs`:
- `:104` — per operator se înregistrează `trains:parsed.trains.length` (= **numărul de blocuri `<Tren>`**, nu numere distincte — un număr poate apărea în mai multe blocuri de calendar).
- `:161-168` — manifest JSON: `operators[]` (id, status, trains, edition…), `counts:{stations,operators,trains}`.
- `:121-141` — boards-shard-urile se scriu din stațiile fuzionate; rândurile poartă `o` (operator) și `n` (număr tren).
- **Nicio poartă nu leagă corpusul publicat de manifest.** `scripts/verify-mers-tren.mjs` rulează DOAR pe fixture-uri sintetice (:32-98: 401 fără tăiere, N02, D14, circulare, marker de capăt) — nu citește `public/trains/`. `scripts/verify-snapshot-transport.mjs` verifică bytes/SHA pentru TOATE itemele din registru, inclusiv `/trains/*` (înregistrate la `import-mers-tren.mjs:178-182`), dar **zero semantică trenuri**: nu decodifică niciun board, nu compară nimic cu manifestul. Deci: un parser viitor care pierde rânduri trece neobservat de toate porțile.

**(b) Proba (corpus local):** manifest live la HEAD: 9 operatori `verified` — sntfc **1256**, regio 273, astra 21, interregional 216, transferoviar 303, softrans 16, ferotrafic 18, cfm 4, regiotrans 256; Σ=**2363** === `counts.trains` ✓; `counts.stations=1846`; 128 shard-uri boards în `public/trains/boards/`. În audit: Nord livrează 294 rânduri SNTFC cumulate (vs 432 în runda 2) — scăderea **e corectă prin construcție**: fix-urile N02 (`:52-57`, 67-68: gara de origine nu fabrică sosire) și D14 (`:67` tip 'T' nu fabrică plecare) au eliminat rândurile fabricate.

**(c) Fix + aserțiunea explicită cerută de audit:**
```js
// import-mers-tren.mjs :104 — înregistrează și distinctele (numerele pot repeta ca blocuri de calendar)
results.push({...operator,...,trains:parsed.trains.length,
  distinctTrains:new Set(parsed.trains).size, ...});   // :166 îl duce în manifest.operators
```
```js
// scripts/verify-trains-corpus.mjs — poartă nouă (stilul verify-*.mjs):
// 1. public/data/snapshot-transport.json → itemele /trains/boards/*.json.gz + /trains/manifest.json
// 2. decodează toate shard-urile (gunzip+JSON): payload.stations[]{code,departures/arrivals[] {t,n,o,…}}
// 3. per operator: set nou din [...departures,...arrivals] pe row.o → set[row.o].add(row.n)
// 4. pentru fiecare operator manifest status:'verified':
//      distinctInBoards === manifest.operators[].distinctTrains   (importul INTEGRAL per operator)
//      distinctInBoards <= manifest.operators[].trains            (blocuri ≥ numere distincte)
//      tot operator id din boards ∈ manifest.operators
// 5. counts.trains === Σ operators[].trains; counts.stations === stații unice reassemble
// wire: .github/workflows/pr-validation.yml, job „Verify battery" (+1 linie rulare)
```
**Ce număr e „corect" per operator:** mulțimea distinctă de numere din ediția XML publicată la sursă — `distinctTrains` (nou, = `trains` când ediția nu repetă numere). Numerele per STAȚIE (294 SNTFC la Nord) **nu sunt** un invariant de integritate — depind de geometria rețelei; invariantul e la nivelul corpusului: fiecare tren al fiecărui operator apare în cel puțin un board, și fiecare rând din boards se trage din ediția operatorului declarat.
Decizie de luat la implementare: dacă un bloc `<Tren>` fără nicio escală reală (doar markere) e numărat azi în `trains[]` dar nu poate apărea niciodată într-un board → sau (i) importerul îl exclude de la `trains`/`distinctTrains` (preferat — măsura devine exact „trenuri care servesc orar"), sau (ii) poarta asertă `distinctInBoards ≥ trains - zeroStopBlocks`. Se pin-uește hotărârea în `verify-mers-tren.mjs` cu un fixture marker-only.

**(d) Testul de regresie:** poarta în sine (deasupra) + fixture-ul marker-only în `verify-mers-tren.mjs`. Secvențiere: schimbarea de manifest cere **re-rularea importului** înainte ca poarta să treacă — în același PR (corpusul e comis).

---

## D23 · parțial — foi multiple: selectarea reală a foii ≠ 999

**(a) Rădăcina/starea:** selectarea foi e implementată: parsarea `lib/live/resources.ts:41-44` citește TOATE `book.SheetNames` și construiește `sheets[]` în ordine; selectarea citirii `resourceSheetRows(d,sheetIndex)` `:85-90` („Foaia solicitată nu există…"); exportul `app/api/resource-file/route.ts:10-14` (`sheet>=d.sheets.length` → „Foaie invalidă."). **Testat e doar refuzul** `sheet=999` (e2e `mcp.spec.ts:156-157`; audit probe `xlsx_invalid_sheet`). Nicio probă nu pin-uează că `sheet=1` servește/exprimă a DOUA foaie (coloane+rânduri, sortare, export).

**(b) Proba (live):** `catalog_datasets {q:"tranzactii"}` → 16 seturi; 6 resurse XLSX prober prin `dataset_table`: **toate au `sheets.length===1`** (d1704735…, 76e35af9…, 4d9fbdb9…, 05807294…, 6015fc60…, 29ab9cdf…). Nu există candidat live multi-foaie în această familie → regresia trebuie să fie cu **fixture**.

**FuncțiaCare deschide/selectează (răspunsul cerut): NU `lib/live/source-xml` (acela e XML tabelar) — unitatea e `lib/live/resources.ts`: `parseResource` (:41-44 construiește `sheets[]` din `book.SheetNames`), apoi `resourcePage`/`resourceSheetRows` (:85-93 aleg foaia la citire) și `app/api/resource-file/route.ts` (:10-21 la export).**

**(c) Testul propus (fixture generat cu xlsx-ul vendor, zero rețea):**
```js
// scripts/verify-source-errors.mjs — scenariu nou în familia resource: „format-xlsx-two-sheets"
// mock: bytes construiți cu xlsx (vendor/xlsx-0.20.3.tgz, importat în poartă prin require.resolve/transpile):
const wb=utils.book_new();
utils.book_append_sheet(wb,utils.aoa_to_sheet([['Nume furnizor','Cod fiscal'],['Furnizor A','111']]),'FoaiaUnu');
utils.book_append_sheet(wb,utils.aoa_to_sheet([['Localitate','Preț'],['București','100']]),'FoaiaDoi');
// meta format 'XLSX' → resourceLoader → parseResource:
//   assert sheets.length===2, sheets[0].name==='FoaiaUnu' cu rândurile foii 1, sheets[1].name==='FoaiaDoi'
// apoi /api/resource?id&sheet=1 → data.sheets[1] are COLOANELE+RÂNDURILE foii DOI (nu ale primei)
//     /api/resource?id&sheet=0 → cele ale primei
//     /api/resource-file?format=xlsx&sheet=1 → 200 + X-Aflivra-Rows === rândurile foii 2
```
Integrare: scenariul se adaugă în lista familiei (`:211`) cu mock-ul de bytes alături de fixture-urile existente — bateria rulează offline; PR-ul îl wire-uește automat (scriptul enumeră singur scenariile).

**(d) Unde intră:** celula de mai sus. Acceptanța de audit rămâne deschisă pe un dataset real multi-foaie când apare în catalog, but poarta deterministă e fixture-ul.

---

## D01/N01 · P2 — descărcare XLSX: 403/Cloudflare 1010 cu UA python

**(a) Rădăcina: NU e în cod.** Blocarea stă **în fața Worker-ului**, pe tot situl: Cloudflare Bot Fight Mode pe `*.workers.dev` respinge semnăturile de bot cunoscute înainte ca requestul să ajungă la cod. Probele P7: `Python-urllib/3.9` → **403, body exact „error code: 1010"**, `Server: cloudflare`, cu `cf-ray` — pe ambele `/api/resource-file?…format=xlsx&download=1` **și pe rădăcina sitului** `/`. `Chrome 126`, `curl/8.6.0` **și UA absent** → cu toții **200** cu **același fișier de 572.762 B** (header PK valid — „Microsoft Excel 2007+"), `x-aflivra-rows:4357`, `x-aflivra-sheets:1`. Codul Workerului e sănătos și identic pentru orice UA acceptat; blocarea e per-tenant, pre-Worker.

**(b) Proba:** matricea de mai sus (UA×2 rute). Notă pentru auditor: „403 descrie acest mediu de audit" — corect parțial: describe UA-ul semnăturii de bot, nu mediul; orice client cu UA de browser/curl/node/absent descărcăează fișierul.

**(c) Remedierea: documentație, nu cod** (confirmă decizia din prompt):
- Extinde nota UA din `docs/mcp.md:20-22` (acum doar la „Conectare") **și în capitolul `### dataset_export` (:192-)**: „Descărcarea prin client programatic: Cloudflare respinge UA-uri de bot cunoscute (Python-urllib → 403/1010, pe tot situl, înainte de Worker); folosește un UA de client real (curl, node, browser). URL-ul din `resource_link`/`data.file` e absolut, utilizabil direct." (Formularea scribe-ului, în `mcp-audit-evidence.md` §D01/1010.)
- Oglindă scurtă opțională în descrierea `dataset_export` din `lib/mcp/tools.ts:136`.
- **Decizie de securitate (nu cod):** o excepție WAF pentru `/api/resource-file` ar lăsa UA-urile de biblioteci să descarce — cu pălăria ISC2 pe cap: endpoint-ul e date publice neautentificate; BFM e protecția gratuită care stă deja în față; NU recomand exceptarea. Dacă friction-ul devine problemă de suport, excepția trebuie explicită, monitorizată și revizuită.

**(d) Testul de regresie:** nu se poate testa din cod un blocaj pre-Worker. Acoperirea existentă: `e2e/mcp.spec.ts:102-105` (LINK_CLASS — link-ul se descarcă 200 pe UA real de browser și bytes PK ZIP); `scripts/verify-mcp-live.mjs:3-4/:99` folosesc deja UA de client real (pin-ul rămâne). Criteriul de acceptanță al auditorului — „client extern permis → 200 → workbook valid" — e satisfăcut de orice client real-UA.

---

## Fișiere-cheie (index)

| Punct | Cod de schimbat | Porți/e2e de atins |
|---|---|---|
| R01 | `lib/mcp/tools.ts:35`, `docs/mcp.md:60-63` | `verify-mcp.mjs` §7+:99-111 & §15 pin, `e2e/mcp.spec.ts:131-158` |
| R02 | `lib/live/justice.ts:78-81` | `verify-source-errors.mjs:343`+blocul justiției, `e2e/mcp.spec.ts` semantic |
| N07 | `scripts/build-geography.py:26+27`, `tools.ts:46`, `docs/mcp.md:73`, `public/data/geographic-localities.json` (regenerat) | `verify-geographic-scope.mjs`, `e2e/mcp.spec.ts:248-255`, `verify-snapshot-transport.mjs` re-run |
| D21 | `lib/live/adapters.ts:140,:100,:116`, `tools.ts:22`, `docs/mcp.md:49`, UI rând + stub | `e2e/company-name-search.spec.ts:56+`, `e2e/mcp.spec.ts` envelope |
| D11/D26 | `lib/live/source-xml.ts` (+wordPackageText), `lib/live/resources.ts:47-53,:82`, `app/api/resource/route.ts`, `app/api/resource-file/route.ts` | `verify-source-errors.mjs:211/:393/:1199`, `verify-export-formats.mjs` |
| D12 | `scripts/import-mers-tren.mjs:104,:166` (+distinctTrains, re-import corpus) | POARTĂ NOUĂ `scripts/verify-trains-corpus.mjs` + `pr-validation.yml` |
| D23 | — (doar test) `lib/live/resources.ts:41-44,:85-93` e unitatea | `verify-source-errors.mjs` scenariu `format-xlsx-two-sheets` (familia resource) |
| D01/N01 | `docs/mcp.md:20-22,:192+` (opțional `tools.ts:136`) | existente (`e2e` LINK_CLASS, `verify-mcp-live.mjs` UA) |

## Riscuri globale

1. **R01 enum = schimbare de contract:** clienții care trimiteau categorii invalide primeau 400-generic (isError în tool), acum primesc **-32602 la graniță** — comportament mai corect, dar diferit; docs/mcp.md + enum + pin-ul de manifest trebuie să intre **în același PR** (poarta docs↔schema §15 pică altfel).
2. **R02 schimbă TOATE `_id`-urile derivate** (nu doar cele „0 0") — fallback-ul câștigă 3 câmpuri. `_id` nu e persistat (derivat per răspuns), deci fără migrări, dar consumatorii MCP care-l cache-uiesc trebuie anunțați în docs.
3. **N07 opțiunea B mărește bundle-ul Worker-ului** (static import) — verify-media-budget/limite la deploy; extinderea e țintită (doar componentele urbane SIRUTA), nu tot corpusul de 13.645 sate.
4. **D11 rescrie o celulă de poartă existentă** (`format-word-package`) — fix-ul și celula intră împreună altfel poarta pică fals; la fel pin-ul `verify-export-formats.mjs`.
5. **D12 cere re-import de corpus** înainte de poarta nouă (corpusul e comis) — secvențiere: importer → corpus → poartă, toate într-un PR.
6. **Phantom LSP:** la scrierea artifactelor a apărut un diagnostic stale `courtInstitution` lipsă — fals: există la `lib/live/legal.ts:51`. Zero acțiune.

## Agent Assignments

Fiecare task: писarea testului/porții ÎNTÂI (pică pe HEAD), apoi fix-ul, apoi `verify` verde.

### Builder
- [ ] R01: adaugă `enum` + descriere exactă pe `places_search.category` (tools.ts:35); pin enum↔manifest; docs capitol; NU aliasuri.
  - Test-first: `verify-mcp.mjs` §7 caz `comert` → **pică azi** cu 400-rută (isError) în loc de -32602.
  - Verify: `node scripts/verify-mcp.mjs` + `corepack pnpm test:e2e -- e2e/mcp.spec.ts`.
  - Files: `lib/mcp/tools.ts`, `docs/mcp.md`, `scripts/verify-mcp.mjs`, `e2e/mcp.spec.ts`.
- [ ] R02: `plausibleRegistryNumber` + fallback extins (justice.ts:78-81).
  - Test-first: rânduri „0 0" în mock `verify-source-errors.mjs:343` → `_id` duplicat azi.
  - Files: `lib/live/justice.ts`, `scripts/verify-source-errors.mjs`, `e2e/mcp.spec.ts`.
- [ ] N07 (după decizia A/B): opțiunea B — filtrul urban în `build-geography.py:26` + regenerare + re-pin; formulare docs indiferent de opțiune.
  - Files: `scripts/build-geography.py`, `public/data/geographic-localities.json` (generat), `lib/mcp/tools.ts:46`, `docs/mcp.md:73`, `scripts/verify-geographic-scope.mjs`, `e2e/mcp.spec.ts:248-255`.
- [ ] D21: P17+matchNote în SPARQL și rând (adapters.ts:140/:100/:116), docs, UI rând internațional.
  - Files: `lib/live/adapters.ts`, `lib/mcp/tools.ts:22`, `docs/mcp.md`, componente UI rând firmă, `e2e/company-name-search.spec.ts`.
- [ ] D11/D26: `wordPackageText` + ramura extract în `resources.ts` + `file` în resource route + `format=xml` în resource-file.
  - Test-first: celula `format-word-package` rescrisă + `format-word-package-no-document-part`.
  - Files: `lib/live/source-xml.ts`, `lib/live/resources.ts`, `app/api/resource/route.ts`, `app/api/resource-file/route.ts`, `scripts/verify-source-errors.mjs`, `scripts/verify-export-formats.mjs`.
- [ ] D12: `distinctTrains` în importer + re-import + poarta `verify-trains-corpus.mjs` + wire CI.
  - Files: `scripts/import-mers-tren.mjs`, `public/trains/**` (regenerat), `scripts/verify-trains-corpus.mjs` (nou), `.github/workflows/pr-validation.yml`.
- [ ] D23: scenariul `format-xlsx-two-sheets` (fixture 2 foi) în familia resource.
  - Files: `scripts/verify-source-errors.mjs`.
- [ ] D01/N01: nota UA în `docs/mcp.md` dataset_export (+oglindă tools.ts:136). Zero cod logic.

### Validator
- [ ] Rulează bateria întreagă local (`node scripts/verify-*.mjs` pe rând + `verify-mcp` + `verify-source-errors` + `verify-geographic-scope` + `verify-trains-corpus`) și `corepack pnpm test:e2e`.
- [ ] Probe live post-fix pe aceleași 8 argumente din audit (places comert → -32602; forensic_experts București → 20/20 `_id` distincte; localities Brașov → Poiana Brașov cu lat/lon; search_companies eMAG → country+matchNote; dataset_table 387e35f7 → text extras scurt + file.url; resource-file format=xml → 200 application/xml).
- [ ] Verifică plicul MCP: paritatea text↔structuredContent rămâne (e2e:126), LINK_CLASS neatins.

### Scribe
- [ ] Actualizează `docs/mcp.md`.capitole: places_search (listă categorii), localities_search (formulare coordonate), search_companies (țară+notă), dataset_table (extragerea Word + file), dataset_export (nota UA).
- [ ] Oglindă în `lib/mcp/tools.ts` descrieri + verifică `public/llms.txt`/`llms-full.txt` (deleghează — fără drift).

### Specialists Recommended
- orchestrate-api (R01/D21/D11 — schimbări de contract MCP: enum, câmpuri noi, formă de răspuns)
- orchestrate-performance (N07-B bundle size + D11 payload: 377k → extras)
- orchestrate-devops (D12: poartă nouă în bateria CI + re-import corpus)
- orchestrate-security (D01: decizia BFM/WAF exception — recomandare: NU, doar documentație)
- orchestrate-validator (toate: baterie + probe live de acceptanță audit)

## Ordine recomandată (faze)

1. **Faza 1 — contract & identitate (P2, independent):** R01, R02 (+D01 docs pure, zero cod).
2. **Faza 2 — livrare documente:** D11/D26 (atinge resurse+export) și D23 (test-only, se atinge `ila` familia de resurse în aceeași zonă).
3. **Faza 3 — corpus & gate-uri:** D12 (re-import) și N07 (decizie A/B → eventual regenerare).
4. **Faza 4:** D21 (SPARQL + UI + e2e stub-uri).
