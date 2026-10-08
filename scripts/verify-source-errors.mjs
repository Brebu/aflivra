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
globalThis.__aflivraTestEnv=live?{}:{DB:db,REFRESH_TOKEN:'token-relay-de-verificare',...(assetsFetch?{ASSETS:{fetch:assetsFetch}}:{})};
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
for(const name of ['records','text','media','query','source-xml','source-html','catalog-categories','catalog-metadata','adapters','company-registries','feeds','request-context','resource-copy','cache','weather-gate','forecast','weather','transport','transit-realtime','legal-consolidation','legal-portal','legal-registry','court-references','legal-selection','legal','knowledge','lawyers','directories','justice','trains','flights','housing','resources','events','cinema','stories']){
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
   .replace("import venuesCatalog from '@/public/events/venues.json';",'const venuesCatalog='+await readFile(join(root,'public/events/venues.json'),'utf8')+';')
  .replace("import audit from '@/public/catalog/audit.json';",'const audit='+await readFile(join(root,'public/catalog/audit.json'),'utf8')+';')
  .replace("import proofs from '@/public/data/snapshot-transport.json';",'const proofs='+await readFile(join(root,'public/data/snapshot-transport.json'),'utf8')+';');
 let output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 output=output.replaceAll('@/lib/http-retry.mjs',httpRetry).replace("from 'fflate'","from '"+fflateUrl+"'");output=output.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");
 // Importurile dinamice de la nivelul încărcătorilor (reuniunea registrelor firmei citește
 // cache-ul comun la momentul apelului) primesc aceeași extensie ca importurile statice.
 output=output.replace(/import\('\.\/([a-z][a-z0-9-]*)'\)/g,(_,p)=>"import('./"+p+".mjs')");for(const pkg of ['xlsx','gtfs-realtime-bindings'])output=output.replace("from '"+pkg+"'","from '"+pathToFileURL(require.resolve(pkg)).href+"'");
 await writeFile(join(temp,name+'.mjs'),output);
}
const companyRegistriesModule=await import(pathToFileURL(join(temp,'company-registries.mjs'))),adapters=await import(pathToFileURL(join(temp,'adapters.mjs'))),weatherModule=await import(pathToFileURL(join(temp,'weather.mjs'))),legalModule=await import(pathToFileURL(join(temp,'legal.mjs'))),feedsModule=await import(pathToFileURL(join(temp,'feeds.mjs'))),transportModule=await import(pathToFileURL(join(temp,'transport.mjs'))),forecastModule=await import(pathToFileURL(join(temp,'forecast.mjs'))),directoriesModule=await import(pathToFileURL(join(temp,'directories.mjs'))),lawyersModule=await import(pathToFileURL(join(temp,'lawyers.mjs'))),eventsModule=await import(pathToFileURL(join(temp,'events.mjs'))),cinemaModule=await import(pathToFileURL(join(temp,'cinema.mjs'))),storiesModule=await import(pathToFileURL(join(temp,'stories.mjs'))),realtimeModule=await import(pathToFileURL(join(temp,'transit-realtime.mjs'))),justiceModule=await import(pathToFileURL(join(temp,'justice.mjs'))),trainsModule=await import(pathToFileURL(join(temp,'trains.mjs'))),flightsModule=await import(pathToFileURL(join(temp,'flights.mjs'))),housingModule=await import(pathToFileURL(join(temp,'housing.mjs')));
const feedHosts=Object.entries(feedsModule.feedConfigs).map(([key])=>new URL(feedsModule.feedConfigs[key].url).host);
const lawQuery={title:'CODUL CIVIL',text:'',number:'',year:'',page:0,full:false};
// Familia Tranzy este poartă de mediu (TRANZY_API_KEY); fixture-urile oglindesc
// sonda de referință din ssnc-agent-orch/2026/10/06/media-expansion/probe-tranzy-cell.mjs.
const tranzyClujAgency=()=>({agency_id:1,agency_name:'CTP Cluj-Napoca SA',agency_timezone:'Europe/Bucharest',agency_url:'https://ctpcj.ro'});
const tranzyAgenciesBody=()=>[tranzyClujAgency(),{agency_id:2,agency_name:'SC RATBV SA',agency_timezone:'Europe/Bucharest',agency_url:'https://ratbv.ro'},{agency_id:3,agency_name:'CT Buzău',agency_timezone:'Europe/Bucharest'}];
// Tranzy publică momentele pozițiilor ca „YYYY-MM-DD HH:MM:SS”; rândurile de
// scurgere (în afara României) și cele cu moment viitor se dropă, cele vechi se păstrează.
const tranzyStamp=secondsAgo=>new Date(Date.now()-secondsAgo*1000).toISOString().slice(0,19).replace('T',' ');
const tranzyVehiclesBody=()=>[
 {id:'tz-1',label:'Tramvaiul 101',latitude:46.7712,longitude:23.6236,timestamp:tranzyStamp(8),vehicle_type:0,bike_accessible:'UNKNOWN',wheelchair_accessible:'WHEELCHAIR_ACCESSIBLE',speed:9.7,route_id:25,trip_id:'t25'},
 {id:'tz-spill',label:'Spillover',latitude:48.85,longitude:2.35,timestamp:tranzyStamp(8),vehicle_type:3,bike_accessible:'UNKNOWN',wheelchair_accessible:'UNKNOWN',speed:5,route_id:9},
 {id:'tz-future',label:'Viitor',latitude:46.77,longitude:23.62,timestamp:tranzyStamp(-600),vehicle_type:3,bike_accessible:'UNKNOWN',wheelchair_accessible:'UNKNOWN',speed:5,route_id:9},
 {id:'tz-stale',label:'Troleibuzul păstrat',latitude:46.77,longitude:23.62,timestamp:tranzyStamp(1800),vehicle_type:11,bike_accessible:'UNKNOWN',wheelchair_accessible:'UNKNOWN',speed:0,route_id:8,trip_id:'t8'},
 {id:'tz-nospeed',label:'Autobuzul fără viteză',latitude:46.76,longitude:23.61,timestamp:tranzyStamp(8),vehicle_type:3,bike_accessible:'UNKNOWN',wheelchair_accessible:'NO_VALUE'}];
// Stările ADS-B oglindesc forma v2 a adsb.lol (petic live 2026-10-07, sesiunea
// wave2-live-romania/fixtures/adsb-point-250.json): ac[] cu hex zburător în chenarul
// românesc, rând „ground” cu alt_baro textual, scurgere dincolo de chenar și un rând
// fără adresă mod S; now vine în milisecunde.
const adsbFlight=(hex,flight,r,t,lat,lon,extra={})=>({hex,type:'adsb_icao',flight,r,t,lat,lon,alt_baro:30500,gs:448.1,baro_rate:1152,track:270.5,true_heading:268.2,squawk:'1000',emergency:'none',seen_pos:0.5,...extra});
// Textul brut al unui panou de acoperire — exact ce predă tura de relaie rutei
// /api/seed/flights: cele patru panouri identice reunite de rută prin fuziunea
// încărcătorului rămân un singur set de aeronave, nu patru.
const adsbBoardObject=()=>{const now=Date.now();
 return {now,ctime:now,msg:'No error',total:5,ac:[
  adsbFlight('481f55','W6XYZ  ','HA-LMN','A320',44.5,26.1),
  adsbFlight('89408c','GFA007','A9C-FB','B789',46.68,20.5,{alt_baro:39975,gs:501.5,track:297.9,true_heading:294.1,baro_rate:-64,squawk:'5261'}),
  adsbFlight('4a1b2c','     ','YR-ABB','C172',44.42,26.05,{alt_baro:'ground',gs:5,track:null,true_heading:null,baro_rate:null,squawk:'7000'}),
  adsbFlight('3c6b2f','DLH440','D-ABYT','A21N',48.85,2.35),
  {type:'adsb_icao',flight:'NOHEX',lat:44.5,lon:26.1}]}};
const adsbBody=()=>Response.json(adsbBoardObject());
const adsbBoardText=()=>JSON.stringify(adsbBoardObject());
// Panoul BIA oglindește structura înregistrată în sesiunea de cercetare (obiectul unei
// sosiri reale citit în browser; forma exactă se confirmă la prima tură de relaie):
// număr de zbor, operator cu denumirile RO/EN, sens, origine/destinație, ore publicate,
// stare, poartă; rândurile fără număr sau fără sens se omit, nu se inventează.
const biaBoardBody=()=>JSON.stringify([
 {flightNumber:'W6 3187',airline:{RO:'Wizz Air',EN:'Wizz Air'},direction:'A',origin:'Londra Luton',destination:'București',scheduledTime:'07:45',estimatedTime:'07:52',status:'Aterizat',gate:'04'},
 {flightNumber:'OS 899',airline:{RO:'Tarom',EN:'TAROM'},Direction:'A',origin:'Viena',destination:'București',scheduledTime:'08:10',status:'Întârziat'},
 {flightNumber:'W6 3189',airline:{RO:'Wizz Air',EN:'Wizz Air'},direction:'D',origin:'București',destination:'Londra Luton',scheduledTime:'09:15',status:'Programat'},
 {origin:'Fără număr de zbor',destination:'București',direction:'A'},
 {flightNumber:'QR 000',origin:'neprecizat'}]);
