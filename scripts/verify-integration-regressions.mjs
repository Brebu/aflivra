// Integration regression gate for the remediation round (Astra plan 2026-10-10): imports
// the REAL parser and route implementations — no condition is reimplemented in test. The
// groups land per milestone and every assert cites the defect it guards (N01, D01–D11).
// Run from the repo root: node scripts/verify-integration-regressions.mjs
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {readSnapshotFile as readFileSnapshot} from './snapshot-read.mjs';

const root=resolve(import.meta.dirname,'..'),dir=await mkdtemp(join(tmpdir(),'aflivra-regressions-')),require=createRequire(import.meta.url),prepared=new Map(),readSource=path=>readFileSnapshot(join(root,path),'utf8');
async function prepare(path){
 if(prepared.has(path))return prepared.get(path);const output=join(dir,path.replace(/[^a-z0-9]/gi,'_')+'.mjs');prepared.set(path,output);
 let source=await readSource(path);
 for(const match of [...source.matchAll(/import (\w+) from ['"]((?:@\/|\.\/|\.\.\/)[^'"]+\.json)['"];?/g)])source=source.replace(match[0],'const '+match[1]+'='+await readFileSnapshot((match[2].startsWith('@/')?join(root,match[2].slice(2)):resolve(root,dirname(path),match[2])),'utf8')+';');
 source=source.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__regressionsEnv;');
 if(path==='lib/live/sen.ts')source=source.replace("import {getSource,SourceError} from './adapters';","const getSource=async(...args)=>globalThis.__regressionsSource(...args);class SourceError extends Error{}");
 if(path.startsWith('app/api/'))source=source.replace(/import \{readSource\} from ['"]@\/lib\/live\/cache['"];?/,'const readSource=loader=>globalThis.__regressionsReadSource(loader);');
 let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 for(const match of [...js.matchAll(/(?:\bfrom\s+|\bimport\(\s*)['"]([^"']+)['"]/g)]){
  const spec=match[1];if(spec.startsWith('node:'))continue;
  let uri;if(spec.startsWith('@/')||spec.startsWith('.')){let target=spec.startsWith('@/')?spec.slice(2):resolve(root,dirname(path),spec).slice(root.length+1);if(target.endsWith('.mjs'))uri=pathToFileURL(join(root,target)).href;else{if(!target.endsWith('.ts'))target+='.ts';uri=pathToFileURL(await prepare(target)).href}}
  else uri=pathToFileURL(require.resolve(spec)).href;
  js=js.replaceAll("'"+spec+"'","'"+uri+"'").replaceAll('"'+spec+'"','"'+uri+'"');
 }
 await writeFile(output,js);return output;
}
const load=async path=>import(pathToFileURL(await prepare(path)).href);

const groups=[];const group=async (name,fn)=>{try{await fn();groups.push({name,status:'ok'});console.log('ok   '+name)}catch(error){groups.push({name,status:'fail',message:error.message});console.log('FAIL '+name+' :: '+(error.message||error).split('\n')[0])}};

await group('dates — D08 calendar strictness, D11 prefix ranges',async()=>{
 const {isValidCalendarDate,calendarRange}=await load('lib/live/date.ts');
 for(const good of ['2024-02-29','2026-10-11','1999-12-31','2000-01-01'])assert.equal(isValidCalendarDate(good),true,'a valid calendar day must pass: '+good);
 for(const bad of ['2026-02-30','2026-04-31','2025-02-29','2026-13-01','2026-00-10','2026-1-01','26-01-01','2026/01/01','01-02-2026','2026-02-30T00:00','2026-02','2026','','   '])assert.equal(isValidCalendarDate(bad),false,'an impossible or malformed day must be rejected before any upstream call: '+JSON.stringify(bad));
 assert.equal(isValidCalendarDate(undefined),false);assert.equal(isValidCalendarDate(null),false);
 assert.deepEqual(calendarRange('2026'),{from:'2026-01-01',to:'2026-12-31'},'a bare year expands to its calendar bounds');
 assert.deepEqual(calendarRange('2026-03'),{from:'2026-03-01',to:'2026-03-31'},'a year-month expands to the month bounds');
 assert.deepEqual(calendarRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'},'a leap February ends on the 29th');
 assert.deepEqual(calendarRange('2026-02'),{from:'2026-02-01',to:'2026-02-28'},'a common February ends on the 28th');
 assert.deepEqual(calendarRange('2026-03-15'),{from:'2026-03-15',to:'2026-03-15'},'a full day keeps its own bounds');
 for(const bad of ['2026-13','2026-02-30','2026-3','2026-1','26','abc','','2026-02-29T00:00'])assert.equal(calendarRange(bad),null,'an impossible or malformed prefix must be rejected: '+JSON.stringify(bad));
});

await group('workflow — N01 corpora-refresh real dirs, staged diff, changed gating',async()=>{
 const yml=await readSource('.github/workflows/corpora-refresh.yml');
 assert.match(yml,/git add public\/situr public\/amccrs public\/eida public\/lmi public\/data\/snapshot-transport\.json/,'staging must use the real corpus directories');
 assert.match(yml,/git diff --cached --quiet/,'the quiet-day check must compare the staged tree, so new files register too');
 assert.match(yml,/changed=false/);assert.match(yml,/changed=true/),'the stage step must publish a changed output';
 const gated=(yml.match(/if: steps\.\w+\.outputs\.changed == 'true'/g)||[]).length;
 assert.ok(gated>=3,'commit, publish and PR steps must all gate on the staged-changed output (found '+gated+')');
 assert.doesNotMatch(yml,/public\/data\/(?:situr|amccrs|eida|lmi)\b/,'the pathspec that fails with exit 128 must be gone');
 assert.match(yml,/git push origin/,'the branch must be published explicitly before the PR step');
 assert.match(yml,/gh pr list --head "\$BRANCH"/,'a rerun must reuse the open PR instead of duplicating it');
 assert.doesNotMatch(yml,/if: success\(\) && github\.event_name == 'schedule'/,'the dispatch run must reach the same staging/gating path as the scheduled one — quiet-day gating by event only was the N01 defect');
});

await group('offline-importers — N01 local fixture mode, manifest-validated, no fetch',async()=>{
 for(const script of ['scripts/import-situr-snapshot.mjs','scripts/import-eida-snapshot.mjs','scripts/import-lmi-snapshot.mjs']){
  const source=await readSource(script);
  assert.match(source,/--input-dir|--source-dir/,script+' must accept a local fixture directory');
  assert.match(source,/validateFixtureManifest/,script+' must validate the fixture manifest before importing');
 }
 const helper=await readSource('scripts/lib/fixture-manifest.mjs');
 assert.match(helper,/sha256/, 'the manifest validator must check the SHA-256 of every fixture it releases for import');
 const register=await readSource('scripts/snapshot-register.mjs');
 assert.match(register,/writeSnapshotIfChanged/,'the snapshot writer must skip a rewrite when only fetch metadata would change');
});

await group('sen — D01 verified endpoint + numeric contract, D06 Europe/Bucharest DST',async()=>{
 const sen=await load('lib/live/sen.ts');
 const {parseSen,revalidateSenTime,senLoader}=sen;
 assert.match(await readSource('lib/live/sen.ts'),/https:\/\/www\.transelectrica\.ro\/sen-filter/,'endpoint-ul verificat care răspunde 200');
 assert.doesNotMatch(await readSource('lib/live/sen.ts'),/\/web\/tel\/sen-filter/,'URL-ul vechi răspundea 404');
 assert.equal(senLoader.version,'energy.power-system.v2','adaptorul v2 ocolește backoff-ul rândurilor scrise de v1');
 const fixture=JSON.parse(await readFile(join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/sources/sen-current.json'),'utf8'));
 const obs=parseSen(fixture);
 assert.equal(obs.productionMW,4182);assert.equal(obs.consumptionMW,6294);assert.equal(obs.balanceSoldMW,2112);
 assert.equal(obs.observedAtText,'26/10/10 20:48:54');
 assert.equal(obs.observedAt,'2026-10-10T17:48:54Z','fixture-ul pachetului: ora locală de vară 20:48:54 = 17:48:54Z (UTC+3)');
 assert.equal(obs.observedAtNote,null);
 assert.equal(obs.componentsMW.VULC,-432,'valorile negative publicate de sursă nu se taie artificial');
 const scenario=stamp=>parseSen([{row1_HARTASEN_DATA:stamp},{PROD:'10'},{CONS:'20'},{SOLD:'5'}]);
 assert.equal(scenario('26/01/10 12:00:00').observedAt,'2026-01-10T10:00:00Z','iarnă: ora locală → UTC+2');
 const summer=scenario('26/10/10 19:07:52');
 assert.equal(summer.observedAt,'2026-10-10T16:07:52Z','vară: ora locală → UTC+3; codul vechi cu h-2 produca 17:07:52Z');
 const spring=scenario('26/03/29 03:30:00');
 assert.equal(spring.observedAt,null,'ora lipsă la trecerea de primăvară nu se confirmă');
 assert.match(spring.observedAtNote,/nu există|vară/i,'motivul explicit al orei inexistente');
 const fall=scenario('26/10/25 03:30:00');
 assert.equal(fall.observedAt,null,'ora repetată la trecerea de toamnă rămâne neconfirmată — fără UTC ales arbitrar');
 assert.match(fall.observedAtNote,/ambigu/i,'ambiguitatea declarată');
 assert.equal(scenario('26/02/30 12:00:00').observedAt,null,'ziua calendaristică imposibilă nu se convertește');
 assert.equal(scenario('26/13/01 12:00:00').observedAt,null,'luna imposibilă nu se convertește');
 for(const bad of [[],[{PROD:'10'}],[{row1_HARTASEN_DATA:'26/10/10 20:48:54'},{PROD:'x'},{CONS:'y'},{SOLD:'z'}]]){
  let caught=null;try{parseSen(bad)}catch(error){caught=error}
  assert.ok(caught,'un răspuns fără cele trei puteri numerice este un eșec de sursă, nu un succes aparent cu câmpuri goale');
 }
 const revalidated=revalidateSenTime({...obs,observedAt:'2026-10-10T18:48:54Z'});
 assert.equal(revalidated.observedAt,'2026-10-10T17:48:54Z','o copie v1 își revalidează ora din valoarea brută, cu parserul real');
});

await group('sen-route — D01/D06 contract al rutei /api/power',async()=>{
 const route=await load('app/api/power/route.ts');
 const senModule=await load('lib/live/sen.ts');
 const fixture=JSON.parse(await readFile(join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/sources/sen-current.json'),'utf8'));
 const v1payload={...senModule.parseSen(fixture),observedAt:'2026-10-10T18:48:54Z'};
 globalThis.__regressionsReadSource=async()=>({key:'power:sen',name:'Transelectrica · sistemul energetic național',url:'https://www.transelectrica.ro/sen-filter',adapterVersion:'energy.power-system.v2',storedAdapterVersion:'energy.power-system.v1',status:'stale',data:v1payload,publishedAt:null,lastSuccessAt:'2026-10-10T17:50:00.000Z',lastAttemptAt:null,nextAttemptAt:null,error:'HTTP 404 de la endpointul vechi',ttlSeconds:60});
 let response=await route.GET();let body=await response.json();
 assert.equal(body.data.observedAt,'2026-10-10T17:48:54Z','copia stale scrisă de v1 se servește cu ora recalculată');
 assert.equal(body.observationTimeRevalidated,true,'recalculul se declară explicit în răspuns');
 const future=new Date(Date.now()+45000).toISOString();
 globalThis.__regressionsReadSource=async()=>({key:'power:sen',name:'Transelectrica',url:'https://www.transelectrica.ro/sen-filter',adapterVersion:'energy.power-system.v2',storedAdapterVersion:'energy.power-system.v2',status:'cached',data:{...senModule.parseSen(fixture),observedAt:future},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:60});
 response=await route.GET();body=await response.json();
 assert.ok(body.data.observationAgeSeconds<0,'o vechime negativă semnalează anomalia de conversie — nu se maschează la zero');
 assert.equal(body.observationTimeRevalidated,undefined,'rândul v2 nu se redeclară recalculat');
 delete globalThis.__regressionsReadSource;
});

await group('situr-county — D02 canonicizarea județului pe ambele părți, 387 la alimentație',async()=>{
 const base='https://regressions.local/';
 let corpusFetches=0;
 globalThis.__regressionsEnv={};
 globalThis.fetch=async url=>{const href=url instanceof Request?url.url:String(url);const m=href.match(/\/situr\/(cazare|alimentatie|agentii)\.json/);if(!m)return new Response(null,{status:404});corpusFetches++;return new Response(new Uint8Array(await readFile(join(root,'public/situr/'+m[1]+'.json.gz'))))};
 const situr=await load('lib/live/situr.ts');
 try{
  for(const spelling of ['București','Bucuresti','MUNICIPIUL BUCUREŞTI','B']){
   const result=await situr.readSitur({kind:'alimentatie',county:spelling},base);
   assert.equal(result.total,387,'alimentatie București se selectează pentru orice variantă de scriere a județului: '+spelling);
   assert.equal(result.filters.applied,true);
  }
  assert.equal((await situr.readSitur({kind:'alimentatie',county:'București',page:19},base)).items.length,387-19*20,'ultima pagină a selecției București rămâne 7 rânduri, paginarea se păstrează');
  const shown=await situr.readSitur({kind:'alimentatie',county:'București'},base);
  assert.match(shown.items[0].judet,/BUCURE[ȘŞ]TI/i,'județul original al rândului se păstrează în câmpul afișat, necanonicizat');
  assert.ok(shown.items.every(item=>/BUCURE[ȘŞ]TI/i.test(item.judet)),'selecția nu strecoară rânduri din alt județ');
  assert.equal((await situr.readSitur({kind:'alimentatie',county:'Brașov'},base)).total,607,'județ de control: Brașov');
  assert.equal((await situr.readSitur({kind:'alimentatie',county:'Cluj'},base)).total,676,'județ de control: Cluj');
  assert.equal((await situr.readSitur({kind:'alimentatie',county:'Ilfov'},base)).total,74,'județ de control: Ilfov');
  assert.equal((await situr.readSitur({kind:'cazare',county:'București'},base)).total,2491,'registru de control: cazare București (rânduri de registru, nu firme distincte)');
  assert.equal((await situr.readSitur({kind:'agentii',county:'București'},base)).total,893,'registru de control: agenții București');
  const combined=await situr.readSitur({kind:'alimentatie',county:'București',locality:'bucuresti'},base);
  assert.equal(combined.total,386,'filtrul de localitate nu rupe selecția canonicizată pe județ; singurul rând exclus (SAIDOUN) are localitatea vidă chiar în exportul oficial — gol de sursă, nu eroare de selecție');
  const unknown=await situr.readSitur({kind:'alimentatie',county:'Atlantis'},base);
  assert.equal(unknown.filters.county,'Atlantis','județul necunoscut nu se transformă tăcut în selecție națională la nivel de filtru — răspunsul rămâne onest despre cerere');
  const before=corpusFetches;
  const route=await load('app/api/tourism/route.ts');
  const bad=new Request('https://regressions.local/api/tourism?kind=alimentatie&county=Atlantis');
  const response=await route.GET(bad);
  assert.equal(response.status,400,'un județ explicit nerecunoscut se respinge cu 400, nu se servește național');
  assert.equal(corpusFetches,before,'județul invalid NU declanșează citirea corpusului');
  const good=await route.GET(new Request('https://regressions.local/api/tourism?kind=alimentatie&county=MUNICIPIUL BUCUREŞTI'));
  const body=await good.json();
  assert.equal(good.status,200);assert.equal(body.data.total,387,'ruta integrală servește cele 387 de rânduri pe varianta cu prefix');
 }finally{delete globalThis.fetch;delete globalThis.__regressionsEnv}
});

await group('lawyers-county — D04 county singur activează baroul în ddlCompany',async()=>{
 const route=await load('app/api/lawyers/route.ts');
 const {createHash}=await import('node:crypto');
 const captured=[];let scenarioSource=null;
 globalThis.__regressionsReadSource=async loader=>{captured.push(loader);return scenarioSource};
 const keyOf=(q,page,sort,barCounty)=>'lawyers:'+createHash('sha256').update(JSON.stringify({q,page,sort,barCounty})).digest('hex');
 const plumbed=extra=>({key:'lawyers:x',name:'IFEP',url:'https://www.ifep.ro/Justice/Lawyers',adapterVersion:'ifep.public-search.v2',storedAdapterVersion:'ifep.public-search.v2',status:'fresh',publishedAt:null,lastSuccessAt:new Date().toISOString(),lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:3600,...extra});
 const item=(name,bar)=>({name,title:'Avocat definitiv '+name+', Baroul '+bar+' [activ]',paragraphs:['Sediu principal: București, Strada Exemplu nr. 3'],updatedAt:'05-10-2026 12:12'});
 try{
  scenarioSource=plumbed({data:{items:[item('POPESCU Ana','București')],total:285,page:0,pages:19,barScope:'București'}});
  let response=await route.GET(new Request('https://r.local/api/lawyers?q=popescu&county=București'));
  let body=await response.json();
  assert.equal(response.status,200);
  assert.equal(captured.at(-1).key,keyOf('popescu',0,'recent','București'),'county singur ajunge în cheia loaderului cu baroul canonic — formularul IFEP primește ddlCompany');
  assert.equal(body.data.barScope,'București','sursa a aplicat baroul: totalul și paginarea descriu selecția locală');
  assert.equal(body.data.note,undefined,'fără fallback când sursa suportă baroul');
  response=await route.GET(new Request('https://r.local/api/lawyers?q=popescu&locality=București'));
  body=await response.json();
  assert.equal(captured.at(-1).key,keyOf('popescu',0,'recent','București'),'localitatea singură își păstrează ruta istorică prin baroul rezolvat din localitate');
  assert.equal(body.data.total,285);
  const upstreamBefore=captured.length;
  response=await route.GET(new Request('https://r.local/api/lawyers?q=popescu&county=Atlantis'));
  assert.equal(response.status,400,'județ explicit invalid → 400');
  assert.equal(captured.length,upstreamBefore,'județul invalid nu declanșează niciun apel upstream');
  scenarioSource=plumbed({data:{items:[item('POPESCU Ana','București')],total:542,page:0,pages:37}});
  response=await route.GET(new Request('https://r.local/api/lawyers?q=popescu&county=București&geoScope=national'));
  body=await response.json();
  assert.equal(captured.at(-1).key,keyOf('popescu',0,'recent',''),'geoScope=national rămâne național explicit — baroul nu se aplică');
  assert.equal(body.data.items.length,1);assert.equal(body.data.note,undefined);
  scenarioSource=plumbed({data:{items:[item('POPESCU Ana','București'),item('POPESCU Mihai','Cluj')],total:542,page:0,pages:37}});
  response=await route.GET(new Request('https://r.local/api/lawyers?q=popescu&county=București'));
  body=await response.json();
  assert.equal(body.data.sourceTotal,542,'fallback-ul păstrează totalul sursei naționale');
  assert.equal(body.data.items.length,1,'fallback-ul filtrează pagina națională la potrivirile baroului');
  assert.match(body.data.note,/baroul București/,'nota declară baroul neaplicat de sursă');
 }finally{delete globalThis.__regressionsReadSource}
});

try{
 let failed=0;for(const g of groups)if(g.status==='fail'){failed++;console.error('  '+g.name+' :: '+g.message)}
 if(failed){console.error('verify-integration-regressions: '+failed+' of '+groups.length+' groups failed');process.exitCode=1}
 else console.log('{"result":"ok","groups":'+groups.length+'}');
}finally{await rm(dir,{recursive:true,force:true})}
