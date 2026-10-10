import {registryMatchesLocation} from '../geographic-scope';
import {liveContext} from './request-context';
import {env} from 'cloudflare:workers';
import type {Loader,Loaded,SourceState} from './types';
import {SourceError} from './adapters';
import baseSeeds from './seed.json';
import {serverSeeds,catalogSeed} from './seed-snapshots';
import resourceCopies from './resource-seed.json';
import {validatedResourceCopy} from './resource-copy';
import {createHash} from 'node:crypto';
import {matchesQuery,paginate} from './query';
const seeds:Record<string,any>={...baseSeeds,...serverSeeds};
let schoolRecords:any[]|null=null;
function schoolSeed(key:string){const match=key.match(/^directory:schools:(.*):(\d+)$/),base=seeds['directory:schools'];if(!match||!base?.data?.records)return null;schoolRecords??=base.data.records.map((r:any)=>base.data.compact?Object.fromEntries(base.data.fields.map((field:string,i:number)=>[field,r[i]])):r);let query=match[1],context:any=null;try{const parsed=JSON.parse(query);if(parsed&&typeof parsed.q==='string'){query=parsed.q;context={...parsed,active:true,scope:'context'}}}catch{}const rows=schoolRecords!.filter(r=>matchesQuery(r,query)&&(!context||registryMatchesLocation(r,context,'schools'))),selection=paginate(rows,Number(match[2]),20);return{...base,data:{...base.data,...selection,items:undefined,records:selection.items,compact:false,paginated:true,pageSize:20,copyComplete:false,copyRecords:schoolRecords!.length,note:base.data.note+' Copia inițială verificată conține '+schoolRecords!.length+' înregistrări și câmpurile preluate atunci; nu este certificată ca registru integral. Se încearcă actualizarea API-ului.'}}}
function getSeed(key:string){if(key.startsWith('resource:'))return validatedResourceCopy((resourceCopies as Record<string,any>)[key]);const school=schoolSeed(key);if(school)return school;if(key.startsWith('catalog:')){const m=key.match(/^catalog:(?:v2:)?([^:]*):(.*):(\d+)$/);if(m){
   // Clasificarea de rezervă e inventarul verificat, cu categoriile multiple
   // canonic — fără aliasuri care schimbă sensul categoriei cerute. Fereastra
   // de trei ani rămâne politica de servire a fallback-ului, acum declarată
   // onest în răspuns, cu baza totalului pe măsură.
   const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const category=m[1],text=m[2];
   const seedRows=catalogSeed.filter(r=>!text||norm(r.title+' '+r.organization+' '+r.notes).includes(norm(text)));
   const rows=seedRows.filter(r=>(!category||Array.isArray(r.categories)&&r.categories.includes(category))&&r.modified>=new Date(Date.now()-3*365.25*86400000).toISOString().slice(0,10));
   return{fetchedAt:'2026-10-04T07:11:39.637Z',publishedAt:rows[0]?.modified||null,data:{count:rows.length,results:rows.slice(Number(m[3])*24,Number(m[3])*24+24),ageFilterApplied:true,totalBasis:{seedRows:seedRows.length,afterAgeFilter:rows.length}}}}}return seeds[key]}
