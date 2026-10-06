import {env} from 'cloudflare:workers';
import {createHash,timingSafeEqual} from 'node:crypto';
import sweepMap from '@/lib/live/refresh-groups.json';
export const dynamic='force-dynamic';
// Tokenul se compară pe rezumatul SHA-256 al ambelor valori, în timp constant: nici lungimea, nici prima
// poziție diferită nu scurg informație despre secretul din mediul de execuție.
const tokenValid=(token:string,header:string|null)=>{if(!token||!header?.startsWith('Bearer '))return false;const digest=(value:string)=>createHash('sha256').update(value).digest();return timingSafeEqual(digest(header.slice(7)),digest(token))};
export async function GET(request:Request){const token=env.REFRESH_TOKEN||'';if(!token||!tokenValid(token,request.headers.get('authorization')))return Response.json({error:'Acces interzis.'},{status:401,headers:{'Cache-Control':'no-store'}});
  let rows:{key:string;data:string}[]=[];
  if(env.DB)try{rows=(await env.DB.prepare('SELECT key,data FROM source_cache WHERE key>? AND key<? ORDER BY key').bind('sweep:group:','sweep:group;').all<{key:string;data:string}>()).results}catch(e){console.warn(JSON.stringify({event:'refresh_status_read_failure',message:e instanceof Error?e.message:'Unknown error'}))}
  const last=new Map<string,any>();
  for(const row of rows){try{const record=JSON.parse(row.data);if(record&&typeof record.group==='string')last.set(record.group,record)}catch{/* A corrupt sweep row cannot certify an execution. */}}
  const map=sweepMap as any;
  return Response.json({groups:map.groups.map((group:any)=>{const record=last.get(group.name);return{name:group.name,cron:group.cron,lastSweepAt:record?.startedAt||null,sources:Array.isArray(record?.sources)?record.sources:[]}}),seedBacked:map.seedBacked,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
}