const biaChallenge=()=>new Response('<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',{status:403,headers:{'content-type':'text/html','cf-mitigated':'challenge'}});
// Calendarul tribe-events-v1 al Operei Cluj oglindește răspunsul real capturat în sesiunea
// wave2-live-romania/fixtures/operacluj-tribe-events-v1.txt: events[] cu id/global_id, url pe
// domeniul instituției, start_date/end_date „YYYY-MM-DD HH:MM:SS” (ore locale), image.url,
// categories[].name; ediția EN a aceleiași apariții se repetă în calendar — rândul /en/ se
// omite, nu se dublează, iar rândul fără dată de început se omite, nu se inventează.
const operaclujEvent=(id,title,start,end,slug,extra={})=>({id,global_id:'operacluj.ro?id='+id,status:'publish',url:'https://operacluj.ro/spectacole/stagiunea-2026-2027/'+slug+'/',title,description:'<p>Descrierea publică a spectacolului de verificare.</p>',excerpt:'',slug,start_date:start,end_date:end,image:{url:'https://images.operacluj.ro/2026/10/'+slug+'.jpg',width:1812,height:682},categories:[{name:'operă'}],...extra});
const operaclujBody=()=>JSON.stringify({events:[
  operaclujEvent(23701,'BOEMA DE VERIFICARE','2026-10-08 19:30:00','2026-10-08 21:00:00','boema-de-verificare'),
  {id:23702,global_id:'operacluj.ro?id=23702',status:'publish',url:'https://operacluj.ro/spectacole/stagiunea-2026-2027/rondoul-de-verificare/',title:'RONDOUL DE VERIFICARE',description:'<p>Balet în două acte.</p>',start_date:'2026-10-10 18:00:00',end_date:'2026-10-10 19:30:00',image:{url:'https://images.operacluj.ro/2026/10/rondoul-de-verificare.jpg'},categories:[{name:'balet'}]},
  // ediția EN a aceleiași apariții — instituția o publică în ambele limbi, pe calea /en/;
  // rândul nu se dublează în registru
  operaclujEvent(23699,'Guided tour / Tur ghidat (ediție EN)','2026-10-08 15:00:00','2026-10-08 17:00:00','tururighidate-guided-tours-en',{categories:[{name:'Vizită ghidată'}],url:'https://operacluj.ro/en/spectacole/tururighidate-guided-tours/'}),
  // rând fără dată de început — omis onest, fără oră inventată
  {id:23703,global_id:'operacluj.ro?id=23703',status:'publish',url:'https://operacluj.ro/spectacole/stagiunea-2026-2027/spectacol-fara-ora/',title:'SPECTACOL FĂRĂ ORĂ PUBLICATĂ'}],
 total:58,rest_url:'https://operacluj.ro/wp-json/tribe/events/v1/events/',total_pages:6});
