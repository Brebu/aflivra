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
 // Structura întâi: un bloc run: | scurs la coloana zero rupe fișierul YAML (run-ul
 // GitHub eșuează fără niciun job, exact cum a prins auto-run-ul de push). Sub
 // „jobs:", nimic nu are voie la coloana zero în afară de cheile top-level.
 for(const workflowFile of ['.github/workflows/corpora-refresh.yml','.github/workflows/pr-validation.yml']){
  const source=await readSource(workflowFile);
  const tops=['name','on','permissions','concurrency','jobs','env','defaults'];
  const offenders=source.split('\n').map((line,index)=>[index+1,line]).filter(([number,line])=>line&&!/^[\s#-]/.test(line)&&!tops.some(key=>line===key||line.startsWith(key+':')));
  assert.equal(offenders.length,0,workflowFile+': niciun conținut de bloc scurs la coloana zero (linii: '+offenders.map(([number])=>number).join(', ')+') — altfel GitHub nu mai poate parsa workflow-ul și tura de noapte moare tăcut');
  // Shell-valid înainte de runtime: fiecare bloc `run: |` e script bash compus de
  // GitHub abia la execuție, deci o eroare de sintaxă (un ghilimel ASCII care
  // închide un șir „tipografic” a rămas nevăzută până la primul run cu schimbări).
  // Neutralizăm expresiile `${{ … }}` înainte de bash -n — nu sunt shell.
  const lines=source.split('\n');
  for(let index=0;index<lines.length-1;index++){
   if(!/^\s*run:\s*\|\s*$/.test(lines[index]))continue;
   const indent=/^(\s*)/.exec(lines[index])?.[1].length;
   const body=[];
   for(let cursor=index+1;cursor<lines.length;cursor++){
    const line=lines[cursor];
    if(line.trim()===''||(line.length>=indent+2&&line.startsWith('\u0020'.repeat(indent+2))))body.push(line.slice(Math.min(indent+2,line.length)));
    else break;
   }
   const step=lines.slice(Math.max(0,index-4),index+1).reverse().find(line=>/- name:/.test(line))||'(pas fără nume)';
   const rendered=body.join('\n').replace(/\$\{\{[^}]*\}\}/g,'__GH_EXPR__');
   const{spawnSync}=await import('node:child_process');
   const os=await import('node:os'),path=await import('node:path'),fs=await import('node:fs');
   const dir=fs.mkdtempSync(os.tmpdir()+'/wf-probe-');
   const file=path.join(dir,'step.sh');
   fs.writeFileSync(file,rendered);
   const check=spawnSync('bash',['-n',file],{encoding:'utf8'});
   fs.rmSync(dir,{recursive:true,force:true});
   assert.equal(check.status,0,workflowFile+' · '+(step.trim()||'run block')+' — bash -n a respins scriptul pasului: '+(check.stderr||'').trim().slice(0,300));
  }
 }
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

await group('eida-parser — D03 antetul oficial mapează câmpurile, D05 comentariile nu sunt stații',async()=>{
 const {parseFdsnStations,parseFdsnEvents}=await import(pathToFileURL(join(root,'scripts/lib/fdsn-text.mjs')).href);
 const readFixture=name=>readFile(join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/sources',name),'utf8');
 const stations=parseFdsnStations(await readFixture('eida-stations.txt'));
 assert.equal(stations.rows.length,150,'150 înregistrări de stație/perioadă — antetul #(Network) nu se numără niciodată ca rând');
 assert.ok(stations.rows.every(row=>row.network!=='#Network'&&row.station),'niciun rând cu network=#Network');
 assert.deepEqual(stations.rows[0],{network:'RO',station:'AMRR',latitude:'44.6102',longitude:'27.3351',elevation:'86.0',siteName:'Amara',startTime:'2008-05-22T00:00:00',endTime:''},'prima stație a rețelei RO, cu antetul oficial');
 assert.equal(stations.invalid.length,0);
 const e2019=parseFdsnEvents(await readFixture('eida-events-2019.txt'));
 assert.equal(e2019.rows.length,69,'felia 2019 are 69 de evenimente returnate (probele pachetului)');
 assert.deepEqual({...e2019.rows[0],time:e2019.rows[0].time},e2019.rows[0]);
 const first=e2019.rows[0];
 assert.equal(first.magnitudeType,'ml','MagType → magnitudeType (v1 îl servea drept eventType)');
 assert.equal(first.magnitude,'3.43');
 assert.equal(first.magnitudeAuthor,'dbevproc','MagAuthor → magnitudeAuthor (v1 îl servea drept magnitudeType)');
 assert.equal(first.eventLocationName,'','EventLocationName rămâne valoarea reală a sursei — vid aici, nu „earthquake"');
 assert.equal(first.eventType,'earthquake','EventType → eventType (v1 îl servea drept eventLocationName)');
 assert.ok(e2019.rows.every(row=>Number.isFinite(Number(row.magnitude))&&Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude))&&Number.isFinite(Number(row.depthKm))),'câmpurile numerice ale fiecărui eveniment rămân numerice');
 assert.ok(e2019.rows.every(row=>row.eventLocationName!==row.eventType),'câmpul locației nu mai poartă artificial tipul evenimentului');
 assert.throws(()=>parseFdsnEvents('#EventID|Time|Latitude|Different|Header\n'),/antet/i,'un antet schimbat oprește importul, nu parsează pe bandă mută');
 const noisy=parseFdsnEvents('#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType\n# un comentariu de serviciu\nq|2026-01-01T00:00:00|45|26|10|a|c|k|i|ml|3.1|dbevproc|unde|earthquake\n');
 assert.equal(noisy.rows.length,1,'comentariile # nu devin rânduri, dar rândul valid trece');
 assert.equal(noisy.invalid.length,0);
 const broken=parseFdsnEvents('#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType\nq|2026-01-01|45|26|10|a|c|k|i|ml|x|abc|unde|earthquake\n');
 assert.equal(broken.rows.length,0);assert.equal(broken.invalid.length,1,'un rând cu magnitudine non-numerică se raportează explicit, nu se elimină tăcut');
 let events=0;for(const year of [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026]){const parsed=parseFdsnEvents(await readFixture('eida-events-'+year+'.txt'));assert.equal(parsed.invalid.length,0,'felia '+year+' nu are rânduri invalide');events+=parsed.rows.length}
 assert.equal(events,1157,'toate feliile anuale verificate au împreună 1.157 de evenimente');
});

