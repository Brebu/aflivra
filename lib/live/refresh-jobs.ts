import {randomUUID} from 'node:crypto';
import {readSource} from './cache';
import {memberLoader,listGroups} from './refresh-sweep';
import type {Loader,SourceState} from './types';

export type RefreshRow={id:string;member:string;force:number;status:'queued'|'running'|'completed'|'failed';requested_at:string;finished_at:string|null;next_attempt_at:number;lock_until:number;attempts:number;result:string|null};
export type RefreshMessage={jobId:string};
export class RefreshInputError extends Error {}
export const refreshMembers=()=>[...new Set(listGroups().flatMap(group=>group.members))];
export function selectRefreshMembers(group='',member=''){
 if(group&&member)throw new RefreshInputError('Alege fie un grup, fie un membru de sursă.');
 if(member){if(!refreshMembers().includes(member))throw new RefreshInputError('Membrul de sursă nu există.');return [member]}
 if(group){const found=listGroups().find(item=>item.name===group);if(!found)throw new RefreshInputError('Grupul de surse „'+group.slice(0,200)+'” nu există. Grupuri valide: '+listGroups().map(item=>item.name).join(', ')+'.');return found.members}
 return refreshMembers();
}
export function refreshJobView(row:RefreshRow){
 let result:SourceState|null=null;try{result=row.result?JSON.parse(row.result):null}catch{}
 return {id:row.id,member:row.member,force:!!row.force,status:row.status,requestedAt:row.requested_at,finishedAt:row.finished_at,nextAttemptAt:row.next_attempt_at?new Date(row.next_attempt_at).toISOString():null,attempts:row.attempts,result};
}
export async function enqueueRefresh(db:D1Database,members:string[],force=false){
 if(!members.length||members.length>refreshMembers().length||members.some(member=>!refreshMembers().includes(member)))throw new RefreshInputError('Selecție de surse invalidă.');
 const requestedAt=new Date().toISOString();
 const statements=[...new Set(members)].map(member=>db.prepare(`INSERT INTO source_refresh_jobs (id,member,force,requested_at) VALUES (?,?,?,?)
  ON CONFLICT(member) WHERE status IN ('queued','running') DO UPDATE SET
  force=MAX(source_refresh_jobs.force,excluded.force)
  RETURNING *`).bind(randomUUID(),member,force?1:0,requestedAt));
 // D1 batch is transactional: a trigger is durable in full before being acknowledged.
 const results=await db.batch<RefreshRow>(statements);
 return results.flatMap(result=>result.results).map(refreshJobView);
}
export async function refreshJobsStatus(db:D1Database,id=''){
 if(id)return (await db.prepare('SELECT * FROM source_refresh_jobs WHERE id=?').bind(id).all<RefreshRow>()).results.map(refreshJobView);
 return (await db.prepare('SELECT * FROM source_refresh_jobs ORDER BY requested_at DESC,id DESC LIMIT 100').all<RefreshRow>()).results.map(refreshJobView);
}
export async function processRefreshJob(db:D1Database,id?:string,resolveLoader:(member:string)=>Promise<Loader>=memberLoader){
 const now=Date.now(),lease=now+330000;
 // Three interrupted leases are enough to stop a poison job. Normal source failures
 // are recorded once; regular sweeps/backoff continue to own subsequent recovery.
 await db.prepare("UPDATE source_refresh_jobs SET status='failed',finished_at=?,lock_until=0 WHERE status='running' AND lock_until<=? AND attempts>=3").bind(new Date(now).toISOString(),now).run();
 const row=await db.prepare(`UPDATE source_refresh_jobs SET status='running',lock_until=?,attempts=attempts+1
  WHERE id=(SELECT id FROM source_refresh_jobs WHERE status IN ('queued','running') AND lock_until<=? AND next_attempt_at<=? AND attempts<3 AND (? IS NULL OR id=?) ORDER BY requested_at,id LIMIT 1)
  AND lock_until<=? RETURNING *`).bind(lease,now,now,id??null,id??null,now).first<RefreshRow>();
 if(!row){const existing=id?await db.prepare('SELECT * FROM source_refresh_jobs WHERE id=?').bind(id).first<RefreshRow>():null;return {claimed:false,retryAt:existing&&['queued','running'].includes(existing.status)?Math.max(existing.next_attempt_at,existing.lock_until,now+1000):null}}
 try{
  const state=await readSource(await resolveLoader(row.member),{waitForRefresh:true,force:!!row.force});
  // Results contain diagnostics/provenance, not the potentially huge source payload.
  const result=JSON.stringify({...state,data:undefined});
  const cache=await db.prepare('SELECT lock_until,next_attempt_at,last_attempt_at FROM source_cache WHERE key=?').bind(state.key).first<{lock_until:number;next_attempt_at:number;last_attempt_at:string|null}>();
  const lastAttempt=Date.parse(cache?.last_attempt_at||state.lastAttemptAt||'');
  const retryAt=Math.max(cache?.lock_until||0,cache?.next_attempt_at||0,row.force&&lastAttempt<now?lastAttempt+30000:0);
  const waitingForOwner=(cache?.lock_until||0)>Date.now();
  const waitingForEarlierAttempt=lastAttempt<now;
  if(retryAt>Date.now()&&(waitingForOwner||waitingForEarlierAttempt)){
   await db.prepare("UPDATE source_refresh_jobs SET status='queued',next_attempt_at=?,lock_until=0,attempts=0,result=? WHERE id=? AND lock_until=?").bind(retryAt,result,row.id,lease).run();
   return {claimed:true,retryAt};
  }
  const status=state.status==='fresh'||state.status==='cached'?'completed':'failed';
  // A force request can promote the job while this consumer is serving a valid
  // cached copy. Complete atomically only if that request has been satisfied.
  const verifiedSinceClaim=Date.parse(state.lastAttemptAt||'')>=now;
  const completed=await db.prepare('UPDATE source_refresh_jobs SET status=?,finished_at=?,lock_until=0,result=? WHERE id=? AND lock_until=? AND (force=? OR ?=1)').bind(status,new Date().toISOString(),result,row.id,lease,row.force,verifiedSinceClaim||status==='failed'?1:0).run();
  if(!completed.meta.changes){
   const promotedRetryAt=Math.max(Date.now(),Number.isFinite(lastAttempt)?lastAttempt+30000:0);
   const promoted=await db.prepare("UPDATE source_refresh_jobs SET status='queued',next_attempt_at=?,lock_until=0,attempts=0,result=? WHERE id=? AND lock_until=? AND force>?").bind(promotedRetryAt,result,row.id,lease,row.force).run();
   return {claimed:true,retryAt:promoted.meta.changes?promotedRetryAt:null};
  }
  return {claimed:true,retryAt:null};
 }catch{
  await db.prepare("UPDATE source_refresh_jobs SET status='failed',finished_at=?,lock_until=0,result=? WHERE id=? AND lock_until=?").bind(new Date().toISOString(),JSON.stringify({error:'Actualizarea nu a putut fi executată.'}),row.id,lease).run();
  return {claimed:true,retryAt:null};
 }
}
export async function drainRefreshJobs(db:D1Database,limit=3){
 // Three requests in flight, including the opportunistic HTTP background run.
 const results=await Promise.all(Array.from({length:Math.max(0,Math.min(3,limit))},()=>processRefreshJob(db)));
 await db.prepare("DELETE FROM source_refresh_jobs WHERE status IN ('completed','failed') AND finished_at<?").bind(new Date(Date.now()-7*86400000).toISOString()).run();
 return results;
}