// Registrele imobiliare oglindesc structura publicată a registrului capturat integral
// în sesiunea wave2-live-romania/fixtures/ (anl-obiective-2025.xls: antet cu „Nr. crt” și
// „Amplasament”, coloanele de ani de recepție și rândul TOTAL GENERAL; ancpi-ipoteci-ianuarie-2024.xlsx:
// antet unic JUDET/LUNA/TIP_PROPRIETATE/TIP_OPERATIUNE/NUMAR_IPOTECI, 42 de județe, 6 feluri de proprietate).
const anlCounties=['ALBA','ARAD','ARGEŞ','BACĂU','BIHOR','BISTRIŢA-NĂSĂUD','BOTOŞANI','BRAŞOV','BRĂILA','BUZĂU','CĂLĂRAŞI','CARAŞ-SEVERIN','CLUJ','CONSTANŢA','COVASNA','DÂMBOVIŢA','DOLJ','GALAŢI','GIURGIU','GORJ','HARGHITA','HUNEDOARA','IALOMIŢA','IAŞI','ILFOV','MARAMUREŞ','MEHEDINŢI','MUREŞ','NEAMŢ','OLT','PRAHOVA','SĂLAJ','SATU MARE','SIBIU','SUCEAVA','TELEORMAN','TIMIŞ','TULCEA','VASLUI','VÂLCEA','VRANCEA','BUCUREŞTI'];
const anlYears=Array.from({length:20},(_,i)=>String(2005+i));
const anlXlsx=()=>{const XLSX=require('xlsx');const rows=[['Nr. crt','JUDET','LOCALITATE','AMPLASAMENT','NR. U.L.',...anlYears]];let crt=0,unitsTotal=0;const perYear=Object.fromEntries(anlYears.map(year=>[year,0]));
 // Ca în registrul real, unitățile fiecărui amplasament se livrează integral într-un singur
 // an de recepție — seria derivată pe ani se compune exact în rândul TOTAL GENERAL.
 for(const [ci,county] of anlCounties.entries())for(let s=1;s<=8;s++){crt++;const units=30+s*4+(ci%7);unitsTotal+=units;const delivery=anlYears[(ci+s)%20];
  perYear[delivery]+=units;
  rows.push([crt,county,'Localitatea de verificare '+ci,'Amplasamentul de verificare '+county+' '+s,units,...anlYears.map(year=>year===delivery?units:null)])}
 rows.push(['','TOTAL GENERAL','','',unitsTotal,...anlYears.map(year=>perYear[year])]);
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'obiective');return new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}))};
const anlBody=()=>({success:true,result:{resources:[{name:'Lista amplasamentelor obiectivelor de locuințe pentru tineri recepționate 11.03.2025',url:'https://data.gov.ro/dataset/anl-obiective/resource/anl-amplasamente-de-verificare.xls',format:'XLS',last_modified:'2025-03-11T00:00:00'}]}});
const ancpiTypes=['apartamente','cu constructii','fara constructii','agricol','neagricol','neprecizat'];
const ancpiXlsx=()=>{const XLSX=require('xlsx');const rows=[['JUDET','LUNA_RAPORTATA','TIP_PROPRIETATE','TIP_OPERATIUNE','NUMAR_IPOTECI']];
 for(const [ci,county] of anlCounties.entries())for(const [ti,type] of ancpiTypes.entries())rows.push([county,'31.01.2024',type,'Ipoteca înscrisă',(county==='BUCUREŞTI'?30:8)+((ci*5+ti*3)%20)]);
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'ipoteci');return new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}))};
const ancpiBody=()=>({success:true,result:{resources:[{name:'Numarul imobilelor ipotecate in cartea funciara ianuarie 2024',url:'https://data.gov.ro/dataset/ancpi-ipoteci/resource/ipoteci-de-verificare-ianuarie-2024.xlsx',format:'XLSX',last_modified:'2024-02-05T00:00:00'}]}});
const families=[
 {family:'weather/open-meteo',routeName:'weather',route:'/api/weather?lat=44.43&lon=26.1',host:'api.open-meteo.com',allowed:['api.open-meteo.com'],key:()=>weatherModule.forecastLoader(44.43,26.1).key,loader:()=>weatherModule.forecastLoader(44.43,26.1)},
 {family:'company/anaf',routeName:'company',route:'/api/company?cui=427282',host:'webservicesp.anaf.ro',allowed:['webservicesp.anaf.ro','query.wikidata.org','data.gov.ro'],key:()=>companyRegistriesModule.companyLoader('427282').key,loader:()=>companyRegistriesModule.companyLoader('427282')},
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
 // Pagina oficială a actului deschis după identificatorul validat (sonda Wave B): fișa actului
 // expune titlul, emitentul, publicația și istoricul versiunilor; avaria paginii degradează
 // onest la copia înregistrată sau la absența documentată, fără consolidare inventată.
 {family:'legal/act-page',routeName:'legal',route:'/api/legal',method:'POST',body:{kind:'law',title:'LEGE de verificare pentru fișa actului',full:true,id:'https://legislatie.just.ro/Public/DetaliiDocument/70001',exactTitle:'LEGE de verificare pentru fișa actului',selectedType:'lege',selectedNumber:'1',selectedDate:'2025-01-01'},host:'legislatie.just.ro',allowed:['legislatie.just.ro'],key:()=>legalModule.lawLoader({title:'',text:'',number:'',year:'',page:0,full:true,selectedId:'https://legislatie.just.ro/Public/DetaliiDocument/70001'}).key,loader:()=>legalModule.lawLoader({title:'',text:'',number:'',year:'',page:0,full:true,selectedId:'https://legislatie.just.ro/Public/DetaliiDocument/70001'})},
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
 {family:'transport/trains',routeName:'trains',kind:'trains',route:'/api/trains?q=bra%C8%99ov',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>'trains:stations',loader:()=>({key:'trains:stations',name:'Informatică Feroviară · mersul trenurilor',url:'https://data.gov.ro/',version:'trains.planned.v1',ttl:86400,load:async()=>{throw Error('corpus-only')}})},
 // Poarta de mediu își are propriile celule, după sonda de referință: fără cheie
 // (fără nicio interogare), 403 cu o singură încercare, operator nerezolvat, filtre
 // invalide — matricea generală nu le poate exprima prin scenariile ei fixe.
  {family:'transport/tranzy',routeName:'tranzy-live',kind:'tranzy',host:'api.tranzy.ai',allowed:['api.tranzy.ai'],scenarios:['nokey','http403','http500','malformed','unmatched','invalid','success'],route:'/api/tranzy-live?geoScope=context&locality=Cluj-Napoca&county=Cluj&lat=46.7712&lon=23.6236',scenarioRoutes:{unmatched:'/api/tranzy-live?geoScope=context&locality=Z%C4%83rne%C8%99ti&county=Bra%C8%99ov',invalid:'/api/tranzy-live?q='+('x'.repeat(201))},key:()=>realtimeModule.tranzyVehiclesLoader(tranzyClujAgency()).key,loader:()=>realtimeModule.tranzyVehiclesLoader(tranzyClujAgency())},
  {family:'flights/adsb',routeName:'flights',kind:'adsb',route:'/api/flights',host:'api.adsb.lol',allowed:['api.adsb.lol'],scenarios:['http500','http429','timeout','malformed','invalid','success','relay-noauth','relay-partial','relay-corrupt','relay-publish'],scenarioRoutes:{invalid:'/api/flights?q='+('x'.repeat(201))},key:()=>flightsModule.adsbFlightsLoader.key,loader:()=>flightsModule.adsbFlightsLoader},
  // Stările aeronavelor sunt în plus reluate de intermediar (clasa 429/503 a egress-ului
  // Worker, dovedită de sonde): celulele proprii numără depunerea fără token, livrul
  // scurt sau corupt respins fără publicare, și predarea celor patru panouri de
  // acoperire, după care cititorul servește fără să reinterogheze sursa.
  // Panoul BIA este preluat de relaie, deci celulele lui proprii, după sonda de
  // referință: fără copie predată (testul de browser respins onest), poarta de acces
  // și aeroportul respinse, panoul corupt respins, panoul fără curse respins, filtre
  // invalide — și predarea reușită, după care cititorul servește fără să reinterogheze sursa.
   {family:'flights/bia',routeName:'flight-board',kind:'bia',route:'/api/flight-board?airport=henri-coanda',host:'bucharestairports.ro',allowed:['bucharestairports.ro'],scenarios:['norelay','relay-noauth','relay-airport','relay-corrupt','relay-empty','invalid','relay-publish'],scenarioRoutes:{invalid:'/api/flight-board?airport=sibiu'},key:()=>flightsModule.biaFlightsLoader(flightsModule.biaAirports[0]).key,loader:()=>flightsModule.biaFlightsLoader(flightsModule.biaAirports[0])},
  // Căutarea națională a spectacolelor reunește calendarele registrului: familia poartă
  // propria gazdă (Opera Cluj — noul calendar din registru), iar calendarul Odeon, deja
  // acoperit de familia events/odeon, continuă să servească prin propriul lui fixture —
  // avaria unei instituții degradează onest reuniunea, nu o ascunde.
  {family:'events/search',routeName:'events',route:'/api/events?q=verificare',host:'operacluj.ro',allowed:['teatrul-odeon.ro','operacluj.ro'],scenarios:['http500','http429','timeout','malformed','invalid','success'],scenarioRoutes:{invalid:'/api/events?q='+('x'.repeat(201))},key:()=>eventsModule.eventsLoader(eventsModule.eventVenue('operacluj')).key,loader:()=>eventsModule.eventsLoader(eventsModule.eventVenue('operacluj'))},
  {family:'events/operanationalacluj',routeName:'events',route:'/api/events?venue=operacluj',host:'operacluj.ro',allowed:['operacluj.ro'],key:()=>eventsModule.eventsLoader(eventsModule.eventVenue('operacluj')).key,loader:()=>eventsModule.eventsLoader(eventsModule.eventVenue('operacluj'))},
  {family:'housing/anl',routeName:'anl',route:'/api/anl',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>housingModule.anlLoader.key,loader:()=>housingModule.anlLoader},
  {family:'housing/ancpi',routeName:'ancpi',route:'/api/ancpi',host:'data.gov.ro',allowed:['data.gov.ro'],key:()=>housingModule.ancpiLoader.key,loader:()=>housingModule.ancpiLoader}];
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
    for(const [name,file] of [['weather','app/api/weather/route.ts'],['company','app/api/company/route.ts'],['legal','app/api/legal/route.ts'],['domain','app/api/domain/route.ts'],['catalog','app/api/catalog/route.ts'],['transport','app/api/transport/route.ts'],['directory','app/api/directory/route.ts'],['lawyers','app/api/lawyers/route.ts'],['localities','app/api/localities/route.ts'],['events','app/api/events/route.ts'],['cinema','app/api/cinema/route.ts'],['story','app/api/story/route.ts'],['transport-live','app/api/transport-live/route.ts'],['notaries','app/api/notaries/route.ts'],['experts','app/api/experts/route.ts'],['trains','app/api/trains/route.ts'],['tranzy-live','app/api/tranzy-live/route.ts'],['flights','app/api/flights/route.ts'],['flight-board','app/api/flight-board/route.ts'],['seed-bia','app/api/seed/bia/route.ts'],['seed-flights','app/api/seed/flights/route.ts'],['anl','app/api/anl/route.ts'],['ancpi','app/api/ancpi/route.ts']]){
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
   const routes={};for(const name of ['weather','company','legal','domain','catalog','transport','directory','lawyers','localities','events','cinema','story','transport-live','notaries','experts','trains','tranzy-live','flights','flight-board','seed-bia','seed-flights','anl','ancpi'])routes[name]=await import(pathToFileURL(join(temp,'route-'+name+'.mjs')));
 const {zipSync,strToU8}=require('fflate');
 const gtfsBytes=()=>{const rows=(head,list)=>head+'\n'+list.join('\n')+'\n';const stops=Array.from({length:12},(_,i)=>'S'+i+',Stația de verificare '+i+',Descriere publică,'+(44.40+i/100)+','+(26.10+i/100)),routeRows=Array.from({length:12},(_,i)=>'R'+i+',A0,'+(100+i)+',Linia de verificare '+i+','+(i%2?'3':'0'));
  return zipSync({'agency.txt':strToU8(rows('agency_id,agency_name,agency_url',['A0,Operatorul de test,https://example.test'])),'stops.txt':strToU8(rows('stop_id,stop_name,stop_desc,stop_lat,stop_lon',stops)),'routes.txt':strToU8(rows('route_id,agency_id,route_short_name,route_long_name,route_type',routeRows)),'calendar.txt':strToU8(rows('service_id,monday,tuesday,start_date,end_date',['A0,1,1,20260101,20261231']))})};
 const openMeteoBody=()=>{const now=Math.floor(Date.now()/1000);
  return {latitude:44.43,longitude:26.1,elevation:90,timezone:'Europe/Bucharest',current:{time:now,interval:900,...Object.fromEntries(forecastModule.currentVariables.map(key=>[key,key==='is_day'?1:3.5]))},current_units:Object.fromEntries(forecastModule.currentVariables.map(key=>[key,'unitate'])),hourly:{time:[now,now+3600,now+7200],...Object.fromEntries(forecastModule.hourlyVariables.map(key=>[key,[1,2,3]]))},hourly_units:{},daily:{time:[now+86400,now+172800],...Object.fromEntries(forecastModule.dailyVariables.map(key=>[key,[4,5]]))},daily_units:{}}};
  const anafBalance=href=>{const year=Number(href.match(/an=(\d+)/)[1]);return {cui:427282,an:year,deni:'Firma de verificare ANAF',caen:'1811',den_caen:'Activitatea CAEN publicată în bilanț',i:[{indicator:'I1',val_indicator:String(1000+year),val_den_indicator:'Rezultatul exercițiului'},{indicator:'I20',val_indicator:'50',val_den_indicator:'Cifra de afaceri'}]}};
  const anafRegistry={found:[{date_generale:{cui:427282,denumire:'Firma de verificare ANAF',adresa:'B-dul Unirii 1',nrRegCom:'J40/1/2026',cod_CAEN:'1811',telefon:'0210000000',forma_juridica:'Societate pe acțiuni'},inregistrare_scop_Tva:{scpTVA:true,dataInceputScpTVA:'2007-06-13'},stare_inactiv:{statusInactivi:false}}]};
 const soap=inner=>'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'+inner+'</s:Body></s:Envelope>';
 const courtResponse=operation=>{const record='<Dosar><numar>1/2/2026</numar><institutie>PJ-CURTE-DE-TEST</institutie><data>2025-12-01</data><obiect>Verificare publică</obiect><stadiuProcesual>Fond</stadiuProcesual><dataModificare>2026-10-01</dataModificare><parti><DosarParte><nume>Parte publică</nume><calitateParte>Reclamant</calitateParte></DosarParte></parti><sedinte><DosarSedinta><data>2026-11-02</data><ora>10:00</ora><solutieSumar>Soluție publică integrală</solutieSumar></DosarSedinta></sedinte></Dosar>';
  return new Response(soap('<'+operation+'Response><'+operation+'Result>'+record+'</'+operation+'Result></'+operation+'Response>'),{headers:{'content-type':'text/xml'}})};
  const lawSoapResponse=body=>String(body).includes('<GetToken ')?new Response(soap('<GetTokenResult>test-token</GetTokenResult>'),{headers:{'content-type':'text/xml'}}):new Response(soap('<SearchResult><a:Legi><a:Titlu>LEGE de verificare</a:Titlu><a:TipAct>lege</a:TipAct><a:LinkHtml>https://legislatie.just.ro/Public/DetaliiDocument/70001</a:LinkHtml><a:Text>Text SOAP recent preluat.</a:Text></a:Legi></SearchResult>'),{headers:{'content-type':'text/xml'}});
  // Pagina oficială DetaliiDocument (familia legal/act-page, sonda Wave B): fișa actului cu
  // titlul, emitentul, publicația și istoricul versiunilor cu adresele oficiale — forma de
  // bază + consolidarea aplicabilă astăzi + o versiune viitoare, după anatomia paginii reale.
  const actPage=()=>{return '<!DOCTYPE html><html><head><meta name="title" content="LEGE de verificare pentru fișa actului"></head><body><span id="fisaact"></span><div id="istoric_fa"><span>Forma de bază</span><a href="/Public/DetaliiDocument/70001" title="Forma de bază">01.01.2025</a><a href="/Public/DetaliiDocument/70002" title="Consolidarea din 01.01.2026">01.01.2026</a><a href="/Public/DetaliiDocument/70003" title="Consolidarea viitoare">01.01.2027</a></div><span class="S_HDR">LEGE de verificare pentru fișa actului</span><span class="S_EMT_BDY">Parlamentul României</span><span class="S_PUB_BDY">Monitorul Oficial, Partea I nr. 1</span><span class="S_ART"><span class="S_ART_TTL">Articolul 1</span><span class="S_ART_BDY"><span class="S_PAR">Textul integral al actului de verificare, 1 & 2.</span></span></span><script>doNotRun()</script></body></html>'};
 const rssFixture=host=>{const item=n=>'<item><title>Anunț public '+(n+1)+' — '+host+'</title><link>https://'+host+'/anunt-'+n+'</link><pubDate>Tue, 06 Oct 2026 08:0'+n+':00 GMT</pubDate><description>Descriere integrală.</description><content:encoded><![CDATA[<p>Conținut complet '+host+'.</p>]]></content:encoded></item>';return new Response('<rss><channel>'+item(0)+item(1)+'</channel></rss>',{headers:{'content-type':'application/rss+xml'}})};
  const ckanBody={success:true,result:{count:1,results:[{id:'c20c6438-91ec-4204-a8df-c3d7c5fb47aa',name:'dataset-verificare',title:'Set de date de verificare',organization:{title:'Organizația publică de test'},metadata_modified:'2026-10-01T00:00:00',license_title:'Date deschise',num_resources:0,resources:[],notes:'Descriere completă.'}],search_facets:{organization:{items:[{name:'org-test',display_name:'Organizația publică de test'}]},res_format:{items:[{name:'csv',display_name:'CSV'}]}}}};
 const schoolsBody=()=>({success:true,result:{total:22,fields:[{id:'_id'},{id:'Numarul'},{id:'Nume scola'},{id:'Localitate unitate'},{id:'Judet PJ'}],records:Array.from({length:20},(_,i)=>({'_id':i,'Numarul':19561300+i,'Nume scola':'Școala Gimnazială de Verificare '+i,'Localitate unitate':'București','Judet PJ':'București'}))}});
  const cnasResource={health:'CLINIC',pharmacies:'FARM',hospitals:'SPITAL'};
  const cnasBody=family=>({success:true,result:{resources:[{name:'Lista furnizori cu drept de decont '+cnasResource[family.split('/')[1]]+' 31.03.2026',url:'https://data.gov.ro/dataset/lista-furnizori/resource/export-de-verificare.xlsx',format:'XLSX',last_modified:'2026-04-01T00:00:00'}]}});
  const cnasXlsx=()=>{const XLSX=require('xlsx');const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Nume furnizor','CUI cod','Localitate','Judet'],['Furnizor public de verificare 1','12345','București','București'],['Furnizor public de verificare 2','12456','Cluj-Napoca','Cluj']]),'CLINIC');return new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}))};
   // Reuniunea firmelor cu registrele publice CKAN (Wave B). Dovezile coloanelor: sonda live a
   // exportului FARM (data.gov.ro, 2026-10-08) și citirile edițiilor cache-uite ale propriului
   // worker publicat arată că toate cele trei ediții CNAS 31.03.2026 publică „Cod fiscal
   // furnizor”; „CUI cod” este numele de coloană fixat de fixture-ul pinned al directoarelor
   // (edițiile anterioare), pe care reuniunea îl acceptă al doilea — mock-ul exercită câte un
   // registru pe fiecare nume acceptat, ca ambele căi de potrivire să rămână fixate. Rândurile
   // purtătoare de CUI-ul firmei de verificare dovedesc potrivirea exactă pe cheie; registrul
   // fără potrivire dovedește absența onestă.
  const companyCnasMeta=()=>({success:true,result:{resources:['health','pharmacies','hospitals'].map(kind=>({name:'Contracte '+cnasResource[kind]+' 31.03.2026.xls',url:'https://data.gov.ro/dataset/lista-furnizori/resource/export-firme-'+cnasResource[kind]+'-de-verificare.xls',format:'XLS',last_modified:'2026-04-01T00:00:00'}))}});
  const companyCnasXlsx=href=>{const XLSX=require('xlsx');const kind=['health','pharmacies','hospitals'].find(candidate=>href.includes('export-firme-'+cnasResource[candidate]+'-de-verificare')),workbook=XLSX.utils.book_new();
   const rows=kind==='pharmacies'
    ?[['Numar contract','Cod fiscal furnizor','Tip furnizor','Nume furnizor','Cod CAS','Nume CAS'],['478','10055437','Farmacie','SC TERRA FARM SRL','CAS-AR','CAS ARAD'],['479','427282','Farmacie','Firma de verificare ANAF','CAS-B','CAS BUCUREŞTI']]
    :kind==='health'
     ?[['Nume furnizor','CUI cod','Localitate','Judet'],['Furnizor public de verificare 1','12345','București','București'],['Furnizor public de verificare 2','12456','Cluj-Napoca','Cluj']]
     :[['Nume furnizor','CUI cod','Localitate','Judet'],['Spital public de verificare','427282','București','București'],['Spitalul filial al firmei de verificare','427282','Giurgiu','Giurgiu'],['Spital fără CUI comun','12456','Cluj-Napoca','Cluj']];
   XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Contracte');return new Uint8Array(XLSX.write(workbook,{type:'buffer',bookType:'xls'}))};
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
   if(family.family==='legal/act-page')return new Response(actPage(),{headers:{'content-type':'text/html'}});
   if(family.family==='courts/portal.just')return courtResponse(String(init?.headers?.SOAPAction||'').includes('CautareDosare2')?'CautareDosare2':'CautareDosare');
   if(family.family==='feeds/stiri')return rssFixture(host);
   if(family.family==='catalog/ckan')return Response.json(ckanBody);
   if(family.family==='directory/schools')return Response.json(schoolsBody());
    if(family.family==='flights/adsb')return adsbBody();
    if(family.family==='events/operanationalacluj'||family.family==='events/search'&&host==='operacluj.ro')return new Response(operaclujBody(),{headers:{'content-type':'application/json'}});
    if(family.family==='housing/anl'||family.family==='housing/ancpi')return href.includes('package_show')?Response.json(family.family==='housing/anl'?anlBody():ancpiBody()):new Response(family.family==='housing/anl'?anlXlsx():ancpiXlsx(),{headers:{'content-type':'application/vnd.ms-excel'}});
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
 const counters=[],successPayloads=new Map();let cellCount=0,tranzyCalls=null;
 const withMocks=async(family,scenario,run)=>{
  const original=globalThis.fetch,counts=new Map(),unexpected=[],allowed=new Set(family.allowed);
  // Modulele compilate capturează obiectul de mediu o singură dată la încărcare,
  // deci cheia Tranzy se comută per celulă mutând acest obiect partajat; fără
  // cheie (celulele „nokey” și „invalid”) nicio adresă a sursei nu se interoghează.
  tranzyCalls=family.kind==='tranzy'?[]:null;
  if(family.kind==='tranzy'){if(scenario==='nokey'||scenario==='invalid')delete globalThis.__aflivraTestEnv.TRANZY_API_KEY;else globalThis.__aflivraTestEnv.TRANZY_API_KEY='stub-key-de-verificare'}
   // Tokenul rutelor de depunere se comută la fel: fără el (celulele „relay-noauth”)
   // poarta se închide înainte de orice stocare, cu el restul celulelor depun onest.
   if(family.kind==='bia'||family.kind==='adsb'){if(scenario==='relay-noauth')delete globalThis.__aflivraTestEnv.REFRESH_TOKEN;else globalThis.__aflivraTestEnv.REFRESH_TOKEN='token-relay-de-verificare'}
  globalThis.fetch=async(url,init={})=>{
   init?.signal?.throwIfAborted?.();
   const href=String(url),host=href.match(/^https?:\/\/([^/?#]+)/)?.[1]||'';
   counts.set(host,(counts.get(host)||0)+1);
   if(family.kind==='tranzy')tranzyCalls.push({path:href.replace('https://api.tranzy.ai/v1/opendata',''),headers:{...(init.headers||{})}});
   if(!allowed.has(host)){unexpected.push(href);return new Response(null,{status:404})}
   // Celulele familiei Tranzy sunt conștiente de cale: lista operatorilor și fluxul
   // vehiculelor au avarii distincte în sonda de referință (operatorul cade înainte
   // ca fluxul să fie cerut; celula warm păstrează operatorul și avariază fluxul).
   if(family.kind==='tranzy'){
    const call=tranzyCalls[tranzyCalls.length-1];
    if(call.path==='/agency')return scenario==='http500'?new Response(null,{status:500}):Response.json(tranzyAgenciesBody());
    if(call.path==='/vehicles'){
     if(scenario==='http500')return new Response(null,{status:500});
     if(scenario==='http403')return new Response(JSON.stringify({message:'Forbidden resource',error:'Forbidden',statusCode:403}),{status:403,headers:{'content-type':'application/json'}});
     if(scenario==='malformed')return new Response('<html>răspuns nevalid</html>',{headers:{'content-type':'text/html'}});
     return Response.json(tranzyVehiclesBody())}
    return new Response(null,{status:404})}
     // Celulele familiei BIA sunt conștiente de clasa relaiei: panoul zilei se predă
     // prin ruta de depunere, iar sursa respinge orice server cu testul de browser —
     // exact nota pe care încărcătorul o raportează onest, fără 403 crud.
     if(family.kind==='bia'){
      if(scenario==='http500')return new Response(null,{status:500});
      if(scenario!=='invalid')return biaChallenge();
      return new Response(biaBoardBody(),{headers:{'content-type':'application/json'}})}
     // Celulele de relaie ale avioanelor întâlnesc clasa ei: rețeaua serverului (Worker)
     // este respinsă de adsb.lol cu 429 — tura externă de intermediar predă cele patru
     // panouri de acoperire prin ruta de depunere, iar după predare citirea servește
     // copia fără să reinterogheze sursa.
     if(family.kind==='adsb'&&scenario.startsWith('relay-'))return new Response(null,{status:429,headers:{'retry-after':'120'}});
    // Căutarea națională a spectacolelor reunește calendarele: gazda proprie a familiei
    // poartă avaria celulei, iar celălalt calendar al registrului servește în continuare
    // prin propriul fixture — reuniunea degradează onest, nu dispare.
    if(family.family==='events/search'&&host==='teatrul-odeon.ro')return odeonPage();
    // Registrul CKAN al firmelor se citește de rută în paralel cu ANAF: adresa are propria ei
    // gazdă, deci fixture-ul CNAS se servește pe gazdă, înaintea clasificării pe familia-gazdă.
    if(family.family==='company/anaf'&&host==='data.gov.ro')return href.includes('package_show')?Response.json(companyCnasMeta()):new Response(companyCnasXlsx(href),{headers:{'content-type':'application/vnd.ms-excel'}});
    if(host===family.host&&scenario!=='success')return failureFor(scenario,init);
   if(host===family.host)return successFor(family,href,host,init);
   if(host==='query.wikidata.org')return Response.json({results:{bindings:[]}});
   return rssFixture(host);
   };
   globalThis.__aflivraAssetFault=family.kind==='trains'&&scenario==='malformed'?'trains':null;
     try{return await run(counts,unexpected)}finally{if(family.kind==='tranzy')delete globalThis.__aflivraTestEnv.TRANZY_API_KEY;if(family.kind==='bia'||family.kind==='adsb')globalThis.__aflivraTestEnv.REFRESH_TOKEN='token-relay-de-verificare';globalThis.fetch=original;globalThis.__aflivraAssetFault=null}};
  const requestFor=(family,scenario)=>{
   const route=(family.scenarioRoutes||{})[scenario]||family.route;
   if(family.method==='POST'){const body=JSON.stringify(family.body);return new Request('https://verify.test'+route,{method:'POST',body,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}})}
   return new Request('https://verify.test'+route)};
  const callRoute=async(family,scenario)=>{const handler=family.method==='POST'?routes[family.routeName].POST:routes[family.routeName].GET;return handler(requestFor(family,scenario))};
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
   const anaf=hostCount('webservicesp.anaf.ro'),wikidata=hostCount('query.wikidata.org'),ckan=hostCount('data.gov.ro');
   assert.equal(Array.isArray(payload?.data?.sources)&&payload.data.sources.length,scenario==='success'||scenario==='warm-http500'?5:2,label+': compozitul păstrează ambele surse'+(scenario==='success'||scenario==='warm-http500'?' și registrele CKAN citibile':''));
   const knowledge=payload.data.sources.find(source=>source.key==='knowledge-company:427282');
   assert(knowledge,label+': starea Wikidata este prezentă');assert(['fresh','cached'].includes(knowledge.status),label+': sursa sănătoasă rămâne disponibilă');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);assert.equal(payload.data.name,'Firma de verificare ANAF',label+': identitatea fiscală servită');assert.equal(payload.data.history.length,3,label+': toți cei trei ani de bilanț');assert.equal(anaf,4,label+': un acces per componentă ANAF');assert.equal(wikidata,1,label+': un acces Wikidata');
    assert.equal(payload.data.history.at(-1).caenLabel,'Activitatea CAEN publicată în bilanț',label+': denumirea codului CAEN din bilanț este păstrată, nu eliminată la analiză');
    assert.equal(payload.data.vatFrom,'2007-06-13',label+': intervalul de înregistrare în scopuri TVA este promovat tipizat');
    assert.equal(ckan,6,label+': registrele CKAN, metadatele și exportul pe fiecare fel, câte un acces');
    const registries=payload.data.publicRegistries||[];
    assert.equal(registries.length,3,label+': cele trei registre CNAS citibile alăturate firmei');
    const farmacii=registries.find(registry=>registry.kind==='pharmacies');
    assert(farmacii,label+': registrul farmaciilor este prezent');assert.equal(farmacii.records.length,1,label+': potrivirea pe coloana „Cod fiscal furnizor" publicată de registru');    assert.equal(farmacii.records[0]['Nume furnizor'],'Firma de verificare ANAF',label+': rândul servit este cel al cărui CUI corespunde exact');
    const spitale=registries.find(registry=>registry.kind==='hospitals');
    assert.equal(spitale.records.length,2,label+': mai multe rânduri cu același CUI rămân rânduri distincte, fără îmbinare');
    const clinici=registries.find(registry=>registry.kind==='health');
    assert.equal(clinici.records.length,0,label+': registrul fără potrivire rămâne absență onestă, nu câmp inventat');
    for(const registry of [farmacii,spitale])assert(payload.data.sources.some(source=>source.key==='directory:'+registry.kind),label+': fiecare registru citibil își expune starea proprie');
    assert(payload.data.provenance['cnasFarmacii']&&payload.data.provenance['cnasSpitale'],label+': proveniența fiecărui registru cu potrivire este înregistrată');
    assert(!payload.data.provenance['cnasClinici'],label+': fără proveniență inventată pentru registrul fără potrivire')}
   else{assert.match(e,/ANAF nu a returnat/,label+': plicul de eroare ANAF documentat');
    if(scenario==='warm-http500'){assert.equal(payload.status,'stale',label+': copia validă servește sub 500 ANAF');assert.equal(payload.data.name,'Firma de verificare ANAF',label+': copia păstrată este cea verificată');assert.equal(anaf,12,label+': cele trei încercări per componentă');assert.equal(wikidata,0,label+': sursa sănătoasă nu se reinteroghează');
     assert.equal(payload.data.publicRegistries.length,3,label+': copia validă păstrează registrele CKAN alăturate');assert.equal(ckan,0,label+': registrele servite din copie nu se reinteroghează')}
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
  if(family.family==='legal/act-page'){
   const attempts=hostCount('legislatie.just.ro');
   if(scenario==='success'){assert.equal(payload.status,'fresh',label);const act=payload.data.items[0];
    assert.equal(act.id,'https://legislatie.just.ro/Public/DetaliiDocument/70001',label+': identitatea oficială a actului deschis');
    assert.equal(act.sourceUrl,'https://legislatie.just.ro/Public/DetaliiDocument/70002',label+': forma aplicabilă este cea din istoricul oficial');
    assert(act.text.includes('Textul integral al actului de verificare'),label+': textul integral al paginii oficiului');
    assert.equal(act.issuer,'Parlamentul României',label+': emitentul din fișa paginii');
    assert.equal(act.publication,'Monitorul Oficial, Partea I nr. 1',label+': publicația din fișa paginii');
    assert.equal(act.consolidation.versionId,'70002',label+': versiunea selectată în istoric');
    assert.deepEqual(act.consolidation.versionHistory.map(version=>[version.id,version.kind,version.date]),[['70001','base','2025-01-01'],['70002','consolidated','2026-01-01'],['70003','consolidated','2027-01-01']],label+': istoricul versiunilor (datele evenimentelor) revine întreg, pe adresele oficiale');
    assert(act.consolidation.versionHistory.every(version=>/^\d{1,9}$/.test(version.id)),label+': fiecare versiune poartă un identificator oficial validat');
    assert.equal(attempts,2,label+': pagina de bază și forma selectată, câte un acces')}
   else if(scenario==='warm-http500'){assert.ok(['cached','stale'].includes(payload.status),label+': copia înregistrată servește fără reinterogare');assert(payload.data.items[0].text.includes('Textul integral al actului de verificare'),label+': textul se păstrează din copia înregistrată');assert.equal(attempts,0,label+': înregistrarea proaspătă se reutilizează o oră fără să reinterogheze portalul')}
   else{assert.equal(payload.status,'unavailable',label+': fără copie, starea documentată');assert.equal(payload.data,null,label+': fără formă sau istoric inventat');
    // The portal circuit cushions every page failure class into its honest pause message; the
    // underlying HTTP class stays recorded in the circuit row, not in the reader envelope.
    if(scenario==='http500'||scenario==='http429'||scenario==='timeout')assert.match(e,/nu poate transmite textul acum/,label+': mesajul clasei de pauză al circuitului portalului');
    if(scenario==='malformed')assert.match(e,/(?:integral|istoric)/,label+': pagina nevalidă respinsă în română, fără formă publicată');
    assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
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
  if(family.family==='transport/tranzy'){
   const at=path=>tranzyCalls?tranzyCalls.filter(call=>call.path===path).length:0;
   if(scenario==='success'){
    assert.equal(payload.status,'fresh',label+': stare proaspătă — primit: '+payload.status+', eroare: '+payload.error);
    assert.equal(payload.data.items.length,3,label+': pozițiile utilizabile servite (valabil + păstrat + fără viteză)');
    assert.equal(payload.data.entityCount,5,label+': numărul publicat de rânduri se păstrează');
    assert.equal(payload.data.agency,'CTP Cluj-Napoca SA',label+': operatorul localizat este numit');
    assert.equal(payload.data.isLive,true,label+': fluxul marcat live');
    const first=payload.data.items.find(item=>item.id==='tz-1');
    assert.equal(first.routeId,'25',label+': route_id numeric → linie text');
    assert.equal(first.vehicleName,'Tramvaiul 101',label+': eticheta vehiculului');
    assert.equal(first.bearing,null,label+': Tranzy nu publică direcția — fără direcție inventată');
    assert.equal(first.speed,9.7,label+': viteza (m/s, convenția GTFS-RT) se păstrează');
    assert.equal(first.occupancy,null,label+': fără ocupare publicată');
    assert.equal(first.occupancyPercentage,null,label+': fără procent de ocupare inventat');
    assert.equal(first.wheelchairAccessible,'WHEELCHAIR_ACCESSIBLE',label+': accesibilitatea publicată se păstrează');
    assert.match(first.observedAt,/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,label+': momentul poziției, UTC ISO');
    assert.equal(first.details.label,'Tramvaiul 101',label+': detaliile publicate rămân la îndemână');
    assert(payload.data.items.some(item=>item.id==='tz-stale'),label+': poziția mai veche se păstrează (isLive o marchează separat)');
    assert.equal(at('/agency'),1,label+': un singur acces la lista operatorilor');
    assert.equal(at('/vehicles'),1,label+': un singur acces la fluxul operatorului');
    assert(tranzyCalls.every(call=>call.headers['X-API-KEY']==='stub-key-de-verificare'),label+': cheia merge doar în antet, spre familia permisă');
    assert.equal(tranzyCalls.find(call=>call.path==='/vehicles').headers['X-Agency-Id'],'1',label+': antetul X-Agency-Id desemnează operatorul rezolvat')}
   else if(scenario==='warm-http500'){
    assert.equal(payload.status,'stale',label+': copia validă servește sub 500');
    assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');
    assert.equal(payload.data.items.length,3,label+': pozițiile din copia validă se păstrează');
    assert.equal(at('/vehicles'),3,label+': cele trei încercări asupra fluxului se epuizează');
    assert.equal(at('/agency'),0,label+': operatorul servit corect nu se reinteroghează')}
   else if(scenario==='nokey'){
    assert.equal(payload.status,'unavailable',label+': starea documentată');
    assert.equal(payload.data,null,label+': fără date inventate');
    assert.match(e,/cheia de acces TRANZY_API_KEY/,label+': nota onestă de clasă blocată');
    assert.equal(tranzyCalls.length,0,label+': sursa nu este interogată fără cheie');
    await assert.rejects(realtimeModule.tranzyAgenciesLoader.load(),/cheia de acces TRANZY_API_KEY/,label+': loaderul operatorilor refuză onest');
    await assert.rejects(realtimeModule.tranzyVehiclesLoader(tranzyClujAgency()).load(),/cheia de acces TRANZY_API_KEY/,label+': loaderul vehiculelor refuză onest')}
   else if(scenario==='http403'){
    assert.equal(payload.status,'unavailable',label+': starea documentată');
    assert.equal(payload.data,null,label+': fără poziții inventate');
    assert.match(e,/HTTP 403/,label+': codul sursei păstrat în plicul de eroare');
    assert.equal(at('/vehicles'),1,label+': un singur acces — fără furtună de reîncercări');
    assert(Date.parse(payload.nextAttemptAt)>Date.now(),label+': pauza de reîncercare este programată')}
   else if(scenario==='http500'){
    assert.equal(payload.status,'unavailable',label+': starea documentată');
    assert.equal(payload.data,null,label+': fără operatori inventați');
    assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    assert.equal(at('/agency'),3,label+': cele trei încercări la lista operatorilor se epuizează');
    assert.equal(at('/vehicles'),0,label+': fluxul fără operator rezolvat nu este interogat')}
   else if(scenario==='malformed'){
    assert.equal(payload.status,'unavailable',label+': starea documentată');
    assert.equal(payload.data,null,label+': fără date parțial inventate');
    assert.match(e,/Fluxul Tranzy nu poate fi decodat|Sursa nu a putut fi verificată/,label+': plicul de eroare în română');
    assert.equal(at('/vehicles'),1,label+': un singur acces la fluxul nevalid')}
   else if(scenario==='unmatched'){
    assert.equal(payload.status,'unavailable',label+': starea documentată');
    assert.equal(payload.data,null,label+': fără poziții inventate');
    assert.match(e,/operator Tranzy.*Zărnești/i,label+': nota onestă: operator neidentificat');
    assert.equal(at('/vehicles'),0,label+': fluxul altui oraș nu este interogat')}
   else if(scenario==='invalid'){
    assert.equal(payload.error,'Filtre invalide.',label+': plicul de eroare al filtrelor');
    assert.equal(tranzyCalls.length,0,label+': sursa nu este interogată pe filtre invalide')}}
  if(family.family==='flights/adsb'){
   const attempts=hostCount('api.adsb.lol');
   const relayPost=(payload,headers={})=>routes['seed-flights'].POST(new Request('https://verify.test/api/seed/flights',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)}));
   const flightsState=async()=>(await routes['flights'].GET(new Request('https://verify.test/api/flights'))).json();
   if(scenario==='invalid'){
    assert.equal(payload.error,'Filtre invalide.',label+': plicul de eroare al filtrelor');
    assert.equal(attempts,0,label+': sursa nu este interogată pe filtre invalide')}
   else if(scenario==='success'){
    assert.equal(payload.status,'fresh',label+': stare proaspătă — primit: '+payload.status+', eroare: '+payload.error);
    assert.equal(payload.data.items.length,3,label+': doar aeronavele din chenarul românesc sunt servite');
    assert.equal(payload.data.entityCount,4,label+': cele patru cereri de acoperire se reunesc fără dubluri');
    assert.equal(payload.data.isLive,true,label+': fluxul marcat live');
    assert.equal(payload.data.stalenessMinutes,undefined,label+': fluxul viu nu poartă vechime');
    const airborne=payload.data.items.find(x=>x.hex==='481f55');
    assert.equal(airborne.callsign,'W6XYZ',label+': indicativul se curăță de spațiile sursei');
    assert.equal(airborne.registration,'HA-LMN',label+': imatricularea se păstrează');
    assert.equal(airborne.altitudeFt,30500,label+': altitudinea barometrică în picioare');
    assert.equal(airborne.groundSpeedKt,448.1,label+': viteza față de sol în noduri');
    assert.equal(airborne.track,270.5,label+': direcția de zbor se păstrează pentru săgeata de pe hartă');
    const ground=payload.data.items.find(x=>x.hex==='4a1b2c');
    assert.equal(ground.onGround,true,label+': rândul „ground” rămâne onest');
    assert.equal(ground.altitudeFt,null,label+': fără altitudine inventată la sol');
    assert.equal(ground.callsign,null,label+': fără indicativ inventat');
    assert.equal(attempts,4,label+': o singură trecere prin cele patru cereri de acoperire')}
   else if(scenario==='http429'){
    // Clasa egress-ului respins, tradusă onest în nota de intermediar — codul sursei
    // rămâne vizibil, iar copia se reîmprospătează prin tura externă.
    assert.equal(payload.status,'unavailable',label+': starea documentată');
    assert.equal(payload.data,null,label+': fără aeronave inventate');
    assert.match(e,/a respins rețeaua serverului/,label+': nota onestă a clasei de intermediar');
    assert.match(e,/HTTP 429/,label+': codul sursei rămâne în nota de intermediar');
    assert.match(e,/intermediar extern/,label+': nota numește tura de intermediar extern');
    assert.ok(Date.parse(payload.nextAttemptAt)>Date.now(),label+': pauza de reîncercare a sursei este programată');
    assert.equal(attempts,4,label+': cele patru cereri de acoperire, o singură trecere')}
   else if(scenario==='warm-http500'){
    assert.equal(payload.status,'stale',label+': copia validă servește sub 500');
    assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');
    assert.equal(payload.data.items.length,3,label+': pozițiile din copia validă se păstrează');
    assert.equal(payload.data.isLive,false,label+': copia veche nu se mai marchează live');
    assert.ok(payload.data.stalenessMinutes===0||payload.data.stalenessMinutes===1,label+': vechimea onestă a copiei, în minute de la ultima preluare validă');
    assert.equal(attempts,12,label+': cele trei încercări pe fiecare dintre cele patru cereri')}
   else if(scenario==='relay-noauth'){
    assert.equal(payload.status,'unavailable',label+': citirea de fond rămâne onest indisponibilă');
    assert.match(e,/a respins rețeaua serverului/,label+': nota clasei se servește onest');
    const denied=await relayPost({boards:[adsbBoardText(),adsbBoardText(),adsbBoardText(),adsbBoardText()]});
    assert.equal(denied.status,401,label+': fără token Bearer depunerea se respinge cu 401');
    assert.deepEqual(await denied.json(),{error:'Acces interzis.'},label+': mesajul 401 este generic');
    const after=await flightsState();
    assert.equal(after.status,'unavailable',label+': depunerea respinsă nu a publicat nimic');
    assert.equal(attempts,4,label+': sursa rămâne interogată doar de citirea proprie a celulei')}
   else if(scenario==='relay-partial'){
    const rejected=await relayPost({boards:[adsbBoardText(),adsbBoardText()]},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(rejected.status,400,label+': livrul scurt de acoperire se respinge cu 400');
    assert.match(String((await rejected.json()).error),/cereri fixe de acoperire națională/,label+': fără cadran tăcut — livrul incomplet nu se publică ca spațiu aerian întreg');
    const after=await flightsState();
    assert.equal(after.status,'unavailable',label+': livrul respins nu a publicat nimic');
    assert.equal(attempts,4,label+': doar citirea proprie a celulei a interogat sursa')}
   else if(scenario==='relay-corrupt'){
    const rejected=await relayPost({boards:[adsbBoardText(),adsbBoardText(),adsbBoardText(),'<html>flux nevalid</html>']},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(rejected.status,400,label+': panoul de acoperire care nu se poate decoda se respinge cu 400');
    assert.match(String((await rejected.json()).error),/nu poate fi decodat integral/,label+': mesajul de structură în română');
    const after=await flightsState();
    assert.equal(after.status,'unavailable',label+': panoul corupt nu a publicat nimic');
    assert.equal(attempts,4,label+': doar citirea proprie a celulei a interogat sursa')}
   else if(scenario==='relay-publish'){
    assert.equal(payload.status,'unavailable',label+': înainte de predare citirea e onest indisponibilă');
    const delivered=await relayPost({boards:[adsbBoardText(),adsbBoardText(),adsbBoardText(),adsbBoardText()]},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(delivered.status,200,label+': predarea celor patru panouri de acoperire rămâne 200');
    const confirmation=await delivered.json();
    assert.equal(confirmation.result,'ok',label+': rezultatul predării');
    assert.equal(confirmation.aircraft,3,label+': aeronavele din chenar, reunite fără dubluri');
    assert.equal(confirmation.hexes,4,label+': adresele Mode-S distincte, reunite ca pozițiile');
    const served=await flightsState();
    assert.ok(['fresh','cached'].includes(served.status),label+': după predare copia servește — primit: '+served.status);
    assert.equal(served.data.items.length,3,label+': pozițiile servite integral');
    assert.equal(served.data.entityCount,4,label+': reunirea rămâne un singur set de observate, nu patru');
    assert.equal(served.data.isLive,true,label+': copia proaspăt predată servește poziții vii');
    const airborne=served.data.items.find(x=>x.hex==='481f55');
    assert.equal(airborne.callsign,'W6XYZ',label+': indicativul servit se curăță de spațiile sursei');
    assert.equal(airborne.altitudeFt,30500,label+': altitudinea barometrică servită');
    assert.equal(attempts,4,label+': după predare citirea nu reinteroghează sursa respinsă')}
   else{
    assert.equal(payload.status,'unavailable',label+': fără copie, starea documentată');
    assert.equal(payload.data,null,label+': fără aeronave inventate');
    if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
    if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
    if(scenario==='malformed')assert.match(e,/nu poate fi decodat integral/,label+': fluxul nevalid respins în română');
    assert.equal(attempts,scenario==='http500'?12:4,label+': numărul documentat de accesări')}}
  if(family.family==='flights/bia'){
   const attempts=hostCount('bucharestairports.ro');
   const relayPost=(payload,headers={})=>routes['seed-bia'].POST(new Request('https://verify.test/api/seed/bia',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)}));
   const boardState=async()=>(await routes['flight-board'].GET(new Request('https://verify.test/api/flight-board?airport=henri-coanda'))).json();
   if(scenario==='norelay'){
    assert.equal(payload.status,'unavailable',label+': fără copie predată, starea documentată');
    assert.equal(payload.data,null,label+': fără curse inventate');
    assert.match(e,/nu a fost încă preluat/,label+': nota onestă a panoului preluat prin intermediar');
    assert.equal(attempts,1,label+': testul de browser al sursei se respinge cu o singură încercare')}
   else if(scenario==='relay-noauth'){
    assert.equal(payload.status,'unavailable',label+': citirea de fond rămâne onest indisponibilă');
    const denied=await relayPost({airport:'henri-coanda',body:biaBoardBody()});
    assert.equal(denied.status,401,label+': fără token Bearer depunerea se respinge cu 401');
    assert.deepEqual(await denied.json(),{error:'Acces interzis.'},label+': mesajul 401 este generic');
    const after=await boardState();
    assert.equal(after.status,'unavailable',label+': depunerea respinsă nu a publicat nimic');
    assert.equal(attempts,1,label+': sursa rămâne interogată doar de citirea proprie a celulei')}
   else if(scenario==='relay-airport'){
    const rejected=await relayPost({airport:'sibiu',body:biaBoardBody()},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(rejected.status,400,label+': aeroportul străin de panouri se respinge cu 400');
    assert.match(String((await rejected.json()).error),/nu face parte din panourile preluate/,label+': mesajul numește clasa aeroporturilor preluate');
    const after=await boardState();
    assert.equal(after.status,'unavailable',label+': aeroportul respins nu a publicat nimic');
    assert.equal(attempts,1,label+': o singură interogare a sursei blocată')}
   else if(scenario==='relay-corrupt'){
    const rejected=await relayPost({airport:'henri-coanda',body:'<html>panou nevalid</html>'},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(rejected.status,400,label+': panoul care nu se poate decoda se respinge cu 400');
    assert.match(String((await rejected.json()).error),/nu poate fi decodat integral/,label+': mesajul de structură în română');
    const after=await boardState();
    assert.equal(after.status,'unavailable',label+': panoul corupt nu a publicat nimic');
    assert.equal(attempts,1,label+': o singură interogare a sursei blocată')}
   else if(scenario==='relay-empty'){
    const rejected=await relayPost({airport:'henri-coanda',body:JSON.stringify([{origin:'Fără număr',destination:'București',direction:'A'},{flightNumber:'QR 000'}])},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(rejected.status,400,label+': panoul fără curse utilizabile se respinge onest');
    assert.match(String((await rejected.json()).error),/nu conține curse utilizabile/,label+': fără listă goală la rută')}
   else if(scenario==='invalid'){
    assert.equal(payload.error,'Filtre invalide.',label+': aeroportul necunoscut se respinge cu 400');
    assert.equal(attempts,0,label+': sursa nu este interogată pe filtre invalide')}
   else if(scenario==='relay-publish'){
    assert.equal(payload.status,'unavailable',label+': înainte de predare citirea e onest indisponibilă');
    const delivered=await relayPost({airport:'henri-coanda',body:biaBoardBody()},{authorization:'Bearer token-relay-de-verificare'});
    assert.equal(delivered.status,200,label+': predarea reușită rămâne 200');
    const confirmation=await delivered.json();
    assert.equal(confirmation.result,'ok',label+': rezultatul predării');
    assert.equal(confirmation.airport,'henri-coanda',label+': aeroportul predat');
    assert.equal(confirmation.arrivals,2,label+': sosirile numărate onest');
    assert.equal(confirmation.departures,1,label+': plecările numărate onest');
    assert.equal(confirmation.dropped,2,label+': rândurile fără câmpuri complete se numără, nu se inventează');
    const served=await boardState();
    assert.ok(['fresh','cached'].includes(served.status),label+': după predare copia servește — primit: '+served.status);
    assert.equal(served.data.arrivals.length,2,label+': sosirile servite integral');
    assert.equal(served.data.departures.length,1,label+': plecările servite integral');
    const first=served.data.arrivals[0];
    assert.equal(first.flightNumber,'W6 3187',label+': numărul zborului se păstrează');
    assert.equal(first.airline,'Wizz Air',label+': operatorul cu denumirea românească se alege din obiectul sursei');
    assert.equal(first.route,'Londra Luton · București',label+': ruta se compune din originea și destinația publicate');
    assert.equal(first.scheduledTime,'07:45',label+': ora publicată se păstrează ca textul sursei');
    assert.equal(first.status,'Aterizat',label+': starea publicată se păstrează');
    assert.equal(first.gate,'04',label+': poarta publicată se păstrează');
    assert.equal(served.data.arrivals[1].flightNumber,'OS 899',label+': denumirea de familie a câmpului de sens se acceptă tolerante');
    assert.equal(attempts,1,label+': după predare citirea nu reinteroghează sursa blocată')}
    else if(scenario==='warm-http500'){
     assert.equal(payload.status,'stale',label+': copia predată servește sub 500');
     assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');
     assert.equal(payload.data.arrivals.length,2,label+': panoul din copia validă se păstrează');
     assert.equal(payload.data.departures.length,1,label+': plecările din copia validă se păstrează');
     assert.equal(attempts,3,label+': cele trei încercări la sursa blocată se epuizează')}}
   if(family.family==='events/operanationalacluj'){
    const attempts=hostCount('operacluj.ro');
    if(scenario==='success'){
     assert.equal(payload.status,'fresh',label+': stare proaspătă — primit: '+payload.status+', eroare: '+payload.error);
     assert.equal(payload.data.venue.id,'operacluj',label+': instituția aleasă din registru servește');
     assert.equal(payload.data.items.length,2,label+': ediția românească se servește; rândul EN și cel fără oră publicată se omit');
     assert.equal(payload.data.publishedTotal,58,label+': totalul publicat de instituție se păstrează');
     const first=payload.data.items[0];
     assert.equal(first.title,'BOEMA DE VERIFICARE',label+': titlul spectacolului păstrat ca textul sursei');
     assert.equal(first.start,'2026-10-08T19:30',label+': data locală păstrată în formatul calendarului');
     assert.ok(first.url.startsWith('https://operacluj.ro/'),label+': adresa oficială a spectacolului');
     assert.ok(!payload.data.items.some(item=>item.url.includes('/en/')),label+': ediția EN a aceleiași apariții nu se dublează');
     assert.equal(first.category,'operă',label+': categoria publicată se păstrează');
     assert.equal(attempts,1,label+': un singur acces la calendarul public al instituției')}
    else if(scenario==='warm-http500'){
     assert.equal(payload.status,'stale',label+': copia validă servește sub 500');
     assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');
     assert.equal(payload.data.items.length,2,label+': spectacolele se păstrează din copie');
     assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
    else{
     assert.equal(payload.status,'unavailable',label+': fără copie, starea documentată');
     assert.equal(payload.data,null,label+': fără spectacole inventate');
     if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
     if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
     if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
     if(scenario==='malformed')assert.match(e,/Calendarul instituției nu are formatul așteptat/,label+': calendarul nevalid respins în română');
     assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
   if(family.family==='events/search'){
    const odeon=hostCount('teatrul-odeon.ro'),operacluj=hostCount('operacluj.ro');
    if(scenario==='invalid'){
     assert.equal(payload.error,'Căutare invalidă.',label+': plicul de eroare al căutării');
     assert.equal(odeon+operacluj,0,label+': calendarele registrului nu se interoghează pe filtre invalide')}
    else if(scenario==='success'){
     assert.equal(payload.key,'events:search',label+': cheia reuniunii naționale a spectacolelor');
     assert.equal(payload.status,'cached',label+': reuniunea completă servește starea de registru');
     assert.equal(payload.data.total,3,label+': totalul căutării naționale');
     assert.ok(payload.data.items.every(item=>item.venueName&&item.city),label+': fiecare rând purtă instituția și orașul din registru');
     assert.ok(payload.data.items[0].start.localeCompare(payload.data.items[payload.data.items.length-1].start)<=0,label+': rândurile reunite sunt ordonate cronologic');
     const sources=payload.data.sources;
     assert.equal(sources.length,2,label+': ambele calendare ale registrului sunt listate');
     assert.deepEqual(sources.map(source=>source.venue).sort(),['odeon','operacluj'],label+': sursele poartă instituția registrului');
     assert.equal(operacluj,1,label+': un singur acces la calendarul instituției căutate');
     assert.equal(odeon,1,label+': un singur acces la calendarul implicit')}
    else if(scenario==='warm-http500'){
     assert.equal(payload.status,'cached',label+': copia validă a calendarului expirat servește sub 500 — reuniunea rămâne completă');
     assert.equal(payload.data.items.length,3,label+': spectacolele se păstrează din copiile validate');
     const expired=payload.data.sources.find(source=>source.venue==='operacluj');
     assert.equal(expired.status,'stale',label+': starea calendarului expirat este documentată onest, nu mascată');
     assert.equal(operacluj,3,label+': cele trei încercări la calendarul expirat se epuizează');
     assert.equal(odeon,0,label+': calendarul servit corect nu se reinteroghează')}
    else{
     assert.equal(payload.status,'stale',label+': starea parțială a reuniunii este documentată');
     assert.match(e,/1 calendar public nu a putut fi verificat acum/,label+': mesajul onest de degradare parțială');
     assert.equal(payload.data.items.length,1,label+': rândurile calendarului disponibil rămân');
     assert.ok(payload.data.items.every(item=>item.venue==='odeon'),label+': doar calendarul disponibil servește rânduri');
     const failed=payload.data.sources.find(source=>source.venue==='operacluj');
     assert.ok(failed&&failed.status==='unavailable',label+': calendarul căzut este listat onest');
     assert.match(String(failed&&failed.error||''),/HTTP 500|HTTP 429|nu a răspuns în timpul alocat|formatul așteptat/,label+': eroarea calendarului căzut este purtată în sursă');
     assert.equal(operacluj,scenario==='http500'?3:1,label+': numărul documentat de accesări la calendarul căzut');
     assert.equal(odeon,1,label+': calendarul sănătos se citește o singură dată')}}
   if(family.family==='housing/anl'){
    const attempts=hostCount('data.gov.ro');
    if(scenario==='success'){
     assert.equal(payload.status,'fresh',label+': stare proaspătă — primit: '+payload.status+', eroare: '+payload.error);
     assert.equal(payload.data.total,336,label+': registrul amplasamentelor servit integral');
     assert.equal(payload.data.records.length,20,label+': pagina de registru servită paginată');
     assert.equal(payload.data.facets['Județele ANL'].length,42,label+': facetul județelor acoperă registrul');
     assert(payload.data.records.every(record=>record._id),label+': fiecare amplasament are identificator stabil');
     assert(payload.data.fields.some(field=>/^amplasament$/i.test(field)),label+': coloanele publicate se păstrează cu numele lor');
     assert.equal(payload.data.years.reduce((total,year)=>total+year.value,0),payload.data.unitsTotal,label+': seria pe anii de recepție se compune exact în totalul național publicat');
     assert.equal(attempts,2,label+': metadatele și exportul, câte un acces')}
    else if(scenario==='warm-http500'){
     assert.equal(payload.status,'stale',label+': copia validă servește sub 500');
     assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');
     assert.equal(payload.data.records.length,20,label+': registrul se păstrează din copie');
     assert.equal(payload.data.total,336,label+': totalul se păstrează din copie');
     assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
    else{
     assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');
     assert.equal(payload.data,null,label+': fără amplasamente inventate');
     if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
     if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
     if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
     if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată|Lista ANL/,label+': plicul de eroare standard sau structura respinsă');
     assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
   if(family.family==='housing/ancpi'){
    const attempts=hostCount('data.gov.ro');
    if(scenario==='success'){
     assert.equal(payload.status,'fresh',label+': stare proaspătă — primit: '+payload.status+', eroare: '+payload.error);
     assert.equal(payload.data.countyCount,42,label+': raportul lunar acoperă județele');
     assert.equal(payload.data.monthLabel,'ianuarie 2024',label+': luna raportată se păstrează ca etichetă');
     assert.equal(payload.data.byCounty.length,42,label+': tabelul pe județe servit integral');
     assert.equal(payload.data.byCounty[0].county,'BUCUREŞTI',label+': județul cu cele mai multe ipoteci servește primul');
     assert.deepEqual(payload.data.byType.map(row=>row.name).sort(),[...ancpiTypes].sort(),label+': cele șase feluri de proprietate publicate se păstrează');
     assert.equal(payload.data.total,payload.data.byCounty.reduce((total,row)=>total+row.total,0),label+': totalul național se compune exact din județele raportate');
     assert.equal(attempts,2,label+': metadatele și exportul, câte un acces')}
    else if(scenario==='warm-http500'){
     assert.equal(payload.status,'stale',label+': copia validă servește sub 500');
     assert.match(e,/HTTP 500/,label+': codul sursei în plicul de eroare');
     assert.equal(payload.data.countyCount,42,label+': raportul se păstrează din copie');
     assert.equal(attempts,3,label+': cele trei încercări se epuizează')}
    else{
     assert(['unavailable','stale'].includes(payload.status),label+': starea documentată');
     assert.equal(payload.data,null,label+': fără ipoteci inventate');
     if(scenario==='http500')assert.match(e,/HTTP 500/,label+': codul sursei păstrat');
     if(scenario==='http429')assert.match(e,/HTTP 429/,label+': pauza sursei păstrată');
     if(scenario==='timeout')assert.match(e,/nu a răspuns în timpul alocat/,label+': expirarea descrisă în română');
     if(scenario==='malformed')assert.match(e,/Sursa nu a putut fi verificată|Raportul ANCPI/,label+': plicul de eroare standard sau structura respinsă');
     assert.equal(attempts,scenario==='http500'?3:1,label+': numărul documentat de accesări')}}
  };
 const runCell=(family,scenario)=>{const label=family.family+' / '+scenario,mock=scenario==='warm-http500'?'http500':scenario;
  return withMocks(family,mock,async(counts,unexpected)=>{
   assert.equal(unexpected.length,0,label+': doar adresele familiei sunt interogate ('+unexpected.join(', ')+')');
   const response=await callRoute(family,scenario),payload=await response.json();
   cellCount++;counters.push({family:family.family,scenario});
   if(scenario==='invalid')assert.equal(response.status,400,label+': filtrele invalide sunt respinse cu 400, fără interogarea sursei');
   else degradeCheck(label,response,payload);
   await familyExpectations(family,scenario,payload,counts,label);
   return payload})};
 for(const family of families){
  for(const scenario of (family.scenarios||['http500','http429','timeout','malformed','success'])){wipe();const payload=await runCell(family,scenario);if(scenario==='success')successPayloads.set(family.family,payload)}
  sqlite.prepare('UPDATE source_cache SET expires_at=0 WHERE key=?').run(family.key());
  await runCell(family,'warm-http500');
 }
   console.log('Matricea de avarie a trecut: familiile din matricea generală trec HTTP 500 cu cele trei încercări epuizate, pauza 429, expirarea timpului, răspunsul nevalid și răspunsul de succes, familia Tranzy, poartă de mediu, parcurge celulele sondei ei de referință — fără cheia de acces nicio adresă nu se interoghează, cheia respinsă (HTTP 403) se raportează cu o singură încercare și pauză programată, operatorul neidentificat nu interoghează fluxul altui oraș, iar filtrele invalide sunt respinse cu 400 fără interogarea sursei —, familia avioanelor adsb.lol reunește cele patru cereri de acoperire în chenarul românesc fără dubluri și, suplimentată de intermediar, își parcurge celulele proprii — egress-ul respins (HTTP 429) se traduce onest în nota de tură de intermediar cu codul sursei păstrat, depunerea fără token, livrul scurt și panoul corupt se resping fără să publice nimic, iar după predarea celor patru panouri citirea servește pozițiile fără să reinterogheze sursa —, panoul BIA, preluat de relaie, își parcurge celulele proprii — fără copie predată testul de browser al sursei se raportează onest printr-o singură încercare, depunerea fără token și cu aeroport sau panou nevalid se respinge fără să publice nimic, iar după predarea reușită citirea servește panoul fără să reinterogheze sursa —, calendarul tribe-events al Operei Cluj servește ediția românească fără dublura EN și rândul fără oră, căutarea națională a spectacolelor reunește calendarele registrului — avaria unei instituții degradează onest reuniunea, copia validă servește sub 500, iar calendarul sănătos nu se reinteroghează —, iar registrele imobiliare ANL și ANCPI servesc edițiile publicate cu seria pe ani care se compune exact în totalul național, respectiv luna raportată și cele șase feluri de proprietate; ruta locală răspunde mereu 200 în afara celor 400 documentate, păstrează copia validă, prezintă codul HTTP al sursei în plicul de eroare și nu reinteroghează sursele servite corect.');
 console.log(JSON.stringify({result:'ok',mode:'mock',families:families.length,cells:cellCount,perFamily:families.map(family=>({family:family.family,cells:counters.filter(cell=>cell.family===family.family).length}))}));
 }
escapes.length=0;process.off('unhandledRejection',recordEscape);process.off('uncaughtExceptionMonitor',recordEscape);}
finally{delete globalThis.__aflivraTestEnv;delete globalThis.__aflivraResourceCopies;if(!live)sqlite.close();await rm(temp,{recursive:true,force:true})}
