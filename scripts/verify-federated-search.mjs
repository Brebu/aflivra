import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {readSnapshotFile as readFileRaw} from './snapshot-read.mjs';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'aflivra-federated-'));
const federatedPath=join(root,'lib/live/federated.ts');
function fail(message){console.error(message);process.exit(1)}
if(!existsSync(federatedPath))fail('RED: lib/live/federated.ts does not exist yet — implement the federated family layer to turn this harness green.');
async function compile(name,path,transform=s=>s){const source=transform(await readFileRaw(join(root,path),'utf8')),js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+p+".mjs'");await writeFile(join(temp,name+'.mjs'),js);return import(pathToFileURL(join(temp,name+'.mjs')))}
const snapshot=()=>JSON.stringify(result);
let result=null;
try{
 const query=await compile('query','lib/live/query.ts');
 const topics=await compile('topics','lib/dashboard-topics.ts');
 const federated=await compile('federated','lib/live/federated.ts',s=>s
  .replace("from '@/lib/live/query'","from './query'")
  .replace("from '@/lib/dashboard-topics'","from './topics'"));
 const {federatedSearch,federatedCollect,federatedFamilies,federatedGroups,courtNumberTerm,validDomainTab}=federated;
  const networkIds=['places','catalog','lawyers','directory-schools','directory-health','directory-pharmacies','directory-hospitals','stiri','agricultura','notaries','experts-judiciari','experts-tehnici','translators','trains','flights','events','anl-sites'];
 const eagerIds=['stories','gallery','cui','dosare'];
 const familyIds=[...networkIds,...eagerIds].sort();

 console.log('LEG 1 — module contract and family table');
 assert.equal(typeof federatedSearch,'function');assert.equal(typeof federatedCollect,'function');assert.equal(typeof courtNumberTerm,'function');assert.equal(typeof validDomainTab,'function');
 assert.deepEqual(federatedFamilies.map(f=>f.id).sort(),familyIds,'exactly the federated v1 family set');
  const kinds=new Set(['place','company','lawyer','dataset','record','article','story','dosar','notary','station','flight','event']);
 const groupIds=new Set(federatedGroups.map(g=>g.id));
 for(const family of federatedFamilies){assert.equal(typeof family.label,'string','family label must exist: '+family.id);assert.ok(family.label.length>0);assert.equal(typeof family.source,'string');assert.ok(family.source.length>0);assert.ok(kinds.has(family.kind),'family kind must be a supported kind: '+family.id);if(family.category)assert.ok(groupIds.has(family.category)||family.category==='item','family category must be a registry group: '+family.id)}
 assert.equal(validDomainTab('local','places'),true);assert.equal(validDomainTab('local','data'),true,'the auto data tab is a valid tab');
 assert.equal(validDomainTab('justitie','lawyers'),true);assert.equal(validDomainTab('justitie','legal'),true);assert.equal(validDomainTab('educatie','schools'),true);assert.equal(validDomainTab('sanatate','health'),true);assert.equal(validDomainTab('sanatate','pharmacies'),true);assert.equal(validDomainTab('sanatate','hospitals'),true);
 assert.equal(validDomainTab('povesti','stories'),true);assert.equal(validDomainTab('stiri','news'),true);assert.equal(validDomainTab('agricultura','news'),true);assert.equal(validDomainTab('firme','companies'),true);
  assert.equal(validDomainTab('justitie','notari'),true);assert.equal(validDomainTab('justitie','experti'),true);assert.equal(validDomainTab('transport','trains'),true);assert.equal(validDomainTab('transport','flights'),true,'the flights tab of the transport domain is registered');assert.equal(validDomainTab('cultura','events'),true,'the events tab of the cultura domain is registered');assert.equal(validDomainTab('bani','imobiliare'),true,'the imobiliare tab of the bani domain is registered');assert.equal(validDomainTab('local','notari'),false,'local nu are secțiune de notari');
 assert.equal(validDomainTab('vreme','places'),false,'vreme has no places section');assert.equal(validDomainTab('povesti','lawyers'),false);assert.equal(validDomainTab('local','bogus'),false);assert.equal(validDomainTab('','places'),false);assert.equal(validDomainTab('local',''),false);

 console.log('LEG 2 — registry mirrors against real repo data');
 const exploration=await readFileRaw(join(root,'public/places/exploration.json'),'utf8');
 const model=await compile('model','app/v2-model.ts',s=>s.replace("import expandedPlaces from '@/public/places/exploration.json';",'const expandedPlaces='+exploration+';'));
 assert.deepEqual(federatedGroups,model.domains.map(d=>({id:d.id,label:d.name})),'grouping order and labels must mirror the domain registry');
 const directories=await compile('directories','lib/live/directories.ts',s=>s
  .replace("import {datastoreGeographicFilters} from '../tabular-geography';",'const datastoreGeographicFilters=()=>[];')
  .replace("import {getSource,SourceError} from './adapters';","const getSource=async()=>{throw Error('offline')};class SourceError extends Error{}")
  .replace("import {read,utils} from 'xlsx';",'const read=()=>({SheetNames:[],Sheets:{}}),utils={sheet_to_json:()=>[]};')
  .replace("import {downloadResource} from './resources';",'const downloadResource=async()=>new ArrayBuffer(0);')
  .replace("import {type GeographicContext} from '../geographic-scope';",''));
 const directoryFamilies=federatedFamilies.filter(f=>String(f.id).startsWith('directory-'));
 assert.equal(directoryFamilies.length,4);
 for(const family of directoryFamilies){const kind=String(family.id).slice('directory-'.length);assert.equal(family.label,directories.directories[kind].name,'directory family labels must mirror the registry: '+kind)}
 const manifest=JSON.parse(await readFileRaw(join(root,'public/places/manifest.json'),'utf8'));
 for(const category of Object.keys(manifest.categories)){if(category==='local-all')continue;assert.ok(topics.topicSections[category]?.some(s=>s.id==='places'),'every manifest category must own a places section: '+category)}
 for(const sub of ['Avocați','Notari'])assert.ok(manifest.subcategories.justitie.includes(sub),'user-facing professional subcategory must exist in the places inventory: '+sub);
 const storiesIndex=JSON.parse(await readFileRaw(join(root,'public/stories/index.json'),'utf8'));
 assert.ok(Array.isArray(storiesIndex.items)&&storiesIndex.items.length>0,'the stories corpus list must be readable (client-corpus evidence)');
 for(const item of storiesIndex.items.slice(0,10))assert.ok(item.id&&item.title&&item.url,'each story exposes the searchable corpus contract');

 console.log('LEG 3 — term normalization, shortcuts and eager local families');
 result=federatedSearch('   ');
 assert.deepEqual(result,{term:'',maxPerFamily:6,groups:[],families:[],requests:[],note:null},'a blank term produces an honestly empty result');
 assert.equal(courtNumberTerm('455/124/2024'),'455/124/2024');
 assert.equal(courtNumberTerm('455 / 124 / 2024'),'455/124/2024','slash spacing is normalized before the dosar gate');
 assert.equal(courtNumberTerm('455/124/2024/C'),'455/124/2024/C');
 assert.equal(courtNumberTerm('dosar 455/124/2024'),null,'only a term that is exactly a court number gates the dosar family');
 assert.equal(courtNumberTerm('455/124'),null);assert.equal(courtNumberTerm('12345'),null);assert.equal(courtNumberTerm(''),null);
 result=federatedSearch('427282');
 assert.equal(result.term,'427282');assert.equal(result.groups.length,1);assert.equal(result.groups[0].id,'firme');
 const cui=result.groups[0].items[0];assert.equal(cui.kind,'company');assert.equal(cui.target.view,'company');assert.equal(cui.target.id,'427282');assert.equal(cui.family,'cui');
 assert.ok(result.families.some(f=>f.family==='cui'&&f.status==='done'));
 assert.ok(!result.requests.some(r=>r.family==='cui'),'the CUI shortcut is eager and never fetched');
 assert.deepEqual(result.requests.map(r=>r.family).sort(),[...networkIds].sort(),'a qualifying term still fans out every network family');
 result=federatedSearch('455 / 124 / 2024');
 const dosarGroup=result.groups.find(g=>g.id==='justitie');assert.ok(dosarGroup&&dosarGroup.items.length===1,'the dosar shortcut lands in the justiție group');
 assert.equal(dosarGroup.items[0].kind,'dosar');assert.equal(dosarGroup.items[0].target.courtNumber,'455/124/2024');assert.equal(dosarGroup.items[0].target.domain,'justitie');assert.equal(dosarGroup.items[0].target.tab,'legal');
 assert.ok(result.families.some(f=>f.family==='dosare'&&f.status==='done'));
 result=federatedSearch('455/124');
 assert.ok(!result.groups.some(g=>g.items.some(i=>i.family==='dosare')),'an incomplete number is not a dosar');
 const gallery=[{id:'sala',name:'Sala Palatului',kind:'Sala de concerte',city:'București',region:'București',tag:'Muzică',summary:'Sala simfonică a capitalei.',features:['Concerte'],interests:['cultura']},{id:'peles',name:'Castelul Peleș',kind:'Castel & muzeu',city:'Sinaia',region:'Prahova',tag:'O poveste regală',summary:'Reședință regală.',features:['Patrimoniu'],interests:['cultura','natura']},{id:'delta',name:'Delta Dunării',kind:'Natură',city:'Tulcea',region:'Tulcea',tag:'Natură',summary:'Canale și lacuri.',features:['Peisaj'],interests:['natura']}];
 for(const term of ['SALA','sala palatului','palatului sala','peles','castelul peles']){
  result=federatedSearch(term,{gallery});
  const titles=result.groups.find(g=>g.id==='cultura')?.items.map(i=>i.title)||[];
  assert.ok(titles.length>0,'the gallery family must fold case and diacritics for: '+term);
 }
 result=federatedSearch('SALA',{gallery});const galleryItem=result.groups[0].items[0];
 assert.equal(galleryItem.kind,'place');assert.equal(galleryItem.target.view,'place');assert.equal(galleryItem.target.id,'sala');assert.equal(galleryItem.family,'gallery');assert.equal(galleryItem.category,'cultura');assert.ok(galleryItem.subtitle.includes('Sala de concerte')&&galleryItem.subtitle.includes('București'),'gallery subtitle carries kind and location');
 result=federatedSearch('zzqxv',{gallery});assert.ok(!result.groups.some(g=>g.id==='cultura'&&g.items.length),'no gallery item survives an unrelated term');
 result=federatedSearch(storiesIndex.items[0].title,{stories:storiesIndex.items});
 const storyGroup=result.groups.find(g=>g.id==='povesti');assert.ok(storyGroup,'the stories family produces a group');assert.ok(storyGroup.items.some(i=>i.id===String(storiesIndex.items[0].id)),'the exact story is found');
 assert.equal(storyGroup.items[0].kind,'story');assert.equal(storyGroup.items[0].target.domain,'povesti');assert.equal(storyGroup.items[0].target.tab,'stories');assert.equal(storyGroup.items[0].target.query,storiesIndex.items[0].title,'the workspace seed query is the story title');
 assert.ok(result.families.some(f=>f.family==='stories'&&f.status==='done'&&typeof f.total==='number'&&f.total>0));
 result=federatedSearch('zzqxv',{stories:storiesIndex.items});assert.ok(!result.groups.some(g=>g.id==='povesti'&&g.items.length),'no story survives an unrelated term');

 console.log('LEG 4 — fan-out requests, minimum-length and maximum-length gates');
 result=federatedSearch('școli');
 assert.deepEqual(result.requests.map(r=>r.family).sort(),[...networkIds].sort(),'a plain term plans every network family');
 const requestByFamily=new Map(result.requests.map(r=>[r.family,new URL(r.url,'https://aflivra.test')]));
 const placesUrl=requestByFamily.get('places');assert.equal(placesUrl.pathname,'/api/places');assert.equal(placesUrl.searchParams.get('category'),'local-all');assert.equal(placesUrl.searchParams.get('q'),'școli');assert.equal(placesUrl.searchParams.get('scope'),'all');assert.equal(placesUrl.searchParams.get('page'),'0');
 const catalogUrl=requestByFamily.get('catalog');assert.equal(catalogUrl.pathname,'/api/catalog');assert.equal(catalogUrl.searchParams.get('q'),'școli');assert.equal(catalogUrl.searchParams.get('geoScope'),'national','the fan-out is deterministic and national');
 const lawyersUrl=requestByFamily.get('lawyers');assert.equal(lawyersUrl.pathname,'/api/lawyers');assert.equal(lawyersUrl.searchParams.get('q'),'școli');assert.equal(lawyersUrl.searchParams.get('geoScope'),'national');
 const schoolUrl=requestByFamily.get('directory-schools');assert.equal(schoolUrl.pathname,'/api/directory');assert.equal(schoolUrl.searchParams.get('kind'),'schools');assert.equal(schoolUrl.searchParams.get('q'),'școli');
 const stiriUrl=requestByFamily.get('stiri');assert.equal(stiriUrl.pathname,'/api/domain');assert.equal(stiriUrl.searchParams.get('kind'),'stiri');assert.equal(stiriUrl.searchParams.get('q'),'școli');
 const afirUrl=requestByFamily.get('agricultura');assert.equal(afirUrl.pathname,'/api/domain');assert.equal(afirUrl.searchParams.get('kind'),'agricultura');
 const notariesUrl=requestByFamily.get('notaries');assert.equal(notariesUrl.pathname,'/api/notaries');assert.equal(notariesUrl.searchParams.get('q'),'școli');assert.equal(notariesUrl.searchParams.get('geoScope'),'national');
 const judiciariUrl=requestByFamily.get('experts-judiciari');assert.equal(judiciariUrl.pathname,'/api/experts');assert.equal(judiciariUrl.searchParams.get('kind'),'experti-judiciari');assert.equal(judiciariUrl.searchParams.get('q'),'școli');assert.equal(judiciariUrl.searchParams.get('geoScope'),'national');
 const trainsUrl=requestByFamily.get('trains');assert.equal(trainsUrl.pathname,'/api/trains');assert.equal(trainsUrl.searchParams.get('q'),'școli');assert.equal(trainsUrl.searchParams.get('page'),'0');
  const flightsUrl=requestByFamily.get('flights');assert.equal(flightsUrl.pathname,'/api/flights');assert.equal(flightsUrl.searchParams.get('q'),'școli');assert.equal(flightsUrl.searchParams.get('page'),'0');
  const eventsUrl=requestByFamily.get('events');assert.equal(eventsUrl.pathname,'/api/events');assert.equal(eventsUrl.searchParams.get('q'),'școli');assert.equal(eventsUrl.searchParams.get('page'),'0','the events family plans the national search contract of the venue registry');
  const anlUrl=requestByFamily.get('anl-sites');assert.equal(anlUrl.pathname,'/api/anl');assert.equal(anlUrl.searchParams.get('q'),'școli');assert.equal(anlUrl.searchParams.get('page'),'0','the ANL family plans the registry route, notaries-style');
 result=federatedSearch('gara brașov');
 const garaUrl=result.requests.find(r=>r.family==='trains');
 assert.equal(new URL(garaUrl.url,'https://aflivra.test').searchParams.get('q'),'brașov','cuvintele-corp „gara/stația” nu ajung în interogarea de stații');
 result=federatedSearch('stația cluj napoca');
 assert.equal(new URL(result.requests.find(r=>r.family==='trains')?.url||'','https://aflivra.test').searchParams.get('q'),'cluj napoca');
 for(const family of networkIds)assert.ok(result.families.some(f=>f.family===family&&f.status==='pending'),'every planned family starts pending: '+family);
 result=federatedSearch('șc');
 assert.ok(!result.requests.some(r=>r.family==='lawyers'),'a 2-character term must not query the lawyers registry');
 const lawyersGate=result.families.find(f=>f.family==='lawyers');assert.equal(lawyersGate.status,'gate');assert.match(lawyersGate.note,/cel puțin 3 caractere/,'the gate note reuses the route-side honest wording');
 assert.equal(result.requests.length,networkIds.length-1);
 result=federatedSearch('a'.repeat(150));
 assert.ok(!result.requests.some(r=>String(r.family).startsWith('directory-')),'a term over 100 characters must not query the directory registries');
 for(const family of result.families.filter(f=>String(f.family).startsWith('directory-'))){assert.equal(family.status,'gate');assert.match(family.note,/100/)}
 assert.ok(result.requests.some(r=>r.family==='lawyers'),'a 150-character term is still within the lawyers limit');
 result=federatedSearch('a'.repeat(170));
 assert.ok(!result.requests.some(r=>r.family==='lawyers'),'a term over 160 characters must not query the lawyers registry');
 result=federatedSearch('a'.repeat(200));
 assert.equal(result.requests.length,4,'at the global boundary only the routes that accept 200 characters still fan out');
 assert.deepEqual(result.requests.map(r=>r.family).sort(),['agricultura','catalog','places','stiri']);
 result=federatedSearch('a'.repeat(201));
 assert.deepEqual({groups:result.groups,families:result.families,requests:result.requests},{groups:[],families:[],requests:[]},'over the boundary nothing is fetched');
 assert.match(result.note,/200/,'the honest boundary note names the limit');

 console.log('LEG 5 — response mapping, honest degrade and immutability');
 const placeIndex=n=>({id:'place-'+n,name:'Sala de concerte nr. '+n,categories:['cultura'],types:[{category:'cultura',label:'Săli de concerte'}],lat:44.4,lon:26.1,address:'Str. X '+n,city:'București',phone:'',email:'',website:'',openingHours:'',updatedAt:'2026-09-01',sourceUrl:'https://www.openstreetmap.org/'+n,chunk:'c'+n,search:'sala concerte '+n});
 result=federatedSearch('sala');
 const placesState={status:'cached',name:'OpenStreetMap · inventarul național',data:{items:Array.from({length:8},(_,n)=>placeIndex(n)),total:1234,page:0,pages:69}};
 let collected=federatedCollect(result,'places',placesState);
 assert.deepEqual(collected.groups.map(g=>g.id),['cultura'],'only groups that own mapped rows appear');
 const cultura=collected.groups.find(g=>g.id==='cultura');
 assert.ok(cultura,'mapped places create their group in registry order');
 assert.equal(cultura.label,'Cultură și turism');
 assert.equal(cultura.items.length,6,'the per-family display cap defaults to six rows');
 assert.equal(cultura.count,6);
 assert.equal(cultura.items[0].kind,'place');assert.equal(cultura.items[0].subcategory,'Săli de concerte');assert.equal(cultura.items[0].source,'OpenStreetMap');
 assert.equal(cultura.items[0].target.domain,'cultura');assert.equal(cultura.items[0].target.tab,'places');assert.equal(cultura.items[0].target.query,cultura.items[0].title);
 const placesDone=collected.families.find(f=>f.family==='places');assert.equal(placesDone.status,'done');assert.equal(placesDone.total,1234,'the family carries the full source total, not the capped row count');
 assert.deepEqual(result.groups,[],'federatedCollect must not mutate the base result');
 assert.equal(collected.maxPerFamily,6);
 const oddPlace={id:'odd',name:'Loc ciudat',categories:['vreme'],types:[{category:'cultura',label:'Săli de concerte'}],lat:44,lon:26,address:'',city:'',phone:'',email:'',website:'',openingHours:'',updatedAt:'',sourceUrl:'',chunk:'c',search:'loc ciudat'};
 collected=federatedCollect(federatedSearch('loc'),'places',{status:'cached',data:{items:[oddPlace],total:1,page:0,pages:1}});
 const localGroup=collected.groups.find(g=>g.id==='local');assert.ok(localGroup,'a place from a category without a places section falls back to the local domain');
 collected=federatedCollect(federatedSearch('set'),'catalog',{status:'cached',data:{results:[{id:'ed-1',title:'Set de date despre școli',organization:'Ministerul Educației',note:'Inventar unități școlare.',modified:'2026-01-02',formats:['CSV'],categories:['educatie']}],count:5,page:0,pages:1}});
 let educatie=collected.groups.find(g=>g.id==='educatie');assert.ok(educatie);assert.equal(educatie.items[0].kind,'dataset');assert.equal(educatie.items[0].title,'Set de date despre școli');assert.equal(educatie.items[0].subtitle,'Ministerul Educației');
 assert.equal(educatie.items[0].target.tab,'data');assert.equal(educatie.items[0].target.domain,'educatie');assert.equal(educatie.items[0].target.query,'Set de date despre școli');
  assert.equal(collected.families.find(f=>f.family==='catalog').total,5);
  collected=federatedCollect(federatedSearch('plati'),'catalog',{status:'stale',data:{results:[{id:'c20c6438-91ec-4204-a8df-c3d7c5fb47aa',title:'Plati Programul național „Școli sigure și sănătoase” (PNSS) (2026-prezent)',organization:'Ministerul Dezvoltării, Lucrărilor Publice și Administrației',category:'educatie',modified:'2026-09-17T11:02:07.876807'}],count:6,page:0,pages:1}});
  educatie=collected.groups.find(g=>g.id==='educatie');assert.ok(educatie,'un rând servit din copia de rezervă își poartă propria categorie în grupul ei');
  assert.ok(educatie.items[0].title.includes('Școli sigure'));
  assert.equal(educatie.items[0].target.domain,'educatie','rândul de catalog trimite spre domeniul unde filtrul de categorie arată setul');
  assert.equal(educatie.items[0].target.tab,'data');
  collected=federatedCollect(federatedSearch('set'),'catalog',{status:'cached',data:{results:[{id:'fara-clasificare',title:'Set de date fără clasificare',organization:'Editor neprecizat'}],count:1,page:0,pages:1}});
  const localDatasets=collected.groups.find(g=>g.id==='local');assert.ok(localDatasets&&localDatasets.items.some(i=>i.kind==='dataset'),'un rând fără nicio clasificare păstrează grupul local de rezervă');
  collected=federatedCollect(federatedSearch('avocat'),'lawyers',{status:'cached',data:{items:[{id:'123',name:'Popescu Ion',title:'Baroul Brașov — definitiv',url:'https://www.ifep.ro/Justice/Lawyers/LawyerFile.aspx?RecordId=123',details:'avocat definitiv',updatedAt:'2026-01-01'}],total:77,page:0,pages:6}});
 let justitie=collected.groups.find(g=>g.id==='justitie');assert.ok(justitie);assert.equal(justitie.items[0].kind,'lawyer');assert.equal(justitie.items[0].title,'Popescu Ion');assert.equal(justitie.items[0].subtitle,'Baroul Brașov — definitiv');
 assert.equal(justitie.items[0].target.domain,'justitie');assert.equal(justitie.items[0].target.tab,'lawyers');assert.equal(justitie.items[0].target.query,'Popescu Ion');
 collected=federatedCollect(federatedSearch('notar'),'notaries',{status:'cached',data:{title:'Registrul notarilor publici',period:'23.01.2025',note:'Registrul notarilor publici.',fields:['NUME','CAMERA','LOCALITATE','JUDET'],total:3096,records:[{NUME:' POPESCU ANA',CAMERA:'CAMERA DE NOTARI PUBLICI TIMIȘOARA',LOCALITATE:'Lugoj',JUDET:'TIMIȘ',_id:'n-fixture'}],page:0,pages:155}});
 justitie=collected.groups.find(g=>g.id==='justitie');assert.ok(justitie,'familia notarilor creează grupul justiție');
 assert.equal(justitie.items[0].kind,'notary','kind-ul notar există de la valul registrelor de justiție');assert.equal(justitie.items[0].title,'POPESCU ANA','numele notarului curățat de spațiile sursei');
 assert.equal(justitie.items[0].subtitle,'CAMERA DE NOTARI PUBLICI TIMIȘOARA · Lugoj');
 assert.equal(justitie.items[0].subcategory,'Registrul notarilor publici');
 assert.equal(justitie.items[0].target.domain,'justitie');assert.equal(justitie.items[0].target.tab,'notari');assert.equal(justitie.items[0].target.query,'POPESCU ANA','click-through seed-ează cautarea în tabloul notarilor');
 assert.equal(collected.families.find(f=>f.family==='notaries').total,3096);
 collected=federatedCollect(federatedSearch('expert'),'experts-judiciari',{status:'cached',data:{title:'Tabloul experților judiciari',period:'23.01.2025',note:'Experții judiciari.',fields:['Legitimatie','Judet','Nume','Specializare'],total:8024,records:[{Legitimatie:'2344 316',Judet:'Timiș',Nume:'Petric Ion',Specializare:'Agricultură',_id:'e-1'}],page:0,pages:402}});
 justitie=collected.groups.find(g=>g.id==='justitie');assert.ok(justitie,'familia experților creează grupul justiție');
 assert.equal(justitie.items[0].kind,'record');assert.equal(justitie.items[0].title,'Petric Ion');assert.equal(justitie.items[0].subtitle,'Timiș · Agricultură');
 assert.equal(justitie.items[0].target.tab,'experti');assert.equal(justitie.items[0].target.query,'Petric Ion');
 collected=federatedCollect(federatedSearch('gara'),'trains',{status:'cached',data:{items:[{code:30691,name:'Braşov',operators:['sntfc','regio'],trains:267,shard:99}],total:1846,page:0,pages:47}});
 const transportGroup=collected.groups.find(g=>g.id==='transport');assert.ok(transportGroup,'familia gărilor creează grupul transport');
 assert.equal(transportGroup.items[0].kind,'station','kind-ul stație există de la valul mersului trenurilor');assert.equal(transportGroup.items[0].title,'Braşov');
 assert.equal(transportGroup.items[0].subtitle,query.countText(2,'operator','operatori')+' · '+query.countText(267,'tren','trenuri'),'subtitlul folosește gramatica de numărătoare');
 assert.equal(transportGroup.items[0].target.domain,'transport');assert.equal(transportGroup.items[0].target.tab,'trains');assert.equal(transportGroup.items[0].target.query,'Braşov');
 collected=federatedCollect(federatedSearch('avion'),'flights',{status:'fresh',data:{kind:'flights',observedAt:new Date().toISOString(),items:[{hex:'481f55',callsign:'W6XYZ',registration:'HA-LMN',typeCode:'A320',lat:44.5,lon:26.1,track:270.5,altitudeFt:30500,onGround:false,groundSpeedKt:448.1},{hex:'481f56',callsign:null,registration:'YR-BBT',typeCode:'C208',lat:44.6,lon:25.9,track:null,altitudeFt:null,onGround:true,groundSpeedKt:8}],total:2,page:0,pages:1}});
 const flightsGroup=collected.groups.find(g=>g.id==='transport');assert.ok(flightsGroup,'familia avioanelor creează grupul transport');
 assert.equal(flightsGroup.items[0].kind,'flight','kind-ul zbor există de la valul avioanelor live');assert.equal(flightsGroup.items[0].title,'W6XYZ');
 assert.equal(flightsGroup.items[0].subtitle,'A320 · HA-LMN');
 assert.equal(flightsGroup.items[0].target.domain,'transport');assert.equal(flightsGroup.items[0].target.tab,'flights');assert.equal(flightsGroup.items[0].target.query,'W6XYZ','click-through seed-ează indicativul aeronavei');
  assert.equal(flightsGroup.items[1].title,'YR-BBT','aeronava fără indicativ rămâne onestă pe imatriculare');
  assert.equal(collected.families.find(f=>f.family==='flights').total,2,'familia avioanelor poartă totalul sursei');
  collected=federatedCollect(federatedSearch('spectacol'),'events',{status:'cached',data:{items:[{id:'23616',title:'Boema de verificare',start:'2026-10-08T19:30',end:'2026-10-08T21:00',url:'https://operacluj.ro/spectacole/verificare-boema',venueName:'Opera Națională Română Cluj-Napoca',city:'Cluj-Napoca',venue:'operacluj'},{id:'odeon-9',title:'Spectacol de verificare',start:'2026-10-06T19:30',url:'https://teatrul-odeon.ro/spectacol/verificare',venueName:'Teatrul Odeon',city:'București',venue:'odeon'}],total:58,page:0,pages:3}});
  const eventsGroup=collected.groups.find(g=>g.id==='cultura');assert.ok(eventsGroup,'familia spectacolelor creează grupul cultură');
  assert.equal(eventsGroup.items[0].kind,'event','kind-ul eveniment există de la valul calendarelor publice');assert.equal(eventsGroup.items[0].title,'Boema de verificare');
  assert.equal(eventsGroup.items[0].subtitle,'Opera Națională Română Cluj-Napoca · Cluj-Napoca','subtitlul purtă instituția și orașul din registru');
  assert.equal(eventsGroup.items[0].target.domain,'cultura');assert.equal(eventsGroup.items[0].target.tab,'events');assert.equal(eventsGroup.items[0].target.query,'Boema de verificare','click-through seed-ează titlul spectacolului în tabul Spectacole');
  assert.equal(collected.families.find(f=>f.family==='events').total,58,'familia spectacolelor poartă totalul publicat de registru');
  collected=federatedCollect(federatedSearch('amplasament'),'anl-sites',{status:'cached',data:{title:'Amplasamente locuințe pentru tineri · ANL',period:'2007–2024',note:'Amplasamentele recepționate în programul național.',fields:['Nr. crt.','Judeţ','Localitate','Amplasament','Nr. u.l.'],total:764,records:[{'Nr. crt.':1,'Judeţ':'BUCURESTI','Localitate':'București','Amplasament':'Amplasamentul de verificare S11','Nr. u.l.':1352,_id:'anl-bucuresti-amplasamentul-de-ver-2015'}],page:0,pages:39}});
  const baniGroup=collected.groups.find(g=>g.id==='bani');assert.ok(baniGroup,'familia amplasamentelor ANL creează grupul bani');
  assert.equal(baniGroup.items[0].kind,'record');assert.equal(baniGroup.items[0].title,'Amplasamentul de verificare S11','titlul rândului este numele propriu al amplasamentului');
  assert.equal(baniGroup.items[0].subtitle,'București · BUCURESTI');assert.equal(baniGroup.items[0].subcategory,'Amplasamente locuințe ANL');
  assert.equal(baniGroup.items[0].target.domain,'bani');assert.equal(baniGroup.items[0].target.tab,'imobiliare');assert.equal(baniGroup.items[0].target.query,'Amplasamentul de verificare S11','click-through seed-ează tabul Imobiliare & locuințe');
  assert.equal(collected.families.find(f=>f.family==='anl-sites').total,764,'familia ANL poartă totalul registrului');
 collected=federatedCollect(federatedSearch('liceul'),'directory-schools',{status:'cached',data:{title:'Rețeaua școlară',period:'2025–2026',note:'Ediția 2025–2026.',fields:['Denumire lunga unitate','Localitate unitate','Judet PJ'],total:9,records:[{'Denumire lunga unitate':'Liceul Teoretic Eminescu','Localitate unitate':'Brașov','Judet PJ':'Brașov'}],page:0,pages:1}});
 educatie=collected.groups.find(g=>g.id==='educatie');assert.ok(educatie);assert.equal(educatie.items[0].kind,'record');assert.equal(educatie.items[0].title,'Liceul Teoretic Eminescu','the directory title heuristic mirrors the workspace');
 assert.equal(educatie.items[0].subtitle,'Brașov · Brașov');assert.equal(educatie.items[0].target.domain,'educatie');assert.equal(educatie.items[0].target.tab,'schools');
 collected=federatedCollect(federatedSearch('clinică'),'directory-health',{status:'cached',data:{title:'Clinici în registrul CNAS',period:'31.03.2026',note:'Contracte CNAS.',fields:['Nume furnizor','Judet PJ'],total:3,records:[{'Nume furnizor':'Clinica Sănătate','Judet PJ':'Cluj'}],page:0,pages:1}});
 const sanatate=collected.groups.find(g=>g.id==='sanatate');assert.ok(sanatate);assert.equal(sanatate.items[0].title,'Clinica Sănătate');assert.equal(sanatate.items[0].target.tab,'health');
 result=federatedSearch('școli');collected=federatedCollect(result,'stiri',{status:'cached',data:{items:[{id:'n1',title:'Comunicat despre școli',publishedAt:'2026-10-01',url:'https://www.edu.ro/comunicat',sourceName:'Ministerul Educației'}],total:3,page:0,pages:1}});
 const stiri=collected.groups.find(g=>g.id==='stiri');assert.ok(stiri);assert.equal(stiri.items[0].kind,'article');assert.equal(stiri.items[0].subtitle,'Ministerul Educației');assert.equal(stiri.items[0].url,'https://www.edu.ro/comunicat');
 assert.equal(stiri.items[0].target.domain,'stiri');assert.equal(stiri.items[0].target.tab,'news');
 collected=federatedCollect(result,'agricultura',{status:'unavailable',data:null,error:'Sursa a cerut o pauză (HTTP 429).'});
 const afir=collected.families.find(f=>f.family==='agricultura');assert.equal(afir.status,'unavailable');assert.ok(afir.note.includes('pauză'),'the AFIR honest-degrade class surfaces its note instead of failing the search');
 assert.ok(collected.groups.some(g=>g.id==='agricultura'&&g.items.length===0&&g.families.some(f=>f.family==='agricultura'&&f.status==='unavailable')),'the agricultura group exists with its honest error');
 const settled=federatedCollect(collected,'places',placesState);
 assert.ok(settled.groups.some(g=>g.items.some(i=>i.family==='places')),'a resolved family contributes its rows alongside the unavailable one');
 const settledJson=JSON.stringify(settled);
 const again=federatedCollect(settled,'places',placesState);
 assert.equal(JSON.stringify(again),settledJson,'a second response for a resolved family is ignored');
 const unknown=federatedCollect(settled,'nope',placesState);
 assert.equal(JSON.stringify(unknown),settledJson,'an unknown family changes nothing');
 const malformed=federatedCollect(federatedSearch('x'),'places',{status:'cached',data:{items:'nope'}});
 assert.equal(malformed.families.find(f=>f.family==='places').status,'unavailable','a malformed payload degrades honestly instead of throwing');
 const stale=federatedCollect(federatedSearch('sala'),'places',{status:'stale',data:{items:[placeIndex(1)],total:1,page:0,pages:1},error:'Ultima copie disponibilă.'});
 assert.equal(stale.families.find(f=>f.family==='places').status,'done');assert.ok(stale.groups.some(g=>g.items.some(i=>i.family==='places')),'a stale last-valid copy still maps its rows');
 result=federatedSearch('sala',{maxPerFamily:2});collected=federatedCollect(result,'places',placesState);
 assert.equal(collected.groups.find(g=>g.id==='cultura').items.length,2,'the per-family cap is configurable');

 console.log('LEG 6 — grouped list counts are countText-ready');
 for(const group of collected.groups){assert.equal(group.count,group.items.length);assert.match(query.countText(group.count,'rezultat','rezultate'),/\d/);}
 let chain=federatedSearch('sala');
 chain=federatedCollect(chain,'places',placesState);
 chain=federatedCollect(chain,'directory-health',{status:'cached',data:{fields:['Nume furnizor','Judet PJ'],total:1,records:[{'Nume furnizor':'Clinica Sala','Judet PJ':'Cluj'}],page:0,pages:1}});
 chain=federatedCollect(chain,'directory-schools',{status:'cached',data:{fields:['Denumire lunga unitate'],total:1,records:[{'Denumire lunga unitate':'Liceul Sala'}],page:0,pages:1}});
 const ordered=chain.groups.map(g=>g.id),expectedOrder=federatedGroups.filter(g=>ordered.includes(g.id)).map(g=>g.id);
 assert.deepEqual(ordered,expectedOrder,'groups always render in domain-registry order regardless of response arrival order');
 assert.deepEqual(ordered,['sanatate','educatie','cultura'],'late responses never reorder the grouped list');

 console.log('Federated family layer verified: eager families (gallery, stories corpus, CUI shortcut, dosar gate) resolve locally; every network family plans a validated request against an existing cached route; responses map to one grouped list in registry order with honest per-family degrade.');
}catch(error){fail('verify-federated-search failed: '+(error instanceof Error?error.message:String(error))+'\n'+(error instanceof Error&&error.stack||''))}finally{await rm(temp,{recursive:true,force:true})}
