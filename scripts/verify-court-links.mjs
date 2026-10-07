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

 // Romanian diacritics survive the whole dosar chain verbatim: both official
 // glyph families (comma-below U+0218-021B and cedilla U+015E/U+0163, plus
 // ă/â/î) must round-trip through decode, parse and JSON, and the literal «?»
 // the Ministry itself published must stay verbatim — disclosed, not invented.
 const dosarWith=(summary)=>'<Dosar><numar>2403/111/2025</numar><institutie>TribunalulBIHOR</institutie><departament>Sec\u0163ia civil\u0103 de contencios</departament><obiect>Contesta\u0163ie \u00eempotriva m\u0103surii arest\u0103rii</obiect><stadiuProcesualNume>Fond</stadiuProcesualNume><dataModificare>2026-06-25T00:00:00</dataModificare><parti><DosarParte><nume>Institu\u0163ia public\u0103</nume><calitateParte>P\u00e2r\u00e2t</calitateParte></DosarParte></parti><sedinte><DosarSedinta><data>2026-06-25T00:00:00</data><hora i:nil="true"/><solutieSumar>'+summary+'</solutieSumar></DosarSedinta></sedinte></Dosar>';
 const envelope=(records)=>'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><CautareDosareResponse xmlns="portalquery.just.ro"><CautareDosareResult>'+records+'</CautareDosareResult></CautareDosareResponse></s:Body></s:Envelope>';
 const cleanSummary='Sentin\u0163a civil\u0103 nr. 476/LM/2023 din 12.05.2023 pronun\u0163at\u0103 de Tribunalul Bihor \u00een dosarul nr. 6236/111/2017 \u2014 \u0219edin\u021ba public\u0103, solu\u021bia 2, \u0219i m\u0103sura r\u0103m\u00e2ne \u00eentemeiat\u0103';
 const corruptedSummary='Sentin\u0163a civil\u0103 nr. 476/LM/2023 din 12.05.2023 pronun\u0163at\u0103 de Tribunalul Bihor \u00een dosarul nr. 6236/111/2017 \u2014 solu\u021bia Cur?ii de Apel Bucure?ti, Sec?ia I Penal\u0103';
 const cleanRegistered=legal.parseCourtSearch(envelope(dosarWith(cleanSummary)));
 const cleanItem=cleanRegistered.data.items[0];
 assert.equal(cleanItem.hearings[0].summary,cleanSummary,'Comma-below and cedilla diacritics survive parsing byte for byte');
 assert.equal(JSON.parse(JSON.stringify(cleanItem)).hearings[0].summary,cleanSummary,'The JSON round-trip keeps every glyph form');
 assert(!history.upstreamDiacriticLoss(cleanSummary),'No genuine question mark at a word end is flagged');
 assert(!cleanRegistered.data.note.includes('ș/ț'),'Clean official text needs no diacritic-loss disclosure');
 const corruptedRegistered=legal.parseCourtSearch(envelope(dosarWith(corruptedSummary)));
 const corruptedItem=corruptedRegistered.data.items[0];
 assert.equal(corruptedItem.hearings[0].summary,corruptedSummary,'The literal «?» published by the source stays verbatim');
 assert(history.upstreamDiacriticLoss(corruptedSummary),'Loss inside a word (Sec?ia) is flagged');
 assert.equal(typeof history.DIACRITIC_LOSS_NOTE,'string');
 assert(corruptedRegistered.data.note.includes(history.DIACRITIC_LOSS_NOTE),'A corrupted official summary is disclosed in the source note');
 assert(!cleanRegistered.data.note.includes(history.DIACRITIC_LOSS_NOTE));
 // Byte-stream decode: chunks of 5 bytes cut multi-byte sequences mid-glyph,
 // so the streaming decoder (not the parser alone) carries every form intact.
 const streamResponse=(text)=>{const bytes=Buffer.from(text,'utf8');let at=0;return new Response(new ReadableStream({pull(controller){if(at>=bytes.length){controller.close();return}controller.enqueue(bytes.subarray(at,at+5));at+=5}}),{status:200,headers:{'Content-Type':'text/xml; charset=utf-8'}})};
 const streamFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(url,init)=>{const operation=String(init.headers.SOAPAction||'').includes('CautareDosare2')?'CautareDosare2':'CautareDosare';return streamResponse(envelope(dosarWith(cleanSummary)).replaceAll('CautareDosareResponse',operation+'Response').replaceAll('CautareDosareResult',operation+'Result'))};
  const streamed=await legal.loadCourtSearch({number:'2403/111/2025',name:'',subject:'',institution:'',from:'',to:''});
  assert.equal(streamed.data.items[0].hearings[0].summary,cleanSummary,'The chunked streaming decode carries ș/ț byte for byte');
  assert(!JSON.stringify(streamed).includes('\ufffd'),'The decoder never manufactures replacement characters');
 }finally{globalThis.fetch=streamFetch}

 fixture={status:'cached',lastSuccessAt:checkedAt,data:{items:caseItems,historyComplete:false,hearingCount:2}};
 globalThis.fetch=async()=>{calls++;throw Error('Court links must not make supplementary external requests')};
 const request=()=>new Request('https://example.test/api/legal',{method:'POST',body:JSON.stringify({kind:'court',number:'6236/111/2017',numberScope:'all',locality:'Cluj-Napoca',county:'Cluj',geoScope:'context'})});
 let response=await (await api.POST(request())).json();assert.deepEqual(response.data.caseHistories[0].stages.map(stage=>stage.label),['Fond','Apel']);assert.equal(response.data.items.length,caseItems.length);assert.equal(response.data.hearingCount,2);assert.equal(response.data.searchScope,'number-all-courts');assert.equal(calls,0);
 fixture={status:'unavailable',data:null,lastSuccessAt:null,error:'Serviciu temporar indisponibil'};response=await (await api.POST(request())).json();assert.equal(response.status,'unavailable');assert.equal(response.data.items.length,0);assert.equal(response.data.caseHistories[0].stages[0].availability,'reference');assert.equal(response.data.hearingCount,0);assert.equal(calls,0,'An outage does not erase previously confirmed fond metadata or create hearings');
 db.prepare=()=>{throw Error('D1 unavailable')};const interrupted=await registry.courtReferences(caseItems,'6236/111/2017',checkedAt);assert.equal(interrupted.lookupAvailable,false);assert(interrupted.references.some(r=>r.number==='6236/111/2017'));
  console.log(JSON.stringify({status:'passed',officialResponseCompared:!!sourcePath,number:'6236/111/2017',stages:['Fond: reference only','Apel: 2 hearings'],checks:['primary-source seed digest','cross-case persistent links','no invented hearings or stages','distinct suffixes','bidirectional source navigation metadata','actual geographic API','outage retention','no extra upstream requests','diacritics verbatim both glyph families + chunked streaming decode + upstream «?» disclosure']}));
}finally{globalThis.fetch=originalFetch;sqlite.close()}
