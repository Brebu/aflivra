import {env} from 'cloudflare:workers';
import {getSource,SourceError,type SourceDiagnostic} from './adapters';
import {officialLawUrl} from './legal-consolidation';

const key='law-portal:circuit.v1',version='law.portal-circuit.v1';
const unavailable='Portalul Legislativ nu poate transmite textul acum. Ultima formă consolidată verificată este păstrată, dacă există.';
type Circuit={next_attempt_at:number;lock_until:number;failures:number;data:string|null};
// Used only when importing from a checkout without D1. Hosted requests share
// the persisted circuit so different laws cannot hammer an unavailable portal.
let local:Circuit={next_attempt_at:0,lock_until:0,failures:0,data:null};
async function state():Promise<Circuit>{if(!env.DB)return local;await env.DB.prepare('INSERT OR IGNORE INTO source_cache (key,adapter_version) VALUES (?,?)').bind(key,version).run();return await env.DB.prepare('SELECT next_attempt_at,lock_until,failures,data FROM source_cache WHERE key=?').bind(key).first<Circuit>()||local}
async function lease(now:number){if(!env.DB){if(local.lock_until>now||local.next_attempt_at>now)return false;local.lock_until=now+25000;return true}return !!await env.DB.prepare('UPDATE source_cache SET lock_until=?,last_attempt_at=? WHERE key=? AND lock_until<=? AND next_attempt_at<=? RETURNING key').bind(now+25000,new Date(now).toISOString(),key,now,now).first()}
async function success(){if(!env.DB){local={next_attempt_at:0,lock_until:0,failures:0,data:null};return}await env.DB.prepare('UPDATE source_cache SET data=NULL,last_success_at=?,next_attempt_at=0,lock_until=0,failures=0,error=NULL WHERE key=?').bind(new Date().toISOString(),key).run()}
async function failure(prior:Circuit,error:SourceError){const failures=prior.failures+1,seconds=Math.max(error.retryAfter,Math.min(60*2**Math.min(failures-1,4),900)),next=Date.now()+seconds*1000,data=JSON.stringify(error.diagnostic||null);if(!env.DB)local={next_attempt_at:next,lock_until:0,failures,data};else await env.DB.prepare('UPDATE source_cache SET data=?,next_attempt_at=?,lock_until=0,failures=?,error=? WHERE key=?').bind(data,next,failures,unavailable,key).run();return seconds}
export async function portalRetryAt(){const row=env.DB?await env.DB.prepare('SELECT next_attempt_at FROM source_cache WHERE key=?').bind(key).first<{next_attempt_at:number}>():local;return row&&row.next_attempt_at>Date.now()?new Date(row.next_attempt_at).toISOString():null}
export async function portalPage(url:string){
 const official=officialLawUrl(url);if(!official)throw new SourceError('Adresa actului nu aparține Portalului Legislativ.');
 const prior=await state(),now=Date.now();
 if(prior.next_attempt_at>now)throw new SourceError(unavailable,Math.ceil((prior.next_attempt_at-now)/1000),prior.data?JSON.parse(prior.data):undefined);
 if(!await lease(now))throw new SourceError('O verificare a Portalului Legislativ este deja în curs. Copia verificată rămâne disponibilă.',Math.max(1,Math.ceil((prior.lock_until-now)/1000)));
 try{const page=await getSource(official,{headers:{Accept:'text/html'}},{maxBytes:25_000_000,timeoutMs:18000});await success();return page}
 catch(error){const diagnostic:SourceDiagnostic=error instanceof SourceError&&error.diagnostic?error.diagnostic:{url:official,category:'connection',detail:error instanceof Error?error.message:'Unknown connection failure'};const cause=error instanceof SourceError?new SourceError(error.message,error.retryAfter,diagnostic):new SourceError('Conexiunea cu portalul nu a putut fi stabilită.',0,diagnostic);const transient=diagnostic.category!=='http'||diagnostic.httpStatus===429||Number(diagnostic.httpStatus)>=500;let retry=cause.retryAfter;if(transient)retry=await failure(prior,cause);else if(env.DB)await env.DB.prepare('UPDATE source_cache SET lock_until=0 WHERE key=?').bind(key).run();else local.lock_until=0;console.error(JSON.stringify({event:'legal_source_failure',checkedAt:new Date().toISOString(),...diagnostic,retryAfterSeconds:retry}));throw new SourceError(unavailable,retry,diagnostic)}
}
