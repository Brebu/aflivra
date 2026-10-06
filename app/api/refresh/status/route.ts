import {env} from 'cloudflare:workers';
import sweepMap from '@/lib/live/refresh-groups.json';
export const dynamic='force-dynamic';
export async function GET(request:Request){const token=env.REFRESH_TOKEN||'';if(!token||request.headers.get('authorization')!=='Bearer '+token)return Response.json({error:'Acces interzis.'},{status:401,headers:{'Cache-Control':'no-store'}});
  let rows:{key:string;data:string}[]=[];
  if(env.DB)try{rows=(await env.DB.prepare('SELECT key,data FROM source_cache WHERE key>? AND key<? ORDER BY key').bind('sweep:group:','sweep:group;').all<{key:string;data:string}>()).results}catch(e){console.warn(JSON.stringify({event:'refresh_status_read_failure',message:e instanceof Error?e.message:'Unknown error'}))}
  const last=new Map<string,any>();
  for(const row of rows){try{const record=JSON.parse(row.data);if(record&&typeof record.group==='string')last.set(record.group,record)}catch{/* A corrupt sweep row cannot certify an execution. */}}
  const map=sweepMap as any;
  return Response.json({groups:map.groups.map((group:any)=>{const record=last.get(group.name);return{name:group.name,cron:group.cron,seedBacked:map.seedBacked,lastSweepAt:record?.startedAt||null,perSource:Array.isArray(record?.sources)?record.sources.map((source:any)=>({key:source.key,status:source.status,lastSuccessAt:source.lastSuccessAt||null})):[]}}),servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
}
