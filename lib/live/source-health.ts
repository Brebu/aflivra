import {listGroups,memberLoader} from './refresh-sweep';
import sweepMap from './refresh-groups.json';
import {observationAge} from './observation';
import {cachedCopyServes} from './cache';

type HealthRow={key:string;has_data:number;published_at:string|null;last_success_at:string|null;last_attempt_at:string|null;expires_at:number;next_attempt_at:number;lock_until:number;failures:number;adapter_version:string;error_diagnostic:string|null;has_error:number;observed_at:string|null};
export function sourceHealth(row:HealthRow|null,version?:string,now=Date.now()) {
 const age=observationAge(row?.last_success_at,now),observedAge=observationAge(row?.observed_at,now);
 let diagnostic:{category?:string;httpStatus?:number}|null=null;
 try{diagnostic=row?.error_diagnostic?JSON.parse(row.error_diagnostic):null}catch{}
 const positionFeed=!!row&&/^(transport:realtime:(vehicles|arrivals)|transport:tranzy:vehicles:|flights:adsb)/.test(row.key);
 const staleObservation=positionFeed&&!!row?.observed_at&&(observedAge===null||observedAge>=120);
 const status=!row?.has_data?'unavailable':!cachedCopyServes({...row,data:'metadata-only',error:row.has_error?'metadata-only':null},version||row.adapter_version,now)||staleObservation?'stale':'cached';
 return {status,lastSuccessAt:row?.last_success_at||null,lastAttemptAt:row?.last_attempt_at||null,publishedAt:row?.published_at||null,
  fetchedAgeSeconds:age,observedAt:row?.observed_at||null,observationAgeSeconds:observedAge,
  nextAttemptAt:row?.next_attempt_at?new Date(row.next_attempt_at).toISOString():null,
  retryOverdue:!!row?.failures&&!!row.next_attempt_at&&row.next_attempt_at<=now,
  lease:row?.lock_until?(row.lock_until>now?'active':'expired'):'none',failures:row?.failures||0,
  adapterVersion:row?.adapter_version||null,diagnostic:diagnostic?{category:diagnostic.category,httpStatus:diagnostic.httpStatus}:row?.has_error?{category:'validation-or-load'}:null};
}
export async function loadSourceHealth(db:D1Database,now=Date.now()) {
 const groups=listGroups(),descriptors:{member:string;group:string|null;key:string|null;name:string;version?:string}[]=[];
 const summaries=(await db.prepare("SELECT key,data FROM source_cache WHERE key>? AND key<?").bind('sweep:group:','sweep:group;').all<{key:string;data:string}>()).results;
 const last=new Map<string,any>();for(const row of summaries){try{last.set(row.key.slice(12),JSON.parse(row.data))}catch{}}
 for(const group of groups)for(const [index,member] of group.members.entries()){
  // Resolving this dependency would download POSF counties; health must only read.
  if(member==='posf.offers.bucuresti'){const recorded=last.get(group.name)?.sources?.[index];descriptors.push({member,group:group.name,key:recorded?.key||null,name:recorded?.name||member});continue}
  const loader=await memberLoader(member);descriptors.push({member,group:group.name,key:loader.key,name:loader.name,version:loader.version});
 }
 const extra=[['transport:realtime:vehicles','TPBI · vehicule'],['transport:realtime:arrivals','TPBI · sosiri'],['transport:realtime:alerts','TPBI · alerte'],['flights:adsb','adsb.lol · aeronave'],['flights:bia:henri-coanda','OTP · panou'],['flights:bia:baneasa-aurel-vlaicu','BBU · panou'],...[[1,'Cluj-Napoca'],[2,'Iași'],[4,'Chișinău'],[6,'Botoșani'],[9,'Oradea']].map(([id,city])=>['transport:tranzy:vehicles:'+id,'Tranzy · '+city])];
 for(const [key,name] of extra)descriptors.push({member:key,group:null,key,name,...(key.startsWith('flights:bia:')?{version:'flights.bia.board.v2'}:{})});
 const keys=[...new Set(descriptors.flatMap(item=>item.key?[item.key]:[]))];
 // Read only metadata for fixed public keys. Query-specific identifiers, payloads,
 // request headers and secrets are never enumerated or returned by public health.
 const results=await db.batch<HealthRow>(keys.map(key=>db.prepare(`SELECT key,data IS NOT NULL AS has_data,published_at,last_success_at,last_attempt_at,expires_at,next_attempt_at,lock_until,failures,adapter_version,error_diagnostic,error IS NOT NULL AS has_error,
 CASE WHEN json_valid(data) THEN json_extract(data,'$.observedAt') ELSE NULL END AS observed_at FROM source_cache WHERE key=?`).bind(key)));
 const rows=new Map(results.flatMap(result=>result.results).map(row=>[row.key,row]));
 const sources=descriptors.map(item=>({...item,version:undefined,...sourceHealth(item.key?rows.get(item.key)||null:null,item.version,now)}));
 const jobs=(await db.prepare("SELECT status,COUNT(*) AS count,MIN(requested_at) AS oldest_at FROM source_refresh_jobs WHERE status IN ('queued','running') GROUP BY status").all<{status:string;count:number;oldest_at:string}>()).results;
 return {servedAt:new Date(now).toISOString(),sources,summary:{total:sources.length,cached:sources.filter(s=>s.status==='cached').length,stale:sources.filter(s=>s.status==='stale').length,unavailable:sources.filter(s=>s.status==='unavailable').length},
  groups:groups.map(group=>({name:group.name,cron:group.cron,lastSweepAt:last.get(group.name)?.finishedAt||null})),
  jobs:jobs.map(job=>({status:job.status,count:job.count,oldestAgeSeconds:observationAge(job.oldest_at,now)})),
  coverage:{scheduledMembers:groups.flatMap(group=>group.members).length,seedBacked:sweepMap.seedBacked,relayed:sweepMap.ghRelayed,onDemand:sweepMap.onDemand},
  note:'Starea descrie copiile și membrii configurați. Perioada publicației și momentul observației sunt separate de preluare. Acest apel nu declanșează actualizări și nu certifică toate interogările posibile.'};
}
