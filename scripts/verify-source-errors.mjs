import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import ts from 'typescript';

// Modul --live face exact un singur acces la ruta locală și unul la ruta workerului publicat
// (infrastructura noastră, în afara bugetului de surse) per familie și, doar pentru stările de
// eroare ale sursei, maximum două verificări directe ale aceleiași adrese prin același contract
// de încărcare; familiile servite corect nu se reinteroghează. Familiile preclasificate nu
// cheltuiesc acces direct când tiparul se confirmă. AFIR rămâne preclasificată ca egress blocat
// la nivelul conectorului; tura GitHub Actions „afir-refresh” reîmprospătează copia D1 din
// exterior, deci ambele stări legitime sunt informaționale: legătură publicată curată (relaia
// e la zi — verdict ok, fără ramură declanșată) sau plic de eroare cu copia veche (relaia a
// îmbătrânit peste TTL și accesul din worker a lovit egress-ul blocat — clasa cunoscută).
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),live=process.argv.includes('--live'),base=process.env.AFLIVRA_VERIFY_SOURCE_BASE||'http://127.0.0.1:5173';
const deployedArg=process.env.AFLIVRA_VERIFY_DEPLOYED_BASE,deployedBase=deployedArg===undefined?'https://aflivra.brebu.workers.dev':deployedArg;
const todayIso=()=>new Date().toISOString().slice(0,10);
const temp=await mkdtemp(join(tmpdir(),'aflivra-source-errors-')),sqlite=live?null:new DatabaseSync(':memory:');
if(!live)sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db=live?null:{prepare(sql){let args=[];const wrapper={bind(...values){for(const v of values)if(typeof v==='string'&&Buffer.byteLength(v)>2_000_000)throw Error('D1 row bound exceeded');args=values;return wrapper},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}};return wrapper},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results}};
// Legătura ASSETS oglindește workerul publicat: ruta catalogului citește inventarul
// clasificat prin bindingul de active statice, nu prin fetch global (sub mock).
const assetsFetch=live?null:async request=>{const path=new URL(request.url).pathname;
 if(path.startsWith('/trains/')){if(globalThis.__aflivraAssetFault==='trains')return new Response('{"items":[{"code":1,"name":"corupt', {status:200});try{return new Response(await readFile(join(root,'public',path)))}catch{return new Response(null,{status:404})}}
 return path==='/catalog/index.json.gz'?new Response(await readFile(join(root,'public/catalog/index.json.gz'))):new Response(null,{status:404})};
