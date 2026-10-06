import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
import ts from 'typescript';

// Modul --live face exact un singur acces la ruta locală per familie și, doar pentru stările de
// eroare ale sursei, maximum două verificări directe ale aceleiași adrese prin același contract
// de încărcare; familiile servite corect nu se reinteroghează. Regula de buget orară este
// respectată prin construcție: costul maxim este o vizită normală per familie.
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),live=process.argv.includes('--live'),base=process.env.AFLIVRA_VERIFY_SOURCE_BASE||'http://127.0.0.1:5173';
const temp=await mkdtemp(join(tmpdir(),'aflivra-source-errors-')),sqlite=live?null:new DatabaseSync(':memory:');
if(!live)sqlite.exec(await readFile(join(root,'drizzle/0000_thin_demogoblin.sql'),'utf8'));
const db=live?null:{prepare(sql){let args=[];const wrapper={bind(...values){for(const v of values)if(typeof v==='string'&&Buffer.byteLength(v)>2_000_000)throw Error('D1 row bound exceeded');args=values;return wrapper},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(result.changes)}}}};return wrapper},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results}};
globalThis.__aflivraTestEnv=live?{}:{DB:db};
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
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','adapters','feeds','request-context','resource-copy','cache','weather-gate','forecast','weather','transport','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge']){
 let source=await readFile(join(root,'lib/live',name+'.ts'),'utf8');
 source=source
  .replace("from '../court-history'","from './court-history'").replace("from '../court-query'","from './court-query'")
  .replace("from '../geographic-scope'","from './geographic-scope'").replace("from '../tabular-geography'","from './tabular-geography'")
  .replace("from '../location-context'","from './location-context'")
  .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
  .replace("import baseSeeds from './seed.json';",'const baseSeeds='+liveSeeds+';')
  .replace("import {serverSeeds,catalogSeed} from './seed-snapshots';",'const serverSeeds={};const catalogSeed=[];')
  .replace("import resourceCopies from './resource-seed.json';",'const resourceCopies=globalThis.__aflivraResourceCopies;')
  .replace("import confirmed from '@/public/courts/confirmed-references.json';",'const confirmed='+await readFile(join(root,'public/courts/confirmed-references.json'),'utf8')+';')
  .replace("import courtInstitutions from '@/public/courts/institutions.json';",'const courtInstitutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';')
  .replace("import codes from '@/public/legal-snapshots/manifest.json';",'const codes='+await readFile(join(root,'public/legal-snapshots/manifest.json'),'utf8')+';');
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace("from 'fflate'","from '"+fflateUrl+"'").replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
 await writeFile(join(temp,name+'.mjs'),output);
}
const adapters=await import(pathToFileURL(join(temp,'adapters.mjs'))),weatherModule=await import(pathToFileURL(join(temp,'weather.mjs'))),legalModule=await import(pathToFileURL(join(temp,'legal.mjs'))),feedsModule=await import(pathToFileURL(join(temp,'feeds.mjs'))),transportModule=await import(pathToFileURL(join(temp,'transport.mjs'))),forecastModule=await import(pathToFileURL(join(temp,'forecast.mjs')));
const feedHosts=Object.entries(feedsModule.feedConfigs).map(([key])=>new URL(feedsModule.feedConfigs[key].url).host);
const families=[
 {family:'weather/open-meteo',routeName:'weather',route:'/api/weather?lat=44.43&lon=26.1',host:'api.open-meteo.com',allowed:['api.open-meteo.com'],key:()=>weatherModule.forecastLoader(44.43,26.1).key,loader:()=>weatherModule.forecastLoader(44.43,26.1)},
 {family:'company/anaf',routeName:'company',route:'/api/company?cui=427282',host:'webservicesp.anaf.ro',allowed:['webservicesp.anaf.ro','query.wikidata.org'],key:()=>adapters.companyLoader('427282').key,loader:()=>adapters.companyLoader('427282')},
 {family:'courts/portal.just',routeName:'legal',route:'/api/legal',method:'POST',body:{kind:'court',number:'1/2/2026'},host:'portalquery.just.ro',allowed:['portalquery.just.ro'],key:()=>legalModule.courtLoader({number:'1/2/2026',name:'',subject:'',institution:'',from:'',to:''}).key,loader:()=>legalModule.courtLoader({number:'1/2/2026',name:'',subject:'',institution:'',from:'',to:''})},
 {family:'feeds/stiri',routeName:'domain',route:'/api/domain?kind=stiri',host:new URL(feedsModule.feedConfigs.stiri.url).host,allowed:feedHosts,key:()=>feedsModule.feedLoader('stiri').key,loader:()=>feedsModule.feedLoader('stiri')},
 {family:'catalog/ckan',routeName:'catalog',route:'/api/catalog',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>adapters.catalogLoader().key,loader:()=>adapters.catalogLoader()},
 {family:'transport/tpbi',routeName:'transport',route:'/api/transport',host:'gtfs.tpbi.ro',allowed:['gtfs.tpbi.ro'],key:()=>transportModule.transportLoader.key,loader:()=>transportModule.transportLoader}];
