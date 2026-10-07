import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),sqlite=new DatabaseSync(':memory:'),modules=new Map(),originalFetch=globalThis.fetch;
sqlite.exec('CREATE TABLE source_cache (key TEXT PRIMARY KEY,data TEXT,last_success_at TEXT,adapter_version TEXT)');
const db={prepare(sql){return{bind(...values){const statement=sqlite.prepare(sql);return{run:async()=>statement.run(...values),all:async()=>({results:statement.all(...values)})}}}},batch:async statements=>{const results=[];for(const statement of statements)results.push(await statement.run());return results}};
const env={DB:db};let fixture,calls=0;
function load(file){
 if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(resolve(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const imports=name=>{
  if(name==='cloudflare:workers')return{env};
  if(name==='@/lib/live/cache')return{readSource:async()=>structuredClone(fixture)};
  if(name.endsWith('request-context'))return{liveContext:()=>null};
  if(name.startsWith('@/')||name.startsWith('.')){let path=name.startsWith('@/')?name.slice(2):resolve(root,dirname(file),name).slice(root.length+1);if(path.endsWith('.json'))return JSON.parse(fs.readFileSync(resolve(root,path),'utf8'));if(path.endsWith('.mjs'))return require(resolve(root,path));return load(path.endsWith('.ts')?path:path+'.ts')}
  return require(name);
 };new Function('require','module','exports',code)(imports,module,module.exports);return module.exports;
}
const argument=name=>{const at=process.argv.indexOf(name);return at>=0?process.argv[at+1]:''};
try{
 const legal=load('lib/live/legal.ts'),history=load('lib/court-history.ts'),registry=load('lib/live/court-references.ts'),api=load('app/api/legal/route.ts'),seed=JSON.parse(fs.readFileSync(resolve(root,'public/courts/confirmed-references.json'),'utf8')).items;
 const checkedAt='2026-10-05T17:00:00.000Z',sourcePath=argument('--reference-response'),casePath=argument('--case-response');
 const publicSource={id:'source-record',number:'2403/111/2025',court:'TribunalulBIHOR',courtLabel:'Tribunalul Bihor',stage:'Fond',hearings:[{date:'2026-06-25T00:00:00',summary:'Sentinţa civilă nr. 476/LM/2023 din 12.05.2023 pronunţată de Tribunalul Bihor în dosarul nr.6236/111/2017'}]};
 const sourceItems=sourcePath?legal.parseCourtSearch(fs.readFileSync(sourcePath,'utf8')).data.items:[publicSource],references=history.extractCourtReferences(sourceItems,checkedAt);
 const found=references.find(r=>r.number==='6236/111/2017');assert(found);assert.equal(found.id,seed[0].id);assert.equal(found.documentNumber,'476/LM/2023');assert.equal(found.documentDate,'2023-05-12');assert.equal(found.source.number,'2403/111/2025');
 if(sourcePath){assert.equal(createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),seed[0].source.responseSha256);assert(sourceItems.every(item=>item.number==='2403/111/2025'));}
 const appeal={id:'appeal-record',number:'6236/111/2017',court:'CurteadeApelORADEA',courtLabel:'Curtea de Apel Oradea',stage:'Apel',hearings:[{date:'2023-11-08T00:00:00'},{date:'2023-11-22T00:00:00'}]},caseItems=casePath?legal.parseCourtSearch(fs.readFileSync(casePath,'utf8')).data.items:[appeal];
 await registry.rememberCourtReferences(sourceItems,checkedAt);
 const saved=sqlite.prepare('SELECT data FROM source_cache').all();assert.equal(saved.length,1);assert(!saved[0].data.includes('solutieSumar'));assert(!saved[0].data.includes('summary'));assert(!saved[0].data.includes('parties'));
 const linked=await registry.courtReferences(caseItems,'6236/111/2017',checkedAt),journeys=history.buildCourtHistories(caseItems,linked.references,'6236/111/2017');assert.equal(journeys.length,1);
 const journey=journeys[0];assert.deepEqual(journey.stages.map(stage=>stage.label),['Fond','Apel']);assert.equal(journey.stages[0].availability,'reference');assert.equal(journey.stages[0].recordIds.length,0);assert.equal(journey.stages[0].hearingCount,0);assert.equal(journey.stages[1].hearingCount,2);assert.equal(journey.historyComplete,false);assert(history.courtHistoryText(journey).includes('Fișa și ședințele acestei etape nu sunt disponibile.'));
 assert.deepEqual(history.buildCourtHistories(caseItems,[])[0].stages.map(stage=>stage.label),['Apel'],'An appeal alone must never certify a fond');
 assert.equal(history.extractCourtReferences([{...publicSource,hearings:[{date:'2026-06-25T00:00:00',summary:'Dosar 6236/111/2017 și apel la Curtea de Apel Oradea'}]}],checkedAt).length,0,'Bare numbers and appeal labels cannot create judgment links');
 assert.equal(history.extractCourtReferences([{...publicSource,hearings:[{date:'2026-06-25T00:00:00',summary:publicSource.hearings[0].summary.replace('Tribunalul Bihor','Instanță necunoscută')}]}],checkedAt).length,0);
 assert.equal(history.buildCourtHistories([appeal,{...appeal,id:'suffix',number:'6236/111/2017/a1'}],references).length,2,'Case suffixes must remain distinct');
 const newSource={...publicSource,number:'99/111/2026',hearings:[{...publicSource.hearings[0],summary:publicSource.hearings[0].summary.replace('6236/111/2017','82/111/2024')}]};
 await registry.rememberCourtReferences([newSource],checkedAt);const newLinks=await registry.courtReferences([],'82/111/2024',checkedAt),newHistory=history.buildCourtHistories([],newLinks.references,'82/111/2024');assert.equal(newHistory.length,1);assert.equal(newHistory[0].stages[0].evidence[0].source.number,'99/111/2026','Previously observed references must be found for other numbers, without a fixed-case UI');
 const sourceJourney=history.buildCourtHistories(sourceItems,references)[0];assert(sourceJourney.relatedCases.some(r=>r.number==='6236/111/2017'));assert.equal(sourceJourney.recordIds.length,sourceItems.length,'The referencing case keeps its own records/hearings');
 fixture={status:'cached',lastSuccessAt:checkedAt,data:{items:caseItems,historyComplete:false,hearingCount:2}};
 globalThis.fetch=async()=>{calls++;throw Error('Court links must not make supplementary external requests')};
 const request=()=>new Request('https://example.test/api/legal',{method:'POST',body:JSON.stringify({kind:'court',number:'6236/111/2017',numberScope:'all',locality:'Cluj-Napoca',county:'Cluj',geoScope:'context'})});
 let response=await (await api.POST(request())).json();assert.deepEqual(response.data.caseHistories[0].stages.map(stage=>stage.label),['Fond','Apel']);assert.equal(response.data.items.length,caseItems.length);assert.equal(response.data.hearingCount,2);assert.equal(response.data.searchScope,'number-all-courts');assert.equal(calls,0);
 fixture={status:'unavailable',data:null,lastSuccessAt:null,error:'Serviciu temporar indisponibil'};response=await (await api.POST(request())).json();assert.equal(response.status,'unavailable');assert.equal(response.data.items.length,0);assert.equal(response.data.caseHistories[0].stages[0].availability,'reference');assert.equal(response.data.hearingCount,0);assert.equal(calls,0,'An outage does not erase previously confirmed fond metadata or create hearings');
 db.prepare=()=>{throw Error('D1 unavailable')};const interrupted=await registry.courtReferences(caseItems,'6236/111/2017',checkedAt);assert.equal(interrupted.lookupAvailable,false);assert(interrupted.references.some(r=>r.number==='6236/111/2017'));
 console.log(JSON.stringify({status:'passed',officialResponseCompared:!!sourcePath,number:'6236/111/2017',stages:['Fond: reference only','Apel: 2 hearings'],checks:['primary-source seed digest','cross-case persistent links','no invented hearings or stages','distinct suffixes','bidirectional source navigation metadata','actual geographic API','outage retention','no extra upstream requests']}));
}finally{globalThis.fetch=originalFetch;sqlite.close()}