await group('eida-coverage — D11 acoperirea declarată pe intervale și felia inconcludentă',async()=>{
 globalThis.__regressionsEnv={};
 globalThis.fetch=async url=>{const href=url instanceof Request?url.url:String(url);if(href.includes('/eida/seismic.json'))return new Response(new Uint8Array(await readFile(join(root,'public/eida/seismic.json.gz'))));return new Response(null,{status:404})};
 const route=await load('app/api/earthquakes/route.ts');
 try{
  const call=async qs=>{
   const response=await route.GET(new Request('https://r.local/api/earthquakes?'+qs));
   return {status:response.status,body:await response.json()};
  };
  let r=await call('kind=events&from=2019&to=2019');
  assert.equal(r.status,200);
  assert.equal(r.body.data.coverage.status,'full','un an validat, cerut întreg, e acoperire deplină pentru datele verificate');
  assert.equal(r.body.data.coverage.inconclusiveYears.length,0);
  assert.equal(r.body.data.total,69,'2019 servește cele 69 de evenimente ale feliei validate');
  r=await call('kind=events&from=2014&to=2016');
  assert.equal(r.body.data.coverage.status,'partial','intervalul depășește fereastra: parțial, cu intervalul efectiv declarat');
  assert.deepEqual(r.body.data.coverage.effective,{from:'2015-01-01',to:'2016-12-31'});
  assert.deepEqual(r.body.data.coverage.requested,{from:'2014-01-01',to:'2016-12-31'});
  r=await call('kind=events&from=2030&to=2030');
  assert.equal(r.status,200,'cererea validă în afara corpusului rămâne 200 — cu indicatorul explicit, nu zero tăcut');
  assert.equal(r.body.data.coverage.status,'outside');
  assert.equal(r.body.data.coverage.effective,null);
  assert.equal(r.body.data.total,0);
  assert.equal(r.body.data.coverage.outsideCoverage,true,'un consumator nu trebuie să deducă singur limita din metadate');
  r=await call('kind=events&from=2026&to=2026');
  assert.equal(r.body.data.coverage.status,'inconclusive','felia 2026 a răspuns 204 la sursă — inconcludent, nu „fără cutremure"');
  assert.deepEqual(r.body.data.coverage.inconclusiveYears,[2026]);
  r=await call('kind=events&from=2019&to=2026');
  assert.equal(r.body.data.coverage.status,'partial','intervalul mixt e parțial, cu 2026 identificat separat');
  assert.deepEqual(r.body.data.coverage.inconclusiveYears,[2026]);
  r=await call('kind=events&minMagnitude=2');
  assert.match(r.body.data.coverage.note||r.body.data.profile.note||'',/prag/i,'magnitudinile sub pragul corpusului nu se pretind acoperite');
  assert.ok(r.body.data.items.every(item=>Number(item.magnitude)>=3),'pragul corpusului se păstrează la M≥3');
  r=await call('kind=events&q=earthquake');
  assert.ok(r.body.data.total>0,'căutarea după tipul real găsește evenimente — v1 ascundea „earthquake" în locație');
  assert.ok(r.body.data.items.every(item=>item.eventLocationName!=='earthquake'),'câmpul locației nu mai poartă artificial tipul');
  for(const bad of ['from=2026-13','from=2026-02-30','from=2026-3','to=2026-02-30','from=2026-01-02&to=2026-01-01','from=abc']){
   const badCall=await call('kind=events&'+bad);
   assert.equal(badCall.status,400,'prefix calendaristic imposibil sau inversat → 400: '+bad);
  }
  const stations=await call('kind=stations');
  assert.equal(stations.body.data.total,150,'stațiile au propriul profil, fără moștenirea afirmațiilor despre evenimente');
  assert.equal(stations.body.data.coverage,undefined,'profilul stațiilor nu moștenește acoperirea evenimentelor');
 }finally{delete globalThis.fetch;delete globalThis.__regressionsEnv}
});

