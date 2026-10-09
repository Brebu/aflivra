import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {readSnapshotFile as readFile} from './snapshot-read.mjs';

const root=resolve(import.meta.dirname,'..'),dir=await mkdtemp(join(tmpdir(),'aflivra-geographic-')),require=createRequire(import.meta.url),prepared=new Map(),originalFetch=globalThis.fetch;
const fileFor=path=>join(dir,path.replace(/[^a-z0-9]/gi,'_')+'.mjs');
async function prepare(path){
 if(prepared.has(path))return prepared.get(path);const output=fileFor(path);prepared.set(path,output);
 let source=path==='lib/live/request-context.ts'?'export const liveContext=()=>null;':await readFile(join(root,path),'utf8');
 for(const match of [...source.matchAll(/import (\w+) from ['"]((?:@\/|\.\/|\.\.\/)[^'"]+\.json)['"];?/g)])source=source.replace(match[0],'const '+match[1]+'='+await readFile((match[2].startsWith('@/')?join(root,match[2].slice(2)):resolve(root,dirname(path),match[2])),'utf8')+';');
 source=source.replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__geographicEnv;');
 if(path.startsWith('app/api/'))source=source.replace(/import \{readSource\} from ['"]@\/lib\/live\/cache['"];?/,'const readSource=loader=>globalThis.__geographicReadSource(loader);');
 let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 for(const match of [...js.matchAll(/(?:\bfrom\s+|\bimport\(\s*)['"]([^'"]+)['"]/g)]){
  const spec=match[1];if(spec.startsWith('node:'))continue;
  let uri;if(spec.startsWith('@/')||spec.startsWith('.')){let target=spec.startsWith('@/')?spec.slice(2):resolve(root,dirname(path),spec).slice(root.length+1);if(target.endsWith('.mjs'))uri=pathToFileURL(join(root,target)).href;else{if(!target.endsWith('.ts'))target+='.ts';uri=pathToFileURL(await prepare(target)).href}}
  else uri=pathToFileURL(require.resolve(spec)).href;
  js=js.replaceAll("'"+spec+"'","'"+uri+"'").replaceAll('"'+spec+'"','"'+uri+'"');
 }
 await writeFile(output,js);return output;
}
const load=async path=>import(pathToFileURL(await prepare(path)));
const json=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
let calls=[];const source=data=>({status:'cached',data,name:'Verified source copy',url:'https://data.gov.ro/',error:null});
globalThis.__geographicReadSource=async loader=>{calls.push(loader);return structuredClone(globalThis.__geographicFixture)};
globalThis.__geographicEnv={ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;assert.equal(path,'/catalog/index.json.gz');return new Response(await readFile(join(root,'public',path)))}}};
try{
 const geo=await load('lib/geographic-scope.ts'),query=await load('lib/live/query.ts'),cities=(await json('public/places/cities.json')).items,manifest=await json('public/places/manifest.json');
 const locations=[['București',44.4268,26.1025,'București'],['Cluj-Napoca',46.7712,23.6236,'Cluj'],['Brașov',45.6579,25.6012,'Brașov'],['Moroeni',45.229,25.434,'Dâmbovița']].map(([name,lat,lon,county])=>geo.availableContext(name,{lat,lon},'context',county));
 for(const c of locations){assert.equal(geo.withLocalCounty({name:c.locality,...c.point}).county,c.county);const params=new URLSearchParams({geoScope:'context',locality:c.locality,county:c.county,lat:String(c.point.lat),lon:String(c.point.lon)});assert.deepEqual(geo.readGeographicContext(params),c)}
 assert.equal(geo.withLocalCounty({name:'Satu Mare',type:'city',lat:47.792,lon:22.886}).county,'Satu Mare');assert(!geo.withLocalCounty({name:'Florești',type:'village',lat:46.747,lon:23.49}).county);assert(!geo.registryMatchesLocation({'Localitate unitate':'SĂLCIOARA','Judet PJ':'IL'},geo.availableContext('Sălcioara',{lat:44.72,lon:25.54}),'schools'));
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca'})).point.lat,geo.geographicLocalities.find(c=>c.name==='Cluj-Napoca').lat);
 // Extinderea țintită: satele pe care SIRUTA le poartă în mediul urban au punct
 // cartografiat; satele rurale rămân onest fără — nicio coordonată inventată.
 for(const name of ['Poiana Brașov','Pârâul Rece','Timișu de Jos','Timișu de Sus','Fișer','Tohanu Nou']){
  const hit=geo.geographicLocalities.find(c=>c.name===name&&geo.countyName(c.county)==='Brașov');
  assert.ok(hit&&Number.isFinite(hit.lat)&&Number.isFinite(hit.lon),`localitatea urbană componentă ${name} are punct cartografiat`);
 }
 assert.ok(!geo.geographicLocalities.some(c=>c.name==='Bod'),'satul rural Bod rămâne onest fără punct cartografiat');
 assert.equal(geo.readGeographicContext(new URLSearchParams({geoScope:'national',lat:'46.77',lon:'23.62'})).point,null);
 assert.equal(geo.readGeographicContext(new URLSearchParams({lat:'90.1',lon:'23.6'})),null);
 // The live-vehicle radius is a validated context parameter: absent keeps the 15 km
 // default, present must be an integer 1–100 — anything else is rejected, never clamped.
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca'})).radius,15);
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca',radius:'100'})).radius,100);
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca',radius:'0'})),null);
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca',radius:'101'})),null);
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca',radius:'15.5'})),null);
 assert.equal(geo.readGeographicContext(new URLSearchParams({locality:'Cluj-Napoca',radius:'abc'})),null);
 assert.deepEqual(geo.geographicParams({hasLocal:true,locality:{name:'Brașov',county:'Brașov',lat:45.65,lon:25.6},center:{lat:45.65,lon:25.6}},'context',false,50),{geoScope:'context',locality:'Brașov',county:'Brașov',lat:'45.650',lon:'25.600',radius:'50'});
 const cluj=locations[1],buc=locations[0],index=geo.createGeographyIndex([...cities, {name:'Moroeni',...locations[3].point}]);
 assert(!geo.matchesGeography(geo.classifyGeography({title:'Transport local București'},'catalog',index),cluj));
 assert(geo.matchesGeography(geo.classifyGeography({title:'Transport Cluj-Napoca'},'catalog',index),cluj));
 assert(geo.matchesGeography(geo.classifyGeography({title:'Registru național',organization:'Ministerul Educației'},'catalog',index),cluj));
 assert(!geo.matchesGeography(geo.classifyGeography({title:'Set fără zonă precizată'},'catalog',index),cluj));
 assert(!geo.matchesGeography(geo.classifyGeography({title:'Eveniment local',summary:'Program în București'},'feed',index),cluj));
 assert.equal(geo.classifyGeography({title:'Unități din județul Brașov'},'catalog',index).level,'county');
 assert.equal(geo.classifyGeography({title:'Buget',organization:'Consiliul Județean Brașov'},'catalog',index).level,'county');
 assert(!geo.matchesGeography({level:'locality',localities:['Sălcioara'],counties:['Ialomița'],label:''},geo.availableContext('Sălcioara',{lat:45,lon:25},'context','Dâmbovița')),'Homonymous localities must not cross counties');

 const inventory=await json('public/catalog/index.json');let localCounts=[];
 for(const context of locations){const selected=inventory.items.filter(r=>geo.matchesGeography(geo.classifyGeography(r,'catalog',index),context));assert(selected.length);assert(selected.length<inventory.items.length);localCounts.push([context.locality,selected.length]);assert(!selected.some(r=>/^stații|transport/i.test(r.title)&&geo.classifyGeography(r,'catalog',index).localities.includes('București')&&context.locality==='Cluj-Napoca'))}
 const catalog=await load('app/api/catalog/route.ts');calls=[];const catalogPage=await (await catalog.GET(new Request('https://example.test/api/catalog?'+new URLSearchParams({geoScope:'context',locality:'Cluj-Napoca',lat:'46.771',lon:'23.624'})))).json();assert(catalogPage.data.total>24);assert(catalogPage.data.results.every(r=>geo.matchesGeography(r.geography,cluj)));assert.equal(calls.length,0,'Local catalog must use the checked inventory without CKAN request fan-out');
 console.log('All 5,251 catalog records checked in four geographic contexts; actual catalog API filters before pagination and reads the checksum-verified inventory.');

 const places=await load('lib/places-query.ts'),read=async proof=>json('public/places/'+proof.file);let clujStops=0;
 for(const context of locations)for(const category of Object.keys(manifest.categories).filter(k=>k!=='local-all')){const result=await places.queryPlaces(manifest,{category,q:'',sub:'',contact:'',scope:'nearby',lat:context.point.lat,lon:context.point.lon,radius:15,sort:'distance',photos:false,page:0},read);assert(result.items.every(r=>r.distance<=15));if(context.locality==='Cluj-Napoca'&&category==='transport')clujStops=result.total}
  assert(clujStops>0);console.log('Every mapped category checked around București, Cluj, Brașov and Moroeni; Cluj has real local transport stops and services.');

  const wide=await places.queryPlaces(manifest,{category:'transport',q:'',sub:'',contact:'',scope:'nearby',lat:cluj.point.lat,lon:cluj.point.lon,radius:100,sort:'distance',photos:false,page:0,pageSize:200},read);
  assert.equal(wide.pageSize,200);assert.equal(wide.items.length,Math.min(200,wide.total));
  const tight=await places.queryPlaces(manifest,{category:'transport',q:'',sub:'',contact:'',scope:'nearby',lat:cluj.point.lat,lon:cluj.point.lon,radius:100,sort:'distance',photos:false,page:0},read);
  assert.equal(tight.pageSize,18);assert.equal(tight.items.length,Math.min(18,tight.total));
  assert(tight.items.length>0,'Cluj transport within 100 km must have results');
  const tightIds=tight.items.map(r=>r.id),wideIds=wide.items.map(r=>r.id);
  assert(wide.items.length>=tight.items.length,'the map-sized page carries at least the list page');
   assert(tightIds.every((id,at)=>wideIds[at]===id),'the 18-item list page keeps being the distance-sorted prefix of the 200-item map page');
   console.log('Paged place queries checked around Cluj: pageSize requests keep serving distance-sorted pages (the national map sample stays capped by its own request) while every plain list page keeps 18 — the first 18 stay identical.');

  // The nearby map pin set (view=map) honors the selected radius with no silent
  // cap: every in-radius element is served, spanning the radius — the old
  // nearest-page slice clustered within a few km no matter the radius.
  const pins=await places.queryPlaces(manifest,{category:'cultura',q:'',sub:'',contact:'',scope:'nearby',lat:cluj.point.lat,lon:cluj.point.lon,radius:100,sort:'distance',photos:false,page:0,view:'map'},read);
  assert.equal(pins.items.length,pins.total,'the pin set must serve every in-radius element, not a nearest page');
  assert(pins.total>200,'the 100 km cultura pin set exceeds the old 200-item page');
  assert(pins.items.every(r=>r.distance<=100),'every pin stays within the selected radius');
  assert(Math.max(...pins.items.map(r=>r.distance))>50,'the pin set must span the radius, not a dense core');
  const culturaTight=await places.queryPlaces(manifest,{category:'cultura',q:'',sub:'',contact:'',scope:'nearby',lat:cluj.point.lat,lon:cluj.point.lon,radius:100,sort:'distance',photos:false,page:0},read);
  assert.equal(culturaTight.pageSize,18);
  const culturaTightIds=culturaTight.items.map(r=>r.id),pinIds=pins.items.map(r=>r.id);
  assert(culturaTightIds.every((id,at)=>pinIds[at]===id),'the 18-item list page stays the distance-sorted prefix of the pin set');
  console.log('Map pin sets checked around Cluj: view=map serves every in-radius element and spans the radius while every list page keeps 18 — the first 18 stay identical.');

 const packed=(await json('lib/live/seed-snapshots.json')).server,raw=gunzipSync(Buffer.from(packed.gzipBase64,'base64'));assert.equal(createHash('sha256').update(raw).digest('hex'),packed.sha256);const seeds=JSON.parse(raw),directory=await load('app/api/directory/route.ts'),localities=await load('app/api/localities/route.ts');
 for(const kind of ['health','pharmacies','hospitals'])for(const context of [buc,cluj]){const entry=seeds['directory:'+kind];assert(entry);globalThis.__geographicFixture=source(entry.data);const page=await (await directory.GET(new Request('https://example.test/api/directory?'+new URLSearchParams({kind,locality:context.locality,county:context.county,geoScope:'context',page:'0'})))).json();assert(page.data.records.length);assert(page.data.records.every(r=>geo.countyName(r['Cod CAS']||r['Nume CAS'])===context.county));assert(page.data.total>=page.data.records.length)}
 globalThis.__geographicFixture=source(seeds.siruta.data);for(const c of locations){const result=await (await localities.GET(new Request('https://example.test/api/localities?'+new URLSearchParams({locality:c.locality,county:c.county})))).json();assert(result.data.items.length);assert(result.data.items.every(r=>geo.sameLocality(r.name,c.locality)&&geo.countyName(r.county)===c.county))}
 calls=[];const unknownCounty=await (await directory.GET(new Request('https://example.test/api/directory?kind=schools&geoScope=context&locality=Flore%C8%99ti&lat=46.747&lon=23.49'))).json();assert.equal(unknownCounty.data.geographicUnavailable,true);assert.equal(unknownCounty.data.records.length,0);assert.equal(calls.length,0);
 const directories=await load('lib/live/directories.ts');let requestParams;globalThis.fetch=async url=>{requestParams=new URL(String(url)).searchParams;return Response.json({success:true,result:{fields:[{id:'Localitate unitate'},{id:'Judet PJ'}],total:1,records:[{'Localitate unitate':'CLUJ-NAPOCA','Judet PJ':'CJ'}]}})};
 await directories.directoryLoader('schools','',0,cluj).load();const schoolFilters=JSON.parse(requestParams.get('filters'));assert(schoolFilters['Localitate unitate'].includes('CLUJ-NAPOCA'));assert(schoolFilters['Judet PJ'].includes('CJ'));const tabular=await load('lib/tabular-geography.ts'),bucFilters=tabular.datastoreGeographicFilters(['Localitate unitate','Judet PJ'],buc);assert(bucFilters['Localitate unitate'].includes('BUCUREŞTI SECTORUL 1'));assert(tabular.datastoreGeographicFilters(['Localitate unitate','Judet PJ'],locations[2])['Localitate unitate'].includes('BRAŞOV'));
 const cache=await load('lib/live/cache.ts');for(const context of [buc,cluj,locations[2]]){const cached=await cache.readSource(directories.directoryLoader('schools','',0,context));assert(cached.data.records.length);assert(cached.data.records.every(r=>geo.registryMatchesLocation(r,context,'schools')));assert.equal(cached.data.copyComplete,false)}
 console.log('Actual CNAS copies and SIRUTA API checked by city/county; the school connector sends structural locality and county filters before pagination.');

 const transport=await load('app/api/transport/route.ts'),live=await load('app/api/transport-live/route.ts'),events=await load('app/api/events/route.ts'),cinema=await load('app/api/cinema/route.ts'),cinemas=(await json('public/cinema/cinemas.json')).items;
 for(const c of locations.slice(1))for(const kind of ['vehicles','arrivals','alerts']){calls=[];const result=await (await live.GET(new Request('https://example.test/api/transport-live?'+new URLSearchParams({kind,locality:c.locality,county:c.county,lat:String(c.point.lat),lon:String(c.point.lon)})))).json();assert.equal(result.data.outOfCoverage,true);assert.equal(result.data.items.length,0);assert.equal(calls.length,0)}
 calls=[];assert((await (await transport.GET(new Request('https://example.test/api/transport?kind=routes&locality=Cluj-Napoca'))).json()).data.outOfCoverage);assert.equal(calls.length,0);assert((await (await events.GET(new Request('https://example.test/api/events?locality=Cluj-Napoca'))).json()).data.outOfCoverage);assert.equal(calls.length,0);
 const bucCinema=cinemas.find(c=>geo.sameLocality(c.address.city,'București')),clujCinema=cinemas.find(c=>geo.sameLocality(c.address.city,'Cluj-Napoca'));assert(bucCinema&&clujCinema);
 const cinemaRequest=c=>new Request('https://example.test/api/cinema?'+new URLSearchParams({id:c.externalCode,date:'2026-10-05',locality:'Cluj-Napoca',lat:'46.771',lon:'23.624'}));assert.equal((await cinema.GET(cinemaRequest(bucCinema))).status,400);assert.equal(calls.length,0);globalThis.__geographicFixture=source({films:[]});assert.equal((await cinema.GET(cinemaRequest(clujCinema))).status,200);assert.equal(calls.length,1);
  console.log('Transport, all live transport subcategories, events and cinema APIs reject unrelated coverage before contacting an operator. No București fallback is returned for Cluj.');

  const tpbiVehicle=(id,name,lat,lon,at)=>({id,routeId:'tpbi-test',tripId:'t-'+id,vehicleName:name,licensePlate:'',lat,lon,stopId:'',observedAt:at,bearing:90,speed:10,occupancy:null,occupancyPercentage:null,wheelchairAccessible:null,currentStatus:null,details:{}});
  const nowIso=new Date().toISOString(),bucRequest=radius=>new Request('https://example.test/api/transport-live?'+new URLSearchParams({kind:'vehicles',locality:'București',county:'București',lat:'44.4268',lon:'26.1025',radius:String(radius)}));
  const vehNear=tpbiVehicle('veh-near','Vehiculul aproape',44.4268,26.1025,nowIso),vehFar=tpbiVehicle('veh-far','Vehiculul depărtat',44.55,26.35,nowIso);
  for(const radius of [15,30]){calls=[];globalThis.__geographicFixture={status:'fresh',data:{kind:'vehicles',observedAt:nowIso,entityCount:2,items:[vehNear,vehFar]}};const served=await (await live.GET(bucRequest(radius))).json();assert.equal(served.data.total,radius===15?1:2,'TPBI vehicles at ~24 km must be served only within the chosen radius');if(radius===15)assert.deepEqual(served.data.items.map(r=>r.id),['veh-near'])}
  assert.equal((await live.GET(bucRequest(101))).status,400,'an out-of-range radius must be rejected, never clamped');
  const staleAt=new Date(Date.now()-8*60000).toISOString();globalThis.__geographicFixture={status:'stale',lastSuccessAt:staleAt,lastAttemptAt:new Date().toISOString(),data:{kind:'vehicles',observedAt:staleAt,entityCount:2,items:[vehNear,vehFar]}};const staleCopy=await (await live.GET(bucRequest(30))).json();
  assert.equal(staleCopy.data.isLive,false);assert.equal(staleCopy.data.stalenessMinutes,8);assert.equal(staleCopy.data.total,2,'the stale copy keeps serving its last positions for the map to label');
  const tranzy=await load('app/api/tranzy-live/route.ts'),tzNear={id:'tz-near',routeId:'25',tripId:'t-n',vehicleName:'Tramvaiul aproape',licensePlate:'',lat:46.77,lon:23.6,stopId:'',observedAt:nowIso,bearing:null,speed:null,occupancy:null,occupancyPercentage:null,wheelchairAccessible:null,currentStatus:null,details:{}},tzFar={...tzNear,id:'tz-far',vehicleName:'Autobuzul depărtat',lat:46.9,lon:23.85};
  const clujRequest=radius=>new Request('https://example.test/api/tranzy-live?'+new URLSearchParams({kind:'vehicles',q:'',page:'0',locality:'Cluj-Napoca',county:'Cluj',lat:'46.7712',lon:'23.6236',radius:String(radius)}));
  globalThis.__geographicFixture={status:'fresh',data:{agencies:[{agency_id:7,agency_name:'CTP Cluj-Napoca'}],kind:'vehicles',observedAt:nowIso,entityCount:2,items:[tzNear,tzFar]}};
  for(const radius of [15,30]){const served=await (await tranzy.GET(clujRequest(radius))).json();assert.equal(served.data.total,radius===15?1:2,'Tranzy vehicles at ~22 km must be served only within the chosen radius');assert.equal(served.data.agency,'CTP Cluj-Napoca')}
  globalThis.__geographicFixture={status:'stale',lastSuccessAt:staleAt,lastAttemptAt:new Date().toISOString(),data:{agencies:[{agency_id:7,agency_name:'CTP Cluj-Napoca'}],kind:'vehicles',observedAt:staleAt,entityCount:2,items:[tzNear,tzFar]}};
  const tranzyStale=await (await tranzy.GET(clujRequest(30))).json();
  assert.equal(tranzyStale.data.isLive,false);assert.equal(tranzyStale.data.stalenessMinutes,8);assert.equal(tranzyStale.data.total,2);
  console.log('Both live-vehicle APIs thread the validated 1–100 km radius into their nearby filters and label stale copies with the minutes since the last successful fetch.');

 const institutions=(await json('public/courts/institutions.json')).items,legal=await load('app/api/legal/route.ts'),clujCourt=institutions.find(c=>c.id==='JudecatoriaCLUJNAPOCA'),bucCourt=institutions.find(c=>c.id==='JudecatoriaSECTORUL1BUCURESTI');assert(clujCourt&&bucCourt);
 const courtRequest=institution=>new Request('https://example.test/api/legal',{method:'POST',body:JSON.stringify({kind:'court',name:'Test local',institution,geoScope:'context',locality:'Cluj-Napoca',county:'Cluj'})});calls=[];assert.equal((await legal.POST(courtRequest(bucCourt.id))).status,400);assert.equal(calls.length,0);globalThis.__geographicFixture=source({items:[{court:clujCourt.id},{court:bucCourt.id}]});const courtResult=await (await legal.POST(courtRequest(clujCourt.id))).json();assert.equal(courtResult.data.items.length,1);assert.equal(courtResult.data.items[0].court,clujCourt.id);
 const numberedRequest=numberScope=>new Request('https://example.test/api/legal',{method:'POST',body:JSON.stringify({kind:'court',number:'6236 / 111 / 2017',numberScope,institution:bucCourt.id,geoScope:'context',locality:'Cluj-Napoca',county:'Cluj',from:'2026-01-01'})});
 globalThis.__geographicFixture=source({items:[{number:'6236/111/2017',court:'TribunalulBIHOR',hearings:[{date:'2023-05-12'}]},{number:'6236/111/2017',court:'CurteadeApelORADEA',hearings:[{date:'2023-11-08'},{date:'2023-11-22'}]}]});calls=[];
 const followed=await (await legal.POST(numberedRequest('all'))).json();assert.equal(followed.data.items.length,2);assert.equal(followed.data.hearingCount,3);assert.equal(followed.data.searchScope,'number-all-courts');assert.equal(calls.length,1);const sent=calls[0];globalThis.fetch=async(url,init)=>{const xml=init.body;assert(xml.includes('<numarDosar>6236/111/2017</numarDosar>'));assert(xml.includes('<institutie i:nil="true"/>'));assert(xml.includes('<dataStart i:nil="true"/>'));const operation=init.headers.SOAPAction.includes('CautareDosare2')?'CautareDosare2':'CautareDosare';return new Response('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><'+operation+'Response><'+operation+'Result/></'+operation+'Response></s:Body></s:Envelope>')};await sent.load();
 calls=[];assert.equal((await legal.POST(numberedRequest('filtered'))).status,400);assert.equal(calls.length,0,'Explicit filtered case searches must still honor the active locality');console.log('An exact case number follows all returned courts/stages across locations; explicitly filtered searches keep the geographic gate.');
 const alerts=await load('lib/weather-location.ts'),warning={empty:false,document:'<avertizari><mesaj><judet>Cluj</judet><text>Vânt</text></mesaj><mesaj><judet>București</judet><text>Ploaie</text></mesaj></avertizari>'};const localAlert=alerts.localWeatherAlerts(warning,cluj);assert(localAlert.document.includes('Cluj'));assert(!localAlert.document.includes('București'));assert.equal(alerts.localWeatherAlerts({empty:false,document:'<unknown>Text</unknown>'},cluj).localUnavailable,true);assert.equal(alerts.localWeatherAlerts(warning,{...cluj,active:false}),warning);

 const resources=await load('lib/live/resources.ts'),columns=['Localitate','Județ','Valoare'],rows=[...Array.from({length:60},()=>['București','București','1']),...Array.from({length:85},()=>['Cluj-Napoca','Cluj','2'])],table=source({kind:'table',complete:true,sheets:[{name:'Localități',columns,rows,total:145}]}),resourceQuery={q:'',page:0,sheet:0,sort:-1,desc:false,geographicContext:cluj};
 const localPage=await resources.resourcePage(table,resourceQuery);assert.equal(localPage.data.navigation.total,85);assert.equal(localPage.data.sheets[0].rows.length,50);assert(localPage.data.sheets[0].rows.every(r=>r[0]==='Cluj-Napoca'));const lastPage=await resources.resourcePage(table,{...resourceQuery,page:1});assert.equal(lastPage.data.sheets[0].rows.length,35);
 globalThis.fetch=async url=>{requestParams=new URL(String(url)).searchParams;return Response.json({success:true,result:{fields:columns.map(id=>({id})),total:85,records:Array.from({length:50},()=>({'Localitate':'Cluj-Napoca','Județ':'Cluj','Valoare':'2'}))}})};
 const remote=await resources.datastorePageLoader('10000000-0000-0000-0000-000000000000',source({columns,title:'Test',total:145}),resourceQuery).load();const filters=JSON.parse(requestParams.get('filters'));assert(filters.Localitate.includes('CLUJ-NAPOCA')&&filters['Județ'].includes('CJ'));assert.equal(remote.data.navigation.total,85);assert(remote.data.sheets[0].rows.every(r=>r[0]==='Cluj-Napoca'));
 const coordinateTable=source({kind:'table',complete:true,sheets:[{name:'Puncte',columns:['Latitudine','Longitudine'],rows:[['44.4268','26.1025'],['46.7712','23.6236']],total:2}]});assert.equal((await resources.resourcePage(coordinateTable,resourceQuery)).data.navigation.total,1);
 console.log('Courts, local alerts, complete imported tables and CKAN table queries checked; city filtering precedes pagination and exports of displayed pages.');

 const domain=await load('app/api/domain/route.ts'),bounded=domain.loaderGroup();let active=0,max=0;await Promise.all(Array.from({length:20},()=>bounded({load:async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setImmediate(resolve));active--;return{}}}).load()));assert.equal(max,2);assert.equal(active,0);
 console.log(JSON.stringify({status:'passed',locations:locations.map(c=>c.locality),catalogCounts:localCounts,clujTransportPlaces:clujStops,maxParallelFeedLoads:max}));
}finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});delete globalThis.__geographicEnv;delete globalThis.__geographicReadSource;delete globalThis.__geographicFixture}
