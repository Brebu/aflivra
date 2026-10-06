/*
Federated search family layer — client-side fan-out over existing validated routes (no new HTTP endpoint).

Contract (consumed by T2.2 FederatedResults, T2.3 navigation seeds, T2.4 e2e):

  · federatedSearch(term, options) is synchronous and pure. It trims the term (hard cap 200
    characters, matching the route-side boundary), resolves the local families eagerly —
    the editorial gallery (options.gallery: app/v2-model places), the stories corpus
    (options.stories: /stories/index.json items loaded client-side via snapshotJson —
    verified client-loadable, StoriesWorkspace precedent), the numeric CUI shortcut
    (2–10 digits, mirrors the hero search() routing) and the dosar gate (courtNumberTerm)
    — and plans one validated request per qualifying network family, all against cached
    /api routes: /api/places?category=local-all, /api/catalog, /api/lawyers (min 3 chars,
    max 160), /api/directory ×4 (max 100), /api/domain kind=stiri and kind=agricultura.
  · federatedCollect(result, family, response) maps one route response (SourceState JSON)
    into result items and returns a NEW result — the input is never mutated. A family
    resolved once ignores later responses; 'unavailable' or malformed payloads degrade to
    an honest per-family note (the AFIR class) instead of failing the search; a stale
    payload with data still maps its rows.
  · Groups render in domain-registry order (federatedGroups mirrors v2-model.domains —
    verified by scripts/verify-federated-search.mjs). group.count is the number of
    displayed rows; the family state carries the source's full total.
  · validDomainTab(domain, tab) validates the new `tab` hash parameter against the
    topicSections registry ('data' is the auto tab of every domain). T2.3 must route
    every federated target.tab through it.
  · Item targets follow the go(view, id, query) semantics: {view:'place'|'company'|'domain',
    domain, tab, id, query, sub, courtNumber}. courtNumber seeds the courts form.

Families v1: places/local-all, catalog, lawyers, directory×4 (schools/health/pharmacies/
hospitals), feeds/stiri, feeds/agricultura, stories, gallery, cui, dosare.

Excluded from v1 (rationale, recorded not silent): cinema and events (locality/day-scoped
corpora with no national query contract — reachable through their own workspaces);
transport (București–Ilfov coverage gate, no national contract); localities/SIRUTA
(reference-lookup surface rather than a discovery corpus — locality names already surface
through the places family); legal/law search, films feed, weather, company-by-name (not in
the v1 family plan; 'legislation' is a reserved kind for a future law-search family).
'notary-office' is not a distinct kind: notaries exist only as the OSM places subcategory
„Notari" — there is no notary professional registry in this app ( Architect feasibility
flag #1).

Importing this module into compiled components requires extending the closed stub
resolver lists of scripts/verify-location.mjs and scripts/verify-search-ui.mjs in the
same change (conventions.md, closed-resolver constraint).
*/
import {matchesQuery} from '@/lib/live/query';
import {topicSections} from '@/lib/dashboard-topics';

export type FederatedKind='place'|'company'|'lawyer'|'dataset'|'record'|'article'|'story'|'dosar';
export type FederatedFamilyId='places'|'catalog'|'lawyers'|'directory-schools'|'directory-health'|'directory-pharmacies'|'directory-hospitals'|'stiri'|'agricultura'|'stories'|'gallery'|'cui'|'dosare';
export type FederatedTarget={view:'place'|'company'|'domain';domain?:string;tab?:string;id?:string;query?:string;sub?:string;courtNumber?:string};
export type FederatedItem={family:FederatedFamilyId;category:string;subcategory?:string;id:string;title:string;subtitle?:string;snippet?:string;kind:FederatedKind;source:string;url?:string;target:FederatedTarget};
export type FederatedFamilyState={family:FederatedFamilyId;status:'pending'|'done'|'gate'|'unavailable';total?:number;note?:string};
export type FederatedGroupResult={id:string;label:string;items:FederatedItem[];count:number;families:FederatedFamilyState[]};
export type FederatedRequest={family:FederatedFamilyId;url:string};
export type FederatedSearchResult={term:string;maxPerFamily:number;groups:FederatedGroupResult[];families:FederatedFamilyState[];requests:FederatedRequest[];note:string|null};
export type FederatedPlace={id:string;name:string;kind?:string;city?:string;region?:string;tag?:string;summary?:string;features?:string[];interests?:string[]};
export type FederatedStory={id:string|number;title:string;categories?:string[];authors?:string[];url?:string;search?:string};
export type FederatedOptions={gallery?:readonly FederatedPlace[];stories?:readonly FederatedStory[];maxPerFamily?:number};