if(live){
 let routes=null;
 try{routes=await Promise.all(families.map(async family=>[family.family,await (async()=>{const init=family.method==='POST'?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(family.body)}:{};return fetch(base+family.route,{...init,signal:AbortSignal.timeout(60000)})})()]))}catch(error){console.error('Serverul local de dezvoltare nu răspunde la '+base+' — pornit cu „npm start” înainte de --live. Detaliu: '+error.message);process.exitCode=2}
 if(routes!==null&&routes.every(([,response])=>response!==null)){
  const verdicts=[];let ourBug=false;
  for(const [familyName,response] of routes){
   const family=families.find(entry=>entry.family===familyName);let payload=null;
   try{payload=await response.json()}catch{}
   const states=[];
   const push=state=>{if(state&&String(state.error||'').length)states.push({key:state.key||familyName,status:state.status,error:String(state.error),lastAttemptAt:state.lastAttemptAt||null,nextAttemptAt:state.nextAttemptAt||null})};
   push(payload);
   if(family.family==='company/anaf')for(const state of payload?.data?.sources||[])if(String(state?.key||'').startsWith('company:'))push(state);
   if(family.family==='feeds/stiri')for(const state of payload?.data?.sources||[])if(state?.key==='feed:stiri')push(state);
   const sampled=family.family==='feeds/stiri'?{sampledSource:'feed:stiri',allFeedStates:(payload?.data?.sources||[]).map(state=>({key:state.key,status:state.status,error:String(state.error||'').slice(0,200)}))}:null;
   const surfaced=response.status>=500?[{key:familyName,status:'HTTP '+response.status,error:'Ruta locală a răspuns cu HTTP '+response.status+'.',lastAttemptAt:null,nextAttemptAt:null}]:states;
   const budget=surfaced.some(state=>/Limit[ăa] temporar/.test(state.error));
   let verdict='ok',direct=null;
   if(surfaced.length&&budget)verdict='budget';
   else if(surfaced.length){
    let loads=0,loaded=null,failed=null;
    while(loads<2&&!loaded){loads++;try{const result=await family.loader().load();if(result.data!==null&&result.data!==undefined)loaded=result;else failed=result}catch(error){failed=error;if(!/timeout|connection|dns/i.test(String(error?.diagnostic?.category||error?.message||'')))break}}
    direct={loads,outcome:loaded?'ok':'failed',category:failed?.diagnostic?.category||null,httpStatus:failed?.diagnostic?.httpStatus||null,message:String(failed?.message||'').slice(0,200)};
    if(!loaded)verdict='source';
    else{
     const pauseLike=surfaced.some(state=>/429|pauz[ăa]/i.test(state.error))||surfaced.some(state=>/tempor|indisponibil|Structura|structur/i.test(state.error)&&(state.status==='stale'||payload?.data));
     verdict=pauseLike?'recovered':'our-bug';
     if(verdict==='our-bug')ourBug=true;
    }
   }
   verdicts.push({family:familyName,route:family.route,app:{http:response.status,status:payload?.status??null,error:String(payload?.error||'').slice(0,200),lastAttemptAt:payload?.lastAttemptAt??null,nextAttemptAt:payload?.nextAttemptAt??null,surfaced,...(sampled?{sampled:{sampledSource:sampled.sampledSource,allFeedStates:sampled.allFeedStates}}:{})},direct,verdict});
  }
  for(const verdict of verdicts)console.log('['+verdict.family+'] verdict: '+verdict.verdict+' — app HTTP '+verdict.app.http+', stare '+(verdict.app.status||'–')+', eroare: „'+(verdict.app.error||'niciuna')+'”'+(verdict.direct?' → sursă directă: '+verdict.direct.outcome+(verdict.direct.httpStatus?' (HTTP '+verdict.direct.httpStatus+')':'')+' în '+verdict.direct.loads+' acces(e)':' → fără reinterogarea sursei'));
  console.log(JSON.stringify({result:ourBug?'our-bug':'ok',mode:'--live',base,families:verdicts.length,verdicts}));
  if(ourBug){console.error('Verdict our-bug: sursa răspunde corect direct, dar ruta locală raportează eroarea sursei. Diferențele de mai sus sunt bug-ul nostru.');process.exitCode=1}
 }
}else{
 for(const [name,file] of [['weather','app/api/weather/route.ts'],['company','app/api/company/route.ts'],['legal','app/api/legal/route.ts'],['domain','app/api/domain/route.ts'],['catalog','app/api/catalog/route.ts'],['transport','app/api/transport/route.ts']]){
  let source=await readFile(join(root,file),'utf8');
  source=source
   .replace("import network from '@/public/transit/network.json';",'const network='+await readFile(join(root,'public/transit/network.json'),'utf8')+';')
   .replace("import proofs from '@/public/data/snapshot-transport.json';",'const proofs='+await readFile(join(root,'public/data/snapshot-transport.json'),'utf8')+';')
   .replace("import institutions from '@/public/courts/institutions.json';",'const institutions='+await readFile(join(root,'public/courts/institutions.json'),'utf8')+';')
   .replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__aflivraTestEnv;')
   .replaceAll('@/lib/live/','./').replaceAll('@/lib/','./');
  let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
  await writeFile(join(temp,'route-'+name+'.mjs'),output);
 }
 const routes={};for(const name of ['weather','company','legal','domain','catalog','transport'])routes[name]=await import(pathToFileURL(join(temp,'route-'+name+'.mjs')));
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
 const rssFixture=host=>{const item=n=>'<item><title>Anunț public '+(n+1)+' — '+host+'</title><link>https://'+host+'/anunt-'+n+'</link><pubDate>Tue, 06 Oct 2026 08:0'+n+':00 GMT</pubDate><description>Descriere integrală.</description><content:encoded><![CDATA[<p>Conținut complet '+host+'.</p>]]></content:encoded></item>';return new Response('<rss><channel>'+item(0)+item(1)+'</channel></rss>',{headers:{'content-type':'application/rss+xml'}})};
 const ckanBody={success:true,result:{count:1,results:[{id:'ckan-verificare',name:'dataset-verificare',title:'Set de date de verificare',organization:{title:'Organizația publică de test'},metadata_modified:'2026-10-01T00:00:00',license_title:'Date deschise',num_resources:0,resources:[],notes:'Descriere completă.'}],search_facets:{organization:{items:[{name:'org-test',display_name:'Organizația publică de test'}]},res_format:{items:[{name:'csv',display_name:'CSV'}]}}}};
 const successFor=(family,href,host,init)=>{
  if(family.family==='weather/open-meteo')return Response.json(openMeteoBody());
  if(family.family==='company/anaf')return Response.json(href.includes('/api/PlatitorTvaRest/')?anafRegistry:anafBalance(href));
  if(family.family==='courts/portal.just')return courtResponse(String(init?.headers?.SOAPAction||'').includes('CautareDosare2')?'CautareDosare2':'CautareDosare');
  if(family.family==='feeds/stiri')return rssFixture(host);
  if(family.family==='catalog/ckan')return Response.json(ckanBody);
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
  try{return await run(counts,unexpected)}finally{globalThis.fetch=original}};
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
 const familyExpectations=(family,scenario,payload,counts,label)=>{
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
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.count,1,label+': catalogul servit');assert.equal(attempts,1,label+': un singur acces')}
   else if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500');assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');assert.equal(payload.data.count,1,label+': rezultatele se păstrează');assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
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
 };
 const runCell=(family,scenario)=>{const label=family.family+' / '+scenario,mock=scenario==='warm-http500'?'http500':scenario;
  return withMocks(family,mock,async(counts,unexpected)=>{
   assert.equal(unexpected.length,0,label+': doar adresele familiei sunt interogate ('+unexpected.join(', ')+')');
   const response=await callRoute(family),payload=await response.json();
   cellCount++;counters.push({family:family.family,scenario});
   degradeCheck(label,response,payload);
   familyExpectations(family,scenario,payload,counts,label);
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