globalThis.__aflivraTestEnv=live?{}:{DB:db,...(assetsFetch?{ASSETS:{fetch:assetsFetch}}:{})};
globalThis.__aflivraResourceCopies=JSON.parse(await readFile(join(root,'lib/live/resource-seed.json'),'utf8'));
const escapes=[];const recordEscape=reason=>escapes.push(String(reason&&reason.stack||reason));
process.on('unhandledRejection',recordEscape);process.on('uncaughtExceptionMonitor',recordEscape);
try{
const httpRetry=pathToFileURL(join(root,'lib/http-retry.mjs')).href,fflateUrl=pathToFileURL(require.resolve('fflate')).href;
for(const name of ['court-history','court-query','location-context','geographic-scope','tabular-geography','transit-location','weather-location','snapshot-transport']){
 let source=await readFile(join(root,'lib',name+'.ts'),'utf8');
 for(const [binding,path] of [['countyLookup','public/data/locality-counties.json'],['urbanLocalities','public/data/geographic-localities.json'],['institutions','public/courts/institutions.json'],['coverage','public/transit/coverage.json']])source=source.replace('import '+binding+" from '@/"+path+"';",'const '+binding+'='+await readFile(join(root,path),'utf8')+';');
 source=source.replace(/from '\.\/live\//g,"from './");
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replace("from 'fflate'","from '"+fflateUrl+"'").replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
 await writeFile(join(temp,name+'.mjs'),output);
}
const liveSeeds=await readFile(join(root,'lib/live/seed.json'),'utf8');
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','catalog-metadata','adapters','feeds','request-context','resource-copy','cache','weather-gate','forecast','weather','transport','transit-realtime','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge','lawyers','directories','justice','trains','resources','events','cinema','stories']){
 let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
 source=source
  .replace("from '../court-history'","from './court-history'").replace("from '../court-query'","from './court-query'")
  .replace("from '../geographic-scope'","from './geographic-scope'").replace("from '../tabular-geography'","from './tabular-geography'")
  .replace("from '../snapshot-transport'","from './snapshot-transport'")
  .replace("from '../location-context'","from './location-context'")
  .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
  .replace("import baseSeeds from './seed.json';",'const baseSeeds='+liveSeeds+';')
  .replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];')
  .replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;')
  .replace("import confirmed from '@/public/courts/confirmed-references.json';",'const confirmed='+await readFile(join(root,'public/courts/confirmed-references.json'),'utf8')+';')
  .replace("import courtInstitutions from '@/public/courts/institutions.json';",'const courtInstitutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';')
  .replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';')
  .replace("import cinemaCatalog from '@/public/cinema/cinemas.json';",'const cinemaCatalog='+await readFile(join(root,'public/cinema/cinemas.json'),'utf8')+';')
  .replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';')
  .replace("import proofs from '@/public/data/snapshot-transport.json';",'const proofs='+await readFile(join(root,'public/data/snapshot-transport.json'),'utf8')+';');
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace("from 'fflate'","from '"+fflateUrl+"'");output=output.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");for(const pkg of ['xlsx','gtfs-realtime-bindings'])output=output.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
 await writeFile(join(temp,name+'.mjs'),output);
}
const adapters=await import(pathToFileURL(join(temp,'adapters.mjs'))),weatherModule=await import(pathToFileURL(join(temp,'weather.mjs'))),legalModule=await import(pathToFileURL(join(temp,'legal.mjs'))),feedsModule=await import(pathToFileURL(join(temp,'feeds.mjs'))),transportModule=await import(pathToFileURL(join(temp,'transport.mjs'))),forecastModule=await import(pathToFileURL(join(temp,'forecast.mjs'))),directoriesModule=await import(pathToFileURL(join(temp,'directories.mjs'))),lawyersModule=await import(pathToFileURL(join(temp,'lawyers.mjs'))),eventsModule=await import(pathToFileURL(join(temp,'events.mjs'))),cinemaModule=await import(pathToFileURL(join(temp,'cinema.mjs'))),storiesModule=await import(pathToFileURL(join(temp,'stories.mjs'))),realtimeModule=await import(pathToFileURL(join(temp,'transit-realtime.mjs'))),justiceModule=await import(pathToFileURL(join(temp,'justice.mjs'))),trainsModule=await import(pathToFileURL(join(temp,'trains.mjs')));
const feedHosts=Object.entries(feedsModule.feedConfigs).map(([key])=>new URL(feedsModule.feedConfigs[key].url).host);
const lawQuery={title:'CODUL CIVIL',text:'',number:'',year:'',page:0,full:false};
const families=[
 {family:'weather/open-meteo',routeName:'weather',route:'/api/weather?lat=44.43&lon=26.1',host:'api.open-meteo.com',allowed:['api.open-meteo.com'],key:()=>weatherModule.forecastLoader(44.43,26.1).key,loader:()=>weatherModule.forecastLoader(44.43,26.1)},
 {family:'company/anaf',routeName:'company',route:'/api/company?cui=427282',host:'webservicesp.anaf.ro',allowed:['webservicesp.anaf.ro','query.wikidata.org'],key:()=>adapters.companyLoader('427282').key,loader:()=>adapters.companyLoader('427282')},
 {family:'courts/portal.just',routeName:'legal',route:'/api/legal',method:'POST',body:{kind:'court',number:'1/2/2026'},host:'portalquery.just.ro',allowed:['portalquery.just.ro'],key:()=>legalModule.courtLoader({number:'1/2/2026',name:'',subject:'',institution:'',from:'',to:''}).key,loader:()=>legalModule.courtLoader({number:'1/2/2026',name:'',subject:'',institution:'',from:'',to:''})},
 {family:'feeds/stiri',routeName:'domain',route:'/api/domain?kind=stiri',host:new URL(feedsModule.feedConfigs.stiri.url).host,allowed:feedHosts,key:()=>feedsModule.feedLoader('stiri').key,loader:()=>feedsModule.feedLoader('stiri')},
 {family:'catalog/ckan',routeName:'catalog',route:'/api/catalog',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>adapters.catalogLoader().key,loader:()=>adapters.catalogLoader()},
 {family:'transport/tpbi',routeName:'transport',route:'/api/transport',host:'gtfs.tpbi.ro',allowed:['gtfs.tpbi.ro'],key:()=>transportModule.transportLoader.key,loader:()=>transportModule.transportLoader},
 {family:'directory/schools',routeName:'directory',route:'/api/directory?kind=schools',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>directoriesModule.directoryLoader('schools','',0).key,loader:()=>directoriesModule.directoryLoader('schools','',0)},
 {family:'directory/health',routeName:'directory',route:'/api/directory?kind=health',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>directoriesModule.directoryLoader('health').key,loader:()=>directoriesModule.directoryLoader('health')},
 {family:'directory/pharmacies',routeName:'directory',route:'/api/directory?kind=pharmacies',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>directoriesModule.directoryLoader('pharmacies').key,loader:()=>directoriesModule.directoryLoader('pharmacies')},
 {family:'directory/hospitals',routeName:'directory',route:'/api/directory?kind=hospitals',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>directoriesModule.directoryLoader('hospitals').key,loader:()=>directoriesModule.directoryLoader('hospitals')},
 {family:'localities/siruta',routeName:'localities',route:'/api/localities',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>directoriesModule.sirutaLoader.key,loader:()=>directoriesModule.sirutaLoader},
 {family:'lawyers/ifep',routeName:'lawyers',route:'/api/lawyers',host:'www.ifep.ro',allowed:['www.ifep.ro'],key:()=>lawyersModule.lawyerLoader('',0,'recent').key,loader:()=>lawyersModule.lawyerLoader('',0,'recent')},
 {family:'legal/law',routeName:'legal',route:'/api/legal',method:'POST',body:{kind:'law',title:'CODUL CIVIL'},host:'legislatie.just.ro',allowed:['legislatie.just.ro'],key:()=>legalModule.lawLoader(lawQuery).key,loader:()=>legalModule.lawLoader(lawQuery)},
 {family:'feeds/agricultura',routeName:'domain',route:'/api/domain?kind=agricultura',host:'www.afir.ro',allowed:['www.afir.ro'],known:'source-blocks-egress',key:()=>feedsModule.afirLoader.key,loader:()=>feedsModule.afirLoader},
 {family:'feeds/filme',routeName:'domain',route:'/api/domain?kind=filme',host:'query.wikidata.org',allowed:['query.wikidata.org'],key:()=>feedsModule.filmsLoader.key,loader:()=>feedsModule.filmsLoader},
 {family:'events/odeon',routeName:'events',route:'/api/events',host:'teatrul-odeon.ro',allowed:['teatrul-odeon.ro'],key:()=>eventsModule.odeonLoader.key,loader:()=>eventsModule.odeonLoader},
 {family:'cinema/cinemacity',routeName:'cinema',route:'/api/cinema?id=1824&date='+todayIso(),host:'www.cinemacity.ro',allowed:['www.cinemacity.ro'],key:()=>cinemaModule.cinemaLoader('1824',todayIso()).key,loader:()=>cinemaModule.cinemaLoader('1824',todayIso())},
 {family:'stories/wikisource',routeName:'story',route:'/api/story?id=29611',host:'ro.wikisource.org',allowed:['ro.wikisource.org'],key:()=>storiesModule.storyLoader('29611').key,loader:()=>storiesModule.storyLoader('29611')},
 {family:'transport/realtime',routeName:'transport-live',route:'/api/transport-live?kind=vehicles',host:'gtfs.tpbi.ro',allowed:['gtfs.tpbi.ro'],key:()=>realtimeModule.realtimeLoader('vehicles').key,loader:()=>realtimeModule.realtimeLoader('vehicles')},
 {family:'justice/notari',routeName:'notaries',kind:'notari',route:'/api/notaries',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>justiceModule.justiceLoader('notari').key,loader:()=>justiceModule.justiceLoader('notari')},
 {family:'justice/experti-judiciari',routeName:'experts',kind:'experti-judiciari',route:'/api/experts?kind=experti-judiciari',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>justiceModule.justiceLoader('experti-judiciari').key,loader:()=>justiceModule.justiceLoader('experti-judiciari')},
 {family:'justice/experti-tehnici',routeName:'experts',kind:'experti-tehnici',route:'/api/experts?kind=experti-tehnici',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>justiceModule.justiceLoader('experti-tehnici').key,loader:()=>justiceModule.justiceLoader('experti-tehnici')},
 {family:'justice/traducatori',routeName:'experts',kind:'traducatori',route:'/api/experts?kind=traducatori',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>justiceModule.justiceLoader('traducatori').key,loader:()=>justiceModule.justiceLoader('traducatori')},
 {family:'transport/trains',routeName:'trains',kind:'trains',route:'/api/trains?q=bra%C8%99ov',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>'trains:stations',loader:()=>({key:'trains:stations',name:'Informatică Feroviară · mersul trenurilor',url:'https://data.gov.ro/',version:'trains.planned.v1',ttl:86400,load:async()=>{throw Error('corpus-only')}})}];