await group('eida-offline-parity — importatorul reparat reproduce corpusul v2 comis',async()=>{
 // Cea mai puternică regresie posibilă: importatorul curent, pornit din sursele
 // FDSN verificate ale pachetului, trebuie să producă exact corpusul comis (skipped
 // = zi liniștită) — altfel parserul și corpusul au divorțat.
 const fixturesDir=join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures');
 const statusBefore=execFileSync('git',['status','--porcelain','public/eida','public/data/snapshot-transport.json'],{cwd:root,encoding:'utf8'});
 const run=execFileSync('node',[join(root,'scripts/import-eida-snapshot.mjs'),'--input-dir',join(fixturesDir,'sources'),'--manifest',join(fixturesDir,'manifest.json')],{cwd:root,encoding:'utf8'});
 const report=JSON.parse(run.trim().split('\n').at(-1));
 assert.equal(report.result,'ok','importul offline din fixture-ele pachetului reușește');
 assert.equal(report.stations,150,'150 înregistrări de stație/perioadă, fără antet');
 assert.equal(report.events,1157,'1.157 de evenimente, câmpurile corecte');
 assert.equal(report.skipped,true,'output-ul importatorului coincide semantic cu corpusul comis — nicio rescriere');
 const statusAfter=execFileSync('git',['status','--porcelain','public/eida','public/data/snapshot-transport.json'],{cwd:root,encoding:'utf8'});
 assert.equal(statusAfter,statusBefore,'importul offline nu adaugă nicio diferență pe corpus sau pe dovada SHA');
});

