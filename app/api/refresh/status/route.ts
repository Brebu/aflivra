import {env} from 'cloudflare:workers';
import {refreshAuthorized} from '@/lib/live/refresh-auth';
import {refreshJobsStatus,refreshMembers} from '@/lib/live/refresh-jobs';
import sweepMap from '@/lib/live/refresh-groups.json';
import {refreshTriggerLimits} from '@/lib/live/refresh-budget';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
export async function GET(request:Request){if(!refreshAuthorized(env.REFRESH_TOKEN,request.headers.get('authorization')))return Response.json({error:'Acces interzis.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const jobId=new URL(request.url).searchParams.get('jobId')||'';
  if(jobId&&!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(jobId))return Response.json({error:'Identificator de actualizare invalid.'},{status:400});
  let jobs:any[]=[],queueAvailable=false;
  if(env.DB)try{jobs=await refreshJobsStatus(env.DB,jobId);queueAvailable=true}catch{/* A missing migration is visible to the operator, not a fictitious empty success. */}
  if(jobId&&!queueAvailable)return Response.json({error:'Coada de actualizare nu este disponibilă.'},{status:503});
  if(jobId&&!jobs.length)return Response.json({error:'Actualizarea nu există.'},{status:404});
  let rows:{key:string;data:string}[]=[];
  if(env.DB)try{rows=(await env.DB.prepare('SELECT key,data FROM source_cache WHERE key>? AND key<? ORDER BY key').bind('sweep:group:','sweep:group;').all<{key:string;data:string}>()).results}catch(e){console.warn(JSON.stringify({event:'refresh_status_read_failure',message:e instanceof Error?e.message:'Unknown error'}))}
  const last=new Map<string,any>();
  for(const row of rows){try{const record=JSON.parse(row.data);if(record&&typeof record.group==='string')last.set(record.group,record)}catch{/* A corrupt sweep row cannot certify an execution. */}}
  const map=sweepMap as any;
  return Response.json({groups:map.groups.map((group:any)=>{const record=last.get(group.name);return{name:group.name,cron:group.cron,lastSweepAt:record?.startedAt||null,sources:Array.isArray(record?.sources)?record.sources:[]}}),seedBacked:map.seedBacked,ghRelayed:map.ghRelayed,onDemand:map.onDemand,members:refreshMembers(),jobs,queueAvailable,queueTransport:env.REFRESH_QUEUE?'cloudflare-queues':'background-and-cron',manualTriggerLimits:{...refreshTriggerLimits,window:'UTC day',exhaustedStatus:429},servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
}