if(live){
 let routes=null;
 try{routes=await Promise.all(families.map(async family=>[family.family,await (async()=>{const init=family.method==='POST'?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(family.body)}:{};return fetch(base+family.route,{...init,signal:AbortSignal.timeout(60000)})})()]))}catch(error){console.error('Serverul local de dezvoltare nu răspunde la '+base+' — pornit cu „npm start” înainte de --live. Detaliu: '+error.message);process.exitCode=2}
 if(routes!==null&&routes.every(([,response])=>response!==null)){
  const verdicts=[];let ourBug=false;
  const initFor=family=>family.method==='POST'?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(family.body)}:{};
  const readStates=async(family,response)=>{
   let payload=null;try{payload=await response.json()}catch{}
   const states=[];const push=state=>{if(state&&String(state.error||'').length)states.push({key:state.key||family.family,status:state.status,error:String(state.error),lastAttemptAt:state.lastAttemptAt||null,nextAttemptAt:state.nextAttemptAt||null})};
   push(payload);
   if(family.family==='company/anaf')for(const state of payload?.data?.sources||[])if(String(state?.key||'').startsWith('company:'))push(state);
   if(family.family==='feeds/stiri')for(const state of payload?.data?.sources||[])if(state?.key==='feed:stiri')push(state);
   const sampled=family.family==='feeds/stiri'?{sampledSource:'feed:stiri',allFeedStates:(payload?.data?.sources||[]).map(state=>({key:state.key,status:state.status,error:String(state.error||'').slice(0,200)}))}:null;
   const surfaced=response.status>=500?[{key:family.family,status:'HTTP '+response.status,error:'Ruta a răspuns cu HTTP '+response.status+'.',lastAttemptAt:null,nextAttemptAt:null}]:states;
   return{payload,surfaced,sampled}};
  const probeDirect=async(family)=>{let loads=0,loaded=null,failed=null;
   while(loads<2&&!loaded){loads++;try{const result=await family.loader().load();if(result.data!==null&&result.data!==undefined)loaded=result;else failed=result}catch(error){failed=error;if(!/timeout|connection|dns/i.test(String(error?.diagnostic?.category||error?.message||'')))break}}
   return{loads,outcome:loaded?'ok':'failed',category:failed?.diagnostic?.category||null,httpStatus:failed?.diagnostic?.httpStatus||null,message:String(failed?.message||'').slice(0,200)}};
  for(const [familyName,response] of routes){
   const family=families.find(entry=>entry.family===familyName);const dev=await readStates(family,response);
   let deployed=null;
   if(deployedBase==='')deployed={skipped:'legătura către workerul publicat este oprită prin AFLIVRA_VERIFY_DEPLOYED_BASE gol'};
   else{try{const deployedResponse=await fetch(deployedBase+family.route,{...initFor(family),signal:AbortSignal.timeout(60000)});const parsed=await readStates(family,deployedResponse);deployed={http:deployedResponse.status,status:parsed.payload?.status??null,error:String(parsed.payload?.error||'').slice(0,200),surfaced:parsed.surfaced}}catch(error){deployed={unreachable:error instanceof Error?error.message:String(error)}}}
   const budget=dev.surfaced.some(state=>/Limit[ăa] temporar/.test(state.error));
   let verdict='ok',direct=null;const notes=[];
   if(dev.surfaced.length&&budget)verdict='budget';
   else if(dev.surfaced.length){
    direct=await probeDirect(family);
    if(direct.outcome!=='ok')verdict='source-down';
    else{
     const pauseLike=dev.surfaced.some(state=>/429|pauz[ăa]/i.test(state.error))||dev.surfaced.some(state=>/tempor|indisponibil|Structura|structur/i.test(state.error)&&(state.status==='stale'||dev.payload?.data));
     verdict=pauseLike?'recovered':'our-bug';
     if(verdict==='our-bug')ourBug=true;
    }
   }else if(deployed&&Number(deployed.http)>=500){verdict='our-bug';ourBug=true;notes.push('workerul publicat răspunde HTTP '+deployed.http+' fără degradare în-band')}
   else if(deployed&&Array.isArray(deployed.surfaced)&&deployed.surfaced.length){
     if(family.known&&deployed.surfaced.some(state=>/HTTP 5\d\d|429/i.test(state.error))){verdict=family.known;notes.push('familie preclasificată — sursa blochează egress-ul Workers (stabilit la campania de probe 2026-10-06), iar tura de relaie GitHub Actions reîmprospătează copia D1 din exterior; fără acces direct cheltuit')}
    else{direct=await probeDirect(family);verdict=direct.outcome==='ok'?'source-blocks-egress':'source-down'}
   }else if(deployed&&deployed.unreachable)notes.push('workerul publicat nu a răspuns ('+deployed.unreachable+') — clasificare pe dev și sursă directă');
   verdicts.push({family:familyName,route:family.route,app:{http:response.status,status:dev.payload?.status??null,error:String(dev.payload?.error||'').slice(0,200),lastAttemptAt:dev.payload?.lastAttemptAt??null,nextAttemptAt:dev.payload?.nextAttemptAt??null,surfaced:dev.surfaced,...(dev.sampled?{sampled:{sampledSource:dev.sampled.sampledSource,allFeedStates:dev.sampled.allFeedStates}}:{})},deployed,direct,verdict,...(notes.length?{notes}:{})});
  }
  for(const verdict of verdicts)console.log('['+verdict.family+'] verdict: '+verdict.verdict+' — app HTTP '+verdict.app.http+', stare '+(verdict.app.status||'–')+', eroare: „'+(verdict.app.error||'niciuna')+'”'+(verdict.deployed&&verdict.deployed.http?', worker publicat HTTP '+verdict.deployed.http+', stare '+(verdict.deployed.status||'–')+', eroare: „'+(verdict.deployed.error||'niciuna')+'”':'')+(verdict.direct?' → sursă directă: '+verdict.direct.outcome+(verdict.direct.httpStatus?' (HTTP '+verdict.direct.httpStatus+')':'')+' în '+verdict.direct.loads+' acces(e)':' → fără reinterogarea sursei'));
  console.log(JSON.stringify({result:ourBug?'our-bug':'ok',mode:'--live',base,deployedBase:deployedBase===''?'oprită prin configurație':deployedBase,families:verdicts.length,verdicts}));
  if(ourBug){console.error('Verdict our-bug: sursa răspunde corect direct sau workerul nostru publicat eșuează, dar ruta raportează eroarea sursei. Diferențele de mai sus sunt bug-ul nostru.');process.exitCode=1}
 }
}else{
 for(const [name,file] of [['weather','app/api/weather/route.ts'],['company','app/api/company/route.ts'],['legal','app/api/legal/route.ts'],['domain','app/api/domain/route.ts'],['catalog','app/api/catalog/route.ts'],['transport','app/api/transport/route.ts'],['directory','app/api/directory/route.ts'],['lawyers','app/api/lawyers/route.ts'],['localities','app/api/localities/route.ts'],['events','app/api/events/route.ts'],['cinema','app/api/cinema/route.ts'],['story','app/api/story/route.ts'],['transport-live','app/api/transport-live/route.ts'],['notaries','app/api/notaries/route.ts'],['experts','app/api/experts/route.ts'],['trains','app/api/trains/route.ts']]){
  let source=await readFile(join(root,file),'utf8');
  source=source
   .replace("import network from '@/public/transit/network.json';",'const network='+await readFile(join(root,'public/transit/network.json'),'utf8')+';')
   .replace("import transit from '@/public/transit/manifest.json';",'const transit='+await readFile(join(root,'public/transit/manifest.json'),'utf8')+';')
   .replace("import manifest from '@/public/trains/manifest.json';",'const manifest='+await readFile(join(root,'public/trains/manifest.json'),'utf8')+';')
   .replace("import proofs from '@/public/data/snapshot-transport.json';",'const proofs='+await readFile(join(root,'public/data/snapshot-transport.json'),'utf8')+';')
   .replace("import institutions from '@/public/courts/institutions.json';",'const institutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';')
   .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
   .replaceAll('@/lib/live/','./').replaceAll('@/lib/','./');
  let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  await writeFile(join(temp,'route-'+name+'.mjs'),output);
 }
 const routes={};for(const name of ['weather','company','legal','domain','catalog','transport','directory','lawyers','localities','events','cinema','story','transport-live','notaries','experts','trains'])routes[name]=await import(pathToFileURL(join(temp,'route-'+name+'.mjs')));
 const {zipSync,strToU8}=require('fflate');
 const gtfsBytes=()=>{const rows=(head,list)=>head+'\n'+list.join('\n')+'\n';const stops=Array.from({length:12},(_,i)=>'S'+i+',Stația de verificare '+i+',Descriere publică,'+(44.40+i/100)+','+(26.10+i/100)),routeRows=Array.from({length:12},(_,i)=>'R'+i+',A0,'+(100+i)+',Linia de verificare '+i+','+(i%2?'3':'0'));
  return zipSync({'agency.txt':strToU8(rows('agency_id,agency_name,agency_url',['A0,Operatorul de test,https://example.test'])),'stops.txt':strToU8(rows('stop_id,stop_name,stop_desc,stop_lat,stop_lon',stops)),'routes.txt':strToU8(rows('route_id,agency_id,route_short_name,route_long_name,route_type',routeRows)),'calendar.txt':strToU8(rows('service_id,monday,tuesday,start_date,end_date',['A0,1,1,20260101,20261231']))})};
 const openMeteoBody=()=>{const now=Math.floor(Date.now()/1000);
  return {latitude:44.43,longitude:26.1,elevation:90,timezone:'Europe/Bucharest',current:{time:now,interval:900,...Object.fromEntries(forecastModule.currentVariables.map(key=>[key,key==='is_day'?1:3.5]))},current_units:Object.fromEntries(forecastModule.currentVariables.map(key=>[key,'unitate'])),hourly:{time:[now,now+3600,now+7200],...Object.fromEntries(forecastModule.hourlyVariables.map(key=>[key,[1,2,3]]))},hourly_units:{},daily:{time:[now+86400,now+172800],...Object.fromEntries(forecastModule.dailyVariables.map(key=>[key,[4,5]]))},daily_units:{}}};
 const anafBalance=href=>{const year=Number(href.match(/an=(\d+)/)[1]);return {cui:427282,an:year,deni:'Firma de verificare ANAF',caen:'1811',i:[{indicator:'I1',val_indicator:String(1000+year),val_den_indicator:'Rezultatul exercițiului'},{indicator:'I20',val_indicator:'50',val_den_indicator:'Cifra de afaceri'}]}};
 const anafRegistry={found:[{date_generale:{cui:427282,denumire:'Firma de verificare ANAF',adresa:'B-dul Unirii 1',nrRegCom:'J40/1/2026',cod_CAEN:'1811',telefon:'0210000000',forma_juridica:'Societate pe acțiuni'},inregistrare_scop_Tva:{scpTVA:true},stare_inactiv:{statusInactivi:false}}]};
 const soap=inner=>'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'+inner+'</s:Body></s:Envelope>';
 const courtResponse=operation=>{const record='<Dosar><numar>1/2/2026</numar><institutie>PJ-CURTE-DE-TEST</institutie><data>2025-12-01</data><obiect>Verificare publică</obiect><stadiuProcesual>Fond</stadiuProcesual><dataModificare>2026-10-01</dataModificare><parti><DosarParte><nume>Parte publică</nume><calitateParte>Reclamant</calitateParte></DosarParte></parti><sedinte><DosarSedinta><data>2026-11-02</data><ora>10:00</ora><solutieSumar>Soluție publică integrală</solutieSumar></DosarSedinta></sedinte></Dosar>';
  return new Response(soap('<'+operation+'Response><'+operation+'Result>'+record+'</'+operation+'Result></'+operation+'Response>'),{headers:{'content-type':'text/xml'}})};
 const lawSoapResponse=body=>String(body).includes('<GetToken ')?new Response(soap('<GetTokenResult>test-token</GetTokenResult>'),{headers:{'content-type':'text/xml'}}):new Response(soap('<SearchResult><a:Legi><a:Titlu>LEGE de verificare</a:Titlu><a:TipAct>lege</a:TipAct><a:LinkHtml>https://legislatie.just.ro/Public/DetaliiDocument/70001</a:LinkHtml><a:Text>Text SOAP recent preluat.</a:Text></a:Legi></SearchResult>'),{headers:{'content-type':'text/xml'}});
 const rssFixture=host=>{const item=n=>'<item><title>Anunț public '+(n+1)+' — '+host+'</title><link>https://'+host+'/anunt-'+n+'</link><pubDate>Tue, 06 Oct 2026 08:0'+n+':00 GMT</pubDate><description>Descriere integrală.</description><content:encoded><![CDATA[<p>Conținut complet '+host+'.</p>]]></content:encoded></item>';return new Response('<rss><channel>'+item(0)+item(1)+'</channel></rss>',{headers:{'content-type':'application/rss+xml'}})};
  const ckanBody={success:true,result:{count:1,results:[{id:'c20c6438-91ec-4204-a8df-c3d7c5fb47aa',name:'dataset-verificare',title:'Set de date de verificare',organization:{title:'Organizația publică de test'},metadata_modified:'2026-10-01T00:00:00',license_title:'Date deschise',num_resources:0,resources:[],notes:'Descriere completă.'}],search_facets:{organization:{items:[{name:'org-test',display_name:'Organizația publică de test'}]},res_format:{items:[{name:'csv',display_name:'CSV'}]}}}};
 const schoolsBody=()=>({success:true,result:{total:22,fields:[{id:'_id'},{id:'Numarul'},{id:'Nume scola'},{id:'Localitate unitate'},{id:'Judet PJ'}],records:Array.from({length:20},(_,i)=>({'_id':i,'Numarul':19561300+i,'Nume scola':'Școala Gimnazială de Verificare '+i,'Localitate unitate':'București','Judet PJ':'București'}))}});
 const cnasResource={health:'CLINIC',pharmacies:'FARM',hospitals:'SPITAL'};
 const cnasBody=family=>({success:true,result:{resources:[{name:'Lista furnizori cu drept de decont '+cnasResource[family.split('/')[1]]+' 31.03.2026',url:'https://data.gov.ro/dataset/lista-furnizori/resource/export-de-verificare.xlsx',format:'XLSX',last_modified:'2026-04-01T00:00:00'}]}});
 const cnasXlsx=()=>{const XLSX=require('xlsx');const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Nume furnizor','CUI cod','Localitate','Judet'],['Furnizor public de verificare 1','12345','București','București'],['Furnizor public de verificare 2','12456','Cluj-Napoca','Cluj']]),'CLINIC');return new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}))};
 // Justice fixtures mirror the published structure of each registry workbook (real column
 // names; the experți tehnici sheet starts with a title row before the header, as published).
 const justiceFixture=(kind)=>{
  const XLSX=require('xlsx');const rows=[];
  if(kind==='notari'){rows.push(['NUME','CAMERA','ADRESA_SEDIU','LOCALITATE','JUDET']);for(let i=1;i<=12;i++)rows.push(['POPESCU ALIN-'+i,'CAMERA DE NOTARI PUBLICI TIMIȘOARA','Str. Verificare nr. '+i,'Timișoara','TIMIȘ'])}
  else if(kind==='experti-judiciari'){rows.push(['Legitimatie','Judet','Nume','Telefon','Adresa','Specializare']);for(let i=1;i<=12;i++)rows.push([String(20000+i),'Timiș','POPESCU ANA-'+i,'0256/123456; 0740000'+i,'Timișoara, Str. Exemplu '+i,'Agricultură'])}
  else if(kind==='experti-tehnici'){rows.push(['LISTA EXPERȚILOR TEHNICI DE VERIFICARE ACTUALIZATĂ LA DATA DE 08 IUNIE 2026','','','','','','']);rows.push(['Nr.crt','Nume și prenume','E-mail ','Telefon ','Județul','Mențiuni privind exercitarea dreptului de practică','Serie şi număr \ncertificat de atestare ','Domenii de atestare tehnico-profesională ']);for(let i=1;i<=12;i++)rows.push([i,'POPESCU HORIA-'+i,'notar'+i+'@verificare.test','0740000'+i,'ALBA','','VAE 11'+i,'Cc'])}
  else{rows.push(['Nume','Nr Autorizatie','Curte de Apel','Judet','Limbi','telefon','Email']);for(let i=1;i<=12;i++)rows.push(['AAMOUM ALINA-'+i,5800+i,'TIMIȘOARA','TIMIȘ','Franceză, Rusă',2126679000+i,'alina'+i+'@verificare.test'])}
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),kind==='traducatori'?'Sheet2':'Sheet1');return new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}))};
 const justiceResourceName={notari:'Notari 23.01.2025','experti-judiciari':'Experti judiciari 23.01.2025','experti-tehnici':'Lista experților tehnici atestați până la data de 08 iunie 2026.xlsx',traducatori:'Traducatori 23.01.2025'};
 const justiceBody=kind=>({success:true,result:{resources:[{name:justiceResourceName[kind],url:'https://data.gov.ro/dataset/fixture/resource/export-de-verificare-'+kind+'.xlsx',format:'.xlsx',last_modified:'2026-06-08T00:00:00'}]}});
 const sirutaMeta=()=>({success:true,result:{resources:[{name:'SIRUTA 2026 semestrul I',url:'https://data.gov.ro/dataset/siruta_s1-2026/resource/siruta-de-verificare.csv',format:'CSV',last_modified:'2026-03-01T00:00:00'}]}});
 const sirutaCsv=()=>{const rows=['SIRUTA;DENLOC;NIV;JUD;SIRSUP;CODP;MED','40;București;1;40;0;0;1'];for(let i=1;i<=1001;i++)rows.push(String(10000+i)+';Localitatea de verificare '+i+';3;40;40;'+String(100000+i).slice(-6)+';'+(i%2?'1':'2'));return rows.join('\r\n')};
 const ifepPage=()=>{const rights='Drept de concluzii la: Judecătorii, Tribunale, Curți de Apel';const card='<a href=\'LawyerFile.aspx?RecordId=fixture-1&Panel=public\'><p><span title="Ultima actualizare"><em>05-10-2026 12:12</em></span><span class="pop" data-html="true" data-content=\'<p>'+rights+'</p>\'><img src="level.gif"></span><span>Fișă</span></p><h4>Avocat definitiv <font>POPESCU Ana</font>, Baroul Cluj [inactiv]</h4><p>Sediu principal: Cluj-Napoca, Strada Exemplu nr. 3</p><p>0700 000 000</p></a>';
  return new Response('<html><body><span id="MainContent_PagerTop_lblRecords">Înregistrări 1–1 din 40000</span><span id="MainContent_PagerTop_lblPages">Pagina 1 din 2</span>'+card+'</body></html>',{headers:{'content-type':'text/html'}})};
 const afirPage=()=>new Response('<html><body>'+('<div class="card-body news-content"><h4><a href="/comunicate/anunt-public-de-verificare">Anunț public de verificare AFIR</a></h4><p class="item-date">06 octombrie 2026</p></div><div class="news-border"></div>').repeat(3)+'</body></html>',{headers:{'content-type':'text/html'}});
 const filmsBody=()=>({results:{bindings:[{film:{type:'uri',value:'http://www.wikidata.org/entity/Q100001'},filmLabel:{type:'literal',value:'Film românesc de verificare'},date:{type:'literal',value:'2000-01-01'},directorLabel:{type:'literal',value:'Regizor de verificare'}}]}});
 const odeonPage=()=>new Response('<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Spectacol de verificare","startDate":"2026-10-06T19:30:00","url":"https://teatrul-odeon.ro/spectacol/verificare","location":{"@type":"Place","name":"Sala Mare"}}</script></head><body></body></html>',{headers:{'content-type':'text/html'}});
 const cinemaBody=()=>({body:{films:[{id:'f-verificare',name:'Filmul de verificare',link:'https://www.cinemacity.ro/ro/cinema/filmul-de-verificare',posterLink:'https://www.cinemacity.ro/ro/poster-de-verificare.jpg'}],events:[{filmId:'f-verificare',businessDay:todayIso(),eventDateTime:todayIso()+'T19:30:00'}]}});
 const storyBody=()=>({parse:{pageid:29611,title:'Aflatul',text:{'*':'<p>Povestea de verificare conține un text integral suficient de lung pentru cititorul public de povestiri.</p>'},links:[],revid:87065}});
 const realtimeBytes=()=>{const FeedMessage=require('gtfs-realtime-bindings').transit_realtime.FeedMessage;const now=Math.floor(Date.now()/1000);
  return new Uint8Array(FeedMessage.encode(FeedMessage.fromObject({header:{gtfsRealtimeVersion:'2.0',timestamp:now},entity:[{id:'v-verificare',vehicle:{trip:{routeId:'R1',tripId:'T1'},position:{latitude:44.43,longitude:26.1,speed:8,bearing:90},vehicle:{label:'Tramvaiul de verificare'},currentStatus:'IN_TRANSIT_TO',stopId:'S1',timestamp:now}}]})).finish())};
 const successFor=(family,href,host,init)=>{
  if(family.family==='weather/open-meteo')return Response.json(openMeteoBody());
  if(family.family==='company/anaf')return Response.json(href.includes('/api/PlatitorTvaRest/')?anafRegistry:anafBalance(href));
  if(family.family==='courts/portal.just')return courtResponse(String(init?.headers?.SOAPAction||'').includes('CautareDosare2')?'CautareDosare2':'CautareDosare');
  if(family.family==='feeds/stiri')return rssFixture(host);
  if(family.family==='catalog/ckan')return Response.json(ckanBody);
  if(family.family==='directory/schools')return Response.json(schoolsBody());
  if(family.family.startsWith('directory/'))return href.includes('package_show')?Response.json(cnasBody(family.family)):new Response(cnasXlsx(),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  if(family.family==='localities/siruta')return href.includes('package_show')?Response.json(sirutaMeta()):new Response(sirutaCsv(),{headers:{'content-type':'text/csv'}});
  if(family.family==='lawyers/ifep')return ifepPage();
  if(family.family==='legal/law')return lawSoapResponse(init?.body);
  if(family.family==='feeds/agricultura')return afirPage();
  if(family.family==='feeds/filme')return Response.json(filmsBody());
  if(family.family==='events/odeon')return odeonPage();
  if(family.family==='cinema/cinemacity')return Response.json(cinemaBody());
  if(family.family==='stories/wikisource')return Response.json(storyBody());
  if(family.family==='transport/realtime')return new Response(realtimeBytes(),{headers:{'content-type':'application/octet-stream'}});
  if(family.family.startsWith('justice/'))return href.includes('package_show')?Response.json(justiceBody(family.kind)):new Response(justiceFixture(family.kind),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  return new Response(gtfsBytes(),{headers:{'last-modified':new Date().toUTCString()}})};
 const failureFor=(scenario,init)=>{
  if(scenario==='http500')return new Response(null,{status:500});
  if(scenario==='http429')return new Response(null,{status:429,headers:{'retry-after':'120'}});
  if(scenario==='timeout')throw init?.signal?.reason||new DOMException('The operation was aborted due to timeout','TimeoutError');
  return new Response('<html>răspuns nevalid de test</html>',{headers:{'content-type':'text/html'}})};
 const counters=[],successPayloads=new Map();let cellCount=0;
 const withMocks=async(family,scenario,run)=>{
  const original=globalThis.fetch,counts=new Map(),unexpected=[],allowed=new Set(family.allowed);
  globalThis.fetch=async(url,init={})=>{
   init?.signal?.throwIfAborted?.();
   const href=String(url),host=href.match(/^https?:\/\/([^/?#]+)/)?.[1]||'';
   counts.set(host,(counts.get(host)||0)+1);
   if(!allowed.has(host)){unexpected.push(href);return new Response(null,{status:404})}
   if(host===family.host&&scenario!=='success')return failureFor(scenario,init);
   if(host===family.host)return successFor(family,href,host,init);
   if(host==='query.wikidata.org')return Response.json({results:{bindings:[]}});
   return rssFixture(host);
   };
   globalThis.__aflivraAssetFault=family.kind==='trains'&&scenario==='malformed'?'trains':null;
   try{return await run(counts,unexpected)}finally{globalThis.fetch=original;globalThis.__aflivraAssetFault=null}};
 const requestFor=family=>{
  if(family.method==='POST'){const body=JSON.stringify(family.body);return new Request('https://verify.test'+family.route,{method:'POST',body,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}})}
  return new Request('https://verify.test'+family.route)};
 const callRoute=async family=>{const handler=family.method==='POST'?routes[family.routeName].POST:routes[family.routeName].GET;return handler(requestFor(family))};
 const wipe=()=>{sqlite.prepare('DELETE FROM source_cache').run();sqlite.prepare('DELETE FROM source_budget').run();escapes.length=0};
 const degradeCheck=(label,response,payload)=>{
  assert.equal(response.status,200,label+': ruta degradează în-band și nu returnează niciodată 5xx');
  assert.equal(response.headers.get('cache-control'),'no-store',label+': răspunsul nu este cache-uit');
  assert.equal(typeof payload.status,'string',label+': starea sursei este prezentă');
  assert(['fresh','cached','stale','unavailable'].includes(payload.status),label+': stare documentată');
  assert.equal(escapes.length,0,label+': nicio respingere neprinsă nu evadează din rută');
 };
 const familyExpectations=async(family,scenario,payload,counts,label)=>{
  const hostCount=host=>counts.get(host)||0,e=String(payload.error||'');
  const future=payload.nextAttemptAt,pauseOk=!future||Date.parse(future)>=Date.now()-5000;
  assert(pauseOk,label+': fereastra de pauză, dacă există, este onorată');
  if(family.family==='weather/open-meteo'){
   const attempts=hostCount('api.open-meteo.com');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert(Array.isArray(payload?.data?.hourly)&&payload.data.hourly.length>0,label+': prognoza servită integral');assert.equal(attempts,1,label+': un singur acces la sursă')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul HTTP al sursei apare în plicul de eroare');assert(Array.isArray(payload?.data?.hourly)&&payload.data.hourly.length>0,label+': copia validă se păstrează');assert.equal(attempts,3,label+': cele trei încercări se epuizează fără repetare suplimentară')}
   else{assert.equal(payload.status,'unavailable',label+': fără copie, starea documentată');assert.equal(payload.data,null,label+': fără date inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat în eroare');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată în eroare');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert(e.length>0,label+': răspunsul nevalid are plic de eroare');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='company/anaf'){
   const anaf=hostCount('webservicesp.anaf.ro'),wikidata=hostCount('query.wikidata.org');
   assert.equal(Array.isArray(payload?.data?.sources)&&payload.data.sources.length,2,label+': compozitul păstrează ambele surse');
   const knowledge=payload.data.sources.find(source=>source.key==='knowledge-company:427282');
   assert(knowledge,label+': starea Wikidata este prezentă');assert(['fresh','cached'].includes(knowledge.status),label+': sursa sănătoasă rămâne disponibilă');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.name,'Firma de verificare ANAF',label+': identitatea fiscală servită');assert.equal(payload.data.history.length,3,label+': toți cei trei ani de bilanț');assert.equal(anaf,4,label+': un acces per componentă ANAF');assert.equal(wikidata,1,label+': un acces Wikidata')}
   else{assert.match(e,/ANAF nu a returnat/,label+': plicul de eroare ANAF documentat');
    if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500 ANAF');assert.equal(payload.data.name,'Firma de verificare ANAF',label+': copia păstrată este cea verificată');assert.equal(anaf,12,label+': cele trei încercări per componentă');assert.equal(wikidata,0,label+': sursa sănătoasă nu se reinteroghează')}
    else{assert.equal(payload.status,'stale',label+': copia inițială verificată servește');assert(payload.data,label+': copia de rezervă se păstrează');assert.equal(anaf,scenario==='http500'?12:4,label+': numărul documentat de accesări');assert.equal(wikidata,1,label+': un acces Wikidata')}}}
  if(family.family==='courts/portal.just'){
   const attempts=hostCount('portalquery.just.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.items.length,1,label+': dosarul servit');assert.equal(payload.data.items[0].number,'1/2/2026',label+': numărul dosarului păstrat');assert.equal(attempts,2,label+': două operații SOAP oficiale')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.items.length,1,label+': dosarul păstrat din copia validă');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert.equal(payload.status,'unavailable',label+': fără copie, starea documentată');assert.equal(payload.data,null,label+': fără dosare inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Structura serviciului juridic/,label+': structura nevalidă respinsă în română');
    assert.equal(attempts,scenario==='http500'||scenario==='malformed'?3:1,label+': numărul documentat de operații')}}
  if(family.family==='feeds/stiri'){
   const mai=hostCount(new URL(feedsModule.feedConfigs.stiri.url).host),others=feedHosts.filter(host=>host!==family.host).map(hostCount);
   const stiriSource=(payload?.data?.sources||[]).find(source=>source.key==='feed:stiri');
   assert(stiriSource,label+': starea sursei MAI este listată per sursă');
   if(scenario==='success'){assert.equal(payload.status,'cached',label);assert((payload?.data?.sources||[]).every(source=>['fresh','cached'].includes(source.status)),label+': toate fluxurile servite');assert(payload.data.items.length>=7,label+': anunțuri reunite');assert.equal(mai,1,label+': fluxul servit corect nu se reinteroghează în tur');assert(others.every(count=>count===1),label+': un acces per flux sănătos')}
   else{assert.equal(payload.status,'stale',label+': starea reunirii documentată');assert.match(payload.error||'',/indisponibil/i,label+': mesajul de degradare al reuniunii');
    assert(payload.data.items.length>0,label+': celelalte fluxuri rămân disponibile');
    if(scenario==='warm-http500'){assert.equal(payload.data.items.length,successPayloads.get(family.family).data.items.length,label+': anunțurile sursei căzute se păstrează din copie');assert.match(stiriSource.error,/HTTP 500/,label+': codul sursei în starea per-sursă');assert.equal(mai,3,label+': cele trei încercări, fără reinterogare în tur');assert(others.every(count=>count===0),label+': sursele servite corect nu se reinteroghează')}
    else{assert.match(stiriSource.error,scenario==='http500'?/HTTP 500/:scenario==='http429'?/HTTP 429/:scenario==='timeout'?/nu a răspuns în timpul alocat/:/Fluxul nu conține anunțuri/,label+': eroarea sursei în starea per-sursă');assert(['unavailable','stale'].includes(stiriSource.status),label+': starea per-sursă documentată');assert(payload.data.items.length>0,label+': anunțurile celorlalte surse rămân disponibile');assert.equal(mai,scenario==='http500'?3:1,label+': reîncercarea sursei căzute rămâne în limita documentată');assert(others.every(count=>count===1),label+': un acces per flux sănătos')}}}
  if(family.family==='catalog/ckan'){
    const attempts=hostCount('data.gov.ro');
    if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.count,1,label+': catalogul servit');assert.equal(attempts,1,label+': un singur acces');
     assert.deepEqual(payload.data.results[0].categories,['educatie'],label+': rândul servit poartă clasificarea din inventarul verificat')}
    else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.count,1,label+': rezultatele se păstrează');assert.equal(attempts,3,label+': cele trei încercări se epuizează');
     assert.deepEqual(payload.data.results[0].categories,['educatie'],label+': copia servită poartă clasificarea inventarului')}
   else{assert.equal(payload.status,'stale',label+': copia de rezervă goală servește la avarie');assert(payload.data&&Array.isArray(payload.data.results),label+': structura catalogului se păstrează');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='transport/tpbi'){
   const attempts=hostCount('gtfs.tpbi.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.items.length,12,label+': stațiile servite');assert.equal(attempts,1,label+': un singur acces')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/Exportul TPBI răspunde cu HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.items.length,12,label+': rețeaua se păstrează');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert.equal(payload.status,'unavailable',label+': fără copie, starea documentată');assert.equal(payload.data,null,label+': fără date inventate');
    if(scenario==='http500')assert.match(e,/Exportul TPBI răspunde cu HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/Exportul TPBI răspunde cu HTTP 429/,label+': codul sursei păstrat');
    if(scenario==='timeout'||scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='directory/schools'){
   const attempts=hostCount('data.gov.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.total,22,label+': registrul școlar servit');assert.equal(payload.data.records.length,20,label+': pagina de registru servită integral');assert(payload.data.fields.includes('Nume scola'),label+': câmpurile publicate se păstrează');assert.equal(attempts,1,label+': un singur acces la tabelul public')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.records.length,20,label+': copia validă se păstrează');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără înregistrări inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family.startsWith('directory/')&&family.family!=='directory/schools'){
   const attempts=hostCount('data.gov.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.records.length,2,label+': registrul CNAS servit integral');assert(payload.data.fields.includes('Nume furnizor'),label+': câmpurile oficiale ale registrului');assert.equal(attempts,2,label+': metadatele și exportul, câte un acces')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.records.length,2,label+': registrul se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără înregistrări inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='localities/siruta'){
   const attempts=hostCount('data.gov.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.total,1001,label+': registrul localităților servit integral');assert.equal(payload.data.items.length,40,label+': pagina de localități servită');assert(payload.data.items.every(item=>item.name.startsWith('Localitatea de verificare')),label+': numele localităților păstrate');assert.equal(attempts,2,label+': metadatele și exportul, câte un acces')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.total,1001,label+': registrul se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără localități inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='lawyers/ifep'){
   const attempts=hostCount('www.ifep.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.total,40000,label+': registru național declarat');assert.equal(payload.data.items.length,1,label+': fișa de avocat servită');assert.equal(payload.data.items[0].name,'POPESCU Ana',label+': numele avocatului păstrat');assert(payload.data.items[0].url.startsWith('https://www.ifep.ro/Justice/Lawyers/LawyerFile.aspx?'),label+': adresa oficială a fișei');assert.equal(attempts,1,label+': un singur acces la registru')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.items.length,1,label+': fișa se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără avocați inventați');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Registrul nu a oferit numărul rezultatelor/,label+': structura registrului respinsă în română');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='legal/law'){
   const attempts=hostCount('legislatie.just.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.items.length,1,label+': actul legislativ servit');assert.equal(payload.data.items[0].id,'https://legislatie.just.ro/Public/DetaliiDocument/70001',label+': identitatea oficială a actului');assert.equal(attempts,2,label+': tokenul și căutarea SOAP oficiale')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.items.length,1,label+': actul se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără acte inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Structura serviciului juridic/,label+': structura SOAP respinsă în română');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de operații')}}
  if(family.family==='feeds/agricultura'||family.family==='feeds/filme'){
   const host=hostCount(family.host);
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert(payload.data.items.length>0,label+': articolele sursei servite');assert(payload.data.items.every(item=>item.url&&item.title),label+': identitatea fiecărui articol se păstrează');assert.equal(host,1,label+': un singur acces la sursă')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert(payload.data.items.length>0,label+': articolele se păstrează din copie');assert.equal(host,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără articole inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,family.family==='feeds/agricultura'?/Structura comunicatelor AFIR/:/Sursa nu a putut fi verificată/,label+': structura nevalidă respinsă în română');
    assert.equal(host,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='events/odeon'){
   const attempts=hostCount('teatrul-odeon.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.items.length,1,label+': spectacolul servit');assert.equal(payload.data.items[0].start,'2026-10-06T19:30',label+': data spectacolului păstrată în formatul calendarului');assert(payload.data.items[0].url.startsWith('https://teatrul-odeon.ro/'),label+': adresa oficială a spectacolului');assert.equal(attempts,1,label+': un singur acces la calendarul public')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.items.length,1,label+': spectacolul se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără spectacole inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Calendarul teatrului nu a transmis/,label+': calendarul nevalid respins în română');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='cinema/cinemacity'){
   const attempts=hostCount('www.cinemacity.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.filmCount,1,label+': filmul servit');assert.equal(payload.data.eventCount,1,label+': proiecția zilei servită');assert.equal(payload.data.date,todayIso(),label+': ziua programului păstrată');assert.equal(attempts,1,label+': un singur acces la programul operatorului')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.eventCount,1,label+': programul se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără programe inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='stories/wikisource'){
   const attempts=hostCount('ro.wikisource.org');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.id,'29611',label+': povestea servită');assert(payload.data.content.length>=40,label+': textul integral servit');assert.equal(payload.data.textComplete,true,label+': textul declarat integral');assert(payload.data.url.startsWith('https://ro.wikisource.org/wiki/'),label+': adresa oficială a povestirii');assert.equal(attempts,1,label+': un singur acces la sursă')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.id,'29611',label+': povestea se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără povestiri inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată/,label+': plicul de eroare standard');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='transport/realtime'){
   const attempts=hostCount('gtfs.tpbi.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.items.length,1,label+': poziția vehiculului servită');assert.equal(payload.data.items[0].vehicleName,'Tramvaiul de verificare',label+': numele vehiculului păstrat');assert(payload.data.isLive,label+': fluxul marcat live');assert.equal(attempts,1,label+': un singur acces la fluxul live')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/Fluxul TPBI răspunde cu HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.items.length,1,label+': poziția se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără poziții inventate');
    if(scenario==='http500')assert.match(e,/Fluxul TPBI răspunde cu HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/Fluxul TPBI răspunde cu HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout'||scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată|Fluxul TPBI nu poate fi decodat/,label+': plicul de eroare documentat');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family.startsWith('justice/')){
   const kind=family.kind,attempts=hostCount('data.gov.ro');
   const sample='POPESCU',sampleSuffix=kind==='traducatori'?'class':'';
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.total,12,label+': registrul servit integral');assert.equal(payload.data.records.length,12,label+': pagina de registru servită integral');
    assert(payload.data.fields.includes(kind==='notari'?'NUME':kind==='experti-tehnici'?'Nume și prenume':'Nume'),label+': coloanele publicate se păstrează');
    assert(payload.data.records.every(record=>record._id),label+': fiecare înregistrare are un identificator stabil');
    assert.equal(payload.data.period,kind==='experti-tehnici'?'08 iunie 2026':'23.01.2025',label+': ediția registrului se păstrează');
    assert.equal(attempts,2,label+': metadatele și exportul, câte un acces')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.records.length,12,label+': registrul se păstrează din copie');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
   else{assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');assert.equal(payload.data,null,label+': fără înregistrări inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/Structura registrului|nu conține înregistrări utilizabile|Sursa nu a putut fi verificată/,label+': structura respinsă în română');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  if(family.family==='transport/trains'){
   const attempts=hostCount('data.gov.ro');
   if(scenario==='malformed'){
    // The station index is memoized per isolate, so the valid copy keeps serving within it
    // (keep-valid-copy semantics); the unmemoized per-station board read must fail honestly.
    if(payload.status!=='cached'){assert.equal(payload.status,'unavailable',label+': indicele corupt degradează în-band');assert.equal(payload.data,null,label+': fără orare inventate');assert.match(String(payload.error||''),/integralitat|integralit\u0103|nu poate fi citit/,label+': eroarea de integritate onestă')}
    const corrupt=await (await routes.trains.GET(new Request('https://verify.test/api/trains?station=30691'))).json();
    assert.equal(corrupt.status,'unavailable',label+': fișa de stație dintr-o copie coruptă degradează în-band');assert.equal(corrupt.data,null,label+': fără orare inventate');
    assert.match(String(corrupt.error||''),/integralitat|integralit\u0103|nu poate fi citit/,label+': eroarea de integritate onestă');
    assert.equal(attempts,0,label+': corpul orarului nu interoghează nicio sursă')}
   else{
    assert.equal(payload.status,'cached',label+': corpul verificat servește planificat');assert(payload.data.total>=3,label+': căutarea pe stații servește rezultate');
    const brasov=payload.data.items.find(row=>row.code===30691);assert(brasov&&/Bra[sșş]ov/.test(brasov.name),label+': căutarea cu diacritice moderne găsește stația publicată');
    const index=await (await routes.trains.GET(new Request('https://verify.test/api/trains'))).json();
    assert.equal(index.status,'cached',label+': indicele național servește');assert.equal(index.data.total,1846,label+': indicele național de stații servit integral');assert.equal(index.data.items.length,40,label+': pagina de stații servită');
    assert(payload.data.operators.length===9,label+': cei nouă operatori sunt publicați cu edițiile lor');
    const boardPayload=await (await routes.trains.GET(new Request('https://verify.test/api/trains?station=30691'))).json();
    assert.equal(boardPayload.status,'cached',label+': fișa stației servește din copie');assert(boardPayload.data.departures.length>10,label+': plecările planificate servite');assert(boardPayload.data.arrivals.length>10,label+': sosirile planificate servite');
    assert(boardPayload.data.departures.every(row=>/^\d{2}:\d{2}( \+1)?$/.test(row.tt)&&row.n&&row.o),label+': fiecare plecare are oră, tren și operator');
    assert.equal(attempts,0,label+': corpul orarului face parte din aplicație, nu se interoghează nicio sursă')}}
  };
 const runCell=(family,scenario)=>{const label=family.family+' / '+scenario,mock=scenario==='warm-http500'?'http500':scenario;
  return withMocks(family,mock,async(counts,unexpected)=>{
   assert.equal(unexpected.length,0,label+': doar adresele familiei sunt interogate ('+unexpected.join(', ')+')');
   const response=await callRoute(family),payload=await response.json();
   cellCount++;counters.push({family:family.family,scenario});
   degradeCheck(label,response,payload);
   await familyExpectations(family,scenario,payload,counts,label);
   return payload})};
 for(const family of families){
  for(const scenario of ['http500','http429','timeout','malformed','success']){wipe();const payload=await runCell(family,scenario);if(scenario==='success')successPayloads.set(family.family,payload)}
  sqlite.prepare('UPDATE source_cache SET expires_at=0 WHERE key=?').run(family.key());
  await runCell(family,'warm-http500');
 }
 console.log('Matricea de avarie a trecut: pentru fiecare familie de surse, HTTP 500 cu cele trei încercări epuizate, pauza 429, expirarea timpului, răspunsul nevalid și răspunsul de succes — ruta locală răspunde mereu 200, păstrează copia validă, prezintă codul HTTP al sursei în plicul de eroare și nu reinteroghează sursele servite corect.');
 console.log(JSON.stringify({result:'ok',mode:'mock',families:families.length,cells:cellCount,perFamily:families.map(family=>({family:family.family,cells:counters.filter(cell=>cell.family===family.family).length}))}));
 }
escapes.length=0;process.off('unhandledRejection',recordEscape);process.off('uncaughtExceptionMonitor',recordEscape);}
finally{delete globalThis.__aflivraTestEnv;delete globalThis.__aflivraResourceCopies;if(!live)sqlite.close();await rm(temp,{recursive:true,force:true})}
