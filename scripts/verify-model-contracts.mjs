import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {readSnapshotFile} from './snapshot-read.mjs';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-model-contracts-'));
const sha256=b=>createHash('sha256').update(b).digest('hex');
const validUrl=u=>{try{const x=new URL(String(u));return ['http:','https:'].includes(x.protocol)&&!x.username&&!x.password}catch{return false}};
const buckets=new Map(),known={};
const bucket=(check,detail,sample)=>{let b=buckets.get(check);if(!b){b={detail,samples:[],count:0};buckets.set(check,b)}if(b.samples.length<3)b.samples.push(String(sample).slice(0,160));b.count++};
const note=(label,count)=>{known[label]=(known[label]||0)+(count||0)};
let internalError=null;
const started=process.hrtime.bigint();
try{
  async function compile(name,path,transform=s=>s){const source=transform(await readFile(join(root,path),'utf8')),js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p}.mjs'`);await writeFile(join(temp,name+'.mjs'),js);return import(pathToFileURL(join(temp,name+'.mjs')))}
  const query=await compile('query','lib/live/query.ts');
  const wideNorm=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const marksHandled=!/\p{M}/u.test(query.normalizeSearch('a\u3099\u05b8'));
  const leg1={records:0,proofs:0,shards:0,spatialParts:0,spatialItems:0,indexItems:0,cities:0,divergedObjects:new Set(),attractions:0,famousKept:new Set(),attractionJunk:0};

  // Attractions validity gate — mirrors valid_public_attraction_name in scripts/import-places.py
  // (applied identically by scripts/recover-places-attractions.py). Both implementations
  // reject the same audited junk classes; changing one without the other breaks this leg.
  const ATTRACTION_LABEL='Locuri de vizitat';
  const ENGLISH_ATTRACTION_WORDS=new Set(['enclosure','cliff','peninsula','viewpoint','waterfall','windmill','windmills','barn','wagons','with','floating','mill','fresh','meat','red','pole','gravity','hill','former','mine','nude','beach','ski','slope','the','of','and','a','sign','ruins','fort','island','bridge','tower','cave','spring','lake','river','forest','park','garden']);
  const EXPLICIT_REJECTED_ATTRACTIONS=new Set(['partie schi - ski slope','former mine-Valea Blaznei','NICOSMAIL','Ot11378 campu mare','Traseu Manastirea Magarul, la dreapta dupa canton']);
  const STRUCTURAL_ECHO_TAGS=['man_made','historic','natural','landuse','leisure','tourism','amenity','waterway','building','barrier'];
  const validAttractionName=(name,tags)=>{
    const fold=s=>wideNorm(s);
    if(fold(name)===fold(ATTRACTION_LABEL))return false;
    if(/^[0-9]+(st|nd|rd|th)\b/i.test(String(name).trim()))return false;
    if(/fixme/i.test(String(name)))return false;
    for(const k of STRUCTURAL_ECHO_TAGS){const v=tags?.[k];if(v&&fold(v)===fold(name))return false}
    if(EXPLICIT_REJECTED_ATTRACTIONS.has(name))return false;
    const tk=String(name).split(/[^a-zA-Z\u00C0-\u024F\u0391-\u03C9\u0400-\u04FF]+/).filter(Boolean).map(fold);
    if(tk.length&&tk.every(t=>ENGLISH_ATTRACTION_WORDS.has(t)))return false;
    if(/\bla dreapta\b|\bla stanga\b|\bla st\u00e2nga\b/i.test(String(name)))return false;
    return true;
  };
  const FAMOUS_ATTRACTIONS=['Salina Turda','Castelul Bran','Castelul Pelișor','Cetatea Râșnov','Salina Cacica'];

  console.log('LEG 1 — places corpus: full offline walk, integrity proofs, index-vs-recompute parity');
  const manifest=JSON.parse(await readFile(join(root,'public/places/manifest.json'),'utf8'));
  const idToRecord=new Map(),catCounter={},validCats=new Set(Object.keys(manifest.categories).filter(c=>c!=='local-all'));
  for(const c of Object.keys(manifest.categories))catCounter[c]=0;
  const contactCounter=Object.fromEntries(Object.keys(manifest.contacts).map(k=>[k,0]));
  let prevSortKey='';
  const sortKey=it=>query.normalizeSearch(it.name)+'\u0000'+it.id;
  for(const key of Object.keys(manifest.chunks)){
    const bytes=gunzipSync(await readFile(join(root,'public/places/records',key+'.json.gz')));
    leg1.proofs++;
    const proof=manifest.chunks[key];
    if(bytes.length!==proof.bytes||sha256(bytes)!==proof.sha256)bucket('places-chunk-proof','chunk '+key+' fails its manifest sha256/bytes proof',key);
    let items;
    try{items=JSON.parse(bytes.toString('utf8')).items||[]}catch(error){bucket('places-chunk-decode','chunk '+key+' is not parseable JSON: '+error.message,key);continue}
    for(const r of items){
      leg1.records++;
      const id=r.id,name=r.name;
      if(typeof id!=='string'||!id||typeof name!=='string'||!name.trim()){bucket('places-record-shape','record id/name must be non-empty strings',id+'|'+name);continue}
      if(idToRecord.has(id)){bucket('places-record-duplicate-id','duplicate record ids across chunks',id);continue}
      if(!Array.isArray(r.categories)||!r.categories.length||r.categories.some(c=>!validCats.has(c)))bucket('places-record-categories','categories must be a non-empty subset of the manifest registry',id+' ['+r.categories+']');
      if(!Array.isArray(r.types)||r.types.some(t=>!t||typeof t.category!=='string'||typeof t.label!=='string'||!t.category||!t.label))bucket('places-record-types','types must be {category,label} strings',id);
      else{const cats=new Set(r.categories);for(const t of r.types){
        if(!cats.has(t.category))bucket('places-record-types','type category outside the record categories',id+' cat='+t.category);
        const list=manifest.subcategories[t.category];
        if(!list||!list.includes(t.label))bucket('places-record-subcategory','type label missing from the manifest subcategory list',id+'|'+t.category+'|'+t.label);
      }}
      for(const c of r.categories)catCounter[c]=(catCounter[c]||0)+1;
      if(!Number.isFinite(r.lat)||!Number.isFinite(r.lon)||r.lat<43||r.lat>49.4||r.lon<19.6||r.lon>31.2)bucket('places-record-coords','coordinates must be finite and inside the Romania bounds',id+' '+r.lat+','+r.lon);
      if(typeof r.address!=='string'||typeof r.city!=='string'||typeof r.phone!=='string'||typeof r.email!=='string'||typeof r.website!=='string'||typeof r.openingHours!=='string')bucket('places-record-shape','contact fields must be strings',id);
      for(const k of Object.keys(contactCounter))if(r[k])contactCounter[k]++;
      if(typeof r.updatedAt!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(r.updatedAt)||!Number.isFinite(Date.parse(r.updatedAt.replace(' ','T'))))bucket('places-record-updatedAt','updatedAt must parse as an offset timestamp',id+' '+r.updatedAt);
      if(typeof r.sourceUrl!=='string'||!/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(r.sourceUrl))bucket('places-record-sourceUrl','sourceUrl must be an OpenStreetMap node/way/relation link',id+' '+r.sourceUrl);
      else{
        const typ=id[0],tail=typ==='n'?'node/'+id.slice(1):typ==='w'?'way/'+id.slice(1):'relation/'+id.slice(1);
        if(!r.sourceUrl.endsWith(tail))bucket('places-record-sourceUrl','id prefix and sourceUrl type disagree',id);
        if(r.locationApproximate!==(typ!=='n'))bucket('places-record-locationApproximate','locationApproximate must follow the id prefix type',id);
      }
      if(!r.tags||typeof r.tags!=='object'||Array.isArray(r.tags)||Object.values(r.tags).some(v=>typeof v!=='string'))bucket('places-record-tags','tags must be a string map',id);
      if(r.types.some(t=>t.label===ATTRACTION_LABEL)){
        leg1.attractions++;
        if(FAMOUS_ATTRACTIONS.includes(r.name))leg1.famousKept.add(r.name);
        if(!validAttractionName(r.name,r.tags)){leg1.attractionJunk++;bucket('places-attraction-name','an attractions entry must carry a valid public name — the build gate (import-places.py / recover-places-attractions.py) rejects unnamed label fallbacks, English descriptive dumps, fixme artifacts and route-directions sentences',id+' '+r.name)}
      }
      const key2=sortKey(r);
      if(key2<prevSortKey)bucket('places-record-order','records must follow normalized-name order inside the corpus walk',id);
      else prevSortKey=key2;
      const rawSearch=Object.values(r.tags||{}).join(' ')+' '+name+' '+(r.address||'');
      idToRecord.set(id,{name,categories:r.categories,types:r.types,lat:r.lat,lon:r.lon,address:r.address,city:r.city,phone:r.phone,email:r.email,website:r.website,openingHours:r.openingHours,updatedAt:r.updatedAt,sourceUrl:r.sourceUrl,chunk:key,liveSearch:query.normalizeSearch(rawSearch),wideSearch:wideNorm(rawSearch),nonLatinMarks:/\p{M}/u.test(rawSearch.normalize('NFD').replace(/[\u0300-\u036f]/g,''))});
    }
  }
  if(manifest.count!==leg1.records)bucket('places-manifest-count','manifest.count disagrees with the walked records',manifest.count+' vs '+leg1.records);
  if(leg1.attractions!==1533)bucket('places-attraction-count','the attractions subcategory must count exactly the audited post-gate size (1649 corpus entries minus the 116 gate rejects)',String(leg1.attractions));
  for(const famous of FAMOUS_ATTRACTIONS)if(!leg1.famousKept.has(famous))bucket('places-attraction-keep','the gate must never remove a famous Romanian-named attraction',famous);
  for(const c of Object.keys(manifest.categories)){if(c==='local-all'){if(manifest.categories[c]!==leg1.records)bucket('places-manifest-count','local-all count disagrees with the walk',manifest.categories[c]+' vs '+leg1.records);continue}
    if(manifest.categories[c]!==(catCounter[c]||0))bucket('places-manifest-count','category count disagrees with the walk: '+c,manifest.categories[c]+' vs '+(catCounter[c]||0))}
  for(const k of Object.keys(contactCounter))if(manifest.contacts[k]!==contactCounter[k])bucket('places-manifest-contacts','contact count disagrees with the walk: '+k,manifest.contacts[k]+' vs '+contactCounter[k]);

  const checkIndex=async(kind,cat,parts,ids)=>{
    const seen=new Set();let cursor=0;
    for(const part of parts){
      const bytes=gunzipSync(await readFile(join(root,'public/places',part.file+'.gz')));
      leg1.proofs++;leg1.shards++;
      if(bytes.length!==part.bytes||sha256(bytes)!==part.sha256)bucket('places-index-proof','shard '+part.file+' fails its manifest sha256/bytes proof',part.file);
      const items=JSON.parse(bytes.toString('utf8')).items;
      if(!Array.isArray(items)){bucket('places-index-shape','shard '+part.file+' missing items[]',part.file);continue}
      if(part.start!==cursor||(part.count??items.length)!==items.length)bucket('places-index-continuity','shard start/count must continue the category cursor',part.file+' start='+part.start+' cursor='+cursor+' count='+part.count+' items='+items.length);
      cursor+=items.length;
      let prev=null;
      for(const it of items){
        leg1.indexItems++;
        if(typeof it.id!=='string'||typeof it.name!=='string'||typeof it.search!=='string'||typeof it.chunk!=='string'||!Number.isFinite(it.lat)||!Number.isFinite(it.lon)||!Array.isArray(it.categories)||!Array.isArray(it.types)){bucket('places-index-shape','index entry core fields malformed',it.id||part.file);continue}
        for(const f of ['address','city','phone','email','website','openingHours','sourceUrl','updatedAt'])if(typeof it[f]!=='string'){bucket('places-index-shape','index entry string field malformed',it.id+'.'+f);break}
        if(!manifest.chunks[it.chunk])bucket('places-index-chunk','index chunk reference missing from manifest.chunks',it.id+'->'+it.chunk);
        if(!idToRecord.has(it.id)){bucket('places-index-parity','index id unknown to the records',it.id);continue}
        if(seen.has(it.id)){bucket('places-index-parity','duplicate index entry',it.id);continue}
        seen.add(it.id);
        const rec=idToRecord.get(it.id);
        if(rec.chunk!==it.chunk)bucket('places-index-parity','index chunk disagrees with the record',it.id+' '+it.chunk+' vs '+rec.chunk);
        else if(it.name!==rec.name||it.lat!==rec.lat||it.lon!==rec.lon||it.address!==rec.address||it.city!==rec.city||it.phone!==rec.phone||it.email!==rec.email||it.website!==rec.website||it.openingHours!==rec.openingHours||it.updatedAt!==rec.updatedAt||it.sourceUrl!==rec.sourceUrl||it.categories.join(',')!==rec.categories.join(',')||JSON.stringify(it.types)!==JSON.stringify(rec.types))bucket('places-index-parity','index fields disagree with the record',it.id);
        /* The baked index search must be exactly what the runtime normalizer would produce; until the two norms converge, divergence is legal only for the documented non-Latin combining-mark class (the builder drops strictly the marks Unicode classes as combining — Malayalam vowel signs survive it; erasing every mark from both sides must make any legal divergence disappear). */
        if(wideNorm(it.search)!==rec.wideSearch)bucket('places-search-corruption','index search diverges beyond combining marks from the record',it.id);
        if(it.search!==rec.liveSearch){
          leg1.divergedObjects.add(it.id);
          if(marksHandled)bucket('places-search-agreement','runtime normalization handles all combining marks: index search must agree on every object',it.id);
          else if(!rec.nonLatinMarks)bucket('places-search-p1-class','divergence on an object without non-Latin combining marks',it.id);
        }
        if(prev){
          const ok=kind==='name'?(sortKey(it)>=sortKey(prev)):String(it.updatedAt)<=String(prev.updatedAt);
          if(!ok)bucket('places-index-order','index ordering violated',cat+'/'+kind+' '+prev.id+' before '+it.id);
        }
        prev=it;
      }
    }
    if(cursor!==ids.size)bucket('places-index-total',kind+' index total must cover the category record ids exactly',cat+'/'+kind+' '+cursor+' vs '+ids.size);
  };
  for(const cat of Object.keys(manifest.indices)){
    const ids=new Set();
    for(const [id,rec] of idToRecord)if(cat==='local-all'||rec.categories.includes(cat))ids.add(id);
    checkIndex('name',cat,manifest.indices[cat].name,ids);
    checkIndex('recent',cat,manifest.indices[cat].recent,ids);
  }
  {
    const seen=new Set();
    for(const cell of manifest.spatial)for(const part of cell.parts){
      const bytes=gunzipSync(await readFile(join(root,'public/places',part.file+'.gz')));
      leg1.proofs++;leg1.spatialParts++;
      if(bytes.length!==part.bytes||sha256(bytes)!==part.sha256)bucket('places-spatial-proof','spatial part '+part.file+' fails its proof',part.file);
      for(const it of JSON.parse(bytes.toString('utf8')).items||[]){
        leg1.spatialItems++;
        const rec=idToRecord.get(it.id);
        if(!rec||seen.has(it.id))bucket('places-spatial-parity','spatial ids must be known and unique',it.id);
        else{seen.add(it.id);if(Math.floor(rec.lat)!==cell.lat||Math.floor(rec.lon)!==cell.lon)bucket('places-spatial-parity','object placed in the wrong floor(lat/lon) cell',it.id+' cell='+cell.lat+'_'+cell.lon)}
      }
    }
    if(seen.size!==idToRecord.size)bucket('places-spatial-coverage','the spatial index must cover every object exactly once',seen.size+' of '+idToRecord.size);
  }
  {
    const raw=await readFile(join(root,'public/places/cities.json'));
    leg1.proofs++;leg1.cities=JSON.parse(raw.toString('utf8')).items.length;
    const cities=JSON.parse(raw.toString('utf8')).items;
    if(raw.length!==manifest.cities.bytes||sha256(raw)!==manifest.cities.sha256)bucket('places-cities-proof','cities.json fails its manifest proof','cities.json');
    for(const c of cities)if(typeof c.name!=='string'||!c.name||!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||typeof c.type!=='string'||typeof c.county!=='string'||typeof c.sourceUrl!=='string')bucket('places-cities-shape','city entries must expose name/lat/lon/type/county/sourceUrl',c.name);
  }
  if(!marksHandled)note('places-search-p1',leg1.divergedObjects.size);
  console.log('Places: '+leg1.records+' obiecte în '+Object.keys(manifest.chunks).length+' fragmente, '+leg1.indexItems+' intrări de index ('+leg1.shards+' sharduri), '+leg1.spatialItems+' intrări spațiale, '+leg1.cities+' orașe; dovezi sha256 verificate: '+leg1.proofs+'; paritate search index↔runtime: '+(marksHandled?('acord integral pe '+leg1.indexItems+' intrări (normalizatorul runtime acoperă toate semnele combinante)'):('decalaj doar în clasa documentată P1 — '+leg1.divergedObjects.size+' obiecte cu semne combinante non-latine')+'.'));
  console.log('Locuri de vizitat: '+leg1.attractions+' intrări după poarta de validare a numelor — fără nume-fallback, fără gunoaie descriptive englezești; țintele celebre ('+FAMOUS_ATTRACTIONS.join(', ')+') rămân toate în corpus.');

  console.log('LEG 2 — dosar model: fond < apel < recurs on every built history, evidence-only stages, extraction rule');
  const institutionsRaw=await readFile(join(root,'public/courts/institutions.json'),'utf8');
  await compile('court-query','lib/court-query.ts');
  const courtHistory=await compile('court-history','lib/court-history.ts',s=>s.replace("import institutions from '@/public/courts/institutions.json';",'const institutions='+institutionsRaw+';'));
  const institutions=JSON.parse(institutionsRaw);
  if(!Array.isArray(institutions.items)||!institutions.items.length)bucket('dosar-institutions','courts registry must be a non-empty list','institutions.json');
  const instIds=new Set(institutions.items.map(i=>i.id));
  if(instIds.size!==institutions.items.length)bucket('dosar-institutions','duplicate court registry ids',institutions.items.length+' vs '+instIds.size);
  for(const i of institutions.items)if(typeof i.id!=='string'||!i.id||typeof i.label!=='string'||!i.label)bucket('dosar-institutions','registry entries must expose id+label',i.id||i.label);
  const confirmed=JSON.parse(await readFile(join(root,'public/courts/confirmed-references.json'),'utf8'));
  const validNumber=v=>/^\d{1,8}\/\d{1,5}\/\d{4}(?:\/[a-zA-Z0-9.]{1,20})?$/.test(v);
  for(const r of confirmed.items)if(!r.id||!validNumber(r.number)||!validNumber(r.source?.number||'')||!r.court||!instIds.has(r.court)||!r.courtLabel||!r.document||!r.documentNumber||!r.documentDate||!r.verifiedAt||!r.source?.hearingDate||!r.source?.url)bucket('dosar-reference-shape','confirmed references must satisfy the CourtReference contract',r.id||'(no id)');
  if(courtHistory.uniqueCourtReferences(confirmed.items).length!==confirmed.items.length)bucket('dosar-reference-unique','dedupe must keep every distinct confirmed reference',confirmed.items.length+' -> '+courtHistory.uniqueCourtReferences(confirmed.items).length);
  /* Instance order Fond < Apel < Recurs, with the court label as the same-rank tiebreak, must hold in every built history. */
  const rank={Fond:0,Apel:1,Recurs:2};
  const orderViolations=[];
  const checkOrder=h=>{for(let i=1;i<h.stages.length;i++){const a=h.stages[i-1],b=h.stages[i];const ra=rank[a.label]??3,rb=rank[b.label]??3;
    if(ra>rb)orderViolations.push(h.number+' '+a.label+' înainte de '+b.label);
    if(ra===rb&&String(a.courtLabel).localeCompare(String(b.courtLabel),'ro')>0)orderViolations.push(h.number+' ordine instanță '+a.courtLabel+'/'+b.courtLabel)}};
  const verifiedAt='2026-10-05T00:00:00Z';
  let stageChecks=0;
  for(const h of courtHistory.buildCourtHistories([],confirmed.items,'')){stageChecks++;checkOrder(h)}
  const mkRecord=(id,number,stage,court,courtLabel,hearings)=>({id,number,stage,court,courtLabel,hearings});
  const synthetic=[
    mkRecord('r1','111/2/2020','Fond','TribunalulBIHOR','Tribunalul Bihor',[{date:'2020-06-01',summary:''},{date:'2020-07-01',summary:''}]),
    mkRecord('r2','111/2/2020','Apel','CurteadeApelORADEA','Curtea de Apel Oradea',[{date:'2021-01-11',summary:'Sentința civilă nr. 5/2021 din 11.01.2021 pronunțată de Tribunalul Bihor în dosarul nr. 111/2/2020'}]),
    mkRecord('r3','111/2/2020','Recurs','InaltaCurteCasatiesiJustitie','Înalta Curte de Casație și Justiție',[{date:'2022-02-02',summary:'Sentința civilă nr. 7/2022 din 02.02.2022 pronunțată de Curtea de Apel Oradea în dosarul 111/2/2020'}]),
    mkRecord('r4','222/3/2021','fond','TribunalulBIHOR','Tribunalul Bihor',[])];
  const extracted=courtHistory.extractCourtReferences(synthetic,verifiedAt);
  for(const r of extracted)if(r.stage!=='Fond'||!instIds.has(r.court))bucket('dosar-evidence-stage','extracted references must be Fond stages of registry courts',r.stage+' '+r.court);
  const histories=courtHistory.buildCourtHistories(synthetic,[...confirmed.items,...extracted],'');
  for(const h of histories){stageChecks++;checkOrder(h)}
  const h111=histories.find(h=>h.number==='111/2/2020');
  if(!h111)bucket('dosar-synthetic-history','the synthetic chain must build one history','111/2/2020');
  else{
    const labels=h111.stages.map(s=>s.label),ranks=labels.map(l=>rank[l]??3);
    if(!labels.includes('Fond')||!labels.includes('Apel')||!labels.includes('Recurs'))bucket('dosar-synthetic-history','the full chain must surface all three stages',labels.join(','));
    if(ranks.some((r,i)=>i&&r<ranks[i-1]))bucket('dosar-stage-order','synthetic stages out of instance order',labels.join(','));
    const fondRecord=h111.stages.find(s=>s.label==='Fond'&&s.availability==='record');
    if(!fondRecord||fondRecord.recordIds.join(',')!=='r1'||fondRecord.hearingCount!==2)bucket('dosar-stage-record','the fond record stage must carry its records and hearings',JSON.stringify(fondRecord));
    const fondEvidence=h111.stages.find(s=>s.label==='Fond'&&s.availability==='reference');
    if(!fondEvidence)bucket('dosar-evidence-only','a judgment pronounced in another dosar must confirm a reference-only fond stage','111/2/2020');
    for(const s of h111.stages.filter(s=>s.availability==='reference'))if((s.recordIds||[]).length||s.hearingCount)bucket('dosar-evidence-purity','reference-only stages must carry no records or hearings',s.label);
    if(h111.relatedCases.some(r=>r.number==='111/2/2020'))bucket('dosar-related-self','a history must not list itself as related','111/2/2020');
    if(h111.historyComplete!==false)bucket('dosar-history-complete','historyComplete must stay false while evidence is partial','111/2/2020');
    const textOut=courtHistory.courtHistoryText(h111);
    for(const s of h111.stages)if(!textOut.includes(s.label))bucket('dosar-history-text','the rendered history must name every stage',s.label);
  }
  const badExtraction=courtHistory.extractCourtReferences([
    mkRecord('x1','333/4/2022','Recurs','TribunalulBIHOR','Tribunalul Bihor',[{date:'2023-01-01',summary:'S-a admis apelul reclamantului John Doe în dosarul 444/5/2023'}]),
    mkRecord('x2','bad/number','Fond','TribunalulBIHOR','Tribunalul Bihor',[{date:'2023-01-01',summary:'Sentința civilă nr. 9/2023 din 01.01.2023 pronunțată de Tribunalul Bihor în dosarul nr. 555/6/2023'}]),
    mkRecord('x3','666/7/2023','Fond','TribunalulBIHOR','Tribunalul Bihor',[{date:'2023-01-01',summary:'Sentința din 01.01.2023 pronunțată de Tribunalul București în dosarul 777/8/2023'}])],verifiedAt);
  if(badExtraction.some(r=>r.number==='444/5/2023'))bucket('dosar-extraction-party-name','a party-name mention must not create a reference','444/5/2023');
  if(badExtraction.some(r=>r.number==='555/6/2023'))bucket('dosar-extraction-invalid-source','a record with an invalid dosar number must not create a reference','555/6/2023');
  if(badExtraction.some(r=>r.number==='777/8/2023'))bucket('dosar-extraction-unknown-court','a court outside the registry must not create a reference','777/8/2023');
  if(orderViolations.length)for(const v of orderViolations.slice(0,3))bucket('dosar-stage-order','instance ordering violated in a built history',v);
  console.log('Dosar: '+institutions.items.length+' instanțe, '+confirmed.items.length+' referințe confirmate, '+histories.length+' istorice reconstruite ('+stageChecks+' verificări de ordonare fond<apel<recurs), extracție doar pe sentință explicită — probele negative (nume de parte, număr invalid, instanță necunoscută) respinse.');

  console.log('LEG 3 — CKAN catalog: category coverage, dataset contract, raw keys confined to the labeled metadata dump');
  const categoriesModule=await compile('catalog-categories','lib/live/catalog-categories.ts');
  const validCategories=categoriesModule.catalogCategories.map(c=>c.id);
  const remap={energie:'mediu',agricultura:'mediu',filme:'cultura',stiri:'justitie'};
  const inventory=JSON.parse(await readSnapshotFile(join(root,'public/catalog/index.json'),'utf8'));
  const catDist={},ids=new Set();let alte=0;
  for(const r of inventory.items){
    if(typeof r.id!=='string'||!r.id||ids.has(r.id)){bucket('ckan-inventory-ids','dataset ids must be unique non-empty strings',r.id);continue}
    ids.add(r.id);
    if(typeof r.title!=='string'||!r.title.trim())note('ckan-title-empty',1);
    if(typeof r.organization!=='string'||!r.organization)bucket('ckan-inventory-shape','organization must be a non-empty string',r.id);
    if(typeof r.modified!=='string'||!Number.isFinite(Date.parse(r.modified)))bucket('ckan-inventory-shape','modified must parse as a date',r.id+' '+r.modified);
    if(typeof r.license!=='string'||!r.license)bucket('ckan-inventory-shape','license must be a non-empty string',r.id);
    if(!Number.isInteger(r.resourceCount))bucket('ckan-inventory-shape','resourceCount must be an integer',r.id+' '+r.resourceCount);
    if(r.resourceCount===0)note('ckan-resourceCount-zero',1);
    if(!Array.isArray(r.formats))bucket('ckan-inventory-shape','formats must be an array',r.id);
    else if(!r.formats.length)note('ckan-formats-empty',1);
    else if(r.formats.some(f=>typeof f!=='string'||!f))bucket('ckan-inventory-shape','formats must be non-empty strings',r.id);
    if(!Array.isArray(r.categories))bucket('ckan-inventory-shape','categories must be an array',r.id+' '+JSON.stringify(r.categories));
    else{
      if(!r.categories.length)alte++;
      if(r.categories.some(c=>!validCategories.includes(c)))bucket('ckan-inventory-categories','categories must map onto the 14 app categories',r.id+' ['+r.categories+']');
      for(const c of r.categories)catDist[c]=(catDist[c]||0)+1;
    }
    if(r.name!==undefined&&typeof r.name!=='string')bucket('ckan-inventory-shape','name slug must be a string when present',r.id);
    if(r.notes!==undefined&&typeof r.notes!=='string')bucket('ckan-inventory-shape','notes must be a string when present',r.id);
  }
  for(const c of validCategories)if(!catDist[c])note('ckan-category-empty:'+c,1);
  const knownDetailKeys=new Set(['id','name','title','organization','organization_slug','license','license_title','license_url','metadata_modified','notes','url','resources']);
  let licenseNull=0,lastModifiedNull=0,nameless=0,formatless=0,nonHttpUrls=0,leadingDotFormats=0,detailFiles=0,emptyResources=0;
  for(const id of ids){
    let d;
    try{d=JSON.parse(gunzipSync(await readFile(join(root,'public/catalog/datasets',id+'.json.gz'))).toString('utf8'))}catch(error){bucket('ckan-dataset-file','detail file missing or unparseable',id+': '+error.message);continue}
    detailFiles++;
    if(d.id!==id)bucket('ckan-dataset-file','detail file must echo its id',id+' -> '+d.id);
    if(typeof d.title!=='string'||!d.title.trim())bucket('ckan-dataset-file','title must be a non-empty string',id);
    if(typeof d.organization!=='string'||!d.organization)bucket('ckan-dataset-file','organization must be a non-empty string',id);
    if(typeof d.metadata_modified!=='string'||!Number.isFinite(Date.parse(d.metadata_modified)))bucket('ckan-dataset-file','metadata_modified must parse as a date',id);
    if(typeof d.url!=='string'||!/^https?:\/\//.test(d.url))bucket('ckan-dataset-file','dataset url must be http(s)',id);
    if(d.license_title===null||d.license_title===undefined)licenseNull++;
    else if(typeof d.license_title!=='string')bucket('ckan-dataset-file','license_title must be null or a string',id);
    for(const k of Object.keys(d))if(!knownDetailKeys.has(k))bucket('ckan-dataset-raw-keys','detail payload keys must stay within the contract mapped to labeled fields — raw CKAN keys render only inside the labeled full-metadata dump',id+'.'+k);
    if(!Array.isArray(d.resources))bucket('ckan-dataset-resources','dataset resources must be an array',id);
    else if(!d.resources.length)emptyResources++;
    else{
      const inv=inventory.items.find(r=>r.id===String(id));
      if(inv&&inv.resourceCount!==d.resources.length)bucket('ckan-dataset-count-parity','inventory resourceCount must equal the payload resources',id+' '+inv.resourceCount+' vs '+d.resources.length);
      for(const r of d.resources){
        if(typeof r.id!=='string'||!r.id)bucket('ckan-dataset-resources','resource id must be a non-empty string',id);
        if(r.name!==undefined&&r.name!==null&&typeof r.name!=='string')bucket('ckan-dataset-resources','resource name must be a string when the source sends one',id+' '+(r.id||r.name));
        else if(!r.name)nameless++;
        if(r.format!==undefined&&r.format!==null&&typeof r.format!=='string')bucket('ckan-dataset-resources','resource format must be a string when the source sends one',id);
        else if(!r.format)formatless++;
        else if(r.format.startsWith('.'))leadingDotFormats++;
        if(r.url!==undefined&&r.url!==null&&typeof r.url!=='string')bucket('ckan-dataset-resources','resource url must be a string when the source sends one',id);
        else if(typeof r.url!=='string'||!/^https?:\/\//.test(r.url||''))nonHttpUrls++;
        if(r.last_modified===null||r.last_modified===undefined)lastModifiedNull++;
        else if(typeof r.last_modified!=='string'||!Number.isFinite(Date.parse(r.last_modified)))bucket('ckan-dataset-resources','resource last_modified must be null or a parseable date',id);
      }
    }
  }
  const seedPool=JSON.parse(await readFile(join(root,'lib/live/catalog-seed.json'),'utf8'));
  const seedCats={};let seedRecent=0,p2Overstated=0;
  const recentCutoff=new Date(Date.now()-3*365.25*86400000).toISOString().slice(0,10);
  for(const e of seedPool){
    if(typeof e.id!=='string'||!e.id||typeof e.title!=='string'||!e.title||typeof e.organization!=='string'||!e.organization||!Array.isArray(e.formats)||!Array.isArray(e.resources)||!Number.isInteger(e.resourceCount))bucket('ckan-seed-shape','fallback pool entries must carry the mapped dataset contract',e.id||'(no id)');
    if(Number(e.resourceCount)>((e.resources||[]).length))p2Overstated++;
    else if(Number(e.resourceCount)<((e.resources||[]).length))bucket('ckan-seed-count','payload may never exceed the declared CKAN resource count',e.id+' '+e.resourceCount+' < '+(e.resources||[]).length);
    if(typeof e.category==='string'&&validCategories.includes(e.category))seedCats[e.category]=(seedCats[e.category]||0)+1;
    else bucket('ckan-seed-shape','fallback pool category must map onto the 14 app categories',e.id+' '+e.category);
    if(typeof e.modified==='string'&&Number.isFinite(Date.parse(e.modified))){if(e.modified>=recentCutoff)seedRecent++}else bucket('ckan-seed-shape','modified must parse as a date',e.id);
  }
  for(const c of validCategories)if(!seedCats[remap[c]||c])note('ckan-seed-category-empty:'+c,1);
  if(seedPool.length&&!seedRecent)note('ckan-seed-recency-none',1);
  note('ckan-license-null',licenseNull);note('ckan-resource-last-modified-null',lastModifiedNull);note('ckan-resource-nameless',nameless);note('ckan-resource-formatless',formatless);note('ckan-resource-non-http',nonHttpUrls);note('ckan-resource-leading-dot-format',leadingDotFormats);note('ckan-seed-num-resources-overstated',p2Overstated);note('ckan-dataset-empty-resources',emptyResources);
  console.log('Catalog: '+inventory.items.length+' seturi în inventar, '+detailFiles+' fișiere detalii, '+ids.size+' id-uri unice; categorii acoperite: '+Object.keys(catDist).length+' din '+validCategories.length+' (alte: '+alte+'); cheile brute rămân în contractul etichetat; pool de rezervă: '+seedPool.length+' intrări ('+seedRecent+' recente, '+p2Overstated+' în clasa documentată num_resources > payload).');

  console.log('LEG 4 — live corpora shapes: feeds, weather stations, directories, cinema sites, transport network, SIRUTA localities, legal snapshots, stories, events, forecast labels');
  const server=JSON.parse(await readFile(join(root,'lib/live/server-seed.json'),'utf8'));
  const seed=JSON.parse(await readFile(join(root,'lib/live/seed.json'),'utf8'));
  const demo=JSON.parse(await readFile(join(root,'app/demo-data.json'),'utf8'));
  let feedItems=0;
  for(const kind of ['munca','stiri','sanatate','educatie','justitie','energie','transport']){
    const f=server['feed:'+kind],items=f?.data?.items||[];
    feedItems+=items.length;
    if(!items.length){note('feed-empty:'+kind,1);continue}
    let lean=0;const dup=new Set();
    for(const it of items){
      if(typeof it.id!=='string'||!it.id)bucket('feed-item-shape','feed item id must be a string','feed:'+kind);
      if(typeof it.title!=='string'||!it.title.trim())bucket('feed-item-shape','feed item title must be non-empty','feed:'+kind+' '+(it.id||it.title));
      if(!validUrl(it.url))bucket('feed-item-shape','feed item url must be http(s) without credentials','feed:'+kind+' '+String(it.url).slice(0,60));
      if(it.publishedAt!==null&&it.publishedAt!==undefined&&(typeof it.publishedAt!=='string'||!Number.isFinite(Date.parse(it.publishedAt))))bucket('feed-item-shape','publishedAt must be null or parseable','feed:'+kind+' '+it.publishedAt);
      if(dup.has(it.id))bucket('feed-item-shape','duplicate feed item ids','feed:'+kind+' '+it.id);
      dup.add(it.id);
      if(it.summary===undefined&&it.content===undefined&&it.media===undefined){lean++;continue}
      if(typeof it.summary!=='string')bucket('feed-item-shape','partial seed copy: summary must be a string when any rich field ships','feed:'+kind+' '+it.id);
      if(typeof it.content!=='string')bucket('feed-item-shape','partial seed copy: content must be a string when any rich field ships','feed:'+kind+' '+it.id);
      for(const m of it.media||[])if(!validUrl(m.url))bucket('feed-item-shape','media url must be http(s) without credentials','feed:'+kind+' '+String(m.url).slice(0,60));
    }
    if(lean)note('feed-lean-copy:'+kind,lean);
  }
  const afir=server['feed:agricultura'],afirItems=afir?.data?.items||[];
  feedItems+=afirItems.length;
  if(!afirItems.length)note('feed-empty:agricultura',1);
  for(const it of afirItems){
    if(typeof it.id!=='string'||!it.id||typeof it.title!=='string'||!it.title.trim()||!validUrl(it.url))bucket('afir-item-shape','AFIR items must carry id, title and a valid url',it.id||it.title);
    if(it.publishedAt!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(String(it.publishedAt||'')))bucket('afir-item-shape','AFIR publishedAt must be null or a date',String(it.publishedAt));
    if(it.summary!==undefined||it.content!==undefined)bucket('afir-item-shape','the AFIR lean copy must not carry summary/content',it.id);
  }
  const films=server['films']?.data?.items||[];
  feedItems+=films.length;
  const filmArrayFields=['directors','cast','genres','runtime','languages','countries','screenwriters','producers','production','cinematographers','composers','releaseDates'];
  for(const it of films){
    if(typeof it.id!=='string'||!it.id||typeof it.title!=='string'||!it.title.trim())bucket('films-item-shape','film records must carry id and title',it.id||it.title);
    if(!validUrl(it.url))bucket('films-item-shape','film url must be http(s) without credentials',String(it.url).slice(0,60));
    if(it.date!==null&&it.date!==undefined&&!Number.isFinite(Date.parse(it.date)))bucket('films-item-shape','film date must be null or parseable',it.id+' '+it.date);
    for(const m of it.media||[])if(!validUrl(m.url))bucket('films-item-shape','film media url must be http(s) without credentials',it.id);
    for(const k of filmArrayFields)if(it[k]!==undefined&&(!Array.isArray(it[k])||it[k].some(v=>typeof v!=='string')))bucket('films-item-shape','film list fields must be string arrays',it.id+'.'+k);
  }
  let stations=0;
  for(const [name,payload] of [['seed:weather',seed['weather']?.data],['demo:weather',demo['weather']]]){
    const list=payload?.stations||[];
    stations+=list.length;
    if(!list.length){bucket('stations-shape','the station corpus must not be empty',name);continue}
    let windNull=0,skyNull=0,definedCoords=0;
    for(const s of list){
      if(typeof s.name!=='string'||!s.name.trim())bucket('stations-shape','station name must be non-empty',name+' '+s.name);
      if(typeof s.observedAtText!=='string'||!s.observedAtText)bucket('stations-shape','observedAtText must be a non-empty string',name+' '+(s.name||''));
      if(s.lat!==undefined||s.lon!==undefined){definedCoords++;
        if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon))bucket('stations-shape','defined station coordinates must be finite',name+' '+(s.name||s.lat));
        else if(s.lat<43||s.lat>49.4||s.lon<19.6||s.lon>31.2)note('stations-coords-bounds',1)}
      if(s.temperature!==null&&s.temperature!==undefined&&!Number.isFinite(s.temperature))bucket('stations-shape','temperature must be null or numeric',name+' '+(s.name||s.temperature));
      if(s.humidity!==null&&s.humidity!==undefined&&!Number.isFinite(s.humidity))bucket('stations-shape','humidity must be null or numeric',name+' '+(s.name||s.humidity));
      if(s.wind===null||s.wind===undefined)windNull++;
      else if(typeof s.wind!=='string')bucket('stations-shape','wind must be null or a string',name+' '+(s.name||''));
      if(s.sky===null||s.sky===undefined)skyNull++;
    }
    if(!payload?.observedAt||!payload?.sourceUrl||!Number.isFinite(Date.parse(payload?.observedAt)))bucket('stations-shape','observation metadata must expose observedAt and sourceUrl',name+' '+payload?.observedAt);
    if(name==='demo:weather'){if(definedCoords)bucket('stations-shape','demo station coordinates must stay finite when defined',name+' '+definedCoords);note('stations-demo-dormant',1)}
    if(windNull)note('stations-wind-null:'+name,windNull);
    if(skyNull)note('stations-sky-null:'+name,skyNull);
  }
  let directoryRecords=0;
  for(const kind of ['health','pharmacies','hospitals']){
    const d=server['directory:'+kind]?.data;
    const records=d?.records||[];
    directoryRecords+=records.length;
    let titleless=0;
    for(const r of records){
      if(typeof r!=='object'||Array.isArray(r)){bucket('directory-record','CNAS records must be objects','directory:'+kind);continue}
      const title=r['Nume furnizor']||r['Denumire lunga unitate']||r['Denumire PJ']||Object.entries(r).find(([k])=>/denum|furnizor/i.test(k))?.[1];
      if(!title||!String(title).trim())titleless++;
      if(d&&!Object.keys(r).every(k=>d.fields.includes(k)))bucket('directory-fields','record keys must stay within the published fields list','directory:'+kind+' '+String(title).slice(0,40));
    }
    if(titleless)note('directory-titleless:'+kind,titleless);
    if(!d?.records?.length)note('directory-empty:'+kind,1);
    if(!d?.fields?.length||!d?.title||!d?.period||!d?.note||!Number.isInteger(d?.total)||d?.total!==d?.records?.length)bucket('directory-envelope','registry envelope must expose title/period/note/fields/total','directory:'+kind+' total='+d?.total+' records='+(d?.records?.length??'none'));
    for(const k of d?.fields||[])if(typeof k!=='string'||!k.trim())bucket('directory-envelope','field names must be non-empty strings','directory:'+kind);
  }
  {
    const d=server['directory:schools']?.data;
    const records=d?.records||[];
    directoryRecords+=records.length;
    const numericTyped={};let titleless=0,geoless=0;
    for(const r of records){
      if(!Array.isArray(r)){bucket('directory-schools','school rows must be compact arrays','directory:schools');continue}
      if(r.length>(d?.fields?.length||0)){bucket('directory-schools','school rows must not exceed the fields list','directory:schools len='+r.length);continue}
      const obj=Object.fromEntries((d?.fields||[]).slice(0,r.length).map((f,i)=>[f,r[i]]));
      if(!obj['Denumire lunga unitate']||!String(obj['Denumire lunga unitate']).trim())titleless++;
      if(!obj['Judet PJ']||!obj['Localitate unitate'])geoless++;
      for(const f of ['Telefon','Cod postal','Numar'])if(typeof obj[f]==='number')numericTyped[f]=(numericTyped[f]||0)+1;
    }
    if(d?.compact!==true)bucket('directory-schools','the schools seed must be flagged compact','compact='+d?.compact);
    if(titleless)note('directory-schools-titleless',titleless);
    if(geoless)note('directory-schools-geoless',geoless);
    for(const k of Object.keys(numericTyped))note('directory-schools-xlsx-numeric:'+k,numericTyped[k]);
  }
  const cinemas=JSON.parse(await readFile(join(root,'public/cinema/cinemas.json'),'utf8'));
  const registry=new Map(cinemas.items.map(c=>[String(c.externalCode),c]));
  for(const c of cinemas.items)if(!c.externalCode||typeof c.name!=='string'||!c.name||!c.address||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))bucket('cinema-registry','registry entries must expose externalCode/name/address/latitude/longitude',c.name||c.externalCode);
  const cinemaKeys=Object.keys(server).filter(k=>k.startsWith('cinema:'));
  for(const k of cinemaKeys){
    const d=server[k]?.data;
    if(!d||!Array.isArray(d.films)||!Number.isInteger(d.filmCount)||!Number.isInteger(d.eventCount)||!d.cinema||!d.date){bucket('cinema-site','site payloads must expose films/filmCount/eventCount/cinema/date',k);continue}
    if(d.filmCount!==d.films.length)bucket('cinema-site','filmCount must equal the payload film list',k+' '+d.filmCount+' vs '+d.films.length);
    for(const f of d.films)if(typeof f.id!=='string'||!f.id||typeof f.title!=='string'||!f.title)bucket('cinema-site','film entries must carry id and title',k+' '+(f.id||f.title));
    if(!registry.has(k.split(':')[1]))bucket('cinema-site','seeded site code must exist in the registry',k);
  }
  if(cinemaKeys.length!==cinemas.items.length)note('cinema-seed-registry-count-diff',1);
  const transit=server['transport']?.data,stops=transit?.stops||[],routes=transit?.routes||[];
  for(const s of stops){
    if(typeof s.id!=='string'||!s.id||typeof s.name!=='string'||!s.name)bucket('transport-shape','stops must carry id and name',s.id||s.name);
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||s.lat<=40||s.lat>=50||s.lon<=20||s.lon>=31)bucket('transport-shape','stop coordinates must be finite and inside the network bounds',s.id||s.name);
    if(s.details!==undefined&&typeof s.details!=='object')bucket('transport-shape','stop details must be an object when present',(s.id||s.name)+'.details');
    if(s.description!==undefined&&typeof s.description!=='string')bucket('transport-shape','stop description must be a string when present',(s.id||s.name)+'.description');
  }
  for(const r of routes)if(typeof r.id!=='string'||!r.id||typeof r.name!=='string'||!r.name)bucket('transport-shape','routes must carry id and name',r.id||r.name);
  if(stops.length<10||routes.length<10)note('transport-coverage-below-minimum',1);
  if(routes.length&&routes.every(r=>!r.details&&!r.file))note('transport-lean-route-copy',1);
  const transitManifest=JSON.parse(await readFile(join(root,'public/transit/manifest.json'),'utf8'));
  const zip=await readFile(join(root,'public/transit/TPBI_GTFS.zip'));
  if(zip.length!==transitManifest.bytes||sha256(zip)!==transitManifest.sha256)bucket('transport-zip-proof','the GTFS zip must satisfy its manifest sha256/bytes proof','TPBI_GTFS.zip');
  const manifestRoutes=transitManifest.routes&&typeof transitManifest.routes==='object'?Object.entries(transitManifest.routes):[];
  const netIds=new Set(routes.map(r=>r.id)),manifestIds=new Set(manifestRoutes.map(([id])=>id));
  for(const r of routes)if(!manifestIds.has(r.id))bucket('transport-manifest-parity','seeded routes must be covered by manifest proofs',r.id);
  if(routes.length)for(const id of manifestIds)if(!netIds.has(id))bucket('transport-manifest-parity','manifest routes must be present in the seeded network',id);
  let routeFiles=0;
  for(const [routeId,proof] of manifestRoutes){
    const path=join(root,'public/transit',proof.file+'.gz');
    try{const bytes=gunzipSync(await readFile(path));routeFiles++;
      if(bytes.length!==proof.bytes||sha256(bytes)!==proof.sha256)bucket('transport-route-proof','route file fails its sha256/bytes proof',routeId);
    }catch(error){bucket('transport-route-proof','manifest route file missing',routeId)}
  }
  const leg4b={siruta:0,legalItems:0,legalProofs:0,legalConsolidated:0,stories:0,storyProofs:0,events:0,forecastVars:0};
  {
    const data=server['siruta']?.data,items=data?.items||[];
    leg4b.siruta=items.length;
    let noCounty=0,noDetails=0;
    for(const x of items){
      if(typeof x.id!=='string'||!x.id||typeof x.name!=='string'||!x.name.trim())bucket('siruta-item-shape','locality rows must carry id and name',x.id||x.name);
      if(x.parent!==undefined&&typeof x.parent!=='string')bucket('siruta-item-shape','parent must be a string when present',x.name+'.parent');
      if(x.postal!==undefined&&typeof x.postal!=='string')bucket('siruta-item-shape','postal code must be a string when present',x.name+'.postal');
      if(x.environment!=='Urban'&&x.environment!=='Rural')bucket('siruta-item-shape','environment must be Urban or Rural',x.name+' '+(x.environment||''));
      if(!x.county)noCounty++;
      if(x.details===undefined)noDetails++;
      else if(!x.details||typeof x.details!=='object')bucket('siruta-item-shape','locality details must be a non-empty object when present',x.name+'.details');
    }
    if(!items.length)bucket('siruta-item-shape','the SIRUTA corpus must not be empty','siruta');
    if(!data?.period)bucket('siruta-item-shape','the SIRUTA corpus must expose its reference period','siruta');
    if(noCounty)note('siruta-county-missing',noCounty);
    if(items.length&&noDetails===items.length)note('siruta-details-dropped',items.length);
  }
  {
    await compile('text','lib/live/text.ts');
    const consolidationModule=await compile('legal-consolidation','lib/live/legal-consolidation.ts');
    for(const mf of ['manifest.json','historical-manifest.json']){
      const m=JSON.parse(await readFile(join(root,'public/legal-snapshots',mf),'utf8'));
      for(const item of m.items){
        leg4b.legalItems++;
        if(!item.file){bucket('legal-snapshot-shape','snapshot manifest entries must name their file',item.id||mf);continue}
        let gz;
        try{gz=await readFile(join(root,'public',item.file))}catch{bucket('legal-snapshot-shape','snapshot file missing from the corpus',item.file);continue}
        leg4b.legalProofs++;
        if(item.fileSha256&&(gz.length!==item.fileBytes||sha256(gz)!==item.fileSha256))bucket('legal-snapshot-proof','stored snapshot fails its compressed sha256/bytes proof',item.file);
        const textContent=gunzipSync(gz).toString('utf8'),contentBytes=Buffer.from(textContent,'utf8');
        leg4b.legalProofs++;
        if(contentBytes.length!==item.bytes||sha256(contentBytes)!==item.sha256)bucket('legal-snapshot-proof','decompressed snapshot fails its content sha256/bytes proof',item.file);
        if(item.characters!==undefined&&item.characters!==textContent.length)bucket('legal-snapshot-proof','declared character count disagrees with the snapshot text',item.file+' '+item.characters+' vs '+textContent.length);
        if(item.textProvided===true&&!textContent.trim())bucket('legal-snapshot-shape','provided text must not be empty',item.file);
        if(item.consolidation){
          leg4b.legalConsolidated++;
          if(!consolidationModule.verifiedConsolidation(item))bucket('legal-snapshot-consolidation','the asOf/verified consolidation contract must hold for consolidated snapshots',item.id||item.file);
          if(!(item.consolidation.versionDate<=item.consolidation.asOf))bucket('legal-snapshot-consolidation','consolidation versionDate must not exceed asOf',item.id||item.file);
        }
      }
    }
  }
  {
    const idx=JSON.parse(gunzipSync(await readFile(join(root,'public/stories/index.json.gz'))).toString('utf8'));
    leg4b.stories=idx.items.length;
    for(const it of idx.items){
      if(typeof it.id!=='string'||!it.id||typeof it.title!=='string'||!it.title.trim())bucket('stories-item-shape','story index entries must carry id and title',it.id||it.title);
      if(!validUrl(it.url))bucket('stories-item-shape','story index entries must carry a source url',it.id||'');
      if(!Number.isInteger(it.characters)||it.characters<=40)bucket('stories-item-shape','declared character count must be an integer above the minimum story length',it.id+' '+it.characters);
      if(!it.file){bucket('stories-item-shape','story index entries must name their text file',it.id);continue}
      let raw;
      try{raw=await readFile(join(root,'public/stories',it.file+'.gz'))}catch{bucket('stories-text-file','the story text file is missing from the corpus',it.id+' '+it.file);continue}
      leg4b.storyProofs++;
      const text=gunzipSync(raw);
      if(it.proof&&(text.length!==it.proof.bytes||sha256(text)!==it.proof.sha256))bucket('stories-text-proof','story text fails its sha256/bytes proof',it.id);
    }
  }
  {
    const events=server['events:odeon']?.data?.items||[];
    leg4b.events=events.length;
    let startSorted=true;
    for(let i=0;i<events.length;i++){
      const it=events[i];
      if(typeof it.id!=='string'||!it.id||typeof it.title!=='string'||!it.title.trim())bucket('events-item-shape','event entries must carry id and title',it.id||it.title);
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(it.start||'')))bucket('events-item-shape','event start must be a local time without seconds',it.id+' '+it.start);
      if(it.end!==undefined&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(it.end||'')))bucket('events-item-shape','event end must be a local time without seconds',it.id);
      if(!validUrl(it.url))bucket('events-item-shape','event entries must carry a source url',it.id);
      if(!Array.isArray(it.media))bucket('events-item-shape','event media must be an array',it.id);
      if(typeof it.content!=='string')bucket('events-item-shape','event entries must carry content text',it.id);
      if(!it.sourceName||typeof it.sourceName!=='string')bucket('events-item-shape','event entries must name their source institution',it.id);
      if(i&&String(events[i-1].start)>String(it.start))startSorted=false;
    }
    if(!events.length)bucket('events-item-shape','the events corpus must not be empty','events:odeon');
    if(!startSorted)bucket('events-order','event entries must stay ordered by start time','events:odeon');
  }
  {
    const forecast=await compile('forecast','lib/live/forecast.ts');
    const workspaceSource=await readFile(join(root,'app/weather-workspace.tsx'),'utf8');
    const labelKeys=new Set([...workspaceSource.matchAll(/([a-z_0-9]+):'[^']+'/g)].map(m=>m[1]));
    const variables=[...forecast.currentVariables,...forecast.hourlyVariables,...forecast.dailyVariables];
    const uniqueVariables=new Set(variables);
    leg4b.forecastVars=uniqueVariables.size;
    const unlabeled=[...uniqueVariables].filter(k=>!labelKeys.has(k));
    if(unlabeled.length)bucket('forecast-raw-label-leak','every Open-Meteo variable the API requests must carry a Romanian label in the workspace table',unlabeled.join(', '));
    const payload={latitude:44.42,longitude:26.1,elevation:90,timezone:'Europe/Bucharest',current_units:{},hourly_units:{temperature_2m:'°C'},daily_units:{weather_code:'wmo'},current:{time:1759706400,interval:900},hourly:{time:[1759706400]},daily:{time:[1759706400]}};
    for(const k of forecast.currentVariables)payload.current[k]=1;
    for(const k of forecast.hourlyVariables)payload.hourly[k]=[1];
    for(const k of forecast.dailyVariables)payload.daily[k]=[1];
    payload.hourly.sunrise=[1759706400];payload.daily.sunrise=[1759800000];payload.daily.sunset=[1759843200];
    const d=forecast.parseForecast(JSON.stringify(payload)).data;
    if(!d.current||!d.hourly.length||!d.daily.length||!d.hourlyUnits||!d.dailyUnits||d.timezone!=='Europe/Bucharest')bucket('forecast-parse-contract','the parsed forecast must keep the current/hourly/daily/units envelope','parseForecast');
    for(const k of Object.keys(d.hourly[0]||{}))if(k!=='time'&&!forecast.hourlyVariables.includes(k))bucket('forecast-parse-contract','parsed hourly rows must stay within the requested variables',k);
    for(const k of Object.keys(d.daily[0]||{}))if(k!=='time'&&!forecast.dailyVariables.includes(k))bucket('forecast-parse-contract','parsed daily rows must stay within the requested variables',k);
  }
  console.log('Corpuri live: fluxuri '+feedItems+' elemente (7 surse + AFIR + filme), '+stations+' stații ANM, '+directoryRecords+' înregistrări în directore (CNAS ×3 + școli), '+cinemaKeys.length+' cinematografe ('+cinemas.items.length+' în registru), transport: '+stops.length+' opriri și '+routes.length+' rute cu '+routeFiles+' fișiere de rută probate.');
  console.log('Corpuri de referință: SIRUTA '+leg4b.siruta+' localități, '+leg4b.legalItems+' copii legale verificate ('+leg4b.legalProofs+' dovezi sha256, '+leg4b.legalConsolidated+' cu consolidare asOf), '+leg4b.stories+' povestiri cu '+leg4b.storyProofs+' dovezi text, '+leg4b.events+' spectacole ordonate cronologic, prognoză: '+leg4b.forecastVars+' variabile cerute, toate cu etichete românești.');
}catch(error){internalError=error}finally{await rm(temp,{recursive:true,force:true})}
if(internalError){console.error('verify-model-contracts: '+(internalError instanceof Error?internalError.message:String(internalError)));if(internalError instanceof Error&&internalError.stack)console.error(internalError.stack);process.exit(1)}
if(buckets.size){
  console.error('verify-model-contracts: '+buckets.size+' contract violations');
  for(const [check,b] of buckets)console.error('  ['+check+'] '+b.detail+' — n='+b.count+' — exemple: '+b.samples.join(' | '));
  process.exit(1);
}
const knownList=Object.entries(known).map(([k,v])=>k+'='+v).join(', ');
console.log('Stări cunoscute, documentate în registrul T1.4 (degrade onest, nu eșecuri): '+(knownList||'niciuna')+'.');
console.log('Contractele de model verificate integral, offline: locuri cu paritate index↔runtime pe căutare, dosar cu fond<apel<recurs probat pe istorice, catalog CKAN acoperit în cele 14 categorii cu cheile brute limitate la panoul etichetat, corpurile live verificate ca formă (fluxuri, stații ANM, directore, cinematografe, transport) și corpurile de referință (SIRUTA, copiile legale cu dovezi și consolidare asOf, povestiri, spectacole, etichetele prognozei). Fără rețea ('+(Number(process.hrtime.bigint()-started)/1e6).toFixed(0)+' ms).');