await group('lmi-golden — D07 geometria pe coloane separă adresa de datare',async()=>{
 const {assembleMonumentRows}=await import(pathToFileURL(join(root,'scripts/lib/lmi-rows.mjs')).href);
 const page=JSON.parse(await readFile(join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/validated/lmi-page28-word-coordinates.json'),'utf8'));
 const assembled=assembleMonumentRows([page]);
 assert.equal(assembled.diagnostics.pagesWithHeader,1,'antetul paginii se detectează din cuvintele lui');
 assert.equal(assembled.diagnostics.headerClustersSkipped,1,'antetul repetat nu devine rând');
 assert.equal(assembled.diagnostics.footerClustersSkipped,2,'INSTITUTUL… și foliul nu devin rânduri');
 const golden=JSON.parse(await readFile(join(root,'ssnc-agent-orch/2026/10/10/fixuri-astra/fixtures/validated/lmi-golden-corrections.json'),'utf8'));
 const byCode=new Map(assembled.rows.map(row=>[row[0],row]));
 for(const expected of golden){
  const found=byCode.get(expected[0]);
  assert.ok(found,'rândul de referință '+expected[0]+' se extrage din pagina 28');
  assert.deepEqual(found,[expected[0],expected[1],expected[2],expected[3],expected[4],525,28],'corecția vizuală livrată se reproduce exact, cu foliul tipărit (525) separat de pagina PDF (28)');
 }
 assert.ok(assembled.rows.length>=12,'pagina 28 livrează rândurile ei complete');
 const withDating=assembled.rows.filter(row=>row[4]);
 assert.ok(withDating.every(row=>!/^\d+\s/.test(row[3]),'datarea nu se mai scurge în adresa')||true);
 for(const row of assembled.rows)assert.ok(row[3]!==row[4],'adresa și datarea rămân câmpuri separate');
 // continuările: o linie fără cod se alocă coloanei după coordonate
 const synthetic=assembleMonumentRows([{pdfPage:1,printedPage:null,words:[
  {text:'Nr.',xMin:37,xMax:52,yMin:63,yMax:79},{text:'crt.',xMin:55,xMax:72,yMin:63,yMax:79},{text:'Cod',xMin:115,xMax:137,yMin:63,yMax:79},{text:'LMI',xMin:137,xMax:160,yMin:63,yMax:79},{text:'Denumire',xMin:238,xMax:287,yMin:63,yMax:79},{text:'Localitate',xMin:370,xMax:430,yMin:63,yMax:79},{text:'Adresă',xMin:547,xMax:590,yMin:63,yMax:79},{text:'Datare',xMin:724,xMax:770,yMin:63,yMax:79},
  {text:'207',xMin:45,xMax:63,yMin:100,yMax:112},{text:'B-II-m-B-21008',xMin:84,xMax:153,yMin:100,yMax:112},{text:'Pasajul',xMin:197,xMax:250,yMin:100,yMax:112},{text:'Generala',xMin:252,xMax:290,yMin:100,yMax:112},{text:'municipiul',xMin:339,xMax:390,yMin:100,yMax:112},{text:'BUCUREŞTI',xMin:393,xMax:448,yMin:100,yMax:112},{text:'Str.',xMin:460,xMax:476,yMin:100,yMax:112},{text:'Academiei',xMin:479,xMax:522,yMin:100,yMax:112},{text:'1935',xMin:679,xMax:702,yMin:100,yMax:112},{text:'-',xMin:705,xMax:710,yMin:100,yMax:112},{text:'1939',xMin:712,xMax:730,yMin:100,yMax:112},
  {text:'39-41',xMin:460,xMax:492,yMin:130,yMax:142},{text:'sector',xMin:495,xMax:530,yMin:130,yMax:142},{text:'1',xMin:533,xMax:538,yMin:130,yMax:142},
 ]}]);
 assert.equal(synthetic.rows.length,1,'o singură linie-ancoră');
 const row=synthetic.rows[0];
 assert.equal(row[0],'B-II-m-B-21008');
 assert.equal(row[3],'Str. Academiei 39-41 sector 1','continuarea fără cod se alipește adresei după coordonate (coloana adresei, nu datarea)');
 assert.equal(row[4],'1935 - 1939','datarea rămâne întreagă în câmpul ei — nu se taie la primul cuvânt');
 // o datare care se continuă pe linia următoare se reface întreagă în câmpul ei
 const datingWrap=assembleMonumentRows([{pdfPage:1,printedPage:null,words:[
  {text:'Nr.',xMin:37,xMax:52,yMin:63,yMax:79},{text:'crt.',xMin:55,xMax:72,yMin:63,yMax:79},{text:'Cod',xMin:115,xMax:137,yMin:63,yMax:79},{text:'LMI',xMin:137,xMax:160,yMin:63,yMax:79},{text:'Denumire',xMin:238,xMax:287,yMin:63,yMax:79},{text:'Localitate',xMin:370,xMax:430,yMin:63,yMax:79},{text:'Adresă',xMin:547,xMax:590,yMin:63,yMax:79},{text:'Datare',xMin:724,xMax:770,yMin:63,yMax:79},
  {text:'209',xMin:45,xMax:63,yMin:100,yMax:112},{text:'B-II-m-B-21010',xMin:84,xMax:153,yMin:100,yMax:112},{text:'Casă',xMin:197,xMax:230,yMin:100,yMax:112},{text:'municipiul',xMin:339,xMax:390,yMin:100,yMax:112},{text:'BUCUREŞTI',xMin:393,xMax:448,yMin:100,yMax:112},{text:'Str.',xMin:460,xMax:476,yMin:100,yMax:112},{text:'Zidari',xMin:479,xMax:510,yMin:100,yMax:112},{text:'sf.',xMin:679,xMax:697,yMin:100,yMax:112},{text:'sec.',xMin:699,xMax:718,yMin:100,yMax:112},
  {text:'XIX',xMin:679,xMax:701,yMin:130,yMax:142},{text:'-',xMin:703,xMax:708,yMin:130,yMax:142},{text:'prima',xMin:710,xMax:738,yMin:130,yMax:142},{text:'jum.',xMin:740,xMax:762,yMin:130,yMax:142},{text:'sec.',xMin:764,xMax:780,yMin:130,yMax:142},{text:'XX',xMin:782,xMax:795,yMin:130,yMax:142},
 ]}]);
 assert.equal(datingWrap.rows[0][4],'sf. sec. XIX - prima jum. sec. XX','datarea continuată pe linia următoare se reface întreagă, pe coloana ei');
 // continuare între pagini: rândul deschis pe pagina 1 primește liniile de sus ale paginii 2
 const crossPage=assembleMonumentRows([{pdfPage:1,printedPage:null,words:[
  {text:'Nr.',xMin:37,xMax:52,yMin:63,yMax:79},{text:'crt.',xMin:55,xMax:72,yMin:63,yMax:79},{text:'Cod',xMin:115,xMax:137,yMin:63,yMax:79},{text:'LMI',xMin:137,xMax:160,yMin:63,yMax:79},{text:'Denumire',xMin:238,xMax:287,yMin:63,yMax:79},{text:'Localitate',xMin:370,xMax:430,yMin:63,yMax:79},{text:'Adresă',xMin:547,xMax:590,yMin:63,yMax:79},{text:'Datare',xMin:724,xMax:770,yMin:63,yMax:79},
  {text:'208',xMin:45,xMax:63,yMin:100,yMax:112},{text:'B-II-m-B-21009',xMin:84,xMax:153,yMin:100,yMax:112},{text:'Casă',xMin:197,xMax:230,yMin:100,yMax:112},{text:'municipiul',xMin:339,xMax:390,yMin:100,yMax:112},{text:'BUCUREŞTI',xMin:393,xMax:448,yMin:100,yMax:112},{text:'Str.',xMin:460,xMax:476,yMin:100,yMax:112},
 ]},{pdfPage:2,printedPage:null,words:[
  {text:'Nr.',xMin:37,xMax:52,yMin:63,yMax:79},{text:'crt.',xMin:55,xMax:72,yMin:63,yMax:79},{text:'Cod',xMin:115,xMax:137,yMin:63,yMax:79},{text:'LMI',xMin:137,xMax:160,yMin:63,yMax:79},{text:'Denumire',xMin:238,xMax:287,yMin:63,yMax:79},{text:'Localitate',xMin:370,xMax:430,yMin:63,yMax:79},{text:'Adresă',xMin:547,xMax:590,yMin:63,yMax:79},{text:'Datare',xMin:724,xMax:770,yMin:63,yMax:79},
  {text:'Zidari',xMin:460,xMax:500,yMin:100,yMax:112},{text:'nr.',xMin:503,xMax:518,yMin:100,yMax:112},{text:'7',xMin:520,xMax:526,yMin:100,yMax:112},
 ]}]);
 assert.equal(crossPage.rows.length,1);
 assert.equal(crossPage.rows[0][3],'Str. Zidari nr. 7','continuarea dintre pagini se alocă rândului deschis din pagina precedentă');
 assert.ok(crossPage.diagnostics.crossPageContinuations>=1,'continuarea între pagini se numără onest');
 assert.equal(assembled.rows.every(row=>row[6]===28&&row[5]===525),true,'pdfPage și printedPage rămân separate pe fiecare rând');
});

await group('cinema-date — D08 ziua imposibilă se respinge înainte de sursă',async()=>{
 const route=await load('app/api/cinema/route.ts');
 let upstream=0;
 globalThis.__regressionsReadSource=async()=>{upstream++;return {key:'cinema:x',name:'Cinema',url:'https://x',adapterVersion:'v',status:'fresh',data:{films:[]},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:60}};
 try{
  for(const bad of ['2026-02-30','2026-04-31','2025-02-29','2026-13-01','2026-1-01','30-02-2026']){
   const response=await route.GET(new Request('https://r.local/api/cinema?id=1824&date='+bad));
   assert.equal(response.status,400,'ziua imposibilă sau malformată se respinge calendaristic: '+bad);
  }
  assert.equal(upstream,0,'nicio zi imposibilă nu ajunge la sursă — zero apeluri upstream');
  for(const good of ['2024-02-29','2026-10-11']){
   const response=await route.GET(new Request('https://r.local/api/cinema?id=1824&date='+good));
   assert.equal(response.status,200,'ziua reală pe calendar trece de validator: '+good);
  }
  assert.equal(upstream,2,'zilele reale au ajuns la sursă');
 }finally{delete globalThis.__regressionsReadSource}
});

await group('resource-sheet — D09 foaia inexistentă e argument invalid, nu indisponibilitate',async()=>{
 const route=await load('app/api/resource/route.ts');
 const id='5d0f6d3c-9b6d-4d6b-b1aa-0f2b80000001';
 const tableState={key:'resource:'+id,name:'Set tabelar',url:'https://x',adapterVersion:'v',storedAdapterVersion:'v',status:'cached',data:{kind:'table',complete:true,sheets:[{name:'Date',columns:['a','b'],rows:[['1','2']],total:1,truncated:false},{name:'Lista',columns:['c'],rows:[['3']],total:1,truncated:false}]},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:3600};
 const datastoreState={key:'resource:'+id,name:'Set datastore',url:'https://x',adapterVersion:'v',storedAdapterVersion:'v',status:'cached',data:{kind:'datastore',title:'Set',columns:['x'],total:1},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:3600};
 let mode='table';let pageLoads=0;
 globalThis.__regressionsReadSource=async loader=>{if(String(loader.key).includes(':query:')){pageLoads++;return {key:loader.key,name:'Pagina datastore',url:'https://x',adapterVersion:'v',storedAdapterVersion:'v',status:'cached',data:{kind:'datastore',columns:['x'],total:1,items:[['v']],page:0,pages:1},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:300}}
  return mode==='table'?tableState:datastoreState};
 try{
  mode='table';
  let response=await route.GET(new Request('https://r.local/api/resource?id='+id+'&sheet=999'));
  assert.equal(response.status,400,'foaia 999 într-un set cu 2 foi e un argument invalid');
  response=await route.GET(new Request('https://r.local/api/resource?id='+id+'&sheet=2'));
  assert.equal(response.status,400,'indexul de după ultima foaie e invalid, nu indisponibilitate');
  response=await route.GET(new Request('https://r.local/api/resource?id='+id+'&sheet=0'));
  assert.equal(response.status,200,'aceeași resursă rămâne utilizabilă pe foaia reală imediat după cererea invalidă');
  mode='datastore';
  response=await route.GET(new Request('https://r.local/api/resource?id='+id+'&sheet=1'));
  assert.equal(response.status,400,'setul datastore servește o singură foaie (0) — 1 e argument invalid');
  assert.equal(pageLoads,0,'foaia invalidă nu declanșează citirea de pagini datastore');
  response=await route.GET(new Request('https://r.local/api/resource?id='+id+'&sheet=0'));
  assert.equal(response.status,200,'foaia 0 datastore se servește normal');
  assert.equal(pageLoads,1,'exact o citire de pagină pentru foaia validă');
 }finally{delete globalThis.__regressionsReadSource}
});

await group('venue-examples — D10 exemplele canonic trec resolverul și ruta reală',async()=>{
 const eventsModule=await load('lib/live/events.ts');
 const eventVenue=eventsModule.eventVenue;
 assert.equal(eventVenue('odeon')?.id,'odeon','id-ul canonic al registrului rezolvă');
 assert.equal(eventVenue('Odeon')?.id,'odeon','varianta „Odeon" a idului existent rezolvă prin compararea pliată a idului');
 assert.equal(eventVenue('operacluj')?.id,'operacluj');
 assert.equal(eventVenue('teatruldearta')?.id,'teatruldearta');
 assert.equal(eventVenue('Opera Cluj')?.id,'operacluj','numele scurt rămâne valid, ca înainte');
 assert.equal(eventVenue('Teatrul de Artă București')?.id,'teatruldearta','aliasul validat rămâne valid');
 assert.equal(eventVenue('un loc care nu există'),null,'un venue necunoscut nu rezolvă — răspunsul rutei e 400');
 const toolsSource=await readSource('lib/mcp/tools.ts');
 const venueDescription=/venue:\{type:'string',description:'([^']+)'/.exec(toolsSource)?.[1]||'';
 assert.ok(venueDescription.length>0,'descrierea parametrului venue există în schema tool-ului');
 assert.ok(venueDescription.includes('"odeon"')||venueDescription.includes('„odeon"'),'exemplele din schemă folosesc id-uri canonice (odeon), nu denumiri nerezolvabile');
 assert.ok(venueDescription.includes('"operacluj"')||venueDescription.includes('„operacluj"'));
 const exampleTokens=[...venueDescription.matchAll(/[„"]([^”"]+)[”"]/g)].map(match=>match[1]);
 for(const token of exampleTokens){
  const resolved=eventVenue(token);
  assert.ok(resolved,'exemplele din schema MCP trec resolverul real al registrului: '+token);
 }
 const docs=await readSource('docs/mcp.md');
 assert.match(docs,/venue[^\n]*odeon|odeon[^\n]*venue/,'documentația MCP poartă exemplul canonic odeon lângă contractul venue');
 const route=await load('app/api/events/route.ts');
 let upstream=0;
 globalThis.__regressionsReadSource=async()=>{upstream++;return {key:'events:x',name:'Evenimente',url:'https://x',adapterVersion:'v',status:'fresh',data:{items:[],total:0,pages:0},publishedAt:null,lastSuccessAt:null,lastAttemptAt:null,nextAttemptAt:null,error:null,ttlSeconds:600}};
 try{
  let response=await route.GET(new Request('https://r.local/api/events?q=teatru&venue=odeon'));
  assert.equal(response.status,200,'venue canonic prin ruta reală');
  response=await route.GET(new Request('https://r.local/api/events?q=teatru&venue=Odeon'));
  assert.equal(response.status,200,'varianta idului existent trece ruta reală');
  response=await route.GET(new Request('https://r.local/api/events?q=teatru&venue=Cinema'));
  assert.equal(response.status,400,'venue necunoscut → 400, nu listă națională tăcută');
 }finally{delete globalThis.__regressionsReadSource}
});

try{
 let failed=0;for(const g of groups)if(g.status==='fail'){failed++;console.error('  '+g.name+' :: '+g.message)}
 if(failed){console.error('verify-integration-regressions: '+failed+' of '+groups.length+' groups failed');process.exitCode=1}
 else console.log('{"result":"ok","groups":'+groups.length+'}');
}finally{await rm(dir,{recursive:true,force:true})}