// Group order and labels mirror the domain registry in app/v2-model.ts; verify-federated-search.mjs fails if the registry drifts.
export const federatedGroups:readonly {id:string;label:string}[]=[
 {id:'local',label:'Orașul tău'},{id:'vreme',label:'Vreme și prognoză'},{id:'bani',label:'Bani & economie'},{id:'firme',label:'Firme, pe înțeles'},{id:'mediu',label:'Natură și mediu'},{id:'transport',label:'În mișcare'},{id:'sanatate',label:'Sănătate aproape'},{id:'educatie',label:'Educație & viitor'},{id:'cultura',label:'Cultură și turism'},{id:'munca',label:'Muncă & oportunități'},{id:'justitie',label:'Lege & administrație'},{id:'energie',label:'Energie & consum'},{id:'agricultura',label:'Pământ & agricultură'},{id:'filme',label:'Filme și cinematografe'},{id:'povesti',label:'Povești și lectură'},{id:'stiri',label:'Știri & actualitate'}
];
const groupLabels=new Map(federatedGroups.map(g=>[g.id,g.label]));
const directoryTargets={schools:{domain:'educatie',tab:'schools'},health:{domain:'sanatate',tab:'health'},pharmacies:{domain:'sanatate',tab:'pharmacies'},hospitals:{domain:'sanatate',tab:'hospitals'}} as const;

export type FederatedFamilyDescriptor={id:FederatedFamilyId;label:string;source:string;kind:FederatedKind;category?:string;minChars?:number;maxChars?:number;eager?:boolean;request?:(term:string)=>string};

const apiDirectory=(kind:string,term:string)=>'/api/directory?'+new URLSearchParams({kind,q:term,page:'0',geoScope:'national'});
const apiDomain=(kind:string,term:string)=>'/api/domain?'+new URLSearchParams({kind,q:term,page:'0',sort:'recent',geoScope:'national'});

export const federatedFamilies:readonly FederatedFamilyDescriptor[]=[
 {id:'places',label:'Inventarul național de locuri',source:'OpenStreetMap',kind:'place',request:term=>'/api/places?'+new URLSearchParams({category:'local-all',q:term,scope:'all',sort:'name',page:'0'})},
 {id:'catalog',label:'Catalogul de date publice',source:'data.gov.ro',kind:'dataset',request:term=>'/api/catalog?'+new URLSearchParams({q:term,page:'0',geoScope:'national'})},
 {id:'lawyers',label:'Tabloul avocaților',source:'IFEP / UNBR',kind:'lawyer',category:'justitie',minChars:3,maxChars:160,request:term=>'/api/lawyers?'+new URLSearchParams({q:term,page:'0',sort:'recent',geoScope:'national'})},
 {id:'directory-schools',label:'Rețeaua școlară',source:'data.gov.ro',kind:'record',category:'educatie',maxChars:100,request:term=>apiDirectory('schools',term)},
 {id:'directory-health',label:'Clinici în registrul CNAS',source:'data.gov.ro',kind:'record',category:'sanatate',maxChars:100,request:term=>apiDirectory('health',term)},
 {id:'directory-pharmacies',label:'Farmacii în registrul CNAS',source:'data.gov.ro',kind:'record',category:'sanatate',maxChars:100,request:term=>apiDirectory('pharmacies',term)},
 {id:'directory-hospitals',label:'Spitale în registrul CNAS',source:'data.gov.ro',kind:'record',category:'sanatate',maxChars:100,request:term=>apiDirectory('hospitals',term)},
 {id:'stiri',label:'Anunțuri oficiale',source:'Anunțuri oficiale · surse reunite',kind:'article',category:'stiri',request:term=>apiDomain('stiri',term)},
 {id:'agricultura',label:'Finanțări și anunțuri AFIR',source:'afir.ro',kind:'article',category:'agricultura',request:term=>apiDomain('agricultura',term)},
 {id:'stories',label:'Povești integral',source:'Wikisource',kind:'story',category:'povesti',eager:true},
 {id:'gallery',label:'Galeria de explorat',source:'Prezentare editorială',kind:'place',category:'cultura',eager:true},
 {id:'cui',label:'Firme după CUI',source:'ANAF',kind:'company',category:'firme',eager:true},
 {id:'dosare',label:'Dosare în instanțe',source:'portal.just.ro',kind:'dosar',category:'justitie',eager:true}
];
const descriptorById=new Map(federatedFamilies.map(f=>[f.id,f]));

