import {env} from 'cloudflare:workers';
import {SourceError} from './adapters';

const key='source-gate:open-meteo';
export async function withForecastSlot<T>(load:()=>Promise<T>):Promise<T>{
 const db=env.DB;if(!db)return load();
 await db.prepare('INSERT OR IGNORE INTO source_cache (key,adapter_version) VALUES (?,?)').bind(key,'weather.gate.v1').run();
 const now=Date.now(),lease=now+30000;
 const acquired=await db.prepare('UPDATE source_cache SET lock_until=? WHERE key=? AND lock_until<=? AND next_attempt_at<=? RETURNING key').bind(lease,key,now,now).first();
 if(!acquired){const row=await db.prepare('SELECT lock_until,next_attempt_at FROM source_cache WHERE key=?').bind(key).first<{lock_until:number;next_attempt_at:number}>();const wait=Math.max(row?.lock_until||0,row?.next_attempt_at||0)-Date.now();throw new SourceError(row?.next_attempt_at&&row.next_attempt_at>Date.now()?'Sursa meteo a cerut o pauză. Reîncercăm automat.':'Prognozele se preiau pe rând. Reîncercăm automat.',Math.max(5,Math.ceil(wait/1000)))}
 try{return await load()}catch(error){if(error instanceof SourceError&&error.diagnostic?.httpStatus===429)await db.prepare('UPDATE source_cache SET next_attempt_at=? WHERE key=? AND lock_until=?').bind(Date.now()+Math.max(60,error.retryAfter)*1000,key,lease).run();throw error}finally{await db.prepare('UPDATE source_cache SET lock_until=0 WHERE key=? AND lock_until=?').bind(key,lease).run()}
}