export type Row={key:string;data:string|null;published_at:string|null;last_success_at:string|null;last_attempt_at:string|null;expires_at:number;next_attempt_at:number;failures:number;lock_until:number;error:string|null;error_diagnostic?:string|null;adapter_version?:string};
const iso=(n:number)=>n?new Date(n).toISOString():null;
const roDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const afterNightBoundary=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',hour:'2-digit',hourCycle:'h23'}).format(new Date()))>=3;
async function payload(db:D1Database,raw:string){const data=JSON.parse(raw);if(data?._cacheFormat!=='aflivra-json-chunks-v1')return data;const parts:string[]=[];for(let at=0;at<data.keys.length;at+=4){const found=await Promise.all(data.keys.slice(at,at+4).map(async(key:string)=>{const row=await db.prepare('SELECT data FROM source_cache WHERE key=?').bind(key).first<{data:string}>();if(!row?.data)throw new SourceError('Copia persistentă nu poate fi citită integral acum.');return JSON.parse(row.data)}));parts.push(...found)}const text=parts.join('');if(new TextEncoder().encode(text).length!==data.bytes||createHash('sha256').update(text).digest('hex')!==data.sha256)throw new SourceError('Copia persistentă nu a trecut verificarea integralității.');return JSON.parse(text)}
async function storePayload(db:D1Database,key:string,data:any){const text=JSON.stringify(data),bytes=new TextEncoder().encode(text).length;if(bytes<1_700_000)return{encoded:text,created:[] as string[]};const digest=createHash('sha256').update(text).digest('hex'),owner=createHash('sha256').update(key).digest('hex'),keys:string[]=[],created:string[]=[];try{for(let at=0;at<text.length;at+=200000){const partKey=`payload:${owner}:${digest}:${at}`,part=JSON.stringify(text.slice(at,at+200000));const result=await db.prepare('INSERT OR IGNORE INTO source_cache (key,data,last_success_at,adapter_version) VALUES (?,?,?,?)').bind(partKey,part,new Date().toISOString(),'cache.json.chunk.v1').run();keys.push(partKey);if(result.meta.changes)created.push(partKey)}const encoded=JSON.stringify({_cacheFormat:'aflivra-json-chunks-v1',keys,bytes,sha256:digest});await payload(db,encoded);return{encoded,created}}catch(e){for(const key of created)await db.prepare('DELETE FROM source_cache WHERE key=?').bind(key).run();throw e}}
async function retireCopies(db:D1Database,loader:Loader,prior:Row|null,current:string){const next=JSON.parse(current),previous=prior?.data?JSON.parse(prior.data):null,newKeys=new Set<string>(next._cacheFormat==='aflivra-json-chunks-v1'?next.keys:[]),oldKeys:string[]=previous?._cacheFormat==='aflivra-json-chunks-v1'?previous.keys:[];for(const key of newKeys)await db.prepare('UPDATE source_cache SET expires_at=0 WHERE key=?').bind(key).run();for(const key of oldKeys)if(!newKeys.has(key))await db.prepare('UPDATE source_cache SET expires_at=? WHERE key=? AND expires_at=0').bind(Date.now()+48*3600000,key).run();const owner=createHash('sha256').update(loader.key).digest('hex');await db.prepare('DELETE FROM source_cache WHERE key LIKE ? AND expires_at>0 AND expires_at<=?').bind('payload:'+owner+':%',Date.now()).run();if(/^resource:[\da-f-]+$/i.test(loader.key)&&previous){const oldData=await payload(db,prior!.data!),newData=await payload(db,current),keys=(d:any)=>[...(d.documentChunks||[]),...(d.sheets||[]).flatMap((s:any)=>s.chunks||[])],fresh=new Set<string>(keys(newData));for(const key of fresh)await db.prepare('UPDATE source_cache SET expires_at=0 WHERE key=?').bind(key).run();for(const key of keys(oldData))if(!fresh.has(key))await db.prepare('UPDATE source_cache SET expires_at=? WHERE key=? AND expires_at=0').bind(Date.now()+48*3600000,key).run();const id=loader.key.slice(9);await db.prepare('DELETE FROM source_cache WHERE (key LIKE ? OR key LIKE ?) AND expires_at>0 AND expires_at<=?').bind('resource-chunk:'+id+':%','resource-document:'+id+':%',Date.now()).run()}}
export type CachedCopyRow=Pick<Row,'data'|'last_success_at'|'expires_at'|'error'|'adapter_version'>;
export function cachedCopyServes(row:CachedCopyRow|null,version:string):boolean{
  if(!row?.data||row.error||row.adapter_version!==version)return false;
  const nightly=row.last_success_at&&afterNightBoundary()&&roDate(new Date(row.last_success_at))<roDate(new Date());
  return Date.now()<(nightly?0:row.expires_at);
}
// Loader loads and the AFIR relay publish through this one setter so relayed data lands in the
// exact cache entries the reader serves; last_success_at updates surface as „ultima preluare validă”.
export async function publishLoaded(db:D1Database,loader:Loader,prior:Row|null,loaded:Loaded):Promise<SourceState>{
  await db.prepare('INSERT OR IGNORE INTO source_cache (key,data,published_at,last_success_at) VALUES (?,?,?,?)').bind(loader.key,null,null,null).run();
  const checked=new Date().toISOString(),retrySeconds=loaded.warning?Math.max(60,Number.isFinite(loaded.retryAfterSeconds)?loaded.retryAfterSeconds||0:0):0;
  // Invalid or unavailable data never replaces the last validated payload.
  if(loaded.data===null||loaded.data===undefined)throw new SourceError('Sursa nu a returnat date utilizabile.');
  // A partial verification can populate an empty cache, but must not replace
  // a previously validated payload with a narrower response.
  if(loaded.warning&&prior?.data)throw new SourceError(loaded.warning,retrySeconds);
  const stored=await storePayload(db,loader.key,loaded.data);
  try{await db.prepare('UPDATE source_cache SET data=?,published_at=?,last_success_at=?,expires_at=?,next_attempt_at=?,failures=0,lock_until=0,error=?,error_diagnostic=null,adapter_version=? WHERE key=?').bind(stored.encoded,loaded.publishedAt,checked,loaded.warning?0:Date.now()+loader.ttl*1000,retrySeconds?Date.now()+retrySeconds*1000:0,loaded.warning||null,loader.version,loader.key).run()}
  catch(e){for(const key of stored.created)await db.prepare('DELETE FROM source_cache WHERE key=?').bind(key).run();throw e}
  try{await retireCopies(db,loader,prior,stored.encoded)}catch{/* Retention maintenance never invalidates a successfully published copy. */}
  return await view(loader,await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>(),true);
}
async function view(loader:Loader,row:Row|null,fresh=false):Promise<SourceState>{
  const data=row?.data?await payload(env.DB!,row.data):null;
  let errorDiagnostic:import('./types').SourceState['errorDiagnostic']=null;
  // Diagnoza structurată a sursei persistă separat de mesaj — categoria eșecului,
  // codul HTTP, încercările — sanitizată, fără chei sau corpuri de cerere.
  if(row?.error_diagnostic){try{errorDiagnostic=JSON.parse(row.error_diagnostic) as import('./types').SourceState['errorDiagnostic']}catch{errorDiagnostic=null}}
  return{key:loader.key,name:loader.name,url:loader.url,adapterVersion:loader.version,status:!data?'unavailable':cachedCopyServes(row,loader.version)?fresh?'fresh':'cached':'stale',data,publishedAt:row?.published_at||null,lastSuccessAt:row?.last_success_at||null,lastAttemptAt:row?.last_attempt_at||null,nextAttemptAt:iso(row?.next_attempt_at||0),error:row?.error||null,errorDiagnostic,ttlSeconds:loader.ttl};
}
function fallback(loader:Loader,error:string):SourceState{const seed=getSeed(loader.key);return{key:loader.key,name:loader.name,url:loader.url,adapterVersion:loader.version,status:seed?'stale':'unavailable',data:seed?.data||null,publishedAt:seed?.publishedAt||null,lastSuccessAt:seed?.fetchedAt||null,lastAttemptAt:null,nextAttemptAt:null,error,ttlSeconds:loader.ttl}}
async function budget(db:D1Database,key:string,limit:number){const windowStart=Math.floor(Date.now()/3600000)*3600000;const result=await db.prepare('INSERT INTO source_budget (key,window_start,used) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start, used=CASE WHEN source_budget.window_start=excluded.window_start THEN source_budget.used+1 ELSE 1 END WHERE source_budget.window_start<>excluded.window_start OR source_budget.used<? RETURNING used').bind(key,windowStart,limit).first();if(!result)throw new SourceError('Limita temporară de interogare a sursei a fost atinsă.',Math.ceil((windowStart+3600000-Date.now())/1000))}
export async function readSource(loader:Loader,options:{background?:boolean;waitForRefresh?:boolean}={}):Promise<SourceState>{
 const db=env.DB;if(!db)return fallback(loader,'Actualizarea pe server este temporar indisponibilă.');
 let old:Row|null=null;
 try{
  const seed=getSeed(loader.key);
  old=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>();
  if(!old){await db.prepare('INSERT OR IGNORE INTO source_cache (key,data,published_at,last_success_at) VALUES (?,?,?,?)').bind(loader.key,seed?JSON.stringify(seed.data):null,seed?.publishedAt||null,seed?.fetchedAt||null).run();old=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>()}
  const now=Date.now();
  if(seed&&(!old?.data||Date.parse(seed.fetchedAt)>Date.parse(old.last_success_at||'1970-01-01'))){await db.prepare('UPDATE source_cache SET data=?,published_at=?,last_success_at=? WHERE key=?').bind(JSON.stringify(seed.data),seed.publishedAt,seed.fetchedAt,loader.key).run();old=await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>()}
  if(old?.last_success_at&&old.expires_at>now&&(afterNightBoundary()||loader.key.startsWith('law:consolidated.v2:'))&&roDate(new Date(old.last_success_at))<roDate(new Date())){await db.prepare('UPDATE source_cache SET expires_at=0 WHERE key=?').bind(loader.key).run();old.expires_at=0}
  if(old&&((old.expires_at>now&&old.adapter_version===loader.version)||old.next_attempt_at>now&&old.adapter_version===loader.version||old.lock_until>now))return await view(loader,old);
  const acquired=await db.prepare("UPDATE source_cache SET lock_until=?,last_attempt_at=? WHERE key=? AND lock_until<=? AND (next_attempt_at<=? OR COALESCE(adapter_version,'')<>?) AND (expires_at<=? OR COALESCE(adapter_version,'')<>?) RETURNING key").bind(now+60000,iso(now),loader.key,now,now,loader.version,now,loader.version).first();
  if(!acquired)return await view(loader,await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>());
  const refresh=async()=>{try{
    if(loader.key.startsWith('company:'))await budget(db,'anaf',120);
    // The Wikidata host serves the firm knowledge and the name search; both are
    // user-driven, so they share one hourly budget on the host they both read.
    if(loader.key.startsWith('company-name:')||loader.key.startsWith('knowledge-company:'))await budget(db,'wikidata',120);
    if(loader.key.startsWith('forecast:'))await budget(db,'open-meteo',400);
   if(loader.key.startsWith('law:'))await budget(db,'legislation',120);
   if(loader.key.startsWith('court:'))await budget(db,'courts',60);
   // Sursele noi (runda „surse românești"): TEMPO și POSF se interoghează cu zgârcenie
   // (serii anuale, oferte pe zi), SEN e observație de minut — bugete separate, pe familie.
   if(loader.key.startsWith('ins:'))await budget(db,'ins',60);
   if(loader.key.startsWith('posf:'))await budget(db,'posf',60);
   if(loader.key.startsWith('power:'))await budget(db,'transelectrica',120);
    if(loader.key.startsWith('catalog:')||loader.key.startsWith('resource:')||loader.key.startsWith('directory:schools')||loader.key.startsWith('justice:')||loader.key.startsWith('housing:'))await budget(db,'ckan',500);
    const loaded=await loader.load();if(loader.key.startsWith('company:')&&old?.data){const prior=JSON.parse(old.data),current=loaded.data;const years=new Map<number,any>((prior.history||[]).filter((h:any)=>h.year>=new Date().getUTCFullYear()-3).map((h:any)=>[h.year,h]));for(const h of current.history||[])years.set(h.year,h);current.history=[...years.values()].sort((a:any,b:any)=>a.year-b.year);const last=current.history.at(-1);if(last){current.year=last.year;current.indicators=last.entries;current.financialCaen=last.caen;loaded.publishedAt=String(last.year)}if(!current.queriedDate&&prior.queriedDate){for(const key of ['address','registration','currentCaen','vat','vatFrom','vatTo','inactive','phone','fax','postalCode','registrationState','legalForm','organizationForm','taxAuthority','registrationDate','registryDetails','publicRegistries'])current[key]=prior[key]??current[key];current.queriedDate=prior.queriedDate;current.warnings.push('Identitatea fiscală păstrează ultima verificare validă din '+prior.queriedDate+'.')}if(!current.caenLabel&&last?.caenLabel)current.caenLabel=last.caenLabel}
    return await publishLoaded(db,loader,old,loaded);
  }catch(e){const failures=(old?.failures||0)+1;const delay=Math.max(Math.min(60*2**Math.min(failures-1,6),3600),e instanceof SourceError?e.retryAfter:0);const error=e instanceof SourceError?e.message:'Sursa nu a putut fi verificată. Păstrăm ultima copie validă.';
   // A30: diagnoza structurată a sursei se persistă sanitizată, separat de mesaj —
   // fără chei, fără headers de autorizare, fără corpuri de cerere sau răspuns.
   const failed=e instanceof SourceError&&e.diagnostic?{sourceKey:loader.key,stage:'load' as const,category:e.diagnostic.category,...(e.diagnostic.httpStatus!==undefined?{httpStatus:e.diagnostic.httpStatus}:{}),...(e.diagnostic.attempts!==undefined?{attempts:e.diagnostic.attempts}:{}),...(e.diagnostic.server!==undefined&&e.diagnostic.server!==null?{server:e.diagnostic.server}:{}),...(e.diagnostic.rayId!==undefined&&e.diagnostic.rayId!==null?{rayId:e.diagnostic.rayId}:{}),retryAfterSeconds:delay,observedAt:new Date().toISOString()}:null;
   await db.prepare('UPDATE source_cache SET failures=?,next_attempt_at=?,expires_at=0,lock_until=0,error=?,error_diagnostic=?,adapter_version=? WHERE key=?').bind(failures,Date.now()+delay*1000,error,failed?JSON.stringify(failed):null,loader.version,loader.key).run();
   return await view(loader,await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>());
  }};
  const ctx=liveContext();if(ctx&&!options.waitForRefresh&&(old?.data||options.background)){ctx.waitUntil(refresh());return await view(loader,await db.prepare('SELECT * FROM source_cache WHERE key=?').bind(loader.key).first<Row>())}return await refresh();
 }catch{try{return old?{...await view(loader,old),status:old.data?'stale':'unavailable',error:'Actualizarea pe server a eșuat. Copia validă rămâne disponibilă.'}:fallback(loader,'Actualizarea pe server este temporar indisponibilă.')}catch{return fallback(loader,'Copia persistentă nu poate fi citită integral acum. Reîncearcă preluarea.')}}
}