export function validDomainTab(domain:string,tab:string):boolean{
 // The tab hash parameter is accepted only against the topicSections registry, like every registry-validated parameter ('data' is the auto tab of every domain).
 if(!tab||!groupLabels.has(domain))return false;
 return tab==='data'||(topicSections[domain]||[]).some(s=>s.id===tab);
}
export function courtNumberTerm(value:unknown):string|null{
 const term=String(value??'').trim().replace(/\s*\/\s*/g,'/');
 return /^\d{1,8}\/\d{1,5}\/\d{4}(?:\/[a-zA-Z0-9.]{1,20})?$/.test(term)?term:null;
}
const cuiTerm=(term:string)=>/^\d{2,10}$/.test(term)?term:null;
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;
const snip=(value:unknown)=>{const s=text(value);return s?s.slice(0,160):undefined};
const asObjects=(value:unknown):Record<string,unknown>[]|null=>Array.isArray(value)&&value.every(v=>v&&typeof v==='object')?value as Record<string,unknown>[]:null;
const numberOr=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value):fallback;

function placeCategory(record:Record<string,unknown>):string{
 const categories=Array.isArray(record.categories)?record.categories.map(String):[];
 for(const category of categories)if(validDomainTab(category,'places'))return category;
 return 'local';
}
function placeItem(record:Record<string,unknown>):FederatedItem{
 const category=placeCategory(record),name=text(record.name)||'Loc fără nume publicat';
 const label=[...new Set((asObjects(record.types)||[]).map(t=>text(t.label)).filter((l):l is string=>!!l))][0];
 return {family:'places',category,subcategory:label,id:String(record.id??name),title:name,subtitle:text(record.address)||text(record.city),kind:'place',source:'OpenStreetMap',url:text(record.sourceUrl),target:{view:'domain',domain:category,tab:'places',query:name,...(label?{sub:label}:{})}};
}
function catalogItem(record:Record<string,unknown>):FederatedItem{
 const title=text(record.title)||'Set de date publice';
 const categories=Array.isArray(record.categories)?record.categories.map(String):[];
 const domain=categories.find(c=>groupLabels.has(c))||'local';
 return {family:'catalog',category:domain,id:String(record.id??title),title,subtitle:text(record.organization),snippet:snip(record.note),kind:'dataset',source:'data.gov.ro',url:text(record.url),target:{view:'domain',domain,tab:'data',query:title}};
}
function lawyerItem(record:Record<string,unknown>,term:string):FederatedItem{
 const name=text(record.name)||term||'Avocat în tablou';
 return {family:'lawyers',category:'justitie',subcategory:'Tabloul avocaților',id:String(record.id??name),title:name,subtitle:text(record.title),kind:'lawyer',source:'IFEP / UNBR',url:text(record.url),target:{view:'domain',domain:'justitie',tab:'lawyers',query:name}};
}
// The registry record headline mirrors RecordBrowser: named supplier, long/legal unit name, or the first denomination-like field.
function recordTitle(record:Record<string,unknown>):string{
 const direct=record['Nume furnizor']||record['Denumire lunga unitate']||record['Denumire PJ'];
 if(text(direct))return String(direct);
 const match=Object.entries(record).find(([key])=>/denum|furnizor/i.test(key));
 return text(match?.[1])?String(match?.[1]):'Înregistrare publică';
}
function directoryItem(kind:keyof typeof directoryTargets,record:Record<string,unknown>):FederatedItem{
 const target=directoryTargets[kind],title=recordTitle(record);
 const subtitle=[text(record['Localitate unitate']),text(record['Judet PJ'])].filter(Boolean).join(' · ');
 return {family:('directory-'+kind) as FederatedFamilyId,category:target.domain,subcategory:descriptorById.get(('directory-'+kind) as FederatedFamilyId)?.label,id:record._id!==undefined?String(record._id):title,title,subtitle:subtitle||undefined,kind:'record',source:'data.gov.ro',target:{view:'domain',domain:target.domain,tab:target.tab,query:title}};
}
function articleItem(family:'stiri'|'agricultura',record:Record<string,unknown>,label:string):FederatedItem{
 const title=text(record.title)||'Anunț oficial';
 return {family,category:family,subcategory:label,id:String(record.id??record.url??title),title,subtitle:text(record.sourceName)||label,snippet:snip(record.summary),kind:'article',source:family==='stiri'?'Anunțuri oficiale · surse reunite':'afir.ro',url:text(record.url),target:{view:'domain',domain:family,tab:'news'}};
}
function galleryItem(place:FederatedPlace):FederatedItem{
 const location=[place.city,place.region].filter(Boolean).join(', ');
 return {family:'gallery',category:'cultura',subcategory:place.kind||undefined,id:place.id,title:place.name,subtitle:[place.kind,location].filter(Boolean).join(' · '),snippet:snip(place.summary),kind:'place',source:'Prezentare editorială',target:{view:'place',id:place.id}};
}
function storyItem(story:FederatedStory):FederatedItem{
 return {family:'stories',category:'povesti',subcategory:story.categories?.[0],id:String(story.id),title:story.title,subtitle:(story.authors||[]).join(' · ')||undefined,snippet:snip(story.search),kind:'story',source:'Wikisource',url:story.url,target:{view:'domain',domain:'povesti',tab:'stories',query:story.title}};
}
type Mapped={items:FederatedItem[];total:number}|null;
function mapFamily(family:FederatedFamilyId,data:Record<string,unknown>,term:string,cap:number):Mapped{
 if(family==='places'||family==='lawyers'){
  const rows=asObjects(family==='places'?data.items:data.items);
  if(!rows)return null;
  return {items:rows.slice(0,cap).map(family==='places'?placeItem:r=>lawyerItem(r,term)),total:numberOr(data.total,rows.length)};
 }
 if(family==='catalog'){
  const rows=asObjects(data.results??data.items);
  if(!rows)return null;
  return {items:rows.slice(0,cap).map(catalogItem),total:numberOr(data.count,numberOr(data.total,rows.length))};
 }
 if(family==='stiri'||family==='agricultura'){
  const rows=asObjects(data.items);
  if(!rows)return null;
  return {items:rows.slice(0,cap).map(r=>articleItem(family,r,descriptorById.get(family)!.label)),total:numberOr(data.total,rows.length)};
 }
 if(family==='directory-schools'||family==='directory-health'||family==='directory-pharmacies'||family==='directory-hospitals'){
  const rows=asObjects(data.records);
  if(!rows)return null;
  const kind=family.slice('directory-'.length) as keyof typeof directoryTargets;
  return {items:rows.slice(0,cap).map(r=>directoryItem(kind,r)),total:numberOr(data.total,rows.length)};
 }
 return null;
}
function assembleGroups(items:readonly FederatedItem[],families:readonly FederatedFamilyState[]):FederatedGroupResult[]{
 const states=new Map(families.map(f=>[f.family,f]));
 const rowsByGroup=new Map<string,FederatedItem[]>();
 for(const item of items){const rows=rowsByGroup.get(item.category)||[];rows.push(item);rowsByGroup.set(item.category,rows)}
 const groups:FederatedGroupResult[]=[];
 for(const domain of federatedGroups){
  const rows=rowsByGroup.get(domain.id)||[];
  const owners=[...new Set(rows.map(r=>r.family))].map(id=>states.get(id)).filter((s):s is FederatedFamilyState=>!!s&&s.status!=='pending');
  const anchored=federatedFamilies.filter(d=>d.category===domain.id).map(d=>states.get(d.id)).filter((s):s is FederatedFamilyState=>!!s&&s.status!=='pending');
  const merged=[...new Map([...owners,...anchored].map(s=>[s.family,s])).values()];
  if(!rows.length&&!merged.length)continue;
  groups.push({id:domain.id,label:domain.label,items:rows,count:rows.length,families:merged});
 }
 return groups;
}
export function federatedSearch(term:unknown,options:FederatedOptions={}):FederatedSearchResult{
 const maxPerFamily=options.maxPerFamily??6,text=String(term??'').trim();
 if(text.length>200)return {term:text,maxPerFamily,groups:[],families:[],requests:[],note:'Căutarea este prea lungă. Folosește cel mult 200 de caractere.'};
 if(!text)return {term:'',maxPerFamily,groups:[],families:[],requests:[],note:null};
 const families:FederatedFamilyState[]=[],requests:FederatedRequest[]=[],items:FederatedItem[]=[];
 const cui=cuiTerm(text);
 if(cui){families.push({family:'cui',status:'done',total:1});
  items.push({family:'cui',category:'firme',id:cui,title:'Firma cu CUI '+cui,subtitle:'Identitate și bilanț · ANAF',kind:'company',source:'ANAF',target:{view:'company',id:cui}})}
 const dosar=courtNumberTerm(text);
 if(dosar){families.push({family:'dosare',status:'done',total:1});
  const number=courtNumberTerm(text)!;
  items.push({family:'dosare',category:'justitie',subcategory:'Dosare în instanță',id:number,title:'Dosarul '+number,subtitle:'Dosare în instanță · portal.just.ro',kind:'dosar',source:'portal.just.ro',target:{view:'domain',domain:'justitie',tab:'legal',courtNumber:number}})}
 if(options.gallery){
  const rows=options.gallery.filter(p=>matchesQuery({name:p.name,kind:p.kind,city:p.city,region:p.region,tag:p.tag,features:p.features,interests:p.interests},text));
  families.push({family:'gallery',status:'done',total:rows.length});
  items.push(...rows.slice(0,maxPerFamily).map(galleryItem));
 }
 if(options.stories){
  const rows=options.stories.filter(s=>matchesQuery({title:s.title,authors:s.authors,categories:s.categories,text:s.search},text));
  families.push({family:'stories',status:'done',total:rows.length});
  items.push(...rows.slice(0,maxPerFamily).map(storyItem));
 }
 for(const family of federatedFamilies){
  if(family.eager||!family.request)continue;
  if(family.minChars&&text.length<family.minChars){families.push({family:family.id,status:'gate',note:'Introdu cel puțin '+family.minChars+' caractere pentru acest registru.'});continue}
  if(family.maxChars&&text.length>family.maxChars){families.push({family:family.id,status:'gate',note:'Căutarea pentru acest registru primește cel mult '+family.maxChars+' caractere.'});continue}
  families.push({family:family.id,status:'pending'});
  requests.push({family:family.id,url:family.request(text)});
 }
 return {term:text,maxPerFamily,groups:assembleGroups(items,families),families,requests,note:null};
}
export function federatedCollect(result:FederatedSearchResult,family:FederatedFamilyId,response:unknown):FederatedSearchResult{
 // A late or duplicate response for a resolved family is dropped, matching the shared source hook.
 const current=result.families.find(f=>f.family===family);
 if(!current||current.status!=='pending')return result;
 const payload=response&&typeof response==='object'?response as Record<string,unknown>:null;
 const data=payload&&payload.data&&typeof payload.data==='object'?payload.data as Record<string,unknown>:null;
 const note=text(payload?.error);
 const finish=(state:FederatedFamilyState,items:FederatedItem[]):FederatedSearchResult=>{
  const families=result.families.map(f=>f.family===family?state:f);
  return {...result,families,groups:assembleGroups([...result.groups.flatMap(g=>g.items),...items],families)};
 };
 if((payload&&String(payload.status)==='unavailable')||!data)return finish({family,status:'unavailable',note:note||'Sursa nu a răspuns pentru această căutare. Poți reîncerca.'},[]);
 const mapped=mapFamily(family,data,result.term,result.maxPerFamily);
 if(!mapped)return finish({family,status:'unavailable',note:note||'Răspunsul sursei nu are structura așteptată.'},[]);
 return finish({family,status:'done',...(mapped.total>0?{total:mapped.total}:{}),...(note?{note}:{})},mapped.items);
}
