import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Poarta de inventar: enumeră integral suprafața aplicației din registre (domenii, secțiuni,
// categorii de catalog, categorii și subcategorii de locuri, familii de surse) și refuză orice
// familie de sursă din refresh-groups.json pe care nici paritatea (verify-source-errors.mjs),
// nici un harness numit nu o acoperă. Offline, fără rețea, rapid.
const root=resolve(import.meta.dirname,'..');
const temp=await mkdtemp(join(tmpdir(),'aflivra-sweep-inventory-'));
try{
 const compile=async(file,name,replacements=[])=>{let source=await readFile(join(root,file),'utf8');
  for(const [pattern,replacement] of replacements)source=source.replace(pattern,replacement);
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  await writeFile(join(temp,name+'.mjs'),output);return import(pathToFileURL(join(temp,name+'.mjs')))};
 const {topicSections,topicGroup,catalogTopic}=await compile('lib/dashboard-topics.ts','dashboard-topics');
 const {catalogCategories,otherCatalogCategory}=await compile('lib/live/catalog-categories.ts','catalog-categories');
 const modelSource=await readFile(join(root,'app/v2-model.ts'),'utf8');
 const domainIds=[...modelSource.match(/export const domains=\[([\s\S]*?)\n\];/)[1].matchAll(/"id": "([a-z]+)"/g)].map(match=>match[1]);
 assert.equal(domainIds.length,16,'inventarul de admin: 16 domenii');
 assert.equal(new Set(domainIds).size,16,'domeniile sunt unice');
 const sections=Object.keys(topicSections);
 assert.deepEqual([...sections].sort(),[...domainIds].sort(),' fiecare domeniu are secțiunile lui în topicSections');
 let sectionCount=0;
 for(const domain of domainIds)sectionCount+=topicSections[domain].length;
 assert.equal(sectionCount,46,'inventarul de admin: 46 de secțiuni pe domenii');
 for(const domain of domainIds)for(const section of topicSections[domain]){
  assert(section.id&&section.label,'fiecare secțiune are id și etichetă');
  assert.notEqual(section.id,'data','data este tab-ul automat, nu o secțiune declarată');
 }
 const workspaceSource=await readFile(join(root,'app/domain-workspace.tsx'),'utf8');
 const handledIds=new Set([...workspaceSource.matchAll(/id==='([a-z]+)'/g)].map(match=>match[1]));
 const recordKinds=[...workspaceSource.matchAll(/\['health','pharmacies','hospitals','schools'\]\.includes\(id\)/g)];
 assert.equal(recordKinds.length,1,'registrul RecordBrowser este montat pe cele patru feluri');
 for(const kind of ['health','pharmacies','hospitals','schools'])handledIds.add(kind);
 const unhandled=domainIds.flatMap(domain=>topicSections[domain].filter(section=>!handledIds.has(section.id)).map(section=>domain+'/'+section.id));
 assert.deepEqual(unhandled,[],'fiecare secțiune declarată are un conținut în DomainWorkspace.content()');
 const catalogIds=catalogCategories.map(category=>category.id);
 assert.equal(catalogIds.length,14,'inventarul CKAN: 14 categorii de căutare');
 assert.equal(otherCatalogCategory.id,'alte','categoria reziduală „alte” există');
 for(const category of catalogCategories){assert(category.name&&category.query.length>3,'fiecare categorie de catalog are nume și interogare publicată')}
 const mapped=new Set(domainIds.map(domain=>catalogTopic(domain)));
 assert.deepEqual([...mapped].sort(),[...new Set(catalogIds)].sort(),'fiecare domeniu se rezolvă într-o categorie de catalog, fără nepotriviri');
 const manifest=JSON.parse(await readFile(join(root,'public/places/manifest.json'),'utf8'));
 assert.equal(manifest.schema,'aflivra-places-v2','manifestul locurilor are schema așteptată');
 assert.equal(manifest.count,178868,'inventarul național de locuri: 178.868 de înregistrări');
 const placesDomains=domainIds.filter(domain=>topicSections[domain].some(section=>section.id==='places'));
 const manifestCategories=Object.keys(manifest.categories);
 assert.deepEqual(manifestCategories.filter(id=>id!=='local-all').sort(),placesDomains.sort(),'categoriile de locuri acoperă exact domeniile cu secțiune de locuri');
 assert.equal(manifest.categories['local-all'],manifest.count,'indexul național local-all acoperă întregul inventar');
 for(const category of manifestCategories)assert(manifest.categories[category]>0,'fiecare categorie de locuri are înregistrări');
 assert.ok(manifestCategories.length>=15,'16 chei de categorii în manifest (15 + local-all)');
 const masterSubcategories=manifest.subcategories['local-all'];
 assert.ok(masterSubcategories.length>=60,'~70 de subcategorii naționale în indexul local-all');
 assert.ok(new Set(masterSubcategories).size===masterSubcategories.length,'subcategoriile naționale sunt unice');
 for(const [category,subcategories] of Object.entries(manifest.subcategories)){
  assert.deepEqual(subcategories.filter(sub=>!masterSubcategories.includes(sub)),[],'subcategoriile categoriei '+category+' fac parte din lista națională');
 }
 const keysOn=(source,name)=>{const line=source.split('\n').find(text=>text.includes('export const '+name)&&text.includes('{name:'));assert.ok(line,'const '+name+' există pe o singură linie');return [...line.matchAll(/([a-z]+):\{name:/g)].map(match=>match[1])};
 const feedsSource=await readFile(join(root,'lib/live/feeds.ts'),'utf8');
 const feedKinds=keysOn(feedsSource,'feedConfigs');
 for(const kind of feedKinds){
  assert(domainIds.includes(kind)||kind==='stiri'||kind==='munca','fiecare flux aparține unui domeniu');
  if(domainIds.includes(kind))assert(topicSections[kind].some(section=>section.id==='news'),'domeniul fluxului '+kind+' are secțiunea de anunțuri');
 }
 assert.ok(feedsSource.includes('export const afirLoader'),'familia AFIR are încărcător propriu');
 assert.ok(feedsSource.includes('export const filmsLoader'),'familia filmelor are încărcător propriu');
 assert.equal(topicSections.agricultura.filter(section=>section.id==='news').length,1,'anunțurile AFIR alimentează secțiunea de finanțări');
 assert.equal(topicSections.filme.filter(section=>section.id==='films').length,1,'filmele Wikidata alimentează secțiunea de film românesc');
 const transitModes=['network','vehicles','arrivals','alerts'];
 for(const mode of transitModes)assert(topicSections.transport.some(section=>section.id===mode),'rețeaua de transport are secțiunea '+mode);
 const directoryKinds=keysOn(await readFile(join(root,'lib/live/directories.ts'),'utf8'),'directories');
 assert.deepEqual([...directoryKinds].sort(),['health','hospitals','pharmacies','schools'].sort(),'cele patru registre de directoir: școli și cele trei CNAS');
 const cinemas=JSON.parse(await readFile(join(root,'public/cinema/cinemas.json'),'utf8'));
 assert.ok(cinemas.items.length>0,'registrul cinematografelor există');
 assert.ok(cinemas.items.some(cinema=>cinema.externalCode==='1824'),'cinematograful implicit București (1824) este în registru');
 const institutions=JSON.parse(await readFile(join(root,'public/courts/institutions.json'),'utf8'));
 assert.ok(institutions.items.length>0,'registrul instanțelor există');
 for(const institution of institutions.items)assert(institution.id&&institution.label,'fiecare instanță are id și denumire');
 const groups=JSON.parse(await readFile(join(root,'lib/live/refresh-groups.json'),'utf8'));
 assert.equal(groups.groups.length,5,'cinci ture de reîmprospătare zilnică');
 const members=groups.groups.flatMap(group=>group.members);
 assert.equal(new Set(members).size,members.length,'fiecare membru de tură apare o singură dată');
 for(const list of [groups.seedBacked,groups.onDemand])for(const entry of list)assert(entry.family&&entry.reason,'fiecare familie exceptată are nume și motiv publicat');
 const paritySource=await readFile(join(root,'scripts/verify-source-errors.mjs'),'utf8');
 const parityFamilies=new Set([...paritySource.matchAll(/\{family:'([^']+)',routeName/g)].map(match=>match[1]));
 assert.ok(parityFamilies.size>=19,'tabela de paritate acoperă universul de familii');
 const coverage={
  'bnr':{harness:'verify-refresh-sweep.mjs'},'weather.anm':{harness:'verify-refresh-sweep.mjs'},'weather.alerts':{harness:'verify-refresh-sweep.mjs'},
  'company.default':{parity:'company/anaf'},'knowledge.company.default':{parity:'company/anaf'},
  'catalog.default':{parity:'catalog/ckan'},'catalog.category.bani':{parity:'catalog/ckan'},'catalog.category.sanatate':{parity:'catalog/ckan'},
  'forecast.bucuresti':{parity:'weather/open-meteo'},'events.odeon':{parity:'events/odeon'},'cinema.bucuresti.today':{parity:'cinema/cinemacity'},
  'feed.munca':{parity:'feeds/stiri'},'feed.stiri':{parity:'feeds/stiri'},'feed.sanatate':{parity:'feeds/stiri'},'feed.educatie':{parity:'feeds/stiri'},'feed.justitie':{parity:'feeds/stiri'},
  'feed.agricultura':{parity:'feeds/agricultura'},
  'law.search.default':{parity:'legal/law'},'law.search.codcivil':{parity:'legal/law'},'lawyers.default':{parity:'lawyers/ifep'},'directory.schools.page0':{parity:'directory/schools'}};
 const familyCoverage={
  ...Object.fromEntries(members.map(member=>[member,coverage[member]])),
  'transport':{parity:'transport/tpbi'},'siruta':{parity:'localities/siruta'},'films':{parity:'feeds/filme'},
  'directory.health':{parity:'directory/health'},'directory.pharmacies':{parity:'directory/pharmacies'},'directory.hospitals':{parity:'directory/hospitals'},
  'law.consolidated.full':{harness:'verify-legal-records.mjs'},
  'catalog.organizations-formats':{harness:'verify-catalog.mjs'},'resource.datastores':{harness:'verify-downloads.mjs'},
  'transport.realtime':{parity:'transport/realtime'},'courts':{parity:'courts/portal.just'},'forecast':{parity:'weather/open-meteo'},
  'company-knowledge':{parity:'company/anaf'},
  'articles-stories-cinema':{parity:['stories/wikisource','cinema/cinemacity','feeds/agricultura']},
  'feeds.energie-transport':{parity:'feeds/stiri'},'datastore.pages':{parity:'directory/schools'},'law.search':{parity:'legal/law'}};
 const registryKeys=[...members,...groups.seedBacked.map(entry=>entry.family),...groups.onDemand.map(entry=>entry.family)];
 const uncovered=[];
 for(const key of new Set(registryKeys)){
  const entry=familyCoverage[key];
  if(!entry){uncovered.push(key+' — fără acoperire înregistrată');continue}
  for(const family of [].concat(entry.parity||[]))if(!parityFamilies.has(family))uncovered.push(key+' → familia de paritate '+family+' lipsește din verify-source-errors.mjs');
  for(const harness of [].concat(entry.harness||[]))await assert.doesNotReject(access(join(root,'scripts',harness)),Error);
 }
 assert.deepEqual(uncovered,[],'orice familie de sursă din registry este acoperită de paritate sau de un harness numit');
 const coveredParity=new Set(registryKeys.flatMap(key=>[].concat(familyCoverage[key]?.parity||[])));
 const unaccountedParity=[...parityFamilies].filter(family=>!coveredParity.has(family));
 assert.deepEqual(unaccountedParity,[],'orice familie din tabela de paritate este legată de un registru');
 console.log('Inventarul de admin verificat: 16 domenii, 46 de secțiuni cu conținut, 14 categorii de catalog mapped, '+placesDomains.length+' categorii de locuri ('+masterSubcategories.length+' subcategorii naționale), 178.868 de locuri, '+feedKinds.length+' fluxuri + AFIR + filme, '+transitModes.length+' feluri de transport, '+directoryKinds.length+' registre, '+cinemas.items.length+' cinematografe, '+institutions.items.length+' instanțe și '+new Set(registryKeys).size+' familii de surse din registry, toate acoperite de paritate sau de un harness numit.');
}catch(error){console.error(String(error&&error.message||error));process.exitCode=1}
finally{await rm(temp,{recursive:true,force:true})}
